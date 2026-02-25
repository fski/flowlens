/**
 * Rule metadata validation — tests that RULE_TO_WCAG entries have valid
 * depthLevel, conversationalTag, and confidence metadata.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();
const RULE_TO_WCAG = ctx.__RULE_TO_WCAG;
const entries = Object.entries(RULE_TO_WCAG);

describe("rule metadata validation", () => {
  it("depth presence — every rule has a depthLevel property (1, 2, or 3)", () => {
    for (const [rule, mapping] of entries) {
      assert.ok(
        mapping.depthLevel === 1 || mapping.depthLevel === 2 || mapping.depthLevel === 3,
        `${rule} is missing depthLevel or has invalid value: ${mapping.depthLevel}`
      );
    }
  });

  it("depth distribution is reasonable — minimum counts for each level", () => {
    const depth1 = entries.filter(([, m]) => m.depthLevel === 1);
    const depth2 = entries.filter(([, m]) => m.depthLevel === 2);
    const depth3 = entries.filter(([, m]) => m.depthLevel === 3);

    assert.ok(depth1.length >= 10, `should have at least 10 depth 1 rules, got ${depth1.length}`);
    assert.ok(depth2.length >= 10, `should have at least 10 depth 2 rules, got ${depth2.length}`);
    assert.ok(depth3.length >= 5, `should have at least 5 depth 3 rules, got ${depth3.length}`);
    // No single level should dominate unreasonably
    assert.ok(depth1.length < entries.length * 0.8, "depth 1 should not be > 80% of all rules");
  });

  it("conversationalTag presence — CHAT_* rules have conversationalTag='chat'", () => {
    const chatRules = entries.filter(([rule]) => rule.startsWith("CHAT_"));
    assert.ok(chatRules.length > 0, "should have at least one CHAT_* rule");

    for (const [rule, mapping] of chatRules) {
      assert.equal(
        mapping.conversationalTag,
        "chat",
        `${rule} should have conversationalTag="chat", got "${mapping.conversationalTag}"`
      );
    }
  });

  it("conversationalTag presence — HC_* rules have conversationalTag='helpcenter'", () => {
    const hcRules = entries.filter(([rule]) => rule.startsWith("HC_"));
    assert.ok(hcRules.length > 0, "should have at least one HC_* rule");

    for (const [rule, mapping] of hcRules) {
      assert.equal(
        mapping.conversationalTag,
        "helpcenter",
        `${rule} should have conversationalTag="helpcenter", got "${mapping.conversationalTag}"`
      );
    }
  });

  it("confidence enum — all confidence values are null, 'strict', 'heuristic', or 'advisory'", () => {
    const validConfidence = new Set([null, "strict", "heuristic", "advisory"]);
    for (const [rule, mapping] of entries) {
      assert.ok(
        validConfidence.has(mapping.confidence),
        `${rule} has invalid confidence: ${JSON.stringify(mapping.confidence)}`
      );
    }
  });

  it("depthLevel enum — all depthLevel values are exactly 1, 2, or 3", () => {
    const validDepthLevels = new Set([1, 2, 3]);
    for (const [rule, mapping] of entries) {
      assert.ok(
        validDepthLevels.has(mapping.depthLevel),
        `${rule} has invalid depthLevel: ${JSON.stringify(mapping.depthLevel)}`
      );
    }
  });
});
