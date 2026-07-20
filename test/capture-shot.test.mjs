/**
 * Screenshot capture guard — shouldCaptureShot() decides whether a per-step
 * screenshot is worth attempting. Non-capturable schemes (chrome://, about:,
 * empty) return false so we don't fire a doomed captureVisibleTab.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

describe("shouldCaptureShot", () => {
  const ctx = createContext();

  it("true for http/https pages", () => {
    assert.equal(ctx.shouldCaptureShot({ url: "https://example.com/checkout" }), true);
    assert.equal(ctx.shouldCaptureShot({ url: "http://localhost:3000/" }), true);
  });

  it("false for non-capturable schemes and empty url", () => {
    assert.equal(ctx.shouldCaptureShot({ url: "chrome://extensions" }), false);
    assert.equal(ctx.shouldCaptureShot({ url: "about:blank" }), false);
    assert.equal(ctx.shouldCaptureShot({ url: "devtools://devtools/bundled/x.html" }), false);
    assert.equal(ctx.shouldCaptureShot({ url: "" }), false);
    assert.equal(ctx.shouldCaptureShot({}), false);
    assert.equal(ctx.shouldCaptureShot(null), false);
  });
});
