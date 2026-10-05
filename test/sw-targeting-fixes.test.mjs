/**
 * SW targeting/capture fixes:
 * - URL heuristics that match nothing must not hand the audit to an
 *   arbitrary iframe (the flat +1 subframe bonus did exactly that).
 * - CAPTURE_STEP skips the active window when the baseline failed.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSwContext } from "./sw-harness.mjs";

describe("computeFrameScores — subframe bonus only for matched frames", () => {
  const frames = [
    { frameId: 0, parentFrameId: -1, url: "https://shop.example/checkout" },
    { frameId: 5, parentFrameId: 0, url: "https://ads.example/slot" },
  ];

  it("no URL include matches → every frame scores 0 (no arbitrary iframe win)", async () => {
    const ctx = createSwContext({ executeScript: async () => [] });
    const { scored } = await ctx.__computeFrameScores({ tabId: 1, frames, match: { urlIncludes: ["helpcenter"] } });
    for (const s of scored) assert.equal(s.score, 0, `frame ${s.frameId}`);
    const pick = ctx.__pickBestFrameFromCandidates({ scored, candidateIds: [0, 5], fallbackToTop: true });
    assert.equal(pick.frameId, 0);
    assert.notEqual(pick.reason, "scored_best");
  });

  it("a matching iframe still wins and keeps its tie-break bonus", async () => {
    const ctx = createSwContext({ executeScript: async () => [] });
    const { scored } = await ctx.__computeFrameScores({ tabId: 1, frames, match: { urlIncludes: ["ads.example"] } });
    assert.equal(scored[0].frameId, 5);
    assert.equal(scored[0].score, 6); // 5 (URL include) + 1 (embedded tie-break)
  });
});

describe("CAPTURE_STEP — failed baseline skips the active window", () => {
  it("does not run the active mode when the baseline audit failed", async () => {
    let listener = null;
    const actions = [];
    createSwContext({
      captureListener: (fn) => { listener = fn; },
      getAllFrames: async () => [{ frameId: 0, parentFrameId: -1, url: "https://x.example/" }],
      executeScript: async (opts) => {
        if (opts.files) return [];
        if (opts.target?.allFrames) return [];
        if (Array.isArray(opts.args) && typeof opts.args[0] === "string") actions.push(opts.args[0]);
        return [{ frameId: 0, result: { ok: false, reason: "NO_API" } }];
      },
    });
    const r = await new Promise((resolve) => listener(
      { type: "CAPTURE_STEP", tabId: 1, action: "observe", activeMode: "observe", target: { scope: "host" } },
      { id: "test-extension-id" }, resolve));
    assert.equal(r.ok, true);
    assert.equal(r.active, null);
    assert.ok(!actions.includes("observe"), `active window ran: ${actions.join(",")}`);
  });
});
