/**
 * UI stability tests — batching, normalization, toast dedup, perf counters.
 * Covers Tracks F1–F5 from the UI/UX bughunt spec.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

// ══════════════════════════════════════════════════════════════════════
// F3 — normalizeFindingForRender
// ══════════════════════════════════════════════════════════════════════

describe("normalizeFindingForRender", () => {
  const ctx = createContext();

  it("passes through valid finding unchanged (same object ref)", () => {
    const f = { type: "MISSING_ALT", severity: "high", name: "No alt" };
    const result = ctx.normalizeFindingForRender(f);
    assert.equal(result.type, "MISSING_ALT");
    assert.equal(result.severity, "high");
    assert.equal(result, f);
  });

  it("falls back to UNKNOWN_RULE when type is missing", () => {
    const result = ctx.normalizeFindingForRender({ severity: "high", name: "Bad" });
    assert.equal(result.type, "UNKNOWN_RULE");
  });

  it("falls back to UNKNOWN_RULE when type is not a string", () => {
    const result = ctx.normalizeFindingForRender({ type: 123, severity: "high" });
    assert.equal(result.type, "UNKNOWN_RULE");
  });

  it("falls back to info when severity is missing", () => {
    const result = ctx.normalizeFindingForRender({ type: "MISSING_ALT" });
    assert.equal(result.severity, "info");
  });

  it("falls back to info for unrecognized severity", () => {
    const result = ctx.normalizeFindingForRender({ type: "MISSING_ALT", severity: "extreme" });
    assert.equal(result.severity, "info");
  });

  it("normalizes severity to lowercase", () => {
    const result = ctx.normalizeFindingForRender({ type: "MISSING_ALT", severity: "HIGH" });
    assert.equal(result.severity, "high");
  });

  it("handles null input", () => {
    const result = ctx.normalizeFindingForRender(null);
    assert.equal(result.type, "UNKNOWN_RULE");
    assert.equal(result.severity, "info");
  });

  it("handles undefined input", () => {
    const result = ctx.normalizeFindingForRender(undefined);
    assert.equal(result.type, "UNKNOWN_RULE");
    assert.equal(result.severity, "info");
  });

  it("preserves all valid severity values", () => {
    for (const sev of ["critical", "high", "medium", "low", "info"]) {
      const result = ctx.normalizeFindingForRender({ type: "X", severity: sev });
      assert.equal(result.severity, sev, `severity ${sev} should be preserved`);
    }
  });

  it("preserves other fields on the finding", () => {
    const f = { type: "MISSING_ALT", severity: "high", name: "No alt", wcag: "1.1.1", path: "/img" };
    const result = ctx.normalizeFindingForRender(f);
    assert.equal(result.name, "No alt");
    assert.equal(result.wcag, "1.1.1");
    assert.equal(result.path, "/img");
  });

  it("does not mutate the original finding when normalizing", () => {
    const f = { type: 42, severity: "EXTREME", name: "Weird" };
    const result = ctx.normalizeFindingForRender(f);
    assert.equal(f.type, 42, "original type should be unchanged");
    assert.equal(f.severity, "EXTREME", "original severity should be unchanged");
    assert.notEqual(result, f, "should return a new object");
  });

  it("handles finding with empty string type", () => {
    const result = ctx.normalizeFindingForRender({ type: "", severity: "high" });
    assert.equal(result.type, "");
  });
});

// ══════════════════════════════════════════════════════════════════════
// F1 — Perf counters
// ══════════════════════════════════════════════════════════════════════

describe("Perf counters (__flPerf)", () => {
  it("__flPerf exists on context with expected shape", () => {
    const ctx = createContext();
    assert.ok(ctx.__flPerf != null, "__flPerf should exist");
    assert.equal(typeof ctx.__flPerf.rerenderFindingsCount, "number");
    assert.equal(typeof ctx.__flPerf.rerenderFindingsMsTotal, "number");
    assert.equal(typeof ctx.__flPerf.lastRerenderFindingsMs, "number");
    assert.equal(typeof ctx.__flPerf.lastRenderedRows, "number");
    assert.equal(typeof ctx.__flPerf.scheduledRerenderCount, "number");
  });

  it("perf counters start at zero", () => {
    const ctx = createContext();
    assert.equal(ctx.__flPerf.rerenderFindingsCount, 0);
    assert.equal(ctx.__flPerf.rerenderFindingsMsTotal, 0);
    assert.equal(ctx.__flPerf.lastRerenderFindingsMs, 0);
    assert.equal(ctx.__flPerf.lastRenderedRows, 0);
    assert.equal(ctx.__flPerf.scheduledRerenderCount, 0);
    assert.equal(ctx.__flPerf.lastFilterReason, null);
  });

  it("rerenderFindings function is available", () => {
    const ctx = createContext();
    assert.equal(typeof ctx.rerenderFindings, "function");
  });

  it("scheduleRerenderFindings function is available", () => {
    const ctx = createContext();
    assert.equal(typeof ctx.scheduleRerenderFindings, "function");
  });
});

// ══════════════════════════════════════════════════════════════════════
// F2 — Rerender batching
// ══════════════════════════════════════════════════════════════════════

describe("Rerender batching (scheduleRerenderFindings)", () => {
  it("scheduleRerenderFindings increments scheduledRerenderCount", () => {
    const ctx = createContext();
    const before = ctx.__flPerf.scheduledRerenderCount;
    try { ctx.scheduleRerenderFindings("test"); } catch (e) { /* renderExplorer may fail */ }
    assert.ok(ctx.__flPerf.scheduledRerenderCount > before, "scheduledRerenderCount should increase");
  });

  it("_rerenderScheduled flag resets after execution", () => {
    const ctx = createContext();
    try { ctx.scheduleRerenderFindings("test"); } catch (e) { /* ok */ }
    assert.equal(ctx._rerenderScheduled, false, "flag should reset after microtask runs");
  });

  it("_rerenderReason is cleared after execution", () => {
    const ctx = createContext();
    try { ctx.scheduleRerenderFindings("depth_filter"); } catch (e) { /* ok */ }
    assert.equal(ctx._rerenderReason, null, "reason should be cleared after execution");
  });

  it("multiple schedule calls track all in scheduledRerenderCount", () => {
    const ctx = createContext();
    const before = ctx.__flPerf.scheduledRerenderCount;
    try { ctx.scheduleRerenderFindings("a"); } catch (e) { /* ok */ }
    try { ctx.scheduleRerenderFindings("b"); } catch (e) { /* ok */ }
    try { ctx.scheduleRerenderFindings("c"); } catch (e) { /* ok */ }
    assert.equal(ctx.__flPerf.scheduledRerenderCount, before + 3);
  });
});

// ══════════════════════════════════════════════════════════════════════
// F5 — Toast dedup
// ══════════════════════════════════════════════════════════════════════

describe("Toast dedup", () => {
  it("toast function exists", () => {
    const ctx = createContext();
    assert.equal(typeof ctx.toast, "function");
  });

  it("first toast call sets _lastToastKey", () => {
    const ctx = createContext();
    ctx._lastToastKey = null;
    ctx._lastToastTime = 0;
    ctx.toast("Hello world");
    assert.equal(ctx._lastToastKey, "Hello world");
  });

  it("_lastToastTime is updated after toast", () => {
    const ctx = createContext();
    ctx._lastToastKey = null;
    ctx._lastToastTime = 0;
    ctx.toast("Test");
    assert.ok(ctx._lastToastTime > 0, "lastToastTime should be updated");
  });

  it("identical toast within 700ms is suppressed (key unchanged)", () => {
    const ctx = createContext();
    ctx._lastToastKey = "Same message";
    ctx._lastToastTime = (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();
    ctx.toast("Same message");
    assert.equal(ctx._lastToastKey, "Same message", "key should not change on dedup");
  });

  it("different toast message updates key", () => {
    const ctx = createContext();
    ctx._lastToastKey = "Message A";
    ctx._lastToastTime = (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();
    ctx.toast("Message B");
    assert.equal(ctx._lastToastKey, "Message B", "key should update for different message");
  });

  it("_lastToastKey and _lastToastTime are vars on context", () => {
    const ctx = createContext();
    assert.ok("_lastToastKey" in ctx, "_lastToastKey should be on context");
    assert.ok("_lastToastTime" in ctx, "_lastToastTime should be on context");
  });

  it("toast with action gets prefixed key", () => {
    const ctx = createContext();
    ctx._lastToastKey = null;
    ctx._lastToastTime = 0;
    ctx.toast("Retry?", { label: "Retry", fn: function() {} });
    assert.equal(ctx._lastToastKey, "action:Retry?");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Integration: normalization in render pipeline
// ══════════════════════════════════════════════════════════════════════

describe("Normalization in render pipeline", () => {
  it("normalization handles array of mixed findings", () => {
    const ctx = createContext();
    const findings = [
      { type: "MISSING_ALT", severity: "high", name: "OK" },
      { severity: "high", name: "Missing type" },
      { type: "MISSING_ALT", name: "Missing severity" },
      null,
    ];
    const normalized = findings.map(ctx.normalizeFindingForRender);
    assert.equal(normalized.length, 4);
    assert.equal(normalized[0].type, "MISSING_ALT");
    assert.equal(normalized[0].severity, "high");
    assert.equal(normalized[1].type, "UNKNOWN_RULE");
    assert.equal(normalized[1].severity, "high");
    assert.equal(normalized[2].type, "MISSING_ALT");
    assert.equal(normalized[2].severity, "info");
    assert.equal(normalized[3].type, "UNKNOWN_RULE");
    assert.equal(normalized[3].severity, "info");
  });

  it("explorerRowHtml renders normalized finding without crash", () => {
    const ctx = createContext();
    const bad = { severity: "EXTREME", name: "Bad" };
    const normalized = ctx.normalizeFindingForRender(bad);
    const html = ctx.explorerRowHtml(normalized, 0);
    assert.ok(html.includes("info"), "normalized severity should appear in row");
    assert.ok(!html.includes("undefined"), "should not contain undefined");
  });

  it("explorerRowHtml handles UNKNOWN_RULE type", () => {
    const ctx = createContext();
    const f = ctx.normalizeFindingForRender({ name: "Mystery" });
    const html = ctx.explorerRowHtml(f, 0);
    assert.ok(html.includes("UNKNOWN_RULE"), "should render UNKNOWN_RULE type");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Integration: group filter + normalization
// ══════════════════════════════════════════════════════════════════════

describe("Group filter + normalization integration", () => {
  const ctx = createContext();

  it("filterFindingsByGroup then normalize produces consistent results", () => {
    const findings = [
      { type: "LIVE_REGION_MISSING_ROLE", severity: "high", name: "A" },
      { type: "MISSING_ALT", severity: "low", name: "B" },
      { type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE", severity: "high", name: "C" },
    ];
    const filtered = ctx.filterFindingsByGroup(findings, "depth3/semantics");
    const normalized = filtered.map(ctx.normalizeFindingForRender);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].type, "LIVE_REGION_MISSING_ROLE");
  });

  it("normalization before group filter does not break filtering", () => {
    const findings = [
      { type: "LIVE_REGION_MISSING_ROLE", severity: "HIGH", name: "A" },
      { type: "MISSING_ALT", severity: "low", name: "B" },
    ];
    const normalized = findings.map(ctx.normalizeFindingForRender);
    const filtered = ctx.filterFindingsByGroup(normalized, "depth3/semantics");
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].severity, "high");
  });
});
