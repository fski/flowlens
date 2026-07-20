// Canonical "unknown frame" sentinel — was an inline string literal repeated
// across panel-30/40. One constant so a change can't drift between call sites.
const UNKNOWN_FRAME_KEY = "fk::unknown::unknown::root::00000000";

// A finding is cross-frame (multi-frame integrity) when it has no element and
// its rule maps to the depth3/multiframe group. This decided a row badge, the
// detail Scope line, and whether highlight is attempted — three inline copies
// that had to stay in lockstep; now one predicate.
function isCrossFrameFinding(f) {
  if (!f || f.el) return false;
  if (typeof RULE_TO_WCAG === "undefined") return false;
  var entry = RULE_TO_WCAG[f.type];
  return !!(entry && entry.group === "depth3/multiframe");
}

// The current run's best entry (bestEntry preferred, then best). Repeated as
// `state.lastResult?.bestEntry || state.lastResult?.best` across panel-60/90.
function currentBestEntry() {
  var lr = state.lastResult;
  return (lr && (lr.bestEntry || lr.best)) || null;
}

// --- Upgrade: Review status classification ---

/**
 * Classify a finding's review status.
 * Returns: "automated" | "needs_review" | "info"
 *
 * - "automated": strict confidence — deterministic, machine-verified result.
 * - "needs_review": heuristic/advisory confidence — human must verify.
 * - "info": informational finding (no confidence + info severity).
 */
function classifyReviewStatus(finding) {
  const c = (finding?.confidence || "").toLowerCase();
  if (c === "strict") return "automated";
  if (c === "heuristic" || c === "advisory") return "needs_review";
  if ((finding?.severity || "").toLowerCase() === "info") return "info";
  return "needs_review";
}

function computeReviewCounts(findings) {
  const counts = { automated: 0, needsReview: 0, info: 0 };
  for (const f of findings || []) {
    const status = classifyReviewStatus(f);
    if (status === "automated") counts.automated++;
    else if (status === "needs_review") counts.needsReview++;
    else counts.info++;
  }
  return counts;
}

// --- Upgrade: Deterministic export sort ---

/**
 * Sort findings for export with 7-key deterministic sort.
 * Does NOT mutate the original array.
 *
 * Keys (lexicographic): frameKey, scope.type, scope.rootSelector,
 * type, wcag, severity, pathHash.
 */
function sortFindingsForExport(findings, ctx = {}) {
  if (!Array.isArray(findings)) return [];
  const sorted = [...findings];
  const fk = ctx.frameKey || "";
  const scopeType = ctx.scope?.type || "document";
  const rootSelector = ctx.scope?.rootSelector || "";
  sorted.sort((a, b) => {
    const cmp = (x, y) => String(x || "").localeCompare(String(y || ""));
    let d;
    d = cmp(fk, fk); if (d !== 0) return d; // same for all in batch
    d = cmp(scopeType, scopeType); if (d !== 0) return d;
    d = cmp(rootSelector, rootSelector); if (d !== 0) return d;
    d = cmp(a.type, b.type); if (d !== 0) return d;
    d = cmp(a.wcag, b.wcag); if (d !== 0) return d;
    d = cmp(a.severity, b.severity); if (d !== 0) return d;
    d = cmp(pathHashForSig(a.path), pathHashForSig(b.path)); if (d !== 0) return d;
    return 0;
  });
  return sorted;
}

// --- Upgrade: JUnit XML export ---

/**
 * Escape a string for safe XML attribute/text content.
 * Covers the five XML predefined entities.
 */
function xmlEscape(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/**
 * Make a string safe for embedding inside a CDATA section.
 * Splits any literal "]]>" into "]]]]><![CDATA[>" so the XML parser
 * never sees an unescaped CDATA end marker.
 * @param {string} text
 * @returns {string}
 */
function safeCdata(text) {
  return String(text ?? "").replaceAll("]]>", "]]]]><![CDATA[>");
}

/**
 * Normalize JUnit CI export options, filling in defaults.
 * Default values produce the same classification as the original export.
 */
function normalizeJunitCiOptions(opts) {
  const o = opts || {};
  return {
    failOnBlocking: o.failOnBlocking !== false,
    treatNeedsReviewAsFailure: o.treatNeedsReviewAsFailure === true,
    maxFailuresAllowed: typeof o.maxFailuresAllowed === "number" && o.maxFailuresAllowed >= 0
      ? Math.floor(o.maxFailuresAllowed) : 0,
  };
}

/**
 * Determine CI pass/fail based on total failures vs threshold.
 */
function computeCiStatus(totalFailures, maxFailuresAllowed) {
  return totalFailures > maxFailuresAllowed ? "fail" : "pass";
}

/**
 * Returns true if CI options differ from defaults (used for filename suffix).
 */
function isNonDefaultJunitCiOptions(opts) {
  const n = normalizeJunitCiOptions(opts);
  return n.treatNeedsReviewAsFailure === true
    || n.maxFailuresAllowed !== 0
    || n.failOnBlocking === false;
}

/**
 * Build a single <testsuite> XML string from sorted findings.
 * Pure function — deterministic given the same inputs.
 * Returns { xml: string, failures: number, skipped: number }.
 */
function buildJunitTestsuiteXml({ suiteName, findings, ctx, meta, capturedAt, ciOptions }) {
  const sorted = sortFindingsForExport(findings || [], ctx);
  const opts = normalizeJunitCiOptions(ciOptions);
  let failures = 0;
  let skipped = 0;
  const cases = [];

  const _failureBody = (f) =>
    `severity: ${f.severity || "\u2014"}\n` +
    `confidence: ${f.confidence || "\u2014"}\n` +
    `wcag: ${f.wcag || "\u2014"}\n` +
    `en301549: ${Array.isArray(f.en301549Clauses) ? f.en301549Clauses.join(", ") : "\u2014"}\n` +
    `path: ${f.path || "\u2014"}\n` +
    `testId: ${f.testId || "\u2014"}\n` +
    `note: ${f.note || "\u2014"}`;

  for (const f of sorted) {
    const reviewStatus = classifyReviewStatus(f);
    const blocking = isRunFindingBlocking(f);
    const type = xmlEscape(f.type || "\u2014");
    const severity = xmlEscape(f.severity || "\u2014");
    const confidence = xmlEscape(f.confidence || "\u2014");
    const caseName = `${f.type || "unknown"} \u2014 ${f.wcag || "no-wcag"}`;

    if (reviewStatus === "needs_review" && opts.treatNeedsReviewAsFailure) {
      failures++;
      cases.push(
        `    <testcase name="${xmlEscape(caseName)}" classname="${type}" time="0">\n` +
        `      <failure message="needs_review: ${confidence}" type="needs_review"><![CDATA[\n` +
        `${safeCdata(_failureBody(f))}]]></failure>\n` +
        `    </testcase>`
      );
    } else if (reviewStatus === "needs_review") {
      skipped++;
      cases.push(
        `    <testcase name="${xmlEscape(caseName)}" classname="${type}" time="0">\n` +
        `      <skipped message="needs_review: ${confidence}" />\n` +
        `    </testcase>`
      );
    } else if (blocking && opts.failOnBlocking) {
      failures++;
      cases.push(
        `    <testcase name="${xmlEscape(caseName)}" classname="${type}" time="0">\n` +
        `      <failure message="${severity} / ${confidence}" type="${type}"><![CDATA[\n` +
        `${safeCdata(_failureBody(f))}]]></failure>\n` +
        `    </testcase>`
      );
    } else if (blocking) {
      cases.push(
        `    <testcase name="${xmlEscape(caseName)}" classname="${type}" time="0">\n` +
        `      <system-out><![CDATA[${safeCdata(`severity: ${f.severity || "\u2014"} | wcag: ${f.wcag || "\u2014"} | confidence: ${f.confidence || "\u2014"} | blocking: true`)}]]></system-out>\n` +
        `    </testcase>`
      );
    } else {
      cases.push(
        `    <testcase name="${xmlEscape(caseName)}" classname="${type}" time="0">\n` +
        `      <system-out><![CDATA[${safeCdata(`severity: ${f.severity || "\u2014"} | wcag: ${f.wcag || "\u2014"} | confidence: ${f.confidence || "\u2014"}`)}]]></system-out>\n` +
        `    </testcase>`
      );
    }
  }

  const propsXml = [
    `    <properties>`,
    `      <property name="failOnBlocking" value="${opts.failOnBlocking}" />`,
    `      <property name="treatNeedsReviewAsFailure" value="${opts.treatNeedsReviewAsFailure}" />`,
    `      <property name="maxFailuresAllowed" value="${opts.maxFailuresAllowed}" />`,
    `      <property name="suiteFailures" value="${failures}" />`,
    `      <property name="suiteSkipped" value="${skipped}" />`,
    `    </properties>`,
  ].join("\n");

  const tsAttrs = [
    `name="${xmlEscape(suiteName || "FlowLens")}"`,
    `tests="${sorted.length}"`,
    `failures="${failures}"`,
    `errors="0"`,
    `skipped="${skipped}"`,
    `time="0"`,
  ];
  if (capturedAt) tsAttrs.push(`timestamp="${xmlEscape(capturedAt)}"`);

  const xml = `  <testsuite ${tsAttrs.join(" ")}>\n${propsXml}\n${cases.join("\n")}\n  </testsuite>`;
  return { xml, failures, skipped };
}

/**
 * Build JUnit XML for a single run.
 * meta: { extensionVersion, schemaVersion, signatureVersion, frameKeyVersion, enMappingVersion, url, envTag, wcagLevel }
 * ctx: { frameKey, scope: { type, rootSelector } }
 */
function buildJunitXmlForRun({ findings, ctx, meta, ciOptions }) {
  const m = meta || {};
  const c = ctx || {};
  const capturedAt = m.capturedAt || "";
  const opts = normalizeJunitCiOptions(ciOptions);
  const rootAttrs = [
    `name="FlowLens"`,
    `extensionVersion="${xmlEscape(m.extensionVersion || "")}"`,
    `schemaVersion="${xmlEscape(String(m.schemaVersion ?? ""))}"`,
    `signatureVersion="${xmlEscape(String(m.signatureVersion ?? ""))}"`,
    `frameKeyVersion="${xmlEscape(String(m.frameKeyVersion ?? ""))}"`,
    `enMappingVersion="${xmlEscape(String(m.enMappingVersion ?? ""))}"`,
    `url="${xmlEscape(m.url || "")}"`,
    `envTag="${xmlEscape(m.envTag || "")}"`,
    `wcagLevel="${xmlEscape(m.wcagLevel || "")}"`,
  ];
  if (capturedAt) rootAttrs.push(`capturedAt="${xmlEscape(capturedAt)}"`);
  if (c.frameKey) rootAttrs.push(`frameKey="${xmlEscape(c.frameKey)}"`);
  rootAttrs.push(`scopeType="${xmlEscape(c.scope?.type || "document")}"`);
  rootAttrs.push(`scopeRootSelector="${xmlEscape(c.scope?.rootSelector || "")}"`);

  const result = buildJunitTestsuiteXml({
    suiteName: "run",
    findings,
    ctx: c,
    meta: m,
    capturedAt,
    ciOptions,
  });

  const totalFailures = result.failures;
  const totalSkipped = result.skipped;
  rootAttrs.push(`totalFailures="${totalFailures}"`);
  rootAttrs.push(`totalSkipped="${totalSkipped}"`);
  rootAttrs.push(`ciStatus="${computeCiStatus(totalFailures, opts.maxFailuresAllowed)}"`);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites ${rootAttrs.join(" ")}>\n${result.xml}\n</testsuites>`;
}

/**
 * Build JUnit XML for an entire session (one testsuite per step).
 * Uses run-mode snapshot findings for each step.
 */
function buildJunitXmlForSession({ session, rawAppendix, meta, ciOptions }) {
  const m = meta || {};
  const sess = session || {};
  const steps = Array.isArray(sess.steps) ? sess.steps : [];
  const opts = normalizeJunitCiOptions(ciOptions);
  const rootAttrs = [
    `name="FlowLens Session ${xmlEscape(sess.id || "unknown")}"`,
    `extensionVersion="${xmlEscape(m.extensionVersion || "")}"`,
    `schemaVersion="${xmlEscape(String(m.schemaVersion ?? ""))}"`,
    `signatureVersion="${xmlEscape(String(m.signatureVersion ?? ""))}"`,
    `frameKeyVersion="${xmlEscape(String(m.frameKeyVersion ?? ""))}"`,
    `enMappingVersion="${xmlEscape(String(m.enMappingVersion ?? ""))}"`,
    `url="${xmlEscape(m.url || "")}"`,
    `envTag="${xmlEscape(m.envTag || "")}"`,
    `wcagLevel="${xmlEscape(m.wcagLevel || "")}"`,
  ];
  if (sess.startedAt) rootAttrs.push(`capturedAt="${xmlEscape(sess.startedAt)}"`);

  const suiteXmls = [];
  let totalFailures = 0;
  let totalSkipped = 0;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepLabel = step.label || step.url || `step-${i + 1}`;
    const suiteName = `Step ${i + 1} \u2014 ${stepLabel}`;
    const runSnapshot = step.snapshots?.run || null;
    const raw = resolveSnapshotRaw(runSnapshot, rawAppendix);
    const findings = Array.isArray(raw?.findings) ? raw.findings : [];
    const fk = runSnapshot?.best?.frameKey || "";
    const ctx = { frameKey: fk };
    const result = buildJunitTestsuiteXml({
      suiteName,
      findings,
      ctx,
      meta: m,
      capturedAt: step.at || "",
      ciOptions,
    });
    suiteXmls.push(result.xml);
    totalFailures += result.failures;
    totalSkipped += result.skipped;
  }

  rootAttrs.push(`totalFailures="${totalFailures}"`);
  rootAttrs.push(`totalSkipped="${totalSkipped}"`);
  rootAttrs.push(`ciStatus="${computeCiStatus(totalFailures, opts.maxFailuresAllowed)}"`);

  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites ${rootAttrs.join(" ")}>\n${suiteXmls.join("\n")}\n</testsuites>`;
}

// --- Upgrade: Shadow coverage diff warning ---

/**
 * Compare shadow coverage between two snapshots.
 * Returns a warning object if coverage changed, or null if identical.
 * Warning is informational only — does NOT alter diff results.
 */
function checkShadowCoverageChange(prevSnap, currSnap) {
  const prevCov = prevSnap?.shadowCoverage || null;
  const currCov = currSnap?.shadowCoverage || null;

  if (!prevCov && !currCov) return null;

  if (!prevCov || !currCov) {
    return {
      type: "SHADOW_COVERAGE_CHANGED",
      from: prevCov || { scopesAudited: 0, scopesCapped: false, depthLimitReached: false },
      to: currCov || { scopesAudited: 0, scopesCapped: false, depthLimitReached: false },
    };
  }

  const changed =
    prevCov.scopesCapped !== currCov.scopesCapped ||
    prevCov.scopesAudited !== currCov.scopesAudited ||
    prevCov.depthLimitReached !== currCov.depthLimitReached;

  if (!changed) return null;

  return {
    type: "SHADOW_COVERAGE_CHANGED",
    from: {
      scopesAudited: prevCov.scopesAudited,
      scopesCapped: prevCov.scopesCapped,
      depthLimitReached: prevCov.depthLimitReached,
    },
    to: {
      scopesAudited: currCov.scopesAudited,
      scopesCapped: currCov.scopesCapped,
      depthLimitReached: currCov.depthLimitReached,
    },
  };
}

// --- Shadow coverage UI helpers ---

/**
 * Format shadow coverage data into a display-ready object.
 * Pure function — no DOM access.
 * @param {object|null|undefined} cov - shadowCoverage object from snapshot
 * @returns {{ text: string, badges: Array<{ label: string, kind: string }> }}
 */
function formatShadowCoverage(cov) {
  if (!cov || typeof cov !== "object") {
    return { text: "", badges: [] };
  }
  const found = Number(cov.scopesFound) || 0;
  const audited = Number(cov.scopesAudited) || 0;
  if (found === 0) {
    return { text: "No shadow roots detected", badges: [] };
  }
  const badges = [];
  const text = `${audited}/${found} shadow scopes audited`;
  if (cov.scopesCapped) {
    badges.push({ label: "CAPPED", kind: "warning" });
  }
  if (cov.depthLimitReached) {
    badges.push({ label: "DEPTH LIMIT", kind: "warning" });
  }
  if (found > 0 && audited === found && !cov.scopesCapped && !cov.depthLimitReached) {
    badges.push({ label: "FULL", kind: "ok" });
  }
  return { text, badges };
}

/**
 * Format a SHADOW_COVERAGE_CHANGED warning into a human-readable banner string.
 * Pure function — no DOM access.
 * @param {{ type: string, from: object, to: object }} warning
 * @returns {string}
 */
function formatShadowCoverageWarning(warning) {
  if (!warning || warning.type !== "SHADOW_COVERAGE_CHANGED") return "";
  const f = warning.from || {};
  const t = warning.to || {};
  const parts = [];
  const fromAudited = Number(f.scopesAudited) || 0;
  const toAudited = Number(t.scopesAudited) || 0;
  if (fromAudited !== toAudited) {
    parts.push(`scopes audited: ${fromAudited} \u2192 ${toAudited}`);
  }
  if (f.scopesCapped !== t.scopesCapped) {
    parts.push(`capped: ${!!f.scopesCapped} \u2192 ${!!t.scopesCapped}`);
  }
  if (f.depthLimitReached !== t.depthLimitReached) {
    parts.push(`depth limit: ${!!f.depthLimitReached} \u2192 ${!!t.depthLimitReached}`);
  }
  if (!parts.length) return "Shadow coverage changed between sessions";
  return `Shadow coverage changed: ${parts.join(", ")}`;
}

/**
 * Format shadow coverage as a single Markdown/text line.
 * Pure function — no DOM access.
 * @param {object|null|undefined} cov
 * @returns {string}  e.g. "Shadow coverage: 5/8 shadow scopes audited (CAPPED, DEPTH LIMIT)" or ""
 */
function formatShadowCoverageLine(cov) {
  if (!cov || typeof cov !== "object") return "";
  const found = Number(cov.scopesFound) || 0;
  if (found === 0) return "";
  const fmt = formatShadowCoverage(cov);
  if (!fmt.text) return "";
  const badgePart = fmt.badges.length
    ? ` (${fmt.badges.map(b => b.label).join(", ")})`
    : "";
  return `Shadow coverage: ${fmt.text}${badgePart}`;
}

/**
 * Compute SHADOW_COVERAGE_CHANGED warnings between consecutive session steps.
 * Pure function — no DOM access.
 * @param {Array} steps
 * @param {object} rawAppendix
 * @returns {Array<{ stepIndex: number, warning: object }>}  sorted by stepIndex
 */
function computeSessionShadowWarnings(steps) {
  if (!Array.isArray(steps) || steps.length < 2) return [];
  const warnings = [];
  for (let i = 1; i < steps.length; i++) {
    const prevCov = steps[i - 1]?.snapshots?.run?.best?.shadowCoverage || null;
    const currCov = steps[i]?.snapshots?.run?.best?.shadowCoverage || null;
    const w = checkShadowCoverageChange(
      prevCov ? { shadowCoverage: prevCov } : null,
      currCov ? { shadowCoverage: currCov } : null,
    );
    if (w) warnings.push({ fromStepIndex: steps[i - 1].index ?? (i - 1), toStepIndex: steps[i].index ?? i, stepIndex: steps[i].index ?? i, warning: w });
  }
  warnings.sort((a, b) => a.toStepIndex - b.toStepIndex);
  return warnings;
}

/**
 * Enrich a single-run JSON export with top-level shadowCoverage.
 * Pure function — returns a new object (shallow clone + added field).
 * @param {object|null} result - state.lastResult
 * @returns {object}
 */
function enrichRunJsonExport(result) {
  if (!result || typeof result !== "object") return result || {};
  const out = Object.assign({}, result);
  const best = out.bestEntry || out.best || null;
  out.shadowCoverage = best?.result?.shadowCoverage || best?.shadowCoverage || null;
  out.engineCoverage = engineCoverageSummary();
  const findings = best?.result?.findings || [];
  out.observedCoverage = runCoverageObserved(findings);
  return out;
}

// --- Upgrade: Signature quality for shadow nth paths ---

/**
 * Determine signatureQuality for a finding.
 * Shadow DOM + nth-of-type paths are structurally volatile in component re-renders.
 * Does NOT change signature hash generation — only the signatureQuality field.
 */
function computeSignatureQuality(finding) {
  const path = finding?.path || "";
  const testIdVal = finding?.testId || "";

  if (testIdVal || path.includes("#")) {
    return "high";
  }

  // Shadow DOM + nth-of-type without strong anchor → low quality
  if (
    path.includes(">>>") &&
    !path.includes("#") &&
    !path.includes("[data-testid") &&
    path.includes(":nth-of-type(")
  ) {
    return "low";
  }

  if (path) return "medium";
  return "low";
}

// --- Stable Signature Engine (v4 shadow mode) ---

const STABLE_SIGNATURE_VERSION = 1;

/**
 * Build a stable finding signature that does NOT depend on rawAppendix.
 * Format: `${ruleId}|${severity}|${normalizedLocatorHash}`
 *
 * ruleId = `${mode}|${type}|${wcag}` (canonical, no labels, no text)
 * severity = normalized enum
 * normalizedLocatorHash = hash(frameKeyStable + testId + role + stablePathHash + tagName)
 *
 * Excludes: text content, aria-label, dynamic attributes, marker hash.
 */
function buildStableSignature(finding, frameKeyStable, mode = "run") {
  const typeNorm = normalizeIdentityText(finding?.type, 40);
  const wcagNorm = normalizeIdentityText(finding?.wcag, 24);
  const severityNorm = normalizeWs(finding?.severity, 10) || "info";
  const ruleId = `${mode}|${typeNorm}|${wcagNorm}`;

  const locatorParts = [
    frameKeyStable || "fk::unknown",
    finding?.testId ? normalizeIdentityText(finding.testId, 60) : "",
    finding?.role ? normalizeWs(finding.role, 20) : "",
    pathHashForSig(finding?.path),
    normalizeWs(finding?.tag, 16) || "",
  ];
  const normalizedLocatorHash = fnv1aHash8(locatorParts.join("|"));

  return `${ruleId}|${severityNorm}|${normalizedLocatorHash}`;
}

/**
 * Build a stable signature for non-finding items (contrast, tabWalk, watch).
 */
function buildStableItemSignature(item, frameKeyStable, mode) {
  if (mode === "contrast") {
    const wcag = normalizeIdentityText(item?.wcag || "1.4.3", 24);
    const locator = [
      frameKeyStable || "fk::unknown",
      normalizeIdentityText(item?.testId, 60) || "",
      pathHashForSig(item?.path),
      normalizeWs(item?.tag, 16) || "",
    ];
    return `contrast|${wcag}|high|${fnv1aHash8(locator.join("|"))}`;
  }
  if (mode === "tabWalk") {
    const type = normalizeIdentityText(item?.type, 40);
    const sev = TAB_BLOCKING_TYPES.has(normalizeWs(item?.type, 40)) ? "medium" : "info";
    const locator = [
      frameKeyStable || "fk::unknown",
      pathHashForSig(item?.path),
      normalizeWs(item?.name, 80) || "",
    ];
    return `tabwalk|${type}|${sev}|${fnv1aHash8(locator.join("|"))}`;
  }
  if (mode === "watch") {
    const metric = normalizeWs(item?.metric, 32);
    const locator = [frameKeyStable || "fk::unknown", metric];
    return `watch|${metric}|medium|${fnv1aHash8(locator.join("|"))}`;
  }
  // fallback
  return `${mode}|unknown|info|${fnv1aHash8(JSON.stringify(item || {}).slice(0, 200))}`;
}

/**
 * Compute the stable signature set for a step's snapshot.
 * Returns { stableFindingSignatureSet, severityCounts, blockingSet, summaryScore }.
 */
// ═══ FLOW DIFF / LIFECYCLE BUILDERS ═══════════════════════════════════════
// Severity ordering shared by the diff + lifecycle sorts.
const FLOW_SEV_RANK = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
function _flowSevRank(sev) {
  var r = FLOW_SEV_RANK[String(sev || "info").toLowerCase()];
  return r == null ? 4 : r;
}
function _sortFindingMeta(list) {
  return list.slice().sort(function (a, b) {
    return _flowSevRank(a.severity) - _flowSevRank(b.severity) || String(a.sig).localeCompare(String(b.sig));
  });
}

/**
 * Build a signature → finding-metadata map for a step's run findings, using the
 * same stable-signature identity as the diff engine. Stored on the step at
 * capture as `step.findingIndex` so the pure diff/lifecycle builders (and the
 * detail pane) can resolve a signature back to a human-readable finding —
 * including RESOLVED findings, which are read from the previous step.
 */
function buildStepFindingIndex(snapshot, rawAppendix = null) {
  const out = {};
  if (!snapshot || !snapshot.best) return out;
  const frameKeyStable = snapshot.best.frameKeyStable || snapshot.best.frameKey || "fk::unknown";
  const mode = snapshot.mode || "run";
  const raw = resolveSnapshotRaw(snapshot, rawAppendix) || {};
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  for (const f of findings) {
    const sig = buildStableSignature(f, frameKeyStable, mode);
    if (out[sig]) continue; // first finding wins for a given identity
    out[sig] = {
      sig: sig,
      name: (f && (f.name || f.testId)) || "",
      type: (f && f.type) || "UNKNOWN_RULE",
      severity: (f && f.severity) || "info",
      wcag: (f && f.wcag) || "",
      // Confidence is needed to classify a blocker the same way Snap/CI do
      // (isRunFindingBlocking): medium is blocking only at strict confidence.
      confidence: (f && f.confidence) || "",
    };
  }
  return out;
}

/**
 * Diff a step's issue set against the previous step at finding identity.
 * @returns {{appeared:Array,persisting:Array,resolved:Array}} each an array of
 *   finding-metadata objects. Resolved items come from prevStep's index.
 */
function bucketStepDiff(step, prevStep) {
  const cur = (step && step.findingIndex) || {};
  const prev = (prevStep && prevStep.findingIndex) || {};
  const appeared = [], persisting = [], resolved = [];
  for (const sig in cur) {
    if (!Object.prototype.hasOwnProperty.call(cur, sig)) continue;
    (prev[sig] ? persisting : appeared).push(cur[sig]);
  }
  for (const sig in prev) {
    if (!Object.prototype.hasOwnProperty.call(prev, sig)) continue;
    if (!cur[sig]) resolved.push(prev[sig]);
  }
  return { appeared: _sortFindingMeta(appeared), persisting: _sortFindingMeta(persisting), resolved: _sortFindingMeta(resolved) };
}

/**
 * Build one lane per recurring signature across the whole flow, for the
 * lifecycle swimlane. Lanes are ordered by severity then first appearance.
 * @returns {{lanes:Array<{sig,label,severity,firstStep,lastStep,presentSteps:number[]}>}}
 */
function buildIssueLifecycle(steps) {
  const list = Array.isArray(steps) ? steps : [];
  const byS = {};
  for (const step of list) {
    const idx = step && step.findingIndex;
    if (!idx) continue;
    for (const sig in idx) {
      if (!Object.prototype.hasOwnProperty.call(idx, sig)) continue;
      const meta = idx[sig];
      if (!byS[sig]) {
        byS[sig] = { sig: sig, label: meta.name || meta.type || sig, severity: meta.severity || "info", firstStep: step.index, lastStep: step.index, presentSteps: [] };
      }
      byS[sig].presentSteps.push(step.index);
      byS[sig].lastStep = step.index;
      if (step.index < byS[sig].firstStep) byS[sig].firstStep = step.index;
    }
  }
  const lanes = Object.keys(byS).map(function (k) { return byS[k]; }).sort(function (a, b) {
    return _flowSevRank(a.severity) - _flowSevRank(b.severity) || a.firstStep - b.firstStep || String(a.sig).localeCompare(String(b.sig));
  });
  return { lanes: lanes };
}

function computeStableSignatureSet(snapshot, rawAppendix = null) {
  const empty = { stableFindingSignatureSet: [], severityCounts: { high: 0, medium: 0, low: 0, info: 0 }, blockingSet: [], summaryScore: 0 };
  if (!snapshot || !snapshot.best) return empty;

  const frameKeyStable = snapshot.best.frameKeyStable || snapshot.best.frameKey || "fk::unknown";
  const mode = snapshot.mode || "run";
  const raw = resolveSnapshotRaw(snapshot, rawAppendix) || {};
  const signatures = [];
  const severityCounts = { high: 0, medium: 0, low: 0, info: 0 };
  const blockingSet = [];
  let summaryScore = 0;

  if (mode === "run" || mode === "observe") {
    const findings = Array.isArray(raw.findings) ? raw.findings : [];
    for (const f of findings) {
      const sig = buildStableSignature(f, frameKeyStable, mode);
      signatures.push(sig);
      const sev = normalizeWs(f?.severity, 10) || "info";
      if (sev in severityCounts) severityCounts[sev]++;
      const isBlocking = sev === "high" || sev === "medium";
      if (isBlocking) blockingSet.push(sig);
      summaryScore += ({ high: 5, medium: 3, low: 1, info: 0 })[sev] || 0;
    }
  } else if (mode === "contrast") {
    const failures = Array.isArray(raw.failures) ? raw.failures : [];
    for (const f of failures) {
      const sig = buildStableItemSignature(f, frameKeyStable, mode);
      signatures.push(sig);
      severityCounts.high++;
      blockingSet.push(sig);
      summaryScore += 5;
    }
  } else if (mode === "tabWalk") {
    const events = Array.isArray(raw.events) ? raw.events : [];
    for (const e of events) {
      const sig = buildStableItemSignature(e, frameKeyStable, mode);
      signatures.push(sig);
      const isBlocking = TAB_BLOCKING_TYPES.has(normalizeWs(e?.type, 40));
      if (isBlocking) { severityCounts.medium++; blockingSet.push(sig); summaryScore += 3; }
      else { severityCounts.info++; summaryScore += 0; }
    }
  } else if (mode === "watch") {
    const verdicts = Array.isArray(raw.verdicts) ? raw.verdicts : [];
    for (const v of verdicts) {
      const sig = buildStableItemSignature(v, frameKeyStable, mode);
      signatures.push(sig);
      severityCounts.medium++;
      blockingSet.push(sig);
      summaryScore += 3;
    }
  }

  return { stableFindingSignatureSet: signatures, severityCounts, blockingSet, summaryScore };
}

/**
 * Compute diff using stable signature sets only — no rawAppendix dependency.
 */
function computeStableDiff(prevSignatures, currSignatures, prevBlocking = null, currBlocking = null) {
  const prevSet = new Set(Array.isArray(prevSignatures) ? prevSignatures : []);
  const currSet = new Set(Array.isArray(currSignatures) ? currSignatures : []);

  let added = 0, fixed = 0, persisting = 0;
  let blockingAdded = 0, blockingFixed = 0;

  for (const sig of currSet) {
    if (prevSet.has(sig)) persisting++;
    else added++;
  }
  for (const sig of prevSet) {
    if (!currSet.has(sig)) fixed++;
  }

  // Blocking deltas need the blocking sets — without them the fields were
  // stuck at 0 and the shadow-mode parity check mismatched on every step.
  const prevBlock = new Set(Array.isArray(prevBlocking) ? prevBlocking : []);
  const currBlock = new Set(Array.isArray(currBlocking) ? currBlocking : []);
  for (const sig of currBlock) if (!prevSet.has(sig)) blockingAdded++;
  for (const sig of prevBlock) if (!currSet.has(sig)) blockingFixed++;

  return { added, fixed, persisting, blockingAdded, blockingFixed };
}

/**
 * Run parallel diff validation (shadow mode): compares legacy diff with stable diff.
 * Logs mismatches in non-production. Does NOT break production.
 */
function validateDiffParity(step, prevStep, rawAppendix, stableRun, stablePrev) {
  if (!step || !prevStep) return;
  try {
    const legacy = buildStepDiffs(step, prevStep, rawAppendix);
    const legacyRun = legacy?.run || {};
    const stableDiff = computeStableDiff(
      stablePrev?.stableFindingSignatureSet || [],
      stableRun?.stableFindingSignatureSet || [],
      stablePrev?.blockingSet || [],
      stableRun?.blockingSet || []
    );

    if (legacyRun.blockingAdded !== stableDiff.blockingAdded ||
        legacyRun.blockingFixed !== stableDiff.blockingFixed) {
      console.warn("[FlowLens] Diff parity mismatch (shadow mode)", {
        legacy: { blockingAdded: legacyRun.blockingAdded, blockingFixed: legacyRun.blockingFixed },
        stable: { blockingAdded: stableDiff.blockingAdded, blockingFixed: stableDiff.blockingFixed },
      });
    }
  } catch (e) {
    console.warn("[FlowLens] Diff parity validation error", e);
  }
}

