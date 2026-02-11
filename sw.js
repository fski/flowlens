const SNIPPET_FILE = "a11y-audit-snippet.js";

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
          const sleep = (ms) => new Promise(r => setTimeout(r, ms));
          const pick = () => {
            try {
              if (finding?.testId) {
                const el = document.querySelector(`[data-testid="${CSS.escape(finding.testId)}"]`) ||
                  document.querySelector(`[data-testid="${CSS.escape(finding.testId)}"] *`);
                if (el) return el;
              }
            } catch {}
            try {
              if (finding?.path) {
                const el = document.querySelector(finding.path);
                if (el) return el;
              }
            } catch {}
            return null;
          };

          (async () => {
            const el = pick();
            if (!el) {
              console.warn("[A11YFlowAudit] Could not find element to highlight.", finding);
              return;
            }
            const prev = el.getAttribute("data-a11yflowaudit-outline");
            el.setAttribute("data-a11yflowaudit-outline", "1");
            const oldOutline = el.style.outline;
            const oldOffset = el.style.outlineOffset;
            el.style.outline = "3px solid #ff79c6";
            el.style.outlineOffset = "3px";
            try { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch {}
            await sleep(1200);
            el.style.outline = oldOutline;
            el.style.outlineOffset = oldOffset;
            if (!prev) el.removeAttribute("data-a11yflowaudit-outline");
          })();
        },
        args: [finding]
      });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "RUN_AUDIT") {
      const { tabId, action, target, match, alsoConsole } = msg;

      const frames = await chrome.webNavigation.getAllFrames({ tabId });
      const frameUrlById = new Map((frames || []).map(f => [f.frameId, f.url || ""]));
      const allFrameIds = (frames || []).map(f => f.frameId);

      const resolved = await resolveTargetFrameIds({ tabId, target, frames, match });
      const finalFrameIds = resolved.length
        ? resolved
        : (target?.mode === "manual"
          ? (target.frameIds || [])
          : [0]);

      // 1) inject snippet + 2) run action per frame (best-effort; one bad frame shouldn't break all)
      const execRes = [];
      for (const frameId of finalFrameIds) {
        // Inject snippet
        try {
          await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frameId] },
            files: [SNIPPET_FILE],
            world: "MAIN"
          });
        } catch (e) {
          execRes.push({
            frameId,
            result: { ok: false, reason: "INJECT_FAILED", error: String(e?.message || e) }
          });
          continue;
        }

        // Run action
        try {
          const r = await chrome.scripting.executeScript({
            target: { tabId, frameIds: [frameId] },
            world: "MAIN",
            func: async (action, alsoConsole) => {
              const api = window.A11YFlowAudit;
              if (!api) return { ok: false, reason: "NO_API" };

              const res = await (async () => {
                if (action === "run") return api.run?.({ strict: true });
                if (action === "observe") return api.observe?.({ seconds: 12 });
                if (action === "watch") return api.watch?.({ seconds: 40 });
                if (action === "tabWalk") return api.tabWalk?.({ steps: 80 });
                if (action === "contrast") return api.contrastScan?.({ limit: 250 });
                return null;
              })();

              if (!res) return { ok: false, reason: "UNKNOWN_ACTION", action };

              if (alsoConsole) {
                try { console.log(`[A11YFlowAudit] ${action} result`, res); } catch {}
              }

              return { ok: true, result: res };
            },
            args: [action, !!alsoConsole]
          });

          // chrome.scripting.executeScript returns an array (even for single frame)
          execRes.push((r && r[0]) ? r[0] : { frameId, result: { ok: false, reason: "NO_RESULT" } });
        } catch (e) {
          execRes.push({
            frameId,
            result: { ok: false, reason: "EXEC_FAILED", error: String(e?.message || e) }
          });
        }
      }

      const perFrame = (execRes || []).map(r => ({
        frameId: r.frameId,
        frameUrl: frameUrlById.get(r.frameId) || "",
        ...r.result
      }));

      // choose best entry:
      // - prefer ok + has findings
      // - otherwise first ok
      // - otherwise first
      const bestEntry =
        perFrame.find(x => x.ok && Array.isArray(x?.result?.findings)) ||
        perFrame.find(x => x.ok) ||
        perFrame[0] ||
        null;

      sendResponse({
        ok: true,
        usedFrameIds: finalFrameIds,
        perFrame,
        bestEntry
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
