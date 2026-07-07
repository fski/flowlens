/**
 * FlowLens — pure export builders (JUnit XML, markdown, CI diff report).
 * Extracted from panel.js — pure functions, loaded as a plain script before panel.js.
 * No DOM, chrome.*, or panel-state access. Code moved byte-identical.
 */

function shortUrlForMarkdown(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return txt(url || "—", 120);
  }
}

function formatTargetingShort(targeting) {
  if (!targeting || typeof targeting !== "object") return "—";
  const profiles = Array.isArray(targeting.profileIds) ? targeting.profileIds.join(",") : "";
  const scope = targeting.scope || targeting.targetMode || "primary";
  return [
    `scope=${scope}`,
    `pinned=${targeting.pinned ? "y" : "n"}`,
    `profileMatch=${targeting.helpCenterMatchEnabled ? "y" : "n"}`,
    `why=${targeting.selectionReason || "scope_primary_scored_best"}`,
    profiles ? `profiles=${profiles}` : null,
  ].filter(Boolean).join(" • ");
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

function buildSessionMarkdown(session) {
  if (!session) return "FlowLens session export: no active session.";
  const steps = Array.isArray(session.steps) ? session.steps : [];
  const frameKeys = Array.isArray(session?.frames?.frameKeys) ? session.frames.frameKeys : [];
  const rawAppendix = session?.rawAppendix && typeof session.rawAppendix === "object" ? session.rawAppendix : {};
  const lines = [];
  lines.push(`**FlowLens Session** ${session.id}`);
  lines.push(`Origin: ${session.inspectedOrigin || "—"} • Env: ${session.envTag || "—"}`);
  lines.push(`Started: ${session.startedAt} • Ended: ${session.endedAt || "in-progress"}`);
  lines.push(`Steps: ${steps.length} • Frames: ${frameKeys.length}`);
  lines.push(`Versions: schema=v${asNumber(session.schemaVersion, 1)} signature=v${asNumber(session.signatureVersion, 1)} frameKey=v${asNumber(session.frameKeyVersion, 1)}`);
  lines.push(`Settings: baselineRun=${session.settings?.captureBaselineRun ? "yes" : "no"}, activeMode=${session.settings?.captureActiveMode ? "yes" : "no"}, scope=${session.settings?.scopeAtCapture || session.settings?.targetModeAtCapture || "primary"}, profileMatch=${session.settings?.helpCenterMatchEnabled ? "yes" : "no"}`);
  const _secs = session.engineCoverage || engineCoverageSummary();
  lines.push(`Coverage (engine): ${_secs.coveredCount}/${_secs.totalCount} WCAG ${_secs.target.version} ${_secs.target.level} criteria`);
  lines.push("");

  const flowMap = new Map();
  for (const step of steps) {
    const bundle = mergeSignatureBundles([
      buildModeSignatureBundle(step?.snapshots?.run, rawAppendix),
      buildModeSignatureBundle(step?.snapshots?.active, rawAppendix),
    ]);
    for (const sig of bundle.blockingSet) {
      const meta = bundle.metaBySig.get(sig) || {};
      const existing = flowMap.get(sig) || {
        sig,
        firstSeenStep: step.index,
        lastSeenStep: step.index,
        occurrences: 0,
        wcag: meta.wcag || "",
        level: meta.level || "",
        confidence: meta.confidence || "",
        signatureQuality: meta.signatureQuality || "medium",
        label: meta.label || "",
        blockingWeight: severityWeight(meta.severity),
      };
      existing.lastSeenStep = step.index;
      existing.occurrences += 1;
      existing.blockingWeight = Math.max(existing.blockingWeight, severityWeight(meta.severity));
      if (qualityWeight(meta.signatureQuality) > qualityWeight(existing.signatureQuality)) {
        existing.signatureQuality = meta.signatureQuality;
      }
      flowMap.set(sig, existing);
    }
  }

  const topBlocking = [...flowMap.values()]
    .sort((a, b) =>
      (b.blockingWeight - a.blockingWeight)
      || (qualityWeight(b.signatureQuality) - qualityWeight(a.signatureQuality))
      || (b.occurrences - a.occurrences)
      || (a.firstSeenStep - b.firstSeenStep)
      || a.sig.localeCompare(b.sig)
    )
    .slice(0, 24);
  lines.push("Flow summary (blocking signatures):");
  if (!topBlocking.length) {
    lines.push("- none");
  } else {
    lines.push("| Must-fix | Occurrences | First | Last | Quality | Label | WCAG | Level | Confidence | Signature |");
    lines.push("| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |");
    for (const x of topBlocking) {
      const quality = x.signatureQuality || "medium";
      const qualityLabel = quality === "low" ? "low (may be unstable)" : quality;
      lines.push(`| ${x.blockingWeight} | ${x.occurrences} | ${x.firstSeenStep} | ${x.lastSeenStep} | ${qualityLabel} | ${txt(x.label || "issue", 26)} | ${x.wcag || "—"} | ${x.level || "—"} | ${x.confidence || "—"} | \`${txt(x.sig, 90)}\` |`);
    }
  }
  lines.push("");

  const _covWarnings = computeSessionShadowWarnings(steps);
  if (_covWarnings.length) {
    lines.push("\u26A0 Shadow DOM coverage changed between snapshots. Diffs may be incomplete.");
    for (const cw of _covWarnings) {
      const f = cw.warning.from || {};
      const t = cw.warning.to || {};
      lines.push(`- Step ${cw.fromStepIndex} \u2192 Step ${cw.toStepIndex}: audited ${Number(f.scopesAudited) || 0} \u2192 ${Number(t.scopesAudited) || 0}, capped ${!!f.scopesCapped} \u2192 ${!!t.scopesCapped}, depthLimit ${!!f.depthLimitReached} \u2192 ${!!t.depthLimitReached}`);
    }
    lines.push("");
  }

  lines.push("Per-step:");
  for (const step of steps) {
    const routeHint = txt(step?.routeHint || "(unknown)", 120);
    lines.push(`### Step ${step.index} — ${routeHint}`);
    if (step.label) lines.push(`- Label: ${txt(step.label, 120)}`);
    lines.push(`- At: ${step.at || "—"}`);
    lines.push(`- URL: ${shortUrlForMarkdown(step.url || "—")} (\`${txt(step.url || "—", 180)}\`)`);
    lines.push(`- Modes: ${modeLabel("run")}${step.snapshots?.active ? ` + ${modeLabel(step.snapshots.active.mode)}` : ""}`);
    const _stepCov = formatShadowCoverageLine(step?.snapshots?.run?.best?.shadowCoverage);
    if (_stepCov) {
      const _isCappedOrLimited = step?.snapshots?.run?.best?.shadowCoverage?.scopesCapped || step?.snapshots?.run?.best?.shadowCoverage?.depthLimitReached;
      lines.push(`- ${_stepCov}`);
      if (_isCappedOrLimited) lines.push(`- Coverage limited; diffs may be incomplete.`);
    }
    const diff = step.diffs?.consolidated || {};
    lines.push(`- Diff: new=${asNumber(diff.added, 0)} • persisting=${asNumber(diff.persisting, 0)} • fixed=${asNumber(diff.fixed, 0)} • blocking +${asNumber(diff.blockingAdded, 0)}/-${asNumber(diff.blockingFixed, 0)}`);
    const runTarget = step?.snapshots?.run?.targeting || null;
    const activeTarget = step?.snapshots?.active?.targeting || null;
    if (runTarget) {
      lines.push(`- Targeting(run): ${formatTargetingShort(runTarget)} • frameKeyV=v${asNumber(runTarget.frameKeyVersion, 1)}`);
    }
    if (activeTarget) {
      lines.push(`- Targeting(${modeLabel(step.snapshots.active.mode)}): ${formatTargetingShort(activeTarget)} • frameKeyV=v${asNumber(activeTarget.frameKeyVersion, 1)}`);
    }
    const runBest = step.snapshots?.run?.best;
    const activeBest = step.snapshots?.active?.best;
    if (runBest) lines.push(`- Run best: frameKey=${runBest.frameKey} • blocking=${runBest.normalized?.blockingCount ?? 0} • score=${runBest.normalized?.summaryScore ?? 0}`);
    if (activeBest) lines.push(`- Active best (${modeLabel(step.snapshots.active.mode)}): frameKey=${activeBest.frameKey} • blocking=${activeBest.normalized?.blockingCount ?? 0} • score=${activeBest.normalized?.summaryScore ?? 0}`);
    lines.push("");
  }

  lines.push("Appendix:");
  for (const step of steps) {
    const keys = step.frameSelections?.usedFrameKeys || [];
    lines.push(`- Step ${step.index} frames: ${keys.join(", ") || "—"}`);
  }
  return lines.join("\n");
}

function buildMarkdown({ inspectedUrl, best, perFrame, usedFrameIds, envTag, shadowCoverage }) {
  const r = best?.result;
  if (!r) return `FlowLens — no result (env=${envTag})\nURL: ${inspectedUrl}`;
  const normalized = best?.normalized || normalizeResultForExport(r);
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const c = countBySeverity(findings);
  const top = [...findings].sort((a, b) => (ORDER[b.severity] || 0) - (ORDER[a.severity] || 0)).slice(0, 10);
  const withMeta = (item) => {
    const level = item?.level ? `, level=${item.level}` : "";
    const confidence = item?.confidence ? `, confidence=${item.confidence}` : "";
    return `${level}${confidence}`;
  };
  const lines = [];
  lines.push(`**FlowLens** (${envTag})`);
  lines.push(`URL: ${inspectedUrl}`);
  lines.push(`FrameIds: ${(usedFrameIds || []).join(", ") || "?"}`);
  lines.push(`Mode: ${modeLabel(r.mode || "run")} • inIframe: ${String(r?.env?.inIframe ?? "—")}`);
  lines.push(`Findings: high=${c.high}, medium=${c.medium}, low=${c.low}, info=${c.info} (total=${findings.length})`);
  const _covLine = formatShadowCoverageLine(shadowCoverage || r?.shadowCoverage || null);
  if (_covLine) lines.push(_covLine);
  const _ecs = engineCoverageSummary();
  lines.push(`Coverage (engine): ${_ecs.coveredCount}/${_ecs.totalCount} WCAG ${_ecs.target.version} ${_ecs.target.level} criteria`);
  const _ocs = runCoverageObserved(findings);
  lines.push(`Coverage (observed): ${_ocs.coveredCount}/${_ocs.totalCount}`);
  if (actionIsWatch(r)) {
    const w = r;
    const watchCounts = normalized?.type === "watch" ? normalized.primaryCounts : {};
    lines.push(`Watch: bursts=${watchCounts?.bursts ?? asNumber(w.bursts, "—")}, silentMs=${w.silentMs ?? "—"}, totalLoadingMs=${watchCounts?.totalLoadingMs ?? w.totalLoadingMs ?? "—"}, focusLossCount=${watchCounts?.focusLossCount ?? w.focusLossCount ?? "—"}`);
  }
  lines.push("");
    if (Array.isArray(r.failures)) {
    const contrastCounts = normalized?.type === "contrast" ? normalized.primaryCounts : {};
    lines.push(`Contrast: failures=${contrastCounts?.failures ?? r.failuresCount ?? r.failures.length}, scanned=${contrastCounts?.scanned ?? r.scanned ?? "—"}`);
    lines.push("");
    lines.push("Top contrast failures:");
    for (const f of r.failures.slice(0, 10)) {
      lines.push(`- [ratio ${f.ratio}/${f.required}] ${txt(f.text || "", 80)} • ${txt(f.path || "", 80)}`);
    }
    lines.push("");
    lines.push(`Panel summary: ${summarizeFrames(perFrame || [])}`);
    return lines.join("\n");
  }

  if (Array.isArray(r.events)) {
    const tabCounts = normalized?.type === "tabWalk" ? normalized.primaryCounts : {};
    lines.push(`TabWalk: events=${tabCounts?.events ?? r.events.length}, walked=${tabCounts?.walked ?? r.walked ?? "—"}/${tabCounts?.totalFocusables ?? r.totalFocusables ?? "—"}`);
    lines.push("");
    lines.push("Top TabWalk events:");
    for (const e of r.events.slice(0, 12)) {
      lines.push(`- [${e.type}] i=${e.i ?? "—"} ${txt(e.name || "", 60)} • ${txt(e.path || "", 80)} ${e.note ? "— " + txt(e.note, 80) : ""}`);
    }
    lines.push("");
    lines.push(`Panel summary: ${summarizeFrames(perFrame || [])}`);
    return lines.join("\n");
  }

  lines.push("Top findings:");
  for (const f of top) {
    lines.push(`- [${f.severity}] ${f.product ? f.product + " • " : ""}${f.type || ""}${f.wcag ? ` (${f.wcag})` : ""}${withMeta(f)} — ${txt(f.note || f.name || "", 120)}${f.testId ? ` • testId=${f.testId}` : ""}${f.fix ? "\n  Fix: " + txt(f.fix, 120) : ""}`);
  }
  lines.push("");
  lines.push(`Panel summary: ${summarizeFrames(perFrame || [])}`);
  return lines.join("\n");
}

function buildMachineReadableDiffReport(session) {
  const steps = Array.isArray(session?.steps) ? session.steps : [];
  if (steps.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const curr = steps[i];
    const prevSigs = prev?.stableSignatures?.run || {};
    const currSigs = curr?.stableSignatures?.run || {};
    const prevBlocking = new Set(Array.isArray(prevSigs.blockingSet) ? prevSigs.blockingSet : []);
    const currBlocking = new Set(Array.isArray(currSigs.blockingSet) ? currSigs.blockingSet : []);
    const blockingAdded = [...currBlocking].filter(s => !prevBlocking.has(s));
    const blockingFixed = [...prevBlocking].filter(s => !currBlocking.has(s));
    const prevCounts = prevSigs.severityCounts || { high: 0, medium: 0, low: 0, info: 0 };
    const currCounts = currSigs.severityCounts || { high: 0, medium: 0, low: 0, info: 0 };
    diffs.push({
      stepPair: [i - 1, i],
      labels: [prev.label || `step-${i - 1}`, curr.label || `step-${i}`],
      blockingAdded,
      blockingFixed,
      countsBySeverity: {
        prev: { ...prevCounts },
        curr: { ...currCounts },
        delta: {
          high: (currCounts.high || 0) - (prevCounts.high || 0),
          medium: (currCounts.medium || 0) - (prevCounts.medium || 0),
          low: (currCounts.low || 0) - (prevCounts.low || 0),
          info: (currCounts.info || 0) - (prevCounts.info || 0),
        },
      },
      degraded: !!(currSigs.stepQuality?.degraded),
    });
  }
  return {
    version: 1,
    sessionId: session?.id || null,
    stepsCount: steps.length,
    runConfigSummary: session?.runConfigSummary || null,
    confidence: {
      reducedDiffConfidence: steps.some(s => s.profileSuspect === true) ||
        steps.some(s => s.stableSignatures?.run?.stepQuality?.degraded === true),
      profileSuspect: steps.some(s => s.profileSuspect === true),
      rootSelectorNotFound: steps.some(s => s.rootSelectorNotFound === true),
    },
    diffs,
  };
}

function buildDiagnosticsMarkdown(payload) {
  const p = payload || {};
  const d = (v) => (v != null && v !== "") ? String(v) : "\u2014";
  const signals = Array.isArray(p.profileMatchSignals) && p.profileMatchSignals.length
    ? p.profileMatchSignals.join(", ") : "\u2014";
  const shadowLine = p.shadowCoverage
    ? `${p.shadowCoverage.scopesAudited}/${p.shadowCoverage.scopesFound} scopes` +
      (p.shadowCoverage.scopesCapped ? " (capped)" : "") +
      `, depth ${p.shadowCoverage.maxDepthObserved}` +
      (p.shadowCoverage.depthLimitReached ? " (limit reached)" : "")
    : "\u2014";
  return [
    "# FlowLens Diagnostics",
    "",
    "## Environment",
    `- Version: ${d(p.version)}`,
    `- Host: ${d(p.hostConfigId)}`,
    `- Data Versions: ${d(p.dataVersionsLine)}`,
    `- URL: ${d(p.url)}`,
    `- Environment Tag: ${d(p.env)}`,
    "",
    "## Frame",
    `- Best Frame ID: ${d(p.bestFrameId)}`,
    `- Frame Key: ${d(p.bestFrameKey)}`,
    `- Frame Scope: ${d(p.frameScope)}`,
    ...(p.frameGatingSelectorCount > 0 ? [`- Frame Gating: active (${p.frameGatingSelectorCount} selectors)`] : []),
    ...(p.excludedFrameCount > 0 ? [`- Excluded Frames: ${p.excludedFrameCount} excluded by host match rules`] : []),
    "",
    "## Profiles",
    `- Active Profile: ${d(p.activeProfileLabel)}`,
    `- Profile Confidence: ${d(p.profileConfidence)}`,
    `- Profile Signals: ${signals}`,
    `- Profile Suspect: ${p.profileSuspect ? "yes" : "no"}`,
    `- Root Selector: ${d(p.rootSelector)}`,
    `- Root Selector Match: ${p.rootSelector ? (p.rootSelectorNotFound ? "NOT FOUND" : "OK") : "\u2014"}`,
    ...(p.rootSelectorMatchedFrameIds?.length ? [`- Matched in Frame(s): ${p.rootSelectorMatchedFrameIds.join(", ")}`] : []),
    ...(p.reducedDiffConfidence ? ["- Diff Confidence: **reduced**"] : []),
    `- Depth Filter: ${p.depthMax || 3} (${p.depthMax === 1 ? "Fast" : p.depthMax === 2 ? "Balanced" : "Full"})`,
    ...(p.depthSuggestion ? [`- **Depth suggestion: ${p.depthSuggestion.suggestedDepth}** (profile ${p.depthSuggestion.profileId})`] : []),
    `- Recipe: ${p.recipeId || "auto"}`,
    ...(p.rulePack ? [`- Rule Pack: enabled=${p.rulePack.enabledCount}, disabled=${p.rulePack.disabledCount}`] : []),
    "",
    "## Depth 3 Engine",
    `- Enabled: ${p.depth3Engine?.enabled ? "yes" : "no"}`,
    `- Capture Mode: ${d(p.depth3Engine?.captureMode)}`,
    `- Capped: ${p.depth3Engine?.capped ? "yes" : "no"}`,
    "",
    ...(p.depth3Aggregates ? [
      "## Depth 3 Integrity (current run view)",
      `- Announcement Integrity: ${p.depth3Aggregates.announcementIntegrity} (${p.depth3Aggregates.counts?.announcements || 0} findings)`,
      `- Focus Stability: ${p.depth3Aggregates.focusStability} (${p.depth3Aggregates.counts?.focus || 0} findings)`,
      `- Widget semantics: ${p.depth3Aggregates.chatSemantics} (${p.depth3Aggregates.counts?.semantics || 0} findings)`,
      `- Multi-Frame Integrity: ${p.depth3Aggregates.multiFrameIntegrity} (${p.depth3Aggregates.counts?.multiframe || 0} findings)`,
      "",
    ] : []),
    "## Shadow DOM",
    `- Shadow Coverage: ${shadowLine}`,
    "",
  ].join("\n");
}

/**
 * Enrich a regression signature into a CI-safe entry with only scalar fields.
 * Parses ruleId from signature format: mode|type|wcag|severity|hash.
 * Looks up depthLevel/group from RULE_TO_WCAG — no finding object fields copied.
 */
function enrichRegressionEntry(sig) {
  var entry = { signature: String(sig || "") };
  // Parse signature: mode|type|wcag|severity|hash
  var parts = entry.signature.split("|");
  if (parts.length >= 4) {
    var ruleId = parts[1] || "";
    var severity = parts[3] || "info";
    entry.ruleId = ruleId;
    entry.severity = severity;
    // Look up depthLevel and group from RULE_TO_WCAG
    var ruleMeta = (typeof RULE_TO_WCAG !== "undefined" && RULE_TO_WCAG) ? RULE_TO_WCAG[ruleId] : null;
    if (ruleMeta) {
      if (ruleMeta.depthLevel != null) entry.depthLevel = Number(ruleMeta.depthLevel);
      if (ruleMeta.group != null) entry.group = String(ruleMeta.group);
    }
  }
  return entry;
}
