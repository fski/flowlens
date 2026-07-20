/**
 * flowRecorder — local flow video via getDisplayMedia + MediaRecorder.
 * The gesture/permission-bound recording itself is manual-verify; here we test
 * the pure codec-selection (pickRecorderMime) and the initial state.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();

describe("pickRecorderMime", () => {
  it("prefers vp9, then vp8, then plain webm", () => {
    assert.equal(ctx.pickRecorderMime(() => true), "video/webm;codecs=vp9");
    assert.equal(ctx.pickRecorderMime(t => t === "video/webm;codecs=vp8" || t === "video/webm"), "video/webm;codecs=vp8");
    assert.equal(ctx.pickRecorderMime(t => t === "video/webm"), "video/webm");
  });

  it("returns empty string when nothing is supported (let the browser decide)", () => {
    assert.equal(ctx.pickRecorderMime(() => false), "");
  });
});

describe("flowRecorder initial state", () => {
  it("is not recording before start()", () => {
    assert.equal(ctx.flowRecorder.isRecording(), false);
  });
});
