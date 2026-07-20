/**
 * Tests for export config summary (depthMax, recipeId, rulePack in diagnostics)
 * and machine-readable diff report (buildMachineReadableDiffReport).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();
const {
  buildDiagnosticsPayload,
  buildDiagnosticsMarkdown,
  buildMachineReadableDiffReport,
} = ctx;

// ══════════════════════════════════════════════════════
// Diagnostics payload — depthMax
// ══════════════════════════════════════════════════════

describe("buildDiagnosticsPayload — depthMax", () => {
  it("depthMax included in payload when explicitly set", () => {
    const payload = buildDiagnosticsPayload({ depthMax: 2 });
    assert.equal(payload.depthMax, 2);
  });

  it("depthMax defaults to 3 when not provided", () => {
    const payload = buildDiagnosticsPayload({});
    assert.equal(payload.depthMax, 3);
  });

  it("depthMax defaults to 3 for invalid values", () => {
    const payload = buildDiagnosticsPayload({ depthMax: 99 });
    assert.equal(payload.depthMax, 3);
  });
});

// ══════════════════════════════════════════════════════
// Diagnostics payload — recipeId
// ══════════════════════════════════════════════════════

describe("buildDiagnosticsPayload — recipeId", () => {
  it("recipeId included in payload when explicitly set", () => {
    const payload = buildDiagnosticsPayload({ recipeId: "chat_widget" });
    assert.equal(payload.recipeId, "chat_widget");
  });

  it("recipeId defaults to 'auto' when not provided", () => {
    const payload = buildDiagnosticsPayload({});
    assert.equal(payload.recipeId, "auto");
  });

  it("recipeId defaults to 'auto' when falsy", () => {
    const payload = buildDiagnosticsPayload({ recipeId: "" });
    assert.equal(payload.recipeId, "auto");
  });
});

// ══════════════════════════════════════════════════════
// Diagnostics payload — rulePack
// ══════════════════════════════════════════════════════

describe("buildDiagnosticsPayload — rulePack", () => {
  it("rulePack included with enabledCount when present", () => {
    const payload = buildDiagnosticsPayload({
      rulePack: { enabledRuleIds: ["A", "B"], disabledRuleIds: [] },
    });
    assert.ok(payload.rulePack, "rulePack should be present");
    assert.equal(payload.rulePack.enabledCount, 2);
    assert.equal(payload.rulePack.disabledCount, 0);
  });

  it("rulePack is null when not provided", () => {
    const payload = buildDiagnosticsPayload({});
    assert.equal(payload.rulePack, null);
  });

  it("rulePack is null when both lists are empty", () => {
    const payload = buildDiagnosticsPayload({
      rulePack: { enabledRuleIds: [], disabledRuleIds: [] },
    });
    assert.equal(payload.rulePack, null);
  });

  it("rulePack captures disabledCount", () => {
    const payload = buildDiagnosticsPayload({
      rulePack: { enabledRuleIds: ["A"], disabledRuleIds: ["X", "Y", "Z"] },
    });
    assert.equal(payload.rulePack.enabledCount, 1);
    assert.equal(payload.rulePack.disabledCount, 3);
  });
});

// ══════════════════════════════════════════════════════
// Diagnostics markdown — depth & recipe lines
// ══════════════════════════════════════════════════════

describe("buildDiagnosticsMarkdown — config summary lines", () => {
  it("markdown includes depth filter line", () => {
    const payload = buildDiagnosticsPayload({ depthMax: 2 });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes("Depth Filter: 2"), "should contain 'Depth Filter: 2'");
    assert.ok(md.includes("Balanced"), "depthMax 2 should show Balanced label");
  });

  it("markdown includes recipe line", () => {
    const payload = buildDiagnosticsPayload({ recipeId: "chat_widget" });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes("Recipe: chat_widget"), "should contain 'Recipe: chat_widget'");
  });

  it("markdown includes rule pack line when present", () => {
    const payload = buildDiagnosticsPayload({
      rulePack: { enabledRuleIds: ["A", "B", "C"], disabledRuleIds: ["X"] },
    });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes("Rule Pack:"), "should contain Rule Pack line");
    assert.ok(md.includes("enabled=3"), "should show enabled count");
    assert.ok(md.includes("disabled=1"), "should show disabled count");
  });

  it("markdown omits rule pack line when null", () => {
    const payload = buildDiagnosticsPayload({});
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(!md.includes("Rule Pack:"), "should not contain Rule Pack line");
  });

  it("depth filter label for depthMax 1 is Fast", () => {
    const payload = buildDiagnosticsPayload({ depthMax: 1 });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes("Depth Filter: 1"), "should contain 'Depth Filter: 1'");
    assert.ok(md.includes("Fast"), "depthMax 1 should show Fast label");
  });

  it("depth filter label for depthMax 3 is Full", () => {
    const payload = buildDiagnosticsPayload({ depthMax: 3 });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes("Depth Filter: 3"), "should contain 'Depth Filter: 3'");
    assert.ok(md.includes("Full"), "depthMax 3 should show Full label");
  });
});

// ══════════════════════════════════════════════════════
// Machine-readable diff report
// ══════════════════════════════════════════════════════

function makeStep(label, blockingSet, severityCounts, extras = {}) {
  return {
    label,
    stableSignatures: {
      run: {
        blockingSet,
        severityCounts: { high: 0, medium: 0, low: 0, info: 0, ...severityCounts },
        stepQuality: { degraded: false },
      },
    },
    profileSuspect: false,
    rootSelectorNotFound: false,
    ...extras,
  };
}

describe("buildMachineReadableDiffReport", () => {
  it("returns null for fewer than 2 steps", () => {
    const session = {
      id: "single-step",
      steps: [
        makeStep("baseline", ["sig1"], { high: 1 }),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report, null);
  });

  it("returns null for empty steps array", () => {
    const report = buildMachineReadableDiffReport({ id: "empty", steps: [] });
    assert.equal(report, null);
  });

  it("returns null for session with no steps property", () => {
    const report = buildMachineReadableDiffReport({ id: "no-steps" });
    assert.equal(report, null);
  });

  it("report has version 1 and confidence object", () => {
    const session = {
      id: "test-session",
      steps: [
        makeStep("baseline", ["sig1", "sig2"], { high: 2 }),
        makeStep("after-fix", ["sig1"], { high: 1 }),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.version, 1);
    assert.ok(report.confidence, "confidence object should exist");
    assert.equal(typeof report.confidence.reducedDiffConfidence, "boolean");
    assert.equal(typeof report.confidence.profileSuspect, "boolean");
    assert.equal(typeof report.confidence.rootSelectorNotFound, "boolean");
  });

  it("diffs array has correct length for 3-step session", () => {
    const session = {
      id: "three-step",
      steps: [
        makeStep("step-0", ["sig1", "sig2", "sig3"], { high: 3 }),
        makeStep("step-1", ["sig1", "sig2"], { high: 2 }),
        makeStep("step-2", ["sig1"], { high: 1 }),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.diffs.length, 2);
  });

  it("diffs contain blockingAdded and blockingFixed arrays", () => {
    const session = {
      id: "test-session",
      steps: [
        makeStep("baseline", ["sig1", "sig2"], { high: 2 }),
        makeStep("after-fix", ["sig1"], { high: 1 }),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    const diff = report.diffs[0];
    assert.ok(Array.isArray(diff.blockingAdded), "blockingAdded should be an array");
    assert.ok(Array.isArray(diff.blockingFixed), "blockingFixed should be an array");
    assert.equal(diff.blockingAdded.length, 0, "no new sigs were added");
    assert.equal(diff.blockingFixed.length, 1, "sig2 was fixed");
    assert.ok(diff.blockingFixed.includes("sig2"), "sig2 should be in blockingFixed");
  });

  it("blockingAdded captures newly introduced signatures", () => {
    const session = {
      id: "regression-session",
      steps: [
        makeStep("baseline", ["sig1"], { high: 1 }),
        makeStep("after-change", ["sig1", "sig2", "sig3"], { high: 3 }),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    const diff = report.diffs[0];
    assert.equal(diff.blockingAdded.length, 2);
    assert.ok(diff.blockingAdded.includes("sig2"));
    assert.ok(diff.blockingAdded.includes("sig3"));
    assert.equal(diff.blockingFixed.length, 0);
  });

  it("severity delta is computed correctly", () => {
    const session = {
      id: "severity-delta",
      steps: [
        makeStep("baseline", ["sig1", "sig2"], { high: 2, medium: 1, low: 3, info: 0 }),
        makeStep("after-fix", ["sig1"], { high: 1, medium: 0, low: 4, info: 2 }),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    const delta = report.diffs[0].countsBySeverity.delta;
    assert.equal(delta.high, -1);
    assert.equal(delta.medium, -1);
    assert.equal(delta.low, 1);
    assert.equal(delta.info, 2);
  });

  it("includes sessionId from session", () => {
    const session = {
      id: "my-session-42",
      steps: [
        makeStep("a", [], {}),
        makeStep("b", [], {}),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.sessionId, "my-session-42");
  });

  it("stepsCount reflects total number of steps", () => {
    const session = {
      id: "count-test",
      steps: [
        makeStep("a", [], {}),
        makeStep("b", [], {}),
        makeStep("c", [], {}),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.stepsCount, 3);
  });

  it("confidence.profileSuspect is true when any step has profileSuspect", () => {
    const session = {
      id: "suspect",
      steps: [
        makeStep("baseline", [], {}),
        // Suspect reduces confidence only when a profile was actually in play
        // (same predicate as the verdict header — the two copies diverged once).
        makeStep("after", [], {}, { profileSuspect: true, profileLabel: "Wizard" }),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.confidence.profileSuspect, true);
    assert.equal(report.confidence.reducedDiffConfidence, true);
  });

  it("bare profileSuspect without an applied profile does not reduce confidence", () => {
    const session = {
      id: "suspect-generic",
      steps: [
        makeStep("baseline", [], {}),
        makeStep("after", [], {}, { profileSuspect: true }),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.confidence.profileSuspect, true, "raw flag still reported");
    assert.equal(report.confidence.reducedDiffConfidence, false, "but confidence not reduced");
  });

  it("confidence.rootSelectorNotFound is true when any step has it", () => {
    const session = {
      id: "root-missing",
      steps: [
        makeStep("baseline", [], {}, { rootSelectorNotFound: true }),
        makeStep("after", [], {}),
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.confidence.rootSelectorNotFound, true);
  });

  it("diff labels fall back to step-N when label is missing", () => {
    const session = {
      id: "no-labels",
      steps: [
        { stableSignatures: { run: { blockingSet: [], severityCounts: {}, stepQuality: {} } }, profileSuspect: false, rootSelectorNotFound: false },
        { stableSignatures: { run: { blockingSet: [], severityCounts: {}, stepQuality: {} } }, profileSuspect: false, rootSelectorNotFound: false },
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.diffs[0].labels[0], "step-0");
    assert.equal(report.diffs[0].labels[1], "step-1");
  });

  it("degraded flag is set when stepQuality.degraded is true", () => {
    const session = {
      id: "degraded-test",
      steps: [
        makeStep("a", [], {}),
        {
          label: "b",
          stableSignatures: {
            run: {
              blockingSet: [],
              severityCounts: { high: 0, medium: 0, low: 0, info: 0 },
              stepQuality: { degraded: true },
            },
          },
          profileSuspect: false,
          rootSelectorNotFound: false,
        },
      ],
    };
    const report = buildMachineReadableDiffReport(session);
    assert.equal(report.diffs[0].degraded, true);
    assert.equal(report.confidence.reducedDiffConfidence, true);
  });
});

// ══════════════════════════════════════════════════════
// Recipe IDs roundtrip through diagnostics
// ══════════════════════════════════════════════════════

describe("recipe IDs in diagnostics payload", () => {
  it("known recipe IDs roundtrip correctly", () => {
    for (const rid of ["auto", "chat_widget", "helpcenter", "hybrid"]) {
      const payload = buildDiagnosticsPayload({ recipeId: rid });
      assert.equal(payload.recipeId, rid, `recipe '${rid}' should roundtrip`);
    }
  });

  it("unknown recipe IDs are preserved as-is", () => {
    const payload = buildDiagnosticsPayload({ recipeId: "custom_recipe" });
    assert.equal(payload.recipeId, "custom_recipe");
  });
});
