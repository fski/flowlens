/**
 * SW merge tests — validates mergeFrameIntegrity, evaluateC4_1, evaluateC4_2
 * as inlined in sw.js. Uses sw-harness.mjs to load the pure functions.
 *
 * These are cross-frame integrity tests: the SW collects per-frame
 * TransitionStateSummaries and runs C4 evaluators against the merged view.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSwContext } from "./sw-harness.mjs";

/** JSON round-trip to normalise cross-VM objects for deepStrictEqual. */
const norm = (o) => JSON.parse(JSON.stringify(o));

// ── Helpers ──────────────────────────────────────────────────────────

function makeSummary(overrides = {}) {
  return {
    feedLocatorHash: "abc12345",
    composerLocatorHash: "cmp67890",
    messageCount: 5,
    liveRegionCount: 1,
    observedAnnounceEvents: 2,
    hasLinkage: false,
    sharedRootMarker: false,
    itemizationScore01: 0,
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════
// mergeFrameIntegrity
// ══════════════════════════════════════════════════════════════════════

describe("SW mergeFrameIntegrity", () => {
  const ctx = createSwContext();

  it("identifies primary feed frame from highest messageCount", () => {
    const result = ctx.__mergeFrameIntegrity([
      { frameId: 0, summaries: [makeSummary({ messageCount: 3 })] },
      { frameId: 1, summaries: [makeSummary({ messageCount: 10 })] },
    ]);
    assert.equal(result.feedFrameId, 1, "frame 1 has highest messageCount");
    assert.equal(result.feedLocatorHash, "abc12345");
  });

  it("identifies composer frame from composerLocatorHash", () => {
    const result = ctx.__mergeFrameIntegrity([
      { frameId: 0, summaries: [makeSummary({ composerLocatorHash: null })] },
      { frameId: 2, summaries: [makeSummary({ composerLocatorHash: "cmp99" })] },
    ]);
    assert.equal(result.composerFrameId, 2);
    assert.equal(result.composerLocatorHash, "cmp99");
  });

  it("identifies live frames from liveRegionCount > 0", () => {
    const result = ctx.__mergeFrameIntegrity([
      { frameId: 0, summaries: [makeSummary({ liveRegionCount: 0 })] },
      { frameId: 1, summaries: [makeSummary({ liveRegionCount: 2 })] },
      { frameId: 3, summaries: [makeSummary({ liveRegionCount: 1 })] },
    ]);
    assert.deepStrictEqual(norm(result.liveFrameIds), [1, 3]);
  });

  it("computes per-frame deltas from last two summaries", () => {
    const result = ctx.__mergeFrameIntegrity([
      {
        frameId: 0,
        summaries: [
          makeSummary({ messageCount: 3, observedAnnounceEvents: 1 }),
          makeSummary({ messageCount: 7, observedAnnounceEvents: 3 }),
        ],
      },
    ]);
    assert.equal(result.messageCountDelta, 4, "7 - 3 = 4");
    assert.equal(result.announceEventsDelta, 2, "3 - 1 = 2");
  });

  it("handles empty/null summaries gracefully", () => {
    const result = ctx.__mergeFrameIntegrity([
      { frameId: 0, summaries: [] },
      { frameId: 1, summaries: null },
      { frameId: 2 },
    ]);
    assert.equal(result.feedFrameId, null);
    assert.equal(result.composerFrameId, null);
    assert.deepStrictEqual(norm(result.liveFrameIds), []);
    assert.equal(result.messageCount, 0);
    assert.equal(result.messageCountDelta, 0);
    assert.equal(result.announceEventsDelta, 0);
  });

  it("picks last summary per frame (ignores earlier summaries)", () => {
    const result = ctx.__mergeFrameIntegrity([
      {
        frameId: 0,
        summaries: [
          makeSummary({ messageCount: 100 }),
          makeSummary({ messageCount: 2 }),
        ],
      },
      {
        frameId: 1,
        summaries: [
          makeSummary({ messageCount: 1 }),
          makeSummary({ messageCount: 5 }),
        ],
      },
    ]);
    // Feed frame is frame 1 (messageCount 5 > 2)
    assert.equal(result.feedFrameId, 1);
    assert.equal(result.messageCount, 7, "2 + 5 = 7");
  });

  it("aggregates linkage OR across frames", () => {
    const result = ctx.__mergeFrameIntegrity([
      { frameId: 0, summaries: [makeSummary({ hasLinkage: false })] },
      { frameId: 1, summaries: [makeSummary({ hasLinkage: true })] },
    ]);
    assert.equal(result.hasLinkage, true);
  });

  it("aggregates sharedRootMarker OR across frames", () => {
    const result = ctx.__mergeFrameIntegrity([
      { frameId: 0, summaries: [makeSummary({ sharedRootMarker: false })] },
      { frameId: 1, summaries: [makeSummary({ sharedRootMarker: true })] },
    ]);
    assert.equal(result.sharedRootMarker, true);
  });
});

// ══════════════════════════════════════════════════════════════════════
// evaluateC4_1 — ANNOUNCEMENT_IN_DIFFERENT_FRAME
// ══════════════════════════════════════════════════════════════════════

describe("SW evaluateC4_1", () => {
  const ctx = createSwContext();

  it("fires when live frame differs from feed frame AND messageCountDelta >= 1", () => {
    const integrity = {
      feedFrameId: 0,
      liveFrameIds: [1],
      messageCount: 5,
      messageCountDelta: 2,
      announceEventsDelta: 0,
    };
    const result = ctx.__evaluateC4_1(integrity, { emittedSet: new Set() });
    assert.ok(result !== null, "C4.1 should fire");
    assert.equal(result.type, "ANNOUNCEMENT_IN_DIFFERENT_FRAME");
    assert.equal(result.el, null, "C4 findings have el: null");
  });

  it("fires when live frame differs AND announceEventsDelta >= 1", () => {
    const integrity = {
      feedFrameId: 0,
      liveFrameIds: [2],
      messageCount: 3,
      messageCountDelta: 0,
      announceEventsDelta: 1,
    };
    const result = ctx.__evaluateC4_1(integrity, { emittedSet: new Set() });
    assert.ok(result !== null, "C4.1 should fire on announceEventsDelta");
  });

  it("does NOT fire when same frame", () => {
    const integrity = {
      feedFrameId: 0,
      liveFrameIds: [0],
      messageCount: 5,
      messageCountDelta: 1,
      announceEventsDelta: 0,
    };
    const result = ctx.__evaluateC4_1(integrity, { emittedSet: new Set() });
    assert.equal(result, null);
  });

  it("does NOT fire when no feed or no live regions", () => {
    const noFeed = { feedFrameId: null, liveFrameIds: [1], messageCount: 5, messageCountDelta: 1, announceEventsDelta: 0 };
    const noLive = { feedFrameId: 0, liveFrameIds: [], messageCount: 5, messageCountDelta: 1, announceEventsDelta: 0 };
    assert.equal(ctx.__evaluateC4_1(noFeed, { emittedSet: new Set() }), null);
    assert.equal(ctx.__evaluateC4_1(noLive, { emittedSet: new Set() }), null);
  });

  it("does NOT fire when messageCountDelta=0 and announceEventsDelta=0 (transition gating)", () => {
    const integrity = {
      feedFrameId: 0,
      liveFrameIds: [1],
      messageCount: 5,
      messageCountDelta: 0,
      announceEventsDelta: 0,
    };
    const result = ctx.__evaluateC4_1(integrity, { emittedSet: new Set() });
    assert.equal(result, null, "transition gating should suppress");
  });

  it("does NOT fire when messageCount=0 (additional guard)", () => {
    const integrity = {
      feedFrameId: 0,
      liveFrameIds: [1],
      messageCount: 0,
      messageCountDelta: 1,
      announceEventsDelta: 0,
    };
    const result = ctx.__evaluateC4_1(integrity, { emittedSet: new Set() });
    assert.equal(result, null, "messageCount=0 guard should suppress");
  });

  it("dedup and cap at 3", () => {
    const set = new Set();
    const base = {
      feedFrameId: 0,
      messageCount: 5,
      messageCountDelta: 1,
      announceEventsDelta: 0,
    };
    // 4 different live frame configs — first 3 fire, 4th capped
    const r1 = ctx.__evaluateC4_1({ ...base, liveFrameIds: [1] }, { emittedSet: set });
    const r2 = ctx.__evaluateC4_1({ ...base, liveFrameIds: [2] }, { emittedSet: set });
    const r3 = ctx.__evaluateC4_1({ ...base, liveFrameIds: [3] }, { emittedSet: set });
    const r4 = ctx.__evaluateC4_1({ ...base, liveFrameIds: [4] }, { emittedSet: set });
    assert.ok(r1 !== null, "first should fire");
    assert.ok(r2 !== null, "second should fire");
    assert.ok(r3 !== null, "third should fire");
    assert.equal(r4, null, "fourth should be capped");
  });
});

// ══════════════════════════════════════════════════════════════════════
// evaluateC4_2 — COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE
// ══════════════════════════════════════════════════════════════════════

describe("SW evaluateC4_2", () => {
  const ctx = createSwContext();

  it("fires when composer+feed in different frames, no linkage", () => {
    const integrity = {
      feedFrameId: 0,
      composerFrameId: 1,
      hasLinkage: false,
    };
    const result = ctx.__evaluateC4_2(integrity, { emittedSet: new Set() });
    assert.ok(result !== null, "C4.2 should fire");
    assert.equal(result.type, "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE");
    assert.equal(result.el, null);
  });

  it("does NOT fire when same frame", () => {
    const integrity = {
      feedFrameId: 0,
      composerFrameId: 0,
      hasLinkage: false,
    };
    assert.equal(ctx.__evaluateC4_2(integrity, { emittedSet: new Set() }), null);
  });

  it("does NOT fire when ariaControlsLink present (hasLinkage=true)", () => {
    const integrity = {
      feedFrameId: 0,
      composerFrameId: 1,
      hasLinkage: true,
    };
    assert.equal(ctx.__evaluateC4_2(integrity, { emittedSet: new Set() }), null);
  });

  it("does NOT fire when no composer or no feed", () => {
    const noComposer = { feedFrameId: 0, composerFrameId: null, hasLinkage: false };
    const noFeed = { feedFrameId: null, composerFrameId: 1, hasLinkage: false };
    assert.equal(ctx.__evaluateC4_2(noComposer, { emittedSet: new Set() }), null);
    assert.equal(ctx.__evaluateC4_2(noFeed, { emittedSet: new Set() }), null);
  });

  it("sharedRootMarker alone does NOT suppress C4.2", () => {
    // sharedRootMarker is a weak signal — does NOT contribute to hasLinkage
    const integrity = {
      feedFrameId: 0,
      composerFrameId: 1,
      hasLinkage: false,
      sharedRootMarker: true,
    };
    const result = ctx.__evaluateC4_2(integrity, { emittedSet: new Set() });
    assert.ok(result !== null, "sharedRootMarker should not suppress C4.2");
  });

  it("dedup and cap at 3", () => {
    const set = new Set();
    // 4 different composer/feed combos
    const r1 = ctx.__evaluateC4_2({ feedFrameId: 0, composerFrameId: 1, hasLinkage: false }, { emittedSet: set });
    const r2 = ctx.__evaluateC4_2({ feedFrameId: 0, composerFrameId: 2, hasLinkage: false }, { emittedSet: set });
    const r3 = ctx.__evaluateC4_2({ feedFrameId: 0, composerFrameId: 3, hasLinkage: false }, { emittedSet: set });
    const r4 = ctx.__evaluateC4_2({ feedFrameId: 0, composerFrameId: 4, hasLinkage: false }, { emittedSet: set });
    assert.ok(r1 !== null);
    assert.ok(r2 !== null);
    assert.ok(r3 !== null);
    assert.equal(r4, null, "fourth should be capped");
  });
});
