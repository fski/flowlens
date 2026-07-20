/**
 * Shared predicates/constants extracted from duplicated inline copies
 * (panel audit). Guards the single source of truth.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { createContext } from "./harness.mjs";

describe("isCrossFrameFinding", () => {
  const ctx = createContext();
  it("true only for an elementless multiframe-group finding", () => {
    // MULTIFRAME_* rules map to group depth3/multiframe in RULE_TO_WCAG.
    new Script("this.__mfType = Object.keys(RULE_TO_WCAG).find(k => RULE_TO_WCAG[k] && RULE_TO_WCAG[k].group === 'depth3/multiframe');", { filename: "t.js" }).runInContext(ctx);
    const mf = ctx.__mfType;
    assert.ok(mf, "expected a multiframe rule in RULE_TO_WCAG");
    assert.equal(ctx.isCrossFrameFinding({ type: mf }), true);               // no el
    assert.equal(ctx.isCrossFrameFinding({ type: mf, el: {} }), false);      // has el
    assert.equal(ctx.isCrossFrameFinding({ type: "MISSING_ALT" }), false);   // wrong group
    assert.equal(ctx.isCrossFrameFinding({}), false);
    assert.equal(ctx.isCrossFrameFinding(null), false);
  });
});

describe("UNKNOWN_FRAME_KEY", () => {
  const ctx = createContext();
  it("is the single canonical unknown-frame sentinel", () => {
    new Script("this.__ufk = typeof UNKNOWN_FRAME_KEY !== 'undefined' ? UNKNOWN_FRAME_KEY : null;", { filename: "t.js" }).runInContext(ctx);
    assert.equal(ctx.__ufk, "fk::unknown::unknown::root::00000000");
  });
});

describe("currentBestEntry", () => {
  const ctx = createContext();
  it("prefers bestEntry, falls back to best, else null", () => {
    ctx.state.lastResult = { bestEntry: { a: 1 }, best: { b: 2 } };
    assert.equal(ctx.currentBestEntry().a, 1);
    ctx.state.lastResult = { best: { b: 2 } };
    assert.equal(ctx.currentBestEntry().b, 2);
    ctx.state.lastResult = null;
    assert.equal(ctx.currentBestEntry(), null);
  });
});
