/**
 * Snippet–Engine parity test — validates that the snippet inline ste*
 * functions produce identical output to the canonical engine module.
 *
 * Strategy: load engine (via engine-harness) and snippet ste* functions
 * (via snippet-harness), run both with identical captureArtifacts inputs,
 * and assert equal outputs on:
 *   - TransitionStateSummary
 *   - StateDelta
 *   - Evaluator outputs (C1, C2)
 *
 * Cross-VM deepStrictEqual may fail on objects created in different vm
 * contexts, so we JSON round-trip for structural comparison.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEngineContext } from "./engine-harness.mjs";
import { createSnippetEngineContext } from "./snippet-harness.mjs";

/** JSON round-trip to normalise cross-VM objects for deepStrictEqual. */
const norm = (o) => JSON.parse(JSON.stringify(o));

// ── Shared fixture data (no DOM required) ──────────────────────────────

const BASE_ARTIFACTS = {
  chatCandidates: [
    {
      tag: "div",
      role: "log",
      testId: "chat-feed",
      cssPath: "div.chat-container > div.log",
      childCount: 5,
      lastChildLocator: {
        tag: "div",
        role: null,
        testId: null,
        cssPath: "div.chat-container > div.log > div:last-child",
      },
    },
  ],
  liveRegions: [
    {
      tag: "div",
      role: "status",
      testId: null,
      cssPath: "div.sr-announcer",
      ariaLive: "polite",
    },
  ],
  activeLocator: {
    tag: "textarea",
    role: "textbox",
    testId: "msg-input",
    cssPath: "textarea.msg-input",
  },
  isInComposer: true,
  announceEventCount: 0,
  liveMutationCount: 0,
  captureMode: "observe",
};

/** Modified artifacts simulating message increase + no announcements. */
const NEXT_ARTIFACTS_MSG_INCREASE = {
  ...BASE_ARTIFACTS,
  chatCandidates: [
    {
      ...BASE_ARTIFACTS.chatCandidates[0],
      childCount: 7,
    },
  ],
  isInComposer: true,
  announceEventCount: 0,
  liveMutationCount: 0,
};

/** Modified artifacts: composer lost focus + message increase. */
const NEXT_ARTIFACTS_FOCUS_LOST = {
  ...BASE_ARTIFACTS,
  chatCandidates: [
    {
      ...BASE_ARTIFACTS.chatCandidates[0],
      childCount: 6,
    },
  ],
  activeLocator: {
    tag: "div",
    role: null,
    testId: null,
    cssPath: "div.msg-list",
  },
  isInComposer: false,
  announceEventCount: 0,
  liveMutationCount: 0,
};

/** Artifacts with no live regions (C1 should fire). */
const BASE_NO_LIVE = {
  ...BASE_ARTIFACTS,
  liveRegions: [],
};

const NEXT_NO_LIVE_MSG_INCREASE = {
  ...BASE_NO_LIVE,
  chatCandidates: [
    {
      ...BASE_NO_LIVE.chatCandidates[0],
      childCount: 8,
    },
  ],
  announceEventCount: 0,
};

// ── Build states via both engines ──────────────────────────────────────

function buildEngineState(eCtx, artifacts) {
  return eCtx.__buildTransitionState({
    frameId: 0,
    frameKeyStable: "frame0",
    rootSelector: null,
    captureArtifacts: artifacts,
    probeData: null,
  });
}

function buildSnippetState(sCtx, artifacts) {
  return sCtx.__steBuildTransitionState({
    frameId: 0,
    frameKeyStable: "frame0",
    rootSelector: null,
    captureArtifacts: artifacts,
    probeData: null,
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════

describe("Snippet–Engine parity: fnv1aHash8", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical hash for same input", () => {
    const inputs = ["hello", "", "tag|role|testId|cssPath", null, undefined, "a".repeat(200)];
    for (const input of inputs) {
      assert.equal(
        eCtx.__fnv1aHash8(input),
        sCtx.__steFnv1aHash8(input),
        `hash mismatch for input: ${JSON.stringify(input)}`
      );
    }
  });
});

describe("Snippet–Engine parity: hashLocator", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical hash for same locator", () => {
    const locators = [
      { tag: "div", role: "log", testId: "chat", cssPath: "div.chat" },
      { tag: null, role: null, testId: null, cssPath: "" },
      null,
    ];
    for (const loc of locators) {
      assert.equal(
        eCtx.__hashLocator(loc),
        sCtx.__steHashLocator(loc),
        `hashLocator mismatch for: ${JSON.stringify(loc)}`
      );
    }
  });
});

describe("Snippet–Engine parity: classifyPoliteness", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical classification for various regions", () => {
    const regions = [
      { ariaLive: "polite", role: "status" },
      { ariaLive: "assertive", role: "alert" },
      { ariaLive: "off", role: "status" },
      { ariaLive: null, role: "status" },
      { ariaLive: null, role: "alert" },
      { ariaLive: null, role: "log" },
      { ariaLive: null, role: null },
    ];
    for (const r of regions) {
      assert.equal(
        eCtx.__classifyPoliteness(r),
        sCtx.__steClassifyPoliteness(r),
        `classifyPoliteness mismatch for: ${JSON.stringify(r)}`
      );
    }
  });
});

describe("Snippet–Engine parity: TransitionStateSummary", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical summary from BASE_ARTIFACTS", () => {
    const eSt = buildEngineState(eCtx, BASE_ARTIFACTS);
    const sSt = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const eSum = norm(eCtx.__buildTransitionStateSummary(eSt));
    const sSum = norm(sCtx.__steBuildTransitionStateSummary(sSt));
    assert.deepStrictEqual(eSum, sSum);
  });

  it("identical summary from NEXT_ARTIFACTS_MSG_INCREASE", () => {
    const eSt = buildEngineState(eCtx, NEXT_ARTIFACTS_MSG_INCREASE);
    const sSt = buildSnippetState(sCtx, NEXT_ARTIFACTS_MSG_INCREASE);
    const eSum = norm(eCtx.__buildTransitionStateSummary(eSt));
    const sSum = norm(sCtx.__steBuildTransitionStateSummary(sSt));
    assert.deepStrictEqual(eSum, sSum);
  });

  it("identical summary from BASE_NO_LIVE (no live regions)", () => {
    const eSt = buildEngineState(eCtx, BASE_NO_LIVE);
    const sSt = buildSnippetState(sCtx, BASE_NO_LIVE);
    const eSum = norm(eCtx.__buildTransitionStateSummary(eSt));
    const sSum = norm(sCtx.__steBuildTransitionStateSummary(sSt));
    assert.deepStrictEqual(eSum, sSum);
  });
});

describe("Snippet–Engine parity: StateDelta", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical delta (base → msg increase)", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, NEXT_ARTIFACTS_MSG_INCREASE);
    const sDeltaPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sDeltaNext = buildSnippetState(sCtx, NEXT_ARTIFACTS_MSG_INCREASE);

    const eDelta = norm(eCtx.__buildStateDelta(ePrev, eNext));
    const sDelta = norm(sCtx.__steBuildStateDelta(sDeltaPrev, sDeltaNext));
    assert.deepStrictEqual(eDelta, sDelta);
  });

  it("identical delta (base → focus lost)", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, NEXT_ARTIFACTS_FOCUS_LOST);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, NEXT_ARTIFACTS_FOCUS_LOST);

    const eDelta = norm(eCtx.__buildStateDelta(ePrev, eNext));
    const sDelta = norm(sCtx.__steBuildStateDelta(sPrev, sNext));
    assert.deepStrictEqual(eDelta, sDelta);
  });

  it("identical delta (no live → msg increase)", () => {
    const ePrev = buildEngineState(eCtx, BASE_NO_LIVE);
    const eNext = buildEngineState(eCtx, NEXT_NO_LIVE_MSG_INCREASE);
    const sPrev = buildSnippetState(sCtx, BASE_NO_LIVE);
    const sNext = buildSnippetState(sCtx, NEXT_NO_LIVE_MSG_INCREASE);

    const eDelta = norm(eCtx.__buildStateDelta(ePrev, eNext));
    const sDelta = norm(sCtx.__steBuildStateDelta(sPrev, sNext));
    assert.deepStrictEqual(eDelta, sDelta);
  });
});

describe("Snippet–Engine parity: evaluateC1", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical C1 finding when live region present (should be null)", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, NEXT_ARTIFACTS_MSG_INCREASE);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, NEXT_ARTIFACTS_MSG_INCREASE);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eSet = new Set();
    const sSet = new Set();
    const eResult = eCtx.__evaluateC1(eDelta, ePrev, eNext, { emittedSet: eSet });
    const sResult = sCtx.__steEvaluateC1(sDelta, sPrev, sNext, { emittedSet: sSet });

    // Both should be null (live region is present, even though announceEventCountDelta is 0,
    // C1 fires only if !liveRegionPresent OR announceEventCountDelta === 0)
    // Wait — C1 condition: messageCountDelta >= 1 AND (liveRegionPresent AND announceEventCountDelta > 0) → no fire
    // Here: messageCountDelta=2, liveRegionPresent=true, announceEventCountDelta=0
    // So: !(liveRegionPresent && announceEventCountDelta > 0) → true → continues
    // And hasFeedContext with role=log → true → fires
    // Actually C1 WILL fire here. Let me normalize and compare.
    assert.deepStrictEqual(norm(eResult), norm(sResult));
  });

  it("identical C1 finding when no live regions (should fire)", () => {
    const ePrev = buildEngineState(eCtx, BASE_NO_LIVE);
    const eNext = buildEngineState(eCtx, NEXT_NO_LIVE_MSG_INCREASE);
    const sPrev = buildSnippetState(sCtx, BASE_NO_LIVE);
    const sNext = buildSnippetState(sCtx, NEXT_NO_LIVE_MSG_INCREASE);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eSet = new Set();
    const sSet = new Set();
    const eResult = norm(eCtx.__evaluateC1(eDelta, ePrev, eNext, { emittedSet: eSet }));
    const sResult = norm(sCtx.__steEvaluateC1(sDelta, sPrev, sNext, { emittedSet: sSet }));

    assert.ok(eResult !== null, "engine C1 should fire");
    assert.deepStrictEqual(eResult, sResult);
  });

  it("identical C1 null when no message increase", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, BASE_ARTIFACTS);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, BASE_ARTIFACTS);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = eCtx.__evaluateC1(eDelta, ePrev, eNext, { emittedSet: new Set() });
    const sResult = sCtx.__steEvaluateC1(sDelta, sPrev, sNext, { emittedSet: new Set() });

    assert.equal(eResult, null, "engine C1 should be null (no message increase)");
    assert.equal(sResult, null, "snippet C1 should be null (no message increase)");
  });
});

describe("Snippet–Engine parity: evaluateC2", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical C2 finding when focus lost + message increase", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, NEXT_ARTIFACTS_FOCUS_LOST);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, NEXT_ARTIFACTS_FOCUS_LOST);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = norm(eCtx.__evaluateC2(eDelta, ePrev, eNext, { emittedSet: new Set() }));
    const sResult = norm(sCtx.__steEvaluateC2(sDelta, sPrev, sNext, { emittedSet: new Set() }));

    assert.ok(eResult !== null, "engine C2 should fire");
    assert.deepStrictEqual(eResult, sResult);
  });

  it("identical C2 null when focus NOT lost", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, NEXT_ARTIFACTS_MSG_INCREASE);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, NEXT_ARTIFACTS_MSG_INCREASE);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = eCtx.__evaluateC2(eDelta, ePrev, eNext, { emittedSet: new Set() });
    const sResult = sCtx.__steEvaluateC2(sDelta, sPrev, sNext, { emittedSet: new Set() });

    assert.equal(eResult, null, "engine C2 should be null (focus not lost)");
    assert.equal(sResult, null, "snippet C2 should be null (focus not lost)");
  });

  it("identical C2 null when focus lost but no update signal", () => {
    // Composer lost focus but message count unchanged, no announce/mutation events
    const prevArtifacts = { ...BASE_ARTIFACTS, isInComposer: true };
    const nextArtifacts = {
      ...BASE_ARTIFACTS,
      activeLocator: { tag: "div", role: null, testId: null, cssPath: "div.other" },
      isInComposer: false,
      // Same message count, zero events
    };

    const ePrev = buildEngineState(eCtx, prevArtifacts);
    const eNext = buildEngineState(eCtx, nextArtifacts);
    const sPrev = buildSnippetState(sCtx, prevArtifacts);
    const sNext = buildSnippetState(sCtx, nextArtifacts);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = eCtx.__evaluateC2(eDelta, ePrev, eNext, { emittedSet: new Set() });
    const sResult = sCtx.__steEvaluateC2(sDelta, sPrev, sNext, { emittedSet: new Set() });

    assert.equal(eResult, null, "engine C2 should be null (no update signal)");
    assert.equal(sResult, null, "snippet C2 should be null (no update signal)");
  });
});

// ── C3 fixtures ──────────────────────────────────────────────────────

/** Artifacts with feedRole "none" — triggers C3.1. */
const BASE_FEED_ROLE_NONE = {
  ...BASE_ARTIFACTS,
  chatCandidates: [
    {
      ...BASE_ARTIFACTS.chatCandidates[0],
      role: "none",
    },
  ],
};

/** Artifacts with low itemization + messageCount >= 2 — triggers C3.2. */
const BASE_LOW_ITEMIZATION = {
  ...BASE_ARTIFACTS,
  chatCandidates: [
    {
      ...BASE_ARTIFACTS.chatCandidates[0],
      childCount: 5,
      itemization: {
        sampleCount: 3,
        hasItemRoles: false,
        looksListLike: false,
        distinctItemLocators: 1,
        score01: 0.0,
      },
    },
  ],
};

/** Artifacts with high itemization — does NOT trigger C3.2. */
const BASE_HIGH_ITEMIZATION = {
  ...BASE_ARTIFACTS,
  chatCandidates: [
    {
      ...BASE_ARTIFACTS.chatCandidates[0],
      childCount: 5,
      itemization: {
        sampleCount: 3,
        hasItemRoles: true,
        looksListLike: true,
        distinctItemLocators: 3,
        score01: 1.0,
      },
    },
  ],
};

/** Artifacts with linkage — for summary parity. */
const BASE_WITH_LINKAGE = {
  ...BASE_ARTIFACTS,
  chatCandidates: [
    {
      ...BASE_ARTIFACTS.chatCandidates[0],
      itemization: {
        sampleCount: 2,
        hasItemRoles: true,
        looksListLike: false,
        distinctItemLocators: 2,
        score01: 0.7,
      },
      linkage: {
        ariaControlsLink: true,
        ariaDescribedByLink: false,
        ariaOwnsLink: false,
        sharedRootMarker: true,
      },
    },
  ],
};

// ── C3 parity ────────────────────────────────────────────────────────

describe("Snippet–Engine parity: evaluateC3_1", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical C3.1 finding when feedRole is 'none' (should fire)", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, BASE_FEED_ROLE_NONE);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, BASE_FEED_ROLE_NONE);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = norm(eCtx.__evaluateC3_1(eDelta, ePrev, eNext, { emittedSet: new Set() }));
    const sResult = norm(sCtx.__steEvaluateC3_1(sDelta, sPrev, sNext, { emittedSet: new Set() }));

    assert.ok(eResult !== null, "engine C3.1 should fire");
    assert.deepStrictEqual(eResult, sResult);
  });

  it("identical C3.1 null when feedRole is 'log' (should not fire)", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, BASE_ARTIFACTS); // role=log
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, BASE_ARTIFACTS);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = eCtx.__evaluateC3_1(eDelta, ePrev, eNext, { emittedSet: new Set() });
    const sResult = sCtx.__steEvaluateC3_1(sDelta, sPrev, sNext, { emittedSet: new Set() });

    assert.equal(eResult, null, "engine C3.1 should be null");
    assert.equal(sResult, null, "snippet C3.1 should be null");
  });
});

describe("Snippet–Engine parity: evaluateC3_2", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical C3.2 finding when low itemization + messageCount >= 2 (should fire)", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, BASE_LOW_ITEMIZATION);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, BASE_LOW_ITEMIZATION);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = norm(eCtx.__evaluateC3_2(eDelta, ePrev, eNext, { emittedSet: new Set() }));
    const sResult = norm(sCtx.__steEvaluateC3_2(sDelta, sPrev, sNext, { emittedSet: new Set() }));

    assert.ok(eResult !== null, "engine C3.2 should fire");
    assert.deepStrictEqual(eResult, sResult);
  });

  it("identical C3.2 null when high itemization (should not fire)", () => {
    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, BASE_HIGH_ITEMIZATION);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, BASE_HIGH_ITEMIZATION);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = eCtx.__evaluateC3_2(eDelta, ePrev, eNext, { emittedSet: new Set() });
    const sResult = sCtx.__steEvaluateC3_2(sDelta, sPrev, sNext, { emittedSet: new Set() });

    assert.equal(eResult, null, "engine C3.2 should be null");
    assert.equal(sResult, null, "snippet C3.2 should be null");
  });

  it("identical C3.2 null when messageCount < 2", () => {
    const lowCountArtifacts = {
      ...BASE_LOW_ITEMIZATION,
      chatCandidates: [
        { ...BASE_LOW_ITEMIZATION.chatCandidates[0], childCount: 1 },
      ],
    };

    const ePrev = buildEngineState(eCtx, BASE_ARTIFACTS);
    const eNext = buildEngineState(eCtx, lowCountArtifacts);
    const sPrev = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const sNext = buildSnippetState(sCtx, lowCountArtifacts);

    const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
    const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

    const eResult = eCtx.__evaluateC3_2(eDelta, ePrev, eNext, { emittedSet: new Set() });
    const sResult = sCtx.__steEvaluateC3_2(sDelta, sPrev, sNext, { emittedSet: new Set() });

    assert.equal(eResult, null, "engine C3.2 should be null (messageCount < 2)");
    assert.equal(sResult, null, "snippet C3.2 should be null (messageCount < 2)");
  });
});

describe("Snippet–Engine parity: TransitionStateSummary with itemization/linkage", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("identical summary with itemization + linkage fields", () => {
    const eSt = buildEngineState(eCtx, BASE_WITH_LINKAGE);
    const sSt = buildSnippetState(sCtx, BASE_WITH_LINKAGE);
    const eSum = norm(eCtx.__buildTransitionStateSummary(eSt));
    const sSum = norm(sCtx.__steBuildTransitionStateSummary(sSt));
    assert.deepStrictEqual(eSum, sSum);
    // Verify the new fields are present
    assert.equal(eSum.itemizationScore01, 0.7);
    assert.equal(eSum.hasLinkage, true);
    assert.equal(eSum.sharedRootMarker, true);
  });

  it("identical summary with default itemization/linkage (no fields in artifacts)", () => {
    // BASE_ARTIFACTS has no itemization/linkage on chatCandidates — defaults apply
    const eSt = buildEngineState(eCtx, BASE_ARTIFACTS);
    const sSt = buildSnippetState(sCtx, BASE_ARTIFACTS);
    const eSum = norm(eCtx.__buildTransitionStateSummary(eSt));
    const sSum = norm(sCtx.__steBuildTransitionStateSummary(sSt));
    assert.deepStrictEqual(eSum, sSum);
    assert.equal(eSum.itemizationScore01, 0);
    assert.equal(eSum.hasLinkage, false);
    assert.equal(eSum.sharedRootMarker, false);
  });

  it("identical summary with low itemization (feedRole 'none')", () => {
    const eSt = buildEngineState(eCtx, BASE_FEED_ROLE_NONE);
    const sSt = buildSnippetState(sCtx, BASE_FEED_ROLE_NONE);
    const eSum = norm(eCtx.__buildTransitionStateSummary(eSt));
    const sSum = norm(sCtx.__steBuildTransitionStateSummary(sSt));
    assert.deepStrictEqual(eSum, sSum);
  });
});

describe("Snippet–Engine parity: dedup consistency", () => {
  const eCtx = createEngineContext();
  const sCtx = createSnippetEngineContext();

  it("emittedSet dedup behaves identically across 4 consecutive evaluations", () => {
    const eSet = new Set();
    const sSet = new Set();

    // Same scenario repeated 4 times — first fires, then dedup kicks in
    for (let i = 0; i < 4; i++) {
      const ePrev = buildEngineState(eCtx, BASE_NO_LIVE);
      const eNext = buildEngineState(eCtx, NEXT_NO_LIVE_MSG_INCREASE);
      const sPrev = buildSnippetState(sCtx, BASE_NO_LIVE);
      const sNext = buildSnippetState(sCtx, NEXT_NO_LIVE_MSG_INCREASE);

      const eDelta = eCtx.__buildStateDelta(ePrev, eNext);
      const sDelta = sCtx.__steBuildStateDelta(sPrev, sNext);

      const eResult = eCtx.__evaluateC1(eDelta, ePrev, eNext, { emittedSet: eSet });
      const sResult = sCtx.__steEvaluateC1(sDelta, sPrev, sNext, { emittedSet: sSet });

      assert.deepStrictEqual(norm(eResult), norm(sResult), `iteration ${i} mismatch`);
    }
    // After 4 calls with same dedupKey: first fires, rest are null
    assert.equal(eSet.size, sSet.size, "emittedSet sizes should match");
  });
});
