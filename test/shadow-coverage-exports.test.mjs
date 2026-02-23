/**
 * Shadow coverage in JSON & Markdown exports — pure function tests.
 * Tests formatShadowCoverageLine, computeSessionShadowWarnings,
 * enrichRunJsonExport, buildMarkdown shadow coverage line,
 * and buildSessionMarkdown shadow coverage + warnings.
 */

import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { createContext } from "./harness.mjs";

// ══════════════════════════════════════════════════════
// formatShadowCoverageLine
// ══════════════════════════════════════════════════════

describe("formatShadowCoverageLine", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("returns empty string for null", () => {
    assert.equal(ctx.formatShadowCoverageLine(null), "");
  });

  it("returns empty string for undefined", () => {
    assert.equal(ctx.formatShadowCoverageLine(undefined), "");
  });

  it("returns empty string for non-object", () => {
    assert.equal(ctx.formatShadowCoverageLine("string"), "");
  });

  it("returns empty string when scopesFound is 0", () => {
    assert.equal(ctx.formatShadowCoverageLine({
      scopesFound: 0, scopesAudited: 0,
      scopesCapped: false, maxDepthObserved: 0, depthLimitReached: false,
    }), "");
  });

  it("returns line with count for normal coverage", () => {
    const line = ctx.formatShadowCoverageLine({
      scopesFound: 5, scopesAudited: 5,
      scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false,
    });
    assert.ok(line.includes("Shadow coverage:"));
    assert.ok(line.includes("5/5 shadow scopes audited"));
    assert.ok(line.includes("(FULL)"));
  });

  it("includes CAPPED badge", () => {
    const line = ctx.formatShadowCoverageLine({
      scopesFound: 100, scopesAudited: 50,
      scopesCapped: true, maxDepthObserved: 3, depthLimitReached: false,
    });
    assert.ok(line.includes("(CAPPED)"));
    assert.ok(!line.includes("DEPTH LIMIT"));
  });

  it("includes DEPTH LIMIT badge", () => {
    const line = ctx.formatShadowCoverageLine({
      scopesFound: 10, scopesAudited: 8,
      scopesCapped: false, maxDepthObserved: 5, depthLimitReached: true,
    });
    assert.ok(line.includes("(DEPTH LIMIT)"));
    assert.ok(!line.includes("CAPPED"));
  });

  it("includes both CAPPED and DEPTH LIMIT badges", () => {
    const line = ctx.formatShadowCoverageLine({
      scopesFound: 100, scopesAudited: 50,
      scopesCapped: true, maxDepthObserved: 5, depthLimitReached: true,
    });
    assert.ok(line.includes("(CAPPED, DEPTH LIMIT)"));
  });

  it("no badge when partial coverage without caps", () => {
    const line = ctx.formatShadowCoverageLine({
      scopesFound: 10, scopesAudited: 8,
      scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false,
    });
    assert.ok(line.includes("8/10 shadow scopes audited"));
    assert.ok(!line.includes("("));
  });

  it("is deterministic", () => {
    const cov = {
      scopesFound: 12, scopesAudited: 10,
      scopesCapped: true, maxDepthObserved: 3, depthLimitReached: false,
    };
    assert.equal(ctx.formatShadowCoverageLine(cov), ctx.formatShadowCoverageLine(cov));
  });
});

// ══════════════════════════════════════════════════════
// computeSessionShadowWarnings
// ══════════════════════════════════════════════════════

describe("computeSessionShadowWarnings", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  function makeStep(index, cov) {
    return {
      index,
      snapshots: {
        run: {
          best: {
            shadowCoverage: cov,
          },
        },
      },
    };
  }

  it("returns empty for null/undefined steps", () => {
    assert.equal(ctx.computeSessionShadowWarnings(null).length, 0);
    assert.equal(ctx.computeSessionShadowWarnings(undefined).length, 0);
  });

  it("returns empty for single step", () => {
    const steps = [makeStep(1, { scopesAudited: 5, scopesCapped: false, depthLimitReached: false })];
    assert.equal(ctx.computeSessionShadowWarnings(steps).length, 0);
  });

  it("returns empty when consecutive steps have identical coverage", () => {
    const cov = { scopesAudited: 5, scopesCapped: false, depthLimitReached: false };
    const steps = [makeStep(1, cov), makeStep(2, cov)];
    assert.equal(ctx.computeSessionShadowWarnings(steps).length, 0);
  });

  it("detects scopesAudited change", () => {
    const steps = [
      makeStep(1, { scopesAudited: 3, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 7, scopesCapped: false, depthLimitReached: false }),
    ];
    const warnings = ctx.computeSessionShadowWarnings(steps);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].stepIndex, 2);
    assert.equal(warnings[0].fromStepIndex, 1);
    assert.equal(warnings[0].toStepIndex, 2);
    assert.equal(warnings[0].warning.type, "SHADOW_COVERAGE_CHANGED");
  });

  it("detects scopesCapped change", () => {
    const steps = [
      makeStep(1, { scopesAudited: 5, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 5, scopesCapped: true, depthLimitReached: false }),
    ];
    const warnings = ctx.computeSessionShadowWarnings(steps);
    assert.equal(warnings.length, 1);
  });

  it("detects depthLimitReached change", () => {
    const steps = [
      makeStep(1, { scopesAudited: 5, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 5, scopesCapped: false, depthLimitReached: true }),
    ];
    const warnings = ctx.computeSessionShadowWarnings(steps);
    assert.equal(warnings.length, 1);
  });

  it("detects multiple warnings across steps with from/to indices", () => {
    const steps = [
      makeStep(1, { scopesAudited: 3, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 5, scopesCapped: false, depthLimitReached: false }),
      makeStep(3, { scopesAudited: 5, scopesCapped: true, depthLimitReached: false }),
    ];
    const warnings = ctx.computeSessionShadowWarnings(steps);
    assert.equal(warnings.length, 2);
    assert.equal(warnings[0].fromStepIndex, 1);
    assert.equal(warnings[0].toStepIndex, 2);
    assert.equal(warnings[1].fromStepIndex, 2);
    assert.equal(warnings[1].toStepIndex, 3);
  });

  it("returns warnings sorted by stepIndex", () => {
    const steps = [
      makeStep(1, { scopesAudited: 3, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 5, scopesCapped: false, depthLimitReached: false }),
      makeStep(3, { scopesAudited: 8, scopesCapped: true, depthLimitReached: true }),
    ];
    const warnings = ctx.computeSessionShadowWarnings(steps);
    for (let i = 1; i < warnings.length; i++) {
      assert.ok(warnings[i].stepIndex >= warnings[i - 1].stepIndex);
    }
  });

  it("handles steps with missing shadowCoverage gracefully", () => {
    const steps = [
      makeStep(1, null),
      makeStep(2, { scopesAudited: 5, scopesCapped: false, depthLimitReached: false }),
    ];
    const warnings = ctx.computeSessionShadowWarnings(steps);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].warning.type, "SHADOW_COVERAGE_CHANGED");
  });

  it("returns empty when both steps lack coverage", () => {
    const steps = [makeStep(1, null), makeStep(2, null)];
    assert.equal(ctx.computeSessionShadowWarnings(steps).length, 0);
  });

  it("is deterministic", () => {
    const steps = [
      makeStep(1, { scopesAudited: 3, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 8, scopesCapped: true, depthLimitReached: true }),
    ];
    const a = ctx.computeSessionShadowWarnings(steps);
    const b = ctx.computeSessionShadowWarnings(steps);
    assert.equal(a.length, b.length);
    for (let i = 0; i < a.length; i++) {
      assert.equal(a[i].stepIndex, b[i].stepIndex);
      assert.equal(a[i].warning.type, b[i].warning.type);
    }
  });
});

// ══════════════════════════════════════════════════════
// enrichRunJsonExport
// ══════════════════════════════════════════════════════

describe("enrichRunJsonExport", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("returns empty object for null", () => {
    const out = ctx.enrichRunJsonExport(null);
    assert.equal(typeof out, "object");
  });

  it("adds shadowCoverage at top level from bestEntry.result", () => {
    const cov = { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false };
    const result = {
      ok: true,
      bestEntry: { result: { shadowCoverage: cov, findings: [] } },
    };
    const out = ctx.enrichRunJsonExport(result);
    assert.equal(out.shadowCoverage, cov);
    assert.ok(out.ok);
  });

  it("adds shadowCoverage from best.result when bestEntry missing", () => {
    const cov = { scopesFound: 3, scopesAudited: 3, scopesCapped: false };
    const result = {
      ok: true,
      best: { result: { shadowCoverage: cov } },
    };
    const out = ctx.enrichRunJsonExport(result);
    assert.equal(out.shadowCoverage, cov);
  });

  it("falls back to bestEntry.shadowCoverage", () => {
    const cov = { scopesFound: 2, scopesAudited: 1, scopesCapped: true };
    const result = {
      ok: true,
      bestEntry: { shadowCoverage: cov },
    };
    const out = ctx.enrichRunJsonExport(result);
    assert.equal(out.shadowCoverage, cov);
  });

  it("sets shadowCoverage to null when not found", () => {
    const result = { ok: true, bestEntry: { result: {} } };
    const out = ctx.enrichRunJsonExport(result);
    assert.equal(out.shadowCoverage, null);
  });

  it("does not mutate original result", () => {
    const result = { ok: true, bestEntry: { result: { shadowCoverage: { scopesFound: 1 } } } };
    const original = JSON.parse(JSON.stringify(result));
    ctx.enrichRunJsonExport(result);
    assert.equal(result.shadowCoverage, undefined);
    assert.equal(JSON.stringify(result), JSON.stringify(original));
  });

  it("is deterministic", () => {
    const result = {
      ok: true,
      bestEntry: { result: { shadowCoverage: { scopesFound: 5, scopesAudited: 5 }, findings: [] } },
    };
    const a = ctx.enrichRunJsonExport(result);
    const b = ctx.enrichRunJsonExport(result);
    assert.equal(JSON.stringify(a.shadowCoverage), JSON.stringify(b.shadowCoverage));
  });
});

// ══════════════════════════════════════════════════════
// buildMarkdown — shadow coverage line
// ══════════════════════════════════════════════════════

describe("buildMarkdown with shadow coverage", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  const baseBest = {
    result: { mode: "run", env: { inIframe: false }, findings: [] },
    normalized: { type: "run", primaryCounts: {} },
  };

  it("includes shadow coverage line when data present", () => {
    const md = ctx.buildMarkdown({
      inspectedUrl: "https://example.com",
      best: baseBest,
      perFrame: [],
      usedFrameIds: ["f1"],
      envTag: "example.com \u2022 prod",
      shadowCoverage: { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false },
    });
    assert.ok(md.includes("Shadow coverage:"));
    assert.ok(md.includes("5/5 shadow scopes audited"));
    assert.ok(md.includes("(FULL)"));
  });

  it("includes CAPPED badge in shadow coverage line", () => {
    const md = ctx.buildMarkdown({
      inspectedUrl: "https://example.com",
      best: baseBest,
      perFrame: [],
      usedFrameIds: [],
      envTag: "test",
      shadowCoverage: { scopesFound: 100, scopesAudited: 50, scopesCapped: true, maxDepthObserved: 3, depthLimitReached: false },
    });
    assert.ok(md.includes("(CAPPED)"));
  });

  it("includes DEPTH LIMIT badge", () => {
    const md = ctx.buildMarkdown({
      inspectedUrl: "https://example.com",
      best: baseBest,
      perFrame: [],
      usedFrameIds: [],
      envTag: "test",
      shadowCoverage: { scopesFound: 10, scopesAudited: 8, scopesCapped: false, maxDepthObserved: 5, depthLimitReached: true },
    });
    assert.ok(md.includes("(DEPTH LIMIT)"));
  });

  it("does not include shadow line when no shadow roots", () => {
    const md = ctx.buildMarkdown({
      inspectedUrl: "https://example.com",
      best: baseBest,
      perFrame: [],
      usedFrameIds: [],
      envTag: "test",
      shadowCoverage: { scopesFound: 0, scopesAudited: 0 },
    });
    assert.ok(!md.includes("Shadow coverage:"));
  });

  it("does not include shadow line when shadowCoverage is null", () => {
    const md = ctx.buildMarkdown({
      inspectedUrl: "https://example.com",
      best: baseBest,
      perFrame: [],
      usedFrameIds: [],
      envTag: "test",
      shadowCoverage: null,
    });
    assert.ok(!md.includes("Shadow coverage:"));
  });

  it("falls back to result.shadowCoverage when param not provided", () => {
    const bestWithCov = {
      result: {
        mode: "run", env: { inIframe: false }, findings: [],
        shadowCoverage: { scopesFound: 3, scopesAudited: 3, scopesCapped: false, maxDepthObserved: 1, depthLimitReached: false },
      },
      normalized: { type: "run", primaryCounts: {} },
    };
    const md = ctx.buildMarkdown({
      inspectedUrl: "https://example.com",
      best: bestWithCov,
      perFrame: [],
      usedFrameIds: [],
      envTag: "test",
    });
    assert.ok(md.includes("Shadow coverage:"));
    assert.ok(md.includes("3/3 shadow scopes audited"));
  });

  it("is deterministic", () => {
    const args = {
      inspectedUrl: "https://example.com",
      best: baseBest,
      perFrame: [],
      usedFrameIds: [],
      envTag: "test",
      shadowCoverage: { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false },
    };
    assert.equal(ctx.buildMarkdown(args), ctx.buildMarkdown(args));
  });
});

// ══════════════════════════════════════════════════════
// buildSessionMarkdown — shadow coverage + warnings
// ══════════════════════════════════════════════════════

describe("buildSessionMarkdown with shadow coverage", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  function makeSession(steps) {
    return {
      id: "sess_test",
      inspectedOrigin: "https://example.com",
      envTag: "example.com \u2022 prod",
      startedAt: "2025-01-15T10:00:00.000Z",
      endedAt: "2025-01-15T10:05:00.000Z",
      steps: steps || [],
      frames: { frameKeys: [] },
      rawAppendix: {},
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      settings: {},
    };
  }

  function makeStep(index, cov) {
    return {
      index,
      routeHint: `/page-${index}`,
      label: null,
      at: `2025-01-15T10:0${index}:00.000Z`,
      url: `https://example.com/page-${index}`,
      snapshots: {
        run: {
          mode: "run",
          best: {
            frameKey: "fk::1::example::/::00000000",
            shadowCoverage: cov,
            normalized: { blockingCount: 0, summaryScore: 100 },
          },
        },
      },
      diffs: { consolidated: { added: 0, persisting: 0, fixed: 0, blockingAdded: 0, blockingFixed: 0 } },
      frameSelections: { usedFrameKeys: [] },
    };
  }

  it("includes per-step shadow coverage line", () => {
    const steps = [
      makeStep(1, { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false }),
    ];
    const md = ctx.buildSessionMarkdown(makeSession(steps));
    assert.ok(md.includes("Shadow coverage:"));
    assert.ok(md.includes("5/5 shadow scopes audited"));
  });

  it("includes capped note when step is capped", () => {
    const steps = [
      makeStep(1, { scopesFound: 100, scopesAudited: 50, scopesCapped: true, maxDepthObserved: 3, depthLimitReached: false }),
    ];
    const md = ctx.buildSessionMarkdown(makeSession(steps));
    assert.ok(md.includes("Coverage limited; diffs may be incomplete."));
  });

  it("includes depth limit note", () => {
    const steps = [
      makeStep(1, { scopesFound: 10, scopesAudited: 8, scopesCapped: false, maxDepthObserved: 5, depthLimitReached: true }),
    ];
    const md = ctx.buildSessionMarkdown(makeSession(steps));
    assert.ok(md.includes("Coverage limited; diffs may be incomplete."));
  });

  it("does not include coverage note when not capped or depth-limited", () => {
    const steps = [
      makeStep(1, { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false }),
    ];
    const md = ctx.buildSessionMarkdown(makeSession(steps));
    assert.ok(!md.includes("Coverage limited"));
  });

  it("no shadow line when step has no shadow roots", () => {
    const steps = [
      makeStep(1, { scopesFound: 0, scopesAudited: 0, scopesCapped: false, maxDepthObserved: 0, depthLimitReached: false }),
    ];
    const md = ctx.buildSessionMarkdown(makeSession(steps));
    assert.ok(!md.includes("Shadow coverage:"));
  });

  it("includes coverage-change warning banner when coverage differs between steps", () => {
    const steps = [
      makeStep(1, { scopesAudited: 3, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 8, scopesCapped: true, depthLimitReached: false }),
    ];
    const md = ctx.buildSessionMarkdown(makeSession(steps));
    assert.ok(md.includes("\u26A0 Shadow DOM coverage changed between snapshots"));
    assert.ok(md.includes("Diffs may be incomplete"));
    assert.ok(md.includes("Step 1 \u2192 Step 2:"));
  });

  it("no warning banner when coverage is stable between steps", () => {
    const cov = { scopesAudited: 5, scopesCapped: false, depthLimitReached: false };
    const steps = [makeStep(1, cov), makeStep(2, cov)];
    const md = ctx.buildSessionMarkdown(makeSession(steps));
    assert.ok(!md.includes("\u26A0 Shadow DOM coverage changed"));
  });

  it("warning banner includes from/to summary", () => {
    const steps = [
      makeStep(1, { scopesAudited: 3, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 8, scopesCapped: true, depthLimitReached: true }),
    ];
    const md = ctx.buildSessionMarkdown(makeSession(steps));
    assert.ok(md.includes("audited 3"));
    assert.ok(md.includes("\u2192 8"));
    assert.ok(md.includes("capped false"));
    assert.ok(md.includes("\u2192 true"));
  });

  it("is deterministic", () => {
    const steps = [
      makeStep(1, { scopesAudited: 3, scopesCapped: false, depthLimitReached: false }),
      makeStep(2, { scopesAudited: 8, scopesCapped: true, depthLimitReached: true }),
    ];
    const session = makeSession(steps);
    assert.equal(ctx.buildSessionMarkdown(session), ctx.buildSessionMarkdown(session));
  });
});
