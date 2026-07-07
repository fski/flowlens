/**
 * Component rollup — pure function tests for groupFindingsByComponent
 * (signature-engine.js) plus the ×N group badge in explorerRowHtml.
 */

import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { createContext } from "./harness.mjs";

const finding = (over = {}) => ({
  type: "NO_ACCESSIBLE_NAME",
  severity: "medium",
  wcag: "4.1.2",
  name: "button",
  path: "main > ul > li:nth-child(2) > button",
  ...over,
});

// ══════════════════════════════════════════════════════
// groupFindingsByComponent — grouping behaviour
// ══════════════════════════════════════════════════════

describe("groupFindingsByComponent grouping", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("returns [] for null / undefined / non-array input", () => {
    assert.equal(ctx.groupFindingsByComponent(null).length, 0);
    assert.equal(ctx.groupFindingsByComponent(undefined).length, 0);
    assert.equal(ctx.groupFindingsByComponent("nope").length, 0);
  });

  it("returns [] for empty array", () => {
    assert.equal(ctx.groupFindingsByComponent([]).length, 0);
  });

  it("collapses :nth-child(n) variants of the same component", () => {
    const a = finding({ path: "main > ul > li:nth-child(2) > button" });
    const b = finding({ path: "main > ul > li:nth-child(7) > button" });
    const groups = ctx.groupFindingsByComponent([a, b]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 2);
    assert.equal(groups[0].findings.length, 2);
  });

  it("collapses :nth-of-type(n) variants of the same component", () => {
    const a = finding({ path: "div > section:nth-of-type(1) > img" });
    const b = finding({ path: "div > section:nth-of-type(4) > img" });
    const groups = ctx.groupFindingsByComponent([a, b]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 2);
  });

  it("collapses [data-index] discriminators", () => {
    const a = finding({ path: 'div > [data-index="3"] > span' });
    const b = finding({ path: 'div > [data-index="9"] > span' });
    const groups = ctx.groupFindingsByComponent([a, b]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 2);
  });

  it("collapses trailing numeric indices in id tokens", () => {
    const a = finding({ path: "#item-3 > button" });
    const b = finding({ path: "#item-12 > button" });
    const groups = ctx.groupFindingsByComponent([a, b]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 2);
  });

  it("does NOT collapse findings of different types on the same selector", () => {
    const a = finding({ type: "NO_ACCESSIBLE_NAME" });
    const b = finding({ type: "POSITIVE_TABINDEX" });
    const groups = ctx.groupFindingsByComponent([a, b]);
    assert.equal(groups.length, 2);
    const types = [...groups].map(g => g.type).sort();
    assert.equal(types.join(","), "NO_ACCESSIBLE_NAME,POSITIVE_TABINDEX");
  });

  it("does NOT collapse structurally different selectors", () => {
    const a = finding({ path: "main > ul > li:nth-child(2) > button" });
    const b = finding({ path: "footer > nav > a" });
    const groups = ctx.groupFindingsByComponent([a, b]);
    assert.equal(groups.length, 2);
  });

  it("componentKey embeds the finding type", () => {
    const groups = ctx.groupFindingsByComponent([finding()]);
    assert.equal(groups.length, 1);
    assert.ok(groups[0].componentKey.startsWith("NO_ACCESSIBLE_NAME::"));
  });

  it("sample is the first finding seen for the group", () => {
    const a = finding({ path: "ul > li:nth-child(1) > button", name: "first" });
    const b = finding({ path: "ul > li:nth-child(2) > button", name: "second" });
    const groups = ctx.groupFindingsByComponent([a, b]);
    assert.equal(groups[0].sample, a);
    assert.equal(groups[0].sample.name, "first");
  });

  it("group severity is the max severity across instances", () => {
    const a = finding({ path: "ul > li:nth-child(1) > button", severity: "info" });
    const b = finding({ path: "ul > li:nth-child(2) > button", severity: "high" });
    const c = finding({ path: "ul > li:nth-child(3) > button", severity: "low" });
    const groups = ctx.groupFindingsByComponent([a, b, c]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].severity, "high");
  });

  it("skips null / non-object entries without crashing", () => {
    const groups = ctx.groupFindingsByComponent([null, finding(), undefined, 42]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].count, 1);
  });

  it("findings without a path group under a shared path:none bucket per type", () => {
    const a = finding({ path: null });
    const b = finding({ path: "" });
    const groups = ctx.groupFindingsByComponent([a, b]);
    assert.equal(groups.length, 1);
    assert.ok(groups[0].componentKey.endsWith("::path:none"));
  });
});

// ══════════════════════════════════════════════════════
// groupFindingsByComponent — sorting
// ══════════════════════════════════════════════════════

describe("groupFindingsByComponent sorting", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("sorts by max severity desc, then count desc", () => {
    const rows = [
      // group A: medium × 3
      finding({ type: "A_RULE", severity: "medium", path: "div > a:nth-child(1)" }),
      finding({ type: "A_RULE", severity: "medium", path: "div > a:nth-child(2)" }),
      finding({ type: "A_RULE", severity: "medium", path: "div > a:nth-child(3)" }),
      // group B: high × 1
      finding({ type: "B_RULE", severity: "high", path: "header > img" }),
      // group C: medium × 1
      finding({ type: "C_RULE", severity: "medium", path: "footer > span" }),
    ];
    const groups = ctx.groupFindingsByComponent(rows);
    assert.equal([...groups].map(g => g.type).join(","), "B_RULE,A_RULE,C_RULE");
    assert.equal([...groups].map(g => g.count).join(","), "1,3,1");
  });

  it("ranks critical above high and info below low", () => {
    const rows = [
      finding({ type: "INFO_RULE", severity: "info", path: "p > em" }),
      finding({ type: "CRIT_RULE", severity: "critical", path: "p > b" }),
      finding({ type: "LOW_RULE", severity: "low", path: "p > i" }),
      finding({ type: "HIGH_RULE", severity: "high", path: "p > u" }),
    ];
    const groups = ctx.groupFindingsByComponent(rows);
    assert.equal([...groups].map(g => g.type).join(","), "CRIT_RULE,HIGH_RULE,LOW_RULE,INFO_RULE");
  });

  it("ties break deterministically by componentKey", () => {
    const rows = [
      finding({ type: "Z_RULE", severity: "low", path: "div > p" }),
      finding({ type: "A_RULE", severity: "low", path: "div > p" }),
    ];
    const groups = ctx.groupFindingsByComponent(rows);
    assert.equal([...groups].map(g => g.type).join(","), "A_RULE,Z_RULE");
  });
});

// ══════════════════════════════════════════════════════
// explorerRowHtml — count badge for grouped rows
// ══════════════════════════════════════════════════════

describe("explorerRowHtml group badge", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("renders a ×N badge when _groupCount > 1", () => {
    const html = ctx.explorerRowHtml({ ...finding(), _groupCount: 12 }, 0);
    assert.ok(html.includes("groupCount"));
    assert.ok(html.includes("&times;12"));
  });

  it("renders no badge for ungrouped rows (default flow unchanged)", () => {
    const html = ctx.explorerRowHtml(finding(), 0);
    assert.ok(!html.includes("groupCount"));
    assert.ok(!html.includes("&times;"));
  });

  it("renders no badge for singleton groups", () => {
    const html = ctx.explorerRowHtml({ ...finding(), _groupCount: 1 }, 0);
    assert.ok(!html.includes("groupCount"));
  });

  it("keeps rows keyboard accessible (tabindex=0)", () => {
    const html = ctx.explorerRowHtml({ ...finding(), _groupCount: 3 }, 5);
    assert.ok(html.includes('tabindex="0"'));
    assert.ok(html.includes('data-i="5"'));
  });
});
