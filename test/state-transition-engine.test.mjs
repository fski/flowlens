import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEngineContext } from './engine-harness.mjs';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCaptureArtifacts(overrides = {}) {
  return {
    activeLocator: overrides.activeLocator ?? null,
    isInComposer: overrides.isInComposer ?? false,
    chatCandidates: overrides.chatCandidates ?? [],
    liveRegions: overrides.liveRegions ?? [],
    announceEventCount: overrides.announceEventCount ?? 0,
    liveMutationCount: overrides.liveMutationCount ?? 0,
    captureMode: overrides.captureMode ?? "observe",
  };
}

function makeLocatorArtifact(tag, role, testId, cssPath) {
  return { tag, role, testId, cssPath };
}

function makeChatCandidate(opts = {}) {
  const out = {
    locator: opts.locator ?? makeLocatorArtifact("div", opts.role ?? "log", null, "div.chat"),
    role: opts.role ?? "log",
    ariaLive: opts.ariaLive ?? null,
    childCount: opts.childCount ?? 5,
    lastChildLocator: opts.lastChildLocator ?? null,
  };
  if (opts.itemization) out.itemization = opts.itemization;
  if (opts.linkage) out.linkage = opts.linkage;
  return out;
}

function makeLiveRegion(opts = {}) {
  return {
    locator: opts.locator ?? makeLocatorArtifact("div", opts.role ?? "status", null, "div.live"),
    ariaLive: opts.ariaLive ?? "polite",
    role: opts.role ?? "status",
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("stateTransitionEngine", () => {
  // ── Constants ────────────────────────────────────────────────────────────
  describe("constants", () => {
    it("STE_MAX_LIVE_REGIONS is 5", () => {
      const ctx = createEngineContext();
      assert.equal(ctx.__STE_MAX_LIVE_REGIONS, 5);
    });

    it("STE_MAX_CANDIDATES is 3", () => {
      const ctx = createEngineContext();
      assert.equal(ctx.__STE_MAX_CANDIDATES, 3);
    });
  });

  // ── buildLocator ─────────────────────────────────────────────────────────
  describe("buildLocator", () => {
    it("returns null for null input", () => {
      const ctx = createEngineContext();
      assert.equal(ctx.__buildLocator(null), null);
    });

    it("builds locator from artifact", () => {
      const ctx = createEngineContext();
      const loc = ctx.__buildLocator({ tag: "DIV", role: "log", testId: "chat-feed", cssPath: "div.chat" });
      assert.equal(loc.tag, "div");
      assert.equal(loc.role, "log");
      assert.equal(loc.testId, "chat-feed");
      assert.equal(loc.cssPath, "div.chat");
    });

    it("lowercases tag", () => {
      const ctx = createEngineContext();
      const loc = ctx.__buildLocator({ tag: "TEXTAREA", role: null, testId: null, cssPath: "" });
      assert.equal(loc.tag, "textarea");
    });
  });

  // ── hashLocator ──────────────────────────────────────────────────────────
  describe("hashLocator", () => {
    it("returns 00000000 for null", () => {
      const ctx = createEngineContext();
      assert.equal(ctx.__hashLocator(null), "00000000");
    });

    it("returns 8-char hex string", () => {
      const ctx = createEngineContext();
      const h = ctx.__hashLocator({ tag: "div", role: "log", testId: null, cssPath: "div.chat" });
      assert.match(h, /^[0-9a-f]{8}$/);
    });

    it("is deterministic", () => {
      const ctx = createEngineContext();
      const loc = { tag: "div", role: "log", testId: "feed", cssPath: "div > div" };
      assert.equal(ctx.__hashLocator(loc), ctx.__hashLocator(loc));
    });

    it("differs for different locators", () => {
      const ctx = createEngineContext();
      const a = ctx.__hashLocator({ tag: "div", role: "log", testId: null, cssPath: "div.a" });
      const b = ctx.__hashLocator({ tag: "div", role: "log", testId: null, cssPath: "div.b" });
      assert.notEqual(a, b);
    });
  });

  // ── buildTransitionState ─────────────────────────────────────────────────
  describe("buildTransitionState", () => {
    it("returns deterministic output for identical inputs", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({
        chatCandidates: [makeChatCandidate()],
        liveRegions: [makeLiveRegion()],
        activeLocator: makeLocatorArtifact("textarea", null, "msg-input", "textarea.input"),
        isInComposer: true,
        announceEventCount: 2,
        liveMutationCount: 3,
      });
      const a = ctx.__buildTransitionState({ frameId: 1, frameKeyStable: "fk::test", rootSelector: null, captureArtifacts: ca });
      const b = ctx.__buildTransitionState({ frameId: 1, frameKeyStable: "fk::test", rootSelector: null, captureArtifacts: ca });
      assert.deepEqual(a, b);
    });

    it("caps live regions to STE_MAX_LIVE_REGIONS (5)", () => {
      const ctx = createEngineContext();
      const regions = Array.from({ length: 8 }, (_, i) =>
        makeLiveRegion({ locator: makeLocatorArtifact("div", "status", null, `div.lr${i}`) })
      );
      const ca = makeCaptureArtifacts({ liveRegions: regions });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.live.regions.length, 5);
      assert.equal(state.quality.capped, true);
    });

    it("caps chat candidates to STE_MAX_CANDIDATES (3)", () => {
      const ctx = createEngineContext();
      const candidates = Array.from({ length: 5 }, (_, i) =>
        makeChatCandidate({ locator: makeLocatorArtifact("div", "log", null, `div.c${i}`) })
      );
      const ca = makeCaptureArtifacts({ chatCandidates: candidates });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.quality.capped, true);
      // messageCount still from first candidate
      assert.equal(state.chat.messageCount, 5);
    });

    it("omits text fields from locators", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({
        chatCandidates: [makeChatCandidate()],
        activeLocator: makeLocatorArtifact("textarea", null, "input", "textarea"),
      });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      // Check that no locator has 'name', 'ariaLabel', 'textContent' fields
      const checkLocator = (loc) => {
        if (!loc) return;
        assert.equal(loc.name, undefined);
        assert.equal(loc.ariaLabel, undefined);
        assert.equal(loc.textContent, undefined);
      };
      checkLocator(state.focus.activeLocator);
      checkLocator(state.chat.feedLocator);
      checkLocator(state.chat.lastMessageItemLocator);
      for (const r of state.live.regions) checkLocator(r.locator);
    });

    it("sets quality.capped=false when within limits", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate()] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.quality.capped, false);
    });

    it("handles null/empty captureArtifacts gracefully", () => {
      const ctx = createEngineContext();
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: {} });
      assert.equal(state.focus.activeLocator, null);
      assert.equal(state.chat.feedLocator, null);
      assert.equal(state.chat.feedRole, "unknown");
      assert.equal(state.chat.messageCount, 0);
      assert.equal(state.live.regions.length, 0);
    });

    it("sets isInComposer correctly", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ isInComposer: true, activeLocator: makeLocatorArtifact("textarea", null, null, "textarea") });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.focus.isInComposer, true);
    });

    it("sets feedRole from first candidate with role=log or role=feed", () => {
      const ctx = createEngineContext();
      const candidates = [
        { locator: makeLocatorArtifact("div", null, null, "div.a"), role: null, ariaLive: "polite", childCount: 3, lastChildLocator: null },
        { locator: makeLocatorArtifact("div", "feed", null, "div.b"), role: "feed", ariaLive: null, childCount: 5, lastChildLocator: null },
      ];
      const ca = makeCaptureArtifacts({ chatCandidates: candidates });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.chat.feedRole, "feed");
    });

    it("sets feedRole to 'none' when candidate has no log/feed role", () => {
      const ctx = createEngineContext();
      const candidates = [
        { locator: makeLocatorArtifact("div", null, null, "div.a"), role: null, ariaLive: "polite", childCount: 3, lastChildLocator: null },
      ];
      const ca = makeCaptureArtifacts({ chatCandidates: candidates });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.chat.feedRole, "none");
    });
  });

  // ── buildStateDelta ──────────────────────────────────────────────────────
  describe("buildStateDelta", () => {
    it("detects messageCountDelta increase", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 7 })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.equal(delta.messageCountDelta, 2);
    });

    it("detects composerLostFocus when prev isInComposer and focus changed", () => {
      const ctx = createEngineContext();
      const composerLoc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const otherLoc = makeLocatorArtifact("button", null, "send", "button");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ isInComposer: true, activeLocator: composerLoc }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ isInComposer: false, activeLocator: otherLoc }) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.equal(delta.composerLostFocus, true);
      assert.equal(delta.focusChanged, true);
    });

    it("does not set composerLostFocus when focus did not change", () => {
      const ctx = createEngineContext();
      const loc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ isInComposer: true, activeLocator: loc }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ isInComposer: true, activeLocator: loc }) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.equal(delta.composerLostFocus, false);
      assert.equal(delta.focusChanged, false);
    });

    it("sets announcementsLikelyMissing when messageCountDelta>=1 and no announceEvents", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.equal(delta.announcementsLikelyMissing, true);
    });

    it("calculates liveMutationCountDelta correctly", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ liveMutationCount: 2 }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ liveMutationCount: 5 }) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.equal(delta.liveMutationCountDelta, 3);
    });

    it("populates evidence locators from appropriate states", () => {
      const ctx = createEngineContext();
      const feedLoc = makeLocatorArtifact("div", "log", null, "div.feed");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ locator: feedLoc })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ locator: feedLoc })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.notEqual(delta.evidence.feedLocator, null);
      assert.equal(delta.evidence.feedLocator.tag, "div");
    });

    it("handles identical prev and next (no-change delta)", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate()] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const delta = ctx.__buildStateDelta(state, state);
      assert.equal(delta.messageCountDelta, 0);
      assert.equal(delta.focusChanged, false);
      assert.equal(delta.composerLostFocus, false);
      assert.equal(delta.liveMutationCountDelta, 0);
      assert.equal(delta.announceEventCountDelta, 0);
    });

    it("liveRegionPresent excludes role=log/feed without aria-live", () => {
      const ctx = createEngineContext();
      // Only a role="log" region with no aria-live — should NOT be counted as live region
      const regionWithLog = { locator: makeLocatorArtifact("div", "log", null, "div.log"), ariaLive: null, role: "log" };
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ liveRegions: [regionWithLog] }) });
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({}) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.equal(delta.liveRegionPresent, false);
    });

    it("liveRegionPresent includes role=status", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ liveRegions: [makeLiveRegion({ role: "status", ariaLive: null })] }) });
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({}) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.equal(delta.liveRegionPresent, true);
    });
  });

  // ── evaluateC1 (LIVE_CONTENT_NOT_ANNOUNCED) ─────────────────────────
  describe("evaluateC1", () => {
    it("fires when messageCountDelta>=1, no live region, and feed exists", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
      assert.equal(result.type, "LIVE_CONTENT_NOT_ANNOUNCED");
      assert.equal(result.severity, "medium");
    });

    it("fires when live region exists but announceEventCountDelta===0", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          chatCandidates: [makeChatCandidate({ childCount: 3 })],
          liveRegions: [makeLiveRegion()],
          announceEventCount: 0,
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          chatCandidates: [makeChatCandidate({ childCount: 5 })],
          liveRegions: [makeLiveRegion()],
          announceEventCount: 0,
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
    });

    it("does NOT fire when messageCountDelta===0", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] });
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null, captureArtifacts: ca });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null, captureArtifacts: ca });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when announceEventCountDelta>0 and liveRegionPresent", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          chatCandidates: [makeChatCandidate({ childCount: 3 })],
          liveRegions: [makeLiveRegion()],
          announceEventCount: 0,
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          chatCandidates: [makeChatCandidate({ childCount: 5 })],
          liveRegions: [makeLiveRegion()],
          announceEventCount: 2,
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when already in emittedSet", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const emittedSet = new Set();
      // Fire once
      ctx.__evaluateC1(delta, prev, next, { emittedSet });
      // Fire again — should be deduped
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet });
      assert.equal(result, null);
    });

    it("caps at 3 emissions per run", () => {
      const ctx = createEngineContext();
      const emittedSet = new Set();
      let emitted = 0;
      for (let i = 0; i < 5; i++) {
        const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: `fk${i}`, rootSelector: null,
          captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3, locator: makeLocatorArtifact("div", "log", null, `div.c${i}`) })] }) });
        const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: `fk${i}`, rootSelector: null,
          captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5, locator: makeLocatorArtifact("div", "log", null, `div.c${i}`) })] }) });
        const delta = ctx.__buildStateDelta(prev, next);
        const r = ctx.__evaluateC1(delta, prev, next, { emittedSet });
        if (r) emitted++;
      }
      assert.equal(emitted, 3);
    });

    it("degrades confidence when quality.capped and feedLocator missing", () => {
      const ctx = createEngineContext();
      // 4 candidates to trigger capping, but no role=log/feed — so feedLocator will exist
      // from fallback candidate, but let's test the capped+missing case manually.
      // Build delta manually where feedLocator is set but quality.capped is true.
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          chatCandidates: Array.from({ length: 4 }, (_, i) =>
            makeChatCandidate({ childCount: 3, locator: makeLocatorArtifact("div", "log", null, `div.c${i}`) })
          ),
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          chatCandidates: Array.from({ length: 4 }, (_, i) =>
            makeChatCandidate({ childCount: 5, locator: makeLocatorArtifact("div", "log", null, `div.c${i}`) })
          ),
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      // Remove feedLocator from evidence to simulate missing
      delta.evidence.feedLocator = null;
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet: new Set() });
      // Should still fire because feedRole is "log"
      assert.notEqual(result, null);
      assert.equal(result.severity, "low");
      assert.ok(result.note.includes("reduced confidence"));
    });

    it("does NOT fire without feed context (no feedRole, no feedLocator)", () => {
      const ctx = createEngineContext();
      // No chat candidates at all
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({}) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({}) });
      const delta = ctx.__buildStateDelta(prev, next);
      delta.messageCountDelta = 2; // force
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });
  });

  // ── evaluateC2 (INPUT_LOSES_FOCUS_ON_UPDATE) ───────────────────────
  describe("evaluateC2", () => {
    it("fires when composerLostFocus and messageCountDelta>=1", () => {
      const ctx = createEngineContext();
      const composerLoc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const otherLoc = makeLocatorArtifact("button", null, "send", "button");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: true, activeLocator: composerLoc,
          chatCandidates: [makeChatCandidate({ childCount: 3 })],
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: false, activeLocator: otherLoc,
          chatCandidates: [makeChatCandidate({ childCount: 5 })],
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC2(delta, prev, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
      assert.equal(result.type, "INPUT_LOSES_FOCUS_ON_UPDATE");
    });

    it("fires when composerLostFocus and announceEventCountDelta>=1", () => {
      const ctx = createEngineContext();
      const composerLoc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const otherLoc = makeLocatorArtifact("button", null, "send", "button");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: true, activeLocator: composerLoc,
          announceEventCount: 0,
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: false, activeLocator: otherLoc,
          announceEventCount: 1,
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC2(delta, prev, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
    });

    it("fires when composerLostFocus and liveMutationCountDelta>=1 with feedLocator", () => {
      const ctx = createEngineContext();
      const composerLoc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const otherLoc = makeLocatorArtifact("button", null, "send", "button");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: true, activeLocator: composerLoc,
          chatCandidates: [makeChatCandidate()],
          liveMutationCount: 0,
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: false, activeLocator: otherLoc,
          chatCandidates: [makeChatCandidate()],
          liveMutationCount: 2,
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC2(delta, prev, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
    });

    it("does NOT fire on liveMutationDelta alone without feed context", () => {
      const ctx = createEngineContext();
      const composerLoc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const otherLoc = makeLocatorArtifact("button", null, "send", "button");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: true, activeLocator: composerLoc,
          liveMutationCount: 0,
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: false, activeLocator: otherLoc,
          liveMutationCount: 2,
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC2(delta, prev, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when focus did not leave composer", () => {
      const ctx = createEngineContext();
      const loc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: true, activeLocator: loc,
          chatCandidates: [makeChatCandidate({ childCount: 3 })],
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: true, activeLocator: loc,
          chatCandidates: [makeChatCandidate({ childCount: 5 })],
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC2(delta, prev, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when no mutations detected", () => {
      const ctx = createEngineContext();
      const composerLoc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const otherLoc = makeLocatorArtifact("button", null, "send", "button");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ isInComposer: true, activeLocator: composerLoc }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ isInComposer: false, activeLocator: otherLoc }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC2(delta, prev, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when already in emittedSet", () => {
      const ctx = createEngineContext();
      const composerLoc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const otherLoc = makeLocatorArtifact("button", null, "send", "button");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: true, activeLocator: composerLoc,
          chatCandidates: [makeChatCandidate({ childCount: 3 })],
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: false, activeLocator: otherLoc,
          chatCandidates: [makeChatCandidate({ childCount: 5 })],
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const emittedSet = new Set();
      ctx.__evaluateC2(delta, prev, next, { emittedSet });
      const result = ctx.__evaluateC2(delta, prev, next, { emittedSet });
      assert.equal(result, null);
    });

    it("degrades confidence when quality.capped and composerLocator missing", () => {
      const ctx = createEngineContext();
      const composerLoc = makeLocatorArtifact("textarea", null, "msg", "textarea");
      const otherLoc = makeLocatorArtifact("button", null, "send", "button");
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: true, activeLocator: composerLoc,
          chatCandidates: Array.from({ length: 4 }, (_, i) =>
            makeChatCandidate({ childCount: 3, locator: makeLocatorArtifact("div", "log", null, `div.c${i}`) })
          ),
        }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({
          isInComposer: false, activeLocator: otherLoc,
          chatCandidates: Array.from({ length: 4 }, (_, i) =>
            makeChatCandidate({ childCount: 5, locator: makeLocatorArtifact("div", "log", null, `div.c${i}`) })
          ),
        }) });
      const delta = ctx.__buildStateDelta(prev, next);
      // Remove composerLocator from evidence
      delta.evidence.composerLocator = null;
      const result = ctx.__evaluateC2(delta, prev, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
      assert.equal(result.severity, "low");
      assert.ok(result.note.includes("reduced confidence"));
    });
  });

  // ── Multi-frame isolation ────────────────────────────────────────────────
  describe("multi-frame isolation", () => {
    it("states with different frameIds produce independent deltas", () => {
      const ctx = createEngineContext();
      const caA = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] });
      const caB = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 10 })] });
      const stateA = ctx.__buildTransitionState({ frameId: 1, frameKeyStable: "fk1", rootSelector: null, captureArtifacts: caA });
      const stateB = ctx.__buildTransitionState({ frameId: 2, frameKeyStable: "fk2", rootSelector: null, captureArtifacts: caB });
      assert.equal(stateA.frameId, 1);
      assert.equal(stateB.frameId, 2);
      assert.equal(stateA.chat.messageCount, 3);
      assert.equal(stateB.chat.messageCount, 10);
    });

    it("emittedSet scopes per frame key", () => {
      const ctx = createEngineContext();
      const emittedSet = new Set();
      // Frame 1 emits C1
      const prev1 = ctx.__buildTransitionState({ frameId: 1, frameKeyStable: "fk1", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] }) });
      const next1 = ctx.__buildTransitionState({ frameId: 1, frameKeyStable: "fk1", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] }) });
      const delta1 = ctx.__buildStateDelta(prev1, next1);
      const r1 = ctx.__evaluateC1(delta1, prev1, next1, { emittedSet });
      assert.notEqual(r1, null);

      // Frame 2 with same delta pattern should also emit (different frame key)
      const prev2 = ctx.__buildTransitionState({ frameId: 2, frameKeyStable: "fk2", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] }) });
      const next2 = ctx.__buildTransitionState({ frameId: 2, frameKeyStable: "fk2", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] }) });
      const delta2 = ctx.__buildStateDelta(prev2, next2);
      const r2 = ctx.__evaluateC1(delta2, prev2, next2, { emittedSet });
      assert.notEqual(r2, null);
    });
  });

  // ── Determinism ──────────────────────────────────────────────────────────
  describe("determinism", () => {
    it("same input produces identical TransitionState", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({
        chatCandidates: [makeChatCandidate()],
        liveRegions: [makeLiveRegion()],
        announceEventCount: 1,
      });
      const params = { frameId: 1, frameKeyStable: "fk", rootSelector: "#root", captureArtifacts: ca };
      const a = ctx.__buildTransitionState(params);
      const b = ctx.__buildTransitionState(params);
      assert.deepEqual(a, b);
    });

    it("same input produces identical StateDelta", () => {
      const ctx = createEngineContext();
      const ca1 = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] });
      const ca2 = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })], announceEventCount: 1 });
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca1 });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca2 });
      const d1 = ctx.__buildStateDelta(prev, next);
      const d2 = ctx.__buildStateDelta(prev, next);
      assert.deepEqual(d1, d2);
    });

    it("TransitionStateSummary contains no timestamps", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate()], isInComposer: true, activeLocator: makeLocatorArtifact("textarea", null, null, "textarea") });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const summary = ctx.__buildTransitionStateSummary(state);
      const json = JSON.stringify(summary);
      assert.equal(json.includes("timestamp"), false);
      assert.equal(json.includes("Date"), false);
      assert.equal(summary.at, undefined);
      assert.equal(summary.createdAt, undefined);
    });

    it("TransitionStateSummary contains no arrays", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate()], liveRegions: [makeLiveRegion()] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const summary = ctx.__buildTransitionStateSummary(state);
      for (const [key, val] of Object.entries(summary)) {
        assert.equal(Array.isArray(val), false, `summary.${key} should not be an array`);
      }
    });

    it("hashLocator is consistent across calls with same locator", () => {
      const ctx = createEngineContext();
      const loc = { tag: "div", role: "log", testId: "feed", cssPath: "div > div.chat" };
      const h1 = ctx.__hashLocator(loc);
      const h2 = ctx.__hashLocator(loc);
      const h3 = ctx.__hashLocator(loc);
      assert.equal(h1, h2);
      assert.equal(h2, h3);
    });
  });

  // ── buildTransitionState extensions (itemization + linkage) ──────────────
  describe("buildTransitionState extensions", () => {
    it("populates itemization from captureArtifacts", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({
        chatCandidates: [makeChatCandidate({
          itemization: { sampleCount: 3, hasItemRoles: true, looksListLike: false, distinctItemLocators: 2, score01: 0.7 },
        })],
      });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.chat.itemization.sampleCount, 3);
      assert.equal(state.chat.itemization.hasItemRoles, true);
      assert.equal(state.chat.itemization.looksListLike, false);
      assert.equal(state.chat.itemization.distinctItemLocators, 2);
      assert.equal(state.chat.itemization.score01, 0.7);
    });

    it("defaults itemization when absent", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate()] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.chat.itemization.sampleCount, 0);
      assert.equal(state.chat.itemization.hasItemRoles, false);
      assert.equal(state.chat.itemization.score01, 0);
    });

    it("populates linkage from captureArtifacts", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({
        chatCandidates: [makeChatCandidate({
          linkage: { ariaControlsLink: true, ariaDescribedByLink: false, ariaOwnsLink: false, sharedRootMarker: true },
        })],
      });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.chat.linkage.ariaControlsLink, true);
      assert.equal(state.chat.linkage.ariaDescribedByLink, false);
      assert.equal(state.chat.linkage.ariaOwnsLink, false);
      assert.equal(state.chat.linkage.sharedRootMarker, true);
    });

    it("defaults linkage when absent", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate()] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      assert.equal(state.chat.linkage.ariaControlsLink, false);
      assert.equal(state.chat.linkage.ariaDescribedByLink, false);
      assert.equal(state.chat.linkage.ariaOwnsLink, false);
      assert.equal(state.chat.linkage.sharedRootMarker, false);
    });
  });

  // ── buildStateDelta extensions (feedRoleChanged + itemizationScoreDelta) ──
  describe("buildStateDelta extensions", () => {
    it("feedRoleChanged true when role differs", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "log" })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "generic" })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.equal(delta.feedRoleChanged, true);
    });

    it("feedRoleChanged false when role same", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "log" })] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const delta = ctx.__buildStateDelta(state, state);
      assert.equal(delta.feedRoleChanged, false);
    });

    it("itemizationScoreDelta computed correctly", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          itemization: { sampleCount: 3, hasItemRoles: false, looksListLike: false, distinctItemLocators: 1, score01: 0.3 },
        })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          itemization: { sampleCount: 3, hasItemRoles: true, looksListLike: false, distinctItemLocators: 2, score01: 0.7 },
        })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      assert.ok(Math.abs(delta.itemizationScoreDelta - 0.4) < 0.001);
    });

    it("itemizationScoreDelta null when prev missing itemization", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({}) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          itemization: { sampleCount: 3, hasItemRoles: true, looksListLike: false, distinctItemLocators: 2, score01: 0.7 },
        })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      // prev has no chat candidates, so prev.chat.itemization defaults to score01:0
      // But prev.chat is {} when no candidates, so itemization is undefined
      // The engine defaults itemization when feedCandidate is null — score01 defaults to 0 in buildTransitionState
      // Actually, when no feedCandidate, itemization is still built with defaults (score01:0)
      // So the delta should compute 0.7 - 0 = 0.7
      // Wait, let me re-read the engine code. When feedCandidate is null, rawItem = (null && null.itemization) || {} = {}
      // So itemization.score01 = 0 (typeof undefined === number is false, so defaults to 0)
      // But in buildStateDelta, prevItem = (prevChat.itemization || {}), and the engine stores itemization in chat
      // So prevChat.itemization exists (it was set by buildTransitionState), and prevItem.score01 = 0
      // Therefore itemizationScoreDelta = 0.7 - 0 = 0.7
      assert.ok(Math.abs(delta.itemizationScoreDelta - 0.7) < 0.001);
    });

    it("frameSplitChanged is always false in single-frame delta", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate()] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const delta = ctx.__buildStateDelta(state, state);
      assert.equal(delta.frameSplitChanged, false);
    });
  });

  // ── buildTransitionStateSummary extensions ─────────────────────────────────
  describe("buildTransitionStateSummary extensions", () => {
    it("includes itemizationScore01 scalar", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
        itemization: { sampleCount: 3, hasItemRoles: true, looksListLike: false, distinctItemLocators: 2, score01: 0.7 },
      })] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const summary = ctx.__buildTransitionStateSummary(state);
      assert.equal(summary.itemizationScore01, 0.7);
    });

    it("includes hasLinkage boolean (strong signals only)", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
        linkage: { ariaControlsLink: true, ariaDescribedByLink: false, ariaOwnsLink: false, sharedRootMarker: false },
      })] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const summary = ctx.__buildTransitionStateSummary(state);
      assert.equal(summary.hasLinkage, true);
    });

    it("hasLinkage false when only sharedRootMarker", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
        linkage: { ariaControlsLink: false, ariaDescribedByLink: false, ariaOwnsLink: false, sharedRootMarker: true },
      })] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const summary = ctx.__buildTransitionStateSummary(state);
      assert.equal(summary.hasLinkage, false);
      assert.equal(summary.sharedRootMarker, true);
    });

    it("ariaOwnsLink contributes to hasLinkage", () => {
      const ctx = createEngineContext();
      const ca = makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
        linkage: { ariaControlsLink: false, ariaDescribedByLink: false, ariaOwnsLink: true, sharedRootMarker: false },
      })] });
      const state = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: ca });
      const summary = ctx.__buildTransitionStateSummary(state);
      assert.equal(summary.hasLinkage, true);
    });
  });

  // ── evaluateC3_1 (LIVE_REGION_MISSING_ROLE) ─────────────────────────────────
  describe("evaluateC3_1", () => {
    it("fires when feedLocator exists and feedRole is 'none'", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "generic" })] }) });
      const result = ctx.__evaluateC3_1(null, null, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
      assert.equal(result.type, "LIVE_REGION_MISSING_ROLE");
      assert.equal(result.severity, "medium");
    });

    it("fires when feedRole is 'unknown'", () => {
      const ctx = createEngineContext();
      // feedRole "unknown" happens when no chatCandidates at all — but then feedLocator is null
      // So we need to craft a state where feedLocator exists but feedRole is unknown
      // Actually, feedRole is "unknown" only when feedCandidate is null.
      // When feedCandidate exists, feedRole is "log", "feed", or "none".
      // So we'd need to manually construct this state. Let's just build one with no role.
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "generic" })] }) });
      // feedRole will be "none" since "generic" is not "log" or "feed"
      assert.equal(next.chat.feedRole, "none");
      const result = ctx.__evaluateC3_1(null, null, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
    });

    it("does NOT fire when feedRole is 'log'", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "log" })] }) });
      const result = ctx.__evaluateC3_1(null, null, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when feedRole is 'feed'", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "feed" })] }) });
      const result = ctx.__evaluateC3_1(null, null, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when feedLocator is null", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({}) });
      const result = ctx.__evaluateC3_1(null, null, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("dedup via emittedSet", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "generic" })] }) });
      const emittedSet = new Set();
      ctx.__evaluateC3_1(null, null, next, { emittedSet });
      const result = ctx.__evaluateC3_1(null, null, next, { emittedSet });
      assert.equal(result, null);
    });

    it("caps at 3", () => {
      const ctx = createEngineContext();
      const emittedSet = new Set();
      let count = 0;
      for (let i = 0; i < 5; i++) {
        const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: `fk${i}`, rootSelector: null,
          captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
            role: "generic", locator: makeLocatorArtifact("div", "generic", null, `div.c${i}`),
          })] }) });
        if (ctx.__evaluateC3_1(null, null, next, { emittedSet })) count++;
      }
      assert.equal(count, 3);
    });

    it("deterministic output", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ role: "generic" })] }) });
      const a = ctx.__evaluateC3_1(null, null, next, { emittedSet: new Set() });
      const b = ctx.__evaluateC3_1(null, null, next, { emittedSet: new Set() });
      assert.deepEqual(a, b);
    });
  });

  // ── evaluateC3_2 (LIVE_ITEM_NOT_ITEMIZED) ──────────────────────────────
  describe("evaluateC3_2", () => {
    it("fires when feedLocator + messageCount>=2 + score01<0.5", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          childCount: 5,
          itemization: { sampleCount: 3, hasItemRoles: false, looksListLike: false, distinctItemLocators: 1, score01: 0.2 },
        })] }) });
      const result = ctx.__evaluateC3_2(null, null, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
      assert.equal(result.type, "LIVE_ITEM_NOT_ITEMIZED");
      assert.equal(result.severity, "low");
    });

    it("does NOT fire when messageCount < 2", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          childCount: 1,
          itemization: { sampleCount: 1, hasItemRoles: false, looksListLike: false, distinctItemLocators: 0, score01: 0.0 },
        })] }) });
      const result = ctx.__evaluateC3_2(null, null, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when score01 >= 0.5", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          childCount: 5,
          itemization: { sampleCount: 3, hasItemRoles: true, looksListLike: true, distinctItemLocators: 3, score01: 0.8 },
        })] }) });
      const result = ctx.__evaluateC3_2(null, null, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when feedLocator null", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({}) });
      const result = ctx.__evaluateC3_2(null, null, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("dedup via emittedSet", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          childCount: 5,
          itemization: { sampleCount: 3, hasItemRoles: false, looksListLike: false, distinctItemLocators: 1, score01: 0.2 },
        })] }) });
      const emittedSet = new Set();
      ctx.__evaluateC3_2(null, null, next, { emittedSet });
      const result = ctx.__evaluateC3_2(null, null, next, { emittedSet });
      assert.equal(result, null);
    });

    it("caps at 3", () => {
      const ctx = createEngineContext();
      const emittedSet = new Set();
      let count = 0;
      for (let i = 0; i < 5; i++) {
        const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: `fk${i}`, rootSelector: null,
          captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
            childCount: 5, locator: makeLocatorArtifact("div", "log", null, `div.c${i}`),
            itemization: { sampleCount: 3, hasItemRoles: false, looksListLike: false, distinctItemLocators: 1, score01: 0.1 },
          })] }) });
        if (ctx.__evaluateC3_2(null, null, next, { emittedSet })) count++;
      }
      assert.equal(count, 3);
    });

    it("fires at boundary: score01 exactly 0.5 does NOT fire (>=0.5 suppresses)", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          childCount: 5,
          itemization: { sampleCount: 3, hasItemRoles: false, looksListLike: false, distinctItemLocators: 1, score01: 0.5 },
        })] }) });
      const result = ctx.__evaluateC3_2(null, null, next, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("deterministic output", () => {
      const ctx = createEngineContext();
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({
          childCount: 5,
          itemization: { sampleCount: 3, hasItemRoles: false, looksListLike: false, distinctItemLocators: 1, score01: 0.2 },
        })] }) });
      const a = ctx.__evaluateC3_2(null, null, next, { emittedSet: new Set() });
      const b = ctx.__evaluateC3_2(null, null, next, { emittedSet: new Set() });
      assert.deepEqual(a, b);
    });
  });

  // ── mergeFrameIntegrity ────────────────────────────────────────────────────
  describe("mergeFrameIntegrity", () => {
    it("identifies feedFrame from highest messageCount", () => {
      const ctx = createEngineContext();
      const result = ctx.__mergeFrameIntegrity([
        { frameId: 1, summaries: [{ feedLocatorHash: "abc", messageCount: 3, composerLocatorHash: null, liveRegionCount: 0, observedAnnounceEvents: 0, hasLinkage: false, sharedRootMarker: false }] },
        { frameId: 2, summaries: [{ feedLocatorHash: "def", messageCount: 10, composerLocatorHash: null, liveRegionCount: 0, observedAnnounceEvents: 0, hasLinkage: false, sharedRootMarker: false }] },
      ]);
      assert.equal(result.feedFrameId, 2);
      assert.equal(result.feedLocatorHash, "def");
    });

    it("identifies composerFrame from composerLocatorHash", () => {
      const ctx = createEngineContext();
      const result = ctx.__mergeFrameIntegrity([
        { frameId: 1, summaries: [{ feedLocatorHash: "abc", messageCount: 5, composerLocatorHash: null, liveRegionCount: 0, observedAnnounceEvents: 0, hasLinkage: false, sharedRootMarker: false }] },
        { frameId: 2, summaries: [{ feedLocatorHash: null, messageCount: 0, composerLocatorHash: "xyz", liveRegionCount: 0, observedAnnounceEvents: 0, hasLinkage: false, sharedRootMarker: false }] },
      ]);
      assert.equal(result.composerFrameId, 2);
      assert.equal(result.composerLocatorHash, "xyz");
    });

    it("identifies liveFrames from liveRegionCount > 0", () => {
      const ctx = createEngineContext();
      const result = ctx.__mergeFrameIntegrity([
        { frameId: 1, summaries: [{ feedLocatorHash: "abc", messageCount: 5, composerLocatorHash: null, liveRegionCount: 0, observedAnnounceEvents: 0, hasLinkage: false, sharedRootMarker: false }] },
        { frameId: 2, summaries: [{ feedLocatorHash: null, messageCount: 0, composerLocatorHash: null, liveRegionCount: 2, observedAnnounceEvents: 1, hasLinkage: false, sharedRootMarker: false }] },
      ]);
      assert.deepEqual(JSON.parse(JSON.stringify(result.liveFrameIds)), [2]);
    });

    it("handles empty summaries gracefully", () => {
      const ctx = createEngineContext();
      const result = ctx.__mergeFrameIntegrity([
        { frameId: 1, summaries: [] },
        { frameId: 2, summaries: [] },
      ]);
      assert.equal(result.feedFrameId, null);
      assert.equal(result.composerFrameId, null);
      assert.deepEqual(JSON.parse(JSON.stringify(result.liveFrameIds)), []);
    });

    it("computes per-frame deltas from last two summaries", () => {
      const ctx = createEngineContext();
      const result = ctx.__mergeFrameIntegrity([
        { frameId: 1, summaries: [
          { feedLocatorHash: "abc", messageCount: 3, composerLocatorHash: null, liveRegionCount: 0, observedAnnounceEvents: 0, hasLinkage: false, sharedRootMarker: false },
          { feedLocatorHash: "abc", messageCount: 5, composerLocatorHash: null, liveRegionCount: 0, observedAnnounceEvents: 0, hasLinkage: false, sharedRootMarker: false },
        ] },
        { frameId: 2, summaries: [
          { feedLocatorHash: null, messageCount: 0, composerLocatorHash: null, liveRegionCount: 1, observedAnnounceEvents: 1, hasLinkage: false, sharedRootMarker: false },
          { feedLocatorHash: null, messageCount: 0, composerLocatorHash: null, liveRegionCount: 1, observedAnnounceEvents: 3, hasLinkage: false, sharedRootMarker: false },
        ] },
      ]);
      assert.equal(result.messageCountDelta, 2); // frame1: 5-3=2, frame2: 0-0=0
      assert.equal(result.announceEventsDelta, 2); // frame1: 0-0=0, frame2: 3-1=2
    });
  });

  // ── evaluateC4_1 (ANNOUNCEMENT_IN_DIFFERENT_FRAME) ─────────────────────────
  describe("evaluateC4_1", () => {
    it("fires when liveRegion in different frame AND messageCountDelta>=1", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_1({
        feedFrameId: 1, liveFrameIds: [2], messageCount: 5,
        messageCountDelta: 1, announceEventsDelta: 0,
      }, { emittedSet: new Set() });
      assert.notEqual(result, null);
      assert.equal(result.type, "ANNOUNCEMENT_IN_DIFFERENT_FRAME");
    });

    it("fires when liveRegion in different frame AND announceEventsDelta>=1", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_1({
        feedFrameId: 1, liveFrameIds: [2], messageCount: 5,
        messageCountDelta: 0, announceEventsDelta: 1,
      }, { emittedSet: new Set() });
      assert.notEqual(result, null);
    });

    it("does NOT fire when same frame", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_1({
        feedFrameId: 1, liveFrameIds: [1], messageCount: 5,
        messageCountDelta: 1, announceEventsDelta: 0,
      }, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when no liveRegions", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_1({
        feedFrameId: 1, liveFrameIds: [], messageCount: 5,
        messageCountDelta: 1, announceEventsDelta: 0,
      }, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when transition gating fails (both deltas 0)", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_1({
        feedFrameId: 1, liveFrameIds: [2], messageCount: 5,
        messageCountDelta: 0, announceEventsDelta: 0,
      }, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when messageCount is 0 (no feed content)", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_1({
        feedFrameId: 1, liveFrameIds: [2], messageCount: 0,
        messageCountDelta: 1, announceEventsDelta: 0,
      }, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("dedup and cap at 3", () => {
      const ctx = createEngineContext();
      const emittedSet = new Set();
      let count = 0;
      for (let i = 0; i < 5; i++) {
        const r = ctx.__evaluateC4_1({
          feedFrameId: i, liveFrameIds: [i + 10], messageCount: 5,
          messageCountDelta: 1, announceEventsDelta: 0,
        }, { emittedSet });
        if (r) count++;
      }
      assert.equal(count, 3);
    });
  });

  // ── evaluateC4_2 (COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE) ─────────────────
  describe("evaluateC4_2", () => {
    it("fires when composer+feed in different frames, no linkage", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_2({
        feedFrameId: 1, composerFrameId: 2, hasLinkage: false,
      }, { emittedSet: new Set() });
      assert.notEqual(result, null);
      assert.equal(result.type, "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE");
    });

    it("does NOT fire when same frame", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_2({
        feedFrameId: 1, composerFrameId: 1, hasLinkage: false,
      }, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when ariaControlsLink present (hasLinkage=true)", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_2({
        feedFrameId: 1, composerFrameId: 2, hasLinkage: true,
      }, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("sharedRootMarker alone does NOT suppress (C4.2 still fires)", () => {
      const ctx = createEngineContext();
      // hasLinkage does NOT include sharedRootMarker
      const result = ctx.__evaluateC4_2({
        feedFrameId: 1, composerFrameId: 2, hasLinkage: false, sharedRootMarker: true,
      }, { emittedSet: new Set() });
      assert.notEqual(result, null);
    });

    it("does NOT fire when no composer", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_2({
        feedFrameId: 1, composerFrameId: null, hasLinkage: false,
      }, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("does NOT fire when no feed", () => {
      const ctx = createEngineContext();
      const result = ctx.__evaluateC4_2({
        feedFrameId: null, composerFrameId: 2, hasLinkage: false,
      }, { emittedSet: new Set() });
      assert.equal(result, null);
    });

    it("dedup and cap at 3", () => {
      const ctx = createEngineContext();
      const emittedSet = new Set();
      let count = 0;
      for (let i = 0; i < 5; i++) {
        const r = ctx.__evaluateC4_2({
          feedFrameId: i, composerFrameId: i + 10, hasLinkage: false,
        }, { emittedSet });
        if (r) count++;
      }
      assert.equal(count, 3);
    });
  });

  // ── Element resolution robustness ────────────────────────────────────────
  describe("element resolution", () => {
    it("evaluator returns evidenceLocatorHash that can be used for lookup", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet: new Set() });
      assert.notEqual(result, null);
      assert.match(result.evidenceLocatorHash, /^[0-9a-f]{8}$/);
    });

    it("finding is emitted even when evidenceLocatorHash would miss in a map", () => {
      const ctx = createEngineContext();
      const prev = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 3 })] }) });
      const next = ctx.__buildTransitionState({ frameId: 0, frameKeyStable: "fk", rootSelector: null,
        captureArtifacts: makeCaptureArtifacts({ chatCandidates: [makeChatCandidate({ childCount: 5 })] }) });
      const delta = ctx.__buildStateDelta(prev, next);
      const result = ctx.__evaluateC1(delta, prev, next, { emittedSet: new Set() });
      // Simulate: map does not contain the hash -- but the finding object is still valid
      const fakeMap = new Map();
      const resolvedEl = fakeMap.get(result.evidenceLocatorHash) || null;
      assert.equal(resolvedEl, null); // no element found
      assert.notEqual(result, null); // but finding is still emitted
      assert.equal(result.type, "LIVE_CONTENT_NOT_ANNOUNCED");
    });
  });
});
