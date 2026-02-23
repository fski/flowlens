/**
 * Shadow Coverage UI Logic — pure function tests
 * Tests formatShadowCoverage() and formatShadowCoverageWarning()
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createContext } from "./harness.mjs";

const ctx = createContext();

// ══════════════════════════════════════════════════════
// formatShadowCoverage
// ══════════════════════════════════════════════════════

describe("formatShadowCoverage", () => {

  it("returns empty for null input", () => {
    const r = ctx.formatShadowCoverage(null);
    assert.equal(r.text, "");
    assert.equal(r.badges.length, 0);
  });

  it("returns empty for undefined input", () => {
    const r = ctx.formatShadowCoverage(undefined);
    assert.equal(r.text, "");
    assert.equal(r.badges.length, 0);
  });

  it("returns empty for non-object input", () => {
    const r = ctx.formatShadowCoverage("string");
    assert.equal(r.text, "");
    assert.equal(r.badges.length, 0);
  });

  it("returns 'No shadow roots detected' when scopesFound is 0", () => {
    const r = ctx.formatShadowCoverage({
      scopesFound: 0, scopesAudited: 0,
      scopesCapped: false, maxDepthObserved: 0, depthLimitReached: false,
    });
    assert.equal(r.text, "No shadow roots detected");
    assert.equal(r.badges.length, 0);
  });

  it("shows audited/found counts and FULL badge when all scopes covered", () => {
    const r = ctx.formatShadowCoverage({
      scopesFound: 5, scopesAudited: 5,
      scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false,
    });
    assert.equal(r.text, "5/5 shadow scopes audited");
    assert.equal(r.badges.length, 1);
    assert.equal(r.badges[0].label, "FULL");
    assert.equal(r.badges[0].kind, "ok");
  });

  it("shows CAPPED badge when scopesCapped is true", () => {
    const r = ctx.formatShadowCoverage({
      scopesFound: 100, scopesAudited: 50,
      scopesCapped: true, maxDepthObserved: 3, depthLimitReached: false,
    });
    assert.equal(r.text, "50/100 shadow scopes audited");
    assert.equal(r.badges.length, 1);
    assert.equal(r.badges[0].label, "CAPPED");
    assert.equal(r.badges[0].kind, "warning");
  });

  it("shows DEPTH LIMIT badge when depthLimitReached is true", () => {
    const r = ctx.formatShadowCoverage({
      scopesFound: 10, scopesAudited: 8,
      scopesCapped: false, maxDepthObserved: 5, depthLimitReached: true,
    });
    assert.equal(r.text, "8/10 shadow scopes audited");
    assert.equal(r.badges.length, 1);
    assert.equal(r.badges[0].label, "DEPTH LIMIT");
    assert.equal(r.badges[0].kind, "warning");
  });

  it("shows both CAPPED and DEPTH LIMIT badges when both are true", () => {
    const r = ctx.formatShadowCoverage({
      scopesFound: 100, scopesAudited: 50,
      scopesCapped: true, maxDepthObserved: 5, depthLimitReached: true,
    });
    assert.equal(r.text, "50/100 shadow scopes audited");
    assert.equal(r.badges.length, 2);
    assert.equal(r.badges[0].label, "CAPPED");
    assert.equal(r.badges[1].label, "DEPTH LIMIT");
  });

  it("does not show FULL badge when depthLimitReached despite full count", () => {
    const r = ctx.formatShadowCoverage({
      scopesFound: 5, scopesAudited: 5,
      scopesCapped: false, maxDepthObserved: 4, depthLimitReached: true,
    });
    assert.equal(r.text, "5/5 shadow scopes audited");
    assert.equal(r.badges.length, 1);
    assert.equal(r.badges[0].label, "DEPTH LIMIT");
  });

  it("does not show FULL badge when capped despite full count", () => {
    const r = ctx.formatShadowCoverage({
      scopesFound: 5, scopesAudited: 5,
      scopesCapped: true, maxDepthObserved: 2, depthLimitReached: false,
    });
    assert.equal(r.text, "5/5 shadow scopes audited");
    assert.equal(r.badges.length, 1);
    assert.equal(r.badges[0].label, "CAPPED");
  });

  it("does not show FULL badge when audited < found", () => {
    const r = ctx.formatShadowCoverage({
      scopesFound: 10, scopesAudited: 8,
      scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false,
    });
    assert.equal(r.text, "8/10 shadow scopes audited");
    assert.equal(r.badges.length, 0);
  });

  it("handles missing fields gracefully (defaults to 0/false)", () => {
    const r = ctx.formatShadowCoverage({});
    assert.equal(r.text, "No shadow roots detected");
    assert.equal(r.badges.length, 0);
  });

  it("is deterministic — same input produces same output", () => {
    const input = {
      scopesFound: 12, scopesAudited: 10,
      scopesCapped: true, maxDepthObserved: 3, depthLimitReached: false,
    };
    const a = ctx.formatShadowCoverage(input);
    const b = ctx.formatShadowCoverage(input);
    assert.equal(a.text, b.text);
    assert.equal(a.badges.length, b.badges.length);
    for (let i = 0; i < a.badges.length; i++) {
      assert.equal(a.badges[i].label, b.badges[i].label);
      assert.equal(a.badges[i].kind, b.badges[i].kind);
    }
  });
});

// ══════════════════════════════════════════════════════
// formatShadowCoverageWarning
// ══════════════════════════════════════════════════════

describe("formatShadowCoverageWarning", () => {

  it("returns empty string for null input", () => {
    assert.equal(ctx.formatShadowCoverageWarning(null), "");
  });

  it("returns empty string for wrong type", () => {
    assert.equal(ctx.formatShadowCoverageWarning({ type: "OTHER" }), "");
  });

  it("returns generic message when from and to are identical", () => {
    const w = {
      type: "SHADOW_COVERAGE_CHANGED",
      from: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false },
      to: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false },
    };
    assert.equal(ctx.formatShadowCoverageWarning(w), "Shadow coverage changed between sessions");
  });

  it("reports scopes audited change", () => {
    const w = {
      type: "SHADOW_COVERAGE_CHANGED",
      from: { scopesAudited: 3, scopesCapped: false, depthLimitReached: false },
      to: { scopesAudited: 7, scopesCapped: false, depthLimitReached: false },
    };
    const msg = ctx.formatShadowCoverageWarning(w);
    assert.ok(msg.includes("scopes audited: 3"));
    assert.ok(msg.includes("\u2192 7"));
  });

  it("reports capped status change", () => {
    const w = {
      type: "SHADOW_COVERAGE_CHANGED",
      from: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false },
      to: { scopesAudited: 5, scopesCapped: true, depthLimitReached: false },
    };
    const msg = ctx.formatShadowCoverageWarning(w);
    assert.ok(msg.includes("capped: false"));
    assert.ok(msg.includes("\u2192 true"));
  });

  it("reports depth limit change", () => {
    const w = {
      type: "SHADOW_COVERAGE_CHANGED",
      from: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false },
      to: { scopesAudited: 5, scopesCapped: false, depthLimitReached: true },
    };
    const msg = ctx.formatShadowCoverageWarning(w);
    assert.ok(msg.includes("depth limit: false"));
    assert.ok(msg.includes("\u2192 true"));
  });

  it("reports multiple changes in single message", () => {
    const w = {
      type: "SHADOW_COVERAGE_CHANGED",
      from: { scopesAudited: 3, scopesCapped: false, depthLimitReached: false },
      to: { scopesAudited: 10, scopesCapped: true, depthLimitReached: true },
    };
    const msg = ctx.formatShadowCoverageWarning(w);
    assert.ok(msg.includes("scopes audited"));
    assert.ok(msg.includes("capped"));
    assert.ok(msg.includes("depth limit"));
  });

  it("handles missing from/to gracefully", () => {
    const w = { type: "SHADOW_COVERAGE_CHANGED" };
    const msg = ctx.formatShadowCoverageWarning(w);
    assert.equal(msg, "Shadow coverage changed between sessions");
  });

  it("is deterministic", () => {
    const w = {
      type: "SHADOW_COVERAGE_CHANGED",
      from: { scopesAudited: 2, scopesCapped: false, depthLimitReached: false },
      to: { scopesAudited: 8, scopesCapped: true, depthLimitReached: true },
    };
    assert.equal(ctx.formatShadowCoverageWarning(w), ctx.formatShadowCoverageWarning(w));
  });
});
