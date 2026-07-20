/**
 * classifyNavForCapture — decides whether a navigation event should trigger an
 * auto-captured step. Keeps auto-capture from firing on hash-only jumps or
 * self-navigation (which would produce duplicate/noise steps), while accepting
 * real path/query changes including SPA route changes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

describe("classifyNavForCapture", () => {
  const ctx = createContext();
  const f = ctx.classifyNavForCapture;

  it("accepts a path change", () => {
    assert.equal(f("https://x.com/step2", "https://x.com/step1"), true);
  });

  it("accepts a query change (SPA filters/wizard state)", () => {
    assert.equal(f("https://x.com/wizard?step=3", "https://x.com/wizard?step=2"), true);
  });

  it("accepts first navigation (no previous url)", () => {
    assert.equal(f("https://x.com/start", ""), true);
    assert.equal(f("https://x.com/start", null), true);
  });

  it("rejects identical url (self-nav / re-fire)", () => {
    assert.equal(f("https://x.com/a", "https://x.com/a"), false);
  });

  it("rejects hash-only change (in-page anchor)", () => {
    assert.equal(f("https://x.com/a#section2", "https://x.com/a#section1"), false);
    assert.equal(f("https://x.com/a#top", "https://x.com/a"), false);
  });

  it("rejects empty/invalid current url", () => {
    assert.equal(f("", "https://x.com/a"), false);
    assert.equal(f(null, "https://x.com/a"), false);
  });
});
