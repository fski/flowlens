/**
 * WCAG Coverage — tests for coverage map integrity, coverage summary functions,
 * parsing hardening, completeness guards, deterministic sorting, new rule
 * fixture verification, and export coverage fields.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createContext } from "./harness.mjs";

const ctx = createContext();
const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPET_PATH = join(__dirname, "..", "src", "snippet", "a11y-audit-snippet.js");

// ══════════════════════════════════════════════════════
// Coverage map integrity
// ══════════════════════════════════════════════════════

describe("WCAG_COVERAGE_VERSION", () => {
  it("is >= 1", () => {
    assert.ok(ctx.__WCAG_COVERAGE_VERSION >= 1);
  });
});

describe("WCAG_TARGET", () => {
  it("specifies version and level", () => {
    assert.equal(ctx.__WCAG_TARGET.version, "2.2");
    assert.equal(ctx.__WCAG_TARGET.level, "AA");
  });
});

describe("WCAG_CRITERIA", () => {
  it("is a non-empty array", () => {
    assert.ok(Array.isArray(ctx.__WCAG_CRITERIA));
    assert.ok(ctx.__WCAG_CRITERIA.length > 40);
  });

  it("each entry has required fields", () => {
    for (const c of ctx.__WCAG_CRITERIA) {
      assert.ok(typeof c.criterion === "string", `missing criterion: ${JSON.stringify(c)}`);
      assert.ok(typeof c.level === "string", `missing level for ${c.criterion}`);
      assert.ok(typeof c.title === "string", `missing title for ${c.criterion}`);
      assert.ok(typeof c.isInTarget === "boolean", `missing isInTarget for ${c.criterion}`);
    }
  });

  it("is sorted by criterion number", () => {
    for (let i = 1; i < ctx.__WCAG_CRITERIA.length; i++) {
      const prev = ctx.__WCAG_CRITERIA[i - 1].criterion;
      const curr = ctx.__WCAG_CRITERIA[i].criterion;
      assert.ok(
        compareCriterionNumbers(prev, curr) <= 0,
        `criteria out of order: ${prev} should come before ${curr}`
      );
    }
  });

  it("all isInTarget entries are A or AA level", () => {
    for (const c of ctx.__WCAG_CRITERIA) {
      if (c.isInTarget) {
        assert.ok(c.level === "A" || c.level === "AA", `${c.criterion} isInTarget but level=${c.level}`);
      }
    }
  });

  it("has no duplicate criteria", () => {
    const seen = new Set();
    for (const c of ctx.__WCAG_CRITERIA) {
      assert.ok(!seen.has(c.criterion), `duplicate criterion: ${c.criterion}`);
      seen.add(c.criterion);
    }
  });
});

describe("RULE_TO_WCAG", () => {
  it("is a non-empty object", () => {
    assert.ok(typeof ctx.__RULE_TO_WCAG === "object");
    assert.ok(Object.keys(ctx.__RULE_TO_WCAG).length > 50);
  });

  it("every WCAG entry references a criterion in WCAG_CRITERIA", () => {
    const critSet = new Set(ctx.__WCAG_CRITERIA.map(c => c.criterion));
    for (const [rule, mapping] of Object.entries(ctx.__RULE_TO_WCAG)) {
      assert.ok(
        critSet.has(mapping.criterion) || mapping.criterion === null,
        `${rule} references unknown criterion: ${mapping.criterion}`
      );
      if (Array.isArray(mapping.also)) {
        for (const c of mapping.also) {
          assert.ok(critSet.has(c), `${rule} also references unknown criterion: ${c}`);
        }
      }
    }
  });

  it("entries are sorted alphabetically by ruleType", () => {
    const keys = Object.keys(ctx.__RULE_TO_WCAG);
    for (let i = 1; i < keys.length; i++) {
      assert.ok(keys[i - 1] < keys[i], `RULE_TO_WCAG out of order: ${keys[i - 1]} before ${keys[i]}`);
    }
  });

  it("WCAG entries have criterion and level strings", () => {
    for (const [rule, mapping] of Object.entries(ctx.__RULE_TO_WCAG)) {
      if (mapping.criterion !== null) {
        assert.ok(typeof mapping.criterion === "string", `${rule} missing criterion`);
        assert.ok(typeof mapping.level === "string", `${rule} missing level`);
      }
    }
  });

  it("null-criterion entries have reason field", () => {
    for (const [rule, mapping] of Object.entries(ctx.__RULE_TO_WCAG)) {
      if (mapping.criterion === null) {
        assert.ok(typeof mapping.reason === "string" && mapping.reason.length > 0,
          `${rule} has null criterion but no reason`);
        assert.equal(mapping.level, null, `${rule} null-criterion should have null level`);
      }
    }
  });

  it("includes new v1 expansion rules", () => {
    const rules = Object.keys(ctx.__RULE_TO_WCAG);
    assert.ok(rules.includes("ERROR_INPUT_NO_DESCRIPTION"));
    assert.ok(rules.includes("REFLOW_VIEWPORT_LOCKED"));
    assert.ok(rules.includes("MISSING_LANG_ON_PART"));
    assert.ok(rules.includes("TEXT_SPACING_CLIP_RISK"));
    assert.ok(rules.includes("LINK_NO_ACCESSIBLE_NAME"));
    assert.ok(rules.includes("ERROR_SUGGESTION_MISSING"));
  });

  it("new rules map to correct criteria", () => {
    assert.equal(ctx.__RULE_TO_WCAG.ERROR_INPUT_NO_DESCRIPTION.criterion, "3.3.1");
    assert.equal(ctx.__RULE_TO_WCAG.REFLOW_VIEWPORT_LOCKED.criterion, "1.4.10");
    assert.equal(ctx.__RULE_TO_WCAG.MISSING_LANG_ON_PART.criterion, "3.1.2");
    assert.equal(ctx.__RULE_TO_WCAG.TEXT_SPACING_CLIP_RISK.criterion, "1.4.12");
    assert.equal(ctx.__RULE_TO_WCAG.LINK_NO_ACCESSIBLE_NAME.criterion, "2.4.4");
    assert.equal(ctx.__RULE_TO_WCAG.ERROR_SUGGESTION_MISSING.criterion, "3.3.3");
  });

  it("new rules have explicit confidence", () => {
    assert.equal(ctx.__RULE_TO_WCAG.ERROR_INPUT_NO_DESCRIPTION.confidence, "heuristic");
    assert.equal(ctx.__RULE_TO_WCAG.REFLOW_VIEWPORT_LOCKED.confidence, "heuristic");
    assert.equal(ctx.__RULE_TO_WCAG.MISSING_LANG_ON_PART.confidence, "heuristic");
    assert.equal(ctx.__RULE_TO_WCAG.TEXT_SPACING_CLIP_RISK.confidence, "advisory");
    assert.equal(ctx.__RULE_TO_WCAG.LINK_NO_ACCESSIBLE_NAME.confidence, "strict");
    assert.equal(ctx.__RULE_TO_WCAG.ERROR_SUGGESTION_MISSING.confidence, "advisory");
  });

  it("includes v2 completeness entries", () => {
    const rules = Object.keys(ctx.__RULE_TO_WCAG);
    // Non-WCAG diagnostic rules
    assert.ok(rules.includes("SHELL_OR_MINIMAL_UI"));
    assert.ok(rules.includes("SHADOW_DOM_NOTE"));
    assert.ok(rules.includes("IFRAME_CROSS_ORIGIN"));
    assert.ok(rules.includes("TARGET_SIZE_AAA"));
    // WCAG rules added in v2
    assert.ok(rules.includes("BLINK_ELEMENT"));
    assert.ok(rules.includes("DIALOG_NO_ACCESSIBLE_NAME"));
    assert.ok(rules.includes("EMPTY_HEADING"));
    assert.ok(rules.includes("FIELDSET_NO_LEGEND"));
    assert.ok(rules.includes("NO_ACCESSIBLE_NAME"));
    assert.ok(rules.includes("VIDEO_AUTOPLAY"));
  });
});

// ══════════════════════════════════════════════════════
// Part 3 — RULE_TO_WCAG completeness guard
// ══════════════════════════════════════════════════════

describe("RULE_TO_WCAG completeness guard", () => {
  // Extract all rule types from the snippet source
  const snippetSrc = readFileSync(SNIPPET_PATH, "utf8");
  // Match type: "RULE_NAME" patterns (inline add() calls)
  const inlineTypes = [...snippetSrc.matchAll(/type:\s*"([A-Z][A-Z0-9_]+)"/g)].map(m => m[1]);
  // Match _q(selector, "RULE_NAME", ...) patterns (shorthand rule calls)
  const qTypes = [...snippetSrc.matchAll(/_q\([^,]+,\s*"([A-Z][A-Z0-9_]+)"/g)].map(m => m[1]);
  const allSnippetRules = [...new Set([...inlineTypes, ...qTypes])].sort();

  it("snippet has known rule types", () => {
    assert.ok(allSnippetRules.length > 50, `expected >50 snippet rules, got ${allSnippetRules.length}`);
  });

  it("every snippet rule has a RULE_TO_WCAG entry", () => {
    const ruleMapKeys = new Set(Object.keys(ctx.__RULE_TO_WCAG));
    const missing = allSnippetRules.filter(r => !ruleMapKeys.has(r));
    assert.equal(missing.length, 0,
      `snippet rules missing from RULE_TO_WCAG: ${missing.join(", ")}`);
  });

  it("WCAG entries reference valid criteria", () => {
    const critSet = new Set(ctx.__WCAG_CRITERIA.map(c => c.criterion));
    for (const [rule, mapping] of Object.entries(ctx.__RULE_TO_WCAG)) {
      if (mapping.criterion !== null) {
        assert.ok(critSet.has(mapping.criterion),
          `${rule} references criterion ${mapping.criterion} not in WCAG_CRITERIA`);
      }
    }
  });
});

// ══════════════════════════════════════════════════════
// Part 1 — Target level semantics guard
// ══════════════════════════════════════════════════════

describe("target level semantics", () => {
  it("AA target includes both A and AA criteria", () => {
    const aa = ctx.engineCoverageSummary({ targetLevel: "AA" });
    const aCriteria = ctx.__WCAG_CRITERIA.filter(c => c.isInTarget && c.level === "A");
    const aaCriteria = ctx.__WCAG_CRITERIA.filter(c => c.isInTarget && c.level === "AA");
    const allTargetSet = new Set([...aCriteria, ...aaCriteria].map(c => c.criterion));
    assert.equal(aa.totalCount, allTargetSet.size,
      `AA totalCount ${aa.totalCount} != expected ${allTargetSet.size}`);
    // Verify some known AA criteria are in the target set
    assert.ok(allTargetSet.has("1.4.3"), "1.4.3 Contrast should be in AA target");
    assert.ok(allTargetSet.has("2.4.7"), "2.4.7 Focus Visible should be in AA target");
    // Verify some known A criteria are also in the target set
    assert.ok(allTargetSet.has("1.1.1"), "1.1.1 Non-text Content should be in AA target");
    assert.ok(allTargetSet.has("2.1.1"), "2.1.1 Keyboard should be in AA target");
  });

  it("A target includes only A criteria", () => {
    const a = ctx.engineCoverageSummary({ targetLevel: "A" });
    const aOnly = ctx.__WCAG_CRITERIA.filter(c => c.isInTarget && c.level === "A");
    assert.equal(a.totalCount, aOnly.length,
      `A totalCount ${a.totalCount} != expected ${aOnly.length}`);
  });

  it("A target excludes AA criteria", () => {
    const a = ctx.engineCoverageSummary({ targetLevel: "A" });
    const aaCriteria = ctx.__WCAG_CRITERIA
      .filter(c => c.isInTarget && c.level === "AA")
      .map(c => c.criterion);
    for (const crit of aaCriteria) {
      assert.ok(!a.criteriaCovered.includes(crit) || true,
        "AA criteria should not appear in A-only target");
      // More precisely: AA criteria should not be in the target set
      const allInA = [...a.criteriaCovered, ...a.criteriaMissing];
      assert.ok(!allInA.includes(crit),
        `${crit} (AA) should not be in A target set`);
    }
  });

  it("totalCount is deterministic for AA", () => {
    const a = ctx.engineCoverageSummary({ targetLevel: "AA" });
    const b = ctx.engineCoverageSummary({ targetLevel: "AA" });
    assert.equal(a.totalCount, b.totalCount);
    assert.equal(a.coveredCount, b.coveredCount);
  });

  it("totalCount is deterministic for A", () => {
    const a = ctx.engineCoverageSummary({ targetLevel: "A" });
    const b = ctx.engineCoverageSummary({ targetLevel: "A" });
    assert.equal(a.totalCount, b.totalCount);
    assert.equal(a.coveredCount, b.coveredCount);
  });

  it("runCoverageObserved respects A target", () => {
    const findings = [
      { type: "X", wcag: "1.4.3", severity: "medium" }, // 1.4.3 is AA
      { type: "Y", wcag: "1.1.1", severity: "medium" }, // 1.1.1 is A
    ];
    const r = ctx.runCoverageObserved(findings, { targetLevel: "A" });
    assert.ok(r.criteriaCovered.includes("1.1.1"), "A criterion should be observed");
    assert.ok(!r.criteriaCovered.includes("1.4.3"), "AA criterion should not be in A target");
  });

  it("runCoverageObserved respects AA target", () => {
    const findings = [
      { type: "X", wcag: "1.4.3", severity: "medium" },
      { type: "Y", wcag: "1.1.1", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings, { targetLevel: "AA" });
    assert.ok(r.criteriaCovered.includes("1.1.1"));
    assert.ok(r.criteriaCovered.includes("1.4.3"));
  });
});

// ══════════════════════════════════════════════════════
// Part 2 — parseWcagCriteria
// ══════════════════════════════════════════════════════

describe("parseWcagCriteria", () => {
  it("parses single criterion", () => {
    const r = ctx.parseWcagCriteria("2.4.4");
    assert.equal(r.length, 1);
    assert.equal(r[0], "2.4.4");
  });

  it("parses slash-separated criteria", () => {
    const r = ctx.parseWcagCriteria("2.4.4 / 4.1.2");
    assert.equal(r.length, 2);
    assert.ok(r.includes("2.4.4"));
    assert.ok(r.includes("4.1.2"));
  });

  it("parses comma-separated criteria", () => {
    const r = ctx.parseWcagCriteria("2.4.4,4.1.2");
    assert.equal(r.length, 2);
    assert.ok(r.includes("2.4.4"));
    assert.ok(r.includes("4.1.2"));
  });

  it("parses space-separated criteria", () => {
    const r = ctx.parseWcagCriteria("2.4.4 4.1.2");
    assert.equal(r.length, 2);
    assert.ok(r.includes("2.4.4"));
    assert.ok(r.includes("4.1.2"));
  });

  it("handles mixed separators", () => {
    const r = ctx.parseWcagCriteria("1.3.1 / 3.3.2, 4.1.2 2.4.4");
    assert.equal(r.length, 4);
    assert.ok(r.includes("1.3.1"));
    assert.ok(r.includes("3.3.2"));
    assert.ok(r.includes("4.1.2"));
    assert.ok(r.includes("2.4.4"));
  });

  it("deduplicates", () => {
    const r = ctx.parseWcagCriteria("1.1.1 / 1.1.1 / 1.1.1");
    assert.equal(r.length, 1);
    assert.equal(r[0], "1.1.1");
  });

  it("ignores invalid tokens", () => {
    const r = ctx.parseWcagCriteria("WCAG 2.4.4");
    assert.equal(r.length, 1);
    assert.equal(r[0], "2.4.4");
  });

  it("ignores non-numeric tokens", () => {
    const r = ctx.parseWcagCriteria("abc / 1.1.1 / xyz");
    assert.equal(r.length, 1);
    assert.equal(r[0], "1.1.1");
  });

  it("returns sorted results", () => {
    const r = ctx.parseWcagCriteria("4.1.2 / 1.1.1 / 2.4.4");
    assert.equal(r[0], "1.1.1");
    assert.equal(r[1], "2.4.4");
    assert.equal(r[2], "4.1.2");
  });

  it("returns empty for null/undefined/empty", () => {
    assert.equal(ctx.parseWcagCriteria(null).length, 0);
    assert.equal(ctx.parseWcagCriteria(undefined).length, 0);
    assert.equal(ctx.parseWcagCriteria("").length, 0);
  });

  it("is deterministic", () => {
    const input = "4.1.2 / 1.1.1, 2.4.4 3.3.2";
    const a = JSON.stringify(ctx.parseWcagCriteria(input));
    const b = JSON.stringify(ctx.parseWcagCriteria(input));
    assert.equal(a, b);
  });

  it("normalizes whitespace", () => {
    const r = ctx.parseWcagCriteria("  1.1.1  /  2.4.4  ");
    assert.equal(r.length, 2);
    assert.ok(r.includes("1.1.1"));
    assert.ok(r.includes("2.4.4"));
  });
});

// ══════════════════════════════════════════════════════
// engineCoverageSummary
// ══════════════════════════════════════════════════════

describe("engineCoverageSummary", () => {
  it("returns expected shape", () => {
    const r = ctx.engineCoverageSummary();
    assert.equal(r.target.version, "2.2");
    assert.equal(r.target.level, "AA");
    assert.ok(r.coverageVersion >= 1);
    assert.ok(Array.isArray(r.criteriaCovered));
    assert.ok(Array.isArray(r.criteriaMissing));
    assert.equal(typeof r.coveredCount, "number");
    assert.equal(typeof r.totalCount, "number");
    assert.equal(r.coveredCount, r.criteriaCovered.length);
    assert.equal(r.coveredCount + r.criteriaMissing.length, r.totalCount);
  });

  it("criteriaCovered is sorted", () => {
    const r = ctx.engineCoverageSummary();
    for (let i = 1; i < r.criteriaCovered.length; i++) {
      assert.ok(r.criteriaCovered[i - 1] < r.criteriaCovered[i]);
    }
  });

  it("criteriaMissing is sorted", () => {
    const r = ctx.engineCoverageSummary();
    for (let i = 1; i < r.criteriaMissing.length; i++) {
      assert.ok(r.criteriaMissing[i - 1] < r.criteriaMissing[i]);
    }
  });

  it("coveredCount is positive", () => {
    const r = ctx.engineCoverageSummary();
    assert.ok(r.coveredCount > 0, "Should cover at least some criteria");
  });

  it("includes new criteria from v1 expansion", () => {
    const r = ctx.engineCoverageSummary();
    assert.ok(r.criteriaCovered.includes("3.3.1"), "3.3.1 should be covered");
    assert.ok(r.criteriaCovered.includes("1.4.10"), "1.4.10 should be covered");
    assert.ok(r.criteriaCovered.includes("3.1.2"), "3.1.2 should be covered");
    assert.ok(r.criteriaCovered.includes("1.4.12"), "1.4.12 should be covered");
    assert.ok(r.criteriaCovered.includes("3.3.3"), "3.3.3 should be covered");
  });

  it("handles compound criteria via also field", () => {
    const r = ctx.engineCoverageSummary();
    assert.ok(r.criteriaCovered.includes("3.2.2"), "3.2.2 should be covered via also");
    assert.ok(r.criteriaCovered.includes("2.4.6"), "2.4.6 should be covered via also");
  });

  it("is deterministic — identical JSON.stringify", () => {
    const a = JSON.stringify(ctx.engineCoverageSummary());
    const b = JSON.stringify(ctx.engineCoverageSummary());
    assert.equal(a, b);
  });

  it("respects targetLevel option", () => {
    const aa = ctx.engineCoverageSummary({ targetLevel: "AA" });
    const a = ctx.engineCoverageSummary({ targetLevel: "A" });
    assert.ok(aa.totalCount > a.totalCount, "AA should have more total criteria than A");
    assert.ok(a.coveredCount <= aa.coveredCount, "A coverage should be <= AA coverage");
  });

  it("includes v2 expansion criteria (1.4.2 via NO_AUTOPLAY_AUDIO)", () => {
    const r = ctx.engineCoverageSummary();
    assert.ok(r.criteriaCovered.includes("1.4.2"), "1.4.2 should be covered via NO_AUTOPLAY_AUDIO");
    assert.ok(r.criteriaCovered.includes("2.2.2"), "2.2.2 should be covered via BLINK_ELEMENT/MARQUEE_ELEMENT");
  });
});

// ══════════════════════════════════════════════════════
// Part 4 — Deterministic sorting enforcement
// ══════════════════════════════════════════════════════

describe("deterministic sorting enforcement", () => {
  it("engineCoverageSummary — same input produces identical JSON twice", () => {
    const a = ctx.engineCoverageSummary({ targetLevel: "AA" });
    const b = ctx.engineCoverageSummary({ targetLevel: "AA" });
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("engineCoverageSummary — criteriaCovered is lexicographically ascending", () => {
    const r = ctx.engineCoverageSummary();
    const sorted = [...r.criteriaCovered].sort();
    assert.equal(JSON.stringify(r.criteriaCovered), JSON.stringify(sorted));
  });

  it("engineCoverageSummary — criteriaMissing is lexicographically ascending", () => {
    const r = ctx.engineCoverageSummary();
    const sorted = [...r.criteriaMissing].sort();
    assert.equal(JSON.stringify(r.criteriaMissing), JSON.stringify(sorted));
  });

  it("runCoverageObserved — same input produces identical JSON twice", () => {
    const findings = [
      { type: "X", wcag: "4.1.2", severity: "high" },
      { type: "Y", wcag: "1.1.1", severity: "medium" },
      { type: "Z", wcag: "2.4.7", severity: "medium" },
    ];
    const a = JSON.stringify(ctx.runCoverageObserved(findings));
    const b = JSON.stringify(ctx.runCoverageObserved(findings));
    assert.equal(a, b);
  });

  it("runCoverageObserved — criteriaCovered is lexicographically ascending", () => {
    const findings = [
      { type: "X", wcag: "4.1.2", severity: "high" },
      { type: "Y", wcag: "1.1.1", severity: "medium" },
      { type: "Z", wcag: "2.4.7", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings);
    const sorted = [...r.criteriaCovered].sort();
    assert.equal(JSON.stringify(r.criteriaCovered), JSON.stringify(sorted));
  });

  it("runCoverageObserved — criteriaMissing is lexicographically ascending", () => {
    const findings = [
      { type: "X", wcag: "4.1.2", severity: "high" },
    ];
    const r = ctx.runCoverageObserved(findings);
    const sorted = [...r.criteriaMissing].sort();
    assert.equal(JSON.stringify(r.criteriaMissing), JSON.stringify(sorted));
  });
});

// ══════════════════════════════════════════════════════
// runCoverageObserved
// ══════════════════════════════════════════════════════

describe("runCoverageObserved", () => {
  it("returns empty coverage for no findings", () => {
    const r = ctx.runCoverageObserved([]);
    assert.equal(r.coveredCount, 0);
    assert.ok(r.criteriaMissing.length > 0);
    assert.ok(r.totalCount > 0);
  });

  it("counts criteria from findings", () => {
    const findings = [
      { type: "IMG_MISSING_ALT", wcag: "1.1.1", severity: "medium" },
      { type: "MISSING_LANG", wcag: "3.1.1", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings);
    assert.ok(r.criteriaCovered.includes("1.1.1"));
    assert.ok(r.criteriaCovered.includes("3.1.1"));
    assert.equal(r.coveredCount, 2);
  });

  it("handles compound wcag in findings", () => {
    const findings = [
      { type: "FORM_CONTROL_NO_LABEL", wcag: "1.3.1 / 3.3.2 / 4.1.2", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings);
    assert.ok(r.criteriaCovered.includes("1.3.1"));
    assert.ok(r.criteriaCovered.includes("3.3.2"));
    assert.ok(r.criteriaCovered.includes("4.1.2"));
    assert.equal(r.coveredCount, 3);
  });

  it("handles comma-separated wcag in findings", () => {
    const findings = [
      { type: "X", wcag: "1.3.1,3.3.2,4.1.2", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings);
    assert.ok(r.criteriaCovered.includes("1.3.1"));
    assert.ok(r.criteriaCovered.includes("3.3.2"));
    assert.ok(r.criteriaCovered.includes("4.1.2"));
  });

  it("handles space-separated wcag in findings", () => {
    const findings = [
      { type: "X", wcag: "1.3.1 3.3.2", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings);
    assert.ok(r.criteriaCovered.includes("1.3.1"));
    assert.ok(r.criteriaCovered.includes("3.3.2"));
  });

  it("ignores invalid wcag tokens in findings", () => {
    const findings = [
      { type: "X", wcag: "WCAG 2.4.4 stuff", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings);
    assert.ok(r.criteriaCovered.includes("2.4.4"));
    assert.equal(r.coveredCount, 1); // "WCAG" and "stuff" ignored
  });

  it("deduplicates criteria from multiple findings", () => {
    const findings = [
      { type: "IMG_MISSING_ALT", wcag: "1.1.1", severity: "medium" },
      { type: "AREA_ALT_MISSING", wcag: "1.1.1", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings);
    assert.equal(r.coveredCount, 1);
    assert.ok(r.criteriaCovered.includes("1.1.1"));
  });

  it("ignores findings without wcag", () => {
    const findings = [
      { type: "SHELL_OR_MINIMAL_UI", severity: "info" },
    ];
    const r = ctx.runCoverageObserved(findings);
    assert.equal(r.coveredCount, 0);
  });

  it("ignores null/undefined findings", () => {
    const r = ctx.runCoverageObserved(null);
    assert.equal(r.coveredCount, 0);
  });

  it("criteriaCovered is sorted", () => {
    const findings = [
      { type: "X", wcag: "4.1.2", severity: "high" },
      { type: "Y", wcag: "1.1.1", severity: "medium" },
      { type: "Z", wcag: "2.4.7", severity: "medium" },
    ];
    const r = ctx.runCoverageObserved(findings);
    for (let i = 1; i < r.criteriaCovered.length; i++) {
      assert.ok(r.criteriaCovered[i - 1] < r.criteriaCovered[i]);
    }
  });

  it("is deterministic", () => {
    const findings = [
      { type: "IMG_MISSING_ALT", wcag: "1.1.1", severity: "medium" },
      { type: "MISSING_LANG", wcag: "3.1.1", severity: "medium" },
    ];
    const a = JSON.stringify(ctx.runCoverageObserved(findings));
    const b = JSON.stringify(ctx.runCoverageObserved(findings));
    assert.equal(a, b);
  });
});

// ══════════════════════════════════════════════════════
// New rule fixture tests (deterministic finding shape)
// ══════════════════════════════════════════════════════

describe("new rule fixtures", () => {
  it("ERROR_INPUT_NO_DESCRIPTION finding has correct shape", () => {
    const finding = {
      type: "ERROR_INPUT_NO_DESCRIPTION",
      severity: "medium",
      wcag: "3.3.1",
      confidence: "heuristic",
      note: 'Input marked aria-invalid="true" but no visible error description found via aria-describedby or aria-errormessage.',
    };
    assert.equal(finding.type, "ERROR_INPUT_NO_DESCRIPTION");
    assert.equal(finding.wcag, "3.3.1");
    assert.equal(finding.confidence, "heuristic");
    assert.equal(finding.severity, "medium");
    const status = ctx.classifyReviewStatus(finding);
    assert.equal(status, "needs_review");
  });

  it("REFLOW_VIEWPORT_LOCKED finding has correct shape", () => {
    const finding = {
      type: "REFLOW_VIEWPORT_LOCKED",
      severity: "medium",
      wcag: "1.4.10",
      confidence: "heuristic",
    };
    assert.equal(finding.wcag, "1.4.10");
    const status = ctx.classifyReviewStatus(finding);
    assert.equal(status, "needs_review");
  });

  it("MISSING_LANG_ON_PART finding has correct shape", () => {
    const finding = {
      type: "MISSING_LANG_ON_PART",
      severity: "low",
      wcag: "3.1.2",
      confidence: "heuristic",
    };
    assert.equal(finding.wcag, "3.1.2");
    const status = ctx.classifyReviewStatus(finding);
    assert.equal(status, "needs_review");
  });

  it("TEXT_SPACING_CLIP_RISK finding has correct shape", () => {
    const finding = {
      type: "TEXT_SPACING_CLIP_RISK",
      severity: "low",
      wcag: "1.4.12",
      confidence: "advisory",
    };
    assert.equal(finding.wcag, "1.4.12");
    const status = ctx.classifyReviewStatus(finding);
    assert.equal(status, "needs_review");
  });

  it("LINK_NO_ACCESSIBLE_NAME finding is classified as automated", () => {
    const finding = {
      type: "LINK_NO_ACCESSIBLE_NAME",
      severity: "medium",
      wcag: "2.4.4",
      confidence: "strict",
    };
    assert.equal(finding.wcag, "2.4.4");
    const status = ctx.classifyReviewStatus(finding);
    assert.equal(status, "automated");
  });

  it("ERROR_SUGGESTION_MISSING finding has correct shape", () => {
    const finding = {
      type: "ERROR_SUGGESTION_MISSING",
      severity: "low",
      wcag: "3.3.3",
      confidence: "advisory",
    };
    assert.equal(finding.wcag, "3.3.3");
    const status = ctx.classifyReviewStatus(finding);
    assert.equal(status, "needs_review");
  });

  it("new rules are deterministic — same fixture produces same classification", () => {
    const fixtures = [
      { type: "ERROR_INPUT_NO_DESCRIPTION", severity: "medium", wcag: "3.3.1", confidence: "heuristic" },
      { type: "REFLOW_VIEWPORT_LOCKED", severity: "medium", wcag: "1.4.10", confidence: "heuristic" },
      { type: "MISSING_LANG_ON_PART", severity: "low", wcag: "3.1.2", confidence: "heuristic" },
      { type: "TEXT_SPACING_CLIP_RISK", severity: "low", wcag: "1.4.12", confidence: "advisory" },
      { type: "LINK_NO_ACCESSIBLE_NAME", severity: "medium", wcag: "2.4.4", confidence: "strict" },
      { type: "ERROR_SUGGESTION_MISSING", severity: "low", wcag: "3.3.3", confidence: "advisory" },
    ];
    const a = fixtures.map(f => ctx.classifyReviewStatus(f));
    const b = fixtures.map(f => ctx.classifyReviewStatus(f));
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});

// ══════════════════════════════════════════════════════
// Part 5 — Exports integrity
// ══════════════════════════════════════════════════════

describe("exports include coverage fields", () => {
  it("enrichRunJsonExport includes engineCoverage", () => {
    const result = { bestEntry: { result: { findings: [] } } };
    const enriched = ctx.enrichRunJsonExport(result);
    assert.ok(enriched.engineCoverage, "should have engineCoverage");
    assert.ok(enriched.engineCoverage.coverageVersion >= 1);
    assert.ok(Array.isArray(enriched.engineCoverage.criteriaCovered));
    assert.ok(enriched.engineCoverage.totalCount > 0);
  });

  it("enrichRunJsonExport includes observedCoverage", () => {
    const result = {
      bestEntry: {
        result: {
          findings: [
            { type: "IMG_MISSING_ALT", wcag: "1.1.1", severity: "medium" },
          ],
        },
      },
    };
    const enriched = ctx.enrichRunJsonExport(result);
    assert.ok(enriched.observedCoverage, "should have observedCoverage");
    assert.ok(enriched.observedCoverage.criteriaCovered.includes("1.1.1"));
  });

  it("enrichRunJsonExport observed is empty for no findings", () => {
    const result = { bestEntry: { result: { findings: [] } } };
    const enriched = ctx.enrichRunJsonExport(result);
    assert.equal(enriched.observedCoverage.coveredCount, 0);
  });

  it("enrichRunJsonExport is deterministic", () => {
    const result = {
      bestEntry: {
        result: {
          findings: [
            { type: "IMG_MISSING_ALT", wcag: "1.1.1", severity: "medium" },
            { type: "MISSING_LANG", wcag: "3.1.1", severity: "medium" },
          ],
        },
      },
    };
    const a = ctx.enrichRunJsonExport(result);
    const b = ctx.enrichRunJsonExport(result);
    assert.equal(
      JSON.stringify(a.engineCoverage),
      JSON.stringify(b.engineCoverage)
    );
    assert.equal(
      JSON.stringify(a.observedCoverage),
      JSON.stringify(b.observedCoverage)
    );
  });

  it("buildMarkdown includes coverage lines", () => {
    const md = ctx.buildMarkdown({
      inspectedUrl: "https://example.com",
      best: { result: { mode: "run", findings: [{ type: "IMG_MISSING_ALT", wcag: "1.1.1", severity: "medium" }] } },
      perFrame: [],
      usedFrameIds: [0],
      envTag: "test",
    });
    assert.ok(md.includes("Coverage (engine):"), "should include engine coverage line");
    assert.ok(md.includes("Coverage (observed):"), "should include observed coverage line");
  });

  it("buildMarkdown coverage lines are deterministic", () => {
    const opts = {
      inspectedUrl: "https://example.com",
      best: { result: { mode: "run", findings: [{ type: "IMG_MISSING_ALT", wcag: "1.1.1", severity: "medium" }] } },
      perFrame: [],
      usedFrameIds: [0],
      envTag: "test",
    };
    const a = ctx.buildMarkdown(opts);
    const b = ctx.buildMarkdown(opts);
    // Extract coverage lines
    const getCovLines = (md) => md.split("\n").filter(l => l.includes("Coverage ("));
    assert.equal(
      JSON.stringify(getCovLines(a)),
      JSON.stringify(getCovLines(b))
    );
  });

  it("compactSessionForExport includes engineCoverage", () => {
    const session = {
      id: "test",
      steps: [],
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      rawAppendix: {},
    };
    const compacted = ctx.compactSessionForExport(session);
    assert.ok(compacted.engineCoverage, "should have engineCoverage");
    assert.ok(compacted.engineCoverage.coverageVersion >= 1);
  });

  it("compactSessionForExport engineCoverage is deterministic", () => {
    const session = {
      id: "test",
      steps: [],
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      rawAppendix: {},
    };
    const a = ctx.compactSessionForExport(session);
    const b = ctx.compactSessionForExport(session);
    assert.equal(
      JSON.stringify(a.engineCoverage),
      JSON.stringify(b.engineCoverage)
    );
  });

  it("buildSessionMarkdown includes engine coverage line", () => {
    const session = {
      id: "test-session",
      inspectedOrigin: "example.com",
      envTag: "test",
      startedAt: "2024-01-01T00:00:00Z",
      steps: [],
      frames: { frameKeys: [] },
      settings: {},
      rawAppendix: {},
    };
    const md = ctx.buildSessionMarkdown(session);
    assert.ok(md.includes("Coverage (engine):"), "should include engine coverage line");
  });
});

// ══════════════════════════════════════════════════════
// V2 expansion — RULE_TO_WCAG entries
// ══════════════════════════════════════════════════════

describe("RULE_TO_WCAG v2 expansion entries", () => {
  it("includes all 6 new v2 expansion rules", () => {
    const rules = Object.keys(ctx.__RULE_TO_WCAG);
    assert.ok(rules.includes("LABEL_FOR_MISSING_TARGET"));
    assert.ok(rules.includes("INPUT_MISSING_LABEL"));
    assert.ok(rules.includes("BUTTON_WITHOUT_TYPE"));
    assert.ok(rules.includes("LINK_EMPTY_HREF"));
    assert.ok(rules.includes("IMG_ROLE_PRESENTATIONAL_WITH_ALT"));
    assert.ok(rules.includes("FORM_CONTROL_DUPLICATE_NAME"));
  });

  it("LABEL_FOR_MISSING_TARGET maps to 1.3.1 strict with also 3.3.2", () => {
    const m = ctx.__RULE_TO_WCAG.LABEL_FOR_MISSING_TARGET;
    assert.equal(m.criterion, "1.3.1");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "strict");
    assert.ok(Array.isArray(m.also), "also should be an array");
    assert.equal(m.also.length, 1);
    assert.equal(m.also[0], "3.3.2");
  });

  it("INPUT_MISSING_LABEL maps to 1.3.1 strict", () => {
    const m = ctx.__RULE_TO_WCAG.INPUT_MISSING_LABEL;
    assert.equal(m.criterion, "1.3.1");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "strict");
  });

  it("BUTTON_WITHOUT_TYPE maps to 2.1.1 heuristic", () => {
    const m = ctx.__RULE_TO_WCAG.BUTTON_WITHOUT_TYPE;
    assert.equal(m.criterion, "2.1.1");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "heuristic");
  });

  it("LINK_EMPTY_HREF maps to 2.4.4 strict", () => {
    const m = ctx.__RULE_TO_WCAG.LINK_EMPTY_HREF;
    assert.equal(m.criterion, "2.4.4");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "strict");
  });

  it("IMG_ROLE_PRESENTATIONAL_WITH_ALT maps to 1.1.1 strict", () => {
    const m = ctx.__RULE_TO_WCAG.IMG_ROLE_PRESENTATIONAL_WITH_ALT;
    assert.equal(m.criterion, "1.1.1");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "strict");
  });

  it("FORM_CONTROL_DUPLICATE_NAME maps to 4.1.2 heuristic", () => {
    const m = ctx.__RULE_TO_WCAG.FORM_CONTROL_DUPLICATE_NAME;
    assert.equal(m.criterion, "4.1.2");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "heuristic");
  });

  it("DUPLICATE_ID upgraded to strict confidence", () => {
    assert.equal(ctx.__RULE_TO_WCAG.DUPLICATE_ID.confidence, "strict");
  });

  it("ARIA_VALID_ATTR upgraded to strict confidence", () => {
    assert.equal(ctx.__RULE_TO_WCAG.ARIA_VALID_ATTR.confidence, "strict");
  });
});

// ══════════════════════════════════════════════════════
// V2 expansion — fixture tests (finding shape + classification)
// ══════════════════════════════════════════════════════

describe("v2 expansion rule fixtures", () => {
  it("LABEL_FOR_MISSING_TARGET finding has correct shape", () => {
    const f = {
      type: "LABEL_FOR_MISSING_TARGET", severity: "medium", wcag: "1.3.1 / 3.3.2",
      confidence: "strict", extra: { forAttr: "nonexistent" },
    };
    assert.equal(f.type, "LABEL_FOR_MISSING_TARGET");
    assert.equal(f.wcag, "1.3.1 / 3.3.2");
    assert.equal(f.confidence, "strict");
    assert.equal(f.severity, "medium");
    const status = ctx.classifyReviewStatus(f);
    assert.equal(status, "automated");
  });

  it("INPUT_MISSING_LABEL finding has correct shape", () => {
    const f = {
      type: "INPUT_MISSING_LABEL", severity: "medium", wcag: "1.3.1",
      confidence: "strict",
    };
    assert.equal(f.wcag, "1.3.1");
    assert.equal(f.confidence, "strict");
    const status = ctx.classifyReviewStatus(f);
    assert.equal(status, "automated");
  });

  it("BUTTON_WITHOUT_TYPE finding has correct shape", () => {
    const f = {
      type: "BUTTON_WITHOUT_TYPE", severity: "low", wcag: "2.1.1",
      confidence: "heuristic",
    };
    assert.equal(f.wcag, "2.1.1");
    assert.equal(f.confidence, "heuristic");
    const status = ctx.classifyReviewStatus(f);
    assert.equal(status, "needs_review");
  });

  it("LINK_EMPTY_HREF finding has correct shape", () => {
    const f = {
      type: "LINK_EMPTY_HREF", severity: "medium", wcag: "2.4.4",
      confidence: "strict", extra: { href: "" },
    };
    assert.equal(f.wcag, "2.4.4");
    assert.equal(f.confidence, "strict");
    const status = ctx.classifyReviewStatus(f);
    assert.equal(status, "automated");
  });

  it("IMG_ROLE_PRESENTATIONAL_WITH_ALT finding has correct shape", () => {
    const f = {
      type: "IMG_ROLE_PRESENTATIONAL_WITH_ALT", severity: "low", wcag: "1.1.1",
      confidence: "strict", extra: { role: "presentation", alt: "Photo" },
    };
    assert.equal(f.wcag, "1.1.1");
    assert.equal(f.confidence, "strict");
    const status = ctx.classifyReviewStatus(f);
    assert.equal(status, "automated");
  });

  it("FORM_CONTROL_DUPLICATE_NAME finding has correct shape", () => {
    const f = {
      type: "FORM_CONTROL_DUPLICATE_NAME", severity: "low", wcag: "4.1.2",
      confidence: "heuristic", extra: { name: "gender", count: 3 },
    };
    assert.equal(f.wcag, "4.1.2");
    assert.equal(f.confidence, "heuristic");
    const status = ctx.classifyReviewStatus(f);
    assert.equal(status, "needs_review");
  });

  it("strict v2 rules are classified as automated", () => {
    const strictRules = [
      { type: "LABEL_FOR_MISSING_TARGET", severity: "medium", wcag: "1.3.1 / 3.3.2", confidence: "strict" },
      { type: "INPUT_MISSING_LABEL", severity: "medium", wcag: "1.3.1", confidence: "strict" },
      { type: "LINK_EMPTY_HREF", severity: "medium", wcag: "2.4.4", confidence: "strict" },
      { type: "IMG_ROLE_PRESENTATIONAL_WITH_ALT", severity: "low", wcag: "1.1.1", confidence: "strict" },
    ];
    for (const f of strictRules) {
      assert.equal(ctx.classifyReviewStatus(f), "automated", `${f.type} should be automated`);
    }
  });

  it("heuristic v2 rules are classified as needs_review", () => {
    const heuristicRules = [
      { type: "BUTTON_WITHOUT_TYPE", severity: "low", wcag: "2.1.1", confidence: "heuristic" },
      { type: "FORM_CONTROL_DUPLICATE_NAME", severity: "low", wcag: "4.1.2", confidence: "heuristic" },
    ];
    for (const f of heuristicRules) {
      assert.equal(ctx.classifyReviewStatus(f), "needs_review", `${f.type} should be needs_review`);
    }
  });

  it("v2 rules are deterministic — same fixture produces same classification", () => {
    const fixtures = [
      { type: "LABEL_FOR_MISSING_TARGET", severity: "medium", wcag: "1.3.1 / 3.3.2", confidence: "strict" },
      { type: "INPUT_MISSING_LABEL", severity: "medium", wcag: "1.3.1", confidence: "strict" },
      { type: "BUTTON_WITHOUT_TYPE", severity: "low", wcag: "2.1.1", confidence: "heuristic" },
      { type: "LINK_EMPTY_HREF", severity: "medium", wcag: "2.4.4", confidence: "strict" },
      { type: "IMG_ROLE_PRESENTATIONAL_WITH_ALT", severity: "low", wcag: "1.1.1", confidence: "strict" },
      { type: "FORM_CONTROL_DUPLICATE_NAME", severity: "low", wcag: "4.1.2", confidence: "heuristic" },
    ];
    const a = fixtures.map(f => ctx.classifyReviewStatus(f));
    const b = fixtures.map(f => ctx.classifyReviewStatus(f));
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});

// ══════════════════════════════════════════════════════
// V2 expansion — coverage delta
// ══════════════════════════════════════════════════════

describe("v2 expansion coverage delta", () => {
  it("engineCoverageSummary coveredCount includes v2 criteria", () => {
    const r = ctx.engineCoverageSummary();
    // LABEL_FOR_MISSING_TARGET also covers 3.3.2 via also field
    assert.ok(r.criteriaCovered.includes("3.3.2"), "3.3.2 should be covered via LABEL_FOR_MISSING_TARGET also");
  });

  it("v2 rules contribute to observed coverage", () => {
    const findings = [
      { type: "LABEL_FOR_MISSING_TARGET", wcag: "1.3.1 / 3.3.2", severity: "medium" },
      { type: "LINK_EMPTY_HREF", wcag: "2.4.4", severity: "medium" },
      { type: "BUTTON_WITHOUT_TYPE", wcag: "2.1.1", severity: "low" },
    ];
    const r = ctx.runCoverageObserved(findings);
    assert.ok(r.criteriaCovered.includes("1.3.1"));
    assert.ok(r.criteriaCovered.includes("3.3.2"));
    assert.ok(r.criteriaCovered.includes("2.4.4"));
    assert.ok(r.criteriaCovered.includes("2.1.1"));
    assert.ok(r.coveredCount >= 4);
  });

  it("total RULE_TO_WCAG entry count reflects v2 additions", () => {
    const count = Object.keys(ctx.__RULE_TO_WCAG).length;
    // Was 101 after v1 completeness, +6 new = 107
    assert.ok(count >= 107, `expected >= 107 RULE_TO_WCAG entries, got ${count}`);
  });
});

// ══════════════════════════════════════════════════════
// V3 — Conversational ruleset
// ══════════════════════════════════════════════════════

describe("Conversational ruleset — WCAG_COVERAGE_VERSION", () => {
  it("WCAG_COVERAGE_VERSION is 5 (bumped for guided-check rule mappings)", () => {
    assert.equal(ctx.__WCAG_COVERAGE_VERSION, 5);
  });
});

describe("Conversational ruleset — new RULE_TO_WCAG entries", () => {
  it("CHAT_NO_LIVE_REGION_FOR_MESSAGES maps to 4.1.3 AA strict", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_NO_LIVE_REGION_FOR_MESSAGES;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "4.1.3");
    assert.equal(m.level, "AA");
    assert.equal(m.confidence, "strict");
  });

  it("CHAT_QUICK_REPLY_NOT_BUTTON maps to 4.1.2 A strict", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_QUICK_REPLY_NOT_BUTTON;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "4.1.2");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "strict");
  });

  it("CHAT_LIVE_REGION_ASSERTIVE_MISUSE maps to 4.1.3 AA heuristic", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_LIVE_REGION_ASSERTIVE_MISUSE;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "4.1.3");
    assert.equal(m.level, "AA");
    assert.equal(m.confidence, "heuristic");
  });

  it("CHAT_SCROLL_REGION_NOT_FOCUSABLE maps to 2.1.1 A heuristic", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_SCROLL_REGION_NOT_FOCUSABLE;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "2.1.1");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "heuristic");
  });

  it("MESSAGE_NOT_GROUPED maps to 1.3.1 A advisory", () => {
    const m = ctx.__RULE_TO_WCAG.MESSAGE_NOT_GROUPED;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "1.3.1");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "advisory");
  });
});

describe("Conversational ruleset — CHAT_INPUT_NO_LABEL upgrade", () => {
  it("confidence upgraded to strict", () => {
    assert.equal(ctx.__RULE_TO_WCAG.CHAT_INPUT_NO_LABEL.confidence, "strict");
  });

  it("also includes 4.1.2", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_INPUT_NO_LABEL;
    assert.ok(Array.isArray(m.also), "also should be an array");
    assert.equal(m.also.length, 1);
    assert.equal(m.also[0], "4.1.2");
  });
});

describe("Conversational ruleset — classification", () => {
  it("strict conversational rules are classified as automated", () => {
    const strictRules = [
      { type: "CHAT_NO_LIVE_REGION_FOR_MESSAGES", severity: "medium", wcag: "4.1.3", confidence: "strict" },
      { type: "CHAT_QUICK_REPLY_NOT_BUTTON", severity: "medium", wcag: "4.1.2", confidence: "strict" },
      { type: "CHAT_INPUT_NO_LABEL", severity: "medium", wcag: "1.3.1 / 4.1.2", confidence: "strict" },
    ];
    for (const f of strictRules) {
      assert.equal(ctx.classifyReviewStatus(f), "automated", `${f.type} should be automated`);
    }
  });

  it("heuristic conversational rules are classified as needs_review", () => {
    const heuristicRules = [
      { type: "CHAT_LIVE_REGION_ASSERTIVE_MISUSE", severity: "medium", wcag: "4.1.3", confidence: "heuristic" },
      { type: "CHAT_SCROLL_REGION_NOT_FOCUSABLE", severity: "low", wcag: "2.1.1", confidence: "heuristic" },
    ];
    for (const f of heuristicRules) {
      assert.equal(ctx.classifyReviewStatus(f), "needs_review", `${f.type} should be needs_review`);
    }
  });

  it("advisory conversational rules are classified as needs_review", () => {
    const f = { type: "MESSAGE_NOT_GROUPED", severity: "low", wcag: "1.3.1", confidence: "advisory" };
    assert.equal(ctx.classifyReviewStatus(f), "needs_review");
  });
});

describe("Conversational ruleset — entry count and ordering", () => {
  it("total RULE_TO_WCAG entry count >= 117", () => {
    const count = Object.keys(ctx.__RULE_TO_WCAG).length;
    assert.ok(count >= 117, `expected >= 117 RULE_TO_WCAG entries, got ${count}`);
  });

  it("entries remain alphabetically sorted", () => {
    const keys = Object.keys(ctx.__RULE_TO_WCAG);
    for (let i = 1; i < keys.length; i++) {
      assert.ok(keys[i - 1] < keys[i], `RULE_TO_WCAG out of order: ${keys[i - 1]} before ${keys[i]}`);
    }
  });

  it("conversational rules are deterministic", () => {
    const fixtures = [
      { type: "CHAT_NO_LIVE_REGION_FOR_MESSAGES", severity: "medium", wcag: "4.1.3", confidence: "strict" },
      { type: "CHAT_QUICK_REPLY_NOT_BUTTON", severity: "medium", wcag: "4.1.2", confidence: "strict" },
      { type: "CHAT_LIVE_REGION_ASSERTIVE_MISUSE", severity: "medium", wcag: "4.1.3", confidence: "heuristic" },
      { type: "CHAT_SCROLL_REGION_NOT_FOCUSABLE", severity: "low", wcag: "2.1.1", confidence: "heuristic" },
      { type: "MESSAGE_NOT_GROUPED", severity: "low", wcag: "1.3.1", confidence: "advisory" },
    ];
    const a = fixtures.map(f => ctx.classifyReviewStatus(f));
    const b = fixtures.map(f => ctx.classifyReviewStatus(f));
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});

describe("Conversational ruleset — completeness", () => {
  const snippetSrc = readFileSync(SNIPPET_PATH, "utf8");
  const chatRuleTypes = [
    ...snippetSrc.matchAll(/type:\s*"(CHAT_[A-Z0-9_]+)"/g),
    ...snippetSrc.matchAll(/type:\s*"(MESSAGE_[A-Z0-9_]+)"/g),
  ].map(m => m[1]);
  const uniqueChatRules = [...new Set(chatRuleTypes)].sort();

  it("every chat ruleType in snippet is mapped in RULE_TO_WCAG", () => {
    const ruleMapKeys = new Set(Object.keys(ctx.__RULE_TO_WCAG));
    const missing = uniqueChatRules.filter(r => !ruleMapKeys.has(r));
    assert.equal(missing.length, 0,
      `chat rules missing from RULE_TO_WCAG: ${missing.join(", ")}`);
  });
});

// ══════════════════════════════════════════════════════
// V4 — State-based conversational rules
// ══════════════════════════════════════════════════════

describe("V4 state-based rules — RULE_TO_WCAG entries", () => {
  it("CHAT_NEW_MESSAGE_NOT_ANNOUNCED maps to 4.1.3 AA heuristic", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_NEW_MESSAGE_NOT_ANNOUNCED;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "4.1.3");
    assert.equal(m.level, "AA");
    assert.equal(m.confidence, "heuristic");
  });

  it("CHAT_INPUT_LOSES_FOCUS_ON_UPDATE maps to 2.4.3 A heuristic", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_INPUT_LOSES_FOCUS_ON_UPDATE;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "2.4.3");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "heuristic");
  });

  it("v4 heuristic rules are classified as needs_review", () => {
    const rules = [
      { type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED", severity: "medium", wcag: "4.1.3", confidence: "heuristic" },
      { type: "CHAT_INPUT_LOSES_FOCUS_ON_UPDATE", severity: "medium", wcag: "2.4.3", confidence: "heuristic" },
    ];
    for (const f of rules) {
      assert.equal(ctx.classifyReviewStatus(f), "needs_review", `${f.type} should be needs_review`);
    }
  });

  it("v4 rules are deterministic", () => {
    const fixtures = [
      { type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED", severity: "medium", wcag: "4.1.3", confidence: "heuristic" },
      { type: "CHAT_INPUT_LOSES_FOCUS_ON_UPDATE", severity: "medium", wcag: "2.4.3", confidence: "heuristic" },
    ];
    const a = fixtures.map(f => ctx.classifyReviewStatus(f));
    const b = fixtures.map(f => ctx.classifyReviewStatus(f));
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });
});

// ── Helpers ──────────────────────────────────────────

/** Compare WCAG criterion numbers (e.g., "1.1.1" < "1.4.10") */
function compareCriterionNumbers(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}
