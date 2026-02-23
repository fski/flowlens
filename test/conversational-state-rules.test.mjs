/**
 * Conversational state-based rules — fixture tests for finding shape,
 * classification, and determinism of CHAT_NEW_MESSAGE_NOT_ANNOUNCED
 * and CHAT_INPUT_LOSES_FOCUS_ON_UPDATE.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();

// ══════════════════════════════════════════════════════
// CHAT_NEW_MESSAGE_NOT_ANNOUNCED — finding shape
// ══════════════════════════════════════════════════════

describe("CHAT_NEW_MESSAGE_NOT_ANNOUNCED finding shape", () => {
  const finding = {
    type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED",
    severity: "medium",
    wcag: "4.1.3",
    confidence: "heuristic",
    note: "Chat container received new messages but lacks announcement semantics (role=log, role=feed, or aria-live).",
  };

  it("has correct type", () => {
    assert.equal(finding.type, "CHAT_NEW_MESSAGE_NOT_ANNOUNCED");
  });

  it("has correct WCAG mapping", () => {
    assert.equal(finding.wcag, "4.1.3");
  });

  it("has heuristic confidence", () => {
    assert.equal(finding.confidence, "heuristic");
  });

  it("has medium severity", () => {
    assert.equal(finding.severity, "medium");
  });

  it("is classified as needs_review", () => {
    const status = ctx.classifyReviewStatus(finding);
    assert.equal(status, "needs_review");
  });

  it("has a RULE_TO_WCAG entry", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_NEW_MESSAGE_NOT_ANNOUNCED;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "4.1.3");
    assert.equal(m.level, "AA");
    assert.equal(m.confidence, "heuristic");
  });
});

// ══════════════════════════════════════════════════════
// CHAT_INPUT_LOSES_FOCUS_ON_UPDATE — finding shape
// ══════════════════════════════════════════════════════

describe("CHAT_INPUT_LOSES_FOCUS_ON_UPDATE finding shape", () => {
  const finding = {
    type: "CHAT_INPUT_LOSES_FOCUS_ON_UPDATE",
    severity: "medium",
    wcag: "2.4.3",
    confidence: "heuristic",
    note: "Chat input lost focus after a content update; may disrupt typing.",
  };

  it("has correct type", () => {
    assert.equal(finding.type, "CHAT_INPUT_LOSES_FOCUS_ON_UPDATE");
  });

  it("has correct WCAG mapping", () => {
    assert.equal(finding.wcag, "2.4.3");
  });

  it("has heuristic confidence", () => {
    assert.equal(finding.confidence, "heuristic");
  });

  it("has medium severity", () => {
    assert.equal(finding.severity, "medium");
  });

  it("is classified as needs_review", () => {
    const status = ctx.classifyReviewStatus(finding);
    assert.equal(status, "needs_review");
  });

  it("has a RULE_TO_WCAG entry", () => {
    const m = ctx.__RULE_TO_WCAG.CHAT_INPUT_LOSES_FOCUS_ON_UPDATE;
    assert.ok(m, "entry should exist");
    assert.equal(m.criterion, "2.4.3");
    assert.equal(m.level, "A");
    assert.equal(m.confidence, "heuristic");
  });
});

// ══════════════════════════════════════════════════════
// Determinism
// ══════════════════════════════════════════════════════

describe("state-based rules — determinism", () => {
  it("same fixtures produce identical classifications", () => {
    const fixtures = [
      { type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED", severity: "medium", wcag: "4.1.3", confidence: "heuristic" },
      { type: "CHAT_INPUT_LOSES_FOCUS_ON_UPDATE", severity: "medium", wcag: "2.4.3", confidence: "heuristic" },
    ];
    const a = fixtures.map(f => ctx.classifyReviewStatus(f));
    const b = fixtures.map(f => ctx.classifyReviewStatus(f));
    assert.equal(JSON.stringify(a), JSON.stringify(b));
  });

  it("both rules classified consistently as needs_review", () => {
    const fixtures = [
      { type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED", severity: "medium", wcag: "4.1.3", confidence: "heuristic" },
      { type: "CHAT_INPUT_LOSES_FOCUS_ON_UPDATE", severity: "medium", wcag: "2.4.3", confidence: "heuristic" },
    ];
    for (const f of fixtures) {
      assert.equal(ctx.classifyReviewStatus(f), "needs_review", `${f.type} should be needs_review`);
    }
  });
});
