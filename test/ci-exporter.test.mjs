/**
 * CI JSON Contract v1 tests — validates buildCIReport + validateCIReport.
 * Tests contract structure, forbidden-field safety, determinism,
 * regression mapping, and edge cases.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();
const buildCIReport = ctx.__buildCIReport;
const validateCIReport = ctx.__validateCIReport;
const RULE_TO_WCAG = ctx.__RULE_TO_WCAG;

/** JSON round-trip to normalise cross-VM objects for deepStrictEqual. */
const norm = (o) => JSON.parse(JSON.stringify(o));

// ── Fixtures ─────────────────────────────────────────────────────────

function makeValidInput(overrides = {}) {
  return {
    tool: { name: "FlowLens", version: "5.0.0", hostId: "generic" },
    scope: { depthMax: 3, profileId: "chat_widget_v2", profileConfidence: "high", rulePackHash: null },
    quality: { signatureQuality: "available", diffConfidence: "normal" },
    summary: {
      blockingAdded: 2,
      blockingFixed: 1,
      blockingCurrent: 5,
      totalCount: 12,
      bySeverity: { high: 3, medium: 2, low: 4, info: 3 },
    },
    regressions: {
      blockingAdded: [
        { signature: "run|CHAT_FEED_MISSING_ROLE|1.3.1|medium|abc12345", ruleId: "CHAT_FEED_MISSING_ROLE", severity: "medium", depthLevel: 3, group: "depth3/semantics" },
        { signature: "run|IMG_MISSING_ALT|1.1.1|high|def67890", ruleId: "IMG_MISSING_ALT", severity: "high", depthLevel: 1 },
      ],
      blockingFixed: [
        { signature: "run|LINK_NO_ACCESSIBLE_NAME|2.4.4|high|ghi11111" },
      ],
    },
    depth3Aggregates: {
      announcementIntegrity: "ok",
      focusStability: "ok",
      chatSemantics: "degraded",
      multiFrameIntegrity: "ok",
      counts: { announcements: 0, focus: 0, semantics: 1, multiframe: 0 },
    },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════
// Contract structure tests
// ══════════════════════════════════════════════════════════════════════

describe("buildCIReport contract structure", () => {
  it("always includes contractVersion 1.0", () => {
    const report = buildCIReport({});
    assert.equal(report.contractVersion, "1.0");
  });

  it("has all required top-level keys", () => {
    const report = buildCIReport(makeValidInput());
    const keys = Object.keys(norm(report));
    for (const key of ["contractVersion", "tool", "scope", "quality", "summary", "regressions", "depth3Aggregates"]) {
      assert.ok(keys.includes(key), `missing key: ${key}`);
    }
  });

  it("tool has name, version, hostId", () => {
    const report = buildCIReport(makeValidInput());
    assert.equal(report.tool.name, "FlowLens");
    assert.equal(report.tool.version, "5.0.0");
    assert.equal(report.tool.hostId, "generic");
  });

  it("scope fields are correct", () => {
    const report = buildCIReport(makeValidInput());
    assert.equal(report.scope.depthMax, 3);
    assert.equal(report.scope.profileId, "chat_widget_v2");
    assert.equal(report.scope.profileConfidence, "high");
  });

  it("summary has blockingAdded, blockingFixed, blockingCurrent", () => {
    const report = buildCIReport(makeValidInput());
    assert.equal(report.summary.blockingAdded, 2);
    assert.equal(report.summary.blockingFixed, 1);
    assert.equal(report.summary.blockingCurrent, 5);
    assert.equal(report.summary.totalCount, 12);
  });

  it("summary.bySeverity has all 4 levels", () => {
    const report = buildCIReport(makeValidInput());
    const bySev = norm(report.summary.bySeverity);
    assert.deepStrictEqual(bySev, { high: 3, medium: 2, low: 4, info: 3 });
  });

  it("regressions.blockingAdded entries have only allowed scalar fields", () => {
    const report = buildCIReport(makeValidInput());
    const entries = norm(report.regressions.blockingAdded);
    assert.equal(entries.length, 2);
    for (const entry of entries) {
      const keys = Object.keys(entry);
      for (const key of keys) {
        assert.ok(
          ["signature", "ruleId", "severity", "depthLevel", "group"].includes(key),
          `unexpected key in regression entry: ${key}`,
        );
      }
      // All values must be scalar (string or number)
      for (const val of Object.values(entry)) {
        assert.ok(
          typeof val === "string" || typeof val === "number",
          `non-scalar value in regression entry: ${typeof val}`,
        );
      }
    }
  });

  it("regressions.blockingFixed entries have signature field", () => {
    const report = buildCIReport(makeValidInput());
    const entries = norm(report.regressions.blockingFixed);
    assert.equal(entries.length, 1);
    assert.ok(entries[0].signature);
  });

  it("depth3Aggregates is passed through", () => {
    const report = buildCIReport(makeValidInput());
    assert.equal(report.depth3Aggregates.chatSemantics, "degraded");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Forbidden-field safety (structural traversal)
// ══════════════════════════════════════════════════════════════════════

describe("validateCIReport structural safety", () => {
  it("returns valid for clean report", () => {
    const report = buildCIReport(makeValidInput());
    const result = validateCIReport(report);
    assert.equal(result.valid, true);
    assert.equal(result.violations.length, 0);
  });

  it("detects forbidden key: selector", () => {
    const report = buildCIReport(makeValidInput());
    report.regressions.blockingAdded[0].selector = "div.foo";
    const result = validateCIReport(report);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("selector")));
  });

  it("detects forbidden key: html", () => {
    const report = buildCIReport(makeValidInput());
    report.html = "<div>bad</div>";
    const result = validateCIReport(report);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("html")));
  });

  it("detects forbidden key: el", () => {
    const report = buildCIReport(makeValidInput());
    report.regressions.blockingAdded[0].el = "some element";
    const result = validateCIReport(report);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("el")));
  });

  it("detects forbidden key: cssPath", () => {
    const report = buildCIReport(makeValidInput());
    report.regressions.blockingAdded[0].cssPath = "body > div";
    const result = validateCIReport(report);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("cssPath")));
  });

  it("detects suspicious string value containing '<'", () => {
    const report = buildCIReport(makeValidInput());
    report.tool.name = "<script>alert(1)</script>";
    const result = validateCIReport(report);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("contains '<'")));
  });

  it("detects suspicious string value containing 'http'", () => {
    const report = buildCIReport(makeValidInput());
    report.tool.hostId = "https://example.com";
    const result = validateCIReport(report);
    assert.equal(result.valid, false);
    assert.ok(result.violations.some(v => v.includes("contains 'http'")));
  });

  it("allows legitimate fields like contractVersion, ruleId", () => {
    const report = buildCIReport(makeValidInput());
    const result = validateCIReport(report);
    assert.equal(result.valid, true);
  });

  it("buildCIReport output always passes validation (no DOM data)", () => {
    // Even with input containing forbidden data, the exporter sanitizes
    const badInput = makeValidInput({
      regressions: {
        blockingAdded: [
          {
            signature: "run|CHAT_FEED_MISSING_ROLE|1.3.1|medium|abc12345",
            ruleId: "CHAT_FEED_MISSING_ROLE",
            severity: "medium",
            depthLevel: 3,
            // These should NOT pass through:
            cssPath: "body > div.chat",
            el: "<div>element</div>",
            html: "<span>bad</span>",
          },
        ],
        blockingFixed: [],
      },
    });
    const report = buildCIReport(badInput);
    const result = validateCIReport(report);
    assert.equal(result.valid, true, `violations: ${result.violations.join("; ")}`);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Determinism tests
// ══════════════════════════════════════════════════════════════════════

describe("buildCIReport determinism", () => {
  it("same inputs produce identical JSON", () => {
    const input = makeValidInput();
    const r1 = buildCIReport(input);
    const r2 = buildCIReport(input);
    assert.deepStrictEqual(norm(r1), norm(r2));
  });

  it("serialized JSON is identical across runs", () => {
    const input = makeValidInput();
    const j1 = JSON.stringify(buildCIReport(input));
    const j2 = JSON.stringify(buildCIReport(input));
    assert.equal(j1, j2);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Regression mapping tests
// ══════════════════════════════════════════════════════════════════════

describe("buildCIReport regression mapping", () => {
  it("strips non-allowed fields from regression entries", () => {
    const input = makeValidInput({
      regressions: {
        blockingAdded: [
          {
            signature: "run|TEST|1.1.1|high|abc",
            ruleId: "TEST",
            severity: "high",
            depthLevel: 1,
            // forbidden extras:
            cssPath: "body > div",
            url: "https://bad.com",
            innerText: "some text",
            ariaLabel: "label text",
          },
        ],
        blockingFixed: [],
      },
    });
    const report = buildCIReport(input);
    const entry = norm(report.regressions.blockingAdded[0]);
    assert.deepStrictEqual(Object.keys(entry).sort(), ["depthLevel", "ruleId", "severity", "signature"]);
  });

  it("empty regressions produce empty arrays", () => {
    const input = makeValidInput({
      regressions: { blockingAdded: [], blockingFixed: [] },
    });
    const report = buildCIReport(input);
    assert.deepStrictEqual(norm(report.regressions.blockingAdded), []);
    assert.deepStrictEqual(norm(report.regressions.blockingFixed), []);
  });

  it("null regressions produce empty arrays", () => {
    const input = makeValidInput({ regressions: null });
    const report = buildCIReport(input);
    assert.deepStrictEqual(norm(report.regressions.blockingAdded), []);
    assert.deepStrictEqual(norm(report.regressions.blockingFixed), []);
  });

  it("includes optional group field when present", () => {
    const input = makeValidInput({
      regressions: {
        blockingAdded: [
          { signature: "run|CHAT_FEED_MISSING_ROLE|1.3.1|medium|abc", ruleId: "CHAT_FEED_MISSING_ROLE", severity: "medium", depthLevel: 3, group: "depth3/semantics" },
        ],
        blockingFixed: [],
      },
    });
    const report = buildCIReport(input);
    const entry = norm(report.regressions.blockingAdded[0]);
    assert.equal(entry.group, "depth3/semantics");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Edge cases
// ══════════════════════════════════════════════════════════════════════

describe("buildCIReport edge cases", () => {
  it("null input produces safe defaults", () => {
    const report = buildCIReport(null);
    assert.equal(report.contractVersion, "1.0");
    assert.equal(report.tool.name, "FlowLens");
    assert.equal(report.summary.totalCount, 0);
    assert.deepStrictEqual(norm(report.regressions.blockingAdded), []);
  });

  it("undefined input produces safe defaults", () => {
    const report = buildCIReport(undefined);
    assert.equal(report.contractVersion, "1.0");
  });

  it("empty input produces safe defaults", () => {
    const report = buildCIReport({});
    assert.equal(report.contractVersion, "1.0");
    assert.equal(report.tool.version, "unknown");
    assert.equal(report.scope.depthMax, 3);
    assert.equal(report.summary.blockingAdded, 0);
    assert.equal(report.summary.blockingFixed, 0);
    assert.equal(report.summary.blockingCurrent, 0);
  });

  it("empty bySeverity produces all zeros", () => {
    const report = buildCIReport({ summary: { bySeverity: {} } });
    assert.deepStrictEqual(norm(report.summary.bySeverity), { high: 0, medium: 0, low: 0, info: 0 });
  });

  it("depth3Aggregates null when not provided", () => {
    const report = buildCIReport({});
    assert.equal(report.depth3Aggregates, null);
  });

  it("invalid depthMax defaults to 3", () => {
    const report = buildCIReport({ scope: { depthMax: 99 } });
    assert.equal(report.scope.depthMax, 3);
  });

  it("non-array regression entries produce empty arrays", () => {
    const report = buildCIReport({
      regressions: { blockingAdded: "bad", blockingFixed: 123 },
    });
    assert.deepStrictEqual(norm(report.regressions.blockingAdded), []);
    assert.deepStrictEqual(norm(report.regressions.blockingFixed), []);
  });
});
