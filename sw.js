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

function chooseBestEntry({ action, perFrame, target }) {
  const frames = Array.isArray(perFrame) ? perFrame : [];
  if (!frames.length) return { entry: null, reason: "no_frames" };

  const okFrames = frames.filter(x => x?.ok === true);
  if (!okFrames.length) {
    return { entry: (frames.find(x => x.frameId === 0) || frames[0] || null), reason: "no_ok_frames_fallback" };
  }

  // Pinned/manual frame should win if it executed successfully.
  if (target?.mode === "manual" && Array.isArray(target?.frameIds) && target.frameIds.length === 1) {
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
  finalFrameIds,
  frameProbeById,
}) {
  const allFrames = Array.isArray(frames) ? frames : await chrome.webNavigation.getAllFrames({ tabId });
  const frameUrlById = new Map((allFrames || []).map(f => [f.frameId, f.url || ""]));
  const parentOriginByFrameId = new Map();
  for (const f of allFrames || []) {
    const parent = (allFrames || []).find(x => x.frameId === f.parentFrameId);
    parentOriginByFrameId.set(f.frameId, safeOrigin(parent?.url || "", safeOrigin(f.url || "", "about:blank")));
  }

  const resolved = Array.isArray(finalFrameIds) ? finalFrameIds : await resolveTargetFrameIds({ tabId, target, frames: allFrames, match });
  const usedFrameIds = resolved.length ? resolved : (target?.mode === "manual" ? (target.frameIds || []) : [0]);

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
    selectionReason: picked?.reason || "unknown",
    frameKeyVersion: FRAME_KEY_VERSION,
    frameKeyByFrameId,
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    if (msg.type === "LIST_FRAMES") {
      const frames = await chrome.webNavigation.getAllFrames({ tabId: msg.tabId });
      sendResponse({ ok: true, frames: frames || [] });
      return;
    }

    if (msg.type === "HIGHLIGHT") {
      const { tabId, frameId, finding } = msg;
      await chrome.scripting.executeScript({
        target: { tabId, frameIds: [frameId] },
        world: "MAIN",
        func: (finding) => {
          const OVERLAY_ATTR = "data-a11yflow-highlight";
          const STYLE_ID = "a11yflow-highlight-style";

          // Cleanup previous highlights
          document.querySelectorAll(`[${OVERLAY_ATTR}]`).forEach(el => el.remove());

          // Inject keyframe style once
          if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement("style");
            style.id = STYLE_ID;
            style.textContent = `
              @keyframes a11yflow-pulse {
                0%, 100% { box-shadow: 0 0 0 3px rgba(255,121,198,0.9); }
                50% { box-shadow: 0 0 0 6px rgba(255,121,198,0.4); }
              }
              [${OVERLAY_ATTR}] {
                position: absolute;
                pointer-events: none;
                z-index: 2147483647;
                border: 2px solid #ff79c6;
                border-radius: 3px;
                animation: a11yflow-pulse 1s ease-in-out 3;
                transition: opacity 0.4s ease;
              }
            `;
            document.head.appendChild(style);
          }

          const pick = () => {
            // 1st: testId
            try {
              if (finding?.testId) {
                const el = document.querySelector(`[data-testid="${CSS.escape(finding.testId)}"]`);
                if (el) return el;
              }
            } catch {}
            // 2nd: CSS path
            try {
              if (finding?.path) {
                const el = document.querySelector(finding.path);
                if (el) return el;
              }
            } catch {}
            // 3rd: tag + role + text match
            try {
              if (finding?.tag && finding?.name) {
                const tag = finding.tag.toLowerCase();
                const candidates = document.querySelectorAll(tag);
                const role = finding.role || null;
                const nameNorm = (finding.name || "").trim().toLowerCase().slice(0, 80);
                for (const c of candidates) {
                  if (role && c.getAttribute("role") !== role) continue;
                  const cText = (c.textContent || "").replace(/\s+/g, " ").trim().toLowerCase().slice(0, 80);
                  if (cText && nameNorm && cText.includes(nameNorm)) return c;
                }
              }
            } catch {}
            return null;
          };

          const el = pick();
          if (!el) {
            console.warn("[A11YFlowAudit] Could not find element to highlight.", finding);
            return;
          }

          // Scroll into view
          try { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch {}

          // Position overlay after scroll settles (double-rAF)
          requestAnimationFrame(() => { requestAnimationFrame(() => {
            const rect = el.getBoundingClientRect();
            const overlay = document.createElement("div");
            overlay.setAttribute(OVERLAY_ATTR, "1");
            overlay.style.cssText = `
              position: fixed;
              pointer-events: none;
              z-index: 2147483647;
              border: 2px solid #ff79c6;
              border-radius: 3px;
              box-shadow: 0 0 0 3px rgba(255,121,198,0.9);
              animation: a11yflow-pulse 1s ease-in-out 3;
              transition: opacity 0.4s ease;
              top: ${rect.top - 3}px;
              left: ${rect.left - 3}px;
              width: ${rect.width + 6}px;
              height: ${rect.height + 6}px;
            `;
            document.body.appendChild(overlay);

            // Fade out after 3.5s, remove at 3.9s
            setTimeout(() => { overlay.style.opacity = "0"; }, 3500);
            setTimeout(() => { overlay.remove(); }, 3900);
          }); });
        },
        args: [finding]
      });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "RUN_AUDIT") {
      const { tabId, action, target, match, modeHints, appMarkers, alsoConsole, wcagLevel } = msg;
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
        finalFrameIds: resolved,
        frameProbeById,
      });
      sendResponse(out);
      return;
    }

    if (msg.type === "CAPTURE_STEP") {
      const startedAt = Date.now();
      const {
        tabId,
        target,
        match,
        modeHints,
        appMarkers,
        alsoConsole,
        wcagLevel,
        activeMode,
      } = msg;
      const safeActiveMode = ["run", "contrast", "tabWalk", "watch", "observe"].includes(activeMode) ? activeMode : "run";

      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      const resolved = await resolveTargetFrameIds({ tabId, target, frames, match });
      const frameProbeById = await collectFrameProbeData({ tabId, frames, match });

      const baseline = await executeAuditAcrossFrames({
        tabId,
        action: "run",
        target,
        match,
        modeHints,
        appMarkers,
        alsoConsole,
        wcagLevel,
        frames,
        finalFrameIds: resolved,
        frameProbeById,
      });

      const active = safeActiveMode === "run"
        ? null
        : await executeAuditAcrossFrames({
          tabId,
          action: safeActiveMode,
          target,
          match,
          modeHints,
          appMarkers,
          alsoConsole,
          wcagLevel,
          frames,
          finalFrameIds: resolved,
          frameProbeById,
        });

      const mergedFrameKeyByFrameId = {
        ...(baseline?.frameKeyByFrameId || {}),
        ...(active?.frameKeyByFrameId || {}),
      };
      debugSession("capture_step", {
        durationMs: Date.now() - startedAt,
        framesEnumerated: (frames || []).length,
        usedFrames: (baseline?.usedFrameIds || resolved || []).length,
        bestFrameKey: baseline?.bestEntry?.frameKey || null,
        selectionReason: baseline?.selectionReason || "unknown",
      });

      sendResponse({
        ok: true,
        schemaVersion: SESSION_SCHEMA_VERSION,
        signatureVersion: SESSION_SIGNATURE_VERSION,
        usedFrameIds: baseline?.usedFrameIds || resolved || [],
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

async function resolveTargetFrameIds({ tabId, target, frames, match }) {
  const mode = target?.mode || "auto";
  if (mode === "top") return [0];
  if (mode === "all") return (frames || []).map(f => f.frameId);
  if (mode === "manual") return Array.isArray(target.frameIds) ? target.frameIds : [];

  // --- AUTO: If no heuristics provided, default to top frame for reliability ---
  const selectors = Array.isArray(match?.domSelectorsAny) ? match.domSelectorsAny : [];
  const urlIncludes = Array.isArray(match?.urlIncludes) ? match.urlIncludes : [];
  const hasHeuristics = selectors.length > 0 || urlIncludes.length > 0;
  if (!hasHeuristics) return [0];

  // URL score
  const urlScores = new Map();
  for (const f of frames || []) {
    let s = 0;
    const u = (f.url || "").toLowerCase();
    for (const inc of urlIncludes) {
      if (u.includes(String(inc).toLowerCase())) s += 5;
    }
    // slight preference to iframes only when we are in a heuristic mode (e.g. Help Center)
    if (f.frameId !== 0) s += 1;
    urlScores.set(f.frameId, s);
  }

  // DOM probe + frame size across all frames (best-effort)
  const domMatches = new Map();
  const frameSizes = new Map();
  try {
    const probe = await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      world: "MAIN",
      func: (selectors) => {
        try {
          const domMatch = selectors.length > 0 && selectors.some(sel => !!document.querySelector(sel));
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
    // ignore
  }

  // Determine largest frame area for relative scoring
  const maxArea = Math.max(1, ...([...frameSizes.values()]));

  const scored = (frames || []).map(f => {
    let score = urlScores.get(f.frameId) || 0;
    if (domMatches.get(f.frameId)) score += 10;
    // Bonus for larger frames (up to +3 points for the largest)
    const area = frameSizes.get(f.frameId) || 0;
    if (area > 0) score += Math.round((area / maxArea) * 3);
    return { frameId: f.frameId, score };
  }).sort((a, b) => b.score - a.score);

  const topScore = scored[0]?.score ?? 0;
  if (topScore <= 0) return [0]; // safe fallback

  // Tighter threshold: only frames within 3 points of best score
  const picked = scored.filter(x => x.score >= topScore - 3 && x.score > 0).map(x => x.frameId);
  return picked.length ? picked : [0];
}
