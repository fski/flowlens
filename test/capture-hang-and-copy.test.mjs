/**
 * Hang + clipboard fixes (Piotr's manual on the DH help center, 23.07):
 *
 * 1. Recording froze mid-session: chrome.devtools.inspectedWindow.eval can
 *    LOSE its callback when the page navigates mid-eval. captureStepOptionC
 *    awaited fetchInspectedTitleBestEffort inside its try — an unresolved
 *    promise meant finally never ran and sessionState.inFlight stayed true
 *    forever. Fix: hard eval timeout + a 90s capture watchdog.
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

  it("observe survives a throwing rule and reports it (tickError)", () => {
    assert.match(SNIPPET_SRC, /tickBody\(\)/, "tick body must be wrapped");
    assert.match(SNIPPET_SRC, /tickError/, "tick failures must surface in the result");
  });
});

describe("capture watchdog + clipboard wiring", () => {
  it("captureStepOptionC anchors inFlightSince for the watchdog", () => {
    assert.match(CAPTURE_SRC, /inFlightSince = Date\.now\(\)/);
  });

  it("watchdog resets a stuck capture and fails loud", () => {
    assert.match(WIREUP_SRC, /CAPTURE_WATCHDOG_MS/);
    const wd = WIREUP_SRC.slice(WIREUP_SRC.indexOf("CAPTURE_WATCHDOG_MS"));
    assert.match(wd, /capture-watchdog-reset/, "reset must be visible in the nav log");
    assert.match(wd, /sessionState\.inFlight = false/);
  });

  it("watchdog invalidates the stuck capture (epoch) and drops a queued one (Codex P1+P2)", () => {
    const wd = WIREUP_SRC.slice(WIREUP_SRC.indexOf("CAPTURE_WATCHDOG_MS"));
    assert.match(wd, /captureEpoch/, "zombie captures must be invalidated, not just unlocked");
    assert.match(wd, /capture-watchdog-dropped-queued/, "a stale queued capture must not fire as a duplicate");
    // captureStepOptionC must check the epoch at both R1 checkpoints and in finally
    const epochChecks = (CAPTURE_SRC.match(/_epochAlive\(\)/g) || []).length;
    assert.ok(epochChecks >= 3, `expected >=3 epoch checks in capture path, found ${epochChecks}`);
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
