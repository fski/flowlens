/**
 * Weighted score + manual checklist (Lighthouse pattern).
 *
 * computeWeightedScore (signature-engine.js):
 *   weightedSum = Σ weight(severity)  with high=10, medium=3, low=1, info=0
 *   score = round(100 * (1 - min(1, weightedSum / (10 + weightedSum))))
 *
 * buildManualChecklist (exporters.js): static {id, label, wcag} items for
 * WCAG areas automation cannot decide.
 *
 * buildHtmlReport must render the score and the manual checklist section
 * when provided in the payload — and omit both when absent.
 */

import { strict as assert } from "node:assert";
import { describe, it, before } from "node:test";
import { createContext } from "./harness.mjs";

let ctx;
before(() => { ctx = createContext(); });

const finding = (severity) => ({ severity, type: "X", wcag: "1.1.1" });

// ══════════════════════════════════════════════════════
// computeWeightedScore
// ══════════════════════════════════════════════════════

describe("computeWeightedScore", () => {
  it("scores 100 with no findings", () => {
    assert.equal(ctx.computeWeightedScore([]).score, 100);
    assert.equal(ctx.computeWeightedScore(null).score, 100);
    assert.equal(ctx.computeWeightedScore(undefined).score, 100);
  });

  it("info-only findings do not affect the score", () => {
    const infos = Array.from({ length: 25 }, () => finding("info"));
    assert.equal(ctx.computeWeightedScore(infos).score, 100);
  });

  it("returns the documented severity weights", () => {
    const { weights } = ctx.computeWeightedScore([]);
    // JSON round-trip: vm-created objects have a different Object prototype
    assert.deepEqual(JSON.parse(JSON.stringify(weights)), { high: 10, medium: 3, low: 1, info: 0 });
  });

  it("matches the documented formula exactly", () => {
    // one high finding: weightedSum=10 → round(100 * (1 - 10/20)) = 50
    assert.equal(ctx.computeWeightedScore([finding("high")]).score, 50);
    // one low finding: weightedSum=1 → round(100 * (1 - 1/11)) = 91
    assert.equal(ctx.computeWeightedScore([finding("low")]).score, 91);
    // one medium finding: weightedSum=3 → round(100 * (1 - 3/13)) = 77
    assert.equal(ctx.computeWeightedScore([finding("medium")]).score, 77);
  });

  it("decreases monotonically as findings accumulate", () => {
    const severities = ["high", "medium", "low", "high", "medium", "low", "high", "high"];
    let prev = ctx.computeWeightedScore([]).score;
    const list = [];
    for (const sev of severities) {
      list.push(finding(sev));
      const { score } = ctx.computeWeightedScore(list);
      assert.ok(score < prev, `adding a ${sev} finding must lower the score (${prev} -> ${score})`);
      prev = score;
    }
  });

  it("weighs high > medium > low > (info = none)", () => {
    const high = ctx.computeWeightedScore([finding("high")]).score;
    const medium = ctx.computeWeightedScore([finding("medium")]).score;
    const low = ctx.computeWeightedScore([finding("low")]).score;
    const info = ctx.computeWeightedScore([finding("info")]).score;
    assert.ok(high < medium, "high hits harder than medium");
    assert.ok(medium < low, "medium hits harder than low");
    assert.ok(low < info, "low hits harder than info");
    assert.equal(info, 100);
  });

  it("stays bounded 0-100 even for extreme inputs", () => {
    const huge = Array.from({ length: 5000 }, () => finding("high"));
    const { score } = ctx.computeWeightedScore(huge);
    assert.ok(score >= 0 && score <= 100, `score ${score} out of bounds`);
    assert.ok(Number.isInteger(score), "score is a rounded integer");
  });

  it("treats critical as high and unknown severities as info", () => {
    assert.equal(
      ctx.computeWeightedScore([finding("critical")]).score,
      ctx.computeWeightedScore([finding("high")]).score
    );
    assert.equal(ctx.computeWeightedScore([finding("banana")]).score, 100);
    assert.equal(ctx.computeWeightedScore([{}]).score, 100);
  });

  it("is order-independent", () => {
    const a = [finding("high"), finding("low"), finding("medium")];
    const b = [finding("medium"), finding("high"), finding("low")];
    assert.equal(ctx.computeWeightedScore(a).score, ctx.computeWeightedScore(b).score);
  });
});

// ══════════════════════════════════════════════════════
// buildManualChecklist
// ══════════════════════════════════════════════════════

describe("buildManualChecklist", () => {
  it("is non-empty with 8-12 items", () => {
    const items = ctx.buildManualChecklist("run");
    assert.ok(Array.isArray(items));
    assert.ok(items.length >= 8 && items.length <= 12, `expected 8-12 items, got ${items.length}`);
  });

  it("every item has a unique id", () => {
    const items = ctx.buildManualChecklist("run");
    const ids = items.map(i => i.id);
    assert.ok(ids.every(id => typeof id === "string" && id.length > 0));
    assert.equal(new Set(ids).size, ids.length, "ids must be unique");
  });

  it("every item has a non-empty label and a WCAG reference", () => {
    for (const item of ctx.buildManualChecklist("run")) {
      assert.ok(typeof item.label === "string" && item.label.length > 0, `label missing for ${item.id}`);
      assert.match(String(item.wcag), /\d+\.\d+\.\d+/, `wcag ref missing for ${item.id}`);
    }
  });

  it("covers the key manual-only areas", () => {
    const blob = ctx.buildManualChecklist("run").map(i => `${i.id} ${i.label}`).join(" ").toLowerCase();
    for (const topic of ["alt", "focus order", "error", "captions", "motion", "cognitive"]) {
      assert.ok(blob.includes(topic), `checklist should cover "${topic}"`);
    }
  });

  it("is deterministic and identical across modes", () => {
    assert.deepEqual(ctx.buildManualChecklist("run"), ctx.buildManualChecklist("run"));
    assert.deepEqual(ctx.buildManualChecklist("run"), ctx.buildManualChecklist("observe"));
    assert.deepEqual(ctx.buildManualChecklist(), ctx.buildManualChecklist("run"));
  });
});

// ══════════════════════════════════════════════════════
// buildHtmlReport — score + manual checklist
// ══════════════════════════════════════════════════════

describe("buildHtmlReport score + manual checklist", () => {
  const payload = () => ({
    title: "FlowLens Accessibility Report",
    generatedAt: "2026-07-07T12:00:00.000Z",
    url: "https://example.com/",
    mode: "run",
    findings: [{ severity: "high", wcag: "1.1.1", name: "img", type: "IMG_MISSING_ALT", path: "img" }],
    severityCounts: { high: 1 },
  });

  it("renders the score when provided", () => {
    const html = ctx.buildHtmlReport({ ...payload(), score: 87 });
    assert.ok(html.includes("Score: 87/100"), "score line present");
    assert.ok(html.includes("severity-weighted"), "score line explains weighting");
  });

  it("renders the manual checklist section with every item", () => {
    const checklist = ctx.buildManualChecklist("run");
    const html = ctx.buildHtmlReport({ ...payload(), score: 50, manualChecklist: checklist });
    assert.ok(html.includes("Automation covers only part of WCAG"), "checklist heading present");
    for (const item of checklist) {
      assert.ok(html.includes(ctx.htmlEscape(item.label)), `checklist item rendered: ${item.id}`);
      assert.ok(html.includes(ctx.htmlEscape(item.wcag)), `wcag ref rendered: ${item.id}`);
    }
  });

  it("omits score and checklist when not provided (backwards compatible)", () => {
    const html = ctx.buildHtmlReport(payload());
    assert.ok(!html.includes("Score:"), "no score line without payload.score");
    assert.ok(!html.includes("manual checks"), "no checklist section without payload.manualChecklist");
  });

  it("clamps and rounds out-of-range scores", () => {
    assert.ok(ctx.buildHtmlReport({ ...payload(), score: 250 }).includes("Score: 100/100"));
    assert.ok(ctx.buildHtmlReport({ ...payload(), score: -5 }).includes("Score: 0/100"));
    assert.ok(ctx.buildHtmlReport({ ...payload(), score: 86.6 }).includes("Score: 87/100"));
  });

  it("escapes checklist content", () => {
    const html = ctx.buildHtmlReport({
      ...payload(),
      manualChecklist: [{ id: "x", label: '<script>alert("x")</script>', wcag: "1.1.1" }],
    });
    assert.ok(!html.includes('<script>alert("x")</script>'), "raw markup must not pass through");
    assert.ok(html.includes("&lt;script&gt;"), "markup is escaped");
  });
});

// ══════════════════════════════════════════════════════
// Panel integration (source-level)
// ══════════════════════════════════════════════════════

describe("panel score chip + manual checks wiring", () => {
  it("renderScoreChip and renderManualChecklist are defined in the panel", () => {
    assert.equal(typeof ctx.renderScoreChip, "function");
    assert.equal(typeof ctx.renderManualChecklist, "function");
  });

  it("renderScoreChip tolerates a mocked DOM (no throw)", () => {
    ctx.renderScoreChip([finding("high"), finding("low")]);
    ctx.renderScoreChip(null);
  });
});
