/**
 * Flow diff + lifecycle builders. Pure functions over each step's findingIndex
 * (a map of stable-signature → finding metadata built at capture time). These
 * power the per-step Appeared/Persisting/Resolved diff and the cross-flow
 * issue-lifecycle swimlane — the two things competitors don't show.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();

// helper to build a step whose findingIndex is keyed by signature
function step(index, findings) {
  const findingIndex = {};
  for (const f of findings) findingIndex[f.sig] = f;
  return { index, findingIndex };
}

const A = { sig: "A", name: "Missing alt", type: "MISSING_ALT", severity: "high", wcag: "1.1.1" };
const B = { sig: "B", name: "Low contrast", type: "LOW_CONTRAST", severity: "medium", wcag: "1.4.3" };
const C = { sig: "C", name: "No label", type: "MISSING_LABEL", severity: "high", wcag: "1.3.1" };

describe("bucketStepDiff", () => {
  // Note: ctx-returned arrays carry the vm realm's prototypes, so deepStrictEqual
  // trips on prototype identity. Compare joined primitives instead (realm-safe).
  const sigs = (arr) => arr.map(x => x.sig).join(",");

  it("splits findings into appeared / persisting / resolved vs the previous step", () => {
    const s1 = step(1, [A, B]);
    const s2 = step(2, [B, C]);
    const d = ctx.bucketStepDiff(s2, s1);
    assert.equal(sigs(d.appeared), "C");
    assert.equal(sigs(d.persisting), "B");
    assert.equal(sigs(d.resolved), "A");
  });

  it("resolves RESOLVED items from the PREVIOUS step (they're gone from current)", () => {
    const s1 = step(1, [A]);
    const s2 = step(2, []);
    const d = ctx.bucketStepDiff(s2, s1);
    assert.equal(d.resolved.length, 1);
    assert.equal(d.resolved[0].name, "Missing alt");
    assert.equal(d.resolved[0].wcag, "1.1.1");
  });

  it("first step (no previous) => everything appeared, nothing resolved", () => {
    const d = ctx.bucketStepDiff(step(1, [A, B]), null);
    assert.equal(sigs(d.appeared), "A,B");
    assert.equal(d.resolved.length, 0);
    assert.equal(d.persisting.length, 0);
  });

  it("empty step => empty buckets, no throw", () => {
    const d = ctx.bucketStepDiff(step(1, []), null);
    assert.equal(d.appeared.length, 0);
    assert.equal(d.persisting.length, 0);
    assert.equal(d.resolved.length, 0);
  });
});

describe("buildIssueLifecycle", () => {
  it("one lane per recurring signature spanning the steps it is present in", () => {
    const steps = [
      step(1, [A, B]),
      step(2, [B]),
      step(3, [A, B]),
    ];
    const { lanes } = ctx.buildIssueLifecycle(steps);
    const laneA = lanes.find(l => l.sig === "A");
    const laneB = lanes.find(l => l.sig === "B");
    assert.equal(laneA.presentSteps.join(","), "1,3");
    assert.equal(laneA.firstStep, 1);
    assert.equal(laneA.lastStep, 3);
    assert.equal(laneB.presentSteps.join(","), "1,2,3");
    assert.equal(laneA.severity, "high");
    assert.ok(laneA.label);
  });

  it("orders lanes by severity (high before medium) then first appearance", () => {
    const steps = [step(1, [B]), step(2, [A])]; // B medium first, A high later
    const { lanes } = ctx.buildIssueLifecycle(steps);
    assert.equal(lanes[0].sig, "A"); // high wins despite appearing later
  });

  it("no steps => no lanes", () => {
    assert.deepEqual(ctx.buildIssueLifecycle([]).lanes, []);
  });
});
