/**
 * Integrity Overview + Group Filter + Cross-Frame UX tests.
 * Covers D1 (pills, aggregates, group filtering) and D3 (cross-frame badge/highlight skip).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();

/** JSON round-trip to normalise cross-VM objects for deepStrictEqual. */
const norm = (o) => JSON.parse(JSON.stringify(o));

// ══════════════════════════════════════════════════════════════════════
// updateIntegrityOverview
// ══════════════════════════════════════════════════════════════════════

describe("updateIntegrityOverview", () => {
  it("hides overview when aggregates is null", () => {
    const el = ctx.els.integrityOverview;
    el.hidden = false;
    ctx.updateIntegrityOverview(null);
    assert.equal(el.hidden, true);
  });

  it("shows overview when aggregates are provided", () => {
    // Set up querySelector on integrityOverview to return pill-like mock elements
    const pills = {};
    const makePill = (group) => {
      const classes = new Set();
      return {
        classList: {
          add(c) { classes.add(c); },
          remove(...cs) { cs.forEach(c => classes.delete(c)); },
          contains(c) { return classes.has(c); },
        },
        _classes: classes,
      };
    };
    const groups = [
      "depth3/announcements", "depth3/focus",
      "depth3/semantics", "depth3/multiframe",
    ];
    for (const g of groups) pills[g] = makePill(g);

    const el = ctx.els.integrityOverview;
    el.hidden = true;
    el.querySelector = (sel) => {
      const match = sel.match(/data-group="([^"]+)"/);
      return match ? pills[match[1]] || null : null;
    };

    const aggregates = {
      announcementIntegrity: "ok",
      focusStability: "degraded",
      chatSemantics: "ok",
      multiFrameIntegrity: "ok",
      counts: { announcements: 2, focus: 1, semantics: 0, multiframe: 3 },
    };

    ctx.updateIntegrityOverview(aggregates);

    assert.equal(el.hidden, false);
    assert.ok(pills["depth3/announcements"]._classes.has("ok"));
    assert.ok(!pills["depth3/announcements"]._classes.has("degraded"));
    assert.ok(pills["depth3/focus"]._classes.has("degraded"));
    assert.ok(!pills["depth3/focus"]._classes.has("ok"));
    assert.ok(pills["depth3/semantics"]._classes.has("ok"));
    assert.ok(pills["depth3/multiframe"]._classes.has("ok"));
  });

  it("renders count numbers correctly", () => {
    const countEls = {
      announcements: { textContent: "" },
      focus: { textContent: "" },
      semantics: { textContent: "" },
      multiframe: { textContent: "" },
    };
    ctx.els.pillAnnouncementsCount = countEls.announcements;
    ctx.els.pillFocusCount = countEls.focus;
    ctx.els.pillSemanticsCount = countEls.semantics;
    ctx.els.pillMultiframeCount = countEls.multiframe;

    const el = ctx.els.integrityOverview;
    el.querySelector = () => {
      // Return a minimal pill mock that doesn't crash
      return { classList: { add() {}, remove() {} } };
    };

    ctx.updateIntegrityOverview({
      announcementIntegrity: "ok",
      focusStability: "ok",
      chatSemantics: "ok",
      multiFrameIntegrity: "degraded",
      counts: { announcements: 5, focus: 0, semantics: 12, multiframe: 1 },
    });

    assert.equal(countEls.announcements.textContent, "(5)");
    assert.equal(countEls.focus.textContent, "(0)");
    assert.equal(countEls.semantics.textContent, "(12)");
    assert.equal(countEls.multiframe.textContent, "(1)");
  });

  it("handles missing counts gracefully (defaults to 0)", () => {
    const countEl = { textContent: "" };
    ctx.els.pillAnnouncementsCount = countEl;
    const el = ctx.els.integrityOverview;
    el.querySelector = () => ({ classList: { add() {}, remove() {} } });

    ctx.updateIntegrityOverview({
      announcementIntegrity: "ok",
      focusStability: "ok",
      chatSemantics: "ok",
      multiFrameIntegrity: "ok",
      // no counts property
    });

    assert.equal(countEl.textContent, "(0)");
  });
});

// ══════════════════════════════════════════════════════════════════════
// filterFindingsByGroup
// ══════════════════════════════════════════════════════════════════════

describe("filterFindingsByGroup", () => {
  const semanticsFindings = [
    { type: "LIVE_REGION_MISSING_ROLE", name: "Feed missing role", severity: "error" },
    { type: "LIVE_ITEM_NOT_ITEMIZED", name: "Not itemized", severity: "warning" },
  ];
  const multiframeFindings = [
    { type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE", name: "Split", severity: "error" },
  ];
  const announcementFindings = [
    { type: "ANNOUNCEMENT_IN_DIFFERENT_FRAME", name: "Cross-frame ann", severity: "warning" },
  ];
  const noGroupFindings = [
    { type: "MISSING_ALT", name: "No alt", severity: "error" },
  ];

  const all = [...semanticsFindings, ...multiframeFindings, ...announcementFindings, ...noGroupFindings];

  it("returns only semantics findings when group is depth3/semantics", () => {
    const result = ctx.filterFindingsByGroup(all, "depth3/semantics");
    assert.equal(result.length, 2);
    assert.ok(result.every(f => f.type === "LIVE_REGION_MISSING_ROLE" || f.type === "LIVE_ITEM_NOT_ITEMIZED"));
  });

  it("returns only multiframe findings when group is depth3/multiframe", () => {
    const result = ctx.filterFindingsByGroup(all, "depth3/multiframe");
    assert.equal(result.length, 1);
    assert.equal(result[0].type, "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE");
  });

  it("returns all findings when group is null", () => {
    const result = ctx.filterFindingsByGroup(all, null);
    assert.equal(result.length, all.length);
  });

  it("returns empty for unknown group", () => {
    const result = ctx.filterFindingsByGroup(all, "depth3/nonexistent");
    assert.equal(result.length, 0);
  });

  it("returns empty array for non-array findings", () => {
    assert.deepStrictEqual(norm(ctx.filterFindingsByGroup(null, "depth3/semantics")), []);
    assert.deepStrictEqual(norm(ctx.filterFindingsByGroup(undefined, "depth3/semantics")), []);
  });

  it("is deterministic: same inputs produce same output", () => {
    const r1 = ctx.filterFindingsByGroup(all, "depth3/announcements");
    const r2 = ctx.filterFindingsByGroup(all, "depth3/announcements");
    assert.deepStrictEqual(norm(r1), norm(r2));
  });

  it("does not mutate the input array", () => {
    const copy = [...all];
    ctx.filterFindingsByGroup(all, "depth3/multiframe");
    assert.equal(all.length, copy.length);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Cross-frame detection in explorerRowHtml
// ══════════════════════════════════════════════════════════════════════

describe("Cross-frame detection in explorerRowHtml", () => {
  it("includes Cross-frame badge for el:null multiframe finding", () => {
    const f = {
      type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE",
      name: "Split without linkage",
      severity: "error",
      wcag: "1.3.1",
      // el is absent (null/undefined) — cross-frame
    };
    const html = ctx.explorerRowHtml(f, 0);
    assert.ok(html.includes("Cross-frame"), "should contain Cross-frame badge");
    assert.ok(html.includes("crossFrame"), "should have crossFrame class");
    assert.ok(html.includes('data-crossframe="1"'), "should have data-crossframe attribute");
  });

  it("does NOT include Cross-frame badge for non-multiframe el:null finding", () => {
    const f = {
      type: "MISSING_ALT",
      name: "Missing alt",
      severity: "error",
      wcag: "1.1.1",
      // el is absent but rule is not multiframe
    };
    const html = ctx.explorerRowHtml(f, 0);
    assert.ok(!html.includes("Cross-frame"), "should not contain Cross-frame badge");
    assert.ok(!html.includes("crossFrame"), "should not have crossFrame class");
  });

  it("does NOT include Cross-frame badge when el is present", () => {
    const f = {
      type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE",
      name: "Split",
      severity: "error",
      wcag: "1.3.1",
      el: "div.chat",  // has element — can highlight
    };
    const html = ctx.explorerRowHtml(f, 0);
    assert.ok(!html.includes("Cross-frame"), "should not contain Cross-frame badge when el present");
    assert.ok(!html.includes('data-crossframe'), "should not have data-crossframe attribute");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Cross-frame detection logic (used in buildDetailRow and click handler)
// ══════════════════════════════════════════════════════════════════════

describe("Cross-frame detection logic", () => {
  const RULE_TO_WCAG = ctx.__RULE_TO_WCAG;

  function isCrossFrame(f) {
    return !f.el && RULE_TO_WCAG[f.type]?.group === "depth3/multiframe";
  }

  it("el:null + multiframe group → cross-frame", () => {
    assert.equal(isCrossFrame({
      type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE",
    }), true);
  });

  it("el:null + non-multiframe group → not cross-frame", () => {
    assert.equal(isCrossFrame({
      type: "LIVE_REGION_MISSING_ROLE",  // group: depth3/semantics
    }), false);
  });

  it("el:null + no group → not cross-frame", () => {
    assert.equal(isCrossFrame({
      type: "MISSING_ALT",
    }), false);
  });

  it("el present + multiframe group → not cross-frame", () => {
    assert.equal(isCrossFrame({
      type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE",
      el: "div.chat",
    }), false);
  });

  it("COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE is in depth3/multiframe group", () => {
    assert.equal(RULE_TO_WCAG["COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE"]?.group, "depth3/multiframe");
  });
});
