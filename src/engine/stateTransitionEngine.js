/**
 * stateTransitionEngine.js — Pure State Transition Engine for Depth 3 rules.
 *
 * No DOM access, no imports. Operates on capture artifacts only.
 * Functions are deterministic: same input → identical output.
 *
 * Deterministic definitions:
 *   liveRegionPresent — within root scope, exists at least one element with
 *     aria-live != "off" OR role="status"/"alert". Do NOT treat role="log"/
 *     "feed" as live region automatically unless aria-live is present.
 *   announceEventCount — number of observed mutation events affecting live
 *     region candidate elements. Counters only (no timestamps, no samples).
 *     Window is the bounded observe/watch tick window.
 */

// ── Constants ────────────────────────────────────────────────────────────────
const STE_MAX_LIVE_REGIONS = 5;
const STE_MAX_CANDIDATES = 3;

// ── FNV-1a hash (same algorithm as sw.js / panel.js) ─────────────────────────
function fnv1aHash8(input) {
  const s = String(input ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

// ── Locator ──────────────────────────────────────────────────────────────────
// { tag: string|null, role: string|null, testId: string|null, cssPath: string }
// Deliberately excludes: name, aria-label, textContent (privacy + determinism).

function buildLocator(artifact) {
  if (!artifact) return null;
  return {
    tag: artifact.tag ? String(artifact.tag).toLowerCase() : null,
    role: artifact.role ? String(artifact.role) : null,
    testId: artifact.testId ? String(artifact.testId) : null,
    cssPath: artifact.cssPath ? String(artifact.cssPath) : "",
  };
}

function hashLocator(locator) {
  if (!locator) return "00000000";
  return fnv1aHash8(
    [locator.tag, locator.role, locator.testId, locator.cssPath].join("|")
  );
}

// ── buildTransitionState ─────────────────────────────────────────────────────

function buildTransitionState({ frameId, frameKeyStable, rootSelector, captureArtifacts, probeData }) {
  const ca = captureArtifacts || {};
  const candidates = Array.isArray(ca.chatCandidates)
    ? ca.chatCandidates.slice(0, STE_MAX_CANDIDATES)
    : [];
  const liveRegions = Array.isArray(ca.liveRegions)
    ? ca.liveRegions.slice(0, STE_MAX_LIVE_REGIONS)
    : [];

  const capped =
    (Array.isArray(ca.chatCandidates) && ca.chatCandidates.length > STE_MAX_CANDIDATES) ||
    (Array.isArray(ca.liveRegions) && ca.liveRegions.length > STE_MAX_LIVE_REGIONS);

  // Pick best feed candidate: first with role=log/feed, else first with aria-live
  let feedCandidate = null;
  for (const c of candidates) {
    const r = c.role ? String(c.role).toLowerCase() : "";
    if (r === "log" || r === "feed") { feedCandidate = c; break; }
  }
  if (!feedCandidate && candidates.length > 0) feedCandidate = candidates[0];

  const feedLocator = feedCandidate ? buildLocator(feedCandidate.locator || feedCandidate) : null;
  const feedRole = feedCandidate
    ? (function () {
        const r = (feedCandidate.role || "").toLowerCase();
        if (r === "log") return "log";
        if (r === "feed") return "feed";
        return "none";
      })()
    : "unknown";

  const messageCount = feedCandidate
    ? (typeof feedCandidate.childCount === "number" ? feedCandidate.childCount : 0)
    : 0;

  const lastChild = feedCandidate && feedCandidate.lastChildLocator
    ? buildLocator(feedCandidate.lastChildLocator)
    : null;

  const activeLocator = ca.activeLocator ? buildLocator(ca.activeLocator) : null;

  // Itemization (from capture artifacts)
  const rawItem = (feedCandidate && feedCandidate.itemization) || {};
  const itemization = {
    sampleCount: typeof rawItem.sampleCount === "number" ? rawItem.sampleCount : 0,
    hasItemRoles: !!rawItem.hasItemRoles,
    looksListLike: !!rawItem.looksListLike,
    distinctItemLocators: typeof rawItem.distinctItemLocators === "number" ? rawItem.distinctItemLocators : 0,
    score01: typeof rawItem.score01 === "number" ? rawItem.score01 : 0,
  };

  // Linkage (from capture artifacts)
  const rawLink = (feedCandidate && feedCandidate.linkage) || {};
  const linkage = {
    ariaControlsLink: !!rawLink.ariaControlsLink,
    ariaDescribedByLink: !!rawLink.ariaDescribedByLink,
    ariaOwnsLink: !!rawLink.ariaOwnsLink,
    sharedRootMarker: !!rawLink.sharedRootMarker,
  };

  return {
    frameId: frameId ?? 0,
    frameKeyStable: frameKeyStable || "",
    rootSelector: rootSelector || null,

    focus: {
      activeLocator,
      isInComposer: !!ca.isInComposer,
    },

    chat: {
      feedLocator,
      feedRole,
      messageCount,
      lastMessageItemLocator: lastChild,
      itemization,
      linkage,
    },

    live: {
      regions: liveRegions.map(r => ({
        locator: buildLocator(r.locator || r),
        politeness: classifyPoliteness(r),
        atomic: "unknown",
      })),
      observedAnnounceEvents: typeof ca.announceEventCount === "number" ? ca.announceEventCount : 0,
      observedLiveMutations: typeof ca.liveMutationCount === "number" ? ca.liveMutationCount : 0,
    },

    quality: {
      captureMode: ca.captureMode || "observe",
      capped,
    },
  };
}

function classifyPoliteness(region) {
  const al = region.ariaLive ? String(region.ariaLive).toLowerCase() : "";
  if (al === "polite") return "polite";
  if (al === "assertive") return "assertive";
  if (al === "off") return "off";
  const role = region.role ? String(region.role).toLowerCase() : "";
  if (role === "status") return "polite";
  if (role === "alert") return "assertive";
  return "unknown";
}

// ── buildStateDelta ──────────────────────────────────────────────────────────

function buildStateDelta(prevState, nextState) {
  const prev = prevState || {};
  const next = nextState || {};

  const prevFocus = prev.focus || {};
  const nextFocus = next.focus || {};
  const prevChat = prev.chat || {};
  const nextChat = next.chat || {};
  const prevLive = prev.live || {};
  const nextLive = next.live || {};

  const focusChanged =
    hashLocator(prevFocus.activeLocator) !== hashLocator(nextFocus.activeLocator);

  const composerLostFocus =
    !!prevFocus.isInComposer && !nextFocus.isInComposer && focusChanged;

  const messageCountDelta =
    typeof nextChat.messageCount === "number" && typeof prevChat.messageCount === "number"
      ? nextChat.messageCount - prevChat.messageCount
      : 0;

  const announceEventCountDelta =
    (nextLive.observedAnnounceEvents || 0) - (prevLive.observedAnnounceEvents || 0);

  const liveMutationCountDelta =
    (nextLive.observedLiveMutations || 0) - (prevLive.observedLiveMutations || 0);

  // liveRegionPresent: aria-live != "off" OR role="status"/"alert"
  // Do NOT treat role="log"/"feed" as live region unless aria-live present.
  const liveRegionPresent = (nextLive.regions || []).some(r => {
    const p = r.politeness || "unknown";
    return p === "polite" || p === "assertive";
  });

  const announcementsLikelyMissing =
    messageCountDelta >= 1 && announceEventCountDelta === 0 && !liveRegionPresent;

  // Evidence locators
  const feedLocator = nextChat.feedLocator || prevChat.feedLocator || null;
  const composerLocator = composerLostFocus ? (prevFocus.activeLocator || null) : null;
  const liveRegionLocator = (nextLive.regions || []).length > 0
    ? (nextLive.regions[0].locator || null)
    : null;

  // C3/C4 delta fields
  const feedRoleChanged = (prevChat.feedRole || "unknown") !== (nextChat.feedRole || "unknown");

  const prevItem = (prevChat.itemization || {});
  const nextItem = (nextChat.itemization || {});
  const itemizationScoreDelta =
    typeof nextItem.score01 === "number" && typeof prevItem.score01 === "number"
      ? nextItem.score01 - prevItem.score01
      : null;

  return {
    focusChanged,
    composerLostFocus,
    messageCountDelta,
    feedRole: nextChat.feedRole || null,
    announcementsLikelyMissing,
    liveRegionPresent,
    liveMutationCountDelta,
    announceEventCountDelta,
    feedRoleChanged,
    itemizationScoreDelta,
    frameSplitChanged: false,
    evidence: {
      feedLocator,
      composerLocator,
      liveRegionLocator,
    },
  };
}

// ── Rule: C1 — LIVE_CONTENT_NOT_ANNOUNCED (formerly CHAT_NEW_MESSAGE_NOT_ANNOUNCED)

function evaluateC1(delta, prevState, nextState, opts) {
  const o = opts || {};
  const emittedSet = o.emittedSet || null;
  const quality = (nextState || {}).quality || {};

  if (delta.messageCountDelta < 1) return null;

  if (delta.liveRegionPresent && delta.announceEventCountDelta > 0) return null;

  const hasFeedContext =
    delta.feedRole === "log" || delta.feedRole === "feed" ||
    delta.evidence.feedLocator != null;
  if (!hasFeedContext) return null;

  // Dedup
  const evidenceHash = delta.evidence.feedLocator
    ? hashLocator(delta.evidence.feedLocator)
    : "global";
  const dedupKey = "C1:" + ((nextState || {}).frameKeyStable || "") + ":" + evidenceHash;

  if (emittedSet) {
    if (emittedSet.has(dedupKey)) return null;
    let c1Count = 0;
    for (const k of emittedSet) { if (k.startsWith("C1:")) c1Count++; }
    if (c1Count >= 3) return null;
    emittedSet.add(dedupKey);
  }

  // Confidence guardrail
  let severity = "medium";
  let noteSuffix = "";
  if (quality.capped && !delta.evidence.feedLocator) {
    severity = "low";
    noteSuffix = " (reduced confidence: capture capped, evidence locator missing)";
  }

  return {
    type: "LIVE_CONTENT_NOT_ANNOUNCED",
    severity,
    wcag: "4.1.3",
    confidence: "heuristic",
    note: "Live content region received new items but lacks announcement semantics (role=log, role=feed, or aria-live)." + noteSuffix,
    evidenceLocatorHash: evidenceHash,
    evidenceCssPath: delta.evidence.feedLocator ? delta.evidence.feedLocator.cssPath : null,
  };
}

// ── Rule: C2 — INPUT_LOSES_FOCUS_ON_UPDATE (formerly CHAT_INPUT_LOSES_FOCUS_ON_UPDATE)

function evaluateC2(delta, prevState, nextState, opts) {
  const o = opts || {};
  const emittedSet = o.emittedSet || null;
  const quality = (nextState || {}).quality || {};

  if (!delta.composerLostFocus) return null;

  // Tightened trigger: messageCountDelta >= 1 OR announceEventCountDelta >= 1
  // OR (liveMutationCountDelta >= 1 AND feed context exists)
  const hasFeedContext =
    delta.feedRole === "log" || delta.feedRole === "feed" ||
    delta.evidence.feedLocator != null;

  const hasUpdateSignal =
    delta.messageCountDelta >= 1 ||
    delta.announceEventCountDelta >= 1 ||
    (delta.liveMutationCountDelta >= 1 && hasFeedContext);

  if (!hasUpdateSignal) return null;

  // Dedup
  const evidenceHash = delta.evidence.composerLocator
    ? hashLocator(delta.evidence.composerLocator)
    : "global";
  const dedupKey = "C2:" + ((nextState || {}).frameKeyStable || "") + ":" + evidenceHash;

  if (emittedSet) {
    if (emittedSet.has(dedupKey)) return null;
    let c2Count = 0;
    for (const k of emittedSet) { if (k.startsWith("C2:")) c2Count++; }
    if (c2Count >= 3) return null;
    emittedSet.add(dedupKey);
  }

  // Confidence guardrail
  let severity = "medium";
  let noteSuffix = "";
  if (quality.capped && !delta.evidence.composerLocator) {
    severity = "low";
    noteSuffix = " (reduced confidence: capture capped, evidence locator missing)";
  }

  return {
    type: "INPUT_LOSES_FOCUS_ON_UPDATE",
    severity,
    wcag: "2.4.3",
    confidence: "heuristic",
    note: "Input lost focus after a content update; may disrupt typing." + noteSuffix,
    evidenceLocatorHash: evidenceHash,
    evidenceCssPath: delta.evidence.composerLocator ? delta.evidence.composerLocator.cssPath : null,
  };
}

// ── buildTransitionStateSummary ──────────────────────────────────────────────

function buildTransitionStateSummary(state) {
  if (!state) return null;
  const chatLink = (state.chat && state.chat.linkage) || {};
  const chatItem = (state.chat && state.chat.itemization) || {};
  return {
    frameId: state.frameId,
    frameKeyStable: state.frameKeyStable,
    feedLocatorHash: state.chat.feedLocator ? hashLocator(state.chat.feedLocator) : null,
    feedRole: state.chat.feedRole || null,
    messageCount: state.chat.messageCount || 0,
    composerLocatorHash: state.focus.isInComposer && state.focus.activeLocator
      ? hashLocator(state.focus.activeLocator) : null,
    liveRegionCount: (state.live.regions || []).length,
    observedAnnounceEvents: state.live.observedAnnounceEvents || 0,
    observedLiveMutations: state.live.observedLiveMutations || 0,
    captureMode: state.quality.captureMode,
    capped: state.quality.capped,
    itemizationScore01: typeof chatItem.score01 === "number" ? chatItem.score01 : 0,
    hasLinkage: !!(chatLink.ariaControlsLink || chatLink.ariaDescribedByLink || chatLink.ariaOwnsLink),
    sharedRootMarker: !!chatLink.sharedRootMarker,
  };
}

// ── Rule: C3.1 — LIVE_REGION_MISSING_ROLE (formerly CHAT_FEED_MISSING_ROLE)

function evaluateC3_1(delta, prevState, nextState, opts) {
  const o = opts || {};
  const emittedSet = o.emittedSet || null;
  const next = nextState || {};
  const quality = next.quality || {};
  const chat = next.chat || {};

  if (!chat.feedLocator) return null;
  if (chat.feedRole !== "none" && chat.feedRole !== "unknown") return null;

  // Dedup
  const evidenceHash = hashLocator(chat.feedLocator);
  const dedupKey = "C3.1:" + (next.frameKeyStable || "") + ":" + evidenceHash;

  if (emittedSet) {
    if (emittedSet.has(dedupKey)) return null;
    let count = 0;
    for (const k of emittedSet) { if (k.startsWith("C3.1:")) count++; }
    if (count >= 3) return null;
    emittedSet.add(dedupKey);
  }

  let severity = "medium";
  let noteSuffix = "";
  if (quality.capped && !chat.feedLocator) {
    severity = "low";
    noteSuffix = " (reduced confidence: capture capped, evidence locator missing)";
  }

  return {
    type: "LIVE_REGION_MISSING_ROLE",
    severity,
    wcag: "1.3.1",
    confidence: "heuristic",
    note: "Live content container detected but lacks role=\"log\" or role=\"feed\" for assistive technology." + noteSuffix,
    evidenceLocatorHash: evidenceHash,
    evidenceCssPath: chat.feedLocator ? chat.feedLocator.cssPath : null,
  };
}

// ── Rule: C3.2 — LIVE_ITEM_NOT_ITEMIZED (formerly CHAT_MESSAGE_NOT_ITEMIZED)

function evaluateC3_2(delta, prevState, nextState, opts) {
  const o = opts || {};
  const emittedSet = o.emittedSet || null;
  const next = nextState || {};
  const quality = next.quality || {};
  const chat = next.chat || {};
  const item = chat.itemization || {};

  if (!chat.feedLocator) return null;
  if (chat.messageCount < 2) return null;
  if (typeof item.score01 === "number" && item.score01 >= 0.5) return null;

  // Dedup
  const evidenceHash = hashLocator(chat.feedLocator);
  const dedupKey = "C3.2:" + (next.frameKeyStable || "") + ":" + evidenceHash;

  if (emittedSet) {
    if (emittedSet.has(dedupKey)) return null;
    let count = 0;
    for (const k of emittedSet) { if (k.startsWith("C3.2:")) count++; }
    if (count >= 3) return null;
    emittedSet.add(dedupKey);
  }

  let severity = "low";
  let noteSuffix = "";
  if (quality.capped && !chat.feedLocator) {
    severity = "low";
    noteSuffix = " (reduced confidence: capture capped, evidence locator missing)";
  }

  return {
    type: "LIVE_ITEM_NOT_ITEMIZED",
    severity,
    wcag: "1.3.1",
    confidence: "heuristic",
    note: "Live region items are not represented with semantic item roles (article, listitem)." + noteSuffix,
    evidenceLocatorHash: evidenceHash,
    evidenceCssPath: chat.feedLocator ? chat.feedLocator.cssPath : null,
  };
}

// ── mergeFrameIntegrity — cross-frame merge ──────────────────────────────────

function mergeFrameIntegrity(frameSummaries) {
  const frames = Array.isArray(frameSummaries) ? frameSummaries : [];

  let feedFrameId = null;
  let feedLocatorHash = null;
  let bestMessageCount = -1;
  let composerFrameId = null;
  let composerLocatorHash = null;
  const liveFrameIds = [];
  let hasLinkage = false;
  let sharedRootMarker = false;
  let totalMessageCount = 0;
  let totalAnnounceEvents = 0;
  let totalMessageCountDelta = 0;
  let totalAnnounceEventsDelta = 0;

  for (const f of frames) {
    const sums = Array.isArray(f.summaries) ? f.summaries : [];
    if (sums.length === 0) continue;

    const last = sums[sums.length - 1];
    const secondLast = sums.length >= 2 ? sums[sums.length - 2] : null;

    // Per-frame deltas
    const msgDelta = secondLast != null
      ? (last.messageCount || 0) - (secondLast.messageCount || 0)
      : 0;
    const annDelta = secondLast != null
      ? (last.observedAnnounceEvents || 0) - (secondLast.observedAnnounceEvents || 0)
      : 0;

    totalMessageCountDelta += msgDelta;
    totalAnnounceEventsDelta += annDelta;

    // Feed frame: highest messageCount with feedLocatorHash
    if (last.feedLocatorHash && (last.messageCount || 0) > bestMessageCount) {
      bestMessageCount = last.messageCount || 0;
      feedFrameId = f.frameId;
      feedLocatorHash = last.feedLocatorHash;
    }

    totalMessageCount += last.messageCount || 0;
    totalAnnounceEvents += last.observedAnnounceEvents || 0;

    // Composer frame
    if (last.composerLocatorHash && composerFrameId == null) {
      composerFrameId = f.frameId;
      composerLocatorHash = last.composerLocatorHash;
    }

    // Live region frames
    if ((last.liveRegionCount || 0) > 0) {
      liveFrameIds.push(f.frameId);
    }

    // Linkage (OR across frames)
    if (last.hasLinkage) hasLinkage = true;
    if (last.sharedRootMarker) sharedRootMarker = true;
  }

  return {
    feedFrameId,
    composerFrameId,
    liveFrameIds,
    feedLocatorHash,
    composerLocatorHash,
    hasLinkage,
    sharedRootMarker,
    messageCount: totalMessageCount,
    observedAnnounceEvents: totalAnnounceEvents,
    messageCountDelta: totalMessageCountDelta,
    announceEventsDelta: totalAnnounceEventsDelta,
  };
}

// ── Rule: C4.1 — ANNOUNCEMENT_IN_DIFFERENT_FRAME ─────────────────────────────

function evaluateC4_1(integrity, opts) {
  const o = opts || {};
  const emittedSet = o.emittedSet || null;
  const i = integrity || {};

  // Transition gating
  if ((i.messageCountDelta || 0) < 1 && (i.announceEventsDelta || 0) < 1) return null;

  if (i.feedFrameId == null) return null;
  if (!Array.isArray(i.liveFrameIds) || i.liveFrameIds.length === 0) return null;
  if ((i.messageCount || 0) < 1) return null;

  // Check split: no overlap between liveFrameIds and feedFrameId
  const hasOverlap = i.liveFrameIds.some(id => id === i.feedFrameId);
  if (hasOverlap) return null;

  // Dedup
  const sortedLive = [...i.liveFrameIds].sort();
  const dedupKey = "C4.1:" + i.feedFrameId + ":" + sortedLive.join(",");

  if (emittedSet) {
    if (emittedSet.has(dedupKey)) return null;
    let count = 0;
    for (const k of emittedSet) { if (k.startsWith("C4.1:")) count++; }
    if (count >= 3) return null;
    emittedSet.add(dedupKey);
  }

  return {
    type: "ANNOUNCEMENT_IN_DIFFERENT_FRAME",
    severity: "medium",
    wcag: "4.1.3",
    confidence: "heuristic",
    note: "Live region announcements detected in a different frame than the chat feed.",
    el: null,
  };
}

// ── Rule: C4.2 — COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE ─────────────────────

function evaluateC4_2(integrity, opts) {
  const o = opts || {};
  const emittedSet = o.emittedSet || null;
  const i = integrity || {};

  if (i.composerFrameId == null) return null;
  if (i.feedFrameId == null) return null;
  if (i.composerFrameId === i.feedFrameId) return null;
  if (i.hasLinkage) return null;

  // Dedup
  const dedupKey = "C4.2:" + i.feedFrameId + ":" + i.composerFrameId;

  if (emittedSet) {
    if (emittedSet.has(dedupKey)) return null;
    let count = 0;
    for (const k of emittedSet) { if (k.startsWith("C4.2:")) count++; }
    if (count >= 3) return null;
    emittedSet.add(dedupKey);
  }

  return {
    type: "COMPOSER_AND_FEED_SPLIT_WITHOUT_LINKAGE",
    severity: "medium",
    wcag: "1.3.1",
    confidence: "heuristic",
    note: "Composer and chat feed are in different frames without ARIA linkage (aria-controls, aria-describedby, aria-owns).",
    el: null,
  };
}
