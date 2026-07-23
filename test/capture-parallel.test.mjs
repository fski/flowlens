/**
 * Frame-parallelism tests for executeAuditAcrossFrames.
 *
 * Record-mode perf: frames used to run strictly sequentially, so a 2-frame
 * (host + MFE) capture doubled every fixed observe/watch window (12s → 24s).
 * Non-focus actions are read-only DOM scans and now run concurrently; the
 * result array order stays deterministic (usedFrameIds order). tabWalk is
 * the exception — it moves real focus, which is tab-global, so parallel
 * walks in two frames would fight over focus and corrupt both walks.
 *
 * Timing margins are deliberately wide (parallel budget is less than half
 * the sequential sum) so the assertions survive slow CI runners.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSwContext } from "./sw-harness.mjs";

const FRAMES = [
  { frameId: 0, parentFrameId: -1, url: "https://host.example/app" },
  { frameId: 7, parentFrameId: 0, url: "https://mfe.example/widget" },
];

const FINAL_TARGET = {
  ok: true,
  frameIds: [0, 7],
  scope: "all",
  selectionReason: "test",
};

/** executeScript mock: injections resolve instantly, per-frame audit funcs
 *  take `delayMs` (host wall clock). Records start/end times per call so the
 *  tests can assert OVERLAP (load-immune) instead of wall clock (a slow CI
 *  runner overshooting a timer must not flake the suite). */
function makeExecuteScript({ delayMs = 300, delayByFrame = {}, calls = [] } = {}) {
  return (opts) => {
    const frameId = Array.isArray(opts?.target?.frameIds) ? opts.target.frameIds[0] : 0;
    const call = {
      frameId,
      kind: opts.files ? "inject" : "func",
      args: opts.args || null,
      startedAt: Date.now(),
      endedAt: null,
    };
    calls.push(call);
    if (opts.files) { call.endedAt = Date.now(); return Promise.resolve([]); }
    if (opts.target?.allFrames) { call.endedAt = Date.now(); return Promise.resolve([]); } // probe pass
    const wait = delayByFrame[frameId] ?? delayMs;
    return new Promise((resolve) => {
      setTimeout(() => {
        call.endedAt = Date.now();
        resolve([{ frameId, result: { ok: false, reason: "TEST" } }]);
      }, wait);
    });
  };
}

const funcCall = (calls, frameId) => calls.find((c) => c.kind === "func" && c.frameId === frameId);

async function runAcrossFrames(ctx, { action, fastSettle = undefined }) {
  const t0 = Date.now();
  const out = await ctx.__executeAuditAcrossFrames({
    tabId: 1,
    action,
    target: { scope: "all" },
    match: null,
    modeHints: null,
    appMarkers: null,
    rootSelector: null,
    alsoConsole: false,
    wcagLevel: "2.1-AA",
    frames: FRAMES,
    finalTarget: FINAL_TARGET,
    frameProbeById: new Map(),
    ...(fastSettle === undefined ? {} : { fastSettle }),
  });
  return { out, elapsed: Date.now() - t0 };
}

describe("executeAuditAcrossFrames parallelism", () => {
  it("runs non-focus actions concurrently across frames", async () => {
    const calls = [];
    const ctx = createSwContext({ executeScript: makeExecuteScript({ delayMs: 300, calls }) });
    const { out } = await runAcrossFrames(ctx, { action: "run" });
    assert.equal(out.ok, true);
    // Overlap: frame 7's audit starts BEFORE frame 0's resolves.
    assert.ok(funcCall(calls, 7).startedAt < funcCall(calls, 0).endedAt,
      "frame 7 must start while frame 0 is still running");
  });

  it("keeps tabWalk sequential (focus is tab-global)", async () => {
    const calls = [];
    const ctx = createSwContext({ executeScript: makeExecuteScript({ delayMs: 300, calls }) });
    await runAcrossFrames(ctx, { action: "tabWalk" });
    assert.ok(funcCall(calls, 7).startedAt >= funcCall(calls, 0).endedAt,
      "frame 7 must not start until frame 0 finished");
  });

  it("preserves usedFrameIds order in perFrame even when the first frame is slower", async () => {
    const ctx = createSwContext({
      executeScript: makeExecuteScript({ delayByFrame: { 0: 300, 7: 30 } }),
    });
    const { out } = await runAcrossFrames(ctx, { action: "run" });
    // JSON round-trip: vm-realm arrays have foreign prototypes.
    assert.deepEqual(JSON.parse(JSON.stringify(out.perFrame.map((f) => f.frameId))), [0, 7]);
    assert.deepEqual(JSON.parse(JSON.stringify(out.usedFrameIds)), [0, 7]);
  });

  it("forwards fastSettle to the in-page audit call", async () => {
    const calls = [];
    const ctx = createSwContext({ executeScript: makeExecuteScript({ delayMs: 10, calls }) });
    await runAcrossFrames(ctx, { action: "observe", fastSettle: true });
    const funcCalls = calls.filter((c) => c.kind === "func" && Array.isArray(c.args));
    assert.ok(funcCalls.length >= 2, "one audit exec per frame");
    for (const c of funcCalls) {
      assert.equal(c.args[c.args.length - 1], true, "fastSettle must be the last injected arg");
    }
  });

  it("defaults fastSettle off when not requested", async () => {
    const calls = [];
    const ctx = createSwContext({ executeScript: makeExecuteScript({ delayMs: 10, calls }) });
    await runAcrossFrames(ctx, { action: "observe" });
    const funcCalls = calls.filter((c) => c.kind === "func" && Array.isArray(c.args));
    assert.ok(funcCalls.length >= 2, "one audit exec per frame");
    for (const c of funcCalls) {
      assert.equal(c.args[c.args.length - 1], false, "fastSettle defaults to false");
    }
  });
});
