/**
 * Depth filtering — tests for filterFindingsByDepth, getActiveDepthMax,
 * and applyAllFindingFilters depth behaviour.
 *
 * RULE_TO_WCAG assigns a depthLevel (1, 2, or 3) to each rule.
 * filterFindingsByDepth keeps only findings whose depthLevel <= depthMax.
 * depthMax=3 means "show everything" (no filtering).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

// Realistic finding objects for each depth tier
const DEPTH_1_FINDING = { type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1" };
const DEPTH_2_FINDING = { type: "ACCESSKEY_DUPLICATE", severity: "medium", wcag: "4.1.2" };
const DEPTH_3_FINDING = { type: "CHAT_TIMESTAMP_INACCESSIBLE", severity: "low", wcag: "1.3.1" };
const UNKNOWN_FINDING = { type: "TOTALLY_INVENTED_RULE", severity: "info", wcag: "0.0.0" };

/**
 * Helper: set the depthMax <select> value in the document mock.
 * panel.js reads `els.depthMax` via `document.getElementById("depthMax")`,
 * so we must set the value on the document mock's cached element.
 */
function setDepthMax(ctx, value) {
  ctx.document._elCache["depthMax"].value = value;
}

// ══════════════════════════════════════════════════════
// filterFindingsByDepth — core depth filtering logic
// ══════════════════════════════════════════════════════

describe("filterFindingsByDepth", () => {
  const ctx = createContext();

  // Sanity: verify RULE_TO_WCAG has the expected depthLevel values
  it("RULE_TO_WCAG contains expected depth levels for test rules", () => {
    const ruleMap = ctx.__RULE_TO_WCAG;
    assert.equal(ruleMap.IMG_MISSING_ALT.depthLevel, 1, "IMG_MISSING_ALT should be depth 1");
    assert.equal(ruleMap.ACCESSKEY_DUPLICATE.depthLevel, 2, "ACCESSKEY_DUPLICATE should be depth 2");
    assert.equal(ruleMap.CHAT_TIMESTAMP_INACCESSIBLE.depthLevel, 3, "CHAT_TIMESTAMP_INACCESSIBLE should be depth 3");
  });

  it("depthMax=3 returns all findings (no filtering)", () => {
    const findings = [DEPTH_1_FINDING, DEPTH_2_FINDING, DEPTH_3_FINDING];
    const result = ctx.filterFindingsByDepth(findings, 3);
    assert.equal(result.length, 3, "all three findings should pass through at depth 3");
    assert.equal(result[0].type, "IMG_MISSING_ALT");
    assert.equal(result[1].type, "ACCESSKEY_DUPLICATE");
    assert.equal(result[2].type, "CHAT_TIMESTAMP_INACCESSIBLE");
  });

  it("depthMax=1 excludes depth 2 and depth 3 findings", () => {
    const findings = [DEPTH_1_FINDING, DEPTH_2_FINDING, DEPTH_3_FINDING];
    const result = ctx.filterFindingsByDepth(findings, 1);
    assert.equal(result.length, 1, "only depth-1 findings should remain");
    assert.equal(result[0].type, "IMG_MISSING_ALT");
  });

  it("depthMax=2 excludes depth 3 only", () => {
    const findings = [DEPTH_1_FINDING, DEPTH_2_FINDING, DEPTH_3_FINDING];
    const result = ctx.filterFindingsByDepth(findings, 2);
    assert.equal(result.length, 2, "depth 1 and 2 findings should remain");
    assert.equal(result[0].type, "IMG_MISSING_ALT");
    assert.equal(result[1].type, "ACCESSKEY_DUPLICATE");
  });

  it("unknown rule types pass through (not in RULE_TO_WCAG)", () => {
    const findings = [UNKNOWN_FINDING, DEPTH_3_FINDING];
    const result = ctx.filterFindingsByDepth(findings, 1);
    assert.equal(result.length, 1, "unknown rule should pass through, depth 3 should be excluded");
    assert.equal(result[0].type, "TOTALLY_INVENTED_RULE");
  });

  it("empty findings array returns empty", () => {
    const result = ctx.filterFindingsByDepth([], 1);
    assert.equal(result.length, 0);
  });

  it("non-array input returns empty array", () => {
    const nullResult = ctx.filterFindingsByDepth(null, 2);
    assert.ok(Array.isArray(nullResult), "null input should return an array");
    assert.equal(nullResult.length, 0, "null input should return empty array");

    const undefResult = ctx.filterFindingsByDepth(undefined, 2);
    assert.ok(Array.isArray(undefResult), "undefined input should return an array");
    assert.equal(undefResult.length, 0, "undefined input should return empty array");
  });

  it("deterministic — same input produces same output on repeated calls", () => {
    const findings = [DEPTH_1_FINDING, DEPTH_2_FINDING, DEPTH_3_FINDING];
    const first = ctx.filterFindingsByDepth(findings, 2);
    const second = ctx.filterFindingsByDepth(findings, 2);
    const third = ctx.filterFindingsByDepth(findings, 2);
    assert.equal(first.length, second.length, "first and second call should return same count");
    assert.equal(second.length, third.length, "second and third call should return same count");
    for (let i = 0; i < first.length; i++) {
      assert.equal(first[i].type, second[i].type, `element ${i} type should match across calls`);
      assert.equal(second[i].type, third[i].type, `element ${i} type should match across calls`);
    }
  });
});

// ══════════════════════════════════════════════════════
// C1/C2 Depth-3 rules — engine-backed rules at depthLevel 3
// ══════════════════════════════════════════════════════

describe("Depth-3 engine rules (C1/C2)", () => {
  const ctx = createContext();

  it("LIVE_CONTENT_NOT_ANNOUNCED has depthLevel 3", () => {
    assert.equal(ctx.__RULE_TO_WCAG.LIVE_CONTENT_NOT_ANNOUNCED.depthLevel, 3);
  });

  it("INPUT_LOSES_FOCUS_ON_UPDATE has depthLevel 3", () => {
    assert.equal(ctx.__RULE_TO_WCAG.INPUT_LOSES_FOCUS_ON_UPDATE.depthLevel, 3);
  });

  it("depthMax=2 excludes LIVE_CONTENT_NOT_ANNOUNCED", () => {
    const findings = [{ type: "LIVE_CONTENT_NOT_ANNOUNCED", severity: "medium" }];
    const result = ctx.filterFindingsByDepth(findings, 2);
    assert.equal(result.length, 0);
  });

  it("depthMax=3 includes LIVE_CONTENT_NOT_ANNOUNCED", () => {
    const findings = [{ type: "LIVE_CONTENT_NOT_ANNOUNCED", severity: "medium" }];
    const result = ctx.filterFindingsByDepth(findings, 3);
    assert.equal(result.length, 1);
  });

  it("depthMax=2 excludes INPUT_LOSES_FOCUS_ON_UPDATE", () => {
    const findings = [{ type: "INPUT_LOSES_FOCUS_ON_UPDATE", severity: "medium" }];
    const result = ctx.filterFindingsByDepth(findings, 2);
    assert.equal(result.length, 0);
  });

  it("depthMax=3 includes INPUT_LOSES_FOCUS_ON_UPDATE", () => {
    const findings = [{ type: "INPUT_LOSES_FOCUS_ON_UPDATE", severity: "medium" }];
    const result = ctx.filterFindingsByDepth(findings, 3);
    assert.equal(result.length, 1);
  });

  it("legacy ids from old sessions keep depthLevel 3 filtering behavior", () => {
    assert.equal(ctx.__RULE_TO_WCAG.CHAT_NEW_MESSAGE_NOT_ANNOUNCED.depthLevel, 3);
    assert.equal(ctx.__RULE_TO_WCAG.CHAT_INPUT_LOSES_FOCUS_ON_UPDATE.depthLevel, 3);
    const legacy = [{ type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED", severity: "medium" }];
    assert.equal(ctx.filterFindingsByDepth(legacy, 2).length, 0);
    assert.equal(ctx.filterFindingsByDepth(legacy, 3).length, 1);
  });
});

// ══════════════════════════════════════════════════════
// C3/C4 Depth-3 rules — Phase B engine-backed rules at depthLevel 3
// ══════════════════════════════════════════════════════

describe("Depth-3 engine rules (C3/C4)", () => {
  const ctx = createContext();

  it("LIVE_REGION_MISSING_ROLE has depthLevel 3", () => {
    assert.equal(ctx.__RULE_TO_WCAG.LIVE_REGION_MISSING_ROLE.depthLevel, 3);
  });

  it("LIVE_ITEM_NOT_ITEMIZED has depthLevel 3", () => {
    assert.equal(ctx.__RULE_TO_WCAG.LIVE_ITEM_NOT_ITEMIZED.depthLevel, 3);
  });

  it("ANNOUNCEMENT_IN_DIFFERENT_FRAME has depthLevel 3", () => {
    assert.equal(ctx.__RULE_TO_WCAG.ANNOUNCEMENT_IN_DIFFERENT_FRAME.depthLevel, 3);
  });

  it("COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE has depthLevel 3", () => {
    assert.equal(ctx.__RULE_TO_WCAG.COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE.depthLevel, 3);
  });

  it("depthMax=2 excludes LIVE_REGION_MISSING_ROLE", () => {
    const result = ctx.filterFindingsByDepth([{ type: "LIVE_REGION_MISSING_ROLE", severity: "medium" }], 2);
    assert.equal(result.length, 0);
  });

  it("depthMax=3 includes LIVE_REGION_MISSING_ROLE", () => {
    const result = ctx.filterFindingsByDepth([{ type: "LIVE_REGION_MISSING_ROLE", severity: "medium" }], 3);
    assert.equal(result.length, 1);
  });

  it("depthMax=2 excludes LIVE_ITEM_NOT_ITEMIZED", () => {
    const result = ctx.filterFindingsByDepth([{ type: "LIVE_ITEM_NOT_ITEMIZED", severity: "low" }], 2);
    assert.equal(result.length, 0);
  });

  it("depthMax=3 includes LIVE_ITEM_NOT_ITEMIZED", () => {
    const result = ctx.filterFindingsByDepth([{ type: "LIVE_ITEM_NOT_ITEMIZED", severity: "low" }], 3);
    assert.equal(result.length, 1);
  });

  it("depthMax=2 excludes ANNOUNCEMENT_IN_DIFFERENT_FRAME", () => {
    const result = ctx.filterFindingsByDepth([{ type: "ANNOUNCEMENT_IN_DIFFERENT_FRAME", severity: "medium" }], 2);
    assert.equal(result.length, 0);
  });

  it("depthMax=3 includes ANNOUNCEMENT_IN_DIFFERENT_FRAME", () => {
    const result = ctx.filterFindingsByDepth([{ type: "ANNOUNCEMENT_IN_DIFFERENT_FRAME", severity: "medium" }], 3);
    assert.equal(result.length, 1);
  });

  it("depthMax=2 excludes COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE", () => {
    const result = ctx.filterFindingsByDepth([{ type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE", severity: "medium" }], 2);
    assert.equal(result.length, 0);
  });

  it("depthMax=3 includes COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE", () => {
    const result = ctx.filterFindingsByDepth([{ type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE", severity: "medium" }], 3);
    assert.equal(result.length, 1);
  });
});

// ══════════════════════════════════════════════════════
// getActiveDepthMax — reads depthMax element value
// ══════════════════════════════════════════════════════

describe("getActiveDepthMax", () => {
  it("defaults to 3 when element value is empty", () => {
    const ctx = createContext();
    setDepthMax(ctx, "");
    assert.equal(ctx.getActiveDepthMax(), 3, "empty string should default to 3");
  });

  it("defaults to 3 when element value is non-numeric", () => {
    const ctx = createContext();
    setDepthMax(ctx, "abc");
    assert.equal(ctx.getActiveDepthMax(), 3, "non-numeric value should default to 3");
  });

  it("defaults to 3 when element value is out of range", () => {
    const ctx = createContext();
    setDepthMax(ctx, "5");
    assert.equal(ctx.getActiveDepthMax(), 3, "out-of-range value should default to 3");
  });

  it("reads element value 1 correctly", () => {
    const ctx = createContext();
    setDepthMax(ctx, "1");
    assert.equal(ctx.getActiveDepthMax(), 1);
  });

  it("reads element value 2 correctly", () => {
    const ctx = createContext();
    setDepthMax(ctx, "2");
    assert.equal(ctx.getActiveDepthMax(), 2);
  });

  it("reads element value 3 correctly", () => {
    const ctx = createContext();
    setDepthMax(ctx, "3");
    assert.equal(ctx.getActiveDepthMax(), 3);
  });
});

// ══════════════════════════════════════════════════════
// applyAllFindingFilters — depth integration path
// ══════════════════════════════════════════════════════

describe("applyAllFindingFilters depth integration", () => {
  it("applies depth filtering based on depthMax element value", () => {
    const ctx = createContext();
    setDepthMax(ctx, "1");
    const findings = [DEPTH_1_FINDING, DEPTH_2_FINDING, DEPTH_3_FINDING];
    const result = ctx.applyAllFindingFilters(findings);
    assert.equal(result.length, 1, "only depth-1 findings should remain when depthMax=1");
    assert.equal(result[0].type, "IMG_MISSING_ALT");
  });

  it("returns all findings when depthMax is unset (defaults to 3)", () => {
    const ctx = createContext();
    setDepthMax(ctx, "");
    const findings = [DEPTH_1_FINDING, DEPTH_2_FINDING, DEPTH_3_FINDING];
    const result = ctx.applyAllFindingFilters(findings);
    assert.equal(result.length, 3, "all findings should pass through at default depth");
  });
});
