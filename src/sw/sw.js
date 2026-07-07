const SNIPPET_FILE = "a11y-audit-snippet.js";
// Vendored dom-accessibility-api bundle (spec-order accessible-name engine).
// Injected BEFORE the snippet so window.__FlowLensAccName is available;
// the snippet falls back to its own heuristic if it is missing.
const ACCNAME_FILE = "accname.js";
// Vendored WAI-ARIA 1.2 role dataset (generated from aria-query).
// Injected BEFORE the snippet so window.__FlowLensAriaData is available;
// the snippet falls back to its hand-maintained ARIA tables if it is missing.
const ARIA_DATA_FILE = "aria-data.js";
const SESSION_SCHEMA_VERSION = 4;
const SESSION_SIGNATURE_VERSION = 2;
const EN_MAPPING_VERSION = 1;
const FRAME_KEY_VERSION = 1;
const DEBUG_SESSION = false;
const RUN_SEVERITY_WEIGHTS = { high: 5, medium: 3, low: 1, info: 0 };
const TAB_BLOCKING_EVENT_TYPES = new Set([
  "possible_focus_trap",
  "non_dialog_focus_trap",
  "roach_motel",
  "dialog_focus_not_trapped",
  "focus_on_body",
  "focus_failed",
]);
const MESSAGE_TYPES = new Set(["LIST_FRAMES", "HIGHLIGHT", "RUN_AUDIT", "CAPTURE_STEP", "SHOW_TAB_PATH", "APPLY_ASSIST", "GET_PAGE_STRUCTURE", "SHOW_STRUCTURE"]);
const MAX_TAB_PATH_EVENTS = 400;
// Assist toolbox kinds ("clear" removes the active assist mode).
// Mirrors ASSIST_KINDS in src/snippet/a11y-audit-snippet.js.
const ASSIST_KINDS = new Set(["textSpacing", "grayscale", "protanopia", "deuteranopia", "tritanopia", "achromatopsia", "clear"]);
// Page-structure overlay kinds ("clear" removes the overlay).
// Mirrors STRUCTURE_KINDS in src/snippet/a11y-audit-snippet.js.
const STRUCTURE_KINDS = new Set(["headings", "landmarks", "clear"]);
const AUDIT_ACTIONS = new Set(["run", "observe", "watch", "tabWalk", "contrast"]);
const WCAG_LEVELS = new Set(["2.1-AA", "2.1-AAA", "2.2-AA", "2.2-AAA"]);

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isNonNegativeInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0;
}

function isStringArray(value, maxItems = 100, maxLen = 256) {
  if (!Array.isArray(value) || value.length > maxItems) return false;
  return value.every(v => typeof v === "string" && v.length <= maxLen);
}

function validateIncomingMessage(msg, sender) {
  if (sender?.id !== chrome.runtime.id) return { ok: false, error: "UNAUTHORIZED_SENDER" };
  if (!isPlainObject(msg)) return { ok: false, error: "BAD_MESSAGE_SCHEMA" };
  if (!MESSAGE_TYPES.has(msg.type)) return { ok: false, error: "UNKNOWN_MESSAGE" };

  if ((msg.type === "LIST_FRAMES" || msg.type === "RUN_AUDIT" || msg.type === "CAPTURE_STEP" || msg.type === "HIGHLIGHT" || msg.type === "SHOW_TAB_PATH" || msg.type === "APPLY_ASSIST" || msg.type === "GET_PAGE_STRUCTURE" || msg.type === "SHOW_STRUCTURE")
      && !isNonNegativeInt(msg.tabId)) {
    return { ok: false, error: "BAD_TAB_ID" };
  }

  if (msg.type === "HIGHLIGHT") {
    if (!isNonNegativeInt(msg.frameId)) return { ok: false, error: "BAD_FRAME_ID" };
    if (msg.finding != null && !isPlainObject(msg.finding)) return { ok: false, error: "BAD_FINDING" };
  }

  if (msg.type === "SHOW_TAB_PATH") {
    if (!isNonNegativeInt(msg.frameId)) return { ok: false, error: "BAD_FRAME_ID" };
    if (msg.clear != null && typeof msg.clear !== "boolean") return { ok: false, error: "BAD_CLEAR" };
    if (msg.events != null) {
      if (!Array.isArray(msg.events) || msg.events.length > MAX_TAB_PATH_EVENTS) return { ok: false, error: "BAD_EVENTS" };
      if (!msg.events.every(isPlainObject)) return { ok: false, error: "BAD_EVENTS" };
    }
  }

  if (msg.type === "APPLY_ASSIST") {
    if (!isNonNegativeInt(msg.frameId)) return { ok: false, error: "BAD_FRAME_ID" };
    if (typeof msg.kind !== "string" || !ASSIST_KINDS.has(msg.kind)) return { ok: false, error: "BAD_KIND" };
  }

  if (msg.type === "GET_PAGE_STRUCTURE") {
    if (!isNonNegativeInt(msg.frameId)) return { ok: false, error: "BAD_FRAME_ID" };
  }

  if (msg.type === "SHOW_STRUCTURE") {
    if (!isNonNegativeInt(msg.frameId)) return { ok: false, error: "BAD_FRAME_ID" };
    if (typeof msg.kind !== "string" || !STRUCTURE_KINDS.has(msg.kind)) return { ok: false, error: "BAD_KIND" };
  }

  if (msg.type === "RUN_AUDIT") {
    if (!AUDIT_ACTIONS.has(msg.action)) return { ok: false, error: "BAD_ACTION" };
    if (msg.wcagLevel != null && !WCAG_LEVELS.has(String(msg.wcagLevel))) return { ok: false, error: "BAD_WCAG_LEVEL" };
    if (msg.target != null && !isPlainObject(msg.target)) return { ok: false, error: "BAD_TARGET" };
    if (msg.match != null && !isPlainObject(msg.match)) return { ok: false, error: "BAD_MATCH" };
    if (msg.modeHints != null && !isPlainObject(msg.modeHints)) return { ok: false, error: "BAD_MODE_HINTS" };
    if (msg.appMarkers != null && typeof msg.appMarkers !== "string") return { ok: false, error: "BAD_APP_MARKERS" };
    if (msg.rootSelector != null && typeof msg.rootSelector !== "string") return { ok: false, error: "BAD_ROOT_SELECTOR" };
    if (msg.match?.urlIncludes != null && !isStringArray(msg.match.urlIncludes, 80, 256)) return { ok: false, error: "BAD_MATCH_URLS" };
    if (msg.match?.domSelectorsAny != null && !isStringArray(msg.match.domSelectorsAny, 80, 256)) return { ok: false, error: "BAD_MATCH_SELECTORS" };
    if (msg.match?.urlExcludesAny != null && !isStringArray(msg.match.urlExcludesAny, 80, 256)) return { ok: false, error: "BAD_MATCH_URL_EXCLUDES" };
  }

  if (msg.type === "CAPTURE_STEP") {
    if (msg.wcagLevel != null && !WCAG_LEVELS.has(String(msg.wcagLevel))) return { ok: false, error: "BAD_WCAG_LEVEL" };
    if (msg.target != null && !isPlainObject(msg.target)) return { ok: false, error: "BAD_TARGET" };
    if (msg.match != null && !isPlainObject(msg.match)) return { ok: false, error: "BAD_MATCH" };
    if (msg.modeHints != null && !isPlainObject(msg.modeHints)) return { ok: false, error: "BAD_MODE_HINTS" };
    if (msg.appMarkers != null && typeof msg.appMarkers !== "string") return { ok: false, error: "BAD_APP_MARKERS" };
    if (msg.activeMode != null && !AUDIT_ACTIONS.has(String(msg.activeMode))) return { ok: false, error: "BAD_ACTIVE_MODE" };
    if (msg.rootSelector != null && typeof msg.rootSelector !== "string") return { ok: false, error: "BAD_ROOT_SELECTOR" };
    if (msg.match?.urlIncludes != null && !isStringArray(msg.match.urlIncludes, 80, 256)) return { ok: false, error: "BAD_MATCH_URLS" };
    if (msg.match?.domSelectorsAny != null && !isStringArray(msg.match.domSelectorsAny, 80, 256)) return { ok: false, error: "BAD_MATCH_SELECTORS" };
    if (msg.match?.urlExcludesAny != null && !isStringArray(msg.match.urlExcludesAny, 80, 256)) return { ok: false, error: "BAD_MATCH_URL_EXCLUDES" };
  }

  return { ok: true };
}

function sanitizeWcagLevel(level) {
  const v = String(level || "2.1-AA");
  return WCAG_LEVELS.has(v) ? v : "2.1-AA";
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeOrigin(url, fallback = "about:blank") {
  try {
    const origin = new URL(url).origin;
    if (!origin || origin === "null") return fallback;
    return origin || fallback;
  } catch {
    return fallback;
  }
}

function normalizePathSegment(seg) {
  const s = String(seg || "").toLowerCase().trim();
  if (!s) return "";
  if (/^[0-9]+$/.test(s)) return "_id";
  if (/^[0-9a-f]{8,}$/i.test(s)) return "_id";
  if (/^[0-9a-f]{4,}-[0-9a-f-]{8,}$/i.test(s)) return "_id";
  return s.slice(0, 36);
}

function stablePathHint(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").map(normalizePathSegment).filter(Boolean).slice(0, 2);
    return segs.length ? segs.join("/") : "root";
  } catch {
    return "root";
  }
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

// ── Cross-frame integrity merge + C4 evaluators (inlined from engine) ────────

function mergeFrameIntegrity(frameSummaries) {
  const frames = Array.isArray(frameSummaries) ? frameSummaries : [];

  let feedFrameId = null;
  let feedLocatorHash = null;
  let bestMessageCount = -1;
  let composerFrameId = null;
  let composerLocatorHash = null;
  const liveFrameIds = [];
  let hasLinkage = false;
  let sharedRootMarker = false;
  let totalMessageCount = 0;
  let totalAnnounceEvents = 0;
  let totalMessageCountDelta = 0;
  let totalAnnounceEventsDelta = 0;

  for (const f of frames) {
    const sums = Array.isArray(f.summaries) ? f.summaries : [];
    if (sums.length === 0) continue;

    const last = sums[sums.length - 1];
    const secondLast = sums.length >= 2 ? sums[sums.length - 2] : null;

    // Per-frame deltas
    const msgDelta = secondLast != null
      ? (last.messageCount || 0) - (secondLast.messageCount || 0)
      : 0;
    const annDelta = secondLast != null
      ? (last.observedAnnounceEvents || 0) - (secondLast.observedAnnounceEvents || 0)
      : 0;

    totalMessageCountDelta += msgDelta;
    totalAnnounceEventsDelta += annDelta;

    // Feed frame: highest messageCount with feedLocatorHash
    if (last.feedLocatorHash && (last.messageCount || 0) > bestMessageCount) {
      bestMessageCount = last.messageCount || 0;
      feedFrameId = f.frameId;
      feedLocatorHash = last.feedLocatorHash;
    }

    totalMessageCount += last.messageCount || 0;
    totalAnnounceEvents += last.observedAnnounceEvents || 0;

    // Composer frame
    if (last.composerLocatorHash && composerFrameId == null) {
      composerFrameId = f.frameId;
      composerLocatorHash = last.composerLocatorHash;
    }

    // Live region frames
    if ((last.liveRegionCount || 0) > 0) {
      liveFrameIds.push(f.frameId);
    }

    // Linkage (OR across frames)
    if (last.hasLinkage) hasLinkage = true;
    if (last.sharedRootMarker) sharedRootMarker = true;
  }

  return {
    feedFrameId,
    composerFrameId,
    liveFrameIds,
    feedLocatorHash,
    composerLocatorHash,
    hasLinkage,
    sharedRootMarker,
    messageCount: totalMessageCount,
    observedAnnounceEvents: totalAnnounceEvents,
    messageCountDelta: totalMessageCountDelta,
    announceEventsDelta: totalAnnounceEventsDelta,
  };
}

function evaluateC4_1(integrity, opts) {
  const o = opts || {};
  const emittedSet = o.emittedSet || null;
  const i = integrity || {};

  // Transition gating
  if ((i.messageCountDelta || 0) < 1 && (i.announceEventsDelta || 0) < 1) return null;

  if (i.feedFrameId == null) return null;
  if (!Array.isArray(i.liveFrameIds) || i.liveFrameIds.length === 0) return null;
  if ((i.messageCount || 0) < 1) return null;

  // Check split: no overlap between liveFrameIds and feedFrameId
  const hasOverlap = i.liveFrameIds.some(id => id === i.feedFrameId);
  if (hasOverlap) return null;

  // Dedup
  const sortedLive = [...i.liveFrameIds].sort();
  const dedupKey = "C4.1:" + i.feedFrameId + ":" + sortedLive.join(",");

  if (emittedSet) {
    if (emittedSet.has(dedupKey)) return null;
    let count = 0;
    for (const k of emittedSet) { if (k.startsWith("C4.1:")) count++; }
    if (count >= 3) return null;
    emittedSet.add(dedupKey);
  }

  return {
    type: "ANNOUNCEMENT_IN_DIFFERENT_FRAME",
    severity: "medium",
    wcag: "4.1.3",
    confidence: "heuristic",
    note: "Live region announcements detected in a different frame than the chat feed.",
    el: null,
  };
}

function evaluateC4_2(integrity, opts) {
  const o = opts || {};
  const emittedSet = o.emittedSet || null;
  const i = integrity || {};

  if (i.composerFrameId == null) return null;
  if (i.feedFrameId == null) return null;
  if (i.composerFrameId === i.feedFrameId) return null;
  if (i.hasLinkage) return null;

  // Dedup
  const dedupKey = "C4.2:" + i.feedFrameId + ":" + i.composerFrameId;

  if (emittedSet) {
    if (emittedSet.has(dedupKey)) return null;
    let count = 0;
    for (const k of emittedSet) { if (k.startsWith("C4.2:")) count++; }
    if (count >= 3) return null;
    emittedSet.add(dedupKey);
  }

  return {
    type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE",
    severity: "medium",
    wcag: "1.3.1",
    confidence: "heuristic",
    note: "Composer and chat feed are in different frames without ARIA linkage (aria-controls, aria-describedby, aria-owns).",
    el: null,
  };
}

function debugSession(...args) {
  if (!DEBUG_SESSION) return;
  console.debug("[FlowLensSession/SW]", ...args);
}

function deriveFrameKey(frameUrl, parentOrigin, matchHits = {}) {
  // FrameKey v2: stable identity uses only URL-derived signals (no marker hash).
  // markerHash is kept as a separate signals hash for diagnostics.
  const frameOrigin = safeOrigin(frameUrl, "");
  const origin = frameOrigin || parentOrigin || "about:blank";
  const pathHint = stablePathHint(frameUrl);
  const markerKeys = Object.keys(matchHits || {})
    .sort()
    .slice(0, 64);
  const markerSig = markerKeys
    .map(k => `${k}:${matchHits[k] ? 1 : 0}`)
    .join("|");
  const markerHash8 = fnv1aHash8(markerSig || "no-markers");
  // frameKeyStable: identity key — does NOT include marker hash, so it stays the same
  // when only markerHits toggle between audit steps.
  const frameKeyStable = `fk::v${FRAME_KEY_VERSION}::${origin}::${pathHint}`;
  // frameSignalsHash: diagnostic — tracks marker signal changes.
  const frameSignalsHash = markerHash8;
  // Legacy frameKey includes marker hash for backward compatibility.
  const frameKey = `${frameKeyStable}::${markerHash8}`;
  return { frameKey, frameKeyStable, frameSignalsHash };
}

function scoreRunResult(result) {
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  let score = 0;
  for (const f of findings) {
    const sev = f?.severity || "info";
    if (sev in counts) counts[sev] += 1;
    score += RUN_SEVERITY_WEIGHTS[sev] ?? 0;
  }
  return {
    blockingCount: counts.high + counts.medium,
    summaryScore: score,
    primaryCounts: { findings: findings.length, ...counts },
  };
}

function scoreContrastResult(result) {
  const failures = Array.isArray(result?.failures) ? result.failures : [];
  const failuresCount = asNumber(result?.failuresCount, failures.length);
  return {
    blockingCount: failuresCount,
    summaryScore: failuresCount,
    primaryCounts: { failures: failuresCount, scanned: asNumber(result?.scanned, 0) },
  };
}

function scoreTabWalkResult(result) {
  const events = Array.isArray(result?.events) ? result.events : [];
  const blockingEvents = events.filter(e => TAB_BLOCKING_EVENT_TYPES.has(e?.type)).length;
  return {
    blockingCount: blockingEvents,
    summaryScore: events.length + (blockingEvents * 5),
    primaryCounts: { events: events.length, blockingEvents, walked: asNumber(result?.walked, 0) },
  };
}

function scoreWatchLikeResult(result) {
  const verdicts = Array.isArray(result?.verdicts) ? result.verdicts : [];
  const focusLossCount = asNumber(result?.focusLossCount, 0);
  const bursts = asNumber(result?.bursts, 0);
  const totalLoadingMs = asNumber(result?.totalLoadingMs, 0);
  const summaryScore = (focusLossCount * 5) + bursts + (totalLoadingMs / 1000);
  return {
    blockingCount: verdicts.length + focusLossCount,
    summaryScore: summaryScore + (verdicts.length ? 50 : 0),
    primaryCounts: { verdicts: verdicts.length, focusLossCount, bursts, totalLoadingMs, announcementCount: asNumber(result?.announcementCount, 0), emptyAnnouncements: asNumber(result?.emptyAnnouncementCount, 0) },
  };
}

function scoreObserveResult(result) {
  const snapshots = Array.isArray(result?.snapshots) ? result.snapshots : [];
  const findings = Array.isArray(result?.findings) ? result.findings : [];
  const verdicts = Array.isArray(result?.verdicts) ? result.verdicts : [];
  const peak = snapshots.reduce((m, s) => Math.max(m, asNumber(s?.count, 0)), 0);
  let jumps = 0;
  for (let i = 1; i < snapshots.length; i++) {
    if (asNumber(snapshots[i]?.count, 0) > asNumber(snapshots[i - 1]?.count, 0)) jumps += 1;
  }
  return {
    blockingCount: verdicts.length + jumps,
    summaryScore: peak + jumps + (findings.length / 10) + (verdicts.length ? 50 : 0),
    primaryCounts: { snapshots: snapshots.length, findings: findings.length, verdicts: verdicts.length, jumps },
  };
}

function normalizeAuditResult(action, result) {
  const type = action || result?.mode || "unknown";
  if (!result || typeof result !== "object") {
    return { type, blockingCount: 0, summaryScore: 0, primaryCounts: {}, raw: result };
  }
  let scored;
  if (action === "run") scored = scoreRunResult(result);
  else if (action === "contrast") scored = scoreContrastResult(result);
  else if (action === "tabWalk") scored = scoreTabWalkResult(result);
  else if (action === "watch") scored = scoreWatchLikeResult(result);
  else if (action === "observe") scored = scoreObserveResult(result);
  else scored = { blockingCount: 0, summaryScore: 0, primaryCounts: {} };
  return { type, ...scored, raw: result };
}

const FRAME_SCOPE = Object.freeze({
  PRIMARY: "primary",
  HOST: "host",
  EMBEDDED: "embedded",
  ALL: "all",
});

function normalizeFrameScope(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === FRAME_SCOPE.PRIMARY || v === "primary-frame") return FRAME_SCOPE.PRIMARY;
  if (v === FRAME_SCOPE.HOST || v === "host-only" || v === "top-only" || v === "top") return FRAME_SCOPE.HOST;
  if (v === FRAME_SCOPE.EMBEDDED || v === "iframe-only" || v === "iframe") return FRAME_SCOPE.EMBEDDED;
  if (v === FRAME_SCOPE.ALL || v === "all-frames") return FRAME_SCOPE.ALL;
  return null;
}

function normalizeScopeAndCompatibility(target) {
  const explicitScope = normalizeFrameScope(target?.scope);
  if (explicitScope) {
    return {
      scope: explicitScope,
      compatibilityMode: false,
      legacyMode: null,
      reason: "explicit_scope",
    };
  }

  const legacyMode = String(target?.mode || "").toLowerCase();
  if (legacyMode === "top") {
    return { scope: FRAME_SCOPE.HOST, compatibilityMode: true, legacyMode, reason: "legacy_top" };
  }
  if (legacyMode === "all") {
    return { scope: FRAME_SCOPE.ALL, compatibilityMode: true, legacyMode, reason: "legacy_all" };
  }
  if (legacyMode === "manual") {
    return { scope: FRAME_SCOPE.PRIMARY, compatibilityMode: true, legacyMode, reason: "legacy_manual" };
  }
  if (legacyMode === "auto") {
    // Preserve legacy fan-out behavior only when scope is absent (old panel/runtime compatibility).
    return { scope: FRAME_SCOPE.PRIMARY, compatibilityMode: true, legacyMode, reason: "legacy_auto" };
  }

  // New default behavior when payload does not define scope/mode explicitly.
  return {
    scope: FRAME_SCOPE.PRIMARY,
    compatibilityMode: false,
    legacyMode: null,
    reason: "default_primary",
  };
}

function normalizeFrameIds(ids) {
  if (!Array.isArray(ids)) return [];
  const out = [];
  for (const id of ids) {
    const n = Number(id);
    if (!Number.isFinite(n)) continue;
    out.push(n);
  }
  return [...new Set(out)];
}

function getManualFrameIdsFromTarget(target) {
  const a = normalizeFrameIds(target?.frameIds);
  const b = normalizeFrameIds(target?.manualFrameIds);
  return [...new Set([...a, ...b])];
}

function hasManualOverride(target, normalized) {
  if (normalized?.legacyMode === "manual") return true;
  if (target?.manual === true) return true;
  if (target?.pinned === true) return true;
  return getManualFrameIdsFromTarget(target).length > 0;
}

function makeTargetResolution({
  ok = true,
  frameIds = [],
  scope = FRAME_SCOPE.PRIMARY,
  selectionReason = "unknown",
  error = null,
  compatibilityMode = false,
  compatibilityReason = null,
  excludedFrameCount = 0,
}) {
  return {
    ok: !!ok,
    frameIds: normalizeFrameIds(frameIds),
    scope,
    selectionReason,
    error,
    compatibilityMode,
    compatibilityReason,
    excludedFrameCount,
  };
}

function sortByScoreThenFrameId(scored = []) {
  return [...scored].sort((a, b) => (b.score - a.score) || (a.frameId - b.frameId));
}

function chooseBestEntry({ action, perFrame, target, probeByFrameId }) {
  const frames = Array.isArray(perFrame) ? perFrame : [];
  if (!frames.length) return { entry: null, reason: "no_frames" };

  // Strict manual override: if manual frameIds exist, restrict scope entirely.
  const manualFrameIds = getManualFrameIdsFromTarget(target);
  if (manualFrameIds.length > 0) {
    const manualSet = new Set(manualFrameIds);
    const manualFrames = frames.filter(x => manualSet.has(x.frameId));
    const okManual = manualFrames.filter(x => x?.ok === true);
    if (okManual.length) return { entry: okManual[0], reason: "manual_pinned_override" };
    // Manual frames exist in perFrame but none ok — still prefer them over fallback.
    if (manualFrames.length) return { entry: manualFrames[0], reason: "manual_pinned_override" };
    // Manual frames not present at all — do NOT silently fallback.
    return { entry: null, reason: "manual_frames_missing" };
  }

  const okFrames = frames.filter(x => x?.ok === true);
  if (!okFrames.length) {
    return { entry: (frames.find(x => x.frameId === 0) || frames[0] || null), reason: "no_ok_frames_fallback" };
  }

  const scored = okFrames.map(entry => {
    const normalized = entry.normalized || normalizeAuditResult(action, entry.result);
    return { entry, score: asNumber(normalized.summaryScore, 0), blocking: asNumber(normalized.blockingCount, 0) };
  });

  const positive = scored.filter(x => x.score > 0);
  if (positive.length) {
    positive.sort((a, b) => (b.score - a.score) || (b.blocking - a.blocking));
    return { entry: positive[0].entry, reason: "scored_best" };
  }

  // Score==0 fallback: use probe heuristics if available.
  // Ranking is intentionally generic: an explicit active-profile marker hit is
  // the strongest signal; otherwise rank by content richness (landmarks,
  // articles, live widgets, non-shell). A chat-looking frame must NOT
  // dominate — on ordinary pages a third-party widget iframe (consent
  // manager, support bubble) would otherwise steal the audit from the
  // user's actual content. Ties break toward the host page (lower frameId).
  if (probeByFrameId instanceof Map && probeByFrameId.size > 0) {
    const probeRanked = okFrames
      .map(entry => {
        const probe = probeByFrameId.get(entry.frameId) || {};
        let rank = 0;
        const anyMarkerHit = Object.values(probe.markerHits || {}).some(v => v);
        if (anyMarkerHit) rank += 10;
        if (probe.hasHelpRoot) rank += 4;
        if (probe.hasArticle) rank += 2;
        if (probe.hasChat) rank += 2;
        if (probe.hasTree) rank += 1;
        if (!probe.looksShell) rank += 1;
        return { entry, rank };
      })
      .filter(x => x.rank > 0)
      .sort((a, b) => (b.rank - a.rank) || (a.entry.frameId - b.entry.frameId));
    if (probeRanked.length) {
      return { entry: probeRanked[0].entry, reason: "score_zero_probe_heuristic" };
    }
  }

  // Deterministic fallback to top frame.
  return { entry: (frames.find(x => x.frameId === 0) || okFrames[0] || frames[0] || null), reason: "score_zero_fallback_top" };
}

function compactFramePayload(frameEntry) {
  const normalized = frameEntry?.normalized && typeof frameEntry.normalized === "object"
    ? (() => {
      const { raw: _raw, ...rest } = frameEntry.normalized;
      return rest;
    })()
    : null;
  return {
    frameId: frameEntry?.frameId,
    frameUrl: frameEntry?.frameUrl || "",
    frameKey: frameEntry?.frameKey || null,
    frameKeyStable: frameEntry?.frameKeyStable || null,
    frameSignalsHash: frameEntry?.frameSignalsHash || null,
    ok: !!frameEntry?.ok,
    reason: frameEntry?.reason || null,
    error: frameEntry?.error || null,
    normalized,
  };
}

async function collectFrameProbeData({ tabId, frames, match }) {
  const selectors = Array.isArray(match?.domSelectorsAny) ? match.domSelectorsAny : [];
  const byFrameId = new Map();
  for (const f of frames || []) byFrameId.set(f.frameId, { frameId: f.frameId, markerHits: {}, hasHelpRoot: false, hasTree: false, hasChat: false, hasArticle: false, looksShell: false });

  try {
    const probe = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: (selectors) => {
        const out = {
          markerHits: {},
          hasHelpRoot: false,
          hasTree: false,
          hasChat: false,
          hasArticle: false,
          looksShell: false,
        };
        try {
          const list = Array.isArray(selectors) ? selectors.slice(0, 40) : [];
          for (const sel of list) {
            try { out.markerHits[sel] = !!document.querySelector(sel); } catch { out.markerHits[sel] = false; }
          }
          out.hasHelpRoot = !!document.querySelector("[role='main'],main article,[role='navigation'][aria-label]");
          out.hasTree = !!document.querySelector("[role='tree'],[role='treeitem']");
          out.hasChat = !!document.querySelector("[role='log'],[role='feed']");
          out.hasArticle = !!document.querySelector("article,[role='article']");
          const focusables = document.querySelectorAll("button,a[href],input,select,textarea,[tabindex]:not([tabindex='-1'])").length;
          const landmarks = document.querySelectorAll("main,[role='main'],nav,[role='navigation'],header,[role='banner'],footer,[role='contentinfo']").length;
          out.looksShell = focusables <= 8 && landmarks <= 2 && !out.hasArticle && !out.hasChat;
        } catch {
          // keep defaults
        }
        return out;
      },
      args: [selectors]
    });
    for (const p of probe || []) {
      byFrameId.set(p.frameId, {
        frameId: p.frameId,
        ...(p.result || {}),
      });
    }
  } catch {
    // best-effort only; frameKey still derived from URL.
  }
  return byFrameId;
}

async function execAuditActionInFrame({ tabId, frameId, action, alsoConsole, wcagLevel, modeHints, appMarkers, rootSelector }) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE],
      world: "MAIN"
    });
  } catch (e) {
    return { frameId, result: { ok: false, reason: "INJECT_FAILED", error: String(e?.message || e) } };
  }

  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: "MAIN",
      func: async (action, alsoConsole, wcagLevel, modeHints, appMarkers, rootSelector) => {
        const api = window.A11YFlowAudit;
        if (!api) return { ok: false, reason: "NO_API" };

        const runCfg = { strict: true, wcagLevel };
        if (modeHints) runCfg.modeHints = modeHints;
        if (appMarkers) runCfg.appMarkers = appMarkers;
        if (rootSelector) runCfg.rootSelector = rootSelector;

        const res = await (async () => {
          if (action === "run") return api.run?.(runCfg);
          if (action === "observe") return api.observe?.({ seconds: 12, runConfig: runCfg });
          if (action === "watch") return api.watch?.({ seconds: 40 });
          if (action === "tabWalk") return api.tabWalk?.({ steps: 80 });
          if (action === "contrast") return api.contrastScan?.({ limit: 250, wcagLevel });
          return null;
        })();

        if (!res) return { ok: false, reason: "UNKNOWN_ACTION", action };
        if (alsoConsole) {
          try { console.log(`[A11YFlowAudit] ${action} result`, res); } catch {}
        }
        return { ok: true, result: res };
      },
      args: [action, !!alsoConsole, wcagLevel || "2.1-AA", modeHints || null, appMarkers || null, rootSelector || null]
    });
    return (r && r[0]) ? r[0] : { frameId, result: { ok: false, reason: "NO_RESULT" } };
  } catch (e) {
    return { frameId, result: { ok: false, reason: "EXEC_FAILED", error: String(e?.message || e) } };
  }
}

async function executeAuditAcrossFrames({
  tabId,
  action,
  target,
  match,
  modeHints,
  appMarkers,
  rootSelector,
  alsoConsole,
  wcagLevel,
  frames,
  finalTarget,
  frameProbeById,
}) {
  const allFrames = Array.isArray(frames) ? frames : await chrome.webNavigation.getAllFrames({ tabId });
  const frameUrlById = new Map((allFrames || []).map(f => [f.frameId, f.url || ""]));
  const parentOriginByFrameId = new Map();
  for (const f of allFrames || []) {
    const parent = (allFrames || []).find(x => x.frameId === f.parentFrameId);
    parentOriginByFrameId.set(f.frameId, safeOrigin(parent?.url || "", safeOrigin(f.url || "", "about:blank")));
  }

  const resolved = finalTarget && typeof finalTarget === "object"
    ? finalTarget
    : await resolveTargetFrameIds({ tabId, target, frames: allFrames, match });
  const usedFrameIds = normalizeFrameIds(resolved?.frameIds || []);
  const resolvedScope = resolved?.scope || FRAME_SCOPE.PRIMARY;
  const resolutionReason = resolved?.selectionReason || "unknown";
  if (!resolved?.ok || !usedFrameIds.length) {
    const resolvedError = resolved?.error || "NO_SCOPE_MATCH";
    return {
      ok: false,
      action,
      error: resolvedError,
      reason: resolvedError,
      schemaVersion: SESSION_SCHEMA_VERSION,
      signatureVersion: SESSION_SIGNATURE_VERSION,
      usedFrameIds: [],
      perFrame: [],
      bestEntry: null,
      selectionReason: resolutionReason,
      scope: resolvedScope,
      frameKeyVersion: FRAME_KEY_VERSION,
      frameKeyByFrameId: {},
      compatibilityMode: !!resolved?.compatibilityMode,
      compatibilityReason: resolved?.compatibilityReason || null,
      excludedFrameCount: resolved?.excludedFrameCount || 0,
    };
  }

  const probeByFrameId = frameProbeById instanceof Map ? frameProbeById : await collectFrameProbeData({ tabId, frames: allFrames, match });
  const execRes = [];
  for (const frameId of usedFrameIds) {
    // Deterministic sequential execution per frame.
    execRes.push(await execAuditActionInFrame({ tabId, frameId, action, alsoConsole, wcagLevel, modeHints, appMarkers, rootSelector }));
  }

  const scoredFrames = (execRes || []).map(r => {
    const frameId = r.frameId;
    const frameUrl = frameUrlById.get(frameId) || "";
    const probe = probeByFrameId.get(frameId) || {};
    const derived = deriveFrameKey(frameUrl, parentOriginByFrameId.get(frameId), probe.markerHits || {});
    return {
      frameId,
      frameUrl,
      frameKey: derived.frameKey,
      frameKeyStable: derived.frameKeyStable,
      frameSignalsHash: derived.frameSignalsHash,
      ...r.result,
      normalized: r?.result?.ok ? normalizeAuditResult(action, r.result.result) : null
    };
  });

  const picked = chooseBestEntry({ action, perFrame: scoredFrames, target, probeByFrameId });
  const bestEntry = picked?.entry || null;

  // No frame produced a usable result (restricted page, injection blocked,
  // snippet API missing). Surface an explicit failure instead of an ok
  // response with zero findings — a silent false negative for the user.
  if (!bestEntry || bestEntry.ok !== true) {
    const failureDetail = bestEntry?.reason || bestEntry?.error || picked?.reason || "unknown";
    return {
      ok: false,
      action,
      error: "NO_AUDITABLE_FRAMES",
      reason: "NO_AUDITABLE_FRAMES",
      detail: String(failureDetail),
      schemaVersion: SESSION_SCHEMA_VERSION,
      signatureVersion: SESSION_SIGNATURE_VERSION,
      usedFrameIds,
      perFrame: scoredFrames.map(compactFramePayload),
      bestEntry: null,
      selectionReason: picked?.reason || resolutionReason,
      scope: resolvedScope,
      frameKeyVersion: FRAME_KEY_VERSION,
      frameKeyByFrameId: Object.fromEntries(scoredFrames.map(x => [String(x.frameId), x.frameKey])),
      compatibilityMode: !!resolved?.compatibilityMode,
      compatibilityReason: resolved?.compatibilityReason || null,
      excludedFrameCount: resolved?.excludedFrameCount || 0,
    };
  }

  // ── C4 cross-frame evaluation ──────────────────────────────────────────
  if (usedFrameIds.length > 1 && bestEntry?.ok && (action === "run" || action === "observe")) {
    const frameSummaries = scoredFrames.map(f => ({
      frameId: f.frameId,
      summaries: f.result?.transitionStateSummaries || [],
    }));
    const integrity = mergeFrameIntegrity(frameSummaries);
    const c4Set = new Set();
    const c4_1 = evaluateC4_1(integrity, { emittedSet: c4Set });
    const c4_2 = evaluateC4_2(integrity, { emittedSet: c4Set });
    if (bestEntry.result?.findings) {
      if (c4_1) bestEntry.result.findings.push(c4_1);
      if (c4_2) bestEntry.result.findings.push(c4_2);
    }
  }

  const perFrame = scoredFrames.map(compactFramePayload);
  const frameKeyByFrameId = Object.fromEntries(scoredFrames.map(x => [String(x.frameId), x.frameKey]));
  const frameKeyStableByFrameId = Object.fromEntries(scoredFrames.map(x => [String(x.frameId), x.frameKeyStable]));
  const frameSignalsHashByFrameId = Object.fromEntries(scoredFrames.map(x => [String(x.frameId), x.frameSignalsHash]));

  // Attach best frame's probe data for profile matching in panel.
  const bestProbe = bestEntry ? (probeByFrameId.get(bestEntry.frameId) || null) : null;

  // Track which frames had rootSelector matches (for observability).
  const rootSelectorMatchedFrameIds = rootSelector
    ? scoredFrames.filter(f => f.ok && !f.rootSelectorNotFound).map(f => f.frameId)
    : [];

  return {
    ok: true,
    action,
    schemaVersion: SESSION_SCHEMA_VERSION,
    signatureVersion: SESSION_SIGNATURE_VERSION,
    usedFrameIds,
    perFrame,
    bestEntry,
    bestFrameProbe: bestProbe,
    rootSelectorMatchedFrameIds,
    selectionReason: picked?.reason || resolutionReason,
    scope: resolvedScope,
    frameKeyVersion: FRAME_KEY_VERSION,
    frameKeyByFrameId,
    frameKeyStableByFrameId,
    frameSignalsHashByFrameId,
    compatibilityMode: !!resolved?.compatibilityMode,
    compatibilityReason: resolved?.compatibilityReason || null,
    excludedFrameCount: resolved?.excludedFrameCount || 0,
  };
}

const _auditLockByTab = new Map();
async function acquireAuditLock(tabId) {
  while (_auditLockByTab.get(tabId)) await _auditLockByTab.get(tabId);
  let release;
  const p = new Promise(r => { release = r; });
  _auditLockByTab.set(tabId, p);
  return () => { _auditLockByTab.delete(tabId); release(); };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    const validation = validateIncomingMessage(msg, sender);
    if (!validation.ok) {
      sendResponse(validation);
      return;
    }

    if (msg.type === "LIST_FRAMES") {
      const tabId = Number(msg.tabId);
      let frames;
      try { frames = await chrome.webNavigation.getAllFrames({ tabId }); } catch { frames = []; }
      sendResponse({ ok: true, frames: frames || [] });
      return;
    }

    if (msg.type === "HIGHLIGHT") {
      const tabId = Number(msg.tabId);
      const frameId = Number(msg.frameId);
      const finding = isPlainObject(msg.finding) ? msg.finding : {};
      let results;
      try {
      results = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        world: "MAIN",
        func: (finding) => {
          const HL_ATTR = "data-a11yflow-highlight";
          const STYLE_ID = "a11yflow-highlight-style";
          const HL_NS = "__a11yflow_hl";

          // Cancel previous highlight timeout (prevents premature removal on re-highlight)
          if (window[HL_NS]?.tid) clearTimeout(window[HL_NS].tid);
          if (!window[HL_NS]) window[HL_NS] = {};

          // Remove previous highlight from any element
          document.querySelectorAll(`[${HL_ATTR}]`).forEach(el => {
            el.removeAttribute(HL_ATTR);
          });

          // Always re-inject style (survives page JS removing or mutating it)
          try { document.getElementById(STYLE_ID)?.remove(); } catch {}
          const style = document.createElement("style");
          style.id = STYLE_ID;
          style.textContent = `
            @keyframes a11yflow-flash {
              0%   { outline-width: 6px; outline-color: #ff0080;
                     box-shadow: inset 0 0 0 3px rgba(255,0,128,0.3), 0 0 0 8px rgba(255,0,128,0.7), 0 0 28px 14px rgba(255,0,128,0.4); }
              100% { outline-width: 4px; outline-color: #ff2d95;
                     box-shadow: inset 0 0 0 2px rgba(255,45,149,0.2), 0 0 0 5px rgba(255,45,149,0.55), 0 0 12px 8px rgba(255,45,149,0.2); }
            }
            @keyframes a11yflow-pulse {
              0%, 100% { outline-color: #ff2d95;
                         box-shadow: inset 0 0 0 2px rgba(255,45,149,0.2), 0 0 0 5px rgba(255,45,149,0.55), 0 0 12px 8px rgba(255,45,149,0.2); }
              50%      { outline-color: #ff79c6;
                         box-shadow: inset 0 0 0 2px rgba(255,121,198,0.12), 0 0 0 3px rgba(255,121,198,0.35), 0 0 6px 4px rgba(255,121,198,0.1); }
            }
            [${HL_ATTR}] {
              outline: 4px solid #ff2d95 !important;
              outline-offset: 3px !important;
              box-shadow: inset 0 0 0 2px rgba(255,45,149,0.2), 0 0 0 5px rgba(255,45,149,0.55), 0 0 12px 8px rgba(255,45,149,0.2) !important;
              animation: a11yflow-flash 0.4s ease-out, a11yflow-pulse 1.2s ease-in-out 0.4s 4 !important;
            }
          `;
          (document.head || document.documentElement).appendChild(style);

          const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

          // Traverse shadow DOM roots looking for a match (depth-limited)
          const queryDeep = (selector) => {
            const el = document.querySelector(selector);
            if (el) return el;
            const walk = (root, depth) => {
              if (depth > 5) return null;
              for (const node of root.querySelectorAll("*")) {
                if (node.shadowRoot) {
                  try {
                    const hit = node.shadowRoot.querySelector(selector);
                    if (hit) return hit;
                    const deeper = walk(node.shadowRoot, depth + 1);
                    if (deeper) return deeper;
                  } catch {}
                }
              }
              return null;
            };
            return walk(document, 0);
          };

          const pick = () => {
            // 1st: CSS path — most specific, unique selector from audit time
            try {
              if (finding?.path) {
                const el = queryDeep(finding.path);
                if (el) return { el, strategy: "path" };
              }
            } catch {}

            // 2nd: testId — if the found element's tag doesn't match, narrow to descendant
            try {
              if (finding?.testId) {
                const sel = `[data-testid="${CSS.escape(finding.testId)}"]`;
                const container = queryDeep(sel);
                if (container) {
                  const tag = (finding.tag || "").toLowerCase();
                  if (!tag || container.tagName.toLowerCase() === tag) return { el: container, strategy: "testId" };
                  // testId was inherited from ancestor — find the right child
                  const child = container.querySelector(tag);
                  if (child) return { el: child, strategy: "testId" };
                  return { el: container, strategy: "testId" }; // fallback to container
                }
              }
            } catch {}

            // 3rd: tag + role + accessible name (text, aria-label, title)
            try {
              const tag = (finding?.tag || "").toLowerCase();
              const nameNorm = norm(finding?.name).slice(0, 80);
              if (tag) {
                const candidates = document.querySelectorAll(tag);
                const role = finding.role || null;
                for (const c of candidates) {
                  if (role && c.getAttribute("role") !== role) continue;
                  // Check multiple name sources
                  const texts = [
                    norm(c.getAttribute("aria-label")),
                    norm(c.getAttribute("title")),
                    norm(c.getAttribute("alt")),
                    norm(c.getAttribute("placeholder")),
                    norm(c.textContent),
                  ];
                  if (nameNorm) {
                    for (const t of texts) {
                      if (t && t.slice(0, 80).includes(nameNorm)) return { el: c, strategy: "heuristic" };
                    }
                  }
                }
                // Relax: try without role constraint
                if (role && nameNorm) {
                  for (const c of candidates) {
                    const cText = norm(c.textContent).slice(0, 80);
                    if (cText && cText.includes(nameNorm)) return { el: c, strategy: "heuristic" };
                  }
                }
              }
            } catch {}

            // 4th: last resort — match by HTML snippet
            try {
              if (finding?.html && finding?.tag) {
                const tag = finding.tag.toLowerCase();
                const htmlNorm = norm(finding.html).slice(0, 120);
                for (const c of document.querySelectorAll(tag)) {
                  if (norm(c.outerHTML).slice(0, 120).includes(htmlNorm)) return { el: c, strategy: "html" };
                }
              }
            } catch {}

            return null;
          };

          const result = pick();
          if (!result) {
            console.warn("[A11YFlow] Could not locate element to highlight.", finding);
            return { found: false, strategy: "none", reason: "NO_MATCH" };
          }

          let el = result.el;
          const strategy = result.strategy;

          // If element is zero-size or invisible, try its parent
          try {
            const rect = el.getBoundingClientRect();
            if (rect.width < 2 && rect.height < 2 && el.parentElement && el.parentElement !== document.body) {
              el = el.parentElement;
            }
          } catch {}

          // Scroll into view only if outside viewport (minimize side effects)
          try {
            const rect = el.getBoundingClientRect();
            const inViewport = rect.top >= 0 && rect.left >= 0 &&
              rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
              rect.right <= (window.innerWidth || document.documentElement.clientWidth);
            if (!inViewport) {
              el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
            }
          } catch {}

          // Collect matched element info
          const matched = {
            tag: (el.tagName || "").toLowerCase(),
            role: el.getAttribute("role") || undefined,
            labelSnippet: (el.getAttribute("aria-label") || el.textContent || "").slice(0, 40) || undefined,
          };

          // Apply highlight directly to the element (no overlay div)
          // This survives z-index wars, stacking contexts, and tracks with scroll
          requestAnimationFrame(() => {
            el.setAttribute(HL_ATTR, "1");

            // Remove highlight after animation completes (flash 0.4s + pulse 1.2s × 4)
            window[HL_NS].tid = setTimeout(() => {
              el.removeAttribute(HL_ATTR);
              window[HL_NS].tid = null;
            }, 6000);
          });

          return { found: true, strategy, matched };
        },
        args: [finding]
      });
      } catch (execErr) {
        sendResponse({ ok: true, found: false, strategy: "none", reason: "FRAME_INACCESSIBLE", frameIdUsed: frameId });
        return;
      }
      const r = results?.[0]?.result || { found: false, strategy: "none", reason: "NO_MATCH" };
      r.frameIdUsed = frameId;
      if (r.found === undefined) r.found = false;
      sendResponse({ ok: true, ...r });
      return;
    }

    if (msg.type === "SHOW_TAB_PATH") {
      const tabId = Number(msg.tabId);
      const frameId = Number(msg.frameId);

      // Clear mode: remove overlays without (re)injecting the snippet.
      if (msg.clear === true) {
        let clearResults;
        try {
          clearResults = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frameId] },
            world: "MAIN",
            func: () => {
              const api = window.A11YFlowAudit;
              if (api && typeof api.clearAnnotations === "function") {
                try { api.clearAnnotations(); } catch {}
              }
              // Direct removal covers pages where the snippet is gone (e.g. after reload)
              try { document.getElementById("__flowlens_tab_path__")?.remove(); } catch {}
              try { document.getElementById("__flowlens_annotations__")?.remove(); } catch {}
              return { ok: true, cleared: true };
            },
          });
        } catch {
          sendResponse({ ok: false, error: "FRAME_INACCESSIBLE", frameIdUsed: frameId });
          return;
        }
        sendResponse({ ...(clearResults?.[0]?.result || { ok: false, error: "NO_RESULT" }), frameIdUsed: frameId });
        return;
      }

      // Sanitize events: only the fields showTabPath consumes cross the boundary.
      const events = (Array.isArray(msg.events) ? msg.events : [])
        .slice(0, MAX_TAB_PATH_EVENTS)
        .filter(isPlainObject)
        .map(e => ({
          i: Number.isInteger(Number(e.i)) ? Number(e.i) : null,
          type: typeof e.type === "string" ? e.type.slice(0, 64) : "",
          path: typeof e.path === "string" ? e.path.slice(0, 512) : null,
        }));

      // Ensure the snippet API exists in the target frame (idempotent, same as audits).
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE],
          world: "MAIN",
        });
      } catch (e) {
        sendResponse({ ok: false, error: "INJECT_FAILED", frameIdUsed: frameId });
        return;
      }

      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          world: "MAIN",
          func: (events) => {
            const api = window.A11YFlowAudit;
            if (!api || typeof api.showTabPath !== "function") return { ok: false, error: "SNIPPET_API_MISSING" };
            try { return api.showTabPath(events); } catch (e) { return { ok: false, error: String(e?.message || e) }; }
          },
          args: [events],
        });
      } catch {
        sendResponse({ ok: false, error: "FRAME_INACCESSIBLE", frameIdUsed: frameId });
        return;
      }
      const r = results?.[0]?.result || { ok: false, error: "NO_RESULT" };
      sendResponse({ ...r, frameIdUsed: frameId });
      return;
    }

    if (msg.type === "APPLY_ASSIST") {
      const tabId = Number(msg.tabId);
      const frameId = Number(msg.frameId);
      const kind = String(msg.kind);

      // Clear mode: remove the assist style/filter without (re)injecting the snippet.
      if (kind === "clear") {
        let clearResults;
        try {
          clearResults = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frameId] },
            world: "MAIN",
            func: () => {
              const api = window.A11YFlowAudit;
              if (api && typeof api.clearAssist === "function") {
                try { return api.clearAssist(); } catch {}
              }
              // Direct removal covers pages where the snippet is gone (e.g. after reload)
              try { document.getElementById("__flowlens_assist_style__")?.remove(); } catch {}
              try { document.getElementById("__flowlens_assist_svg__")?.remove(); } catch {}
              return { ok: true };
            },
          });
        } catch {
          sendResponse({ ok: false, error: "FRAME_INACCESSIBLE", frameIdUsed: frameId });
          return;
        }
        sendResponse({ ...(clearResults?.[0]?.result || { ok: false, error: "NO_RESULT" }), frameIdUsed: frameId });
        return;
      }

      // Ensure the snippet API exists in the target frame (idempotent, same as audits).
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE],
          world: "MAIN",
        });
      } catch (e) {
        sendResponse({ ok: false, error: "INJECT_FAILED", frameIdUsed: frameId });
        return;
      }

      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          world: "MAIN",
          func: (kind) => {
            const api = window.A11YFlowAudit;
            if (!api || typeof api.applyAssist !== "function") return { ok: false, error: "SNIPPET_API_MISSING" };
            try { return api.applyAssist(kind); } catch (e) { return { ok: false, error: String(e?.message || e) }; }
          },
          args: [kind],
        });
      } catch {
        sendResponse({ ok: false, error: "FRAME_INACCESSIBLE", frameIdUsed: frameId });
        return;
      }
      const r = results?.[0]?.result || { ok: false, error: "NO_RESULT" };
      sendResponse({ ...r, frameIdUsed: frameId });
      return;
    }

    if (msg.type === "GET_PAGE_STRUCTURE") {
      const tabId = Number(msg.tabId);
      const frameId = Number(msg.frameId);

      // Ensure the snippet API exists in the target frame (idempotent, same as audits).
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE],
          world: "MAIN",
        });
      } catch (e) {
        sendResponse({ ok: false, error: "INJECT_FAILED", frameIdUsed: frameId });
        return;
      }

      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          world: "MAIN",
          func: () => {
            const api = window.A11YFlowAudit;
            if (!api || typeof api.getPageStructure !== "function") return { ok: false, error: "SNIPPET_API_MISSING" };
            try { return { ok: true, structure: api.getPageStructure() }; } catch (e) { return { ok: false, error: String(e?.message || e) }; }
          },
        });
      } catch {
        sendResponse({ ok: false, error: "FRAME_INACCESSIBLE", frameIdUsed: frameId });
        return;
      }
      const r = results?.[0]?.result || { ok: false, error: "NO_RESULT" };
      sendResponse({ ...r, frameIdUsed: frameId });
      return;
    }

    if (msg.type === "SHOW_STRUCTURE") {
      const tabId = Number(msg.tabId);
      const frameId = Number(msg.frameId);
      const kind = String(msg.kind);

      // Clear mode: remove the structure overlay without (re)injecting the snippet.
      if (kind === "clear") {
        let clearResults;
        try {
          clearResults = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frameId] },
            world: "MAIN",
            func: () => {
              const api = window.A11YFlowAudit;
              if (api && typeof api.clearStructureOverlay === "function") {
                try { api.clearStructureOverlay(); return { ok: true, cleared: true }; } catch {}
              }
              // Direct removal covers pages where the snippet is gone (e.g. after reload)
              try { document.getElementById("__flowlens_structure__")?.remove(); } catch {}
              return { ok: true, cleared: true };
            },
          });
        } catch {
          sendResponse({ ok: false, error: "FRAME_INACCESSIBLE", frameIdUsed: frameId });
          return;
        }
        sendResponse({ ...(clearResults?.[0]?.result || { ok: false, error: "NO_RESULT" }), frameIdUsed: frameId });
        return;
      }

      // Ensure the snippet API exists in the target frame (idempotent, same as audits).
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE],
          world: "MAIN",
        });
      } catch (e) {
        sendResponse({ ok: false, error: "INJECT_FAILED", frameIdUsed: frameId });
        return;
      }

      let results;
      try {
        results = await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frameId] },
          world: "MAIN",
          func: (kind) => {
            const api = window.A11YFlowAudit;
            if (!api || typeof api.showStructureOverlay !== "function") return { ok: false, error: "SNIPPET_API_MISSING" };
            try { return api.showStructureOverlay(kind); } catch (e) { return { ok: false, error: String(e?.message || e) }; }
          },
          args: [kind],
        });
      } catch {
        sendResponse({ ok: false, error: "FRAME_INACCESSIBLE", frameIdUsed: frameId });
        return;
      }
      const r = results?.[0]?.result || { ok: false, error: "NO_RESULT" };
      sendResponse({ ...r, frameIdUsed: frameId });
      return;
    }

    if (msg.type === "RUN_AUDIT") {
      const tabId = Number(msg.tabId);
      const release = await acquireAuditLock(tabId);
      try {
        const action = String(msg.action);
        const target = isPlainObject(msg.target) ? msg.target : {};
        const match = isPlainObject(msg.match) ? msg.match : null;
        const modeHints = isPlainObject(msg.modeHints) ? msg.modeHints : null;
        const appMarkers = typeof msg.appMarkers === "string" ? msg.appMarkers : null;
        const rootSelector = typeof msg.rootSelector === "string" ? msg.rootSelector : null;
        const alsoConsole = !!msg.alsoConsole;
        const wcagLevel = sanitizeWcagLevel(msg.wcagLevel);
        let frames;
        try { frames = await chrome.webNavigation.getAllFrames({ tabId }); } catch { frames = []; }
        const resolved = await resolveTargetFrameIds({ tabId, target, frames, match });
        const frameProbeById = await collectFrameProbeData({ tabId, frames, match });
        const out = await executeAuditAcrossFrames({
          tabId,
          action,
          target,
          match,
          modeHints,
          appMarkers,
          rootSelector,
          alsoConsole,
          wcagLevel,
          frames,
          finalTarget: resolved,
          frameProbeById,
        });
        sendResponse(out);
      } finally { release(); }
      return;
    }

    if (msg.type === "CAPTURE_STEP") {
      const tabId = Number(msg.tabId);
      const release = await acquireAuditLock(tabId);
      try {
      const startedAt = Date.now();
      const {
        target,
        match,
        modeHints,
        appMarkers,
        alsoConsole,
        wcagLevel,
        activeMode,
      } = msg;
      const safeTarget = isPlainObject(target) ? target : {};
      const safeMatch = isPlainObject(match) ? match : null;
      const safeModeHints = isPlainObject(modeHints) ? modeHints : null;
      const safeAppMarkers = typeof appMarkers === "string" ? appMarkers : null;
      const safeRootSelector = typeof msg.rootSelector === "string" ? msg.rootSelector : null;
      const safeAlsoConsole = !!alsoConsole;
      const safeWcagLevel = sanitizeWcagLevel(wcagLevel);
      const safeActiveMode = AUDIT_ACTIONS.has(String(activeMode)) ? String(activeMode) : "run";

      let frames;
      try { frames = await chrome.webNavigation.getAllFrames({ tabId }); } catch { frames = []; }
      const resolved = await resolveTargetFrameIds({ tabId, target: safeTarget, frames, match: safeMatch });
      const frameProbeById = await collectFrameProbeData({ tabId, frames, match: safeMatch });

      const baseline = await executeAuditAcrossFrames({
        tabId,
        action: "run",
        target: safeTarget,
        match: safeMatch,
        modeHints: safeModeHints,
        appMarkers: safeAppMarkers,
        rootSelector: safeRootSelector,
        alsoConsole: safeAlsoConsole,
        wcagLevel: safeWcagLevel,
        frames,
        finalTarget: resolved,
        frameProbeById,
      });

      const active = safeActiveMode === "run"
        ? null
        : await executeAuditAcrossFrames({
          tabId,
          action: safeActiveMode,
          target: safeTarget,
          match: safeMatch,
          modeHints: safeModeHints,
          appMarkers: safeAppMarkers,
          rootSelector: safeRootSelector,
          alsoConsole: safeAlsoConsole,
          wcagLevel: safeWcagLevel,
          frames,
          finalTarget: resolved,
          frameProbeById,
        });

      const mergedFrameKeyByFrameId = {
        ...(baseline?.frameKeyByFrameId || {}),
        ...(active?.frameKeyByFrameId || {}),
      };
      debugSession("capture_step", {
        durationMs: Date.now() - startedAt,
        framesEnumerated: (frames || []).length,
        usedFrames: (baseline?.usedFrameIds || resolved?.frameIds || []).length,
        bestFrameKey: baseline?.bestEntry?.frameKey || null,
        selectionReason: baseline?.selectionReason || "unknown",
      });

      sendResponse({
        ok: true,
        schemaVersion: SESSION_SCHEMA_VERSION,
        signatureVersion: SESSION_SIGNATURE_VERSION,
        usedFrameIds: baseline?.usedFrameIds || resolved?.frameIds || [],
        activeMode: safeActiveMode,
        frameKeyVersion: FRAME_KEY_VERSION,
        run: baseline,
        active,
        frameKeyByFrameId: mergedFrameKeyByFrameId,
      });
      } finally { release(); }
      return;
    }

    sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" });
  })().catch(err => sendResponse({ ok: false, error: String(err?.stack || err) }));

  return true;
});

// SPA route changes: DevTools pages have no webNavigation access, so the SW
// broadcasts History-API navigations and the panel filters by its inspected
// tab. Real (full) navigations are handled by devtools.network.onNavigated
// in the panel itself.
const broadcastSpaNav = (details) => {
  if (!details || details.frameId !== 0) return;
  try {
    chrome.runtime.sendMessage({ type: "SPA_NAV_EVENT", tabId: details.tabId, url: String(details.url || "") })
      .catch(() => { /* no listener (panel closed) — expected */ });
  } catch { /* context shutting down */ }
};
chrome.webNavigation.onHistoryStateUpdated?.addListener(broadcastSpaNav);
chrome.webNavigation.onReferenceFragmentUpdated?.addListener(broadcastSpaNav);

async function computeFrameScores({ tabId, frames, match, legacyAutoFanout = false }) {
  const selectors = Array.isArray(match?.domSelectorsAny) ? match.domSelectorsAny : [];
  const urlIncludes = Array.isArray(match?.urlIncludes) ? match.urlIncludes : [];
  const urlExcludes = Array.isArray(match?.urlExcludesAny) ? match.urlExcludesAny : [];
  const hasHeuristics = selectors.length > 0 || urlIncludes.length > 0;

  const urlScores = new Map();
  const excludedFrameIds = new Set();
  for (const f of frames || []) {
    let s = 0;
    const u = (f.url || "").toLowerCase();
    // URL exclude gate
    let excluded = false;
    for (const exc of urlExcludes) {
      if (u.includes(String(exc).toLowerCase())) { excluded = true; break; }
    }
    if (excluded) {
      excludedFrameIds.add(f.frameId);
      urlScores.set(f.frameId, 0);
      continue;
    }
    for (const inc of urlIncludes) {
      if (u.includes(String(inc).toLowerCase())) s += 5;
    }
    urlScores.set(f.frameId, s);
  }

  const domMatches = new Map();
  const frameSizes = new Map();
  if (hasHeuristics || legacyAutoFanout) {
    try {
      const probe = await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        world: "MAIN",
        func: (selectors) => {
          try {
            const list = Array.isArray(selectors) ? selectors : [];
            const domMatch = list.length > 0 && list.some(sel => !!document.querySelector(sel));
            const area = document.documentElement
              ? document.documentElement.scrollWidth * document.documentElement.scrollHeight
              : 0;
            return { domMatch, area };
          } catch {
            return { domMatch: false, area: 0 };
          }
        },
        args: [selectors]
      });
      for (const p of probe || []) {
        const r = p.result || {};
        domMatches.set(p.frameId, !!r.domMatch);
        frameSizes.set(p.frameId, r.area || 0);
      }
    } catch {
      // best-effort only
    }
  }

  const maxArea = Math.max(1, ...([...frameSizes.values()]));
  const scored = sortByScoreThenFrameId((frames || []).map(f => {
    // URL-excluded frames get hard score=0
    if (excludedFrameIds.has(f.frameId)) return { frameId: f.frameId, score: 0 };
    let score = urlScores.get(f.frameId) || 0;
    if (domMatches.get(f.frameId)) {
      score += 10;
    } else if (selectors.length > 0) {
      // Hard gate: domSelectorsAny provided but no DOM match in this frame
      score = 0;
    }
    const area = frameSizes.get(f.frameId) || 0;
    if (score > 0 && area > 0) score += Math.round((area / maxArea) * 3);
    return { frameId: f.frameId, score };
  }));

  return { scored, hasHeuristics, excludedFrameCount: excludedFrameIds.size };
}

function pickBestFrameFromCandidates({ scored, candidateIds, fallbackToTop = false }) {
  const candidateSet = new Set(candidateIds || []);
  const candidates = (scored || []).filter(x => candidateSet.has(x.frameId));
  if (!candidates.length) return null;
  const best = candidates[0];
  if ((best?.score || 0) > 0) return { frameId: best.frameId, reason: "scored_best" };
  if (fallbackToTop && candidateSet.has(0)) return { frameId: 0, reason: "score_zero_fallback_top" };
  return { frameId: best.frameId, reason: "score_zero_fallback_first" };
}

async function resolveTargetFrameIds({ tabId, target, frames, match }) {
  const allFrames = Array.isArray(frames) ? frames : [];
  const allFrameIds = allFrames.map(f => f.frameId);
  const normalized = normalizeScopeAndCompatibility(target);
  const manualFrameIds = getManualFrameIdsFromTarget(target);
  const manualFrameId = manualFrameIds.length === 1 ? manualFrameIds[0] : null;
  const manualOverride = hasManualOverride(target, normalized) && manualFrameId != null;
  const scores = await computeFrameScores({
    tabId,
    frames: allFrames,
    match,
    legacyAutoFanout: normalized.compatibilityMode && normalized.legacyMode === "auto",
  });
  const scored = scores.scored || [];
  const _efc = scores.excludedFrameCount || 0;
  const _resolve = (opts) => makeTargetResolution({ ...opts, excludedFrameCount: _efc });

  // Legacy payload compatibility (scope absent from old panel/runtime combinations).
  if (normalized.compatibilityMode) {
    if (normalized.legacyMode === "top") {
      return _resolve({
        ok: true,
        frameIds: [0],
        scope: FRAME_SCOPE.HOST,
        selectionReason: "legacy_top",
        compatibilityMode: true,
        compatibilityReason: normalized.reason,
      });
    }
    if (normalized.legacyMode === "all") {
      return _resolve({
        ok: true,
        frameIds: allFrameIds,
        scope: FRAME_SCOPE.ALL,
        selectionReason: "legacy_all",
        compatibilityMode: true,
        compatibilityReason: normalized.reason,
      });
    }
    if (normalized.legacyMode === "manual") {
      const ids = normalizeFrameIds(manualFrameIds);
      if (!ids.length) {
        return _resolve({
          ok: false,
          frameIds: [],
          scope: FRAME_SCOPE.PRIMARY,
          selectionReason: "legacy_manual_missing_frame",
          error: "NO_SCOPE_MATCH",
          compatibilityMode: true,
          compatibilityReason: normalized.reason,
        });
      }
      return _resolve({
        ok: true,
        frameIds: [ids[0]],
        scope: FRAME_SCOPE.PRIMARY,
        selectionReason: "legacy_manual",
        compatibilityMode: true,
        compatibilityReason: normalized.reason,
      });
    }
    if (normalized.legacyMode === "auto") {
      if (!scores.hasHeuristics) {
        return _resolve({
          ok: true,
          frameIds: [0],
          scope: FRAME_SCOPE.PRIMARY,
          selectionReason: "legacy_auto_no_heuristics_top",
          compatibilityMode: true,
          compatibilityReason: normalized.reason,
        });
      }
      const topScore = scored[0]?.score ?? 0;
      if (topScore <= 0) {
        return _resolve({
          ok: true,
          frameIds: [0],
          scope: FRAME_SCOPE.PRIMARY,
          selectionReason: "legacy_auto_fallback_top",
          compatibilityMode: true,
          compatibilityReason: normalized.reason,
        });
      }
      const picked = scored
        .filter(x => x.score >= topScore - 3 && x.score > 0)
        .map(x => x.frameId);
      return _resolve({
        ok: true,
        frameIds: picked.length ? picked : [0],
        scope: FRAME_SCOPE.PRIMARY,
        selectionReason: "legacy_auto_fanout",
        compatibilityMode: true,
        compatibilityReason: normalized.reason,
      });
    }
  }

  if (!allFrameIds.length) {
    return _resolve({
      ok: false,
      frameIds: [],
      scope: normalized.scope,
      selectionReason: "no_frames",
      error: "NO_SCOPE_MATCH",
    });
  }

  const hostFrameIds = allFrameIds.filter(id => id === 0);
  const embeddedFrameIds = allFrameIds.filter(id => id !== 0);

  if (normalized.scope === FRAME_SCOPE.ALL) {
    return _resolve({
      ok: true,
      frameIds: allFrameIds,
      scope: FRAME_SCOPE.ALL,
      selectionReason: "scope_all_frames",
    });
  }

  if (normalized.scope === FRAME_SCOPE.HOST) {
    if (manualOverride) {
      if (manualFrameId !== 0) {
        return _resolve({
          ok: false,
          frameIds: [],
          scope: FRAME_SCOPE.HOST,
          selectionReason: "manual_frame_missing",
          error: "MANUAL_FRAMES_MISSING",
        });
      }
      return _resolve({
        ok: true,
        frameIds: [0],
        scope: FRAME_SCOPE.HOST,
        selectionReason: "scope_host_manual_override",
      });
    }
    if (!hostFrameIds.length) {
      return _resolve({
        ok: false,
        frameIds: [],
        scope: FRAME_SCOPE.HOST,
        selectionReason: "no_scope_match_host_missing",
        error: "NO_SCOPE_MATCH",
      });
    }
    return _resolve({
      ok: true,
      frameIds: [0],
      scope: FRAME_SCOPE.HOST,
      selectionReason: "scope_host_only",
    });
  }

  if (normalized.scope === FRAME_SCOPE.EMBEDDED) {
    if (manualOverride) {
      if (!embeddedFrameIds.includes(manualFrameId)) {
        return _resolve({
          ok: false,
          frameIds: [],
          scope: FRAME_SCOPE.EMBEDDED,
          selectionReason: "manual_frame_missing",
          error: "MANUAL_FRAMES_MISSING",
        });
      }
      return _resolve({
        ok: true,
        frameIds: [manualFrameId],
        scope: FRAME_SCOPE.EMBEDDED,
        selectionReason: "scope_embedded_manual_override",
      });
    }
    if (!embeddedFrameIds.length) {
      return _resolve({
        ok: false,
        frameIds: [],
        scope: FRAME_SCOPE.EMBEDDED,
        selectionReason: "no_scope_match_embedded_missing",
        error: "NO_SCOPE_MATCH",
      });
    }
    const picked = pickBestFrameFromCandidates({ scored, candidateIds: embeddedFrameIds, fallbackToTop: false });
    if (!picked?.frameId && picked?.frameId !== 0) {
      return _resolve({
        ok: false,
        frameIds: [],
        scope: FRAME_SCOPE.EMBEDDED,
        selectionReason: "no_scope_match_embedded_missing",
        error: "NO_SCOPE_MATCH",
      });
    }
    return _resolve({
      ok: true,
      frameIds: [picked.frameId],
      scope: FRAME_SCOPE.EMBEDDED,
      selectionReason: picked.reason === "scored_best" ? "scope_embedded_scored_best" : "scope_embedded_fallback_first",
    });
  }

  // PRIMARY scope (default): exactly one frame, auto-selected from all candidates.
  if (manualOverride) {
    if (!allFrameIds.includes(manualFrameId)) {
      return _resolve({
        ok: false,
        frameIds: [],
        scope: FRAME_SCOPE.PRIMARY,
        selectionReason: "manual_frame_missing",
        error: "MANUAL_FRAMES_MISSING",
      });
    }
    return _resolve({
      ok: true,
      frameIds: [manualFrameId],
      scope: FRAME_SCOPE.PRIMARY,
      selectionReason: "scope_primary_manual_override",
    });
  }

  const primary = pickBestFrameFromCandidates({ scored, candidateIds: allFrameIds, fallbackToTop: true });
  if (!primary?.frameId && primary?.frameId !== 0) {
    return _resolve({
      ok: false,
      frameIds: [],
      scope: FRAME_SCOPE.PRIMARY,
      selectionReason: "no_scope_match_primary_missing",
      error: "NO_SCOPE_MATCH",
    });
  }
  return _resolve({
    ok: true,
    frameIds: [primary.frameId],
    scope: FRAME_SCOPE.PRIMARY,
    selectionReason: primary.reason === "scored_best" ? "scope_primary_scored_best" : "scope_primary_fallback_top",
  });
}
