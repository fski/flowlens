/**
 * Legacy rule-id alias layer (signature-engine.js) — proves that sessions and
 * baselines persisted under the old chat-specific rule ids keep matching new
 * runs that emit the renamed generic stateful-widget ids.
 *
 * Renames covered (old → new):
 *   CHAT_NEW_MESSAGE_NOT_ANNOUNCED   → LIVE_CONTENT_NOT_ANNOUNCED
 *   CHAT_INPUT_LOSES_FOCUS_ON_UPDATE → INPUT_LOSES_FOCUS_ON_UPDATE
 *   CHAT_FEED_MISSING_ROLE           → LIVE_REGION_MISSING_ROLE
 *   CHAT_MESSAGE_NOT_ITEMIZED        → LIVE_ITEM_NOT_ITEMIZED
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { createContext } from "./harness.mjs";

const ctx = createContext();

const FK = "fk::https://example.com::prod::root";

const RENAMES = {
  CHAT_NEW_MESSAGE_NOT_ANNOUNCED: "LIVE_CONTENT_NOT_ANNOUNCED",
  CHAT_INPUT_LOSES_FOCUS_ON_UPDATE: "INPUT_LOSES_FOCUS_ON_UPDATE",
  CHAT_FEED_MISSING_ROLE: "LIVE_REGION_MISSING_ROLE",
  CHAT_MESSAGE_NOT_ITEMIZED: "LIVE_ITEM_NOT_ITEMIZED",
};

/** A finding as an old session would have persisted it (legacy id). */
function legacyFinding(type, overrides = {}) {
  return {
    type,
    severity: "medium",
    wcag: "4.1.3",
    confidence: "heuristic",
    path: "div.app > div.feed",
    role: "log",
    tag: "DIV",
    testId: "feed",
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════
// canonicalizeRuleType
// ══════════════════════════════════════════════════════

describe("canonicalizeRuleType", () => {
  it("maps every legacy id to its canonical id", () => {
    for (const [oldId, newId] of Object.entries(RENAMES)) {
      assert.equal(ctx.canonicalizeRuleType(oldId), newId);
    }
  });

  it("is case-aware: lowercase in → lowercase out (signature tokens)", () => {
    for (const [oldId, newId] of Object.entries(RENAMES)) {
      assert.equal(ctx.canonicalizeRuleType(oldId.toLowerCase()), newId.toLowerCase());
    }
  });

  it("returns non-legacy ids unchanged", () => {
    assert.equal(ctx.canonicalizeRuleType("IMG_MISSING_ALT"), "IMG_MISSING_ALT");
    assert.equal(ctx.canonicalizeRuleType("LIVE_CONTENT_NOT_ANNOUNCED"), "LIVE_CONTENT_NOT_ANNOUNCED");
    assert.equal(ctx.canonicalizeRuleType(""), "");
    assert.equal(ctx.canonicalizeRuleType(null), "");
  });

  it("is idempotent", () => {
    for (const oldId of Object.keys(RENAMES)) {
      const once = ctx.canonicalizeRuleType(oldId);
      assert.equal(ctx.canonicalizeRuleType(once), once);
    }
  });

  it("LEGACY_RULE_ALIASES stays in sync with RULE_TO_WCAG deprecated entries", () => {
    for (const [oldId, newId] of Object.entries(RENAMES)) {
      const legacy = ctx.__RULE_TO_WCAG[oldId];
      assert.ok(legacy, `${oldId} missing from RULE_TO_WCAG`);
      assert.equal(legacy.deprecated, true, `${oldId} should be deprecated`);
      assert.equal(legacy.replacedBy, newId, `${oldId} replacedBy mismatch`);
      assert.ok(ctx.__RULE_TO_WCAG[newId], `${newId} missing from RULE_TO_WCAG`);
    }
  });
});

// ══════════════════════════════════════════════════════
// buildStableSignature — canonical over old AND new ids
// ══════════════════════════════════════════════════════

describe("buildStableSignature canonicalizes legacy rule ids", () => {
  it("legacy-id finding hashes identically to the renamed-id finding", () => {
    for (const [oldId, newId] of Object.entries(RENAMES)) {
      const oldSig = ctx.buildStableSignature(legacyFinding(oldId), FK, "run");
      const newSig = ctx.buildStableSignature(legacyFinding(newId), FK, "run");
      assert.equal(oldSig, newSig, `${oldId} signature should equal ${newId} signature`);
      assert.ok(oldSig.includes(newId.toLowerCase()), "signature should embed the canonical id");
      assert.ok(!oldSig.includes(oldId.toLowerCase()), "signature must not embed the legacy id");
    }
  });

  it("locator differences still produce distinct signatures", () => {
    const a = ctx.buildStableSignature(legacyFinding("CHAT_FEED_MISSING_ROLE", { path: "div.a" , testId: null }), FK, "run");
    const b = ctx.buildStableSignature(legacyFinding("CHAT_FEED_MISSING_ROLE", { path: "main.b > section.c", testId: null }), FK, "run");
    assert.notEqual(a, b);
  });
});

// ══════════════════════════════════════════════════════
// canonicalizeStableSignature — stored signature strings
// ══════════════════════════════════════════════════════

describe("canonicalizeStableSignature", () => {
  it("rewrites the legacy type token in a stored 5-part signature", () => {
    const stored = "run|chat_feed_missing_role|1.3.1|medium|abc12345";
    assert.equal(
      ctx.canonicalizeStableSignature(stored),
      "run|live_region_missing_role|1.3.1|medium|abc12345"
    );
  });

  it("leaves canonical and unknown signatures unchanged", () => {
    const canonical = "run|live_region_missing_role|1.3.1|medium|abc12345";
    assert.equal(ctx.canonicalizeStableSignature(canonical), canonical);
    const other = "run|img_missing_alt|1.1.1|high|deadbeef";
    assert.equal(ctx.canonicalizeStableSignature(other), other);
  });

  it("leaves 4-part non-finding signatures (contrast/tabwalk/watch) unchanged", () => {
    const contrast = "contrast|1.4.3|high|12345678";
    assert.equal(ctx.canonicalizeStableSignature(contrast), contrast);
  });
});

// ══════════════════════════════════════════════════════
// computeStableDiff — old stored step vs new run
// ══════════════════════════════════════════════════════

describe("computeStableDiff across the rename boundary", () => {
  it("old-session signature set matches the same finding from a new run (persisting, not added/fixed)", () => {
    for (const [oldId, newId] of Object.entries(RENAMES)) {
      // Signatures exactly as an old session would have stored them...
      const prevStored = [ctx.buildStableSignature(legacyFinding(oldId), FK, "run")
        .replace(newId.toLowerCase(), oldId.toLowerCase())];
      assert.ok(prevStored[0].includes(oldId.toLowerCase()), "fixture must carry the legacy token");
      // ...and the same finding emitted by a new run under the renamed id.
      const curr = [ctx.buildStableSignature(legacyFinding(newId), FK, "run")];

      const diff = ctx.computeStableDiff(prevStored, curr);
      assert.equal(diff.persisting, 1, `${oldId}→${newId} should persist across rename`);
      assert.equal(diff.added, 0, `${newId} must not be reported as new`);
      assert.equal(diff.fixed, 0, `${oldId} must not be reported as fixed`);
    }
  });
});

// ══════════════════════════════════════════════════════
// compareAgainstBaseline — old baseline file vs new run
// ══════════════════════════════════════════════════════

describe("compareAgainstBaseline across the rename boundary", () => {
  it("an old-signature baseline matches a new-run finding of the renamed rule", () => {
    for (const [oldId, newId] of Object.entries(RENAMES)) {
      // Baseline exactly as exported by an old FlowLens version (legacy id + legacy signature).
      const legacySignature = ctx.buildStableSignature(legacyFinding(newId), FK, "run")
        .replace(newId.toLowerCase(), oldId.toLowerCase());
      const oldBaseline = {
        schemaVersion: 1,
        createdAt: "2025-12-01T00:00:00.000Z",
        origin: "https://example.com",
        issues: [{
          code: oldId,
          type: "medium",
          message: "Feed",
          context: null,
          selector: "div.app > div.feed",
          signature: legacySignature,
        }],
      };
      assert.equal(ctx.validateBaselinePayload(oldBaseline).ok, true);

      // New run emits the renamed rule for the same element.
      const currentFindings = [legacyFinding(newId)];
      const result = ctx.compareAgainstBaseline(oldBaseline, currentFindings, FK, "run");

      assert.equal(result.matchedCount, 1, `${oldId} baseline should match ${newId} finding`);
      assert.equal(result.newIssues.length, 0, `${newId} must not be flagged as a new issue`);
      assert.equal(result.resolvedIssues.length, 0, `${oldId} must not be flagged as resolved`);
    }
  });

  it("a genuinely fixed legacy issue is still reported as resolved", () => {
    const legacySignature = ctx
      .buildStableSignature(legacyFinding("LIVE_REGION_MISSING_ROLE"), FK, "run")
      .replace("live_region_missing_role", "chat_feed_missing_role");
    const oldBaseline = { schemaVersion: 1, issues: [{ signature: legacySignature }] };
    const result = ctx.compareAgainstBaseline(oldBaseline, [], FK, "run");
    assert.equal(result.matchedCount, 0);
    assert.equal(result.resolvedIssues.length, 1);
  });
});

// ══════════════════════════════════════════════════════
// buildStepDiffs — old stored step (stableSignatures) vs new step
// ══════════════════════════════════════════════════════

describe("buildStepDiffs stable path across the rename boundary", () => {
  it("old step stored with legacy-id signatures diffs cleanly against a new step", () => {
    const finding = legacyFinding("LIVE_CONTENT_NOT_ANNOUNCED");
    const newSig = ctx.buildStableSignature(finding, FK, "run");
    const oldSig = newSig.replace("live_content_not_announced", "chat_new_message_not_announced");
    assert.notEqual(newSig, oldSig);

    const mkStep = (sig) => ({
      snapshots: { run: { mode: "run" } },
      stableSignatures: {
        run: {
          stableFindingSignatureSet: [sig],
          blockingSet: [sig],
          severityCounts: { high: 0, medium: 1, low: 0, info: 0 },
        },
      },
    });

    const diffs = ctx.buildStepDiffs(mkStep(newSig), mkStep(oldSig), null);
    assert.equal(diffs.run.persisting, 1);
    assert.equal(diffs.run.added, 0);
    assert.equal(diffs.run.fixed, 0);
    assert.equal(diffs.run.blockingAdded, 0);
    assert.equal(diffs.run.blockingFixed, 0);
    assert.equal(diffs.consolidated.persisting, 1);
    assert.equal(diffs.consolidated.added, 0);
    assert.equal(diffs.consolidated.fixed, 0);
  });
});
