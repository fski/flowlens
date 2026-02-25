/**
 * Rule Pack filtering — tests for filterFindingsByRulePack, getActiveRulePack,
 * and the combined applyAllFindingFilters (depth + rule pack) behaviour.
 *
 * rulePack format: { enabledRuleIds?: string[], disabledRuleIds?: string[] }
 * - enabledRuleIds: only these rule types pass (allowlist)
 * - disabledRuleIds: these rule types are excluded (blocklist)
 * - disabledRuleIds takes precedence when a rule appears in both lists.
 * - null or empty rulePack means no rule-pack filtering.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";
import { Script } from "node:vm";

// Realistic finding objects
const FINDINGS = [
  { type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1" },
  { type: "BUTTON_NO_NAME", severity: "high", wcag: "4.1.2" },
  { type: "LINK_NO_TEXT", severity: "medium", wcag: "2.4.4" },
  { type: "COLOR_CONTRAST", severity: "medium", wcag: "1.4.3" },
  { type: "HEADING_ORDER", severity: "low", wcag: "1.3.1" },
];

// ══════════════════════════════════════════════════════
// filterFindingsByRulePack — core rule pack filtering
// ══════════════════════════════════════════════════════

describe("filterFindingsByRulePack", () => {
  const ctx = createContext();

  it("null rulePack returns all findings", () => {
    const result = ctx.filterFindingsByRulePack(FINDINGS, null);
    assert.equal(result.length, FINDINGS.length, "all findings should pass through with null rulePack");
    assert.deepEqual(result, FINDINGS);
  });

  it("undefined rulePack returns all findings", () => {
    const result = ctx.filterFindingsByRulePack(FINDINGS, undefined);
    assert.equal(result.length, FINDINGS.length, "all findings should pass through with undefined rulePack");
    assert.deepEqual(result, FINDINGS);
  });

  it("empty rulePack returns all findings", () => {
    const rulePack = { enabledRuleIds: [], disabledRuleIds: [] };
    const result = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    assert.equal(result.length, FINDINGS.length, "empty enabled/disabled arrays means no filtering");
    assert.deepEqual(result, FINDINGS);
  });

  it("disabledRuleIds removes specified rules", () => {
    const rulePack = { disabledRuleIds: ["IMG_MISSING_ALT"] };
    const result = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    assert.equal(result.length, FINDINGS.length - 1, "one finding should be excluded");
    const types = result.map(f => f.type);
    assert.ok(!types.includes("IMG_MISSING_ALT"), "IMG_MISSING_ALT should be filtered out");
    assert.ok(types.includes("BUTTON_NO_NAME"), "BUTTON_NO_NAME should remain");
    assert.ok(types.includes("LINK_NO_TEXT"), "LINK_NO_TEXT should remain");
  });

  it("disabledRuleIds removes multiple specified rules", () => {
    const rulePack = { disabledRuleIds: ["IMG_MISSING_ALT", "COLOR_CONTRAST"] };
    const result = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    assert.equal(result.length, 3, "two findings should be excluded");
    const types = result.map(f => f.type);
    assert.ok(!types.includes("IMG_MISSING_ALT"), "IMG_MISSING_ALT should be filtered out");
    assert.ok(!types.includes("COLOR_CONTRAST"), "COLOR_CONTRAST should be filtered out");
  });

  it("enabledRuleIds keeps only specified rules", () => {
    const rulePack = { enabledRuleIds: ["IMG_MISSING_ALT"] };
    const result = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    assert.equal(result.length, 1, "only IMG_MISSING_ALT should pass");
    assert.equal(result[0].type, "IMG_MISSING_ALT");
  });

  it("enabledRuleIds keeps multiple specified rules", () => {
    const rulePack = { enabledRuleIds: ["IMG_MISSING_ALT", "HEADING_ORDER"] };
    const result = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    assert.equal(result.length, 2, "only enabled rules should pass");
    const types = result.map(f => f.type);
    assert.ok(types.includes("IMG_MISSING_ALT"));
    assert.ok(types.includes("HEADING_ORDER"));
  });

  it("disabledRuleIds takes precedence over enabledRuleIds", () => {
    // IMG_MISSING_ALT is in both enabled and disabled — disabled wins
    const rulePack = {
      enabledRuleIds: ["IMG_MISSING_ALT", "BUTTON_NO_NAME"],
      disabledRuleIds: ["IMG_MISSING_ALT"],
    };
    const result = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    assert.equal(result.length, 1, "IMG_MISSING_ALT should be excluded despite being in enabledRuleIds");
    assert.equal(result[0].type, "BUTTON_NO_NAME");
  });

  it("deterministic — same input produces same output on repeated calls", () => {
    const rulePack = { disabledRuleIds: ["LINK_NO_TEXT"] };
    const first = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    const second = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    const third = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    assert.deepEqual(first, second);
    assert.deepEqual(second, third);
  });

  it("findings with unknown types are excluded by enabledRuleIds", () => {
    const findings = [
      { type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1" },
      { type: "TOTALLY_UNKNOWN_RULE", severity: "info", wcag: "0.0.0" },
      { type: "ANOTHER_MYSTERY", severity: "low", wcag: "9.9.9" },
    ];
    const rulePack = { enabledRuleIds: ["IMG_MISSING_ALT"] };
    const result = ctx.filterFindingsByRulePack(findings, rulePack);
    assert.equal(result.length, 1, "unknown types not in enabled list should be excluded");
    assert.equal(result[0].type, "IMG_MISSING_ALT");
  });

  it("findings with unknown types pass through disabledRuleIds if not listed", () => {
    const findings = [
      { type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1" },
      { type: "TOTALLY_UNKNOWN_RULE", severity: "info", wcag: "0.0.0" },
    ];
    const rulePack = { disabledRuleIds: ["IMG_MISSING_ALT"] };
    const result = ctx.filterFindingsByRulePack(findings, rulePack);
    assert.equal(result.length, 1, "unknown type should pass if not in disabled list");
    assert.equal(result[0].type, "TOTALLY_UNKNOWN_RULE");
  });

  it("non-array findings input returns empty array", () => {
    const r1 = ctx.filterFindingsByRulePack(null, { disabledRuleIds: ["X"] });
    assert.equal(r1.length, 0, "null findings should return empty array");
    const r2 = ctx.filterFindingsByRulePack(undefined, { enabledRuleIds: ["X"] });
    assert.equal(r2.length, 0, "undefined findings should return empty array");
  });

  it("empty findings array returns empty array", () => {
    const result = ctx.filterFindingsByRulePack([], { disabledRuleIds: ["IMG_MISSING_ALT"] });
    assert.equal(result.length, 0);
  });

  it("disabling a rule not present in findings changes nothing", () => {
    const rulePack = { disabledRuleIds: ["RULE_THAT_DOES_NOT_EXIST"] };
    const result = ctx.filterFindingsByRulePack(FINDINGS, rulePack);
    assert.equal(result.length, FINDINGS.length, "no findings should be removed");
    assert.deepEqual(result, FINDINGS);
  });
});

// ══════════════════════════════════════════════════════
// getActiveRulePack — reads the current active rule pack
// ══════════════════════════════════════════════════════

describe("getActiveRulePack", () => {
  it("returns null by default (no rule pack active)", () => {
    const ctx = createContext();
    const rp = ctx.getActiveRulePack();
    assert.equal(rp, null, "activeRulePack should default to null");
  });
});

// ══════════════════════════════════════════════════════
// applyAllFindingFilters — combined depth + rule pack
// ══════════════════════════════════════════════════════

describe("applyAllFindingFilters with rule pack", () => {
  it("applies both depth and rule pack filtering together", () => {
    const ctx = createContext();

    // Set depthMax to 1 — only depth-1 rules pass depth filter
    ctx.els.depthMax.value = "1";

    // Set activeRulePack via vm Script (it's a let-scoped variable)
    const setRulePack = new Script(
      `activeRulePack = { disabledRuleIds: ["ARIA_HIDDEN_FOCUSABLE"] };`,
      { filename: "set-rule-pack.js" }
    );
    setRulePack.runInContext(ctx);

    // IMG_MISSING_ALT is depth 1 — passes depth filter, not disabled — passes rule pack
    // ACCESSKEY_DUPLICATE is depth 2 — fails depth filter (depthMax=1)
    // ARIA_HIDDEN_FOCUSABLE is depth 1 — passes depth filter, but disabled — fails rule pack
    const findings = [
      { type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1" },
      { type: "ACCESSKEY_DUPLICATE", severity: "medium", wcag: "4.1.2" },
      { type: "ARIA_HIDDEN_FOCUSABLE", severity: "high", wcag: "4.1.2" },
    ];

    const result = ctx.applyAllFindingFilters(findings);
    assert.equal(result.length, 1, "only IMG_MISSING_ALT should survive both filters");
    assert.equal(result[0].type, "IMG_MISSING_ALT");
  });

  it("no rule pack active means only depth filter applies", () => {
    const ctx = createContext();
    ctx.els.depthMax.value = "1";

    // activeRulePack defaults to null — no rule pack filtering
    const findings = [
      { type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1" },
      { type: "ACCESSKEY_DUPLICATE", severity: "medium", wcag: "4.1.2" },
    ];

    const result = ctx.applyAllFindingFilters(findings);
    assert.equal(result.length, 1, "only depth filter should apply");
    assert.equal(result[0].type, "IMG_MISSING_ALT");
  });

  it("rule pack active with no depth restriction passes only rule-pack-allowed findings", () => {
    const ctx = createContext();
    ctx.els.depthMax.value = "3"; // no depth filtering

    const setRulePack = new Script(
      `activeRulePack = { enabledRuleIds: ["IMG_MISSING_ALT", "ACCESSKEY_DUPLICATE"] };`,
      { filename: "set-rule-pack.js" }
    );
    setRulePack.runInContext(ctx);

    const findings = [
      { type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1" },
      { type: "ACCESSKEY_DUPLICATE", severity: "medium", wcag: "4.1.2" },
      { type: "HEADING_ORDER", severity: "low", wcag: "1.3.1" },
    ];

    const result = ctx.applyAllFindingFilters(findings);
    assert.equal(result.length, 2, "only enabled rules should pass");
    const types = result.map(f => f.type);
    assert.ok(types.includes("IMG_MISSING_ALT"));
    assert.ok(types.includes("ACCESSKEY_DUPLICATE"));
    assert.ok(!types.includes("HEADING_ORDER"), "HEADING_ORDER should be excluded by rule pack");
  });
});
