/**
 * Recipe configuration — tests for RECIPES definitions, applyRecipe side-effects,
 * getActiveRecipeId tracking, and the "auto" no-override contract.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

// ══════════════════════════════════════════════════════
// RECIPES shape
// ══════════════════════════════════════════════════════

describe("RECIPES registry", () => {
  const ctx = createContext();
  const recipes = ctx.RECIPES;
  const keys = Object.keys(recipes);

  it("has exactly 4 entries", () => {
    assert.equal(keys.length, 4);
    assert.deepEqual(keys.sort(), ["auto", "chat_widget", "helpcenter", "hybrid"]);
  });

  it("auto recipe has all null overrides", () => {
    const auto = recipes.auto;
    assert.equal(auto.frameScope, null);
    assert.equal(auto.depthMax, null);
    assert.equal(auto.activeMode, null);
    assert.equal(auto.profileAllowlist, null);
  });

  it("every recipe has a label string", () => {
    for (const [id, r] of Object.entries(recipes)) {
      assert.equal(typeof r.label, "string", `${id} missing label`);
      assert.ok(r.label.length > 0, `${id} label is empty`);
    }
  });
});

// ══════════════════════════════════════════════════════
// applyRecipe side-effects
// ══════════════════════════════════════════════════════

describe("applyRecipe side-effects", () => {
  it("chat_widget sets frameScope to 'embedded'", () => {
    const ctx = createContext();
    ctx.applyRecipe("chat_widget");
    assert.equal(ctx.els.target.value, "embedded");
  });

  it("chat_widget sets depthMax to 2", () => {
    const ctx = createContext();
    ctx.applyRecipe("chat_widget");
    assert.equal(ctx.els.depthMax.value, "2");
  });

  it("chat_widget sets activeMode to 'observe'", () => {
    const ctx = createContext();
    ctx.applyRecipe("chat_widget");
    assert.equal(ctx.state.activeMode, "observe");
  });

  it("hybrid sets frameScope to 'all'", () => {
    const ctx = createContext();
    ctx.applyRecipe("hybrid");
    assert.equal(ctx.els.target.value, "all");
  });

  it("hybrid sets depthMax to 3", () => {
    const ctx = createContext();
    ctx.applyRecipe("hybrid");
    assert.equal(ctx.els.depthMax.value, "3");
  });

  it("helpcenter sets depthMax to 3", () => {
    const ctx = createContext();
    ctx.applyRecipe("helpcenter");
    assert.equal(ctx.els.depthMax.value, "3");
  });

  it("helpcenter sets frameScope to 'embedded'", () => {
    const ctx = createContext();
    ctx.applyRecipe("helpcenter");
    assert.equal(ctx.els.target.value, "embedded");
  });
});

// ══════════════════════════════════════════════════════
// auto recipe — no-override contract
// ══════════════════════════════════════════════════════

describe("applyRecipe('auto') no-override contract", () => {
  it("does not override current settings", () => {
    const ctx = createContext();
    // Pre-set values to simulate user configuration
    ctx.els.target.value = "embedded";
    ctx.els.depthMax.value = "2";
    ctx.state.activeMode = "observe";

    ctx.applyRecipe("auto");

    // auto recipe must NOT overwrite existing values
    assert.equal(ctx.els.target.value, "embedded", "frameScope should remain unchanged");
    assert.equal(ctx.els.depthMax.value, "2", "depthMax should remain unchanged");
    assert.equal(ctx.state.activeMode, "observe", "activeMode should remain unchanged");
  });
});

// ══════════════════════════════════════════════════════
// getActiveRecipeId tracking
// ══════════════════════════════════════════════════════

describe("getActiveRecipeId tracking", () => {
  it("returns 'auto' by default", () => {
    const ctx = createContext();
    assert.equal(ctx.getActiveRecipeId(), "auto");
  });

  it("returns current recipe after applyRecipe", () => {
    const ctx = createContext();
    ctx.applyRecipe("chat_widget");
    assert.equal(ctx.getActiveRecipeId(), "chat_widget");
  });

  it("tracks recipe changes across multiple applies", () => {
    const ctx = createContext();
    ctx.applyRecipe("helpcenter");
    assert.equal(ctx.getActiveRecipeId(), "helpcenter");

    ctx.applyRecipe("hybrid");
    assert.equal(ctx.getActiveRecipeId(), "hybrid");

    ctx.applyRecipe("auto");
    assert.equal(ctx.getActiveRecipeId(), "auto");
  });

  it("ignores unknown recipe id", () => {
    const ctx = createContext();
    ctx.applyRecipe("chat_widget");
    ctx.applyRecipe("nonexistent_recipe");
    // Should stay on last valid recipe
    assert.equal(ctx.getActiveRecipeId(), "chat_widget");
  });
});
