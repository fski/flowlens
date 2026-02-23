/**
 * Flow Profiles — tests for generic structural profile shape, vendor guard,
 * and integration with the existing profile infrastructure.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();

// ══════════════════════════════════════════════════════
// Version guard
// ══════════════════════════════════════════════════════

describe("FLOW_PROFILES_VERSION", () => {
  it("is >= 1", () => {
    assert.ok(ctx.__FLOW_PROFILES_VERSION >= 1);
  });
});

// ══════════════════════════════════════════════════════
// Profile registry shape
// ══════════════════════════════════════════════════════

describe("GENERIC_PROFILES shape", () => {
  const profiles = ctx.__GENERIC_PROFILES;
  const keys = Object.keys(profiles);

  it("has exactly 4 profiles", () => {
    assert.equal(keys.length, 4);
  });

  it("has expected profile keys", () => {
    assert.ok(keys.includes("generic-helpcenter-spa"));
    assert.ok(keys.includes("generic-chat-widget"));
    assert.ok(keys.includes("generic-ai-bot-tree"));
    assert.ok(keys.includes("hybrid-help-chat"));
  });

  it("each profile has required fields", () => {
    for (const [id, p] of Object.entries(profiles)) {
      assert.ok(typeof p.label === "string", `${id} missing label`);
      assert.ok(typeof p.description === "string", `${id} missing description`);
      assert.ok(typeof p.frame === "object", `${id} missing frame`);
      assert.ok(Array.isArray(p.frame.urlIncludes), `${id} missing frame.urlIncludes`);
      assert.ok(Array.isArray(p.frame.domSelectors), `${id} missing frame.domSelectors`);
      assert.ok(typeof p.modeHints === "object", `${id} missing modeHints`);
      assert.ok(typeof p.frameScope === "string", `${id} missing frameScope`);
    }
  });

  it("all urlIncludes arrays are empty (structural only)", () => {
    for (const [id, p] of Object.entries(profiles)) {
      assert.equal(p.frame.urlIncludes.length, 0, `${id} urlIncludes should be empty`);
    }
  });

  it("generic-helpcenter-spa has frameScope primary", () => {
    assert.equal(profiles["generic-helpcenter-spa"].frameScope, "primary");
  });

  it("generic-chat-widget has frameScope embedded", () => {
    assert.equal(profiles["generic-chat-widget"].frameScope, "embedded");
  });

  it("generic-ai-bot-tree has frameScope embedded", () => {
    assert.equal(profiles["generic-ai-bot-tree"].frameScope, "embedded");
  });

  it("hybrid-help-chat has frameScope primary", () => {
    assert.equal(profiles["hybrid-help-chat"].frameScope, "primary");
  });

  it("generic-chat-widget has chat modeHint", () => {
    assert.ok("chat" in profiles["generic-chat-widget"].modeHints);
  });

  it("generic-ai-bot-tree has chat and helpcenter-bot modeHints", () => {
    const hints = profiles["generic-ai-bot-tree"].modeHints;
    assert.ok("chat" in hints);
    assert.ok("helpcenter-bot" in hints);
  });

  it("hybrid-help-chat has helpcenter-tree and chat modeHints", () => {
    const hints = profiles["hybrid-help-chat"].modeHints;
    assert.ok("helpcenter-tree" in hints);
    assert.ok("chat" in hints);
  });

  it("modeHints entries have roles array", () => {
    for (const [id, p] of Object.entries(profiles)) {
      for (const [mode, hint] of Object.entries(p.modeHints)) {
        assert.ok(Array.isArray(hint.roles), `${id}.modeHints.${mode} missing roles array`);
      }
    }
  });
});

// ══════════════════════════════════════════════════════
// Vendor guard — no vendor-specific strings
// ══════════════════════════════════════════════════════

describe("GENERIC_PROFILES vendor guard", () => {
  const serialized = JSON.stringify(ctx.__GENERIC_PROFILES);
  const vendorStrings = ["GST_", "usehurrier", "zendesk", "intercom", "freshdesk"];

  for (const vendor of vendorStrings) {
    it(`does not contain "${vendor}"`, () => {
      assert.ok(!serialized.includes(vendor), `vendor string "${vendor}" found in GENERIC_PROFILES`);
    });
  }

  it("does not contain vendor URLs", () => {
    assert.ok(!serialized.includes("http://"), "no http:// URLs");
    assert.ok(!serialized.includes("https://"), "no https:// URLs");
  });
});

// ══════════════════════════════════════════════════════
// Key collision guard
// ══════════════════════════════════════════════════════

describe("GENERIC_PROFILES key collision guard", () => {
  it("generic profile keys do not collide with BUILTIN_PROFILES keys", () => {
    const builtinKeys = new Set(Object.keys(ctx.BUILTIN_PROFILES || {}));
    for (const key of Object.keys(ctx.__GENERIC_PROFILES)) {
      assert.ok(!builtinKeys.has(key), `generic key "${key}" collides with BUILTIN_PROFILES`);
    }
  });
});
