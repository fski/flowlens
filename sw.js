const SNIPPET_FILE = "a11y-audit-snippet.js";
const SESSION_SCHEMA_VERSION = 1;
const SESSION_SIGNATURE_VERSION = 1;
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
const MESSAGE_TYPES = new Set(["LIST_FRAMES", "HIGHLIGHT", "RUN_AUDIT", "CAPTURE_STEP"]);
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

  if ((msg.type === "LIST_FRAMES" || msg.type === "RUN_AUDIT" || msg.type === "CAPTURE_STEP" || msg.type === "HIGHLIGHT")
      && !isNonNegativeInt(msg.tabId)) {
    return { ok: false, error: "BAD_TAB_ID" };
  }

  if (msg.type === "HIGHLIGHT") {
    if (!isNonNegativeInt(msg.frameId)) return { ok: false, error: "BAD_FRAME_ID" };
    if (msg.finding != null && !isPlainObject(msg.finding)) return { ok: false, error: "BAD_FINDING" };
  }

  if (msg.type === "RUN_AUDIT") {
    if (!AUDIT_ACTIONS.has(msg.action)) return { ok: false, error: "BAD_ACTION" };
    if (msg.wcagLevel != null && !WCAG_LEVELS.has(String(msg.wcagLevel))) return { ok: false, error: "BAD_WCAG_LEVEL" };
    if (msg.target != null && !isPlainObject(msg.target)) return { ok: false, error: "BAD_TARGET" };
    if (msg.match != null && !isPlainObject(msg.match)) return { ok: false, error: "BAD_MATCH" };
    if (msg.modeHints != null && !isPlainObject(msg.modeHints)) return { ok: false, error: "BAD_MODE_HINTS" };
    if (msg.appMarkers != null && typeof msg.appMarkers !== "string") return { ok: false, error: "BAD_APP_MARKERS" };
    if (msg.match?.urlIncludes != null && !isStringArray(msg.match.urlIncludes, 80, 256)) return { ok: false, error: "BAD_MATCH_URLS" };
    if (msg.match?.domSelectorsAny != null && !isStringArray(msg.match.domSelectorsAny, 80, 256)) return { ok: false, error: "BAD_MATCH_SELECTORS" };
  }

  if (msg.type === "CAPTURE_STEP") {
    if (msg.wcagLevel != null && !WCAG_LEVELS.has(String(msg.wcagLevel))) return { ok: false, error: "BAD_WCAG_LEVEL" };
    if (msg.target != null && !isPlainObject(msg.target)) return { ok: false, error: "BAD_TARGET" };
    if (msg.match != null && !isPlainObject(msg.match)) return { ok: false, error: "BAD_MATCH" };
    if (msg.modeHints != null && !isPlainObject(msg.modeHints)) return { ok: false, error: "BAD_MODE_HINTS" };
    if (msg.appMarkers != null && typeof msg.appMarkers !== "string") return { ok: false, error: "BAD_APP_MARKERS" };
    if (msg.activeMode != null && !AUDIT_ACTIONS.has(String(msg.activeMode))) return { ok: false, error: "BAD_ACTIVE_MODE" };
    if (msg.match?.urlIncludes != null && !isStringArray(msg.match.urlIncludes, 80, 256)) return { ok: false, error: "BAD_MATCH_URLS" };
    if (msg.match?.domSelectorsAny != null && !isStringArray(msg.match.domSelectorsAny, 80, 256)) return { ok: false, error: "BAD_MATCH_SELECTORS" };
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

function debugSession(...args) {
  if (!DEBUG_SESSION) return;
  console.debug("[FlowLensSession/SW]", ...args);
}

function deriveFrameKey(frameUrl, parentOrigin, matchHits = {}) {
  // Invariant: frameKey must remain deterministic and independent from frameId/classification.
  // Keep only stable URL hints + stable marker hash (sorted keys and fixed boolean encoding).
  const frameOrigin = safeOrigin(frameUrl, "");
  const origin = frameOrigin || parentOrigin || "about:blank";
  const pathHint = stablePathHint(frameUrl);
  const markerKeys = Object.keys(matchHits || {})
    .sort()
    .slice(0, 64);
  const markerSig = markerKeys
    .map(k => `${k}:${matchHits[k] ? 1 : 0}`)
    .join("|");
  // Keep frameKey independent from dynamic classification to prevent key churn.
  // Version tag allows future algorithm upgrades without breaking old archives.
  const markerHash8 = fnv1aHash8(markerSig || "no-markers");
  return `fk::v${FRAME_KEY_VERSION}::${origin}::${pathHint}::${markerHash8}`;
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
    primaryCounts: { verdicts: verdicts.length, focusLossCount, bursts, totalLoadingMs },
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
}) {
  return {
    ok: !!ok,
    frameIds: normalizeFrameIds(frameIds),
    scope,
    selectionReason,
    error,
    compatibilityMode,
    compatibilityReason,
  };
}

function sortByScoreThenFrameId(scored = []) {
  return [...scored].sort((a, b) => (b.score - a.score) || (a.frameId - b.frameId));
}

function chooseBestEntry({ action, perFrame, target }) {
  const frames = Array.isArray(perFrame) ? perFrame : [];
  if (!frames.length) return { entry: null, reason: "no_frames" };

  const okFrames = frames.filter(x => x?.ok === true);
  if (!okFrames.length) {
    return { entry: (frames.find(x => x.frameId === 0) || frames[0] || null), reason: "no_ok_frames_fallback" };
  }

  // Legacy manual mode compatibility: pinned frame should win if it executed successfully.
  const isLegacyManual = !normalizeFrameScope(target?.scope) && target?.mode === "manual";
  if (isLegacyManual && Array.isArray(target?.frameIds) && target.frameIds.length === 1) {
    const pinnedId = Number(target.frameIds[0]);
    const pinned = okFrames.find(x => x.frameId === pinnedId);
    if (pinned) return { entry: pinned, reason: "manual_pinned_override" };
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

  // If no frame produces a positive score, deterministically fall back to top frame.
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
          out.hasHelpRoot = !!document.querySelector("#help-center-root,[data-testid*='help-center'],[data-testid*='HELP'],[data-testid*='HC']");
          out.hasTree = !!document.querySelector("[role='tree'],[role='treeitem']");
          out.hasChat = !!document.querySelector("[role='log'],[data-testid^='GST_CHAT__'],#GST_CHAT__FEED");
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

async function execAuditActionInFrame({ tabId, frameId, action, alsoConsole, wcagLevel, modeHints, appMarkers }) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: [SNIPPET_FILE],
      world: "MAIN"
    });
  } catch (e) {
    return { frameId, result: { ok: false, reason: "INJECT_FAILED", error: String(e?.message || e) } };
  }

  try {
    const r = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: "MAIN",
      func: async (action, alsoConsole, wcagLevel, modeHints, appMarkers) => {
        const api = window.A11YFlowAudit;
        if (!api) return { ok: false, reason: "NO_API" };

        const runCfg = { strict: true, wcagLevel };
        if (modeHints) runCfg.modeHints = modeHints;
        if (appMarkers) runCfg.appMarkers = appMarkers;

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
      args: [action, !!alsoConsole, wcagLevel || "2.1-AA", modeHints || null, appMarkers || null]
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
    return {
      ok: false,
      action,
      error: "NO_SCOPE_MATCH",
      reason: "NO_SCOPE_MATCH",
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
    };
  }

  const probeByFrameId = frameProbeById instanceof Map ? frameProbeById : await collectFrameProbeData({ tabId, frames: allFrames, match });
  const execRes = [];
  for (const frameId of usedFrameIds) {
    // Deterministic sequential execution per frame.
    execRes.push(await execAuditActionInFrame({ tabId, frameId, action, alsoConsole, wcagLevel, modeHints, appMarkers }));
  }

  const scoredFrames = (execRes || []).map(r => {
    const frameId = r.frameId;
    const frameUrl = frameUrlById.get(frameId) || "";
    const probe = probeByFrameId.get(frameId) || {};
    const frameKey = deriveFrameKey(frameUrl, parentOriginByFrameId.get(frameId), probe.markerHits || {});
    return {
      frameId,
      frameUrl,
      frameKey,
      ...r.result,
      normalized: r?.result?.ok ? normalizeAuditResult(action, r.result.result) : null
    };
  });

  const picked = chooseBestEntry({ action, perFrame: scoredFrames, target });
  const bestEntry = picked?.entry || null;
  const perFrame = scoredFrames.map(compactFramePayload);
  const frameKeyByFrameId = Object.fromEntries(scoredFrames.map(x => [String(x.frameId), x.frameKey]));

  return {
    ok: true,
    action,
    schemaVersion: SESSION_SCHEMA_VERSION,
    signatureVersion: SESSION_SIGNATURE_VERSION,
    usedFrameIds,
    perFrame,
    bestEntry,
    selectionReason: picked?.reason || resolutionReason,
    scope: resolvedScope,
    frameKeyVersion: FRAME_KEY_VERSION,
    frameKeyByFrameId,
    compatibilityMode: !!resolved?.compatibilityMode,
    compatibilityReason: resolved?.compatibilityReason || null,
  };
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
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      sendResponse({ ok: true, frames: frames || [] });
      return;
    }

    if (msg.type === "HIGHLIGHT") {
      const tabId = Number(msg.tabId);
      const frameId = Number(msg.frameId);
      const finding = isPlainObject(msg.finding) ? msg.finding : {};
      const results = await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        world: "MAIN",
        func: (finding) => {
          const HL_ATTR = "data-a11yflow-highlight";
          const STYLE_ID = "a11yflow-highlight-style";

          // Remove previous highlight from any element
          document.querySelectorAll(`[${HL_ATTR}]`).forEach(el => {
            el.removeAttribute(HL_ATTR);
          });

          // Inject highlight + pulse animation style once
          if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = `
              @keyframes a11yflow-pulse {
                0%, 100% { outline-color: #ff79c6; box-shadow: 0 0 0 4px rgba(255,121,198,0.7); }
                50% { outline-color: #ff92d0; box-shadow: 0 0 8px 6px rgba(255,121,198,0.3); }
              }
              [${HL_ATTR}] {
                outline: 3px solid #ff79c6 !important;
                outline-offset: 2px !important;
                box-shadow: 0 0 0 4px rgba(255,121,198,0.7) !important;
                animation: a11yflow-pulse 1s ease-in-out 3 !important;
                transition: outline-color 0.4s ease, box-shadow 0.4s ease !important;
              }
            `;
            (document.head || document.documentElement).appendChild(style);
          }

          const norm = (s) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();

          // Traverse shadow DOM roots looking for a match
          const queryDeep = (selector) => {
            const el = document.querySelector(selector);
            if (el) return el;
            const walk = (root) => {
              for (const node of root.querySelectorAll("*")) {
                if (node.shadowRoot) {
                  try {
                    const hit = node.shadowRoot.querySelector(selector);
                    if (hit) return hit;
                    const deeper = walk(node.shadowRoot);
                    if (deeper) return deeper;
                  } catch {}
                }
              }
              return null;
            };
            return walk(document);
          };

          const pick = () => {
            // 1st: CSS path — most specific, unique selector from audit time
            try {
              if (finding?.path) {
                const el = queryDeep(finding.path);
                if (el) return el;
              }
            } catch {}

            // 2nd: testId — if the found element's tag doesn't match, narrow to descendant
            try {
              if (finding?.testId) {
                const sel = `[data-testid="${CSS.escape(finding.testId)}"]`;
                const container = queryDeep(sel);
                if (container) {
                  const tag = (finding.tag || "").toLowerCase();
                  if (!tag || container.tagName.toLowerCase() === tag) return container;
                  // testId was inherited from ancestor — find the right child
                  const child = container.querySelector(tag);
                  if (child) return child;
                  return container; // fallback to container
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
                      if (t && t.slice(0, 80).includes(nameNorm)) return c;
                    }
                  }
                }
                // Relax: try without role constraint
                if (role && nameNorm) {
                  for (const c of candidates) {
                    const cText = norm(c.textContent).slice(0, 80);
                    if (cText && cText.includes(nameNorm)) return c;
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
                  if (norm(c.outerHTML).slice(0, 120).includes(htmlNorm)) return c;
                }
              }
            } catch {}

            return null;
          };

          const el = pick();
          if (!el) {
            console.warn("[A11YFlow] Could not locate element to highlight.", finding);
            return { found: false };
          }

          // Scroll into view
          try { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch {}

          // Apply highlight directly to the element (no overlay div)
          // This survives z-index wars, stacking contexts, and tracks with scroll
          requestAnimationFrame(() => {
            el.setAttribute(HL_ATTR, "1");

            // Remove highlight after animation completes
            setTimeout(() => {
              el.removeAttribute(HL_ATTR);
            }, 4000);
          });

          return { found: true };
        },
        args: [finding]
      });
      const found = results?.[0]?.result?.found === true;
      sendResponse({ ok: true, found });
      return;
    }

    if (msg.type === "RUN_AUDIT") {
      const tabId = Number(msg.tabId);
      const action = String(msg.action);
      const target = isPlainObject(msg.target) ? msg.target : {};
      const match = isPlainObject(msg.match) ? msg.match : null;
      const modeHints = isPlainObject(msg.modeHints) ? msg.modeHints : null;
      const appMarkers = typeof msg.appMarkers === "string" ? msg.appMarkers : null;
      const alsoConsole = !!msg.alsoConsole;
      const wcagLevel = sanitizeWcagLevel(msg.wcagLevel);
      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      const resolved = await resolveTargetFrameIds({ tabId, target, frames, match });
      const frameProbeById = await collectFrameProbeData({ tabId, frames, match });
      const out = await executeAuditAcrossFrames({
        tabId,
        action,
        target,
        match,
        modeHints,
        appMarkers,
        alsoConsole,
        wcagLevel,
        frames,
        finalTarget: resolved,
        frameProbeById,
      });
      sendResponse(out);
      return;
    }

    if (msg.type === "CAPTURE_STEP") {
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
      const tabId = Number(msg.tabId);
      const safeTarget = isPlainObject(target) ? target : {};
      const safeMatch = isPlainObject(match) ? match : null;
      const safeModeHints = isPlainObject(modeHints) ? modeHints : null;
      const safeAppMarkers = typeof appMarkers === "string" ? appMarkers : null;
      const safeAlsoConsole = !!alsoConsole;
      const safeWcagLevel = sanitizeWcagLevel(wcagLevel);
      const safeActiveMode = AUDIT_ACTIONS.has(String(activeMode)) ? String(activeMode) : "run";

      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      const resolved = await resolveTargetFrameIds({ tabId, target: safeTarget, frames, match: safeMatch });
      const frameProbeById = await collectFrameProbeData({ tabId, frames, match: safeMatch });

      const baseline = await executeAuditAcrossFrames({
        tabId,
        action: "run",
        target: safeTarget,
        match: safeMatch,
        modeHints: safeModeHints,
        appMarkers: safeAppMarkers,
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
      return;
    }

    sendResponse({ ok: false, error: "UNKNOWN_MESSAGE" });
  })().catch(err => sendResponse({ ok: false, error: String(err?.stack || err) }));

  return true;
});

async function computeFrameScores({ tabId, frames, match, legacyAutoFanout = false }) {
  const selectors = Array.isArray(match?.domSelectorsAny) ? match.domSelectorsAny : [];
  const urlIncludes = Array.isArray(match?.urlIncludes) ? match.urlIncludes : [];
  const hasHeuristics = selectors.length > 0 || urlIncludes.length > 0;

  const urlScores = new Map();
  for (const f of frames || []) {
    let s = 0;
    const u = (f.url || "").toLowerCase();
    for (const inc of urlIncludes) {
      if (u.includes(String(inc).toLowerCase())) s += 5;
    }
    if (hasHeuristics && f.frameId !== 0) s += 1;
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
    let score = urlScores.get(f.frameId) || 0;
    if (domMatches.get(f.frameId)) score += 10;
    const area = frameSizes.get(f.frameId) || 0;
    if (area > 0) score += Math.round((area / maxArea) * 3);
    return { frameId: f.frameId, score };
  }));

  return { scored, hasHeuristics };
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

  // Legacy payload compatibility (scope absent from old panel/runtime combinations).
  if (normalized.compatibilityMode) {
    if (normalized.legacyMode === "top") {
      return makeTargetResolution({
        ok: true,
        frameIds: [0],
        scope: FRAME_SCOPE.HOST,
        selectionReason: "legacy_top",
        compatibilityMode: true,
        compatibilityReason: normalized.reason,
      });
    }
    if (normalized.legacyMode === "all") {
      return makeTargetResolution({
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
        return makeTargetResolution({
          ok: false,
          frameIds: [],
          scope: FRAME_SCOPE.PRIMARY,
          selectionReason: "legacy_manual_missing_frame",
          error: "NO_SCOPE_MATCH",
          compatibilityMode: true,
          compatibilityReason: normalized.reason,
        });
      }
      return makeTargetResolution({
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
        return makeTargetResolution({
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
        return makeTargetResolution({
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
      return makeTargetResolution({
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
    return makeTargetResolution({
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
    return makeTargetResolution({
      ok: true,
      frameIds: allFrameIds,
      scope: FRAME_SCOPE.ALL,
      selectionReason: "scope_all_frames",
    });
  }

  if (normalized.scope === FRAME_SCOPE.HOST) {
    if (manualOverride) {
      if (manualFrameId !== 0) {
        return makeTargetResolution({
          ok: false,
          frameIds: [],
          scope: FRAME_SCOPE.HOST,
          selectionReason: "no_scope_match_manual_outside_scope",
          error: "NO_SCOPE_MATCH",
        });
      }
      return makeTargetResolution({
        ok: true,
        frameIds: [0],
        scope: FRAME_SCOPE.HOST,
        selectionReason: "scope_host_manual_override",
      });
    }
    if (!hostFrameIds.length) {
      return makeTargetResolution({
        ok: false,
        frameIds: [],
        scope: FRAME_SCOPE.HOST,
        selectionReason: "no_scope_match_host_missing",
        error: "NO_SCOPE_MATCH",
      });
    }
    return makeTargetResolution({
      ok: true,
      frameIds: [0],
      scope: FRAME_SCOPE.HOST,
      selectionReason: "scope_host_only",
    });
  }

  if (normalized.scope === FRAME_SCOPE.EMBEDDED) {
    if (manualOverride) {
      if (!embeddedFrameIds.includes(manualFrameId)) {
        return makeTargetResolution({
          ok: false,
          frameIds: [],
          scope: FRAME_SCOPE.EMBEDDED,
          selectionReason: "no_scope_match_manual_outside_scope",
          error: "NO_SCOPE_MATCH",
        });
      }
      return makeTargetResolution({
        ok: true,
        frameIds: [manualFrameId],
        scope: FRAME_SCOPE.EMBEDDED,
        selectionReason: "scope_embedded_manual_override",
      });
    }
    if (!embeddedFrameIds.length) {
      return makeTargetResolution({
        ok: false,
        frameIds: [],
        scope: FRAME_SCOPE.EMBEDDED,
        selectionReason: "no_scope_match_embedded_missing",
        error: "NO_SCOPE_MATCH",
      });
    }
    const picked = pickBestFrameFromCandidates({ scored, candidateIds: embeddedFrameIds, fallbackToTop: false });
    if (!picked?.frameId && picked?.frameId !== 0) {
      return makeTargetResolution({
        ok: false,
        frameIds: [],
        scope: FRAME_SCOPE.EMBEDDED,
        selectionReason: "no_scope_match_embedded_missing",
        error: "NO_SCOPE_MATCH",
      });
    }
    return makeTargetResolution({
      ok: true,
      frameIds: [picked.frameId],
      scope: FRAME_SCOPE.EMBEDDED,
      selectionReason: picked.reason === "scored_best" ? "scope_embedded_scored_best" : "scope_embedded_fallback_first",
    });
  }

  // PRIMARY scope (default): exactly one frame, auto-selected from all candidates.
  if (manualOverride) {
    if (!allFrameIds.includes(manualFrameId)) {
      return makeTargetResolution({
        ok: false,
        frameIds: [],
        scope: FRAME_SCOPE.PRIMARY,
        selectionReason: "no_scope_match_manual_outside_scope",
        error: "NO_SCOPE_MATCH",
      });
    }
    return makeTargetResolution({
      ok: true,
      frameIds: [manualFrameId],
      scope: FRAME_SCOPE.PRIMARY,
      selectionReason: "scope_primary_manual_override",
    });
  }

  const primary = pickBestFrameFromCandidates({ scored, candidateIds: allFrameIds, fallbackToTop: true });
  if (!primary?.frameId && primary?.frameId !== 0) {
    return makeTargetResolution({
      ok: false,
      frameIds: [],
      scope: FRAME_SCOPE.PRIMARY,
      selectionReason: "no_scope_match_primary_missing",
      error: "NO_SCOPE_MATCH",
    });
  }
  return makeTargetResolution({
    ok: true,
    frameIds: [primary.frameId],
    scope: FRAME_SCOPE.PRIMARY,
    selectionReason: primary.reason === "scored_best" ? "scope_primary_scored_best" : "scope_primary_fallback_top",
  });
}
