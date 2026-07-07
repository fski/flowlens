/**
 * FlowLens — stable-signature / diff engine.
 * Extracted from panel.js — pure functions, loaded as a plain script before panel.js.
 * No DOM, chrome.*, or panel-state access. Code moved byte-identical.
 */

const TAB_BLOCKING_TYPES = new Set([
  "possible_focus_trap",
  "non_dialog_focus_trap",
  "roach_motel",
  "dialog_focus_not_trapped",
  "focus_on_body",
  "focus_failed",
]);

function hashFinding(f) {
  // stable-ish signature for diff
  const parts = [
    f?.severity,
    f?.product,
    f?.type,
    f?.wcag,
    f?.testId,
    f?.path,
    f?.role,
    (f?.name || "").slice(0, 60),
    (f?.note || "").slice(0, 60),
  ];
  return parts.map(x => String(x || "")).join("|");
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFindingConfidence(confidence) {
  const c = String(confidence || "").toLowerCase();
  if (c === "strict" || c === "heuristic" || c === "advisory") return c;
  return "strict";
}

function isRunFindingBlocking(finding) {
  const severity = normalizeWs(finding?.severity, 12);
  if (severity !== "high" && severity !== "medium") return false;
  const confidence = normalizeFindingConfidence(finding?.confidence);
  if (confidence === "advisory") return false;
  if (severity === "high") return true;
  return confidence === "strict";
}

function normalizeWs(s, max = 120) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeIdentityText(s, max = 120) {
  return normalizeWs(s, max * 2)
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{13,}\b/gi, "#")
    .replace(/\b[0-9a-f]{12,}\b/gi, "#")
    .replace(/\b\d{2,}\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizePathForSig(path, max = 140) {
  return normalizeWs(path, max)
    .replace(/nth-child\(\d+\)/g, "nth-child(*)")
    .replace(/\b[0-9a-f]{8,}\b/gi, "#")
    .replace(/\b\d{2,}\b/g, "#");
}

function pathHashForSig(path) {
  const normalized = normalizePathForSig(path, 220);
  return fnv1aHash8(normalized || "path:none");
}

function pathLooksWeak(path) {
  const normalized = normalizePathForSig(path, 220);
  if (!normalized) return true;
  const depth = normalized.split(">").length;
  return depth < 2 || /nth-child\(\*\)/.test(normalized);
}

function qualityWeight(signatureQuality) {
  if (signatureQuality === "high") return 2;
  if (signatureQuality === "medium") return 1;
  return 0;
}

function normalizeRouteSegment(seg) {
  const s = String(seg || "").toLowerCase().trim();
  if (!s) return "";
  if (/^[0-9]+$/.test(s)) return "_id";
  if (/^[0-9a-f]{8,}$/i.test(s)) return "_id";
  if (/^[0-9a-f]{4,}-[0-9a-f-]{8,}$/i.test(s)) return "_id";
  return s.slice(0, 36);
}

function stableRoutePathHint(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").map(normalizeRouteSegment).filter(Boolean).slice(0, 3);
    return segs.length ? segs.join("/") : "root";
  } catch {
    return "root";
  }
}

function normalizedTitleHint(title) {
  const t = String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 80) : "";
}

function deriveHelpCenterRouteHint(url, activeProfileIds = []) {
  if (!Array.isArray(activeProfileIds) || !activeProfileIds.includes("helpcenter")) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const articleParam = u.searchParams.get("articleId")
      || u.searchParams.get("article_id")
      || u.searchParams.get("articleSlug")
      || u.searchParams.get("slug")
      || u.searchParams.get("aid");
    if (articleParam) return `article:${normalizeRouteSegment(articleParam)}`;
    const match = path.match(/\/articles?\/([^/?#]+)/i) || path.match(/\/article\/([^/?#]+)/i);
    if (match?.[1]) return `article:${normalizeRouteSegment(match[1])}`;
  } catch {
    // ignore
  }
  return null;
}

function fnv1aHash8(input) {
  const s = String(input ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

function bucketNumber(value, step = 1, fallback = "na") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const b = Math.floor(n / step) * step;
  return String(b);
}

function resolveSnapshotRaw(snapshot, rawAppendix = null) {
  const inlineRaw = snapshot?.best?.normalized?.raw;
  if (inlineRaw && typeof inlineRaw === "object") return inlineRaw;
  const ref = snapshot?.best?.rawRef;
  if (ref && rawAppendix && typeof rawAppendix === "object" && rawAppendix[ref] && typeof rawAppendix[ref] === "object") {
    return rawAppendix[ref];
  }
  return {};
}

/** Shared boilerplate: resolve raw, extract array, map items. */
function _sigEntries(snapshot, rawAppendix, arrayKey, mapFn) {
  const fk = snapshot?.best?.frameKey || "fk::unknown::unknown::root::00000000";
  const items = (resolveSnapshotRaw(snapshot, rawAppendix) || {})[arrayKey];
  if (!Array.isArray(items)) return [];
  return items.map(item => mapFn(item, fk));
}

/** Signature entries for findings-based modes (run + observe). */
function findingSignatureEntries(prefix, snapshot, rawAppendix = null) {
  const isRun = prefix === "run";
  const fk = snapshot?.best?.frameKey || "fk::unknown::unknown::root::00000000";
  const raw = resolveSnapshotRaw(snapshot, rawAppendix) || {};
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  const entries = [];
  for (const f of findings) {
    const testIdNorm = normalizeIdentityText(f?.testId, 60);
    const typeNorm = normalizeIdentityText(canonicalizeRuleType(f?.type), 40);
    const wcagNorm = normalizeIdentityText(f?.wcag, 24);
    const severityNorm = normalizeIdentityText(f?.severity, 10);
    const noteNorm = normalizeIdentityText(f?.note, 80);
    const pathHash = pathHashForSig(f?.path);
    const weakPath = pathLooksWeak(f?.path);
    const signatureQuality = computeSignatureQuality(f);
    const roleNorm = isRun ? normalizeIdentityText(f?.role, 20) : null;
    const nameNorm = isRun ? normalizeIdentityText(f?.name, 80) : null;
    let weakSig = null;
    if (signatureQuality === "low") {
      const wp = [`${prefix}:weak`, fk, typeNorm || "type:none", wcagNorm || "wcag:none", severityNorm || "sev:none"];
      if (isRun) wp.push(roleNorm || "role:none", nameNorm || "name:none");
      wp.push(noteNorm || "note:none");
      weakSig = wp.join("|");
    }
    const sp = [prefix, fk, typeNorm, wcagNorm];
    if (isRun) sp.push(normalizeIdentityText(f?.level, 12), normalizeIdentityText(f?.confidence, 16), severityNorm, normalizeIdentityText(f?.product, 30));
    else sp.push(severityNorm);
    sp.push(`testid:${testIdNorm || "none"}`);
    if (isRun) sp.push(`role:${roleNorm || "none"}`);
    sp.push(`pathh:${pathHash}`);
    if (isRun) sp.push(nameNorm);
    sp.push(noteNorm);
    entries.push({
      sig: sp.join("|"), weakSig, signatureQuality,
      blocking: isRunFindingBlocking(f),
      wcag: f?.wcag || null,
      confidence: normalizeFindingConfidence(f?.confidence),
      level: f?.level || null,
      severity: normalizeWs(f?.severity, 12) || null,
      label: f?.type || `${prefix}_finding`,
    });
  }
  if (!isRun) {
    const snapshots = Array.isArray(raw.snapshots) ? raw.snapshots : [];
    const peak = snapshots.reduce((m, s) => Math.max(m, asNumber(s?.count, 0)), 0);
    let jumps = 0;
    for (let i = 1; i < snapshots.length; i++) {
      if (asNumber(snapshots[i]?.count, 0) > asNumber(snapshots[i - 1]?.count, 0)) jumps += 1;
    }
    entries.push({
      sig: ["observe", fk, "trend", `peak:${bucketNumber(peak, 5)}`, `jumps:${bucketNumber(jumps, 1)}`].join("|"),
      weakSig: null, signatureQuality: "high", blocking: false,
      wcag: null, confidence: "advisory", level: null, severity: "info", label: "trend",
    });
  }
  return entries;
}

/** Thin wrapper — also called directly for step-diff logic. */
function runSignatureEntries(snapshot, rawAppendix = null) {
  return findingSignatureEntries("run", snapshot, rawAppendix);
}

function contrastSignatureEntries(snapshot, rawAppendix = null) {
  return _sigEntries(snapshot, rawAppendix, "failures", (f, fk) => {
    const testIdNorm = normalizeIdentityText(f?.testId, 60);
    return {
      sig: ["contrast", fk, normalizeIdentityText(f?.wcag || "1.4.3", 24),
        `ratio:${bucketNumber(asNumber(f?.ratio, 0) * 10, 2)}`,
        `required:${bucketNumber(asNumber(f?.required, 0) * 10, 2)}`,
        normalizeIdentityText(f?.tag, 16), `testid:${testIdNorm || "none"}`,
        `pathh:${pathHashForSig(f?.path)}`, normalizeIdentityText(f?.text, 60)].join("|"),
      weakSig: null, signatureQuality: testIdNorm ? "high" : "medium",
      blocking: true, wcag: f?.wcag || "1.4.3", confidence: f?.confidence || "heuristic",
      level: null, severity: "high", label: "contrast_failure",
    };
  });
}

function tabWalkSignatureEntries(snapshot, rawAppendix = null) {
  return _sigEntries(snapshot, rawAppendix, "events", (e, fk) => {
    const type = normalizeWs(e?.type, 40);
    return {
      sig: ["tabwalk", fk, normalizeIdentityText(e?.type, 40), `pathh:${pathHashForSig(e?.path)}`,
        normalizeIdentityText(e?.name, 80), normalizeIdentityText(e?.note, 80),
        `tabi:${bucketNumber(asNumber(e?.tabIndex, 0), 1)}`].join("|"),
      weakSig: null, signatureQuality: pathLooksWeak(e?.path) ? "low" : "medium",
      blocking: TAB_BLOCKING_TYPES.has(type), wcag: null, confidence: "heuristic",
      level: null, severity: TAB_BLOCKING_TYPES.has(type) ? "medium" : "info",
      label: e?.type || "tabwalk_event",
    };
  });
}

function watchSignatureEntries(snapshot, rawAppendix = null) {
  const fk = snapshot?.best?.frameKey || "fk::unknown::unknown::root::00000000";
  const raw = resolveSnapshotRaw(snapshot, rawAppendix) || {};
  const out = (Array.isArray(raw.verdicts) ? raw.verdicts : []).map(v => ({
    sig: ["watch", fk, normalizeWs(v?.metric, 32), `b:${bucketNumber(v?.budget, 1)}`, `v:${bucketNumber(v?.value, 1)}`].join("|"),
    weakSig: null, signatureQuality: "high", blocking: true, wcag: null,
    confidence: "heuristic", level: null, severity: "medium", label: v?.metric || "watch_verdict",
  }));
  const focusLossCount = asNumber(raw?.focusLossCount, 0);
  if (focusLossCount > 0) {
    out.push({
      sig: ["watch", fk, "focus_loss", `v:${bucketNumber(focusLossCount, 1)}`].join("|"),
      weakSig: null, signatureQuality: "high", blocking: true, wcag: null,
      confidence: "heuristic", level: null, severity: "high", label: "focus_loss",
    });
  }
  return out;
}

function buildModeSignatureBundle(snapshot, rawAppendix = null) {
  const empty = { set: new Set(), blockingSet: new Set(), metaBySig: new Map(), counts: {} };
  if (!snapshot) return empty;

  let entries = [];
  if (snapshot.mode === "run") entries = runSignatureEntries(snapshot, rawAppendix);
  else if (snapshot.mode === "contrast") entries = contrastSignatureEntries(snapshot, rawAppendix);
  else if (snapshot.mode === "tabWalk") entries = tabWalkSignatureEntries(snapshot, rawAppendix);
  else if (snapshot.mode === "watch") entries = watchSignatureEntries(snapshot, rawAppendix);
  else if (snapshot.mode === "observe") entries = findingSignatureEntries("observe", snapshot, rawAppendix);

  const set = new Set();
  const blockingSet = new Set();
  const metaBySig = new Map();
  for (const e of entries) {
    set.add(e.sig);
    if (e.blocking) blockingSet.add(e.sig);
    metaBySig.set(e.sig, {
      wcag: e.wcag || null,
      confidence: e.confidence || null,
      level: e.level || null,
      severity: e.severity || null,
      label: e.label || snapshot.mode,
      weakSignature: e.weakSig || null,
      signatureQuality: e.signatureQuality || "medium",
    });
  }
  return {
    set,
    blockingSet,
    metaBySig,
    counts: snapshot?.best?.normalized?.primaryCounts || {},
  };
}

function mergeSignatureBundles(bundles) {
  const out = { set: new Set(), blockingSet: new Set(), metaBySig: new Map(), counts: {} };
  for (const b of bundles || []) {
    if (!b) continue;
    for (const sig of b.set || []) out.set.add(sig);
    for (const sig of b.blockingSet || []) out.blockingSet.add(sig);
    for (const [sig, meta] of b.metaBySig || []) if (!out.metaBySig.has(sig)) out.metaBySig.set(sig, meta);
    for (const [k, v] of Object.entries(b.counts || {})) out.counts[k] = asNumber(out.counts[k], 0) + asNumber(v, 0);
  }
  return out;
}

function computeCountsDelta(currentCounts = {}, prevCounts = {}) {
  const keys = [...new Set([...Object.keys(currentCounts || {}), ...Object.keys(prevCounts || {})])];
  const out = {};
  for (const k of keys) out[k] = asNumber(currentCounts[k], 0) - asNumber(prevCounts[k], 0);
  return out;
}

function summarizeDiff({ added, fixed, persisting, countsDelta, blockingAdded, blockingFixed }) {
  const deltaKeys = Object.keys(countsDelta || {}).slice(0, 4);
  const deltaText = deltaKeys.map(k => `${k} ${countsDelta[k] > 0 ? "+" : ""}${countsDelta[k]}`).join(", ");
  return `new=${added}, persisting=${persisting}, fixed=${fixed}, blocking +${blockingAdded}/-${blockingFixed}${deltaText ? ` • ${deltaText}` : ""}`;
}

function diffModeBundles(prevBundle, nextBundle) {
  const prevSet = prevBundle?.set || new Set();
  const nextSet = nextBundle?.set || new Set();
  const matchedPrev = new Set();
  const matchedNext = new Set();
  let persisting = 0;

  for (const sig of nextSet) {
    if (prevSet.has(sig)) {
      matchedPrev.add(sig);
      matchedNext.add(sig);
      persisting += 1;
    }
  }

  const prevWeakBuckets = new Map();
  for (const sig of prevSet) {
    if (matchedPrev.has(sig)) continue;
    const weak = prevBundle?.metaBySig?.get(sig)?.weakSignature;
    if (!weak) continue;
    if (!prevWeakBuckets.has(weak)) prevWeakBuckets.set(weak, []);
    prevWeakBuckets.get(weak).push(sig);
  }

  let weakMatched = 0;
  for (const sig of nextSet) {
    if (matchedNext.has(sig)) continue;
    const weak = nextBundle?.metaBySig?.get(sig)?.weakSignature;
    if (!weak) continue;
    const bucket = prevWeakBuckets.get(weak);
    if (!bucket || !bucket.length) continue;
    const prevSig = bucket.pop();
    matchedPrev.add(prevSig);
    matchedNext.add(sig);
    persisting += 1;
    weakMatched += 1;
  }

  let added = 0;
  for (const sig of nextSet) if (!matchedNext.has(sig)) added += 1;
  let fixed = 0;
  for (const sig of prevSet) if (!matchedPrev.has(sig)) fixed += 1;

  let blockingAdded = 0;
  let blockingFixed = 0;
  for (const sig of nextSet) if (!matchedNext.has(sig) && nextBundle.blockingSet.has(sig)) blockingAdded += 1;
  for (const sig of prevSet) if (!matchedPrev.has(sig) && prevBundle.blockingSet.has(sig)) blockingFixed += 1;
  const countsDelta = computeCountsDelta(nextBundle.counts, prevBundle.counts);
  return {
    added,
    fixed,
    persisting,
    weakMatched,
    blockingAdded,
    blockingFixed,
    countsDelta,
    text: summarizeDiff({ added, fixed, persisting, countsDelta, blockingAdded, blockingFixed }),
  };
}

function buildStepDiffs(step, prevStep, rawAppendix = null) {
  // Prefer stable diff when both steps have stableSignatures (v4+).
  const hasStable = step?.stableSignatures?.run && prevStep?.stableSignatures?.run;
  if (hasStable) {
    const stableRunDiff = computeStableDiff(
      prevStep.stableSignatures.run.stableFindingSignatureSet,
      step.stableSignatures.run.stableFindingSignatureSet
    );
    // Also compute blocking counts from stable blockingSets
    // (canonicalized so legacy-id signatures from old sessions still match)
    const prevBlocking = new Set(canonicalizeStableSignatureList(prevStep.stableSignatures.run.blockingSet));
    const currBlocking = new Set(canonicalizeStableSignatureList(step.stableSignatures.run.blockingSet));
    const currSigs = new Set(canonicalizeStableSignatureList(step.stableSignatures.run.stableFindingSignatureSet));
    const prevSigs = new Set(canonicalizeStableSignatureList(prevStep.stableSignatures.run.stableFindingSignatureSet));
    let blockingAdded = 0, blockingFixed = 0;
    for (const sig of currBlocking) if (!prevSigs.has(sig)) blockingAdded++;
    for (const sig of prevBlocking) if (!currSigs.has(sig)) blockingFixed++;
    stableRunDiff.blockingAdded = blockingAdded;
    stableRunDiff.blockingFixed = blockingFixed;

    const runCounts = step.stableSignatures.run.severityCounts || {};
    const prevRunCounts = prevStep.stableSignatures.run.severityCounts || {};
    const countsDelta = computeCountsDelta(runCounts, prevRunCounts);
    stableRunDiff.countsDelta = countsDelta;
    stableRunDiff.text = summarizeDiff(stableRunDiff);

    // Active diff (if both have stable active)
    let activeDiff;
    if (step?.stableSignatures?.active && prevStep?.stableSignatures?.active) {
      activeDiff = computeStableDiff(
        prevStep.stableSignatures.active.stableFindingSignatureSet,
        step.stableSignatures.active.stableFindingSignatureSet
      );
      const activeCounts = step.stableSignatures.active.severityCounts || {};
      const prevActiveCounts = prevStep.stableSignatures.active.severityCounts || {};
      activeDiff.countsDelta = computeCountsDelta(activeCounts, prevActiveCounts);
      activeDiff.text = summarizeDiff(activeDiff);
    }

    // Consolidated = run + active combined
    const allCurrSigs = [
      ...(step.stableSignatures.run?.stableFindingSignatureSet || []),
      ...(step.stableSignatures.active?.stableFindingSignatureSet || []),
    ];
    const allPrevSigs = [
      ...(prevStep.stableSignatures.run?.stableFindingSignatureSet || []),
      ...(prevStep.stableSignatures.active?.stableFindingSignatureSet || []),
    ];
    const consolidated = computeStableDiff(allPrevSigs, allCurrSigs);
    // Recompute blocking deltas from merged blocking sets (canonicalized)
    const allCurrBlocking = new Set([
      ...canonicalizeStableSignatureList(step.stableSignatures.run?.blockingSet),
      ...canonicalizeStableSignatureList(step.stableSignatures.active?.blockingSet),
    ]);
    const allPrevBlocking = new Set([
      ...canonicalizeStableSignatureList(prevStep.stableSignatures.run?.blockingSet),
      ...canonicalizeStableSignatureList(prevStep.stableSignatures.active?.blockingSet),
    ]);
    consolidated.blockingAdded = [...allCurrBlocking].filter(s => !allPrevBlocking.has(s)).length;
    consolidated.blockingFixed = [...allPrevBlocking].filter(s => !allCurrBlocking.has(s)).length;
    consolidated.countsDelta = countsDelta;
    consolidated.text = summarizeDiff(consolidated);

    return {
      run: step?.snapshots?.run ? stableRunDiff : undefined,
      active: activeDiff,
      consolidated,
    };
  }

  // Legacy fallback (v3 sessions without stableSignatures)
  const runNext = buildModeSignatureBundle(step?.snapshots?.run, rawAppendix);
  const runPrev = buildModeSignatureBundle(prevStep?.snapshots?.run, rawAppendix);
  const activeNext = buildModeSignatureBundle(step?.snapshots?.active, rawAppendix);
  const activePrev = (prevStep?.snapshots?.active?.mode && prevStep?.snapshots?.active?.mode === step?.snapshots?.active?.mode)
    ? buildModeSignatureBundle(prevStep?.snapshots?.active, rawAppendix)
    : { set: new Set(), blockingSet: new Set(), metaBySig: new Map(), counts: {} };
  const consolidatedNext = mergeSignatureBundles([runNext, activeNext]);
  const consolidatedPrev = mergeSignatureBundles([runPrev, activePrev]);
  return {
    run: step?.snapshots?.run ? diffModeBundles(runPrev, runNext) : undefined,
    active: step?.snapshots?.active ? diffModeBundles(activePrev, activeNext) : undefined,
    consolidated: diffModeBundles(consolidatedPrev, consolidatedNext),
  };
}

function severityWeight(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "high") return 3;
  if (s === "medium") return 2;
  return 1;
}

// --- Weighted accessibility score (Lighthouse-inspired impact curve) ---

/**
 * Severity weights used by computeWeightedScore. Deliberately steeper than
 * severityWeight() above (which only orders diff entries): a single
 * high-severity finding should visibly dent the score, while purely
 * informational findings never affect it.
 */
const SCORE_SEVERITY_WEIGHTS = { high: 10, medium: 3, low: 1, info: 0 };

/**
 * Compute a 0-100 weighted accessibility score from a findings list.
 *
 * Formula:
 *   weightedSum = sum of weight(severity)  with high=10, medium=3, low=1, info=0
 *   score = round(100 * (1 - min(1, weightedSum / (10 + weightedSum))))
 *
 * The ratio weightedSum / (10 + weightedSum) is a smooth, saturating impact
 * curve: the first findings hurt the most (one high-severity finding halves
 * the score), later findings have diminishing impact, and the score decays
 * asymptotically toward 0 while staying strictly bounded to [0, 100].
 * No findings -> 100. Deterministic and order-independent.
 *
 * "critical" is treated as "high" (heaviest weight); unknown severities
 * count as 0, like info.
 *
 * @param {Array} findings
 * @returns {{score: number, weights: {high: number, medium: number, low: number, info: number}}}
 */
function computeWeightedScore(findings) {
  const list = Array.isArray(findings) ? findings : [];
  let weightedSum = 0;
  for (const f of list) {
    const sev = String(f?.severity || "info").toLowerCase();
    const w = sev === "critical" ? SCORE_SEVERITY_WEIGHTS.high : SCORE_SEVERITY_WEIGHTS[sev];
    weightedSum += Number.isFinite(w) ? w : 0;
  }
  const raw = Math.round(100 * (1 - Math.min(1, weightedSum / (10 + weightedSum))));
  return {
    score: Math.max(0, Math.min(100, raw)),
    weights: { ...SCORE_SEVERITY_WEIGHTS },
  };
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

// --- Legacy rule-id alias layer (v6 rename: chat-specific → generic stateful-widget ids) ---

/**
 * Map of deprecated (legacy) rule ids → canonical rule ids.
 * New audit runs emit only the canonical ids; old persisted sessions and
 * baselines may still carry the legacy ids. Every signature computation and
 * signature-set comparison canonicalizes through this map so an old stored
 * finding/baseline entry matches the same finding emitted under its new id.
 * Keep in sync with the deprecated/replacedBy entries in wcag-coverage.js.
 */
const LEGACY_RULE_ALIASES = {
  CHAT_NEW_MESSAGE_NOT_ANNOUNCED: "LIVE_CONTENT_NOT_ANNOUNCED",
  CHAT_INPUT_LOSES_FOCUS_ON_UPDATE: "INPUT_LOSES_FOCUS_ON_UPDATE",
  CHAT_FEED_MISSING_ROLE: "LIVE_REGION_MISSING_ROLE",
  CHAT_MESSAGE_NOT_ITEMIZED: "LIVE_ITEM_NOT_ITEMIZED",
};

/**
 * Canonicalize a rule type: map a legacy id to its current id, else return
 * the input unchanged. Case-insensitive lookup; the result preserves the
 * input's case convention (all-lowercase in → lowercase out) because
 * signature tokens are stored lowercase while findings carry uppercase ids.
 */
function canonicalizeRuleType(type) {
  const t = String(type || "");
  if (!t) return t;
  const canonical = LEGACY_RULE_ALIASES[t.toUpperCase()];
  if (!canonical) return t;
  return t === t.toLowerCase() ? canonical.toLowerCase() : canonical;
}

/**
 * Canonicalize a stored stable finding signature string
 * (`mode|type|wcag|severity|hash`) by rewriting a legacy type token to its
 * canonical id. Non-finding signatures (contrast/tabwalk/watch — 4 tokens)
 * and unrecognized strings are returned unchanged.
 */
function canonicalizeStableSignature(sig) {
  const s = String(sig || "");
  const parts = s.split("|");
  if (parts.length !== 5) return s;
  const canonicalType = canonicalizeRuleType(parts[1]);
  if (canonicalType === parts[1]) return s;
  parts[1] = canonicalType;
  return parts.join("|");
}

/** Canonicalize a list of stable signatures (tolerates non-arrays). */
function canonicalizeStableSignatureList(list) {
  return (Array.isArray(list) ? list : []).map(canonicalizeStableSignature);
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
 *
 * The rule type is canonicalized through LEGACY_RULE_ALIASES first, so a
 * finding persisted under a deprecated id hashes identically to the same
 * finding emitted under its renamed id.
 */
function buildStableSignature(finding, frameKeyStable, mode = "run") {
  const typeNorm = normalizeIdentityText(canonicalizeRuleType(finding?.type), 40);
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
 * Both sides are canonicalized through LEGACY_RULE_ALIASES so a step/baseline
 * stored with legacy rule ids diffs cleanly against a new run.
 */
function computeStableDiff(prevSignatures, currSignatures) {
  const prevSet = new Set(canonicalizeStableSignatureList(prevSignatures));
  const currSet = new Set(canonicalizeStableSignatureList(currSignatures));

  let added = 0, fixed = 0, persisting = 0;
  let blockingAdded = 0, blockingFixed = 0;

  for (const sig of currSet) {
    if (prevSet.has(sig)) persisting++;
    else added++;
  }
  for (const sig of prevSet) {
    if (!currSet.has(sig)) fixed++;
  }

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
      stableRun?.stableFindingSignatureSet || []
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

// --- Component rollup (group findings by repeated component pattern) ---

/**
 * Severity weight for component rollup ordering.
 * Unlike severityWeight(), knows about "critical" and ranks "info" below "low".
 */
function componentSeverityWeight(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "critical") return 4;
  if (s === "high") return 3;
  if (s === "medium") return 2;
  if (s === "low") return 1;
  return 0;
}

/**
 * Derive a component key from a finding's selector path by stripping
 * positional discriminators, so repeated instances of the same component
 * collapse into one group. Mirrors normalizePathForSig's treatment of
 * volatile path segments (nth-child indices, long hex ids, numeric ids),
 * and additionally strips :nth-of-type(n), [data-index] attributes and
 * trailing numeric indices in id/class tokens.
 */
function componentKeyFromPath(path) {
  const normalized = normalizeWs(path, 220)
    .replace(/:nth-child\(\d+\)/g, "")
    .replace(/:nth-of-type\(\d+\)/g, "")
    .replace(/\[data-index(?:=(?:"[^"]*"|'[^']*'|[^\]]*))?\]/g, "")
    .replace(/\b[0-9a-f]{8,}\b/gi, "#")
    .replace(/\b\d{2,}\b/g, "#")
    .replace(/-\d+\b/g, "-#")
    .replace(/\d+\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized || "path:none";
}

/**
 * Group findings by component: (type + normalized selector pattern).
 * Repeated instances of the same component (e.g. list rows differing only by
 * :nth-child index) collapse into a single group.
 *
 * @param {Array} findings
 * @returns {Array<{componentKey: string, type: string, severity: string,
 *   count: number, sample: object, findings: Array}>}
 *   sorted by max severity desc, then count desc, then componentKey asc.
 */
function groupFindingsByComponent(findings) {
  const list = Array.isArray(findings) ? findings : [];
  const groups = new Map();
  for (const f of list) {
    if (!f || typeof f !== "object") continue;
    const type = String(f.type || "unknown");
    const componentKey = `${type}::${componentKeyFromPath(f.path)}`;
    let g = groups.get(componentKey);
    if (!g) {
      g = {
        componentKey,
        type,
        severity: String(f.severity || "info"),
        count: 0,
        sample: f,
        findings: [],
      };
      groups.set(componentKey, g);
    }
    g.count += 1;
    g.findings.push(f);
    if (componentSeverityWeight(f.severity) > componentSeverityWeight(g.severity)) {
      g.severity = String(f.severity || "info");
    }
  }
  return [...groups.values()].sort((a, b) =>
    (componentSeverityWeight(b.severity) - componentSeverityWeight(a.severity))
    || (b.count - a.count)
    || a.componentKey.localeCompare(b.componentKey)
  );
}

function diffSnapshots(prev, next) {
  if (!prev || !next) return { text: "(no previous)" };
  const prevSet = new Set(prev.findingHashes || []);
  const nextSet = new Set(next.findingHashes || []);

  let added = 0;
  let removed = 0;
  for (const h of nextSet) if (!prevSet.has(h)) added++;
  for (const h of prevSet) if (!nextSet.has(h)) removed++;

  const cPrev = prev.counts || { high:0, medium:0, low:0, info:0 };
  const cNext = next.counts || { high:0, medium:0, low:0, info:0 };

  const d = (k) => (cNext[k] || 0) - (cPrev[k] || 0);
  const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);
  const text = `added=${added}, fixed=${removed} • high ${fmt(d("high"))}, medium ${fmt(d("medium"))}, low ${fmt(d("low"))}, info ${fmt(d("info"))}`;
  return { added, removed, text };
}

// ---- A11y outline diff (screen-reader view changes between flow steps) ----

const MAX_A11Y_OUTLINE_DIFF_ENTRIES = 50;

/**
 * Normalize one outline node — accepts both the compact stored form
 * ({r, n, l, h}) and the full snippet form ({role, name, level, pathHash}).
 */
function a11yOutlineNodeParts(node) {
  const r = String(node?.r ?? node?.role ?? "").slice(0, 60);
  const n = String(node?.n ?? node?.name ?? "").slice(0, 60);
  const lRaw = Number(node?.l ?? node?.level ?? 0);
  const l = Number.isFinite(lRaw) ? lRaw : 0;
  return { r, n, l };
}

/**
 * Multiset diff of two a11y outlines, keyed by (role|name|level) with counts —
 * order-independent, so pure reordering of identical nodes produces no diff.
 * Two identical buttons appearing → one added entry with count 2.
 *
 * @param {Array} prevNodes - previous step outline nodes (compact or full form)
 * @param {Array} currNodes - current step outline nodes
 * @returns {{added: Array<{r: string, n: string, l: number, count: number}>,
 *   removed: Array<{r: string, n: string, l: number, count: number}>,
 *   addedCount: number, removedCount: number}}
 *   added/removed lists capped at 50 entries each; the *Count totals are uncapped.
 */
function diffA11yOutlines(prevNodes, currNodes) {
  const toMultiset = (list) => {
    const m = new Map();
    for (const node of (Array.isArray(list) ? list : [])) {
      if (!node || typeof node !== "object") continue;
      const p = a11yOutlineNodeParts(node);
      const key = `${p.r}|${p.n}|${p.l}`;
      const entry = m.get(key);
      if (entry) entry.count += 1;
      else m.set(key, { r: p.r, n: p.n, l: p.l, count: 1 });
    }
    return m;
  };

  const prev = toMultiset(prevNodes);
  const curr = toMultiset(currNodes);

  const added = [];
  const removed = [];
  let addedCount = 0;
  let removedCount = 0;

  for (const [key, entry] of curr) {
    const before = prev.get(key)?.count || 0;
    const delta = entry.count - before;
    if (delta > 0) {
      addedCount += delta;
      if (added.length < MAX_A11Y_OUTLINE_DIFF_ENTRIES) {
        added.push({ r: entry.r, n: entry.n, l: entry.l, count: delta });
      }
    }
  }
  for (const [key, entry] of prev) {
    const after = curr.get(key)?.count || 0;
    const delta = entry.count - after;
    if (delta > 0) {
      removedCount += delta;
      if (removed.length < MAX_A11Y_OUTLINE_DIFF_ENTRIES) {
        removed.push({ r: entry.r, n: entry.n, l: entry.l, count: delta });
      }
    }
  }

  return { added, removed, addedCount, removedCount };
}

// ---- Guided checks (wizard) — pure finding builder ----

/**
 * Build a finding from one guided-check answer. Pure and unit-testable —
 * panel.js merges the returned findings into the run explorer view.
 *
 * kind "images":
 *   answer "no"         → GUIDED_IMG_NAME_POOR (medium / strict / 1.1.1)
 *   answer "decorative" → GUIDED_IMG_DECORATIVE_NAMED (low / strict / 1.1.1),
 *                         only when the candidate has a non-empty accessible name
 * kind "controls":
 *   answer "no"         → GUIDED_CONTROL_LABEL_VAGUE (medium / strict / 2.4.4)
 *
 * Every other (kind, answer) combination returns null (no finding).
 * Candidate fields are copied as plain strings — escaping happens at the
 * render boundary (escapeHtml/cellHtml), exactly like audit findings.
 *
 * @param {string} kind - "images" | "controls"
 * @param {string} answer - "yes" | "no" | "decorative"
 * @param {{name?: string, path?: string, extra?: {tag?: string, role?: string}}} candidate
 * @returns {object|null} finding in the audit-finding shape, or null
 */
function buildGuidedFinding(kind, answer, candidate) {
  const c = candidate && typeof candidate === "object" ? candidate : {};
  const name = typeof c.name === "string" ? c.name : "";
  const cExtra = c.extra && typeof c.extra === "object" ? c.extra : {};
  const base = {
    severity: "medium",
    wcag: null,
    level: "A",
    confidence: "strict",
    product: null,
    name: name || null,
    role: typeof cExtra.role === "string" ? cExtra.role : null,
    tag: typeof cExtra.tag === "string" ? cExtra.tag : null,
    testId: null,
    path: typeof c.path === "string" ? c.path : null,
    note: null,
    extra: { guided: true, kind: String(kind || ""), answer: String(answer || "") },
    fix: null,
  };
  if (kind === "images") {
    if (answer === "no") {
      return Object.assign({}, base, {
        type: "GUIDED_IMG_NAME_POOR",
        wcag: "1.1.1",
        note: "Guided check: reviewer judged that the accessible name does not convey the image's purpose.",
      });
    }
    if (answer === "decorative" && name.trim()) {
      return Object.assign({}, base, {
        type: "GUIDED_IMG_DECORATIVE_NAMED",
        severity: "low",
        wcag: "1.1.1",
        note: 'Guided check: image is decorative but exposes a non-empty accessible name. Use alt="" (or role="presentation") so assistive tech skips it.',
      });
    }
    return null;
  }
  if (kind === "controls") {
    if (answer === "no") {
      return Object.assign({}, base, {
        type: "GUIDED_CONTROL_LABEL_VAGUE",
        wcag: "2.4.4",
        note: "Guided check: out of context, this button/link label does not tell the user what will happen.",
      });
    }
    return null;
  }
  return null;
}
