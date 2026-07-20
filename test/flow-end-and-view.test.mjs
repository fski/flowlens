/**
 * Flow "can't end" + overload fixes.
 * - The End button must stay enabled during an in-flight capture so a session
 *   can always be ended (auto-capture no longer traps you).
 * - The verdict header is slimmed (step count + two key numbers) for the
 *   progressive-disclosure layout.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

describe("End button stays enabled during capture", () => {
  it("sessionEnd is enabled even while inFlight (so you can always end)", () => {
    const ctx = createContext();
    ctx.sessionState.current = { id: "s", steps: [], startedAt: 1 };
    ctx.sessionState.inFlight = true;
    ctx._state.running = false;
    ctx.updateSessionButtons();
    assert.equal(ctx.els.sessionEnd.disabled, false);
  });

  it("sessionEnd is disabled only when there is no session", () => {
    const ctx = createContext();
    ctx.sessionState.current = null;
    ctx.updateSessionButtons();
    assert.equal(ctx.els.sessionEnd.disabled, true);
  });
});

describe("slim verdict header", () => {
  const ctx = createContext();
  function mkStep(index, findings, extra) {
    const findingIndex = {};
    for (const f of findings) findingIndex[f.sig] = f;
    return Object.assign({ index, id: "step_" + index, findingIndex }, extra || {});
  }
  const A = { sig: "A", name: "alt", type: "T", severity: "high", wcag: "", confidence: "strict" };

  it("shows the step count and the two key numbers, not the worst-step tile", () => {
    const sess = { id: "s", steps: [
      mkStep(1, [A], { diffs: { consolidated: { blockingAdded: 0 } } }),
      mkStep(2, [A], { diffs: { consolidated: { blockingAdded: 1 } } }),
    ] };
    const html = ctx.flowVerdictHeaderHtml(sess);
    assert.match(html, /2 steps/);
    assert.match(html, /Issues now/);
    assert.match(html, /Blocking/);
    assert.doesNotMatch(html, /Worst/);      // moved out of the slim header
    assert.doesNotMatch(html, /New total/);  // moved out of the slim header
  });
});
