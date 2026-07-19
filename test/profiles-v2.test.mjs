/**
 * Profiles v2 tests — validates v2 shape, vendor-free targeting,
 * matching determinism, depth suggestion, and v1 backward compatibility.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();
const GENERIC_PROFILES = ctx.__GENERIC_PROFILES;
const buildDiagnosticsPayload = ctx.buildDiagnosticsPayload;
const buildDiagnosticsMarkdown = ctx.buildDiagnosticsMarkdown;

/** JSON round-trip to normalise cross-VM objects for deepStrictEqual. */
const norm = (o) => JSON.parse(JSON.stringify(o));

// ── v2 profile IDs ──
const V2_IDS = ["chat_widget_v2", "helpcenter_bot_hybrid_v2", "wizard_flow_v2", "helpcenter_static_v2"];
const V1_IDS = ["generic-helpcenter-spa", "generic-chat-widget", "generic-ai-bot-tree", "hybrid-help-chat"];

// ══════════════════════════════════════════════════════════════════════
// v2 shape validation
// ══════════════════════════════════════════════════════════════════════

describe("Profiles v2 shape", () => {
  it("v2 profiles have version: 2", () => {
    for (const id of V2_IDS) {
      assert.equal(GENERIC_PROFILES[id].version, 2, `${id} should have version 2`);
    }
  });

  it("v2 profiles have intent field", () => {
    for (const id of V2_IDS) {
      assert.ok(typeof GENERIC_PROFILES[id].intent === "string", `${id} missing intent`);
      assert.ok(GENERIC_PROFILES[id].intent.length > 0, `${id} intent is empty`);
    }
  });

  it("v2 profiles have recommended field with depthMax and enableDepth3", () => {
    for (const id of V2_IDS) {
      const rec = GENERIC_PROFILES[id].recommended;
      assert.ok(rec != null, `${id} missing recommended`);
      assert.ok(typeof rec.depthMax === "number", `${id} recommended.depthMax not a number`);
      assert.ok(rec.depthMax >= 1 && rec.depthMax <= 3, `${id} recommended.depthMax out of range`);
      assert.ok(typeof rec.enableDepth3 === "boolean", `${id} recommended.enableDepth3 not boolean`);
    }
  });

  it("v2 profiles have all required base fields", () => {
    for (const id of V2_IDS) {
      const p = GENERIC_PROFILES[id];
      assert.ok(typeof p.label === "string", `${id} missing label`);
      assert.ok(typeof p.description === "string", `${id} missing description`);
      assert.ok(typeof p.frame === "object", `${id} missing frame`);
      assert.ok(Array.isArray(p.frame.urlIncludes), `${id} missing frame.urlIncludes`);
      assert.ok(Array.isArray(p.frame.domSelectors), `${id} missing frame.domSelectors`);
      assert.ok(typeof p.modeHints === "object", `${id} missing modeHints`);
      assert.ok(typeof p.frameScope === "string", `${id} missing frameScope`);
    }
  });

  it("chat_widget_v2 has intent chat_widget and recommends depth 3", () => {
    const p = GENERIC_PROFILES["chat_widget_v2"];
    assert.equal(p.intent, "chat_widget");
    assert.equal(p.recommended.depthMax, 3);
    assert.equal(p.recommended.enableDepth3, true);
    assert.equal(p.frameScope, "embedded");
  });

  it("helpcenter_bot_hybrid_v2 has intent hybrid_portal and recommends depth 3", () => {
    const p = GENERIC_PROFILES["helpcenter_bot_hybrid_v2"];
    assert.equal(p.intent, "hybrid_portal");
    assert.equal(p.recommended.depthMax, 3);
    assert.equal(p.recommended.enableDepth3, true);
    assert.equal(p.frameScope, "primary");
  });

  it("helpcenter_static_v2 has intent helpcenter_bot and recommends depth 2", () => {
    const p = GENERIC_PROFILES["helpcenter_static_v2"];
    assert.equal(p.intent, "helpcenter_bot");
    assert.equal(p.recommended.depthMax, 2);
    assert.equal(p.recommended.enableDepth3, false);
    assert.equal(p.frameScope, "primary");
  });
});

// ══════════════════════════════════════════════════════════════════════
// v1 backward compatibility
// ══════════════════════════════════════════════════════════════════════

describe("v1 backward compatibility", () => {
  it("v1 profiles have no version field (version undefined = v1)", () => {
    for (const id of V1_IDS) {
      assert.equal(GENERIC_PROFILES[id].version, undefined, `${id} should not have version field`);
    }
  });

  it("v1 profiles still have all required fields", () => {
    for (const id of V1_IDS) {
      const p = GENERIC_PROFILES[id];
      assert.ok(typeof p.label === "string", `${id} missing label`);
      assert.ok(typeof p.description === "string", `${id} missing description`);
      assert.ok(typeof p.frame === "object", `${id} missing frame`);
      assert.ok(Array.isArray(p.frame.domSelectors), `${id} missing frame.domSelectors`);
      assert.ok(typeof p.modeHints === "object", `${id} missing modeHints`);
      assert.ok(typeof p.frameScope === "string", `${id} missing frameScope`);
    }
  });

  it("FLOW_PROFILES_VERSION is still 1 (no global bump)", () => {
    assert.equal(ctx.__FLOW_PROFILES_VERSION, 1);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Vendor-free targeting fields (targeting only, not label/description)
// ══════════════════════════════════════════════════════════════════════

describe("Vendor-free targeting fields", () => {
  const VENDOR_PATTERNS = [
    /zendesk/i, /intercom/i, /drift/i, /freshdesk/i,
    /salesforce/i, /hubspot/i, /livechat/i, /crisp/i,
    /tawk/i, /olark/i, /tidio/i,
  ];

  /**
   * Extracts all targeting field strings from a profile.
   * Targeting fields: frame.domSelectors, frame.urlIncludes,
   * modeHints.*.roles, modeHints.*.testIds, modeHints.*.url
   */
  function extractTargetingStrings(profile) {
    const strings = [];
    if (Array.isArray(profile.frame?.domSelectors)) {
      strings.push(...profile.frame.domSelectors);
    }
    if (Array.isArray(profile.frame?.urlIncludes)) {
      strings.push(...profile.frame.urlIncludes);
    }
    if (profile.modeHints && typeof profile.modeHints === "object") {
      for (const hints of Object.values(profile.modeHints)) {
        if (Array.isArray(hints?.roles)) strings.push(...hints.roles);
        if (Array.isArray(hints?.testIds)) strings.push(...hints.testIds);
        if (hints?.url != null) strings.push(String(hints.url));
      }
    }
    return strings;
  }

  for (const [id, profile] of Object.entries(GENERIC_PROFILES)) {
    it(`${id} targeting fields contain no vendor strings`, () => {
      const targetingStrings = extractTargetingStrings(profile);
      for (const str of targetingStrings) {
        for (const pattern of VENDOR_PATTERNS) {
          assert.ok(
            !pattern.test(str),
            `${id} targeting field contains vendor string: "${str}" matches ${pattern}`,
          );
        }
      }
    });
  }

  it("no profile has URL patterns in urlIncludes", () => {
    for (const [id, profile] of Object.entries(GENERIC_PROFILES)) {
      assert.deepStrictEqual(
        norm(profile.frame.urlIncludes),
        [],
        `${id} should have empty urlIncludes`,
      );
    }
  });
});

// ══════════════════════════════════════════════════════════════════════
// Matching determinism
// ══════════════════════════════════════════════════════════════════════

describe("Profile matching determinism", () => {
  it("computeProfileMatch returns same result on repeated calls", () => {
    const profile = GENERIC_PROFILES["chat_widget_v2"];
    const probe = { markerHits: { "[role='log']": true }, hasHelpRoot: false, frameId: 0 };
    const r1 = ctx.computeProfileMatch("chat_widget_v2", profile, probe, "");
    const r2 = ctx.computeProfileMatch("chat_widget_v2", profile, probe, "");
    assert.deepStrictEqual(norm(r1), norm(r2));
  });

  it("computeProfileMatch scores are stable for identical profiles (tie-break)", () => {
    // Two profiles with identical structure but different IDs produce same score
    const profileA = {
      label: "A", description: "A",
      frame: { urlIncludes: [], domSelectors: ["[role='log']"] },
      modeHints: {}, frameScope: "embedded",
    };
    const profileB = {
      label: "B", description: "B",
      frame: { urlIncludes: [], domSelectors: ["[role='log']"] },
      modeHints: {}, frameScope: "embedded",
    };
    const probe = { markerHits: { "[role='log']": true }, hasHelpRoot: false, frameId: 0 };
    const rA = ctx.computeProfileMatch("a-profile", profileA, probe, "");
    const rB = ctx.computeProfileMatch("b-profile", profileB, probe, "");
    assert.equal(rA.matchScore, rB.matchScore, "identical profiles should have same score");
    // With same score, alphabetical tie-break: "a-profile" < "b-profile"
    const candidates = [rB, rA];
    candidates.sort((a, b) => b.matchScore - a.matchScore || a.profileId.localeCompare(b.profileId));
    assert.equal(candidates[0].profileId, "a-profile");
  });
});

// ══════════════════════════════════════════════════════════════════════
// Depth suggestion tests
// ══════════════════════════════════════════════════════════════════════

describe("Depth suggestion in diagnostics", () => {
  it("profile recommends depthMax=3, currentDepth=2 => suggestion present", () => {
    const payload = buildDiagnosticsPayload({
      depthMax: 2,
      activeProfileId: "chat_widget_v2",
    });
    assert.ok(payload.depthSuggestion != null, "depthSuggestion should be present");
    assert.equal(payload.depthSuggestion.suggestedDepth, 3);
    assert.equal(payload.depthSuggestion.profileId, "chat_widget_v2");
    assert.equal(payload.depthSuggestion.reason, "profile_recommendation");
  });

  it("profile recommends depthMax=2, currentDepth=3 => suggestion null", () => {
    const payload = buildDiagnosticsPayload({
      depthMax: 3,
      activeProfileId: "helpcenter_static_v2",
    });
    assert.equal(payload.depthSuggestion, null);
  });

  it("profile recommends depthMax=2, currentDepth=2 => suggestion null (equal)", () => {
    const payload = buildDiagnosticsPayload({
      depthMax: 2,
      activeProfileId: "helpcenter_static_v2",
    });
    assert.equal(payload.depthSuggestion, null);
  });

  it("profile with no recommended field => suggestion null", () => {
    const payload = buildDiagnosticsPayload({
      depthMax: 2,
      activeProfileId: "generic-chat-widget",
    });
    assert.equal(payload.depthSuggestion, null);
  });

  it("no active profile => suggestion null", () => {
    const payload = buildDiagnosticsPayload({ depthMax: 2 });
    assert.equal(payload.depthSuggestion, null);
  });

  it("suggestion appears in markdown when present", () => {
    const payload = buildDiagnosticsPayload({
      depthMax: 2,
      activeProfileId: "chat_widget_v2",
    });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes("Depth suggestion: 3"), "markdown should contain depth suggestion");
    assert.ok(md.includes("chat_widget_v2"), "markdown should reference profile");
  });

  it("no suggestion line in markdown when null", () => {
    const payload = buildDiagnosticsPayload({
      depthMax: 3,
      activeProfileId: "helpcenter_static_v2",
    });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(!md.includes("Depth suggestion"), "markdown should not contain depth suggestion");
  });

  it("getActiveDepthMax not mutated by profile recommendation", () => {
    // Build payload with suggestion present — the depth should stay at what was set
    const payload = buildDiagnosticsPayload({
      depthMax: 2,
      activeProfileId: "chat_widget_v2",
    });
    // depthMax in payload should reflect what was passed, not the suggestion
    assert.equal(payload.depthMax, 2);
    assert.equal(payload.depthSuggestion.suggestedDepth, 3);
  });
});
