/**
 * Depth-3 aggregates tests — validates buildDepth3Aggregates pure function.
 * Also verifies group field metadata on RULE_TO_WCAG entries.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();
const buildDepth3Aggregates = ctx.__buildDepth3Aggregates;
const RULE_TO_WCAG = ctx.__RULE_TO_WCAG;

/** JSON round-trip to normalise cross-VM objects for deepStrictEqual. */
const norm = (o) => JSON.parse(JSON.stringify(o));

// ── Group metadata tests ─────────────────────────────────────────────

describe("RULE_TO_WCAG group field", () => {
  const EXPECTED_GROUPS = {
    ANNOUNCEMENT_IN_DIFFERENT_FRAME: "depth3/announcements",
    LIVE_REGION_MISSING_ROLE: "depth3/semantics",
    INPUT_LOSES_FOCUS_ON_UPDATE: "depth3/focus",
    LIVE_ITEM_NOT_ITEMIZED: "depth3/semantics",
    LIVE_CONTENT_NOT_ANNOUNCED: "depth3/announcements",
    COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE: "depth3/multiframe",
    // Deprecated legacy ids keep their group so old persisted findings still aggregate.
    CHAT_FEED_MISSING_ROLE: "depth3/semantics",
    CHAT_INPUT_LOSES_FOCUS_ON_UPDATE: "depth3/focus",
    CHAT_MESSAGE_NOT_ITEMIZED: "depth3/semantics",
    CHAT_NEW_MESSAGE_NOT_ANNOUNCED: "depth3/announcements",
  };

  it("has group field on exactly 6 non-deprecated rules (plus 4 deprecated aliases)", () => {
    const rulesWithGroup = Object.entries(RULE_TO_WCAG)
      .filter(([, v]) => v.group != null);
    const active = rulesWithGroup.filter(([, v]) => !v.deprecated);
    const deprecated = rulesWithGroup.filter(([, v]) => v.deprecated);
    assert.equal(active.length, 6, `expected 6 non-deprecated rules with group, got ${active.length}`);
    assert.equal(deprecated.length, 4, `expected 4 deprecated rules with group, got ${deprecated.length}`);
  });

  it("each deprecated grouped rule shares its replacement's group", () => {
    for (const [rule, meta] of Object.entries(RULE_TO_WCAG)) {
      if (meta.deprecated && meta.group != null) {
        assert.ok(meta.replacedBy, `${rule} deprecated but missing replacedBy`);
        assert.equal(RULE_TO_WCAG[meta.replacedBy]?.group, meta.group,
          `${rule} group differs from its replacement ${meta.replacedBy}`);
      }
    }
  });

  it("each grouped rule maps to one of the 4 valid groups", () => {
    const validGroups = new Set(["depth3/announcements", "depth3/focus", "depth3/semantics", "depth3/multiframe"]);
    for (const [rule, meta] of Object.entries(RULE_TO_WCAG)) {
      if (meta.group != null) {
        assert.ok(validGroups.has(meta.group), `rule ${rule} has invalid group "${meta.group}"`);
      }
    }
  });

  for (const [rule, expectedGroup] of Object.entries(EXPECTED_GROUPS)) {
    it(`${rule} has group "${expectedGroup}"`, () => {
      assert.equal(RULE_TO_WCAG[rule]?.group, expectedGroup);
    });
  }
});

// ── buildDepth3Aggregates tests ──────────────────────────────────────

describe("buildDepth3Aggregates", () => {
  it("returns all ok with zero counts for empty findings", () => {
    const result = buildDepth3Aggregates([], RULE_TO_WCAG);
    assert.equal(result.announcementIntegrity, "ok");
    assert.equal(result.focusStability, "ok");
    assert.equal(result.chatSemantics, "ok");
    assert.equal(result.multiFrameIntegrity, "ok");
    assert.deepStrictEqual(norm(result.counts), { announcements: 0, focus: 0, semantics: 0, multiframe: 0 });
  });

  it("returns all ok for non-array findings", () => {
    const result = buildDepth3Aggregates(null, RULE_TO_WCAG);
    assert.equal(result.announcementIntegrity, "ok");
    assert.equal(result.focusStability, "ok");
    assert.deepStrictEqual(norm(result.counts), { announcements: 0, focus: 0, semantics: 0, multiframe: 0 });
  });

  it("returns all ok for undefined ruleMetaLookup", () => {
    const result = buildDepth3Aggregates([{ type: "LIVE_REGION_MISSING_ROLE" }], null);
    assert.equal(result.chatSemantics, "ok");
  });

  it("degrades announcementIntegrity for announcements group finding", () => {
    const result = buildDepth3Aggregates(
      [{ type: "LIVE_CONTENT_NOT_ANNOUNCED" }],
      RULE_TO_WCAG,
    );
    assert.equal(result.announcementIntegrity, "degraded");
    assert.equal(result.counts.announcements, 1);
    // other groups remain ok
    assert.equal(result.focusStability, "ok");
    assert.equal(result.chatSemantics, "ok");
    assert.equal(result.multiFrameIntegrity, "ok");
  });

  it("degrades focusStability for focus group finding", () => {
    const result = buildDepth3Aggregates(
      [{ type: "INPUT_LOSES_FOCUS_ON_UPDATE" }],
      RULE_TO_WCAG,
    );
    assert.equal(result.focusStability, "degraded");
    assert.equal(result.counts.focus, 1);
  });

  it("degrades chatSemantics for semantics group finding", () => {
    const result = buildDepth3Aggregates(
      [{ type: "LIVE_REGION_MISSING_ROLE" }],
      RULE_TO_WCAG,
    );
    assert.equal(result.chatSemantics, "degraded");
    assert.equal(result.counts.semantics, 1);
  });

  it("legacy-id findings from old sessions still aggregate via deprecated entries", () => {
    const result = buildDepth3Aggregates(
      [
        { type: "CHAT_FEED_MISSING_ROLE" },       // deprecated alias of LIVE_REGION_MISSING_ROLE
        { type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED" }, // deprecated alias of LIVE_CONTENT_NOT_ANNOUNCED
      ],
      RULE_TO_WCAG,
    );
    assert.equal(result.chatSemantics, "degraded");
    assert.equal(result.counts.semantics, 1);
    assert.equal(result.announcementIntegrity, "degraded");
    assert.equal(result.counts.announcements, 1);
  });

  it("degrades multiFrameIntegrity for multiframe group finding", () => {
    const result = buildDepth3Aggregates(
      [{ type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE" }],
      RULE_TO_WCAG,
    );
    assert.equal(result.multiFrameIntegrity, "degraded");
    assert.equal(result.counts.multiframe, 1);
  });

  it("counts multiple findings in the same group", () => {
    const result = buildDepth3Aggregates(
      [
        { type: "LIVE_REGION_MISSING_ROLE" },
        { type: "LIVE_ITEM_NOT_ITEMIZED" },
      ],
      RULE_TO_WCAG,
    );
    assert.equal(result.chatSemantics, "degraded");
    assert.equal(result.counts.semantics, 2);
  });

  it("counts across multiple groups", () => {
    const result = buildDepth3Aggregates(
      [
        { type: "LIVE_CONTENT_NOT_ANNOUNCED" },
        { type: "ANNOUNCEMENT_IN_DIFFERENT_FRAME" },
        { type: "INPUT_LOSES_FOCUS_ON_UPDATE" },
        { type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE" },
      ],
      RULE_TO_WCAG,
    );
    assert.equal(result.announcementIntegrity, "degraded");
    assert.equal(result.focusStability, "degraded");
    assert.equal(result.multiFrameIntegrity, "degraded");
    assert.equal(result.chatSemantics, "ok"); // no semantics findings
    assert.equal(result.counts.announcements, 2);
    assert.equal(result.counts.focus, 1);
    assert.equal(result.counts.multiframe, 1);
    assert.equal(result.counts.semantics, 0);
  });

  it("silently ignores findings with unknown/missing group", () => {
    const result = buildDepth3Aggregates(
      [
        { type: "IMG_MISSING_ALT" },            // no group field
        { type: "NONEXISTENT_RULE_TYPE" },       // not in RULE_TO_WCAG at all
        { type: "LIVE_REGION_MISSING_ROLE" },    // has group
      ],
      RULE_TO_WCAG,
    );
    assert.equal(result.chatSemantics, "degraded");
    assert.equal(result.counts.semantics, 1);
    // unknown rules don't affect any group
    assert.equal(result.announcementIntegrity, "ok");
  });

  it("silently ignores findings with null/undefined type", () => {
    const result = buildDepth3Aggregates(
      [null, undefined, { type: null }, { type: undefined }, {}],
      RULE_TO_WCAG,
    );
    assert.equal(result.announcementIntegrity, "ok");
    assert.deepStrictEqual(norm(result.counts), { announcements: 0, focus: 0, semantics: 0, multiframe: 0 });
  });

  it("is deterministic: same inputs => identical output", () => {
    const findings = [
      { type: "LIVE_CONTENT_NOT_ANNOUNCED" },
      { type: "LIVE_REGION_MISSING_ROLE" },
      { type: "INPUT_LOSES_FOCUS_ON_UPDATE" },
    ];
    const r1 = buildDepth3Aggregates(findings, RULE_TO_WCAG);
    const r2 = buildDepth3Aggregates(findings, RULE_TO_WCAG);
    assert.deepStrictEqual(r1, r2);
  });
});
