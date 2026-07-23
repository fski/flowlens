/**
 * Hang + clipboard fixes (Piotr's manual on the DH help center, 23.07):
 *
 * 1. Recording froze mid-session: chrome.devtools.inspectedWindow.eval can
 *    LOSE its callback when the page navigates mid-eval. captureStepOptionC
 *    awaited fetchInspectedTitleBestEffort inside its try — an unresolved
 *    promise meant finally never ran and sessionState.inFlight stayed true
 *    forever. Fix: hard eval timeout + a 120s capture watchdog.
 * 2. "Copy JSON" silently copied "{}" during flow sessions (no Snap result),
 *    and session JSON had NO clipboard path at all (download only, while MD
 *    had copy). Fix: guard toast + Copy Session JSON menu item.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createContext } from "./harness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIREUP_SRC = readFileSync(join(__dirname, "..", "src", "panel", "panel-90-wireup.js"), "utf8");
const CAPTURE_SRC = readFileSync(join(__dirname, "..", "src", "panel", "panel-45-capture.js"), "utf8");
const HTML_SRC = readFileSync(join(__dirname, "..", "src", "panel", "panel.html"), "utf8");

// The harness stubs setTimeout to fire synchronously; the timeout behavior
// under test needs real timers, so inject the host's.
function ctxWithRealTimers() {
  const ctx = createContext();
  ctx.setTimeout = (fn, ms) => setTimeout(fn, ms);
  ctx.clearTimeout = (t) => clearTimeout(t);
  return ctx;
}

describe("fetchInspectedTitleBestEffort eval timeout", () => {
  it("resolves empty when the eval callback is never invoked (lost on navigation)", async () => {
    const ctx = ctxWithRealTimers();
    ctx.chrome.devtools.inspectedWindow.eval = () => { /* callback dropped */ };
    const t0 = Date.now();
    const title = await ctx.fetchInspectedTitleBestEffort();
    assert.equal(title, "");
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 1400 && elapsed < 5000, `should time out around 1.5s, took ${elapsed}ms`);
  });

  it("resolves the title immediately when the eval works", async () => {
    const ctx = ctxWithRealTimers();
    ctx.chrome.devtools.inspectedWindow.eval = (_expr, cb) => cb("Help Center", null);
    assert.equal(await ctx.fetchInspectedTitleBestEffort(), "Help Center");
  });

  it("resolves empty when eval throws synchronously", async () => {
    const ctx = ctxWithRealTimers();
    ctx.chrome.devtools.inspectedWindow.eval = () => { throw new Error("target detached"); };
    assert.equal(await ctx.fetchInspectedTitleBestEffort(), "");
  });
});

import { createSwContext } from "./sw-harness.mjs";

describe("SW exec timeout — a hung page promise must not hold the audit lock", () => {
  // Round 2 of the hang: the injected observe/watch promise can never
  // resolve (page timer throttling, document churn). executeScript then
  // never settles, the CAPTURE_STEP handler keeps _auditLockByTab forever
  // and EVERY subsequent capture hangs on the lock — the panel watchdog
  // resets, the user retries, and it hangs again immediately.
  it("returns EXEC_TIMEOUT instead of hanging when the audit call never settles", async () => {
    const ctx = createSwContext({
      executeScript: (opts) => {
        if (opts.files) return Promise.resolve([]);
        return new Promise(() => {}); // page-side promise never resolves
      },
    });
    ctx.__setExecTimeoutForTest(150); // shrink the cap for the test
    const t0 = Date.now();
    const r = await ctx.__execAuditActionInFrame({ tabId: 1, frameId: 0, action: "observe", alsoConsole: false, wcagLevel: "2.1-AA" });
    const elapsed = Date.now() - t0;
    assert.ok(elapsed < 5000, `must not hang (took ${elapsed}ms)`);
    assert.equal(r.result.ok, false);
    assert.equal(r.result.reason, "EXEC_TIMEOUT");
  });

  it("all-frame timeouts surface as a top-level AUDIT_TIMED_OUT failure, not a clean 0-finding run", async () => {
    const ctx = createSwContext({
      executeScript: (opts) => {
        if (opts.files) return Promise.resolve([]);
        if (opts.target?.allFrames) return Promise.resolve([]);
        return new Promise(() => {}); // every frame hangs
      },
    });
    ctx.__setExecTimeoutForTest(120);
    const out = await ctx.__executeAuditAcrossFrames({
      tabId: 1, action: "observe", target: { scope: "all" }, match: null,
      modeHints: null, appMarkers: null, rootSelector: null, alsoConsole: false,
      wcagLevel: "2.1-AA",
      frames: [{ frameId: 0, parentFrameId: -1, url: "https://x.com/a" }],
      finalTarget: { ok: true, frameIds: [0], scope: "all", selectionReason: "test" },
      frameProbeById: new Map(),
    });
    assert.equal(out.ok, false);
    assert.equal(out.error, "AUDIT_TIMED_OUT");
  });

  it("a single timed-out frame does not sink a run with surviving frames", async () => {
    const ctx = createSwContext({
      executeScript: (opts) => {
        if (opts.files) return Promise.resolve([]);
        if (opts.target?.allFrames) return Promise.resolve([]);
        const frameId = opts.target.frameIds[0];
        if (frameId === 7) return new Promise(() => {}); // MFE frame hangs
        return Promise.resolve([{ frameId, result: { ok: true, result: { findings: [], mode: "run" } } }]);
      },
    });
    ctx.__setExecTimeoutForTest(120);
    const out = await ctx.__executeAuditAcrossFrames({
      tabId: 1, action: "run", target: { scope: "all" }, match: null,
      modeHints: null, appMarkers: null, rootSelector: null, alsoConsole: false,
      wcagLevel: "2.1-AA",
      frames: [
        { frameId: 0, parentFrameId: -1, url: "https://x.com/a" },
        { frameId: 7, parentFrameId: 0, url: "https://mfe.example/w" },
      ],
      finalTarget: { ok: true, frameIds: [0, 7], scope: "all", selectionReason: "test" },
      frameProbeById: new Map(),
    });
    assert.equal(out.ok, true, "partial results are still a valid run");
    const timedOut = out.perFrame.find((f) => f.frameId === 7);
    assert.equal(timedOut.reason, "EXEC_TIMEOUT", "the hung frame stays visible in perFrame");
  });

  it("action-specific caps exist and exceed the corresponding audit windows", () => {
    const ctx = createSwContext();
    const caps = JSON.parse(JSON.stringify(ctx.__EXEC_TIMEOUT_MS));
    assert.ok(caps.observe > 12000, "observe cap must exceed the 12s window");
    assert.ok(caps.watch > 40000, "watch cap must exceed the 40s window");
    assert.ok(caps.run >= 15000);
    assert.ok(caps.tabWalk >= 30000);
  });
});

describe("snippet identifier hygiene", () => {
  const SNIPPET_SRC = readFileSync(join(__dirname, "..", "src", "snippet", "a11y-audit-snippet.js"), "utf8");

  it("never references the undefined `win` alias (the window alias is `w`)", () => {
    // `win.getComputedStyle` in CHAT_SCROLL_REGION_NOT_FOCUSABLE threw a
    // ReferenceError on every page with a visible scrollable role=log/feed
    // (help centers, chat widgets) and killed the whole run()/observe —
    // unreachable by DOM-less unit tests because the rule needs layout.
    assert.doesNotMatch(SNIPPET_SRC, /\bwin\./, "use `w` (the window alias) instead of `win`");
  });

  it("a totally-failed observe rejects instead of resolving as a clean result (Codex on #89)", () => {
    assert.match(SNIPPET_SRC, /observe failed on every completed tick/, "zero successful ticks must reject, not resolve");
    assert.match(SNIPPET_SRC, /watch failed on every completed tick/, "watch got the same zero-tick reject (review 23.07)");
  });

  it("all-frames EXEC_FAILED promotes to top-level AUDIT_FAILED", async () => {
    const ctx = createSwContext({
      executeScript: (opts) => {
        if (opts.files) return Promise.resolve([]);
        if (opts.target?.allFrames) return Promise.resolve([]);
        return Promise.reject(new Error("boom"));
      },
    });
    const out = await ctx.__executeAuditAcrossFrames({
      tabId: 1, action: "observe", target: { scope: "all" }, match: null,
      modeHints: null, appMarkers: null, rootSelector: null, alsoConsole: false,
      wcagLevel: "2.1-AA",
      frames: [{ frameId: 0, parentFrameId: -1, url: "https://x.com/a" }],
      finalTarget: { ok: true, frameIds: [0], scope: "all", selectionReason: "test" },
      frameProbeById: new Map(),
    });
    assert.equal(out.ok, false);
    assert.equal(out.error, "AUDIT_FAILED");
  });

  it("observe survives a throwing rule and reports it (tickError)", () => {
    assert.match(SNIPPET_SRC, /tickBody\(\)/, "tick body must be wrapped");
    assert.match(SNIPPET_SRC, /tickError/, "tick failures must surface in the result");
  });
});

describe("capture watchdog + clipboard wiring", () => {
  it("captureStepOptionC anchors inFlightSince for the watchdog", () => {
    assert.match(CAPTURE_SRC, /inFlightSince = Date\.now\(\)/);
  });

  // Behavioral (review 23.07: the previous source-grep versions could not
  // fail when the behavior broke): captureWatchdogTick now lives in the
  // harness-loaded zone and is executed directly.
  it("watchdog tick resets a stuck capture: epoch bump, queued drop, inFlight cleared", () => {
    const ctx = createContext();
    ctx.toast = () => {};
    ctx.updateSessionButtons = () => {};
    ctx.logNavDecision = () => {}; // lives in the wireup zone, not harness-loaded
    ctx.sessionState.inFlight = true;
    ctx.sessionState.inFlightSince = 1_000_000;
    ctx.sessionState.captureEpoch = 5;
    ctx.sessionState.queuedCapture = { isAutoCapture: true };
    ctx.sessionState.captureBudgetMs = 120000;
    const fired = ctx.captureWatchdogTick(1_000_000 + 120001);
    assert.equal(fired, true);
    assert.equal(ctx.sessionState.inFlight, false);
    assert.equal(ctx.sessionState.captureEpoch, 6, "zombie must be invalidated");
    assert.equal(ctx.sessionState.queuedCapture, null, "stale queued capture must be dropped");
  });

  it("watchdog tick does NOT fire inside the per-capture budget", () => {
    const ctx = createContext();
    ctx.toast = () => {};
    ctx.logNavDecision = () => {};
    ctx.sessionState.inFlight = true;
    ctx.sessionState.inFlightSince = 1_000_000;
    ctx.sessionState.captureEpoch = 5;
    ctx.sessionState.captureBudgetMs = 210000; // 3-frame tabWalk budget
    const fired = ctx.captureWatchdogTick(1_000_000 + 150000); // stuck-by-old-flat-limit, legal now
    assert.equal(fired, false, "a legitimate long tabWalk capture must not be killed");
    assert.equal(ctx.sessionState.inFlight, true);
    assert.equal(ctx.sessionState.captureEpoch, 5);
  });

  it("computeCaptureBudgetMs widens only for sequential tabWalk and stays capped", () => {
    const ctx = createContext();
    assert.equal(ctx.computeCaptureBudgetMs("observe", 3), 120000);
    assert.equal(ctx.computeCaptureBudgetMs("watch", 3), 120000);
    assert.equal(ctx.computeCaptureBudgetMs("tabWalk", 1), 120000);
    assert.equal(ctx.computeCaptureBudgetMs("tabWalk", 3), 210000, "3 frames × 45s SW cap + baseline must fit");
    assert.equal(ctx.computeCaptureBudgetMs("tabWalk", 50), 60000 + 50000 * 8, "frame count capped at 8");
  });

  it("epoch checks cover the error branches and the post-persist window (review 23.07)", () => {
    const epochChecks = (CAPTURE_SRC.match(/_epochAlive\(\)/g) || []).length;
    assert.ok(epochChecks >= 6, `expected >=6 epoch checks in capture path, found ${epochChecks}`);
    assert.match(CAPTURE_SRC, /zombie transport failure discarded/);
    assert.match(CAPTURE_SRC, /invalidated after persist/);
    const endSession = CAPTURE_SRC.slice(CAPTURE_SRC.indexOf("async function endSession"), CAPTURE_SRC.indexOf("async function captureStepOptionC"));
    assert.match(endSession, /captureEpoch/, "endSession must invalidate in-flight captures");
  });

  it("sentinel busy flag has a stuck-watchdog with generation guard (review 23.07)", () => {
    assert.match(WIREUP_SRC, /DOM_POLL_STUCK_MS/);
    assert.match(WIREUP_SRC, /dom-poll-watchdog-reset/);
    assert.match(WIREUP_SRC, /_pollGen === _domPollGen/, "an orphaned poll must not clear a newer generation's flag");
  });

  it("Copy JSON refuses to silently copy an empty Snap result", () => {
    const handler = WIREUP_SRC.slice(WIREUP_SRC.indexOf('els.copyJson.addEventListener'));
    assert.match(handler.slice(0, 600), /if \(!state\.lastResult\)/);
  });

  it("session JSON has a clipboard path (menu item + handler + fn)", () => {
    assert.match(HTML_SRC, /copySessionJsonMenu/);
    assert.match(WIREUP_SRC, /copySessionJson\(\)/);
  });
});
