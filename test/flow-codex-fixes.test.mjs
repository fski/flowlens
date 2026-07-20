/**
 * Fixes for Codex review of PR #65 (Flow rework).
 * P1#1 confidence-aware blocker predicate in the Flow view.
 * P1#2 baseline findings are not counted as regressions.
 * P1#3 resumed sessions (no findingIndex) get it synthesized from snapshots.
 * P1#4 screenshots keyed by stable step.id, not the mutable index.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();

function mkStep(index, findings, extra) {
  const findingIndex = {};
  for (const f of findings) findingIndex[f.sig] = f;
  return Object.assign({ index, id: "step_" + index, routeHint: "/s" + index, findingIndex }, extra || {});
}

describe("P1#1 — confidence-aware blocker predicate", () => {
  it("medium heuristic is NOT an unresolved blocker; medium strict and high ARE", () => {
    const heur = { sig: "MH", name: "chat not announced", type: "X", severity: "medium", wcag: "", confidence: "heuristic" };
    const strict = { sig: "MS", name: "y", type: "Y", severity: "medium", wcag: "", confidence: "strict" };
    const high = { sig: "H", name: "z", type: "Z", severity: "high", wcag: "", confidence: "heuristic" };
    assert.equal(ctx.flowStepViews({ steps: [mkStep(1, [heur])] })[0].unresolvedBlockers, 0);
    assert.equal(ctx.flowStepViews({ steps: [mkStep(1, [strict])] })[0].unresolvedBlockers, 1);
    assert.equal(ctx.flowStepViews({ steps: [mkStep(1, [high])] })[0].unresolvedBlockers, 1);
  });
});

describe("P1#2 — baseline findings are not regressions", () => {
  it("blockingAdded comes from authoritative step.diffs (baseline=0 → verdict PASS)", () => {
    const A = { sig: "A", name: "alt", type: "MISSING_ALT", severity: "high", wcag: "1.1.1", confidence: "strict" };
    // First step carries a blocker but the engine diff says 0 regressions (baseline).
    const sess = { id: "s", steps: [mkStep(1, [A], { diffs: { consolidated: { blockingAdded: 0 } } })] };
    assert.equal(ctx.flowStepViews(sess)[0].blockingAdded, 0);
    const header = ctx.flowVerdictHeaderHtml(sess);
    assert.match(header, /PASS/);
    assert.doesNotMatch(header, /blocking introduced/);
  });

  it("a real regression on a later step counts and fails", () => {
    const A = { sig: "A", name: "alt", type: "T", severity: "high", wcag: "", confidence: "strict" };
    const sess = { id: "s", steps: [
      mkStep(1, [], { diffs: { consolidated: { blockingAdded: 0 } } }),
      mkStep(2, [A], { diffs: { consolidated: { blockingAdded: 1 } } }),
    ] };
    assert.match(ctx.flowVerdictHeaderHtml(sess), /FAIL/);
  });
});

describe("P1#3 — resumed session synthesizes findingIndex from snapshots", () => {
  it("normalizeLoadedSession fills a missing findingIndex from the step snapshot", () => {
    const snapshot = {
      mode: "run",
      best: { frameKeyStable: "fk::test", normalized: { raw: { findings: [
        { type: "MISSING_ALT", severity: "high", name: "img", wcag: "1.1.1", confidence: "strict" },
      ] } } },
    };
    const loaded = ctx.normalizeLoadedSession({
      id: "resumed", schemaVersion: 4, steps: [{ index: 1, id: "step_1", snapshots: { run: snapshot, active: null } }],
    });
    const fi = loaded.steps[0].findingIndex;
    assert.ok(fi && typeof fi === "object");
    assert.equal(Object.keys(fi).length, 1);
    const meta = fi[Object.keys(fi)[0]];
    assert.equal(meta.name, "img");
    assert.equal(meta.confidence, "strict");
  });

  it("does not clobber an existing findingIndex", () => {
    const existing = { SIG: { sig: "SIG", name: "kept", type: "T", severity: "low", wcag: "", confidence: "strict" } };
    const loaded = ctx.normalizeLoadedSession({
      id: "r2", schemaVersion: 4, steps: [{ index: 1, id: "step_1", findingIndex: existing, snapshots: { run: null, active: null } }],
    });
    assert.equal(loaded.steps[0].findingIndex.SIG.name, "kept");
  });
});

describe("P2#5 — recorded video is retrievable", () => {
  it("verdict header shows a download-video control when session.hasVideo", () => {
    const A = { sig: "A", name: "n", type: "T", severity: "high", wcag: "", confidence: "strict" };
    const withVid = { id: "s", hasVideo: true, steps: [mkStep(1, [A], { diffs: { consolidated: { blockingAdded: 0 } } })] };
    const without = { id: "s", steps: [mkStep(1, [A], { diffs: { consolidated: { blockingAdded: 0 } } })] };
    assert.match(ctx.flowVerdictHeaderHtml(withVid), /data-flow-download-video/);
    assert.doesNotMatch(ctx.flowVerdictHeaderHtml(without), /data-flow-download-video/);
  });
});

describe("P1#4 — screenshots keyed by stable step.id", () => {
  it("filmstrip and detail reference data-shot-step by step.id, not index", () => {
    const A = { sig: "A", name: "n", type: "T", severity: "high", wcag: "", confidence: "strict" };
    const sess = { id: "s", steps: [mkStep(1, [A], { hasShot: true }), mkStep(2, [A], { hasShot: true })] };
    const film = ctx.filmstripHtml(sess, 2);
    assert.match(film, /data-shot-step="step_1"/);
    assert.match(film, /data-shot-step="step_2"/);
    const detail = ctx.stepDetailHtml(sess, 2);
    assert.match(detail, /data-shot-step="step_2"/);
  });

  it("emits data-shot-idx alongside the id for legacy numeric-key fallback", () => {
    const A = { sig: "A", name: "n", type: "T", severity: "high", wcag: "", confidence: "strict" };
    const sess = { id: "s", steps: [mkStep(1, [A], { hasShot: true })] };
    assert.match(ctx.filmstripHtml(sess, 1), /data-shot-step="step_1" data-shot-idx="1"/);
    assert.match(ctx.stepDetailHtml(sess, 1), /data-shot-idx="1"/);
  });
});
