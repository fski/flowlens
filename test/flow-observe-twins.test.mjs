/**
 * A Flow capture audits the page with Run and then Observe. Observe re-reports
 * the same static findings under "observe|…" signatures; they must not be
 * counted twice (Snap showed 28 findings, the Flow step "Appeared 56").
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const F = [
  { type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1", path: "img", tag: "IMG", confidence: "strict" },
  { type: "TOUCH_TARGET_TOO_SMALL", severity: "low", wcag: "2.5.8", path: "button", tag: "BUTTON" },
];
const snap = (mode, findings) => ({ mode, best: { frameKeyStable: "fk::v1::https://x.example::/", normalized: { raw: { findings } } } });

describe("Flow: Observe twins of Run findings count once", () => {
  it("findingIndex keeps one entry per issue, plus Observe-only findings", () => {
    const ctx = createContext();
    const onlyObserve = { type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED", severity: "medium", wcag: "4.1.3", path: "div", tag: "DIV" };
    const idx = ctx.buildFindingIndexForStep({ run: snap("run", F), active: snap("observe", [...F, onlyObserve]) });
    const keys = Object.keys(idx);
    assert.equal(keys.length, 3, keys.join("\n"));
    assert.equal(keys.filter((k) => k.startsWith("observe|")).length, 1, "only the Observe-only finding keeps an observe signature");
  });

  it("legacy stored indexes (captured before the fix) are deduped when read", () => {
    const ctx = createContext();
    const run = ctx.buildStepFindingIndex(snap("run", F));
    const obs = ctx.buildStepFindingIndex(snap("observe", F));
    const step = { index: 1, findingIndex: Object.assign({}, run, obs) };
    const d = ctx.bucketStepDiff(step, null);
    assert.equal(d.appeared.length, 2);
  });

  it("consolidated step diff counts each issue once", () => {
    const ctx = createContext();
    const step = { index: 1, snapshots: { run: snap("run", F), active: snap("observe", F) } };
    step.stableSignatures = { run: ctx.computeStableSignatureSet(step.snapshots.run), active: ctx.computeStableSignatureSet(step.snapshots.active) };
    const d = ctx.buildStepDiffs(step, null);
    assert.equal(d.consolidated.added, 2, JSON.stringify(d.consolidated));
  });
});
