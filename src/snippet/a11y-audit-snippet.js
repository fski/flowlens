/**
 * A11YFlowAudit — console snippet for quick WCAG-ish audits (with chat/help-center specifics) by @fski
 *
 * What it is
 * - A single, paste-once snippet you can share with the team.
 * - Runs lightweight static checks (names/labels/aria refs/headings/landmarks/tabindex, etc.)
 * - Adds flow checks for loader chains + focus loss (great for “multiple loaders in a row” pain).
 * - Adds chat-aware “soft” checks: role=log behavior + aria-live/status hook detection (so we don’t shout
 *   about missing aria-live if you’re doing manual announcements via a hidden live region).
 * - Includes a heuristic keyboard order walk + an approximate contrast scan.
 *
 * What it is NOT
 * - Not a replacement for axe/Lighthouse/manual testing.
 * - Contrast scan is approximate (won’t handle gradients/images perfectly).
 * - tabWalk is heuristic (still catches many real-world issues: focus falling to body, focus failures, etc.)
 *
 * How to use (copy/paste once in DevTools Console)
 * 1) Paste this whole snippet and hit Enter. You should see:
 *    ✅ A11YFlowAudit installed ...
 *
 * 2) Run a static audit any time:
 *    A11YFlowAudit.run({ strict: true })
 *
 * 3) During loader-heavy flows, run flow monitors:
 *    A11YFlowAudit.observe({ seconds: 12 })   // reruns checks every ~900ms for 12s
 *    A11YFlowAudit.watch({ seconds: 40 })     // measures loader bursts, silent loading, focus loss
 *
 * 4) Keyboard focus heuristic:
 *    A11YFlowAudit.tabWalk({ steps: 80 })
 *
 * 5) Approx contrast scan:
 *    A11YFlowAudit.contrastScan({ limit: 250 })
 *
 * Output
 * - Each command prints a table summary + logs raw data.
 * - Latest result objects are stored on:
 *   A11YFlowAudit.last / lastObserved / lastWatch / lastTabWalk / lastContrast
 *
 * Tips for your environment (iframe / microfrontend)
 * - If you open the “direct iframe URL”, that page is the iframe content (inIframe=false). This script still works.
 * - If you’re inside a parent page that embeds an iframe, you can only audit inside the iframe if same-origin and
 *   you run the snippet in the iframe’s DevTools context.
 *
 * Questions? If you must, reach me on Slack @fski.
 */
(() => {
  const KEY = "A11YFlowAudit";
  const w = window;
  const doc = document;

  // ---------------- constants ----------------
  const MAX_SHADOW_SCOPES = 50;
  const MAX_SHADOW_DEPTH = 5;
  const MAX_ANNOTATIONS = 100;
  const ANNOTATION_CONTAINER_ID = "__flowlens_annotations__";
  const ANNOTATION_CLASS = "__flowlens_marker__";
  const MAX_TAG_CANDIDATES = 50;
  // Tab-stops path overlay (inspired by Accessibility Insights' tab-stops visualization; native impl)
  const TAB_PATH_CONTAINER_ID = "__flowlens_tab_path__";
  const MAX_TAB_PATH_BADGES = 80;
  const TAB_PATH_ACCENT = "#7BB85E";
  const TAB_PATH_BLOCKED_COLOR = "#DB5A5A";
  // Mirrors TAB_BLOCKING_EVENT_TYPES in src/sw/sw.js
  const TAB_PATH_BLOCKING_TYPES = new Set([
    "possible_focus_trap",
    "non_dialog_focus_trap",
    "roach_motel",
    "dialog_focus_not_trapped",
    "focus_on_body",
    "focus_failed",
  ]);
  // Assist toolbox — WCAG stress-test toggles + vision simulators
  // (inspired by ARC Toolkit's text-spacing stress test and Stark/Colorblindly
  // CVD simulation; implemented natively, no external code or assets).
  const ASSIST_STYLE_ID = "__flowlens_assist_style__";
  const ASSIST_SVG_ID = "__flowlens_assist_svg__";
  const ASSIST_CVD_FILTER_ID = "__flowlens_cvd__";
  // Standard Machado/Brettel-derived full-severity dichromacy matrices
  // (public colorimetry data). Rows produce R'G'B' from RGB; 4th/5th columns
  // are 0 (no alpha mix / no offset); alpha row passes through.
  // Achromatopsia uses Rec. 601 luminance weights on every channel row.
  const ASSIST_CVD_MATRICES = {
    protanopia:
      "0.152286 1.052583 -0.204868 0 0 " +
      "0.114503 0.786281 0.099216 0 0 " +
      "-0.003882 -0.048116 1.051998 0 0 " +
      "0 0 0 1 0",
    deuteranopia:
      "0.367322 0.860646 -0.227968 0 0 " +
      "0.280085 0.672501 0.047413 0 0 " +
      "-0.011820 0.042940 0.968881 0 0 " +
      "0 0 0 1 0",
    tritanopia:
      "1.255528 -0.076749 -0.178779 0 0 " +
      "-0.078411 0.930809 0.147602 0 0 " +
      "0.004733 0.691367 0.303900 0 0 " +
      "0 0 0 1 0",
    achromatopsia:
      "0.299 0.587 0.114 0 0 " +
      "0.299 0.587 0.114 0 0 " +
      "0.299 0.587 0.114 0 0 " +
      "0 0 0 1 0",
  };
  const ASSIST_KINDS = new Set([
    "textSpacing",
    "grayscale",
    "protanopia",
    "deuteranopia",
    "tritanopia",
    "achromatopsia",
  ]);
  // Page structure (landmarks + headings) — inspired by matatk/landmarks and
  // headingsMap (concepts only; implemented natively, no external code).
  // Mirrors STRUCTURE_KINDS in src/sw/sw.js (which additionally allows "clear").
  const STRUCTURE_CONTAINER_ID = "__flowlens_structure__";
  const MAX_STRUCTURE_HEADINGS = 200;
  const MAX_STRUCTURE_LANDMARKS = 100;
  const MAX_A11Y_OUTLINE_NODES = 400;
  const MAX_A11Y_OUTLINE_DEPTH = 3;
  const STRUCTURE_KINDS = new Set(["headings", "landmarks"]);
  const STRUCTURE_HEADING_COLOR = "#5B8DD4";
  const STRUCTURE_LANDMARK_COLOR = "#9A6DD4";
  // Computed landmark roles surfaced by getPageStructure()
  const LANDMARK_ROLES = new Set([
    "main", "nav", "banner", "contentinfo", "complementary", "region", "form", "search",
  ]);
  const LANDMARK_SELECTOR =
    "main,nav,header,footer,aside,form,section,search," +
    "[role='main'],[role='navigation'],[role='banner'],[role='contentinfo']," +
    "[role='complementary'],[role='region'],[role='form'],[role='search']";
  // Element highlight overlay — persistent ring + label chip drawn by
  // highlightTarget()/highlightAll(), removed by clearHighlight().
  // State lives on window (not closure) so a re-injected snippet can still
  // detach the previous instance's scroll/resize listeners.
  const HIGHLIGHT_CONTAINER_ID = "__flowlens_highlight__";
  const HIGHLIGHT_STYLE_ID = "__flowlens_highlight_style__";
  const HIGHLIGHT_STATE_KEY = "__flowlens_hl_state__";
  const MAX_HIGHLIGHT_SPECS = 50;
  // Safety auto-clear: highlights persist until clearHighlight()/next highlight,
  // but never longer than this (protects the page from forgotten overlays).
  const HIGHLIGHT_AUTO_CLEAR_MS = 30000;
  const HIGHLIGHT_ACCENT = "#ff2d95";
  const HIGHLIGHT_SEV_COLORS = {
    critical: "#DB5A5A", high: "#D4864E", medium: "#C4A855",
    low: "#5AB89A", info: "#7A8EA6",
  };

  // ---------------- utils ----------------
  const isEl = (x) => x && x.nodeType === 1;
  const txt = (s, n = 140) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const html = (el, n = 240) => (el?.outerHTML || "").replace(/\s+/g, " ").trim().slice(0, n);
  const nowIso = () => new Date().toISOString();

  const testId = (el) =>
    el?.getAttribute?.("data-testid") ||
    el?.closest?.("[data-testid]")?.getAttribute("data-testid") ||
    null;

  const cssPath = (el) => {
    if (!isEl(el)) return "";
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 9) {
      const id = node.id ? `#${CSS.escape(node.id)}` : "";
      const cls =
        node.classList && node.classList.length
          ? "." + [...node.classList].slice(0, 2).map(c => CSS.escape(c)).join(".")
          : "";
      let nth = "";
      if (!id) {
        const p = node.parentElement;
        if (p) {
          const sib = [...p.children].filter(c => c.tagName === node.tagName);
          if (sib.length > 1) nth = `:nth-of-type(${sib.indexOf(node) + 1})`;
        }
      }
      parts.unshift(`${node.tagName.toLowerCase()}${id}${cls}${nth}`);
      if (id) break;
      node = node.parentElement;
    }
    return parts.join(" > ");
  };

  /**
   * Shadow-aware CSS path with >>> boundary separators.
   * Anchors: #id > [data-testid] > [aria-label] (if <=40 chars, no digits) > tag:nth-of-type.
   * Never uses class names (unstable in SPA re-renders).
   * Max 10 segments. Deterministic for same DOM state.
   */
  const cssPathDeep = (el) => {
    if (!isEl(el)) return "";
    const segments = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && depth < 10) {
      // Check for shadow boundary
      const root = node.getRootNode?.();
      if (root && root instanceof w.ShadowRoot) {
        // Add remaining path inside shadow, then cross boundary
        segments.unshift(buildSegment(node));
        node = root.host;
        if (node) segments.unshift(">>>");
        depth++;
        continue;
      }

      const id = node.id;
      if (id) {
        segments.unshift(`${node.tagName.toLowerCase()}#${CSS.escape(id)}`);
        break;
      }

      const tid = node.getAttribute?.("data-testid");
      if (tid) {
        segments.unshift(`${node.tagName.toLowerCase()}[data-testid="${CSS.escape(tid)}"]`);
        break;
      }

      // aria-label anchor: only if <=40 chars and no digits (reduces instability)
      const ariaLabel = node.getAttribute?.("aria-label") || "";
      if (
        ariaLabel.trim() &&
        ariaLabel.length <= 40 &&
        !/\d/.test(ariaLabel) &&
        !["DIV", "SPAN"].includes(node.tagName)
      ) {
        segments.unshift(`${node.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel.trim())}"]`);
        break;
      }

      segments.unshift(buildSegment(node));
      node = node.parentElement;
      depth++;
    }
    return segments.join(" > ").replace(/ > >>> > /g, " >>> ");
  };

  const buildSegment = (node) => {
    const tag = node.tagName.toLowerCase();
    const p = node.parentElement;
    if (!p) return tag;
    const sib = [...p.children].filter(c => c.tagName === node.tagName);
    if (sib.length > 1) return `${tag}:nth-of-type(${sib.indexOf(node) + 1})`;
    return tag;
  };

  /**
   * Build targeting reference for overlay annotations.
   * Multiple targeting signals for resolveTarget() fallback chain.
   */
  const buildTargetRef = (el) => {
    if (!isEl(el)) return null;
    return {
      cssSelector: cssPath(el),
      testId: testId(el),
      tag: el.tagName?.toLowerCase() || null,
      role: el.getAttribute?.("role") || null,
      name: getAccName ? null : null, // populated after getAccName is defined
      inShadow: !!(el.getRootNode?.() instanceof w.ShadowRoot),
    };
  };

  const commonAncestorDepth = (a, b) => {
    if (!isEl(a) || !isEl(b)) return Infinity;
    const pathA = [];
    let n = a;
    while (n) { pathA.push(n); n = n.parentElement; }
    const setA = new Set(pathA);
    let depth = 0;
    n = b;
    while (n) {
      if (setA.has(n)) return depth;
      depth++;
      n = n.parentElement;
    }
    return Infinity;
  };

  const isHidden = (el) => {
    if (!isEl(el)) return true;
    if (el.hidden) return true;
    const s = w.getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return true;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;
    return false;
  };

  const createPassCache = () => ({
    styles: new WeakMap(),
    rects: new WeakMap(),
    hidden: new WeakMap(),
  });

  const getStyleCached = (el, cache) => {
    if (!cache) return w.getComputedStyle(el);
    if (cache.styles.has(el)) return cache.styles.get(el);
    const style = w.getComputedStyle(el);
    cache.styles.set(el, style);
    return style;
  };

  const getRectCached = (el, cache) => {
    if (!cache) return el.getBoundingClientRect();
    if (cache.rects.has(el)) return cache.rects.get(el);
    const rect = el.getBoundingClientRect();
    cache.rects.set(el, rect);
    return rect;
  };

  const isHiddenCached = (el, cache) => {
    if (!cache) return isHidden(el);
    if (cache.hidden.has(el)) return cache.hidden.get(el);
    let hidden = true;
    if (isEl(el) && !el.hidden) {
      const s = getStyleCached(el, cache);
      if (!(s.display === "none" || s.visibility === "hidden")) {
        const r = getRectCached(el, cache);
        hidden = r.width === 0 || r.height === 0;
      }
    }
    cache.hidden.set(el, hidden);
    return hidden;
  };

  const uniqBy = (arr, k) => {
    const seen = new Set();
    return arr.filter(x => {
      const key = k(x);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  // FIX_SUGGESTIONS moved to panel.js to reduce injected snippet size

  // ──────── State Transition Engine (Depth 3) ────────────────────────────────
  // Inline copy of src/engine/stateTransitionEngine.js pure functions.
  // Parity enforced by test/snippet-engine-parity.test.mjs.
  //
  // Deterministic definitions:
  //   liveRegionPresent — within root scope, exists ≥1 element with
  //     aria-live != "off" OR role="status"/"alert". Do NOT treat role="log"/
  //     "feed" as live region automatically unless aria-live is present.
  //   announceEventCount — number of observed mutation events affecting live
  //     region candidate elements. Counters only (no timestamps, no samples).

  const STE_MAX_LIVE_REGIONS = 5;
  const STE_MAX_CANDIDATES = 3;
  const STE_MAX_FALLBACK_QS = 3;

  const CHAT_CONTAINER_SELECTOR =
    "[role='log'],[role='feed'],[aria-live]:not([aria-live='off'])," +
    "[aria-label*='chat' i],[aria-label*='message' i]";
  const LIVE_REGION_SELECTOR =
    "[aria-live]:not([aria-live='off']),[role='status'],[role='alert']";

  function steFnv1aHash8(input) {
    const s = String(input ?? "");
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
  }

  function steBuildLocator(el) {
    if (!isEl(el)) return null;
    return {
      tag: el.tagName?.toLowerCase() || null,
      role: el.getAttribute?.("role") || null,
      testId: testId(el),
      cssPath: cssPath(el),
    };
  }

  function steHashLocator(loc) {
    if (!loc) return "00000000";
    return steFnv1aHash8([loc.tag, loc.role, loc.testId, loc.cssPath].join("|"));
  }

  // Normalize a plain artifact object to a locator (matches engine buildLocator).
  // Distinct from steBuildLocator which operates on DOM elements.
  function steNormalizeLocator(artifact) {
    if (!artifact) return null;
    return {
      tag: artifact.tag ? String(artifact.tag).toLowerCase() : null,
      role: artifact.role ? String(artifact.role) : null,
      testId: artifact.testId ? String(artifact.testId) : null,
      cssPath: artifact.cssPath ? String(artifact.cssPath) : "",
    };
  }

  function steClassifyPoliteness(region) {
    const al = region.ariaLive ? String(region.ariaLive).toLowerCase() : "";
    if (al === "polite") return "polite";
    if (al === "assertive") return "assertive";
    if (al === "off") return "off";
    const role = region.role ? String(region.role).toLowerCase() : "";
    if (role === "status") return "polite";
    if (role === "alert") return "assertive";
    return "unknown";
  }

  function steBuildTransitionState({ frameId, frameKeyStable, rootSelector, captureArtifacts }) {
    const ca = captureArtifacts || {};
    const candidates = Array.isArray(ca.chatCandidates) ? ca.chatCandidates.slice(0, STE_MAX_CANDIDATES) : [];
    const liveRegions = Array.isArray(ca.liveRegions) ? ca.liveRegions.slice(0, STE_MAX_LIVE_REGIONS) : [];
    const capped =
      (Array.isArray(ca.chatCandidates) && ca.chatCandidates.length > STE_MAX_CANDIDATES) ||
      (Array.isArray(ca.liveRegions) && ca.liveRegions.length > STE_MAX_LIVE_REGIONS);

    let feedCandidate = null;
    for (const c of candidates) {
      const r = c.role ? String(c.role).toLowerCase() : "";
      if (r === "log" || r === "feed") { feedCandidate = c; break; }
    }
    if (!feedCandidate && candidates.length > 0) feedCandidate = candidates[0];

    const feedLocator = feedCandidate ? steNormalizeLocator(feedCandidate.locator || feedCandidate) : null;
    const feedRole = feedCandidate
      ? (function () { const r = (feedCandidate.role || "").toLowerCase(); return r === "log" ? "log" : r === "feed" ? "feed" : "none"; })()
      : "unknown";
    const messageCount = feedCandidate ? (typeof feedCandidate.childCount === "number" ? feedCandidate.childCount : 0) : 0;
    const lastChild = feedCandidate && feedCandidate.lastChildLocator ? steNormalizeLocator(feedCandidate.lastChildLocator) : null;
    const activeLocator = ca.activeLocator ? steNormalizeLocator(ca.activeLocator) : null;

    const rawItem = (feedCandidate && feedCandidate.itemization) || {};
    const itemization = {
      sampleCount: typeof rawItem.sampleCount === "number" ? rawItem.sampleCount : 0,
      hasItemRoles: !!rawItem.hasItemRoles, looksListLike: !!rawItem.looksListLike,
      distinctItemLocators: typeof rawItem.distinctItemLocators === "number" ? rawItem.distinctItemLocators : 0,
      score01: typeof rawItem.score01 === "number" ? rawItem.score01 : 0,
    };
    const rawLink = (feedCandidate && feedCandidate.linkage) || {};
    const linkage = {
      ariaControlsLink: !!rawLink.ariaControlsLink, ariaDescribedByLink: !!rawLink.ariaDescribedByLink,
      ariaOwnsLink: !!rawLink.ariaOwnsLink, sharedRootMarker: !!rawLink.sharedRootMarker,
    };

    return {
      frameId: frameId ?? 0, frameKeyStable: frameKeyStable || "", rootSelector: rootSelector || null,
      focus: { activeLocator, isInComposer: !!ca.isInComposer },
      chat: { feedLocator, feedRole, messageCount, lastMessageItemLocator: lastChild, itemization, linkage },
      live: {
        regions: liveRegions.map(r => ({ locator: steNormalizeLocator(r.locator || r), politeness: steClassifyPoliteness(r), atomic: "unknown" })),
        observedAnnounceEvents: typeof ca.announceEventCount === "number" ? ca.announceEventCount : 0,
        observedLiveMutations: typeof ca.liveMutationCount === "number" ? ca.liveMutationCount : 0,
      },
      quality: { captureMode: ca.captureMode || "observe", capped },
    };
  }

  function steBuildStateDelta(prevState, nextState) {
    const prev = prevState || {}; const next = nextState || {};
    const pf = prev.focus || {}; const nf = next.focus || {};
    const pc = prev.chat || {}; const nc = next.chat || {};
    const pl = prev.live || {}; const nl = next.live || {};

    const focusChanged = steHashLocator(pf.activeLocator) !== steHashLocator(nf.activeLocator);
    const composerLostFocus = !!pf.isInComposer && !nf.isInComposer && focusChanged;
    const messageCountDelta = typeof nc.messageCount === "number" && typeof pc.messageCount === "number"
      ? nc.messageCount - pc.messageCount : 0;
    const announceEventCountDelta = (nl.observedAnnounceEvents || 0) - (pl.observedAnnounceEvents || 0);
    const liveMutationCountDelta = (nl.observedLiveMutations || 0) - (pl.observedLiveMutations || 0);
    const liveRegionPresent = (nl.regions || []).some(r => { const p = r.politeness || "unknown"; return p === "polite" || p === "assertive"; });
    const announcementsLikelyMissing = messageCountDelta >= 1 && announceEventCountDelta === 0 && !liveRegionPresent;

    const feedLocator = nc.feedLocator || pc.feedLocator || null;
    const composerLocator = composerLostFocus ? (pf.activeLocator || null) : null;
    const liveRegionLocator = (nl.regions || []).length > 0 ? (nl.regions[0].locator || null) : null;

    const feedRoleChanged = (pc.feedRole || "unknown") !== (nc.feedRole || "unknown");
    const prevItem = (pc.itemization || {}); const nextItem = (nc.itemization || {});
    const itemizationScoreDelta = typeof nextItem.score01 === "number" && typeof prevItem.score01 === "number"
      ? nextItem.score01 - prevItem.score01 : null;

    return {
      focusChanged, composerLostFocus, messageCountDelta,
      feedRole: nc.feedRole || null,
      announcementsLikelyMissing, liveRegionPresent, liveMutationCountDelta, announceEventCountDelta,
      feedRoleChanged, itemizationScoreDelta, frameSplitChanged: false,
      evidence: { feedLocator, composerLocator, liveRegionLocator },
    };
  }

  function steEvaluateC1(delta, prevState, nextState, opts) {
    const o = opts || {}; const emittedSet = o.emittedSet || null;
    const quality = (nextState || {}).quality || {};
    if (delta.messageCountDelta < 1) return null;
    if (delta.liveRegionPresent && delta.announceEventCountDelta > 0) return null;
    const hasFeedContext = delta.feedRole === "log" || delta.feedRole === "feed" || delta.evidence.feedLocator != null;
    if (!hasFeedContext) return null;

    const evidenceHash = delta.evidence.feedLocator ? steHashLocator(delta.evidence.feedLocator) : "global";
    const dedupKey = "C1:" + ((nextState || {}).frameKeyStable || "") + ":" + evidenceHash;
    if (emittedSet) {
      if (emittedSet.has(dedupKey)) return null;
      let c1Count = 0; for (const k of emittedSet) { if (k.startsWith("C1:")) c1Count++; }
      if (c1Count >= 3) return null;
      emittedSet.add(dedupKey);
    }

    let severity = "medium"; let noteSuffix = "";
    if (quality.capped && !delta.evidence.feedLocator) { severity = "low"; noteSuffix = " (reduced confidence: capture capped, evidence locator missing)"; }

    return { type: "CHAT_NEW_MESSAGE_NOT_ANNOUNCED", severity, wcag: "4.1.3", confidence: "heuristic",
      note: "Chat container received new messages but lacks announcement semantics (role=log, role=feed, or aria-live)." + noteSuffix,
      evidenceLocatorHash: evidenceHash,
      evidenceCssPath: delta.evidence.feedLocator ? delta.evidence.feedLocator.cssPath : null };
  }

  function steEvaluateC2(delta, prevState, nextState, opts) {
    const o = opts || {}; const emittedSet = o.emittedSet || null;
    const quality = (nextState || {}).quality || {};
    if (!delta.composerLostFocus) return null;
    const hasFeedContext = delta.feedRole === "log" || delta.feedRole === "feed" || delta.evidence.feedLocator != null;
    const hasUpdateSignal = delta.messageCountDelta >= 1 || delta.announceEventCountDelta >= 1 ||
      (delta.liveMutationCountDelta >= 1 && hasFeedContext);
    if (!hasUpdateSignal) return null;

    const evidenceHash = delta.evidence.composerLocator ? steHashLocator(delta.evidence.composerLocator) : "global";
    const dedupKey = "C2:" + ((nextState || {}).frameKeyStable || "") + ":" + evidenceHash;
    if (emittedSet) {
      if (emittedSet.has(dedupKey)) return null;
      let c2Count = 0; for (const k of emittedSet) { if (k.startsWith("C2:")) c2Count++; }
      if (c2Count >= 3) return null;
      emittedSet.add(dedupKey);
    }

    let severity = "medium"; let noteSuffix = "";
    if (quality.capped && !delta.evidence.composerLocator) { severity = "low"; noteSuffix = " (reduced confidence: capture capped, evidence locator missing)"; }

    return { type: "CHAT_INPUT_LOSES_FOCUS_ON_UPDATE", severity, wcag: "2.4.3", confidence: "heuristic",
      note: "Chat input lost focus after a content update; may disrupt typing." + noteSuffix,
      evidenceLocatorHash: evidenceHash,
      evidenceCssPath: delta.evidence.composerLocator ? delta.evidence.composerLocator.cssPath : null };
  }

  function steEvaluateC3_1(delta, prevState, nextState, opts) {
    const o = opts || {}; const emittedSet = o.emittedSet || null;
    const next = nextState || {}; const quality = next.quality || {};
    const chat = next.chat || {};
    if (!chat.feedLocator) return null;
    if (chat.feedRole !== "none" && chat.feedRole !== "unknown") return null;

    const evidenceHash = steHashLocator(chat.feedLocator);
    const dedupKey = "C3.1:" + (next.frameKeyStable || "") + ":" + evidenceHash;
    if (emittedSet) {
      if (emittedSet.has(dedupKey)) return null;
      let count = 0; for (const k of emittedSet) { if (k.startsWith("C3.1:")) count++; }
      if (count >= 3) return null;
      emittedSet.add(dedupKey);
    }

    let severity = "medium"; let noteSuffix = "";
    if (quality.capped && !chat.feedLocator) { severity = "low"; noteSuffix = " (reduced confidence: capture capped, evidence locator missing)"; }

    return { type: "CHAT_FEED_MISSING_ROLE", severity, wcag: "1.3.1", confidence: "heuristic",
      note: "Chat feed container detected but lacks role=\"log\" or role=\"feed\" for assistive technology." + noteSuffix,
      evidenceLocatorHash: evidenceHash,
      evidenceCssPath: chat.feedLocator ? chat.feedLocator.cssPath : null };
  }

  function steEvaluateC3_2(delta, prevState, nextState, opts) {
    const o = opts || {}; const emittedSet = o.emittedSet || null;
    const next = nextState || {}; const quality = next.quality || {};
    const chat = next.chat || {}; const item = chat.itemization || {};
    if (!chat.feedLocator) return null;
    if (chat.messageCount < 2) return null;
    if (typeof item.score01 === "number" && item.score01 >= 0.5) return null;

    const evidenceHash = steHashLocator(chat.feedLocator);
    const dedupKey = "C3.2:" + (next.frameKeyStable || "") + ":" + evidenceHash;
    if (emittedSet) {
      if (emittedSet.has(dedupKey)) return null;
      let count = 0; for (const k of emittedSet) { if (k.startsWith("C3.2:")) count++; }
      if (count >= 3) return null;
      emittedSet.add(dedupKey);
    }

    let severity = "low"; let noteSuffix = "";
    if (quality.capped && !chat.feedLocator) { severity = "low"; noteSuffix = " (reduced confidence: capture capped, evidence locator missing)"; }

    return { type: "CHAT_MESSAGE_NOT_ITEMIZED", severity, wcag: "1.3.1", confidence: "heuristic",
      note: "Chat messages are not represented with semantic item roles (article, listitem)." + noteSuffix,
      evidenceLocatorHash: evidenceHash,
      evidenceCssPath: chat.feedLocator ? chat.feedLocator.cssPath : null };
  }

  function steBuildTransitionStateSummary(state) {
    if (!state) return null;
    const chatLink = (state.chat && state.chat.linkage) || {};
    const chatItem = (state.chat && state.chat.itemization) || {};
    return {
      frameId: state.frameId, frameKeyStable: state.frameKeyStable,
      feedLocatorHash: state.chat.feedLocator ? steHashLocator(state.chat.feedLocator) : null,
      feedRole: state.chat.feedRole || null, messageCount: state.chat.messageCount || 0,
      composerLocatorHash: state.focus.isInComposer && state.focus.activeLocator ? steHashLocator(state.focus.activeLocator) : null,
      liveRegionCount: (state.live.regions || []).length,
      observedAnnounceEvents: state.live.observedAnnounceEvents || 0,
      observedLiveMutations: state.live.observedLiveMutations || 0,
      captureMode: state.quality.captureMode, capped: state.quality.capped,
      itemizationScore01: typeof chatItem.score01 === "number" ? chatItem.score01 : 0,
      hasLinkage: !!(chatLink.ariaControlsLink || chatLink.ariaDescribedByLink || chatLink.ariaOwnsLink),
      sharedRootMarker: !!chatLink.sharedRootMarker,
    };
  }

  function steIsComposerElement(el) {
    if (!isEl(el)) return false;
    const tag = (el.tagName || "").toLowerCase();
    const isInput = tag === "textarea" || (tag === "input" && (el.type || "text") === "text");
    if (!isInput) return false;
    return !!el.closest(CHAT_CONTAINER_SELECTOR);
  }

  function steBuildCaptureArtifacts(captureMode, announceCount, mutationCount) {
    const chatContainers = doc.querySelectorAll(CHAT_CONTAINER_SELECTOR);
    const chatCandidates = [];
    for (let ci = 0; ci < Math.min(chatContainers.length, STE_MAX_CANDIDATES); ci++) {
      const c = chatContainers[ci];
      const loc = steBuildLocator(c);
      const cRole = (c.getAttribute("role") || "").toLowerCase();

      // Itemization sampling: up to STE_MAX_CANDIDATES children
      const kids = c.children;
      const sampleCount = Math.min(kids.length, STE_MAX_CANDIDATES);
      let hasItemRoles = false;
      const locHashes = new Set();
      for (let si = 0; si < sampleCount; si++) {
        const kid = kids[si];
        const kr = (kid.getAttribute("role") || "").toLowerCase();
        if (kr === "article" || kr === "listitem") hasItemRoles = true;
        locHashes.add(steHashLocator(steBuildLocator(kid)));
      }
      const feedTag = (c.tagName || "").toLowerCase();
      const looksListLike = feedTag === "ul" || feedTag === "ol" || cRole === "log" || cRole === "feed" || cRole === "list";
      const distinctItemLocators = locHashes.size;
      let score01 = 0;
      if (hasItemRoles) score01 += 0.4;
      if (looksListLike) score01 += 0.3;
      if (distinctItemLocators >= 2) score01 += 0.3;

      // Linkage detection: check feed + composer sides (up to 3 ancestors each)
      let ariaControlsLink = false, ariaDescribedByLink = false, ariaOwnsLink = false;
      const checkLinkageAttrs = (el) => {
        let cur = el;
        for (let ai = 0; ai <= 3 && cur && cur !== doc.body; ai++) {
          if (cur.hasAttribute && cur.hasAttribute("aria-controls")) ariaControlsLink = true;
          if (cur.hasAttribute && cur.hasAttribute("aria-describedby")) ariaDescribedByLink = true;
          if (cur.hasAttribute && cur.hasAttribute("aria-owns")) ariaOwnsLink = true;
          cur = cur.parentElement;
        }
      };
      checkLinkageAttrs(c); // feed side

      chatCandidates.push({ locator: loc, role: c.getAttribute("role") || null,
        ariaLive: c.getAttribute("aria-live") || null,
        childCount: c.children.length,
        lastChildLocator: c.lastElementChild ? steBuildLocator(c.lastElementChild) : null,
        itemization: { sampleCount, hasItemRoles, looksListLike, distinctItemLocators, score01 },
        linkage: { ariaControlsLink, ariaDescribedByLink, ariaOwnsLink, sharedRootMarker: false },
        _el: c });
    }

    const lrEls = doc.querySelectorAll(LIVE_REGION_SELECTOR);
    const liveRegions = [];
    for (let li = 0; li < Math.min(lrEls.length, STE_MAX_LIVE_REGIONS); li++) {
      const r = lrEls[li];
      liveRegions.push({ locator: steBuildLocator(r), ariaLive: r.getAttribute("aria-live") || null,
        role: r.getAttribute("role") || null, _el: r });
    }

    const ae = doc.activeElement;
    const activeEl = ae && ae !== doc.body ? ae : null;
    const activeLocator = activeEl ? steBuildLocator(activeEl) : null;

    return {
      activeLocator, isInComposer: activeEl ? steIsComposerElement(activeEl) : false,
      chatCandidates, liveRegions,
      announceEventCount: announceCount || 0, liveMutationCount: mutationCount || 0,
      captureMode: captureMode || "observe",
      _activeEl: activeEl,
    };
  }

  function steResolveElement(finding, artifacts) {
    if (!finding) return null;
    const hash = finding.evidenceLocatorHash;
    // Build elementMapByHash from artifacts
    const map = new Map();
    for (const c of (artifacts.chatCandidates || [])) {
      if (c._el && c.locator) map.set(steHashLocator(c.locator), c._el);
    }
    for (const r of (artifacts.liveRegions || [])) {
      if (r._el && r.locator) map.set(steHashLocator(r.locator), r._el);
    }
    if (artifacts._activeEl && artifacts.activeLocator) {
      map.set(steHashLocator(artifacts.activeLocator), artifacts._activeEl);
    }

    let el = map.get(hash) || null;
    // Fallback: querySelector with cap
    if (!el && finding.evidenceCssPath && typeof steResolveElement._fallbackCount === "undefined") {
      steResolveElement._fallbackCount = 0;
    }
    if (!el && finding.evidenceCssPath && (steResolveElement._fallbackCount || 0) < STE_MAX_FALLBACK_QS) {
      try { el = doc.querySelector(finding.evidenceCssPath); steResolveElement._fallbackCount = (steResolveElement._fallbackCount || 0) + 1; } catch {}
    }
    return el;
  }

  // ──────── End State Transition Engine ──────────────────────────────────────

  const RULE_REGISTRY = {
    FOCUS_VISIBLE_SUPPRESSED: {
      id: "FOCUS_VISIBLE_SUPPRESSED",
      wcag: "2.4.7",
      level: "AA",
      confidence: "heuristic",
      run: null,
    },
    LOADER_WITHOUT_ANNOUNCEMENT_HOOK: {
      id: "LOADER_WITHOUT_ANNOUNCEMENT_HOOK",
      wcag: "4.1.3",
      level: "AA",
      confidence: "heuristic",
      run: null,
    },
    TOUCH_TARGET_TOO_SMALL: {
      id: "TOUCH_TARGET_TOO_SMALL",
      wcag: "2.5.8",
      wcagVersion: "2.2",
      level: "AA",
      confidence: "heuristic",
      run: null,
    },
    CLICK_WITHOUT_KEYBOARD: {
      id: "CLICK_WITHOUT_KEYBOARD",
      wcag: "2.1.1",
      level: "A",
      confidence: "heuristic",
      run: null,
    },
    FOCUS_MAY_BE_OBSCURED: {
      id: "FOCUS_MAY_BE_OBSCURED",
      wcag: "2.4.11",
      level: "AA",
      confidence: "advisory",
      run: null,
    },
    CONSISTENT_HELP_CHECK: {
      id: "CONSISTENT_HELP_CHECK",
      wcag: "3.2.6",
      level: "A",
      confidence: "advisory",
      run: null,
    },
    ARIA_HIDDEN_FOCUSABLE: {
      id: "ARIA_HIDDEN_FOCUSABLE",
      wcag: "4.1.2",
      level: "A",
      confidence: "strict",
      run: null,
    },
    IFRAME_MISSING_TITLE: {
      id: "IFRAME_MISSING_TITLE",
      wcag: "4.1.2",
      level: "A",
      confidence: "strict",
      run: null,
    },
  };

  // Legacy heuristic accessible-name computation — used when the vendored
  // dom-accessibility-api engine (window.__FlowLensAccName, injected as
  // accname.js before this snippet) is unavailable or throws.
  const getAccNameFallback = (el) => {
    if (!isEl(el)) return "";
    const aria = el.getAttribute("aria-label");
    if (aria?.trim()) return aria.trim();
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map(id => doc.getElementById(id))
        .filter(Boolean)
        .map(n => n.textContent)
        .join(" ");
      if (t.trim()) return t.trim();
    }
    if ("labels" in el && el.labels && el.labels.length) {
      const lbl = [...el.labels].map(l => l.textContent).join(" ");
      if (lbl.trim()) return lbl.trim();
    }
    if (el.tagName === "IMG") {
      const alt = el.getAttribute("alt");
      if (alt?.trim()) return alt.trim();
    }
    const title = el.getAttribute("title");
    if (title?.trim()) return title.trim();
    const ph = el.getAttribute("placeholder");
    if (ph?.trim()) return `[placeholder] ${ph.trim()}`;
    return txt(el.textContent, 160) || "";
  };

  const getAccName = (el) => {
    if (!isEl(el)) return "";
    const engine = typeof window !== "undefined" ? window.__FlowLensAccName : null;
    if (engine && typeof engine.computeAccessibleName === "function") {
      try {
        // Spec-order (accname) computation; keep the snippet's whitespace
        // normalization + truncation behavior (same as the textContent path).
        return txt(engine.computeAccessibleName(el), 160) || "";
      } catch { /* fall through to heuristic */ }
    }
    return getAccNameFallback(el);
  };

  const add = (findings, params) => {
    const { type, el, severity = "low", wcag = null, wcagVersion = null, level = null, confidence = null, product = null, note = null, extra = null, fix = null } = params;
    const ruleMeta = RULE_REGISTRY[type] || null;
    const elName = el ? getAccName(el) : null;
    const entry = {
      type, severity,
      wcag: wcag ?? ruleMeta?.wcag ?? null,
      wcagVersion: wcagVersion ?? ruleMeta?.wcagVersion ?? null,
      level: level ?? ruleMeta?.level ?? null,
      confidence: confidence ?? ruleMeta?.confidence ?? null,
      en301549Clauses: null,  // populated by panel.js post-processing
      product,
      name: elName,
      role: el?.getAttribute?.("role") || null,
      tag: el?.tagName || null,
      testId: el ? testId(el) : null,
      path: el ? cssPath(el) : null,
      pathDeep: el ? cssPathDeep(el) : null,
      html: el ? html(el) : null,
      targetRef: el ? {
        cssSelector: el ? cssPath(el) : null,
        testId: el ? testId(el) : null,
        tag: el?.tagName?.toLowerCase() || null,
        role: el?.getAttribute?.("role") || null,
        name: elName,
        inShadow: !!(el?.getRootNode?.() instanceof w.ShadowRoot),
      } : null,
      note, extra, fix: fix ?? null
    };
    findings.push(entry);
  };

  RULE_REGISTRY.FOCUS_VISIBLE_SUPPRESSED.run = ({ findings }) => {
    const focusHints = (() => {
      const hints = [];
      let scannedRules = 0;
      let inaccessibleSheets = 0;

      const hasVisibleIndicator = (styleDecl) => {
        const outlineStyle = (styleDecl?.outlineStyle || "").toLowerCase();
        const outlineWidth = parseFloat(styleDecl?.outlineWidth) || 0;
        if (outlineStyle && outlineStyle !== "none" && outlineWidth > 0) return true;
        if ((styleDecl?.boxShadow || "").toLowerCase() !== "none" && !!styleDecl?.boxShadow) return true;
        const borderStyle = (styleDecl?.borderStyle || "").toLowerCase();
        const borderWidth = parseFloat(styleDecl?.borderWidth) || 0;
        if (borderStyle && borderStyle !== "none" && borderWidth > 0) return true;
        return /(underline|overline|line-through)/.test((styleDecl?.textDecorationLine || "").toLowerCase());
      };

      const addSelectorHint = (selector, styleDecl) => {
        if (!selector || /::/.test(selector)) return;
        if (!/:(focus-visible|focus)(?![-\w])/i.test(selector)) return;
        const baseSelector = selector
          .replace(/:(focus-visible|focus)(?![-\w])/gi, "")
          .replace(/\s+/g, " ")
          .trim();
        if (!baseSelector) return;
        hints.push({
          baseSelector,
          rawSelector: selector.trim().slice(0, 200),
          hasIndicator: hasVisibleIndicator(styleDecl),
        });
      };

      const walkRules = (rules) => {
        if (!rules) return;
        for (const rule of rules) {
          scannedRules++;
          if (scannedRules > 4000) break;
          if (rule?.type === CSSRule.STYLE_RULE) {
            const selectors = String(rule.selectorText || "").split(",").map(s => s.trim()).filter(Boolean);
            selectors.forEach(sel => addSelectorHint(sel, rule.style));
            continue;
          }
          if (rule?.cssRules && (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE || rule.type === CSSRule.LAYER_BLOCK_RULE)) {
            walkRules(rule.cssRules);
          }
        }
      };

      for (const sheet of [...doc.styleSheets]) {
        try {
          if (sheet?.cssRules) walkRules(sheet.cssRules);
        } catch {
          inaccessibleSheets++;
        }
      }

      return { hints, scannedRules, inaccessibleSheets };
    })();

    const candidates = [...doc.querySelectorAll("a[href],button,[role='button'],[role='link'],[tabindex],input:not([type='hidden']),select,textarea")]
      .filter(isEl)
      .slice(0, 220);

    candidates.forEach(el => {
      if (isHidden(el) || hasInertAncestor(el)) return;
      if (!isKeyboardReachable(el)) return;
      try {
        const cs = w.getComputedStyle(el);
        const outlineStyle = cs.outlineStyle;
        const outlineWidth = parseFloat(cs.outlineWidth) || 0;
        const hasOutlineAtRest = outlineStyle !== "none" && outlineWidth > 0;
        const boxShadow = cs.boxShadow;
        const hasBoxShadowAtRest = boxShadow && boxShadow !== "none";
        const hasIndicatorAtRest = hasOutlineAtRest || hasBoxShadowAtRest;
        if (hasIndicatorAtRest) return;

        let matchedFocusRules = 0;
        let matchedIndicatorRules = 0;
        let matcherErrors = 0;
        for (const hint of focusHints.hints) {
          try {
            if (el.matches(hint.baseSelector)) {
              matchedFocusRules++;
              if (hint.hasIndicator) matchedIndicatorRules++;
            }
          } catch {
            matcherErrors++;
          }
        }

        if (matchedIndicatorRules > 0) return;

        add(findings, {
          type: "FOCUS_VISIBLE_SUPPRESSED",
          el,
          severity: "low",
          confidence: "advisory",
          note: "No visible focus indicator detected at rest and no matching :focus/:focus-visible indicator rule found. Verify manually.",
          extra: {
            outlineStyle: outlineStyle || null,
            outlineWidth,
            boxShadow: boxShadow === "none" ? "none" : "set",
            keyboardReachable: true,
            matchedFocusRules,
            matchedIndicatorRules,
            scannedFocusRules: focusHints.scannedRules,
            inaccessibleStylesheets: focusHints.inaccessibleSheets,
            matcherErrors,
          },
          fix: "Verify a visible :focus-visible style exists for this control. If focus style is delegated or injected at runtime, this finding can be ignored."
        });
      } catch {}
    });
  };

  RULE_REGISTRY.LOADER_WITHOUT_ANNOUNCEMENT_HOOK.run = ({ findings }) => {
    const cache = createPassCache();
    const loaders = collectLoaderCandidates(doc, 120).filter(el => looksLikeLoader(el, cache)).slice(0, 40);
    if (loaders.length && !hasAnnouncementHook()) {
      add(findings, {
        type: "LOADER_WITHOUT_ANNOUNCEMENT_HOOK",
        el: loaders[0],
        severity: "medium",
        note: "Loaders detected, but no aria-live/status/alert hook found in DOM."
      });
    }
  };

  const hasAnnouncementHook = () =>
    !!doc.querySelector("[aria-live='polite'],[aria-live='assertive'],[role='status'],[role='alert']");

  // Generic landmark-based defaults; profiles override via cfg.appMarkers.
  const DEFAULT_APP_MARKERS = "main, [role='main'], nav[aria-label], [role='navigation'][aria-label], [role='log'], [role='feed']";

  const sanity = (appMarkersSel) => {
    const q = (sel) => { try { return doc.querySelectorAll(sel).length; } catch { return 0; } };
    const markers = appMarkersSel || DEFAULT_APP_MARKERS;
    return {
      href: w.location.href,
      inIframe: w.self !== w.top,
      focusables: q("button,a,input,textarea,select,[tabindex],[role='button'],[role='link']"),
      iframes: q("iframe"),
      ariaLiveHooks: q("[aria-live='polite'],[aria-live='assertive'],[role='status'],[role='alert']"),
      roleLog: q("[role='log']"),
      ariaBusy: q("[aria-busy='true']"),
      progressbar: q("[role='progressbar']"),
      dialogs: q("[role='dialog'],[role='alertdialog'],dialog"),
      regions: q("[role='region']"),
      landmarks: q("main,nav,header,footer,aside,[role='main'],[role='navigation'],[role='banner'],[role='contentinfo'],[role='complementary']"),
      headings: q("h1,h2,h3,h4,h5,h6"),
      appMarkers: q(markers),
      shadowRoots: (() => { let n = 0; for (const el of doc.querySelectorAll("*")) { if (el.shadowRoot) n++; if (n >= 50) break; } return n; })()
    };
  };

  // Mode detection — ARIA/role patterns first, product-specific testIds as fallback.
  // Can be overridden at runtime via cfg.modeHints in run() or via A11YFlowAudit.modeHints.
  const defaultModeHints = {
    chat: {
      roles: ["[role='log']"],
      testIds: [],
      url: null,
    },
    "helpcenter-bot": {
      roles: [],
      testIds: [],
      url: null,
    },
    "helpcenter-tree": {
      roles: ["[role='tree']", "[role='treeitem']"],
      testIds: [],
      url: null,
    },
  };

  // modeHints is the mutable reference used by detectMode.
  // It can be replaced at runtime by the panel via cfg.modeHints.
  let modeHints = defaultModeHints;

  const detectMode = () => {
    for (const [mode, hints] of Object.entries(modeHints)) {
      try {
        if (hints.url) {
          const pattern = hints.url instanceof RegExp ? hints.url : new RegExp(hints.url, "i");
          if (pattern.test(w.location.href)) return mode;
        }
        const sels = [...(hints.roles || []), ...(hints.testIds || [])];
        if (sels.length && doc.querySelector(sels.join(","))) return mode;
      } catch { /* invalid regex or selector — skip this hint */ }
    }
    return "auto";
  };

  const LOADER_CANDIDATE_SELECTOR = [
    "[aria-busy='true']",
    "[role='progressbar']",
    "[role='status']",
    "[class*='loader' i]",
    "[class*='loading' i]",
    "[class*='spinner' i]",
    "[class*='skeleton' i]",
    "[class*='shimmer' i]",
    "[id*='loader' i]",
    "[id*='loading' i]",
    "[data-testid*='load' i]",
    "[data-testid*='spinner' i]",
    "[data-testid*='skeleton' i]",
  ].join(",");

  const collectLoaderCandidates = (root = doc, limit = 120) => {
    const out = [];
    const seen = new Set();
    let list = [];
    try { list = root.querySelectorAll ? root.querySelectorAll(LOADER_CANDIDATE_SELECTOR) : []; } catch { list = []; }
    for (const el of list) {
      if (!isEl(el)) continue;
      const key = cssPath(el);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(el);
      if (out.length >= limit) break;
    }
    return out;
  };

  const looksLikeLoader = (el, cache = null) => {
    if (!isEl(el) || isHiddenCached(el, cache)) return false;
    const role = el.getAttribute("role");
    if (role === "progressbar" || role === "status") return true;
    if (el.getAttribute("aria-busy") === "true") return true;
    const s = `${(el.className || "").toString()} ${el.id || ""} ${testId(el) || ""}`.toLowerCase();
    if (/(loader|loading|spinner|skeleton|progress|shimmer)/.test(s)) return true;
    const t = txt(el.textContent, 50).toLowerCase();
    if (/(loading|please wait|connecting|fetching)/.test(t)) return true;
    // CSS animation/transition detection (spinner/skeleton patterns)
    try {
      const cs = getStyleCached(el, cache);
      const anim = (cs.animationName || "").toLowerCase();
      if (anim !== "none" && /(spin|rotate|pulse|shimmer|skeleton|loading|bounce)/.test(anim)) return true;
      const tp = (cs.transitionProperty || "").toLowerCase();
      if (tp && tp !== "none" && tp !== "all" && /(transform|opacity|width|height)/.test(tp)) {
        const dur = parseFloat(cs.transitionDuration) || 0;
        if (dur >= 0.3 && dur <= 5) return true;
      }
    } catch {}
    // Empty container with fixed dimensions and background (skeleton pattern)
    if (!el.textContent?.trim() && el.children.length === 0) {
      const r = getRectCached(el, cache);
      if (r.width > 40 && r.height > 10 && r.height < 200) {
        try {
          const cs = getStyleCached(el, cache);
          if (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent") return true;
        } catch {}
      }
    }
    return false;
  };

  // ---------------- focusables (for tabWalk) ----------------
  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "textarea:not([disabled])",
    "select:not([disabled])",
    "[role='button']",
    "[role='link']",
    "[tabindex]"
  ].join(",");

  const isFocusable = (el) => {
    if (!isEl(el) || isHidden(el)) return false;
    if (el.hasAttribute("disabled")) return false;
    const ti = el.getAttribute("tabindex");
    if (ti !== null) {
      const v = parseInt(ti, 10);
      if (Number.isFinite(v) && v < 0) return false;
    }
    if ((el.getAttribute("aria-disabled") || "").toLowerCase() === "true") return false;
    return true;
  };

  const getTabIndex = (el) => {
    const ti = el.getAttribute("tabindex");
    if (ti === null) return 0;
    const v = parseInt(ti, 10);
    return Number.isFinite(v) ? v : 0;
  };

  const INTERACTIVE_ROLES = new Set([
    "button", "link", "checkbox", "switch", "radio", "menuitem", "menuitemcheckbox",
    "menuitemradio", "option", "tab", "textbox", "combobox", "slider", "spinbutton"
  ]);

  // WAI-ARIA 1.2 valid aria-* attributes
  const VALID_ARIA_ATTRS = new Set([
    "aria-activedescendant","aria-atomic","aria-autocomplete","aria-braillelabel",
    "aria-brailleroledescription","aria-busy","aria-checked","aria-colcount",
    "aria-colindex","aria-colindextext","aria-colspan","aria-controls","aria-current",
    "aria-describedby","aria-description","aria-details","aria-disabled",
    "aria-dropeffect","aria-errormessage","aria-expanded","aria-flowto","aria-grabbed",
    "aria-haspopup","aria-hidden","aria-invalid","aria-keyshortcuts","aria-label",
    "aria-labelledby","aria-level","aria-live","aria-modal","aria-multiline",
    "aria-multiselectable","aria-orientation","aria-owns","aria-placeholder",
    "aria-posinset","aria-pressed","aria-readonly","aria-relevant","aria-required",
    "aria-roledescription","aria-rowcount","aria-rowindex","aria-rowindextext",
    "aria-rowspan","aria-selected","aria-setsize","aria-sort","aria-valuemax",
    "aria-valuemin","aria-valuenow","aria-valuetext"
  ]);

  // WAI-ARIA 1.2 valid role values
  const VALID_ROLES = new Set([
    "alert","alertdialog","application","article","banner","blockquote","button",
    "caption","cell","checkbox","code","columnheader","combobox","command","comment",
    "complementary","composite","contentinfo","definition","deletion","dialog",
    "directory","document","emphasis","feed","figure","form","generic","grid",
    "gridcell","group","heading","img","input","insertion","landmark","link","list",
    "listbox","listitem","log","main","mark","marquee","math","menu","menubar",
    "menuitem","menuitemcheckbox","menuitemradio","meter","navigation","none","note",
    "option","paragraph","presentation","progressbar","radio","radiogroup","range",
    "region","roletype","row","rowgroup","rowheader","scrollbar","search","searchbox",
    "section","sectionhead","select","separator","slider","spinbutton","status",
    "strong","structure","subscript","superscript","switch","tab","table","tablist",
    "tabpanel","term","textbox","time","timer","toolbar","tooltip","tree","treegrid",
    "treeitem","widget","window"
  ]);

  // Required owned elements (children) by parent role
  const REQUIRED_CHILDREN = {
    tablist: [["tab"]], menu: [["menuitem","menuitemcheckbox","menuitemradio"]],
    menubar: [["menuitem","menuitemcheckbox","menuitemradio"]],
    list: [["listitem"]], listbox: [["option"]],
    tree: [["treeitem","group"]], treegrid: [["row"]],
    grid: [["row","rowgroup"]], table: [["row","rowgroup"]],
    radiogroup: [["radio"]], feed: [["article"]], rowgroup: [["row"]]
  };

  // Required context (parent) by child role
  const REQUIRED_PARENT = {
    tab: ["tablist"], menuitem: ["menu","menubar","group"],
    menuitemcheckbox: ["menu","menubar","group"],
    menuitemradio: ["menu","menubar","group"],
    option: ["listbox","group"], treeitem: ["tree","group"],
    listitem: ["list","group"], row: ["table","grid","treegrid","rowgroup"],
    cell: ["row"], gridcell: ["row"], columnheader: ["row"], rowheader: ["row"]
  };

  // Required ARIA states/properties by role (hand-maintained fallback)
  const REQUIRED_ARIA_PROPS = {
    checkbox: ["aria-checked"], switch: ["aria-checked"], radio: ["aria-checked"],
    combobox: ["aria-expanded"], slider: ["aria-valuenow"],
    scrollbar: ["aria-valuenow"], menuitemcheckbox: ["aria-checked"],
    menuitemradio: ["aria-checked"], tab: ["aria-selected"]
  };

  // Vendored WAI-ARIA 1.2 role dataset (window.__FlowLensAriaData, generated
  // from aria-query and injected as aria-data.js before this snippet). When
  // present, the generated dataset supersedes the hand-maintained tables
  // above; when it is missing or malformed, the tables above remain in force
  // (same graceful-fallback pattern as getAccName / __FlowLensAccName).
  const ARIA_DATA_ROLES = (() => {
    try {
      const d = typeof window !== "undefined" ? window.__FlowLensAriaData : null;
      const roles = d && d.roles;
      if (roles && typeof roles === "object" && Object.keys(roles).length > 0) return roles;
    } catch { /* fall back to hand-maintained tables */ }
    return null;
  })();
  const ariaDataTable = (pick, fallback) => {
    if (!ARIA_DATA_ROLES) return fallback;
    const out = {};
    for (const [role, def] of Object.entries(ARIA_DATA_ROLES)) {
      try {
        const v = pick(def);
        if (Array.isArray(v) && v.length) out[role] = v;
      } catch { /* skip malformed role entries */ }
    }
    return Object.keys(out).length ? out : fallback;
  };
  // Valid role values: every role name in the dataset (abstract roles kept,
  // matching the permissiveness of the hand-maintained VALID_ROLES table).
  const EFFECTIVE_VALID_ROLES = ARIA_DATA_ROLES
    ? new Set(Object.keys(ARIA_DATA_ROLES))
    : VALID_ROLES;
  const EFFECTIVE_REQUIRED_CHILDREN = ariaDataTable(
    def => (Array.isArray(def?.requiredOwned) && def.requiredOwned.length) ? [def.requiredOwned.slice()] : null,
    REQUIRED_CHILDREN
  );
  const EFFECTIVE_REQUIRED_PARENT = ariaDataTable(
    def => Array.isArray(def?.requiredContext) ? def.requiredContext.slice() : null,
    REQUIRED_PARENT
  );
  const EFFECTIVE_REQUIRED_ARIA_PROPS = ariaDataTable(
    def => Array.isArray(def?.requiredProps) ? def.requiredProps.slice() : null,
    REQUIRED_ARIA_PROPS
  );

  // WCAG 1.3.5 valid autocomplete tokens (HTML spec)
  const VALID_AUTOCOMPLETE = new Set([
    "off","on","name","honorific-prefix","given-name","additional-name","family-name",
    "honorific-suffix","nickname","email","username","new-password","current-password",
    "one-time-code","organization-title","organization","street-address","address-line1",
    "address-line2","address-line3","address-level4","address-level3","address-level2",
    "address-level1","country","country-name","postal-code","cc-name","cc-given-name",
    "cc-additional-name","cc-family-name","cc-number","cc-exp","cc-exp-month","cc-exp-year",
    "cc-csc","cc-type","transaction-currency","transaction-amount","language","bday",
    "bday-day","bday-month","bday-year","sex","tel","tel-country-code","tel-national",
    "tel-area-code","tel-local","tel-extension","impp","url","photo","webauthn"
  ]);

  // ARIA attribute value type validators
  const ARIA_BOOL_ATTRS = new Set([
    "aria-atomic","aria-busy","aria-disabled","aria-expanded","aria-grabbed",
    "aria-hidden","aria-modal","aria-multiline","aria-multiselectable","aria-readonly",
    "aria-required","aria-selected"
  ]);
  const ARIA_TRISTATE_ATTRS = new Set(["aria-checked","aria-pressed"]);
  const ARIA_INT_ATTRS = new Set([
    "aria-level","aria-posinset","aria-setsize","aria-colcount","aria-colindex",
    "aria-colspan","aria-rowcount","aria-rowindex","aria-rowspan"
  ]);
  const ARIA_NUM_ATTRS = new Set(["aria-valuenow","aria-valuemax","aria-valuemin"]);
  const ARIA_TOKEN_ATTRS = {
    "aria-autocomplete": new Set(["none","inline","list","both"]),
    "aria-current": new Set(["page","step","location","date","time","true","false"]),
    "aria-haspopup": new Set(["true","false","menu","listbox","tree","grid","dialog"]),
    "aria-invalid": new Set(["grammar","spelling","true","false"]),
    "aria-live": new Set(["off","polite","assertive"]),
    "aria-orientation": new Set(["horizontal","vertical","undefined"]),
    "aria-sort": new Set(["ascending","descending","none","other"]),
    "aria-relevant": new Set(["additions","removals","text","all","additions text"]),
    "aria-dropeffect": new Set(["copy","execute","link","move","none","popup"]),
  };
  const VALID_SCOPE_VALUES = new Set(["col","row","colgroup","rowgroup"]);

  const isNativeInteractiveControl = (el) => {
    if (!isEl(el)) return false;
    const tag = el.tagName;
    if (tag === "BUTTON") return true;
    if (tag === "A" && el.hasAttribute("href")) return true;
    if (tag === "SUMMARY") return true;
    if (tag === "INPUT") return (el.getAttribute("type") || "").toLowerCase() !== "hidden";
    return tag === "TEXTAREA" || tag === "SELECT";
  };

  const hasInertAncestor = (el) => {
    let node = el;
    while (isEl(node) && node !== doc.documentElement) {
      if (node.inert || node.hasAttribute?.("inert")) return true;
      node = node.parentElement;
    }
    return false;
  };

  const inlineKeyboardAttributes = ["onkeydown", "onkeyup", "onkeypress"];

  const extractActivationKeys = (handlerCode) => {
    const src = String(handlerCode || "").toLowerCase();
    const keys = [];
    if (!src) return keys;
    if (/\benter\b|key\s*===\s*['"]enter['"]|keycode\s*===\s*13|which\s*===\s*13/.test(src)) keys.push("Enter");
    if (/\bspace\b|key\s*===\s*['"] ['"]|keycode\s*===\s*32|which\s*===\s*32/.test(src)) keys.push("Space");
    return [...new Set(keys)];
  };

  const getInlineKeyboardMeta = (el) => {
    if (!isEl(el)) return { hasHandler: false, activationKeys: [] };
    let hasHandler = false;
    const activation = new Set();
    for (const attr of inlineKeyboardAttributes) {
      const code = el.getAttribute(attr);
      if (!code) continue;
      hasHandler = true;
      extractActivationKeys(code).forEach(k => activation.add(k));
    }
    return { hasHandler, activationKeys: [...activation] };
  };

  const getAncestorKeyboardMeta = (el, maxDepth = 3) => {
    let node = el?.parentElement || null;
    let depth = 0;
    while (node && depth < maxDepth) {
      const meta = getInlineKeyboardMeta(node);
      if (meta.hasHandler) return { hasHandler: true, distance: depth + 1, activationKeys: meta.activationKeys };
      node = node.parentElement;
      depth++;
    }
    return { hasHandler: false, distance: null, activationKeys: [] };
  };

  const getGlobalKeyboardMeta = () => {
    const activation = new Set();
    let hasHandler = false;
    [doc.body, doc.documentElement].forEach(node => {
      if (!isEl(node)) return;
      const meta = getInlineKeyboardMeta(node);
      if (!meta.hasHandler) return;
      hasHandler = true;
      meta.activationKeys.forEach(k => activation.add(k));
    });
    if (typeof w.onkeydown === "function" || typeof w.onkeyup === "function" || typeof w.onkeypress === "function") {
      hasHandler = true;
    }
    return { hasHandler, activationKeys: [...activation] };
  };

  const hasInlineKeyboardHandler = (el) => getInlineKeyboardMeta(el).hasHandler;

  const hasAncestorKeyboardHandler = (el, maxDepth = 3) => getAncestorKeyboardMeta(el, maxDepth).hasHandler;

  const getAncestorClickMeta = (el, maxDepth = 3) => {
    let node = el?.parentElement || null;
    let depth = 0;
    while (node && depth < maxDepth) {
      if (node.hasAttribute?.("onclick")) return { hasHandler: true, distance: depth + 1 };
      node = node.parentElement;
      depth++;
    }
    return { hasHandler: false, distance: null };
  };

  const hasPointerCursor = (el) => {
    try {
      return w.getComputedStyle(el).cursor === "pointer";
    } catch {
      return false;
    }
  };

  const hasInteractiveRole = (el) => INTERACTIVE_ROLES.has((el?.getAttribute?.("role") || "").toLowerCase());

  const isKeyboardReachable = (el) => {
    if (!isFocusable(el) || hasInertAncestor(el)) return false;
    if (isNativeInteractiveControl(el)) return true;
    const ti = el.getAttribute("tabindex");
    if (ti !== null) {
      const v = parseInt(ti, 10);
      return Number.isFinite(v) ? v >= 0 : false;
    }
    return false;
  };

  const isLikelyActionable = (el) => {
    if (!isEl(el)) return false;
    if (isNativeInteractiveControl(el)) return true;
    if (hasInteractiveRole(el)) return true;
    if (el.hasAttribute("onclick")) return true;
    return hasPointerCursor(el);
  };

  const isLikelyFocusSentinel = (el) => {
    if (!isEl(el)) return false;
    const attrSig = `${el.id || ""} ${(el.className || "").toString()} ${el.getAttribute("data-testid") || ""}`.toLowerCase();
    if (el.hasAttribute("data-focus-guard")) return true;
    if (/(focus-guard|focusguard|sentinel|focus-trap-guard|trap-focus)/.test(attrSig)) return true;
    const r = el.getBoundingClientRect();
    if (r.width <= 2 && r.height <= 2 && !getAccName(el) && !hasInteractiveRole(el) && !el.hasAttribute("onclick")) return true;
    return false;
  };

  const isInlineTextLinkException = (el) => {
    if (!isEl(el) || el.tagName !== "A" || !el.hasAttribute("href")) return false;
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role && role !== "link") return false;
    let cs;
    try { cs = w.getComputedStyle(el); } catch { return false; }
    if (!cs || cs.display !== "inline") return false;
    const ownText = txt(el.textContent, 120);
    if (ownText.length < 2) return false;
    const p = el.parentElement;
    if (!p) return false;
    const parentText = txt(p.textContent, 240);
    if (!parentText) return false;
    return ownText.length < parentText.length;
  };

  const hasLargerInteractiveAncestor = (el) => {
    const parentInteractive = el.parentElement?.closest?.("button,a[href],[role='button'],[role='link'],label");
    if (!parentInteractive || parentInteractive === el || !isEl(parentInteractive)) return false;
    try {
      const r = parentInteractive.getBoundingClientRect();
      return r.width >= 24 && r.height >= 24;
    } catch {
      return false;
    }
  };

  const parseCssTimeMaxSeconds = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return 0;
    const parts = raw.split(",").map(s => s.trim()).filter(Boolean);
    let max = 0;
    for (const part of parts) {
      const lower = part.toLowerCase();
      if (lower.endsWith("ms")) {
        const n = parseFloat(lower);
        if (Number.isFinite(n)) max = Math.max(max, n / 1000);
        continue;
      }
      if (lower.endsWith("s")) {
        const n = parseFloat(lower);
        if (Number.isFinite(n)) max = Math.max(max, n);
      }
    }
    return max;
  };

  const isLikelyTransitioning = (el) => {
    if (!isEl(el)) return false;
    try {
      const cs = w.getComputedStyle(el);
      const transitionSec = parseCssTimeMaxSeconds(cs.transitionDuration);
      const animationSec = parseCssTimeMaxSeconds(cs.animationDuration);
      if (transitionSec > 0) return true;
      if (animationSec > 0 && (cs.animationName || "").toLowerCase() !== "none") return true;
    } catch {}
    return false;
  };

  const keyboardReachabilityReason = (el) => {
    if (!isEl(el)) return "not_reachable";
    if (isNativeInteractiveControl(el)) return "native";
    const ti = el.getAttribute("tabindex");
    if (ti !== null) {
      const v = parseInt(ti, 10);
      if (Number.isFinite(v) && v >= 0) return "tabindex";
    }
    return "implicit_or_unknown";
  };

  const focusableTypeForEvidence = (el) => {
    if (!isEl(el)) return "unknown";
    if (isNativeInteractiveControl(el)) return `native:${el.tagName.toLowerCase()}`;
    const role = (el.getAttribute("role") || "").toLowerCase();
    if (role) return `role:${role}`;
    const ti = el.getAttribute("tabindex");
    if (ti !== null) return `tabindex:${ti}`;
    return el.tagName.toLowerCase();
  };

  const computeTabOrder = () => {
    const all = [...doc.querySelectorAll(focusableSelector)].filter(isFocusable);
    const pos = all.filter(el => getTabIndex(el) > 0).sort((a,b) => getTabIndex(a) - getTabIndex(b));
    const zero = all.filter(el => getTabIndex(el) === 0);
    return [...pos, ...zero];
  };

  // ---------------- contrast utils (contrastScan) ----------------
  const parseRGBA = (c) => {
    if (!c) return null;
    c = c.trim();
    if (c === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
    const m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (!m) return null;
    const parts = m[1].split(",").map(x => x.trim());
    const r = parseFloat(parts[0]);
    const g = parseFloat(parts[1]);
    const b = parseFloat(parts[2]);
    const a = parts.length >= 4 ? parseFloat(parts[3]) : 1;
    if (![r,g,b,a].every(n => Number.isFinite(n))) return null;
    return { r, g, b, a };
  };

  const blend = (fg, bg) => {
    const a = fg.a + bg.a * (1 - fg.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const r = (fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a;
    const g = (fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a;
    const b = (fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a;
    return { r, g, b, a };
  };

  // ──────── Contrast Math & Suggestion Helpers ────
  const srgbToLin = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };

  const relLuminance = ({ r, g, b }) => {
    const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
    return 0.2126 * R + 0.7152 * G + 0.0722 * B;
  };

  const contrastRatio = (c1, c2) => {
    const L1 = relLuminance(c1);
    const L2 = relLuminance(c2);
    const hi = Math.max(L1, L2);
    const lo = Math.min(L1, L2);
    return (hi + 0.05) / (lo + 0.05);
  };

  // RGB ↔ HSL helpers for the contrast fix suggestion (channels 0-255, h/s/l 0-1).
  const rgbToHsl = ({ r, g, b }) => {
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    return { h: h / 6, s, l };
  };

  const hslToRgb = ({ h, s, l }) => {
    if (s === 0) {
      const v = Math.round(l * 255);
      return { r: v, g: v, b: v };
    }
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
      r: Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      g: Math.round(hue2rgb(p, q, h) * 255),
      b: Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    };
  };

  const rgbToHex = ({ r, g, b }) =>
    "#" + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

  // Contrast fix suggestion (Stark/WAVE pattern): keep the hue/saturation of
  // the failing foreground and move its HSL lightness toward the pole (black
  // or white) with the higher contrast against the effective background.
  // Along that path the pass predicate is a suffix (true from the crossing
  // point through the pole), so a ≤20-iteration binary search finds the
  // smallest shift whose ratio meets `required`. Returns { hex, ratio }
  // (ratio rounded to 2 decimals) or null when even the pole cannot pass.
  const suggestContrastColor = (fg, bg, required) => {
    try {
      if (!fg || !bg || !Number.isFinite(required)) return null;
      const { h, s, l } = rgbToHsl(fg);
      const poleL = contrastRatio({ r: 0, g: 0, b: 0 }, bg) >= contrastRatio({ r: 255, g: 255, b: 255 }, bg) ? 0 : 1;
      const colorAt = (t) => hslToRgb({ h, s, l: l + (poleL - l) * t });
      const passes = (c) => contrastRatio(c, bg) + 1e-6 >= required;
      if (!passes(colorAt(1))) return null; // even the pole fails (e.g. mid-gray bg)
      let lo = 0, hi = 1;
      if (passes(colorAt(0))) hi = 0;
      for (let i = 0; i < 20 && hi - lo > 1e-4; i++) {
        const mid = (lo + hi) / 2;
        if (passes(colorAt(mid))) hi = mid; else lo = mid;
      }
      // 8-bit channel rounding can land just under the threshold — nudge
      // further toward the pole until the emitted color itself passes.
      let t = hi;
      let rgb = colorAt(t);
      for (let guard = 0; !passes(rgb) && t < 1 && guard < 20; guard++) {
        t = Math.min(1, t + 0.02);
        rgb = colorAt(t);
      }
      if (!passes(rgb)) return null;
      return { hex: rgbToHex(rgb), ratio: +contrastRatio(rgb, bg).toFixed(2) };
    } catch { return null; }
  };
  // ──────── End Contrast Math & Suggestion Helpers ────

  const getEffectiveBg = (el) => {
    const layers = [];
    let node = el;
    while (node && node !== doc.documentElement) {
      const c = parseRGBA(w.getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        layers.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    const bodyBg = parseRGBA(w.getComputedStyle(doc.body).backgroundColor);
    if (bodyBg && bodyBg.a > 0) bg = bodyBg.a >= 1 ? bodyBg : blend(bodyBg, bg);
    for (let i = layers.length - 1; i >= 0; i--) bg = blend(layers[i], bg);
    return bg;
  };

  const isLargeText = (el) => {
    const s = w.getComputedStyle(el);
    const fs = parseFloat(s.fontSize) || 0;
    const fw = parseInt(s.fontWeight, 10) || 400;
    const bold = fw >= 700;
    return fs >= 24 || (bold && fs >= 18.66);
  };

  let observeInFlight = null;
  let watchInFlight = null;

  // ---------------- Shadow DOM scope collection ----------------

  let _scopeCache = null;
  let _selectorCache = null;

  const resetScopeCache = () => { _scopeCache = null; };
  const resetSelectorCache = () => { _selectorCache = new Map(); };

  /**
   * Collect all reachable DOM scopes (rootNode + open shadow roots within it).
   * Returns: { scopes: Array<{root, depth}>, coverage: ShadowCoverage }
   *
   * Coverage metadata is computed during traversal at zero extra cost.
   * Deterministic: same DOM → same coverage.
   * For subtree mode, traversal strictly scoped to rootEl (P1-4 guarantee).
   */
  const collectScopesWithCoverage = (rootNode) => {
    const scopes = [{ root: rootNode, depth: 0 }];
    let i = 0;
    let maxDepthObserved = 0;
    let depthLimitReached = false;
    let totalShadowRootsFound = 0;

    while (i < scopes.length) {
      const { root, depth } = scopes[i++];
      if (depth > maxDepthObserved) maxDepthObserved = depth;

      if (depth >= MAX_SHADOW_DEPTH) {
        depthLimitReached = true;
        continue;
      }

      const ownerDoc = root.ownerDocument || root;
      let walker;
      try {
        walker = ownerDoc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
      } catch { continue; }
      let node;
      while ((node = walker.nextNode())) {
        if (node.shadowRoot) {
          totalShadowRootsFound++;
          if (scopes.length < MAX_SHADOW_SCOPES + 1) {
            scopes.push({ root: node.shadowRoot, depth: depth + 1 });
          }
        }
      }
    }

    const scopesFound = totalShadowRootsFound;
    const scopesAudited = Math.min(scopesFound, MAX_SHADOW_SCOPES);
    const scopesCapped = scopesFound > MAX_SHADOW_SCOPES;

    return {
      scopes,
      coverage: {
        scopesFound,
        scopesAudited,
        scopesCapped,
        maxDepthObserved,
        depthLimitReached,
      },
    };
  };

  // ---------------- Selector batching cache ----------------

  /**
   * Query all scopes for a given selector, using the per-scope cache.
   * Must be called AFTER collectScopesWithCoverage() has populated _scopeCache.
   * Same selector across rules only queried once per scope. Deterministic.
   */
  const cachedQueryAllDeep = (selector) => {
    const scopes = _scopeCache;
    if (!scopes) return [];

    const results = [];
    for (const { root } of scopes) {
      let scopeMap = _selectorCache.get(root);
      if (!scopeMap) {
        scopeMap = new Map();
        _selectorCache.set(root, scopeMap);
      }
      let elements = scopeMap.get(selector);
      if (!elements) {
        try {
          elements = [...root.querySelectorAll(selector)];
        } catch {
          elements = [];
        }
        scopeMap.set(selector, elements);
      }
      for (const el of elements) results.push(el);
    }
    return results;
  };

  // ---------------- Rule gating: scope presence flags ----------------

  /**
   * Compute presence flags per scope. Called once per scope at start of rule execution.
   * Allows rules to skip entire categories when no matching elements exist.
   * Must not change rule semantics. Deterministic.
   */
  const computeScopeFlags = (scopeRoot) => ({
    hasImages: !!scopeRoot.querySelector("img, [role='img'], svg[role='img']"),
    hasInteractive: !!scopeRoot.querySelector(
      "a[href], button, input, select, textarea, [tabindex], [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='slider'], [role='switch'], [role='textbox']"
    ),
    hasForms: !!scopeRoot.querySelector("input, select, textarea, [role='textbox'], [role='combobox'], [role='listbox']"),
    hasHeadings: !!scopeRoot.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']"),
    hasLandmarks: !!scopeRoot.querySelector("main, nav, aside, header, footer, [role='main'], [role='navigation'], [role='complementary'], [role='banner'], [role='contentinfo']"),
    hasLiveRegions: !!scopeRoot.querySelector("[aria-live], [role='alert'], [role='status'], [role='log'], [role='timer']"),
    hasTables: !!scopeRoot.querySelector("table, [role='table'], [role='grid']"),
    hasIframes: !!scopeRoot.querySelector("iframe"),
  });

  const computeAggregateFlags = (scopes) => {
    const agg = {
      hasImages: false, hasInteractive: false, hasForms: false,
      hasHeadings: false, hasLandmarks: false, hasLiveRegions: false,
      hasTables: false, hasIframes: false,
    };
    for (const { root } of scopes) {
      const f = computeScopeFlags(root);
      for (const key of Object.keys(agg)) {
        if (f[key]) agg[key] = true;
      }
    }
    return agg;
  };

  // ---------------- Overlay: resolve target + annotate ----------------

  /**
   * Resolve a finding's target element using fallback chain.
   * P1-2: tag+role+name fallback capped at MAX_TAG_CANDIDATES.
   */
  const resolveTarget = (targetRef) => {
    if (!targetRef) return null;

    // 1. Try CSS selector
    if (targetRef.cssSelector) {
      try {
        const el = doc.querySelector(targetRef.cssSelector);
        if (el) return el;
      } catch {}
    }

    // 2. Try data-testid (light + deep shadow search)
    if (targetRef.testId) {
      const el = doc.querySelector(`[data-testid="${CSS.escape(targetRef.testId)}"]`);
      if (el) return el;
      // Deep shadow search for testId
      for (const { root } of (_scopeCache || [])) {
        try {
          const found = root.querySelector(`[data-testid="${CSS.escape(targetRef.testId)}"]`);
          if (found) return found;
        } catch {}
      }
    }

    // 3. Tag + role + accessible name heuristic (capped at MAX_TAG_CANDIDATES)
    if (targetRef.tag) {
      try {
        const candidates = doc.querySelectorAll(targetRef.tag);
        // Intentional cap: prevent performance spikes in large SPAs
        if (candidates.length > MAX_TAG_CANDIDATES) return null;
        for (const el of candidates) {
          if (targetRef.role && el.getAttribute("role") !== targetRef.role) continue;
          if (targetRef.name && getAccName(el) !== targetRef.name) continue;
          return el;
        }
      } catch {}
    }

    return null;
  };

  /**
   * Clear the tab-stops path overlay (numbered badges + connecting SVG polyline).
   */
  const clearTabPath = () => {
    const existing = doc.getElementById(TAB_PATH_CONTAINER_ID);
    if (existing) existing.remove();
  };

  /**
   * Clear the page-structure overlay (labeled heading/landmark outline boxes).
   */
  const clearStructureOverlay = () => {
    const existing = doc.getElementById(STRUCTURE_CONTAINER_ID);
    if (existing) existing.remove();
  };

  /**
   * Clear all FlowLens overlay annotations from the page (also removes the
   * tab path overlay and the page-structure overlay).
   */
  const clearAnnotations = () => {
    const existing = doc.getElementById(ANNOTATION_CONTAINER_ID);
    if (existing) existing.remove();
    clearTabPath();
    clearStructureOverlay();
  };

  /**
   * Assist toolbox — remove any active assist mode (style + SVG filter).
   * Always safe to call; fully reverses applyAssist().
   */
  const clearAssist = () => {
    const style = doc.getElementById(ASSIST_STYLE_ID);
    if (style) style.remove();
    const svg = doc.getElementById(ASSIST_SVG_ID);
    if (svg) svg.remove();
    return { ok: true };
  };

  /**
   * Assist toolbox — apply one WCAG stress-test / vision-simulation mode to
   * the page. Only one assist is active at a time: applying a new kind
   * replaces the previous one. Everything is reversible via clearAssist();
   * no listeners, no timers, no external resources.
   *
   * Kinds:
   *  - "textSpacing" — SC 1.4.12 (Text Spacing) minimums: line-height 1.5,
   *    letter-spacing 0.12em, word-spacing 0.16em, paragraph spacing 2em.
   *  - "grayscale" — full desaturation (color-not-sole-means spot check).
   *  - "protanopia" | "deuteranopia" | "tritanopia" | "achromatopsia" —
   *    color-vision-deficiency simulation via a hidden SVG feColorMatrix
   *    filter referenced from an html-level CSS filter.
   */
  const applyAssist = (kind) => {
    if (!ASSIST_KINDS.has(kind)) return { ok: false, error: "UNKNOWN_ASSIST_KIND" };
    clearAssist(); // one assist active at a time — applying replaces the previous one

    const style = doc.createElement("style");
    style.id = ASSIST_STYLE_ID;

    if (kind === "textSpacing") {
      style.textContent = [
        "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }",
        "p { margin-bottom: 2em !important; }",
      ].join("\n");
    } else if (kind === "grayscale") {
      style.textContent = "html { filter: grayscale(100%) !important; }";
    } else {
      const SVG_NS = "http://www.w3.org/2000/svg";
      const svg = doc.createElementNS(SVG_NS, "svg");
      svg.id = ASSIST_SVG_ID;
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.setAttribute("aria-hidden", "true");
      svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;";
      const filter = doc.createElementNS(SVG_NS, "filter");
      filter.id = ASSIST_CVD_FILTER_ID;
      const matrix = doc.createElementNS(SVG_NS, "feColorMatrix");
      matrix.setAttribute("type", "matrix");
      matrix.setAttribute("values", ASSIST_CVD_MATRICES[kind]);
      filter.appendChild(matrix);
      svg.appendChild(filter);
      (doc.body || doc.documentElement).appendChild(svg);
      style.textContent = `html { filter: url(#${ASSIST_CVD_FILTER_ID}) !important; }`;
    }

    (doc.head || doc.documentElement).appendChild(style);
    return { ok: true, kind };
  };

  // ---------------- Page structure (landmarks + headings) ----------------

  /**
   * Heading level: 1-6 from the tag name, or aria-level for role="heading"
   * (defaults to 2 per WAI-ARIA when aria-level is absent/invalid).
   */
  const headingLevel = (el) => {
    const m = /^H([1-6])$/.exec(el.tagName || "");
    if (m) return parseInt(m[1], 10);
    const lvl = parseInt(el.getAttribute("aria-level") || "", 10);
    return lvl >= 1 && lvl <= 6 ? lvl : 2;
  };

  /**
   * Landmark label: aria-label, or the resolved text of aria-labelledby
   * references. Returns null when the landmark is unlabeled.
   */
  const landmarkLabel = (el) => {
    const aria = (el.getAttribute("aria-label") || "").trim();
    if (aria) return txt(aria, 80);
    const refIds = (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean);
    if (refIds.length) {
      const parts = [];
      for (const id of refIds) {
        const ref = doc.getElementById(id);
        if (ref) parts.push(ref.textContent || "");
      }
      const joined = txt(parts.join(" "), 80);
      if (joined) return joined;
    }
    return null;
  };

  /**
   * Computed landmark role (main/nav/banner/contentinfo/complementary/region/
   * form/search) from an explicit role attribute or the implicit tag mapping.
   * Returns null for elements that are not landmarks (e.g. a scoped <header>,
   * an unnamed <section>/<form>).
   */
  const computeLandmarkRole = (el) => {
    const explicit = (el.getAttribute("role") || "").trim().toLowerCase();
    if (explicit) {
      if (explicit === "navigation") return "nav";
      return LANDMARK_ROLES.has(explicit) ? explicit : null;
    }
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "main") return "main";
    if (tag === "nav") return "nav";
    if (tag === "aside") return "complementary";
    if (tag === "search") return "search";
    if (tag === "header" || tag === "footer") {
      // banner/contentinfo only when not scoped to sectioning content
      let scoped = null;
      try { scoped = el.closest ? el.closest("article, aside, main, nav, section") : null; } catch {}
      if (scoped) return null;
      return tag === "header" ? "banner" : "contentinfo";
    }
    // <form>/<section> are landmarks only when they have an accessible name
    if (tag === "form") return landmarkLabel(el) ? "form" : null;
    if (tag === "section") return landmarkLabel(el) ? "region" : null;
    return null;
  };

  /**
   * Internal: collect visible headings + landmarks across the document and
   * all reachable open shadow roots (same traversal as run(); closed shadow
   * roots cannot be inspected). Keeps live element refs for the overlay.
   *
   * Issues:
   *  - heading "level_skip" — the level jumps by more than one from the
   *    previous heading in document order (e.g. h2 -> h4).
   *  - landmark "duplicate_unlabeled" — the same role appears 2+ times
   *    without distinct labels, so AT users cannot tell the instances apart.
   *
   * Capped at MAX_STRUCTURE_HEADINGS / MAX_STRUCTURE_LANDMARKS.
   */
  const collectPageStructure = () => {
    const { scopes } = collectScopesWithCoverage(doc.documentElement);

    const headings = [];
    let prevLevel = null;
    let headingsCapped = false;
    for (const { root } of scopes) {
      let found;
      try { found = [...root.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']")]; } catch { found = []; }
      for (const el of found) {
        if (isHidden(el)) continue;
        if (headings.length >= MAX_STRUCTURE_HEADINGS) { headingsCapped = true; break; }
        const level = headingLevel(el);
        const issues = [];
        if (prevLevel != null && level > prevLevel + 1) issues.push("level_skip");
        headings.push({ el, level, text: txt(el.textContent, 80), path: cssPath(el), issues });
        prevLevel = level;
      }
      if (headingsCapped) break;
    }

    const landmarks = [];
    let landmarksCapped = false;
    for (const { root } of scopes) {
      let found;
      try { found = [...root.querySelectorAll(LANDMARK_SELECTOR)]; } catch { found = []; }
      for (const el of found) {
        if (isHidden(el)) continue;
        const role = computeLandmarkRole(el);
        if (!role) continue;
        if (landmarks.length >= MAX_STRUCTURE_LANDMARKS) { landmarksCapped = true; break; }
        landmarks.push({ el, role, label: landmarkLabel(el), path: cssPath(el), issues: [] });
      }
      if (landmarksCapped) break;
    }

    // duplicate_unlabeled: same role 2+ times without distinct labels
    const byRole = new Map();
    for (const lm of landmarks) {
      if (!byRole.has(lm.role)) byRole.set(lm.role, []);
      byRole.get(lm.role).push(lm);
    }
    for (const group of byRole.values()) {
      if (group.length < 2) continue;
      const labelCounts = new Map();
      for (const lm of group) {
        const key = lm.label == null ? "" : lm.label.toLowerCase();
        labelCounts.set(key, (labelCounts.get(key) || 0) + 1);
      }
      for (const lm of group) {
        const key = lm.label == null ? "" : lm.label.toLowerCase();
        if (lm.label == null || labelCounts.get(key) > 1) lm.issues.push("duplicate_unlabeled");
      }
    }

    return { headings, landmarks, headingsCapped, landmarksCapped };
  };

  /**
   * Page structure snapshot — headings outline + landmark regions with
   * structural issues. Serializable (no element refs); safe to send across
   * the extension message boundary.
   */
  const getPageStructure = () => {
    const { headings, landmarks, headingsCapped, landmarksCapped } = collectPageStructure();
    const headingsOut = headings.map(h => ({ level: h.level, text: h.text, path: h.path, issues: h.issues }));
    const landmarksOut = landmarks.map(l => ({ role: l.role, label: l.label, path: l.path, issues: l.issues }));
    const issueCount =
      headingsOut.reduce((n, h) => n + h.issues.length, 0) +
      landmarksOut.reduce((n, l) => n + l.issues.length, 0);
    const res = {
      headings: headingsOut,
      landmarks: landmarksOut,
      summary: {
        h1Count: headingsOut.filter(h => h.level === 1).length,
        headingCount: headingsOut.length,
        landmarkCount: landmarksOut.length,
        issues: issueCount,
        headingsCapped,
        landmarksCapped,
      },
      capturedAt: nowIso(),
    };
    api.lastStructure = res;
    return res;
  };

  /**
   * Page-structure overlay — draws labeled outline boxes ("H2" badges for
   * headings, role badges for landmarks) in one absolutely-positioned
   * container (same pattern as annotateFindings/showTabPath). Items with
   * structural issues render red. Idempotent: re-running clears the previous
   * structure overlay first; no listeners (pointer-events: none everywhere);
   * no external resources. Removed by clearStructureOverlay()/clearAnnotations().
   */
  const showStructureOverlay = (kind) => {
    if (!STRUCTURE_KINDS.has(kind)) return { ok: false, error: "UNKNOWN_STRUCTURE_KIND" };
    clearStructureOverlay();

    const { headings, landmarks } = collectPageStructure();
    const items = kind === "headings"
      ? headings.map(h => ({ el: h.el, badge: `H${h.level}`, flagged: h.issues.length > 0, color: STRUCTURE_HEADING_COLOR }))
      : landmarks.map(l => ({ el: l.el, badge: l.label ? `${l.role}: ${txt(l.label, 24)}` : l.role, flagged: l.issues.length > 0, color: STRUCTURE_LANDMARK_COLOR }));

    const container = doc.createElement("div");
    container.id = STRUCTURE_CONTAINER_ID;
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none;";

    let rendered = 0;
    let flagged = 0;
    for (const item of items) {
      const el = item.el;
      if (!isEl(el) || !el.isConnected) continue;
      let rect;
      try { rect = el.getBoundingClientRect(); } catch { continue; }
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      if (item.flagged) flagged++;
      const color = item.flagged ? TAB_PATH_BLOCKED_COLOR : item.color;

      const marker = doc.createElement("div");
      marker.className = ANNOTATION_CLASS;
      marker.style.cssText = `position:fixed;top:${rect.top - 2}px;left:${rect.left - 2}px;width:${rect.width + 4}px;height:${rect.height + 4}px;border:2px solid ${color};border-radius:3px;pointer-events:none;z-index:2147483646;box-sizing:border-box;`;

      const badge = doc.createElement("span");
      badge.style.cssText = `position:absolute;top:-10px;left:-2px;background:${color};color:#fff;font:bold 10px/12px system-ui;padding:1px 4px;border-radius:2px;white-space:nowrap;pointer-events:none;max-width:200px;overflow:hidden;text-overflow:ellipsis;`;
      badge.textContent = item.badge; // textContent only — page text never parsed as HTML
      marker.appendChild(badge);

      container.appendChild(marker);
      rendered++;
    }

    doc.body.appendChild(container);
    return { ok: true, kind, total: items.length, rendered, flagged };
  };

  // ---------------- A11y outline (screen-reader view snapshot) ----------------

  // Implicit tag → ARIA role map for the outline (a[href] handled separately;
  // <input> resolved by type via A11Y_OUTLINE_INPUT_ROLES).
  const A11Y_OUTLINE_TAG_ROLES = {
    a: "link",
    button: "button",
    select: "combobox",
    textarea: "textbox",
    img: "img",
    table: "table",
    h1: "heading", h2: "heading", h3: "heading",
    h4: "heading", h5: "heading", h6: "heading",
  };
  const A11Y_OUTLINE_INPUT_ROLES = {
    button: "button", submit: "button", reset: "button", image: "button",
    checkbox: "checkbox", radio: "radio", range: "slider",
    number: "spinbutton", search: "searchbox",
  };
  const A11Y_OUTLINE_SELECTOR =
    "h1,h2,h3,h4,h5,h6,a[href],button,input,select,textarea,img,table,[role]," +
    LANDMARK_SELECTOR;

  /**
   * Computed outline role for one element: explicit role attribute first,
   * then the implicit tag map (input resolved by type; landmark tags via
   * computeLandmarkRole). Returns null for non-semantic elements.
   */
  const computeOutlineRole = (el) => {
    const explicit = (el.getAttribute("role") || "").trim().toLowerCase().split(/\s+/)[0];
    if (explicit) return explicit === "navigation" ? "nav" : explicit;
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "a") return el.hasAttribute("href") ? "link" : null;
    if (tag === "input") {
      const type = (el.getAttribute("type") || "text").trim().toLowerCase();
      if (type === "hidden") return null;
      return A11Y_OUTLINE_INPUT_ROLES[type] || "textbox";
    }
    if (A11Y_OUTLINE_TAG_ROLES[tag]) return A11Y_OUTLINE_TAG_ROLES[tag];
    return computeLandmarkRole(el);
  };

  /**
   * Landmark nesting depth of an element (0-3 capped) — walks up parents,
   * crossing open shadow boundaries via the host element.
   */
  const outlineLandmarkDepth = (el) => {
    let depth = 0;
    let n = el;
    while (n && depth < MAX_A11Y_OUTLINE_DEPTH) {
      let parent = null;
      try {
        parent = n.parentElement
          || (n.getRootNode && n.getRootNode() !== doc && n.getRootNode().host ? n.getRootNode().host : null);
      } catch { parent = null; }
      if (!parent || !isEl(parent)) break;
      try { if (computeLandmarkRole(parent)) depth++; } catch {}
      n = parent;
    }
    return depth;
  };

  /**
   * A11y outline — linearized list of semantic nodes ("what a screen-reader
   * user experiences"): landmarks, headings, links, buttons, form controls,
   * images, tables and explicit roles, across the document and all reachable
   * open shadow roots (same traversal as getPageStructure). Hidden nodes
   * (display:none / zero-rect / aria-hidden self or ancestor) are skipped
   * entirely. Serializable; capped at MAX_A11Y_OUTLINE_NODES.
   *
   * @returns {{nodes: Array<{role: string, name: string, level: number,
   *   depth: number, pathHash: string}>, truncated: boolean, count: number}}
   */
  const getA11yOutline = () => {
    const { scopes } = collectScopesWithCoverage(doc.documentElement);
    const nodes = [];
    let truncated = false;
    for (const { root } of scopes) {
      if (truncated) break;
      let found;
      try { found = [...root.querySelectorAll(A11Y_OUTLINE_SELECTOR)]; } catch { found = []; }
      for (const el of found) {
        if (isHidden(el)) continue;
        try { if (el.closest && el.closest("[aria-hidden='true']")) continue; } catch {}
        let role = null;
        try { role = computeOutlineRole(el); } catch { role = null; }
        if (!role) continue;
        if (nodes.length >= MAX_A11Y_OUTLINE_NODES) { truncated = true; break; }
        nodes.push({
          role,
          name: txt(getAccName(el), 60),
          level: role === "heading" ? headingLevel(el) : 0,
          depth: outlineLandmarkDepth(el),
          pathHash: steFnv1aHash8(cssPath(el)),
        });
      }
    }
    const res = { nodes, truncated, count: nodes.length };
    api.lastA11yOutline = res;
    return res;
  };

  // ---------------- Guided checks (candidate collection) ----------------

  // Guided-check candidate kinds — mirrors GUIDED_KINDS in src/sw/sw.js.
  const GUIDED_KINDS = new Set(["images", "controls"]);
  const MAX_GUIDED_CANDIDATES = 100;
  // Generic / non-descriptive control labels (compared lowercase, trimmed).
  const GUIDED_GENERIC_LABELS = new Set([
    "click", "here", "more", "read more", "learn more", "click here", "go", "link", "button",
  ]);
  const GUIDED_IMAGE_SELECTOR = "img,[role='img'],svg[aria-label]";
  const GUIDED_CONTROL_SELECTOR =
    "a[href],button,input[type='button'],input[type='submit'],input[type='reset']," +
    "[role='button'],[role='link']";

  /**
   * True when a button/link accessible name is short (<= 3 chars) or in the
   * generic list — i.e. undecidable by automation and worth a human check.
   * Empty names are excluded (already covered by automated name rules).
   */
  const isGuidedGenericName = (name) => {
    const n = txt(name, 80).toLowerCase();
    if (!n) return false;
    return n.length <= 3 || GUIDED_GENERIC_LABELS.has(n);
  };

  /**
   * Guided-check candidates — elements whose accessibility cannot be decided
   * automatically and needs a human answer (IGT-lite pattern).
   * kind "images":   every visible <img>, [role=img] and svg[aria-label]
   *                  with its computed accessible name (may be empty).
   * kind "controls": visible buttons/links whose accessible name is short or
   *                  generic (see isGuidedGenericName).
   * Hidden nodes (display:none / zero-rect / aria-hidden self or ancestor)
   * are skipped; traverses open shadow roots via collectScopesWithCoverage
   * (read-only). Serializable; capped at MAX_GUIDED_CANDIDATES.
   *
   * @returns {{ok: boolean, kind?: string, error?: string,
   *   candidates?: Array<{name: string, path: string,
   *   extra: {tag: string, role: string|null}}>, truncated?: boolean, count?: number}}
   */
  const getGuidedCandidates = (kind) => {
    if (!GUIDED_KINDS.has(kind)) return { ok: false, error: "UNKNOWN_GUIDED_KIND" };
    const selector = kind === "images" ? GUIDED_IMAGE_SELECTOR : GUIDED_CONTROL_SELECTOR;
    const { scopes } = collectScopesWithCoverage(doc.documentElement);
    const candidates = [];
    let truncated = false;
    for (const { root } of scopes) {
      if (truncated) break;
      let found;
      try { found = [...root.querySelectorAll(selector)]; } catch { found = []; }
      for (const node of found) {
        if (isHidden(node)) continue;
        try { if (node.closest && node.closest("[aria-hidden='true']")) continue; } catch {}
        const name = txt(getAccName(node), 120);
        if (kind === "controls" && !isGuidedGenericName(name)) continue;
        if (candidates.length >= MAX_GUIDED_CANDIDATES) { truncated = true; break; }
        candidates.push({
          name,
          path: cssPath(node),
          extra: {
            tag: (node.tagName || "").toLowerCase(),
            role: (node.getAttribute && node.getAttribute("role")) || null,
          },
        });
      }
    }
    const res = { ok: true, kind, candidates, truncated, count: candidates.length };
    api.lastGuided = res;
    return res;
  };

  /**
   * Tab-stops path overlay — draws numbered badges (1..N, visit order) at each
   * tab stop plus a single SVG polyline connecting stop centers, in one
   * absolutely-positioned overlay container. Stops involved in trap/blocking
   * events (see TAB_PATH_BLOCKING_TYPES) render red; others use the accent color.
   *
   * `events` — tabWalk events (used to flag blocked stops via `i` / `path`).
   * `opts.elements` — optional live element list (used by tabWalk({overlay:true}));
   *                   otherwise the current tab order is recomputed.
   *
   * Idempotent: re-running clears the previous overlay first; no listeners are
   * attached (pointer-events: none everywhere); no external resources.
   */
  const showTabPath = (events, opts = {}) => {
    clearTabPath();

    const blockedIndices = new Set();
    const blockedPaths = new Set();
    for (const e of (Array.isArray(events) ? events : [])) {
      if (!e || !TAB_PATH_BLOCKING_TYPES.has(e.type)) continue;
      if (Number.isInteger(e.i) && e.i >= 0) blockedIndices.add(e.i);
      if (typeof e.path === "string" && e.path) blockedPaths.add(e.path);
    }

    const stops = Array.isArray(opts.elements) && opts.elements.length
      ? opts.elements.filter(isEl)
      : computeTabOrder();
    const max = Math.min(stops.length, MAX_TAB_PATH_BADGES);

    const container = doc.createElement("div");
    container.id = TAB_PATH_CONTAINER_ID;
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none;";

    const SVG_NS = "http://www.w3.org/2000/svg";
    const vw = Math.max(doc.documentElement?.clientWidth || 0, w.innerWidth || 0);
    const vh = Math.max(doc.documentElement?.clientHeight || 0, w.innerHeight || 0);
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", String(vw));
    svg.setAttribute("height", String(vh));
    svg.setAttribute("viewBox", `0 0 ${vw} ${vh}`);
    svg.style.cssText = "position:fixed;top:0;left:0;pointer-events:none;overflow:visible;z-index:2147483646;";

    const polyline = doc.createElementNS(SVG_NS, "polyline");
    polyline.setAttribute("fill", "none");
    polyline.setAttribute("stroke", TAB_PATH_ACCENT);
    polyline.setAttribute("stroke-width", "2");
    polyline.setAttribute("stroke-opacity", "0.75");
    polyline.setAttribute("stroke-linejoin", "round");
    polyline.setAttribute("stroke-dasharray", "6 3");
    svg.appendChild(polyline);
    container.appendChild(svg);

    const points = [];
    let rendered = 0;
    let blocked = 0;
    for (let idx = 0; idx < max; idx++) {
      const el = stops[idx];
      if (!isEl(el) || !el.isConnected) continue;
      let rect;
      try { rect = el.getBoundingClientRect(); } catch { continue; }
      if (!rect || (rect.width === 0 && rect.height === 0)) continue;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      points.push(`${cx.toFixed(1)},${cy.toFixed(1)}`);

      const isBlocked = blockedIndices.has(idx) || blockedPaths.has(cssPath(el));
      if (isBlocked) blocked++;
      const color = isBlocked ? TAB_PATH_BLOCKED_COLOR : TAB_PATH_ACCENT;

      const badge = doc.createElement("div");
      badge.className = ANNOTATION_CLASS;
      badge.textContent = String(idx + 1);
      badge.title = isBlocked ? `Tab stop ${idx + 1} — involved in a focus trap/blocking event` : `Tab stop ${idx + 1}`;
      badge.style.cssText = `position:fixed;top:${(cy - 9).toFixed(1)}px;left:${(cx - 9).toFixed(1)}px;width:18px;height:18px;border-radius:50%;background:${color};color:#fff;font:bold 10px/15px system-ui;text-align:center;pointer-events:none;z-index:2147483646;box-sizing:border-box;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.4);`;
      container.appendChild(badge);
      rendered++;
    }

    polyline.setAttribute("points", points.join(" "));
    doc.body.appendChild(container);
    return { ok: true, totalStops: stops.length, rendered, blocked };
  };

  /**
   * Render overlay annotations for findings.
   * Returns stats: { ok, requested, rendered, skipped, skippedReasons }.
   */
  const annotateFindings = (findingsData) => {
    clearAnnotations();

    const container = doc.createElement("div");
    container.id = ANNOTATION_CONTAINER_ID;
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none;";
    doc.body.appendChild(container);

    const requested = Math.min((findingsData || []).length, MAX_ANNOTATIONS);
    let rendered = 0;
    const skippedReasons = { notFound: 0, tooManyCandidates: 0, zeroSize: 0 };
    const SEV_COLORS = {
      critical: "#DB5A5A", high: "#D4864E", medium: "#C4A855",
      low: "#5AB89A", info: "#7A8EA6",
    };

    for (const f of (findingsData || []).slice(0, MAX_ANNOTATIONS)) {
      const el = resolveTarget(f.targetRef);
      if (!el) {
        if (f.targetRef?.tag) {
          try {
            if (doc.querySelectorAll(f.targetRef.tag).length > MAX_TAG_CANDIDATES) {
              skippedReasons.tooManyCandidates++; continue;
            }
          } catch {}
        }
        skippedReasons.notFound++;
        continue;
      }

      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        skippedReasons.zeroSize++;
        continue;
      }

      const marker = doc.createElement("div");
      marker.className = ANNOTATION_CLASS;
      marker.dataset.findingType = f.type || "";
      const color = SEV_COLORS[f.severity] || SEV_COLORS.info;
      marker.style.cssText = `position:fixed;top:${rect.top - 2}px;left:${rect.left - 2}px;width:${rect.width + 4}px;height:${rect.height + 4}px;border:2px solid ${color};border-radius:3px;pointer-events:auto;cursor:pointer;z-index:2147483646;box-sizing:border-box;`;

      const badge = doc.createElement("span");
      badge.style.cssText = `position:absolute;top:-10px;left:-2px;background:${color};color:#fff;font:bold 10px/12px system-ui;padding:1px 4px;border-radius:2px;white-space:nowrap;pointer-events:auto;cursor:pointer;max-width:160px;overflow:hidden;text-overflow:ellipsis;`;
      badge.textContent = f.type || "issue";
      badge.title = `${f.severity}: ${f.type}\n${f.note || ""}`;
      marker.appendChild(badge);

      marker.addEventListener("click", () => {
        w.dispatchEvent(new CustomEvent("__flowlens_annotation_click__", {
          detail: { findingType: f.type }
        }));
      });

      container.appendChild(marker);
      rendered++;
    }

    const skipped = requested - rendered;
    return { ok: true, requested, rendered, skipped, skippedReasons };
  };

  // ---------------- Element highlight (persistent ring overlay) ----------------
  //
  // Resolution ladder (most exact first):
  //   (a)  document.querySelector(spec.path) — audit-time selector, verified
  //        against spec.name when provided.
  //   (a2) cross-shadow deep path ("host >>> inner", cssPathDeep format).
  //   (b)  shadow-DOM-aware walk — spec.path is scoped to its shadow root at
  //        audit time, so querySelector it inside every open shadow root
  //        (same traversal as the audit: collectScopesWithCoverage).
  //   (c)  candidate re-scan — query all elements matching the LAST path
  //        segment (tag/class tail, :nth-of-type stripped) across all scopes,
  //        then match on fnv1aHash8(cssPath(el)) === spec.pathHash (exact),
  //        else on the nth-stripped path + accessible name (structural),
  //        else on a unique tail/name match.
  //   (d)  not found → { found:false, reason:"ELEMENT_GONE" }.

  const sanitizeHighlightSpec = (raw) => {
    const s = raw && typeof raw === "object" ? raw : {};
    const str = (v, n) => (typeof v === "string" && v ? v.slice(0, n) : null);
    return {
      path: str(s.path, 1024),
      pathDeep: str(s.pathDeep, 1024),
      pathHash: str(s.pathHash, 16),
      type: str(s.type, 64),
      name: str(s.name, 200),
      severity: str(s.severity, 16),
    };
  };

  const isDeepPath = (p) => typeof p === "string" && p.includes(">>>");
  const stripNth = (s) => String(s || "").replace(/:nth-of-type\(\d+\)/g, "");

  /** Walk a cssPathDeep-format path ("a > b >>> c > d") across open shadow roots. */
  const queryShadowPath = (deepPath) => {
    const parts = String(deepPath || "").split(/\s*>>>\s*/).map(p => p.trim()).filter(Boolean);
    if (!parts.length) return null;
    let root = doc;
    let el = null;
    for (let i = 0; i < parts.length; i++) {
      try { el = root.querySelector(parts[i]); } catch { return null; }
      if (!el) return null;
      if (i < parts.length - 1) {
        root = el.shadowRoot;
        if (!root) return null;
      }
    }
    return el;
  };

  /** Loose accessible-name check — used to verify/disambiguate candidates. */
  const highlightNameMatches = (el, name) => {
    if (!name) return true;
    const want = txt(name, 120).toLowerCase();
    if (!want) return true;
    let got = "";
    try { got = txt(getAccName(el) || el.textContent || "", 120).toLowerCase(); } catch {}
    return !!got && (got === want || got.includes(want) || want.includes(got));
  };

  /**
   * Resolve a highlight spec to a live element via the resolution ladder.
   * `scopes` may be passed in (highlightAll) to avoid re-traversing per spec.
   * Returns { el, resolution } or null (→ ELEMENT_GONE).
   */
  const resolveHighlightTarget = (spec, scopes = null) => {
    let approximate = null; // best name-unverified match, used as last resort
    const remember = (el, resolution) => { if (el && !approximate) approximate = { el, resolution }; };

    // (a) direct querySelector on the document
    if (spec.path && !isDeepPath(spec.path)) {
      try {
        const el = doc.querySelector(spec.path);
        if (el) {
          if (highlightNameMatches(el, spec.name)) return { el, resolution: "path" };
          remember(el, "path");
        }
      } catch {}
    }

    // (a2) snippet cross-shadow path format (">>>" boundaries)
    for (const p of [spec.pathDeep, spec.path]) {
      if (isDeepPath(p)) {
        const el = queryShadowPath(p);
        if (el) {
          if (highlightNameMatches(el, spec.name)) return { el, resolution: "deepPath" };
          remember(el, "deepPath");
        }
      }
    }

    // (b) shadow-DOM-aware walk — audit cssPath is relative to its shadow root
    const allScopes = scopes || collectScopesWithCoverage(doc.documentElement).scopes;
    if (spec.path && !isDeepPath(spec.path)) {
      for (let i = 1; i < allScopes.length; i++) {
        try {
          const el = allScopes[i].root.querySelector(spec.path);
          if (el) {
            if (highlightNameMatches(el, spec.name)) return { el, resolution: "shadowPath" };
            remember(el, "shadowPath");
          }
        } catch {}
      }
    }

    // (c) re-scan candidates matching the tail segment, verify by pathHash/structure/name
    const lastSeg = (() => {
      if (!spec.path) return null;
      const local = String(spec.path).split(">>>").pop();
      const segs = local.split(">").map(s => s.trim()).filter(Boolean);
      return segs.length ? segs[segs.length - 1] : null;
    })();
    if (lastSeg) {
      const tail = stripNth(lastSeg) || lastSeg;
      const wantHash = spec.pathHash || steFnv1aHash8(spec.path);
      const wantLoose = stripNth(spec.path);
      const structural = [];
      const tailMatches = [];
      for (const { root } of allScopes) {
        let els = [];
        try { els = [...root.querySelectorAll(tail)]; } catch {}
        for (const el of els.slice(0, MAX_TAG_CANDIDATES)) {
          let p = "";
          try { p = cssPath(el); } catch {}
          if (p && (p === spec.path || steFnv1aHash8(p) === wantHash)) {
            return { el, resolution: "pathHash" };
          }
          if (p && stripNth(p) === wantLoose) structural.push(el);
          tailMatches.push(el);
        }
      }
      if (spec.name) {
        for (const el of structural) {
          if (highlightNameMatches(el, spec.name)) return { el, resolution: "structural" };
        }
      }
      if (structural.length === 1) return { el: structural[0], resolution: "structural" };
      if (spec.name) {
        for (const el of tailMatches) {
          if (highlightNameMatches(el, spec.name)) return { el, resolution: "tail" };
        }
      }
      if (tailMatches.length === 1) return { el: tailMatches[0], resolution: "tail" };
      if (structural.length) return { el: structural[0], resolution: "structural" };
    }

    // (d) approximate (name-unverified) match beats nothing at all
    return approximate;
  };

  /**
   * Remove the highlight overlay: ring container, keyframes style, and the
   * scroll/resize listener pair. Also removes pre-v6 attribute-based highlight
   * leftovers. Safe to call repeatedly; works even after snippet re-injection
   * (listener refs are kept on window, not in this closure).
   */
  const clearHighlight = () => {
    const st = w[HIGHLIGHT_STATE_KEY];
    if (st) {
      try { w.removeEventListener("scroll", st.onMove, true); } catch {}
      try { w.removeEventListener("resize", st.onMove, true); } catch {}
      if (st.timer) { try { clearTimeout(st.timer); } catch {} }
      try { delete w[HIGHLIGHT_STATE_KEY]; } catch { w[HIGHLIGHT_STATE_KEY] = null; }
    }
    try { doc.getElementById(HIGHLIGHT_CONTAINER_ID)?.remove(); } catch {}
    try { doc.getElementById(HIGHLIGHT_STYLE_ID)?.remove(); } catch {}
    // Legacy (pre-v6) highlight cleanup: injected style + element attribute
    try { doc.getElementById("a11yflow-highlight-style")?.remove(); } catch {}
    try {
      doc.querySelectorAll("[data-a11yflow-highlight]").forEach(el => el.removeAttribute("data-a11yflow-highlight"));
    } catch {}
    return { ok: true, cleared: true };
  };

  /**
   * Draw fixed-position rings (with a small label chip) over resolved targets.
   * Rings track getBoundingClientRect on scroll/resize via a single
   * rAF-throttled listener pair that clearHighlight() detaches.
   */
  const renderHighlightRings = (targets) => {
    clearHighlight();

    const style = doc.createElement("style");
    style.id = HIGHLIGHT_STYLE_ID;
    style.textContent =
      "@keyframes __flowlens_hl_pulse {" +
      " 0%,100% { box-shadow: 0 0 0 4px rgba(255,45,149,0.45), 0 0 14px 6px rgba(255,45,149,0.22); }" +
      " 50% { box-shadow: 0 0 0 3px rgba(255,45,149,0.22), 0 0 6px 3px rgba(255,45,149,0.10); } }";
    (doc.head || doc.documentElement).appendChild(style);

    const container = doc.createElement("div");
    container.id = HIGHLIGHT_CONTAINER_ID;
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483647;pointer-events:none;";

    const multi = targets.length > 1;
    const entries = [];
    for (const t of targets) {
      const color = multi
        ? (HIGHLIGHT_SEV_COLORS[t.spec?.severity] || HIGHLIGHT_SEV_COLORS.info)
        : HIGHLIGHT_ACCENT;
      const ring = doc.createElement("div");
      ring.className = ANNOTATION_CLASS;
      ring.style.cssText =
        `position:fixed;border:3px solid ${color};border-radius:4px;pointer-events:none;` +
        "box-sizing:border-box;animation:__flowlens_hl_pulse 1.4s ease-in-out infinite;";
      const chipText = [t.spec?.type, t.spec?.severity].filter(Boolean).join(" · ");
      if (chipText) {
        const chip = doc.createElement("span");
        chip.style.cssText =
          `position:absolute;top:-22px;left:-3px;background:${color};color:#fff;` +
          "font:bold 11px/16px system-ui;padding:1px 6px;border-radius:3px;white-space:nowrap;" +
          "max-width:240px;overflow:hidden;text-overflow:ellipsis;pointer-events:none;";
        chip.textContent = chipText; // page/panel strings only via textContent
        ring.appendChild(chip);
      }
      container.appendChild(ring);
      entries.push({ el: t.el, ring });
    }
    (doc.body || doc.documentElement).appendChild(container);

    const reposition = () => {
      for (const { el, ring } of entries) {
        if (!el.isConnected) { ring.style.display = "none"; continue; }
        let r;
        try { r = el.getBoundingClientRect(); } catch { continue; }
        ring.style.display = "";
        ring.style.top = (r.top - 4).toFixed(1) + "px";
        ring.style.left = (r.left - 4).toFixed(1) + "px";
        ring.style.width = Math.max(r.width + 8, 12).toFixed(1) + "px";
        ring.style.height = Math.max(r.height + 8, 12).toFixed(1) + "px";
      }
    };
    reposition();

    let rafId = 0;
    const onMove = () => {
      if (rafId) return;
      rafId = w.requestAnimationFrame(() => { rafId = 0; try { reposition(); } catch {} });
    };
    w.addEventListener("scroll", onMove, true);
    w.addEventListener("resize", onMove, true);
    const timer = setTimeout(() => { try { clearHighlight(); } catch {} }, HIGHLIGHT_AUTO_CLEAR_MS);
    w[HIGHLIGHT_STATE_KEY] = { onMove, timer };
  };

  /**
   * Highlight one finding on the page. spec = { path, pathDeep, pathHash,
   * type, name, severity } (all optional strings; path or pathDeep required).
   * Returns { ok:true, found:true, resolution, matched } or
   * { ok:true, found:false, reason:"ELEMENT_GONE" }.
   */
  const highlightTarget = (rawSpec) => {
    const spec = sanitizeHighlightSpec(rawSpec);
    if (!spec.path && !spec.pathDeep) {
      return { ok: true, found: false, reason: "ELEMENT_GONE" };
    }
    const hit = resolveHighlightTarget(spec);
    if (!hit || !isEl(hit.el)) {
      clearHighlight();
      return { ok: true, found: false, reason: "ELEMENT_GONE" };
    }
    let el = hit.el;
    // Zero-size targets (e.g. sr-only) — ring the parent so something is visible
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 && r.height < 2 && el.parentElement && el.parentElement !== doc.body) {
        el = el.parentElement;
      }
    } catch {}
    try { el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch {}
    renderHighlightRings([{ el, spec }]);
    const matched = {
      tag: (el.tagName || "").toLowerCase(),
      role: el.getAttribute?.("role") || undefined,
      labelSnippet: txt(el.getAttribute?.("aria-label") || el.textContent || "", 40) || undefined,
    };
    return { ok: true, found: true, resolution: hit.resolution, matched };
  };

  /**
   * Highlight all findings of one rule type (≤ MAX_HIGHLIGHT_SPECS specs).
   * Renders severity-colored rings with type chips (annotateFindings-style).
   * Returns { ok:true, found, requested, rendered, missing }.
   */
  const highlightAll = (rawSpecs) => {
    const specs = (Array.isArray(rawSpecs) ? rawSpecs : [])
      .slice(0, MAX_HIGHLIGHT_SPECS)
      .map(sanitizeHighlightSpec);
    const { scopes } = collectScopesWithCoverage(doc.documentElement);
    const targets = [];
    const seen = new Set();
    let missing = 0;
    for (const spec of specs) {
      const hit = (spec.path || spec.pathDeep) ? resolveHighlightTarget(spec, scopes) : null;
      if (hit && isEl(hit.el) && !seen.has(hit.el)) {
        seen.add(hit.el);
        targets.push({ el: hit.el, spec });
      } else {
        missing++;
      }
    }
    if (!targets.length) {
      clearHighlight();
      return { ok: true, found: false, requested: specs.length, rendered: 0, missing, reason: "ELEMENT_GONE" };
    }
    try { targets[0].el.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" }); } catch {}
    renderHighlightRings(targets);
    return { ok: true, found: true, requested: specs.length, rendered: targets.length, missing };
  };

  // ---------------- main checks ----------------
  const run = (cfg = {}) => {
    // Apply runtime mode hints if provided (from panel profiles)
    if (cfg.modeHints && typeof cfg.modeHints === "object") {
      modeHints = { ...defaultModeHints, ...cfg.modeHints };
    }

    // Initialize per-run caches
    resetScopeCache();
    resetSelectorCache();

    // Subtree scope: resolve root element
    const rootEl = cfg.rootSelector
      ? doc.querySelector(cfg.rootSelector)
      : doc.documentElement;

    let rootSelectorNotFound = false;
    if (cfg.rootSelector && !rootEl) {
      // Spec: do NOT fail audit when rootSelector not found — fall back to document root
      rootSelectorNotFound = true;
    }
    const effectiveRootEl = rootEl || doc.documentElement;

    // Collect scopes once — returns coverage metadata at zero extra cost
    const { scopes, coverage: shadowCoverage } = collectScopesWithCoverage(effectiveRootEl);
    _scopeCache = scopes;

    const config = {
      strict: cfg.strict ?? true,
      mode: cfg.mode ?? detectMode(),
      maxRows: cfg.maxRows ?? 140,
      wcagLevel: cfg.wcagLevel ?? "2.1-AA"
    };
    const transitionCtx = {
      duringTransition: !!cfg.duringTransition,
      source: cfg.transitionSource || "none",
    };

    const [wcagVersionStr, wcagConformance] = config.wcagLevel.split("-");
    const wcagVersion = parseFloat(wcagVersionStr) || 2.1;
    const isAAA = wcagConformance === "AAA";
    const is22 = wcagVersion >= 2.2;

    const s = sanity(cfg.appMarkers || null);
    const findings = [];
    const cache = createPassCache();

    // Compute aggregate presence flags for rule gating
    const flags = computeAggregateFlags(scopes);

    // Compact rule helper: uses cached deep query across all scopes
    const _q = (sel, type, sev, wcag, test, note, opts) => {
      const elements = cachedQueryAllDeep(sel);
      for (const el of elements) {
        if (isHiddenCached(el, cache)) continue;
        if (test && !test(el)) continue;
        const entry = { type, el, severity: sev, wcag };
        if (note) entry.note = typeof note === "function" ? note(el) : note;
        if (opts) Object.assign(entry, typeof opts === "function" ? opts(el) : opts);
        add(findings, entry);
      }
    };

    // Shadow-aware query aliases — use instead of doc.querySelectorAll inside run()
    const _qa = cachedQueryAllDeep;
    const _q1 = (sel) => cachedQueryAllDeep(sel)[0] || null;

    // If this looks like a "shell" state, warn (use observe/watch during navigation/loader phases).
    if (s.focusables <= 8 && s.landmarks <= 1 && s.headings === 0 && s.roleLog === 0) {
      add(findings, {
        type: "SHELL_OR_MINIMAL_UI",
        severity: "info",
        el: doc.body,
        note: "This looks like a minimal shell. You'll get more findings after content loads (use observe()/watch())."
      });
    }

    // Shadow DOM coverage note — structured metrics (replaces old SHADOW_DOM_DETECTED)
    if (shadowCoverage.scopesFound > 0) {
      const capLine = shadowCoverage.scopesCapped
        ? ` Traversal capped at ${MAX_SHADOW_SCOPES}. Additional shadow roots may not have been audited.`
        : "";
      add(findings, {
        type: "SHADOW_DOM_NOTE",
        severity: "info",
        el: doc.body,
        note: `Open shadow roots found: ${shadowCoverage.scopesFound}. `
          + `Audited: ${shadowCoverage.scopesAudited}.${capLine} `
          + `Max depth observed: ${shadowCoverage.maxDepthObserved}. `
          + `Depth limit reached: ${shadowCoverage.depthLimitReached}. `
          + `Closed shadow roots (if any) cannot be detected or audited.`,
        extra: {
          openShadowRoots: shadowCoverage.scopesFound,
          scopesAudited: shadowCoverage.scopesAudited,
          scopesCapped: shadowCoverage.scopesCapped,
          maxDepthObserved: shadowCoverage.maxDepthObserved,
          depthLimitReached: shadowCoverage.depthLimitReached,
        },
      });
    }

    // -------- Static checks --------

    // 1.1.1 Non-text Content: images missing alt
    _qa("img").forEach(imgEl => {
      if (isHidden(imgEl)) return;
      if (!imgEl.hasAttribute("alt")) add(findings, { type: "IMG_MISSING_ALT", el: imgEl, severity: "medium", wcag: "1.1.1" });
      if (imgEl.getAttribute("alt") === "") add(findings, { type: "IMG_EMPTY_ALT", el: imgEl, severity: "low", wcag: "1.1.1", note: "OK if decorative; otherwise provide meaningful alt." });
    });

    // 4.1.2 Name, Role, Value: interactive controls without accessible name
    _q("button, a, [role='button'], [role='link']", "NO_ACCESSIBLE_NAME", "high", "4.1.2", el => !getAccName(el));

    // 1.3.1 / 3.3.2 / 4.1.2: form controls without label/name
    _qa("input:not([type='hidden']), textarea, select, [role='textbox']").forEach(el => {
      if (isHidden(el)) return;
      const isNative = ["INPUT","TEXTAREA","SELECT"].includes(el.tagName);
      const hasNativeLabel = isNative && ("labels" in el) && el.labels && el.labels.length > 0;
      const hasAria = !!(el.getAttribute("aria-label") || el.getAttribute("aria-labelledby"));
      if (!hasNativeLabel && !hasAria) add(findings, { type: "FORM_CONTROL_NO_LABEL", el, severity: "medium", wcag: "1.3.1 / 3.3.2 / 4.1.2" });
    });

    // 1.3.1 Info and Relationships: heading order sanity (detect skipped levels)
    const headingEls = _qa("h1,h2,h3,h4,h5,h6").filter(h => !isHidden(h));
    const levels = headingEls.map(h => parseInt(h.tagName.slice(1), 10)).filter(Boolean);
    if (levels.length) {
      let last = levels[0];
      for (let i = 1; i < levels.length; i++) {
        const cur = levels[i];
        if (cur > last + 1) {
          add(findings, {
            type: "HEADING_LEVEL_SKIP",
            severity: "low",
            wcag: "1.3.1",
            el: headingEls[i],
            note: `Heading jump: h${last} -> h${cur}`,
            extra: { from: last, to: cur }
          });
        }
        last = cur;
      }
      const h1s = headingEls.filter(h => h.tagName === "H1");
      if (h1s.length === 0) add(findings, { type: "NO_H1", severity: "info", wcag: "1.3.1", el: doc.body, note: "No H1 found (sometimes OK in embedded views; verify intent)." });
      if (h1s.length > 1) add(findings, { type: "MULTIPLE_H1", severity: "info", wcag: "1.3.1", el: h1s[1], note: `Found ${h1s.length} H1 elements.` });
    }

    // Landmarks: missing main (common in microfrontends)
    const hasMain = !!_q1("main,[role='main']");
    if (!hasMain) add(findings, { type: "NO_MAIN_LANDMARK", severity: "low", wcag: "1.3.1", el: doc.body });

    // Regions should be named (best practice; 1.3.1 / 4.1.2)
    _q("[role='region']", "REGION_NO_NAME", "low", "1.3.1 / 4.1.2", el => !((el.getAttribute("aria-label")||"").trim()||(el.getAttribute("aria-labelledby")||"").trim()));

    // 4.1.2: broken ARIA references
    ["aria-labelledby","aria-describedby","aria-controls","aria-owns","aria-activedescendant"].forEach(attr => {
      _qa(`[${attr}]`).forEach(el => {
        if (isHidden(el)) return;
        const val = el.getAttribute(attr);
        if (!val) return;
        val.split(/\s+/).filter(Boolean).forEach(id => {
          if (!doc.getElementById(id)) {
            add(findings, { type: "BROKEN_ARIA_REFERENCE", el, severity: "medium", wcag: "4.1.2", note: `${attr} -> missing "${id}"`, extra: { attr, id } });
          }
        });
      });
    });

    // 4.1.2: aria-labelledby points to aria-hidden=true (often breaks naming)
    _qa("[aria-labelledby]").forEach(el => {
      if (isHidden(el)) return;
      (el.getAttribute("aria-labelledby") || "").split(/\s+/).filter(Boolean).forEach(id => {
        const lbl = doc.getElementById(id);
        if (lbl && lbl.getAttribute("aria-hidden") === "true") {
          add(findings, { type: "ARIA_LABELLEDBY_POINTS_TO_ARIA_HIDDEN", el, severity: "medium", wcag: "4.1.2", extra: { labelId: id } });
        }
      });
    });

    // 2.4.3 Focus Order (heuristic): positive tabindex
    _qa("[tabindex]").forEach(el => {
      if (isHidden(el)) return;
      const v = parseInt(el.getAttribute("tabindex"), 10);
      if (Number.isFinite(v) && v > 0) add(findings, { type: "POSITIVE_TABINDEX", el, severity: "low", wcag: "2.4.3", extra: { tabindex: v } });
    });

    // -------- Chat-aware "soft" checks --------
    const mode = config.mode;
    if (mode === "chat" || mode === "auto") {
      const liveHook = hasAnnouncementHook();
      const logEls = _qa("[role='log']");

      // 4.1.3 Status Messages: role=log usually expects announcements; soft-flag if no aria-live on log.
      logEls.forEach(log => {
        if (isHidden(log)) return;
        if (!log.getAttribute("aria-live")) {
          add(findings, {
            type: "CHAT_LOG_NO_ARIA_LIVE_SOFT",
            el: log,
            severity: liveHook ? "low" : "medium",
            wcag: "4.1.3",
            product: "chat",
            note: liveHook
              ? "role=log has no aria-live, but a live/status hook exists in DOM (manual announcer likely)."
              : "role=log has no aria-live and no live/status hook detected — risk of missing message announcements."
          });
        }
      });

      // Disabled message input: add explanation via aria-describedby (nice-to-have)
      _qa("textarea[disabled], input[disabled]").forEach(inp => {
        if (isHidden(inp)) return;
        const hasDesc = !!(inp.getAttribute("aria-describedby") || inp.getAttribute("title"));
        if (!hasDesc) {
          add(findings, {
            type: "DISABLED_INPUT_NO_EXPLANATION",
            el: inp,
            severity: "low",
            wcag: "3.3.2 / 3.2.2",
            product: "chat",
            note: "Disabled input without aria-describedby/title explaining why."
          });
        }
      });

      // CHAT_MESSAGE_NO_ROLE: Direct children of role=log without semantic role
      logEls.forEach(log => {
        if (isHidden(log)) return;
        [...log.children].forEach(child => {
          if (!isEl(child) || isHidden(child)) return;
          const role = child.getAttribute("role");
          const tag = child.tagName;
          const isSemantic = role || ["LI","ARTICLE","SECTION","P"].includes(tag);
          if (!isSemantic) {
            add(findings, {
              type: "CHAT_MESSAGE_NO_ROLE", el: child, severity: "low", wcag: "1.3.1",
              product: "chat",
              note: `Direct child of role="log" (${tag.toLowerCase()}) has no semantic role — screen readers may not convey message boundaries.`
            });
          }
        });
      });

      // CHAT_INPUT_NO_LABEL: Textarea/input near role=log without label
      const seenChatInputs = new Set();
      logEls.forEach(log => {
        if (isHidden(log)) return;
        const container = log.parentElement || doc.body;
        container.querySelectorAll("textarea, input[type='text'], input:not([type])").forEach(inp => {
          if (seenChatInputs.has(inp)) return;
          seenChatInputs.add(inp);
          if (isHidden(inp)) return;
          const name = getAccName(inp);
          if (!name || name.startsWith("[placeholder]")) {
            add(findings, {
              type: "CHAT_INPUT_NO_LABEL", el: inp, severity: "medium", wcag: "1.3.1 / 4.1.2",
              confidence: "strict", product: "chat",
              note: "Chat input/textarea near role=\"log\" has no accessible label (placeholder alone is insufficient)."
            });
          }
        });
      });

      // CHAT_TIMESTAMP_INACCESSIBLE: Timestamp elements in role=log that are aria-hidden with no alt
      logEls.forEach(log => {
        if (isHidden(log)) return;
        log.querySelectorAll("[aria-hidden='true']").forEach(hidden => {
          const text = (hidden.textContent || "").trim();
          if (!text) return;
          if (!/\d/.test(text)) return; // likely not a timestamp
          if (/(am|pm|:\d{2}|ago|yesterday|today|\d{1,2}\/\d{1,2})/i.test(text)) {
            const parent = hidden.parentElement;
            const parentHasAlt = parent && (parent.getAttribute("aria-label") || parent.getAttribute("title"));
            if (!parentHasAlt) {
              add(findings, {
                type: "CHAT_TIMESTAMP_INACCESSIBLE", el: hidden, severity: "low", wcag: "1.3.1",
                product: "chat",
                note: `Timestamp "${txt(text, 40)}" is aria-hidden with no accessible alternative on parent.`
              });
            }
          }
        });
      });

      // CHAT_SEND_NO_LABEL: Send/submit button near chat input with no accessible name (icon-only)
      logEls.forEach(log => {
        if (isHidden(log)) return;
        const container = log.parentElement || doc.body;
        container.querySelectorAll("button,[role='button'],input[type='submit']").forEach(btn => {
          if (isHidden(btn)) return;
          const name = getAccName(btn);
          if (!name) {
            add(findings, { type: "CHAT_SEND_NO_LABEL", el: btn, severity: "medium", wcag: "4.1.2",
              product: "chat",
              note: "Button near chat log has no accessible name — likely an icon-only send button." });
          }
        });
      });

      // CHAT_AVATAR_NO_ALT: Avatar images inside role=log without alt
      logEls.forEach(log => log.querySelectorAll("img").forEach(img => {
        if (isHidden(img)) return;
        if (!img.hasAttribute("alt")) {
          const src = (img.getAttribute("src") || "").toLowerCase();
          if (/(avatar|profile|photo|user|agent|bot)/i.test(src) || img.closest("[class*='avatar'],[class*='Avatar']")) {
            add(findings, { type: "CHAT_AVATAR_NO_ALT", el: img, severity: "low", wcag: "1.1.1",
              product: "chat",
              note: "Avatar image in chat log has no alt attribute. AT will read the filename." });
          }
        }
      }));

      // CHAT_NO_ARIA_RELEVANT: role=log without aria-relevant
      logEls.forEach(log => {
        if (isHidden(log)) return;
        if (!log.hasAttribute("aria-relevant")) {
          add(findings, { type: "CHAT_NO_ARIA_RELEVANT", el: log, severity: "low", wcag: "4.1.3",
            product: "chat",
            note: 'role="log" without aria-relevant. Add aria-relevant="additions" so only new messages are announced.' });
        }
      });

      // CHAT_TYPING_NO_ANNOUNCEMENT: Typing indicator with no live region
      logEls.forEach(log => {
        if (isHidden(log)) return;
        const container = log.parentElement || doc.body;
        const typingEls = container.querySelectorAll("[class*='typing'],[class*='Typing'],[data-testid*='typing'],[data-testid*='Typing']");
        typingEls.forEach(el => {
          const inLive = el.closest("[aria-live]");
          if (!inLive) {
            add(findings, { type: "CHAT_TYPING_NO_ANNOUNCEMENT", el, severity: "low", wcag: "4.1.3",
              product: "chat",
              note: "Typing indicator is not inside an aria-live region. Screen readers won't announce when someone is typing." });
          }
        });
      });

      // CHAT_NO_LIVE_REGION_FOR_MESSAGES: Scrollable container with messages but no live region
      {
        const seenContainers = new Set();
        // Candidate containers: role=log/feed, scrollable containers near inputs, aria-label matching chat/message
        const candidates = [
          ..._qa("[role='log']"), ..._qa("[role='feed']"),
          ..._qa("[aria-label]").filter(el => /chat|message/i.test(el.getAttribute("aria-label") || "")),
        ];
        candidates.forEach(container => {
          if (seenContainers.has(container) || isHidden(container)) return;
          seenContainers.add(container);
          const role = container.getAttribute("role");
          // Skip if already has role=log/feed (those ARE live region patterns)
          if (role === "log" || role === "feed") return;
          // Check: 3+ direct children and no aria-live
          const directChildren = container.children;
          if (directChildren && directChildren.length >= 3 && !container.getAttribute("aria-live")) {
            add(findings, {
              type: "CHAT_NO_LIVE_REGION_FOR_MESSAGES", el: container, severity: "medium", wcag: "4.1.3",
              confidence: "strict", product: "chat",
              note: "Container with 3+ message-like children lacks aria-live and role=log/feed. Screen readers won't announce new messages."
            });
          }
        });
      }

      // CHAT_QUICK_REPLY_NOT_BUTTON: Quick-reply/chip/suggestion elements that aren't proper buttons
      {
        const chipCandidates = _qa("[class*='quick' i],[class*='suggest' i],[class*='chip' i]");
        const cap = Math.min(chipCandidates.length, 200);
        for (let i = 0; i < cap; i++) {
          const el = chipCandidates[i];
          if (isHidden(el)) continue;
          const tag = el.tagName.toLowerCase();
          if (tag === "button" || tag === "a") continue;
          const role = el.getAttribute("role");
          if (role === "button" || role === "link") continue;
          if (el.getAttribute("tabindex") !== null && role) continue;
          // Check if it's a div/span that looks interactive but isn't semantic
          if (tag === "div" || tag === "span") {
            add(findings, {
              type: "CHAT_QUICK_REPLY_NOT_BUTTON", el, severity: "medium", wcag: "4.1.2",
              confidence: "strict", product: "chat",
              note: "Quick-reply / suggestion chip is a <" + tag + "> instead of <button>. Not keyboard accessible and role is not communicated."
            });
          }
        }
      }

      // CHAT_LIVE_REGION_ASSERTIVE_MISUSE: Chat log/feed with aria-live="assertive" (should use polite)
      {
        const seenAssertive = new Set();
        const liveContainers = [..._qa("[role='log'][aria-live='assertive']"), ..._qa("[role='feed'][aria-live='assertive']")];
        liveContainers.forEach(el => {
          if (seenAssertive.has(el) || isHidden(el)) return;
          seenAssertive.add(el);
          add(findings, {
            type: "CHAT_LIVE_REGION_ASSERTIVE_MISUSE", el, severity: "medium", wcag: "4.1.3",
            confidence: "heuristic", product: "chat",
            note: "Chat log/feed uses aria-live=\"assertive\" which interrupts the user. Consider aria-live=\"polite\" for message feeds."
          });
        });
      }

      // CHAT_SCROLL_REGION_NOT_FOCUSABLE: Scrollable chat container not keyboard-reachable
      {
        const scrollContainers = [..._qa("[role='log']"), ..._qa("[role='feed']")];
        const cap = Math.min(scrollContainers.length, 50);
        for (let i = 0; i < cap; i++) {
          const el = scrollContainers[i];
          if (isHidden(el)) continue;
          const style = win.getComputedStyle ? win.getComputedStyle(el) : null;
          const isScrollable = style && (style.overflowY === "auto" || style.overflowY === "scroll");
          if (!isScrollable) continue;
          const ti = el.getAttribute("tabindex");
          const role = el.getAttribute("role");
          // role=log/feed alone doesn't make it focusable; needs tabindex
          if (ti === null || ti === "") {
            add(findings, {
              type: "CHAT_SCROLL_REGION_NOT_FOCUSABLE", el, severity: "low", wcag: "2.1.1",
              confidence: "heuristic", product: "chat",
              note: "Scrollable chat region is not focusable via keyboard. Add tabindex=\"0\" so keyboard users can scroll."
            });
          }
        }
      }

      // MESSAGE_NOT_GROUPED: Messages in log/feed lack grouping semantics
      {
        const feedContainers = [..._qa("[role='log']"), ..._qa("[role='feed']")];
        const seenFeeds = new Set();
        feedContainers.forEach(container => {
          if (seenFeeds.has(container) || isHidden(container)) return;
          seenFeeds.add(container);
          const children = container.children;
          if (!children || children.length < 3) return;
          // Count direct children that are bare div/span without role or list semantics
          let bareCount = 0;
          const checkLimit = Math.min(children.length, 50);
          for (let i = 0; i < checkLimit; i++) {
            const child = children[i];
            const tag = child.tagName.toLowerCase();
            if ((tag === "div" || tag === "span") && !child.getAttribute("role")) {
              bareCount++;
            }
          }
          if (bareCount >= 3) {
            add(findings, {
              type: "MESSAGE_NOT_GROUPED", el: container, severity: "low", wcag: "1.3.1",
              confidence: "advisory", product: "chat",
              note: "Chat log/feed has 3+ direct children without grouping roles (e.g., role=\"listitem\", role=\"article\"). Consider semantic grouping for assistive technology."
            });
          }
        });
      }
    }

    // -------- Help center tree checks --------
    if (mode === "helpcenter-tree" || mode === "auto") {
      // HC_TREE_ITEM_NO_NAME: treeitem without accessible name
      _q("[role='treeitem']", "HC_TREE_ITEM_NO_NAME", "high", "4.1.2", el => !getAccName(el), 'role="treeitem" has no accessible name — screen readers cannot announce this item.', { product: "helpcenter" });

      // HC_TREE_NO_ARIA_EXPANDED: treeitem with child group but no aria-expanded
      _qa("[role='treeitem']").forEach(el => {
        if (isHidden(el)) return;
        const hasGroup = el.querySelector("[role='group']") || (el.nextElementSibling && el.nextElementSibling.getAttribute("role") === "group");
        if (hasGroup && !el.hasAttribute("aria-expanded")) {
          add(findings, {
            type: "HC_TREE_NO_ARIA_EXPANDED", el, severity: "medium", wcag: "4.1.2",
            product: "helpcenter",
            note: "role=\"treeitem\" has a child role=\"group\" but no aria-expanded — screen readers cannot convey expand/collapse state."
          });
        }
      });
    }

    // -------- Help center article check --------
    if (mode === "helpcenter-bot" || mode === "helpcenter-tree" || mode === "auto") {
      _qa("article, [role='article']").forEach(el => {
        if (isHidden(el)) return;
        const textLen = (el.textContent || "").trim().length;
        if (textLen < 100) return;
        const hasHeading = !!el.querySelector("h1,h2,h3,h4,h5,h6,[role='heading']");
        if (!hasHeading) {
          add(findings, {
            type: "HC_ARTICLE_NO_HEADING", el, severity: "medium", wcag: "1.3.1 / 2.4.6",
            product: "helpcenter",
            note: `Article with ${textLen} chars of text has no heading — screen reader users cannot navigate its structure.`
          });
        }
      });

      // HC_SEARCH_NO_LABEL: Search input without accessible label
      _qa("input[type='search'],input[placeholder*='earch' i],input[placeholder*='Find' i],[role='searchbox']").forEach(inp => {
        if (isHidden(inp)) return;
        const name = getAccName(inp);
        if (!name || name.startsWith("[placeholder]")) {
          add(findings, { type: "HC_SEARCH_NO_LABEL", el: inp, severity: "medium", wcag: "1.3.1 / 4.1.2",
            product: "helpcenter",
            note: "Search input has no accessible label (placeholder alone is insufficient)." });
        }
      });

      // HC_BREADCRUMB_NO_LABEL: Breadcrumb nav without aria-label
      _qa("nav").forEach(nav => {
        if (isHidden(nav)) return;
        const links = nav.querySelectorAll("a[href]");
        if (links.length < 2) return;
        const hasSep = nav.textContent.match(/[›»>\/]/);
        const hasBreadcrumbClass = /breadcrumb/i.test(nav.className || "");
        if ((hasSep || hasBreadcrumbClass) && !nav.hasAttribute("aria-label") && !nav.hasAttribute("aria-labelledby")) {
          add(findings, { type: "HC_BREADCRUMB_NO_LABEL", el: nav, severity: "low", wcag: "1.3.1",
            product: "helpcenter",
            note: 'Breadcrumb <nav> has no aria-label. Add aria-label="Breadcrumb" to distinguish from other nav elements.' });
        }
      });

      // HC_ACCORDION_NO_STATE: Accordion/FAQ trigger button without aria-expanded
      _qa("button,[role='button']").forEach(btn => {
        if (isHidden(btn)) return;
        if (btn.hasAttribute("aria-expanded")) return;
        const next = btn.nextElementSibling;
        const parent = btn.parentElement;
        const isAccordionLike =
          /accordion|faq|collaps|expand/i.test(btn.className || "") ||
          /accordion|faq|collaps|expand/i.test(parent?.className || "") ||
          (next && (next.hasAttribute("hidden") || /accordion|panel|collaps/i.test(next.className || "")));
        if (isAccordionLike) {
          add(findings, { type: "HC_ACCORDION_NO_STATE", el: btn, severity: "medium", wcag: "4.1.2",
            product: "helpcenter",
            note: "Accordion trigger button has no aria-expanded. Screen readers cannot convey open/closed state." });
        }
      });
    }

    // -------- General checks (any mode) --------

    // LIVE_REGION_HIDDEN: aria-live region with display:none or visibility:hidden
    _qa("[aria-live]").forEach(el => {
      if (!el.getAttribute("aria-live")) return;
      try {
        const cs = w.getComputedStyle(el);
        if (cs.display === "none" || cs.visibility === "hidden") {
          add(findings, {
            type: "LIVE_REGION_HIDDEN", el, severity: "medium", wcag: "4.1.3",
            note: `aria-live="${el.getAttribute("aria-live")}" region is hidden (${cs.display === "none" ? "display:none" : "visibility:hidden"}) — announcements will never fire.`
          });
        }
      } catch {}
    });

    // COMBOBOX_NO_LISTBOX: role=combobox without associated listbox/tree/grid
    _qa("[role='combobox']").forEach(el => {
      if (isHidden(el)) return;
      const owns = el.getAttribute("aria-owns") || el.getAttribute("aria-controls") || "";
      const ownedIds = owns.split(/\s+/).filter(Boolean);
      const hasPopup = ownedIds.some(id => {
        const target = doc.getElementById(id);
        if (!target) return false;
        const r = target.getAttribute("role");
        return r === "listbox" || r === "tree" || r === "grid";
      });
      // Also check for a listbox/tree/grid child
      const hasChild = !!el.querySelector("[role='listbox'],[role='tree'],[role='grid']");
      if (!hasPopup && !hasChild) {
        add(findings, {
          type: "COMBOBOX_NO_LISTBOX", el, severity: "medium", wcag: "4.1.2",
          note: "role=\"combobox\" has no associated listbox/tree/grid via aria-owns/aria-controls or as a descendant."
        });
      }
    });

    // -------- Loader/status smell --------
    RULE_REGISTRY.LOADER_WITHOUT_ANNOUNCEMENT_HOOK.run({ findings });

    // -------- Additional checks --------

    // 4.1.1 Parsing: duplicate IDs (breaks ARIA references in microfrontends)
    // Pass 1: collect all elements per ID
    const idElements = new Map();
    _qa("[id]").forEach(el => {
      const id = el.id;
      if (!id) return;
      if (!idElements.has(id)) idElements.set(id, []);
      idElements.get(id).push(el);
    });
    // Pass 1.5: build set of IDs referenced by ARIA attrs
    const ariaReferencedIds = new Set();
    ["aria-labelledby","aria-describedby","aria-controls","aria-owns","aria-activedescendant"].forEach(attr => {
      _qa(`[${attr}]`).forEach(el => {
        (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean).forEach(id => ariaReferencedIds.add(id));
      });
    });
    // Pass 2: report every occurrence of duplicated IDs
    for (const [id, elements] of idElements) {
      if (elements.length < 2) continue;
      const ariaReferenced = ariaReferencedIds.has(id);
      const sev = ariaReferenced ? "high" : "medium";
      elements.forEach((el, idx) => {
        add(findings, {
          type: "DUPLICATE_ID", el, severity: sev, wcag: "4.1.1",
          note: `Duplicate id="${id}" (${idx + 1}/${elements.length})${ariaReferenced ? " — referenced by ARIA attributes" : ""}.`,
          extra: { id, occurrence: idx + 1, total: elements.length, ariaReferenced }
        });
      });
    }

    // 2.4.7 Focus Visible: interactive elements suppressing outline without replacement
    RULE_REGISTRY.FOCUS_VISIBLE_SUPPRESSED.run({ findings });

    // 2.4.1 Bypass Blocks: skip navigation link
    const skipLink = _q1("a[href='#main'],a[href='#content'],a[href='#maincontent'],[class*='skip-nav'],[class*='skipnav'],[class*='skip-link'],a[class*='skip']");
    if (!skipLink && s.landmarks >= 3) {
      add(findings, { type: "NO_SKIP_NAV", severity: "low", wcag: "2.4.1", el: doc.body, note: "No skip-navigation link detected. Important for keyboard users, especially in webview." });
    }

    // 1.3.5 Identify Input Purpose: autocomplete on common form fields
    _qa("input[type='text'],input[type='email'],input[type='tel'],input[type='url'],input:not([type])").forEach(el => {
      if (isHidden(el)) return;
      if (el.closest("form") || el.closest("[role='form']")) {
        const name = (el.getAttribute("name") || el.getAttribute("id") || "").toLowerCase();
        const autocompleteable = /(name|email|phone|tel|address|city|zip|postal|country|username)/.test(name);
        if (autocompleteable && !el.getAttribute("autocomplete")) {
          add(findings, { type: "MISSING_AUTOCOMPLETE", el, severity: "low", wcag: "1.3.5", note: `Input "${name}" likely needs autocomplete attribute for autofill support.` });
        }
      }
    });

    // 2.1.1 Keyboard: clickable custom controls missing reliable keyboard support
    _qa("[onclick],[role='button'],[role='link']").forEach(el => {
      if (isHidden(el) || hasInertAncestor(el)) return;
      if ((el.getAttribute("aria-hidden") || "").toLowerCase() === "true") return;
      if ((el.getAttribute("aria-disabled") || "").toLowerCase() === "true") return;
      if (el.hasAttribute("disabled")) return;
      if (isNativeInteractiveControl(el)) return;

      const role = (el.getAttribute("role") || "").toLowerCase();
      const clickSelf = el.hasAttribute("onclick");
      const clickAncestor = getAncestorClickMeta(el, 3);
      const hasClickHint = clickSelf || clickAncestor.hasHandler || hasPointerCursor(el) || role === "button" || role === "link";
      if (!hasClickHint) return;

      const clickHandlerScope = clickSelf ? "self" : (clickAncestor.hasHandler ? "ancestor" : "delegated");
      const tabIndex = el.getAttribute("tabindex");
      const keyboardReachable = isKeyboardReachable(el);
      const selfKeyMeta = getInlineKeyboardMeta(el);
      const ancestorKeyMeta = getAncestorKeyboardMeta(el, 3);
      const globalKeyMeta = getGlobalKeyboardMeta();
      const hasKeyHandlerSelf = selfKeyMeta.hasHandler;
      const hasKeyHandlerAncestor = ancestorKeyMeta.hasHandler;
      const hasKeyHandlerGlobal = globalKeyMeta.hasHandler;
      const selfHasActivation = selfKeyMeta.activationKeys.includes("Enter") || selfKeyMeta.activationKeys.includes("Space");
      const keydownScope = hasKeyHandlerSelf
        ? "self"
        : hasKeyHandlerAncestor
          ? "ancestor"
          : hasKeyHandlerGlobal
            ? "global"
            : "none";
      const activationKeysObserved = keydownScope === "self"
        ? selfKeyMeta.activationKeys
        : keydownScope === "ancestor"
          ? ancestorKeyMeta.activationKeys
          : keydownScope === "global"
            ? globalKeyMeta.activationKeys
            : [];

      if (!keyboardReachable) {
        add(findings, {
          type: "CLICK_WITHOUT_KEYBOARD",
          el,
          severity: "low",
          wcag: "2.1.1",
          confidence: "advisory",
          note: "Clickable custom control is not keyboard reachable. Verify tabindex/focus order and keyboard activation manually.",
          extra: {
            role: role || null,
            tabIndex,
            hasClickHandler: hasClickHint,
            clickHandlerScope,
            keyboardReachable,
            hasKeyHandlerSelf,
            hasKeyHandlerAncestor,
            keyHandlerScope: keydownScope,
            handlerDistance: ancestorKeyMeta.distance,
            activationKeysObserved,
            activationUnproven: true,
          },
          fix: "Make this control keyboard reachable (tabindex=0 when appropriate) and ensure Enter/Space activation."
        });
        return;
      }

      if (selfHasActivation) return;

      if (hasKeyHandlerAncestor || hasKeyHandlerGlobal) {
        add(findings, {
          type: "CLICK_WITHOUT_KEYBOARD",
          el,
          severity: "low",
          wcag: "2.1.1",
          confidence: "advisory",
          note: "Keyboard handling appears to be delegated on ancestor/global scope. Activation for this element is not proven.",
          extra: {
            role: role || null,
            tabIndex,
            hasClickHandler: hasClickHint,
            clickHandlerScope,
            keyboardReachable,
            hasKeyHandlerSelf,
            hasKeyHandlerAncestor,
            keyHandlerScope: keydownScope,
            handlerDistance: ancestorKeyMeta.distance,
            activationKeysObserved,
            activationUnproven: true,
          },
          fix: "Verify Enter/Space activates this control. Keep delegated handlers tied to explicit target checks."
        });
        return;
      }

      add(findings, {
        type: "CLICK_WITHOUT_KEYBOARD",
        el,
        severity: role === "button" || role === "link" ? "high" : "medium",
        wcag: "2.1.1",
        confidence: "strict",
        note: "Clickable custom control is focusable but no keyboard activation handler was detected.",
        extra: {
          role: role || null,
          tabIndex,
          hasClickHandler: hasClickHint,
          clickHandlerScope,
          keyboardReachable,
          hasKeyHandlerSelf,
          hasKeyHandlerAncestor,
          keyHandlerScope: "none",
          handlerDistance: null,
          activationKeysObserved: [],
          activationUnproven: false,
        },
      });
    });

    // 4.1.2: aria-hidden="true" containing focusable elements
    const seenAriaHiddenFocusable = new Set();
    _qa("[aria-hidden='true']").forEach(container => {
      if (container.parentElement?.closest?.("[aria-hidden='true']")) return;
      if (isHidden(container)) return;
      if (hasInertAncestor(container)) return;
      const containerPath = cssPath(container);
      const containerRole = container.getAttribute("role") || null;
      const ariaHiddenValue = container.getAttribute("aria-hidden");
      const inertPresent = !!(container.inert || container.hasAttribute("inert"));
      const containerTransitioning = transitionCtx.duringTransition || isLikelyTransitioning(container);
      container.querySelectorAll(focusableSelector).forEach(el => {
        if (isHidden(el) || hasInertAncestor(el)) return;
        if (isLikelyFocusSentinel(el)) return;
        const childPath = cssPath(el);
        const dedupeKey = `${containerPath}=>${childPath}`;
        if (seenAriaHiddenFocusable.has(dedupeKey)) return;
        seenAriaHiddenFocusable.add(dedupeKey);
        if (!isKeyboardReachable(el)) return;
        if (!isLikelyActionable(el)) return;
        const ti = el.getAttribute("tabindex");
        if (ti !== null && parseInt(ti, 10) < 0) return;
        const strictViolation = !containerTransitioning && !inertPresent;
        add(findings, {
          type: "ARIA_HIDDEN_FOCUSABLE",
          el,
          severity: strictViolation ? "high" : "low",
          wcag: "4.1.2",
          confidence: strictViolation ? "strict" : "advisory",
          note: strictViolation
            ? "Keyboard-reachable actionable element exists inside aria-hidden=true content."
            : "Focusable element found in aria-hidden container during transition-like state; verify final focus state.",
          extra: {
            containerPath,
            focusableChildPath: childPath,
            containerRole,
            ariaHiddenValue,
            inertPresent,
            focusableType: focusableTypeForEvidence(el),
            reachabilityReason: keyboardReachabilityReason(el),
            tabIndex: ti,
            keyboardReachable: true,
            actionable: true,
            duringTransition: containerTransitioning,
            transitionSource: transitionCtx.source,
          }
        });
      });
    });

    // 4.1.2: ARIA required properties missing (aria-query data when vendored,
    // hand-maintained REQUIRED_ARIA_PROPS fallback otherwise)
    Object.entries(EFFECTIVE_REQUIRED_ARIA_PROPS).forEach(([role, attrs]) => {
      _qa(`[role="${role}"]`).forEach(el => {
        if (isHidden(el)) return;
        for (const attr of attrs) {
          if (!el.hasAttribute(attr)) {
            add(findings, { type: "ARIA_REQUIRED_ATTR_MISSING", el, severity: "medium", wcag: "4.1.2", note: `role="${role}" requires ${attr}.`, extra: { role, attr } });
          }
        }
      });
    });

    // 2.5.8 Target Size (Minimum): interactive elements smaller than 24x24px
    _qa("button,a[href],[role='button'],[role='link'],input:not([type='hidden']),select,textarea").forEach(el => {
      if (isHidden(el) || hasInertAncestor(el)) return;
      if ((el.getAttribute("aria-disabled") || "").toLowerCase() === "true") return;
      if (el.hasAttribute("disabled")) return;
      const hasProxyTarget = hasLargerInteractiveAncestor(el);
      if (hasProxyTarget) return;
      if (!isLikelyActionable(el) && !isNativeInteractiveControl(el)) return;
      const r = el.getBoundingClientRect();
      const width = Math.round(r.width);
      const height = Math.round(r.height);
      if (width > 0 && height > 0 && (width < 24 || height < 24)) {
        const inlineTextLink = isInlineTextLinkException(el);
        if (inlineTextLink) return;
        let display = null;
        try { display = w.getComputedStyle(el).display; } catch {}
        add(findings, {
          type: "TOUCH_TARGET_TOO_SMALL",
          el,
          severity: "low",
          note: `Size ${width}x${height}px is below 24x24px. Verify target size/hit area meets WCAG 2.2.`,
          extra: {
            width,
            height,
            display,
            inlineTextLinkException: inlineTextLink,
            proxyTargetAncestor: hasProxyTarget,
          },
          fix: "Verify clickable hit-area is at least 24x24px. If hit-area is expanded by wrapper/pseudo-element, this finding may be ignored."
        });
      }
    });

    // 1.3.1: Data tables without headers
    _qa("table").forEach(table => {
      if (isHidden(table)) return;
      const role = table.getAttribute("role");
      if (role === "presentation" || role === "none") return;
      const ths = table.querySelectorAll("th");
      const tds = table.querySelectorAll("td");
      if (tds.length > 0 && ths.length === 0) {
        add(findings, { type: "TABLE_NO_HEADERS", el: table, severity: "medium", wcag: "1.3.1", note: "Data table has no <th> elements." });
      }
    });

    // 2.5.3 Label in Name: visible text not included in accessible name
    _qa("button[aria-label],a[aria-label],[role='button'][aria-label],[role='link'][aria-label]").forEach(el => {
      if (isHidden(el)) return;
      const ariaLabel = (el.getAttribute("aria-label") || "").toLowerCase().trim();
      const visibleText = txt(el.textContent, 100).toLowerCase().trim();
      if (visibleText && ariaLabel && visibleText.length > 2 && !ariaLabel.includes(visibleText)) {
        add(findings, { type: "LABEL_NOT_IN_NAME", el, severity: "medium", wcag: "2.5.3", note: `Visible text "${txt(el.textContent,40)}" not in aria-label "${txt(el.getAttribute("aria-label"),40)}".` });
      }
    });

    // 3.1.1 Language of Page
    if (!doc.documentElement.getAttribute("lang")) {
      add(findings, { type: "MISSING_LANG", severity: "medium", wcag: "3.1.1", el: doc.documentElement, note: "html element missing lang attribute." });
    }

    // 1.4.4 / 1.4.10: viewport restricting zoom (important in webview)
    const viewport = doc.querySelector("meta[name='viewport']");
    if (viewport) {
      const content = (viewport.getAttribute("content") || "").toLowerCase();
      if (/user-scalable\s*=\s*no/.test(content) || /maximum-scale\s*=\s*1([^.]|$)/.test(content)) {
        add(findings, { type: "VIEWPORT_ZOOM_DISABLED", severity: "medium", wcag: "1.4.4", el: viewport, note: "Viewport disables user zoom — fails WCAG in webview contexts." });
      }
    }

    // -------- Tier 1: Extended checks --------

    // 4.1.2: aria-hidden on body/html hides entire page from AT
    if (doc.body?.getAttribute("aria-hidden") === "true" || doc.documentElement.getAttribute("aria-hidden") === "true") {
      add(findings, { type: "ARIA_HIDDEN_ON_BODY", severity: "high", wcag: "4.1.2",
        el: doc.body?.getAttribute("aria-hidden") === "true" ? doc.body : doc.documentElement,
        note: 'aria-hidden="true" on <body> or <html> hides the entire page from assistive technology.' });
    }

    // 2.4.2: Document title missing or empty
    const titleEl = doc.querySelector("title");
    if (!titleEl || !titleEl.textContent.trim()) {
      add(findings, { type: "DOCUMENT_TITLE_MISSING", severity: "medium", wcag: "2.4.2",
        el: doc.head || doc.documentElement, note: "Page has no <title> or title is empty." });
    }

    // 2.2.1: Meta refresh auto-redirect
    const metaRefresh = doc.querySelector("meta[http-equiv='refresh' i]");
    if (metaRefresh) {
      add(findings, { type: "META_REFRESH", severity: "high", wcag: "2.2.1", el: metaRefresh,
        note: "meta refresh detected. This can disorient users and cause content to change unexpectedly." });
    }

    // 1.4.2: Autoplay audio/video without muted
    _q("audio[autoplay],video[autoplay]", "NO_AUTOPLAY_AUDIO", "high", "1.4.2", el => !el.hasAttribute("muted"), el => `<${el.tagName.toLowerCase()}> has autoplay without muted. May play audio automatically.`);

    // 3.1.1: HTML lang attribute has invalid value
    const langVal = doc.documentElement.getAttribute("lang");
    if (langVal) {
      const langPrimary = langVal.split("-")[0].toLowerCase();
      if (!/^[a-z]{2,3}$/.test(langPrimary)) {
        add(findings, { type: "HTML_LANG_VALID", severity: "medium", wcag: "3.1.1",
          el: doc.documentElement, note: `lang="${langVal}" is not a valid language tag.`,
          extra: { lang: langVal } });
      }
    }

    // 4.1.2: Nested interactive elements (button inside link, link inside button, etc.)
    _qa("button,a[href],[role='button'],[role='link']").forEach(outer => {
      if (isHidden(outer)) return;
      const nested = outer.querySelectorAll("button,a[href],input:not([type='hidden']),select,textarea,[role='button'],[role='link'],[role='checkbox'],[role='radio'],[tabindex]");
      nested.forEach(inner => {
        if (inner === outer) return;
        const ti = inner.getAttribute("tabindex");
        if (ti !== null && parseInt(ti, 10) < 0) return;
        add(findings, { type: "NESTED_INTERACTIVE", severity: "high", wcag: "4.1.2", el: inner,
          note: `Interactive <${inner.tagName.toLowerCase()}> nested inside <${outer.tagName.toLowerCase()}>. Creates unpredictable AT behavior.`,
          extra: { outer: outer.tagName.toLowerCase(), inner: inner.tagName.toLowerCase() } });
      });
    });

    // 1.3.1: Empty headings
    _q("h1,h2,h3,h4,h5,h6,[role='heading']", "EMPTY_HEADING", "medium", "1.3.1", el => !getAccName(el).trim(), el => `Empty ${el.tagName?.toLowerCase()||'heading'} element provides no navigation value for AT users.`);

    // 1.3.1: Empty table headers
    _q("th", "EMPTY_TABLE_HEADER", "medium", "1.3.1", el => !getAccName(el).trim()&&!el.textContent.trim(), "Empty <th> element. Screen readers use header text to describe table cell context.");

    // 4.1.2: Dialog without accessible name
    _q("dialog,[role='dialog'],[role='alertdialog']", "DIALOG_NO_ACCESSIBLE_NAME", "high", "4.1.2", el => !getAccName(el).trim(), "Dialog has no accessible name. Add aria-label or aria-labelledby.");

    // 2.4.4: Suspicious link text
    const suspiciousLinkRe = /^(click here|here|read more|more|learn more|link|this|go|download|details|continue|info|page|this page|this link)$/i;
    _qa("a[href]").forEach(el => {
      if (isHidden(el)) return;
      const linkText = (el.textContent || "").trim();
      if (linkText && suspiciousLinkRe.test(linkText)) {
        add(findings, { type: "LINK_SUSPICIOUS_TEXT", severity: "low", wcag: "2.4.4", el,
          note: `Link text "${txt(linkText, 30)}" is not descriptive of the destination.`,
          extra: { text: txt(linkText, 30) } });
      }
    });

    // 2.1.1: Scrollable container not keyboard-accessible
    _qa("div,section,article,aside,nav,ul,ol").forEach(el => {
      if (isHidden(el)) return;
      try {
        const cs = w.getComputedStyle(el);
        const scrollable = cs.overflowY === "scroll" || cs.overflowY === "auto" || cs.overflowX === "scroll" || cs.overflowX === "auto";
        if (!scrollable) return;
        if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return;
        if (el.getAttribute("tabindex") !== null) return;
        if (el.querySelector("a[href],button,input,select,textarea,[tabindex]")) return;
        add(findings, { type: "SCROLLABLE_NOT_FOCUSABLE", severity: "medium", wcag: "2.1.1", el,
          note: "Scrollable container is not keyboard-accessible. Mouse-only users can scroll; keyboard users cannot." });
      } catch {}
    });

    // 4.1.2: Invalid ARIA role value
    _qa("[role]").forEach(el => {
      if (isHidden(el)) return;
      const roleRaw = (el.getAttribute("role") || "").trim().toLowerCase();
      if (!roleRaw) return;
      const rolePrimary = roleRaw.split(/\s+/)[0];
      if (!EFFECTIVE_VALID_ROLES.has(rolePrimary)) {
        add(findings, { type: "ARIA_VALID_ROLE", severity: "high", wcag: "4.1.2", el,
          note: `role="${rolePrimary}" is not a valid WAI-ARIA role.`, extra: { role: rolePrimary } });
      }
    });

    // 4.1.2: Invalid aria-* attribute names (typos)
    {
      const allEls = _qa("*");
      const elLimit = Math.min(allEls.length, 3000);
      for (let i = 0; i < elLimit; i++) {
        const el = allEls[i];
        for (const attr of el.attributes) {
          if (!attr.name.startsWith("aria-")) continue;
          if (VALID_ARIA_ATTRS.has(attr.name)) continue;
          let suggestion = null;
          for (const valid of VALID_ARIA_ATTRS) {
            if (Math.abs(valid.length - attr.name.length) <= 2 && valid.startsWith(attr.name.slice(0, 6))) {
              suggestion = valid; break;
            }
          }
          add(findings, { type: "ARIA_VALID_ATTR", severity: "high", wcag: "4.1.2", el,
            note: `"${attr.name}" is not a recognized ARIA attribute.`,
            extra: { attr: attr.name, suggestion } });
        }
      }
    }

    // 1.3.1: ARIA required children missing
    for (const [parentRole, childRoleSets] of Object.entries(EFFECTIVE_REQUIRED_CHILDREN)) {
      _qa(`[role="${parentRole}"]`).forEach(el => {
        if (isHidden(el)) return;
        const children = el.querySelectorAll("[role]");
        const childRoles = new Set([...children].map(c => c.getAttribute("role")));
        for (const acceptable of childRoleSets) {
          if (acceptable.some(r => childRoles.has(r))) continue;
          const hasNativeChild = (parentRole === "list" && el.querySelector("li")) ||
            (parentRole === "table" && el.querySelector("tr")) ||
            (parentRole === "grid" && el.querySelector("tr")) ||
            (parentRole === "radiogroup" && el.querySelector("input[type='radio']"));
          if (hasNativeChild) return;
          add(findings, { type: "ARIA_REQUIRED_CHILDREN", severity: "high", wcag: "1.3.1", el,
            note: `role="${parentRole}" requires child with role="${acceptable.join('" or "')}".`,
            extra: { role: parentRole, expected: acceptable.join("|") } });
        }
      });
    }

    // 1.3.1: ARIA required parent context missing
    for (const [childRole, parentRoles] of Object.entries(EFFECTIVE_REQUIRED_PARENT)) {
      _qa(`[role="${childRole}"]`).forEach(el => {
        if (isHidden(el)) return;
        let parent = el.parentElement;
        let found = false;
        while (parent && parent !== doc.body) {
          const pRole = parent.getAttribute("role");
          if (pRole && parentRoles.includes(pRole)) { found = true; break; }
          const tag = parent.tagName;
          if (childRole === "listitem" && (tag === "UL" || tag === "OL")) { found = true; break; }
          if (childRole === "row" && (tag === "TABLE" || tag === "THEAD" || tag === "TBODY" || tag === "TFOOT")) { found = true; break; }
          if ((childRole === "cell" || childRole === "columnheader" || childRole === "rowheader") && tag === "TR") { found = true; break; }
          parent = parent.parentElement;
        }
        if (!found) {
          add(findings, { type: "ARIA_REQUIRED_PARENT", severity: "high", wcag: "1.3.1", el,
            note: `role="${childRole}" must be owned by role="${parentRoles.join('" or "')}".`,
            extra: { role: childRole, expected: parentRoles.join("|") } });
        }
      });
    }

    // 4.1.2: ARIA attribute not allowed on this role
    {
      const DENIED_ATTRS = {
        textbox: new Set(["aria-checked","aria-selected","aria-pressed"]),
        img: new Set(["aria-expanded","aria-checked","aria-pressed","aria-selected"]),
        heading: new Set(["aria-checked","aria-pressed","aria-selected","aria-expanded"]),
        separator: new Set(["aria-checked","aria-pressed","aria-selected"]),
        alert: new Set(["aria-checked","aria-pressed","aria-selected","aria-expanded"]),
        progressbar: new Set(["aria-checked","aria-pressed","aria-selected","aria-expanded"]),
        status: new Set(["aria-checked","aria-pressed","aria-selected","aria-expanded"]),
      };
      _qa("[role]").forEach(el => {
        if (isHidden(el)) return;
        const role = (el.getAttribute("role") || "").trim().toLowerCase();
        const denied = DENIED_ATTRS[role];
        if (!denied) return;
        for (const attr of el.attributes) {
          if (attr.name.startsWith("aria-") && denied.has(attr.name)) {
            add(findings, { type: "ARIA_ALLOWED_ATTR", severity: "medium", wcag: "4.1.2", el,
              note: `"${attr.name}" is not allowed on role="${role}".`,
              extra: { attr: attr.name, role } });
          }
        }
      });
    }

    // -------- Tier 2: Extended checks --------

    // 2.2.2: Deprecated <marquee> element
    _q("marquee", "MARQUEE_ELEMENT", "high", "2.2.2", null, "<marquee> is deprecated. Auto-scrolling content is difficult to read and cannot be paused.");

    // 1.1.1: <input type="image"> without alt
    _q("input[type='image']", "INPUT_IMAGE_ALT", "medium", "1.1.1", el => !el.hasAttribute("alt")||!el.getAttribute("alt").trim(), '<input type="image"> missing alt text describing its action.');

    // 1.1.1: <area> without alt
    _qa("area").forEach(el => {
      if (!el.hasAttribute("alt") || !el.getAttribute("alt").trim()) {
        add(findings, { type: "AREA_ALT_MISSING", severity: "medium", wcag: "1.1.1", el,
          note: "<area> in image map missing alt text." });
      }
    });

    // 1.1.1: <object> without accessible text
    _q("object", "OBJECT_NO_ALT", "medium", "1.1.1", el => !getAccName(el).trim()&&!el.textContent.trim(), "<object> has no accessible name or fallback text content.");

    // 1.3.1: <fieldset> without <legend>
    _q("fieldset", "FIELDSET_NO_LEGEND", "medium", "1.3.1", el => !el.querySelector("legend"), "<fieldset> has no <legend>. Screen readers need a legend to describe the group of controls.");

    // 1.1.1: SVG used as image without accessible name
    _q("svg[role='img'],svg[role='graphics-document']", "SVG_IMG_NO_ALT", "medium", "1.1.1", el => !el.querySelector("title")&&!el.hasAttribute("aria-label")&&!el.hasAttribute("aria-labelledby"), 'SVG with role="img" has no accessible name. Add aria-label or a <title> child element.');

    // 1.2.2: <video> without captions track
    _q("video", "VIDEO_NO_CAPTIONS", "medium", "1.2.2", el => !el.querySelector("track[kind='captions'],track[kind='subtitles']"), '<video> has no <track kind="captions">. Provide synchronized captions for audio content.');

    // 1.4.2: <video autoplay> without muted (extends audio check)
    _q("video[autoplay]", "VIDEO_AUTOPLAY", "medium", "1.4.2", el => !el.hasAttribute("muted"), "<video> has autoplay without muted. May play audio automatically.");

    // 1.3.1: <li> not inside <ul>, <ol>, or <menu>
    _qa("li").forEach(el => {
      if (isHidden(el)) return;
      const parent = el.parentElement;
      if (parent && parent.tagName !== "UL" && parent.tagName !== "OL" && parent.tagName !== "MENU") {
        add(findings, { type: "LIST_STRUCTURE", severity: "medium", wcag: "1.3.1", el,
          note: `<li> is not inside a <ul>, <ol>, or <menu>. Parent is <${parent.tagName.toLowerCase()}>.`,
          extra: { tag: "li", parent: parent.tagName.toLowerCase() } });
      }
    });

    // 1.3.1: <dt>/<dd> not inside <dl>
    _qa("dt,dd").forEach(el => {
      if (isHidden(el)) return;
      const parent = el.parentElement;
      if (parent && parent.tagName !== "DL" && parent.tagName !== "DIV") {
        // DIV is allowed as grouping wrapper inside DL per HTML spec
        add(findings, { type: "DL_STRUCTURE", severity: "medium", wcag: "1.3.1", el,
          note: `<${el.tagName.toLowerCase()}> is not inside a <dl>. Parent is <${parent.tagName.toLowerCase()}>.`,
          extra: { tag: el.tagName.toLowerCase(), parent: parent.tagName.toLowerCase() } });
      }
    });

    // 4.1.1: Duplicate accesskey values
    {
      const accesskeyMap = new Map();
      _qa("[accesskey]").forEach(el => {
        const key = (el.getAttribute("accesskey") || "").toLowerCase();
        if (!key) return;
        if (!accesskeyMap.has(key)) accesskeyMap.set(key, []);
        accesskeyMap.get(key).push(el);
      });
      for (const [key, els] of accesskeyMap) {
        if (els.length > 1) {
          add(findings, { type: "ACCESSKEY_DUPLICATE", severity: "low", wcag: "4.1.1", el: els[1],
            note: `accesskey="${key}" is used on ${els.length} elements. Only the first will be activated.`,
            extra: { key, count: els.length } });
        }
      }
    }

    // 1.3.1: Input associated with multiple <label> elements
    _qa("input,select,textarea").forEach(el => {
      if (isHidden(el)) return;
      const id = el.getAttribute("id");
      if (!id) return;
      const labels = _qa(`label[for="${CSS.escape(id)}"]`);
      if (labels.length > 1) {
        add(findings, { type: "FORM_FIELD_MULTIPLE_LABELS", severity: "low", wcag: "1.3.1", el,
          note: `Input has ${labels.length} <label> elements pointing to it. Use exactly one label per input.`,
          extra: { labelCount: labels.length } });
      }
    });

    // 1.3.5: Invalid autocomplete value
    _qa("input[autocomplete],select[autocomplete],textarea[autocomplete]").forEach(el => {
      if (isHidden(el)) return;
      const raw = (el.getAttribute("autocomplete") || "").trim().toLowerCase();
      if (!raw || raw === "off" || raw === "on") return;
      // autocomplete can have section-* prefix and billing/shipping modifier
      const tokens = raw.split(/\s+/);
      const last = tokens[tokens.length - 1];
      if (!VALID_AUTOCOMPLETE.has(last)) {
        add(findings, { type: "AUTOCOMPLETE_VALID", severity: "medium", wcag: "1.3.5", el,
          note: `autocomplete="${raw}" contains unrecognized token "${last}".`,
          extra: { value: raw, token: last } });
      }
    });

    // 1.3.1: <th> without scope in multi-row/col tables
    _qa("table").forEach(table => {
      if (isHidden(table)) return;
      const role = table.getAttribute("role");
      if (role === "presentation" || role === "none") return;
      const rows = table.querySelectorAll("tr");
      const ths = table.querySelectorAll("th");
      if (rows.length > 1 && ths.length > 0) {
        ths.forEach(th => {
          if (!th.hasAttribute("scope")) {
            add(findings, { type: "TH_MISSING_SCOPE", severity: "low", wcag: "1.3.1", el: th,
              note: "<th> without scope attribute in a multi-row table. Add scope=\"col\" or scope=\"row\"." });
          }
        });
      }
    });

    // -------- Tier 3: Extended checks --------

    // 2.2.2: Deprecated <blink> element
    _q("blink", "BLINK_ELEMENT", "high", "2.2.2", null, "<blink> is deprecated. Blinking content can cause seizures and is unreadable.");

    // 1.1.1: Server-side image map without client-side alternative
    _q("img[ismap]", "SERVER_IMAGE_MAP", "medium", "1.1.1", el => !el.getAttribute("usemap"), "<img ismap> uses a server-side image map with no client-side <map> alternative.");

    // 1.3.1: <th scope> with invalid value
    _qa("th[scope]").forEach(el => {
      if (isHidden(el)) return;
      const val = (el.getAttribute("scope") || "").toLowerCase();
      if (val && !VALID_SCOPE_VALUES.has(val)) {
        add(findings, { type: "SCOPE_ATTR_VALID", severity: "low", wcag: "1.3.1", el,
          note: `scope="${val}" is not a valid value.`, extra: { value: val } });
      }
    });

    // 1.3.1: <td headers="..."> referencing non-existent IDs
    _qa("td[headers]").forEach(el => {
      const headerIds = (el.getAttribute("headers") || "").trim().split(/\s+/);
      for (const id of headerIds) {
        if (id && !doc.getElementById(id)) {
          add(findings, { type: "TD_HEADERS_INVALID", severity: "medium", wcag: "1.3.1", el,
            note: `headers attribute references id="${id}" which does not exist in the document.`,
            extra: { id } });
        }
      }
    });

    // 4.1.2: Table where caption and aria-label are identical (redundant)
    _qa("table[aria-label]").forEach(table => {
      if (isHidden(table)) return;
      const caption = table.querySelector("caption");
      if (caption) {
        const capText = caption.textContent.trim().toLowerCase();
        const ariaLabel = (table.getAttribute("aria-label") || "").trim().toLowerCase();
        if (capText && ariaLabel && capText === ariaLabel) {
          add(findings, { type: "TABLE_DUPLICATE_NAME", severity: "low", wcag: "4.1.2", el: table,
            note: "Table caption and aria-label are identical. Remove one to avoid redundant AT announcements." });
        }
      }
    });

    // 1.2.1: <audio> without transcript (heuristic)
    _qa("audio").forEach(el => {
      if (isHidden(el)) return;
      const parent = el.parentElement;
      const nearbyLink = parent?.querySelector("a[href*='transcript'],a[href*='text']");
      const hasTrack = el.querySelector("track");
      if (!nearbyLink && !hasTrack) {
        add(findings, { type: "AUDIO_NO_TRANSCRIPT", severity: "medium", wcag: "1.2.1", el,
          note: "<audio> has no nearby transcript link or <track> element. Provide a text alternative." });
      }
    });

    // 4.1.2: ARIA attribute values that don't match expected type
    {
      const allEls2 = _qa("[aria-checked],[aria-pressed],[aria-expanded],[aria-hidden],[aria-disabled],[aria-selected],[aria-busy],[aria-modal],[aria-required],[aria-readonly],[aria-multiline],[aria-multiselectable],[aria-grabbed],[aria-atomic],[aria-level],[aria-posinset],[aria-setsize],[aria-colcount],[aria-colindex],[aria-colspan],[aria-rowcount],[aria-rowindex],[aria-rowspan],[aria-valuenow],[aria-valuemax],[aria-valuemin],[aria-autocomplete],[aria-current],[aria-haspopup],[aria-invalid],[aria-live],[aria-orientation],[aria-sort],[aria-relevant],[aria-dropeffect]");
      allEls2.forEach(el => {
        for (const attr of el.attributes) {
          if (!attr.name.startsWith("aria-")) continue;
          const val = attr.value.trim().toLowerCase();
          if (!val) continue;
          if (ARIA_TRISTATE_ATTRS.has(attr.name)) {
            if (val !== "true" && val !== "false" && val !== "mixed") {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is invalid.`,
                extra: { attr: attr.name, value: attr.value, expected: 'Use "true", "false", or "mixed".' } });
            }
          } else if (ARIA_BOOL_ATTRS.has(attr.name)) {
            if (val !== "true" && val !== "false") {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is invalid.`,
                extra: { attr: attr.name, value: attr.value, expected: 'Use "true" or "false".' } });
            }
          } else if (ARIA_INT_ATTRS.has(attr.name)) {
            if (!/^-?\d+$/.test(val)) {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is not a valid integer.`,
                extra: { attr: attr.name, value: attr.value, expected: "Must be an integer." } });
            }
          } else if (ARIA_NUM_ATTRS.has(attr.name)) {
            if (isNaN(parseFloat(val))) {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is not a valid number.`,
                extra: { attr: attr.name, value: attr.value, expected: "Must be a number." } });
            }
          } else if (ARIA_TOKEN_ATTRS[attr.name]) {
            if (!ARIA_TOKEN_ATTRS[attr.name].has(val)) {
              add(findings, { type: "ARIA_VALID_ATTR_VALUE", severity: "high", wcag: "4.1.2", el,
                note: `${attr.name}="${attr.value}" is not a recognized value.`,
                extra: { attr: attr.name, value: attr.value, expected: `Allowed: ${[...ARIA_TOKEN_ATTRS[attr.name]].join(", ")}.` } });
            }
          }
        }
      });
    }

    // 2.4.4: Multiple links with same text pointing to different URLs
    {
      const linkTextMap = new Map();
      _qa("a[href]").forEach(el => {
        if (isHidden(el)) return;
        const text = (el.textContent || "").trim().toLowerCase();
        if (!text || text.length < 2) return;
        const href = el.getAttribute("href") || "";
        if (!linkTextMap.has(text)) linkTextMap.set(text, new Set());
        linkTextMap.get(text).add(href);
      });
      for (const [text, hrefs] of linkTextMap) {
        if (hrefs.size > 1) {
          const firstEl = _q1("a[href]");
          add(findings, { type: "IDENTICAL_LINKS_SAME_TEXT", severity: "low", wcag: "2.4.4",
            el: firstEl || doc.body,
            note: `${hrefs.size} different destinations share link text "${txt(text, 30)}".`,
            extra: { text: txt(text, 30), count: hrefs.size } });
        }
      }
    }

    // 1.3.1: <p>/<div>/<span> styled as heading but not using heading semantics (heuristic)
    {
      const pCandidates = _qa("p,div,span");
      const limit3 = Math.min(pCandidates.length, 2000);
      for (let i = 0; i < limit3; i++) {
        const el = pCandidates[i];
        if (isHidden(el)) continue;
        const text = (el.textContent || "").trim();
        if (!text || text.length > 80 || text.length < 2) continue;
        if (el.querySelector("h1,h2,h3,h4,h5,h6")) continue;
        try {
          const cs = w.getComputedStyle(el);
          const fontSize = parseFloat(cs.fontSize);
          const fontWeight = parseInt(cs.fontWeight, 10) || (cs.fontWeight === "bold" ? 700 : 400);
          if (fontSize >= 20 && fontWeight >= 600 && el.children.length <= 2) {
            add(findings, { type: "P_AS_HEADING", severity: "low", wcag: "1.3.1", el,
              note: `<${el.tagName.toLowerCase()}> is styled as a heading (${Math.round(fontSize)}px, weight ${fontWeight}) but lacks heading semantics.`,
              extra: { fontSize: Math.round(fontSize), fontWeight } });
          }
        } catch {}
      }
    }

    // -------- Microfrontend / Cross-MFE checks --------

    // 4.1.3: Competing assertive live regions (announcement storms)
    const assertiveLive = _qa("[aria-live='assertive']");
    if (assertiveLive.length > 3) {
      add(findings, { type: "COMPETING_ASSERTIVE_LIVE", severity: "medium", wcag: "4.1.3", el: assertiveLive[0],
        note: `${assertiveLive.length} aria-live="assertive" regions detected. Risk of announcement storms — consolidate to fewer regions.`,
        extra: { count: assertiveLive.length } });
    }

    // 1.3.1: Duplicate main landmarks
    const mains = _qa("main,[role='main']");
    if (mains.length > 1) {
      add(findings, { type: "DUPLICATE_MAIN_LANDMARK", severity: "medium", wcag: "1.3.1", el: mains[1],
        note: `${mains.length} <main> landmarks found. Each page should have exactly one.`, extra: { count: mains.length } });
    }

    // 1.3.1 / 4.1.2: Duplicate navs without labels
    const navs = _qa("nav,[role='navigation']").filter(n => !isHidden(n));
    const unnamedNavs = navs.filter(n => !getAccName(n));
    if (navs.length > 1 && unnamedNavs.length > 0) {
      add(findings, { type: "DUPLICATE_NAV_NO_LABEL", severity: "medium", wcag: "1.3.1 / 4.1.2", el: unnamedNavs[0],
        note: `${navs.length} <nav> landmarks, ${unnamedNavs.length} without labels. Distinguish with aria-label.`,
        extra: { totalNavs: navs.length, unnamed: unnamedNavs.length } });
    }

    // 1.3.1: Duplicate top-level banners
    const banners = _qa("[role='banner'],header:not([role])").filter(el => !isHidden(el));
    const toplevelBanners = banners.filter(el => !el.closest("article,aside,main,nav,section,[role='article'],[role='complementary'],[role='main'],[role='navigation'],[role='region']"));
    if (toplevelBanners.length > 1) {
      add(findings, { type: "DUPLICATE_BANNER", severity: "low", wcag: "1.3.1", el: toplevelBanners[1],
        note: `${toplevelBanners.length} top-level banner landmarks. MFEs may each be defining their own header.`, extra: { count: toplevelBanners.length } });
    }

    // 1.3.1: Duplicate top-level contentinfo
    const contentinfos = _qa("[role='contentinfo'],footer:not([role])").filter(el => !isHidden(el));
    const toplevelContentinfos = contentinfos.filter(el => !el.closest("article,aside,main,nav,section,[role='article'],[role='complementary'],[role='main'],[role='navigation'],[role='region']"));
    if (toplevelContentinfos.length > 1) {
      add(findings, { type: "DUPLICATE_CONTENTINFO", severity: "low", wcag: "1.3.1", el: toplevelContentinfos[1],
        note: `${toplevelContentinfos.length} top-level contentinfo landmarks. MFEs may each be defining their own footer.`, extra: { count: toplevelContentinfos.length } });
    }

    // 1.3.1: Heading hierarchy fragmentation (MFE heading trees restarting)
    if (levels.length > 2) {
      let restarts = 0;
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] === 1 && i > 0) restarts++;
      }
      if (restarts >= 2) {
        add(findings, { type: "HEADING_HIERARCHY_FRAGMENTED", severity: "medium", wcag: "1.3.1", el: headingEls[levels.indexOf(1, 1)] || doc.body,
          note: `Heading hierarchy restarts ${restarts} times (H1 reappears). Likely separate MFE heading trees — coordinate heading structure.`,
          extra: { restarts } });
      }
    }

    // 2.4.1: Competing skip navigation links
    const skipNavSelector2 = "a[href='#main'],a[href='#content'],a[href='#maincontent'],[class*='skip-nav'],[class*='skipnav'],[class*='skip-link'],a[class*='skip']";
    const skipLinks2 = _qa(skipNavSelector2);
    if (skipLinks2.length > 1) {
      add(findings, { type: "COMPETING_SKIP_NAV", severity: "low", wcag: "2.4.1", el: skipLinks2[1],
        note: `${skipLinks2.length} skip-navigation links detected. Multiple MFEs may each have their own skip link.`, extra: { count: skipLinks2.length } });
    }

    // 2.1.1 / 4.1.2: Shadow DOM focus management
    if (s.shadowRoots > 0) {
      let shadowFocusIssues = 0;
      for (const el of _qa("*")) {
        if (!el.shadowRoot) continue;
        const shadowFocusables = el.shadowRoot.querySelectorAll(focusableSelector);
        for (const sf of shadowFocusables) {
          if (isHidden(sf)) continue;
          const ti = sf.getAttribute("tabindex");
          if (ti === null) shadowFocusIssues++;
        }
        if (shadowFocusIssues >= 20) break;
      }
      if (shadowFocusIssues > 0) {
        add(findings, { type: "SHADOW_DOM_FOCUS_ISSUE", severity: "medium", wcag: "2.1.1 / 4.1.2", el: doc.body,
          note: `${shadowFocusIssues} focusable element(s) inside shadow roots without explicit tabindex. May not integrate with document tab order correctly.`,
          extra: { count: shadowFocusIssues } });
      }
    }

    // 4.1.2: Iframes missing title
    _qa("iframe").forEach(iframe => {
      if (isHidden(iframe)) return;
      if ((iframe.getAttribute("aria-hidden") || "").toLowerCase() === "true") return;
      const role = (iframe.getAttribute("role") || "").toLowerCase();
      if (role === "presentation" || role === "none") return;
      const title = (iframe.getAttribute("title") || "").trim();
      if (!title) {
        add(findings, {
          type: "IFRAME_MISSING_TITLE",
          severity: "medium",
          wcag: "4.1.2",
          el: iframe,
          confidence: "strict",
          note: "Iframe is exposed to assistive tech but has no title attribute.",
          extra: {
            src: txt(iframe.getAttribute("src"), 140) || null,
            role: role || null,
            ariaHidden: false,
            titlePresent: false,
          }
        });
      }
    });

    // Cross-origin iframe self-check
    if (s.inIframe) {
      try {
        const parentIframes = w.parent.document.querySelectorAll("iframe");
        for (const iframe of parentIframes) {
          try {
            if (iframe.contentWindow === w && !iframe.getAttribute("title")) {
              add(findings, { type: "IFRAME_MISSING_TITLE", severity: "medium", wcag: "4.1.2", el: doc.body,
                note: "This MFE's host iframe has no title attribute. Screen readers need iframe titles to identify embedded content." });
              break;
            }
          } catch { /* cross-origin */ }
        }
      } catch {
        add(findings, { type: "IFRAME_CROSS_ORIGIN", severity: "info", el: doc.body,
          note: "Running in cross-origin iframe — cannot verify iframe title/role attributes. Check manually." });
      }
    }

    // -------- V1 Coverage Expansion (bounded, deterministic) --------

    // 3.3.1 Error Identification — aria-invalid without error description
    _qa("[aria-invalid='true']").forEach(el => {
      if (isHidden(el)) return;
      const describedby = (el.getAttribute("aria-describedby") || "").trim();
      const errormsg = (el.getAttribute("aria-errormessage") || "").trim();
      const hasDescription = (describedby && describedby.split(/\s+/).some(id => {
        const ref = doc.getElementById(id);
        return ref && (ref.textContent || "").trim().length > 0;
      })) || (errormsg && (() => {
        const ref = doc.getElementById(errormsg);
        return ref && (ref.textContent || "").trim().length > 0;
      })());
      if (!hasDescription) {
        add(findings, { type: "ERROR_INPUT_NO_DESCRIPTION", el, severity: "medium", wcag: "3.3.1",
          confidence: "heuristic",
          note: "Input marked aria-invalid=\"true\" but no visible error description found via aria-describedby or aria-errormessage." });
      }
    });

    // 1.4.10 Reflow — meta viewport with fixed pixel width prevents reflow at 320px
    const vpContent = (viewport ? viewport.getAttribute("content") : "") || "";
    const vpWidthMatch = vpContent.match(/width\s*=\s*(\d+)/i);
    if (vpWidthMatch && Number(vpWidthMatch[1]) > 0) {
      add(findings, { type: "REFLOW_VIEWPORT_LOCKED", severity: "medium", wcag: "1.4.10",
        confidence: "heuristic", el: viewport,
        note: `Viewport width is locked to ${vpWidthMatch[1]}px. WCAG 1.4.10 requires content reflow at 320px CSS width without horizontal scroll.`,
        extra: { viewportWidth: Number(vpWidthMatch[1]) } });
    }

    // 3.1.2 Language of Parts — elements with empty or whitespace-only lang attribute
    _qa("[lang]").forEach(el => {
      if (el === doc.documentElement) return; // html lang is checked by MISSING_LANG
      if (isHidden(el)) return;
      const lang = (el.getAttribute("lang") || "").trim();
      if (!lang) {
        add(findings, { type: "MISSING_LANG_ON_PART", el, severity: "low", wcag: "3.1.2",
          confidence: "heuristic",
          note: "Element has a lang attribute but it is empty. Provide a valid BCP 47 language tag." });
      }
    });

    // 1.4.12 Text Spacing — overflow:hidden containers risk clipping text when user applies spacing overrides
    _qa("p,li,td,th,dd,blockquote,figcaption,label,span,div").forEach(el => {
      if (isHidden(el)) return;
      const text = (el.textContent || "").trim();
      if (!text || text.length < 20) return; // Skip short/empty content
      try {
        const cs = w.getComputedStyle(el);
        if (cs.overflow !== "hidden" && cs.overflowY !== "hidden") return;
        const lh = parseFloat(cs.lineHeight);
        const fs = parseFloat(cs.fontSize);
        if (!isFinite(lh) || !isFinite(fs) || fs === 0) return;
        if (lh / fs < 1.5) {
          add(findings, { type: "TEXT_SPACING_CLIP_RISK", el, severity: "low", wcag: "1.4.12",
            confidence: "advisory",
            note: `overflow:hidden with line-height ${(lh / fs).toFixed(2)}em may clip content when users apply WCAG 1.4.12 text spacing overrides.`,
            extra: { lineHeightRatio: Math.round((lh / fs) * 100) / 100 } });
        }
      } catch { /* getComputedStyle may throw in edge cases */ }
    });

    // 2.4.4 Link Purpose — links with no accessible name at all (strengthening existing checks)
    _qa("a[href]").forEach(el => {
      if (isHidden(el)) return;
      const name = getAccName(el);
      if (!name) {
        add(findings, { type: "LINK_NO_ACCESSIBLE_NAME", el, severity: "medium", wcag: "2.4.4",
          confidence: "strict",
          note: "Link has no accessible name (no text content, aria-label, or labelled image). Screen readers cannot convey the link purpose." });
      }
    });

    // 3.3.3 Error Suggestion — aria-invalid with required but no suggestion text
    _qa("[aria-invalid='true'][required]").forEach(el => {
      if (isHidden(el)) return;
      const describedby = (el.getAttribute("aria-describedby") || "").trim();
      if (!describedby) {
        add(findings, { type: "ERROR_SUGGESTION_MISSING", el, severity: "low", wcag: "3.3.3",
          confidence: "advisory",
          note: "Required input is marked invalid but has no aria-describedby. WCAG 3.3.3 requires error suggestions when input constraints are known." });
      }
    });

    // -------- V2 Strict Rule Expansion (bounded, deterministic) --------

    // 1.3.1 / 3.3.2 Label-for targets missing element
    _qa("label[for]").forEach(el => {
      if (isHidden(el)) return;
      const forAttr = (el.getAttribute("for") || "").trim();
      if (!forAttr) return;
      if (!doc.getElementById(forAttr)) {
        add(findings, { type: "LABEL_FOR_MISSING_TARGET", el, severity: "medium", wcag: "1.3.1 / 3.3.2",
          confidence: "strict",
          note: `<label for="${txt(forAttr, 40)}"> references an id that does not exist in the document.`,
          extra: { forAttr } });
      }
    });

    // 1.3.1 Input/select/textarea without any label association
    _qa("input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']),select,textarea").forEach(el => {
      if (isHidden(el)) return;
      const hasAriaLabel = !!(el.getAttribute("aria-label") || "").trim();
      const hasAriaLabelledby = !!(el.getAttribute("aria-labelledby") || "").trim();
      const hasTitle = !!(el.getAttribute("title") || "").trim();
      const hasNativeLabel = el.labels && el.labels.length > 0;
      if (hasAriaLabel || hasAriaLabelledby || hasTitle || hasNativeLabel) return;
      add(findings, { type: "INPUT_MISSING_LABEL", el, severity: "medium", wcag: "1.3.1",
        confidence: "strict",
        note: `<${el.tagName.toLowerCase()}> has no associated label, aria-label, aria-labelledby, or title.` });
    });

    // 2.1.1 Button without type inside form — implicit submit may cause unintended submissions
    _qa("form button:not([type])").forEach(el => {
      if (isHidden(el)) return;
      add(findings, { type: "BUTTON_WITHOUT_TYPE", el, severity: "low", wcag: "2.1.1",
        confidence: "heuristic",
        note: "<button> inside <form> without type attribute defaults to type=\"submit\". This may cause unintended form submission on keyboard Enter." });
    });

    // 2.4.4 Link with empty or fragment-only href
    _qa("a[href=''],a[href='#']").forEach(el => {
      if (isHidden(el)) return;
      const href = el.getAttribute("href");
      add(findings, { type: "LINK_EMPTY_HREF", el, severity: "medium", wcag: "2.4.4",
        confidence: "strict",
        note: `Link has href="${href}" — provides no navigation purpose. Use a <button> for interactive actions.`,
        extra: { href } });
    });

    // 1.1.1 Image with role="presentation" or role="none" but non-empty alt
    _qa("img[role='presentation'][alt],img[role='none'][alt]").forEach(el => {
      if (isHidden(el)) return;
      const alt = (el.getAttribute("alt") || "").trim();
      if (!alt) return; // empty alt is fine with presentation role
      add(findings, { type: "IMG_ROLE_PRESENTATIONAL_WITH_ALT", el, severity: "low", wcag: "1.1.1",
        confidence: "strict",
        note: `Image has role="${el.getAttribute("role")}" but non-empty alt="${txt(alt, 40)}". Contradictory — either remove the role or set alt="".`,
        extra: { role: el.getAttribute("role"), alt } });
    });

    // 4.1.2 Radio buttons sharing a name outside a common fieldset/group
    {
      const radios = _qa("input[type='radio'][name]");
      const radioGroups = new Map();
      for (const r of radios) {
        const name = r.getAttribute("name");
        if (!name) continue;
        if (!radioGroups.has(name)) radioGroups.set(name, []);
        radioGroups.get(name).push(r);
      }
      for (const [name, group] of radioGroups) {
        if (group.length < 2) continue;
        // Check if all radios share a common fieldset ancestor
        const fieldsets = new Set(group.map(r => r.closest("fieldset")).filter(Boolean));
        if (fieldsets.size === 1) continue; // All in same fieldset — OK
        if (fieldsets.size === 0) {
          // No fieldset at all — flag it
          add(findings, { type: "FORM_CONTROL_DUPLICATE_NAME", el: group[0], severity: "low", wcag: "4.1.2",
            confidence: "heuristic",
            note: `${group.length} radio buttons with name="${txt(name, 40)}" are not grouped in a <fieldset>. Screen readers need fieldset/legend to convey the group label.`,
            extra: { name, count: group.length } });
        }
      }
    }

    // -------- WCAG 2.2 specific checks --------
    if (is22) {
      // 2.5.8 Dragging Movements
      _q("[draggable='true']", "DRAGGABLE_NO_ALTERNATIVE", "medium", "2.5.8", null, 'draggable="true" detected. WCAG 2.5.8 requires a non-dragging alternative input method.', { wcagVersion: "2.2" });

      // 3.2.6 Consistent Help
      const helpLinks = _qa("a[href*='help'],a[href*='contact'],a[href*='support'],[data-testid*='help'],[data-testid*='contact']");
      if (helpLinks.length > 0) {
        add(findings, { type: "CONSISTENT_HELP_CHECK", severity: "info", wcag: "3.2.6", wcagVersion: "2.2", el: helpLinks[0],
          note: `${helpLinks.length} help/contact link(s) found. WCAG 3.2.6 requires these appear in a consistent location across pages.`,
          extra: { count: helpLinks.length } });
      }

      // 2.4.11 Focus Not Obscured
      const stickyEls = _qa("header,footer,nav,[role='banner'],[role='contentinfo'],[role='navigation'],div,section").filter(el => {
        if (isHidden(el)) return false;
        try { const pos = w.getComputedStyle(el).position; return pos === "fixed" || pos === "sticky"; } catch { return false; }
      }).slice(0, 20);
      if (stickyEls.length > 0) {
        add(findings, { type: "FOCUS_MAY_BE_OBSCURED", severity: "low", wcag: "2.4.11", wcagVersion: "2.2", el: stickyEls[0],
          note: `${stickyEls.length} fixed/sticky element(s) detected. These may obscure focused elements behind sticky headers/footers.`,
          extra: { count: stickyEls.length } });
      }

      // 3.3.7 Redundant Entry
      const formInputs = _qa("input:not([type='hidden']),textarea,select").filter(el => !isHidden(el));
      const nameGroups = new Map();
      for (const inp of formInputs) {
        const name = (inp.getAttribute("name") || "").toLowerCase();
        if (!name) continue;
        if (!nameGroups.has(name)) nameGroups.set(name, []);
        nameGroups.get(name).push(inp);
      }
      for (const [name, group] of nameGroups) {
        if (group.length > 1 && !group.every(el => el.getAttribute("autocomplete"))) {
          add(findings, { type: "REDUNDANT_ENTRY", severity: "low", wcag: "3.3.7", wcagVersion: "2.2", el: group[1],
            note: `Field "${name}" appears ${group.length} times without autocomplete. WCAG 3.3.7 requires avoiding redundant entry.`,
            extra: { fieldName: name, count: group.length } });
        }
      }
    }

    // -------- AAA-specific checks --------
    if (isAAA) {
      // 2.5.5 Target Size AAA: 44x44px minimum (only for elements ≥24px to avoid duplicating AA check)
      _qa("button,a[href],[role='button'],[role='link'],input:not([type='hidden']),select,textarea").forEach(el => {
        if (isHidden(el)) return;
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0 && (r.width < 44 || r.height < 44) && r.width >= 24 && r.height >= 24) {
          add(findings, { type: "TARGET_SIZE_AAA", severity: "low", wcag: "2.5.5", wcagVersion: "AAA", el,
            note: `Size ${Math.round(r.width)}x${Math.round(r.height)}px — AAA requires 44x44px minimum.`,
            extra: { width: Math.round(r.width), height: Math.round(r.height) } });
        }
      });
    }

    // -------- Output --------
    const dedup = uniqBy(findings, x => `${x.type}|${x.severity}|${x.product||""}|${x.path||""}|${JSON.stringify(x.extra||{})}`);
    const order = { high: 3, medium: 2, low: 1, info: 0 };
    const top = [...dedup].sort((a,b)=>(order[b.severity]??0)-(order[a.severity]??0)).slice(0, config.maxRows);

    const res = {
      timestamp: nowIso(),
      env: { href: s.href, inIframe: s.inIframe },
      mode,
      config,
      sanity: s,
      scope: cfg.rootSelector && !rootSelectorNotFound
        ? { type: "subtree", rootSelector: cfg.rootSelector, rootTestId: effectiveRootEl?.getAttribute?.("data-testid") || null }
        : { type: "document", rootSelector: null, rootTestId: null },
      rootSelectorNotFound,
      shadowCoverage,
      lists: {
        ul: _qa("ul").length,
        ol: _qa("ol").length,
        dl: _qa("dl").length
      },
      headings: headingEls.slice(0, 80).map(h => ({ level: h.tagName, text: txt(h.textContent, 70) })),
      findings: dedup
    };

    api.last = res;

    console.groupCollapsed(`🧩 A11YFlowAudit.run — findings=${dedup.length} — mode=${mode} — ${s.href}`);
    console.table(top.map(x => ({
      severity: x.severity,
      product: x.product,
      type: x.type,
      wcag: x.wcag,
      name: x.name,
      role: x.role,
      testId: x.testId,
      note: x.note
    })));
    console.log("Sanity:", s);
    console.log("Lists:", res.lists);
    console.log("Headings:", res.headings);
    console.log("Raw findings:", dedup);
    console.groupEnd();

    return res;
  };

  // ---------------- observe (periodic run) ----------------
  const observe = ({ seconds = 10, intervalMs = 900, runConfig = { strict: true } } = {}) => {
    if (observeInFlight?.promise) {
      console.info("🧠 A11YFlowAudit.observe already running; returning active session.");
      return observeInFlight.promise;
    }

    const promise = new Promise((resolve) => {
      const startedAt = performance.now();
      const snapshots = [];
      const merged = [];
      let settled = false;
      let timer = null;
      let timeout = null;

      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        if (timeout) clearTimeout(timeout);
        const unique = uniqBy(merged, x => `${x.type}|${x.severity}|${x.product||""}|${x.path||""}|${JSON.stringify(x.extra||{})}`);
        const result = { timestamp: nowIso(), seconds, intervalMs, snapshots, findings: unique, href: w.location.href, transitionStateSummaries: transitionSummaries.length ? transitionSummaries : null };
        api.lastObserved = result;
        observeInFlight = null;

        console.groupCollapsed(`🧠 A11YFlowAudit.observe — ${seconds}s — totalUniqueFindings=${unique.length}`);
        console.table(snapshots);
        console.log("Unique findings:", unique);
        console.groupEnd();

        resolve(result);
      };

      // State Transition Engine — observe mode
      let prevTransitionState = null;
      const observeEmittedSet = new Set();
      const transitionSummaries = [];
      steResolveElement._fallbackCount = 0;

      const totalTicks = Math.max(1, Math.ceil((seconds * 1000) / intervalMs));
      const tick = () => {
        const tickIndex = snapshots.length;
        const inTransitionWindow = tickIndex <= 1;
        const tickConfig = {
          ...(runConfig || {}),
          transitionSource: "observe",
          transitionTickIndex: tickIndex,
          transitionTickCount: totalTicks,
          duringTransition: (runConfig && Object.prototype.hasOwnProperty.call(runConfig, "duringTransition"))
            ? !!runConfig.duringTransition
            : inTransitionWindow,
        };
        const r = run(tickConfig);
        snapshots.push({
          t: +(performance.now() - startedAt).toFixed(0),
          count: r.findings.length,
          mode: r.mode,
          duringTransition: !!tickConfig.duringTransition,
        });
        merged.push(...r.findings);

        // State Transition Engine — observe mode C1/C3 evaluation
        try {
          const artifacts = steBuildCaptureArtifacts("observe", 0, 0);
          const nextState = steBuildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: artifacts });
          transitionSummaries.push(steBuildTransitionStateSummary(nextState));
          if (prevTransitionState) {
            const delta = steBuildStateDelta(prevTransitionState, nextState);
            const c1 = steEvaluateC1(delta, prevTransitionState, nextState, { emittedSet: observeEmittedSet });
            if (c1) {
              const el = steResolveElement(c1, artifacts);
              add(merged, { type: c1.type, el, severity: c1.severity, wcag: c1.wcag, confidence: c1.confidence, note: c1.note });
            }
          }
          // C3 rules: structural checks on nextState (no delta guard needed)
          const c3_1 = steEvaluateC3_1(null, prevTransitionState, nextState, { emittedSet: observeEmittedSet });
          if (c3_1) {
            const el = steResolveElement(c3_1, artifacts);
            add(merged, { type: c3_1.type, el, severity: c3_1.severity, wcag: c3_1.wcag, confidence: c3_1.confidence, note: c3_1.note });
          }
          const c3_2 = steEvaluateC3_2(null, prevTransitionState, nextState, { emittedSet: observeEmittedSet });
          if (c3_2) {
            const el = steResolveElement(c3_2, artifacts);
            add(merged, { type: c3_2.type, el, severity: c3_2.severity, wcag: c3_2.wcag, confidence: c3_2.confidence, note: c3_2.note });
          }
          prevTransitionState = nextState;
        } catch {}
      };

      tick();
      timer = setInterval(tick, intervalMs);
      timeout = setTimeout(finish, seconds * 1000);

      console.info(`🧠 A11YFlowAudit.observe started (${seconds}s). Trigger loader/remount flow now.`);
    });
    observeInFlight = { promise };
    return promise;
  };

  // ---------------- watch (loader chain + focus loss + silent loading) ----------------
  const watch = ({ seconds = 20, tickMs = 200, budget = {} } = {}) => {
    if (watchInFlight?.promise) {
      console.info("👀 A11YFlowAudit.watch already running; returning active session.");
      return watchInFlight.promise;
    }

    const promise = new Promise((resolve) => {
      const B = {
        maxBursts: 3,
        maxSilentMs: 2500,
        maxTotalLoadingMs: 7000,
        maxFocusLossEvents: 1,
        maxFocusJumps: 3,
        maxEmptyAnnouncements: 0,
        maxAnnouncementLatency: 3000,
        ...budget
      };

      const start = performance.now();
      let totalLoadingMs = 0;
      let silentMs = 0;
      let bursts = 0;
      let focusLoss = 0;
      let focusJumps = 0;
      let lastLoader = false;
      let bodyFocusSince = null;
      let bodyFocusCounted = false;
      let prevActiveElement = doc.activeElement;
      let focusChangeTimestamps = [];

      const events = [];
      const findings = [];
      const loaderCandidates = new Set();
      const MAX_LOADER_CANDIDATES = 280;
      let settled = false;

      // Focus history log (inspired by NerdeFocus; native impl) — document-level
      // capturing focusin listener active only during the watch window.
      const MAX_FOCUS_HISTORY_EVENTS = 100;
      let focusHistoryCount = 0;
      const onWatchFocusIn = (ev) => {
        if (settled) return;
        if (focusHistoryCount >= MAX_FOCUS_HISTORY_EVENTS) return;
        const t = +(performance.now() - start).toFixed(0);
        const target = ev?.target;
        focusHistoryCount++;
        if (target === doc.body || target === doc.documentElement) {
          events.push({ t, type: "focus_reset_body", note: "focus reset to body" });
        } else if (isEl(target)) {
          events.push({ t, type: "focus_change", note: txt(cssPath(target), 140) });
        } else {
          events.push({ t, type: "focus_change", note: "(non-element focus target)" });
        }
      };
      try { doc.addEventListener("focusin", onWatchFocusIn, true); } catch {}

      // State Transition Engine — watch mode
      let prevWatchTransitionState = null;
      const watchEmittedSet = new Set();
      const watchTransitionSummaries = [];
      let loaderNow = false;
      let announcementHookNow = hasAnnouncementHook();
      let pendingLoaderRecalc = null;
      let lastLoaderRecalcAt = 0;
      let timer = null;

      // Announcement tracking
      const announcements = [];
      let announcementCount = 0;
      let emptyAnnouncementCount = 0;
      let firstAnnouncementAt = null;
      const observedRegions = new WeakSet();
      const lastAnnouncementText = new WeakMap();
      let announcementFlushPending = false;
      const pendingAnnouncements = new Map();

      const isLikelyLoaderCandidate = (el) => {
        if (!isEl(el)) return false;
        if (el.getAttribute("aria-busy") === "true") return true;
        const role = (el.getAttribute("role") || "").toLowerCase();
        if (role === "progressbar" || role === "status") return true;
        const attrs = `${(el.className || "").toString()} ${el.id || ""} ${testId(el) || ""}`.toLowerCase();
        return /(loader|loading|spinner|skeleton|progress|shimmer)/.test(attrs);
      };

      const addLoaderCandidate = (el) => {
        if (!isLikelyLoaderCandidate(el)) return;
        if (loaderCandidates.size >= MAX_LOADER_CANDIDATES) return;
        loaderCandidates.add(el);
      };

      const addSubtreeCandidates = (root) => {
        if (!isEl(root)) return;
        addLoaderCandidate(root);
        const list = collectLoaderCandidates(root, 40);
        for (const el of list) addLoaderCandidate(el);
      };

      const recalcLoaderState = () => {
        pendingLoaderRecalc = null;
        lastLoaderRecalcAt = performance.now();
        announcementHookNow = hasAnnouncementHook();
        const cache = createPassCache();
        let hasLoader = false;
        for (const el of loaderCandidates) {
          if (!isEl(el) || !el.isConnected) {
            loaderCandidates.delete(el);
            continue;
          }
          if (looksLikeLoader(el, cache)) {
            hasLoader = true;
            break;
          }
        }
        loaderNow = hasLoader;
      };

      const scheduleLoaderRecalc = (force = false) => {
        if (pendingLoaderRecalc) return;
        const elapsed = performance.now() - lastLoaderRecalcAt;
        const delay = force ? 0 : Math.max(0, 300 - elapsed); // max once per 300ms
        pendingLoaderRecalc = setTimeout(recalcLoaderState, delay);
      };

      collectLoaderCandidates(doc, 160).forEach(addLoaderCandidate);
      scheduleLoaderRecalc(true);

      const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.type === "attributes") addLoaderCandidate(m.target);
          if (m.type === "childList") {
            addSubtreeCandidates(m.target);
            m.addedNodes.forEach(addSubtreeCandidates);
          }
        }
        scheduleLoaderRecalc();
      });

      try {
        observer.observe(doc.documentElement || doc.body, {
          subtree: true,
          childList: true,
          attributes: true,
          attributeFilter: ["aria-busy", "role", "class", "id", "style", "hidden", "data-testid"],
        });
      } catch {
        // Keep watch deterministic even if observe() fails.
      }

      // Live-region announcement observer (microtask-batched, deduped)
      const flushAnnouncements = () => {
        announcementFlushPending = false;
        for (const [liveRegion, { t, text }] of pendingAnnouncements) {
          lastAnnouncementText.set(liveRegion, text);
          if (firstAnnouncementAt === null) firstAnnouncementAt = t;
          announcementCount++;
          if (!text) emptyAnnouncementCount++;
          if (announcements.length < 200) {
            announcements.push({
              t,
              text: text || "(empty)",
              ariaLive: liveRegion.getAttribute("aria-live") || "",
              role: liveRegion.getAttribute("role") || "",
              path: cssPath(liveRegion),
            });
          }
          events.push({
            t,
            type: "announcement",
            note: `[${liveRegion.getAttribute("aria-live") || liveRegion.getAttribute("role")}] ${text || "(empty)"}`,
          });
        }
        pendingAnnouncements.clear();
      };

      const liveRegionObserver = new MutationObserver((mutations) => {
        if (settled) return;
        const t = +(performance.now() - start).toFixed(0);
        for (const m of mutations) {
          const region = m.type === "characterData" ? m.target.parentElement : m.target;
          if (!region || !isEl(region)) continue;
          const liveRegion = region.closest("[aria-live],[role='status'],[role='alert'],[role='log']");
          if (!liveRegion) continue;
          const text = (liveRegion.textContent || "").trim().slice(0, 200);
          if (lastAnnouncementText.get(liveRegion) === text) continue;
          pendingAnnouncements.set(liveRegion, { t, text });
        }
        if (!announcementFlushPending && pendingAnnouncements.size > 0) {
          announcementFlushPending = true;
          queueMicrotask(flushAnnouncements);
        }
      });

      const observeLiveRegions = () => {
        try {
          const regions = doc.querySelectorAll(
            "[aria-live]:not([aria-live='off']),[role='status'],[role='alert'],[role='log']"
          );
          regions.forEach(r => {
            if (observedRegions.has(r)) return;
            observedRegions.add(r);
            liveRegionObserver.observe(r, {
              childList: true,
              characterData: true,
              subtree: true,
            });
          });
        } catch {}
      };
      observeLiveRegions();

      const finalize = () => {
        if (settled) return;
        settled = true;
        if (timer) clearInterval(timer);
        if (pendingLoaderRecalc) clearTimeout(pendingLoaderRecalc);
        try { observer.disconnect(); } catch {}
        try { liveRegionObserver.disconnect(); } catch {}
        try { doc.removeEventListener("focusin", onWatchFocusIn, true); } catch {}
        watchInFlight = null;

        const verdicts = [];
        if (bursts > B.maxBursts) verdicts.push({ metric: "bursts", value: bursts, budget: B.maxBursts });
        if (silentMs > B.maxSilentMs) verdicts.push({ metric: "silentMs", value: silentMs, budget: B.maxSilentMs });
        if (totalLoadingMs > B.maxTotalLoadingMs) verdicts.push({ metric: "totalLoadingMs", value: totalLoadingMs, budget: B.maxTotalLoadingMs });
        if (focusLoss > B.maxFocusLossEvents) verdicts.push({ metric: "focusLossEvents", value: focusLoss, budget: B.maxFocusLossEvents });
        if (focusJumps > B.maxFocusJumps) verdicts.push({ metric: "focusJumps", value: focusJumps, budget: B.maxFocusJumps });
        if (emptyAnnouncementCount > B.maxEmptyAnnouncements) verdicts.push({ metric: "emptyAnnouncements", value: emptyAnnouncementCount, budget: B.maxEmptyAnnouncements });
        if (firstAnnouncementAt != null && totalLoadingMs > 0 && firstAnnouncementAt > B.maxAnnouncementLatency) verdicts.push({ metric: "announcementLatency", value: firstAnnouncementAt, budget: B.maxAnnouncementLatency });

        const result = {
          timestamp: nowIso(), seconds, bursts, totalLoadingMs, silentMs, focusLossCount: focusLoss, focusJumps, budget: B, verdicts, events, findings, href: w.location.href,
          announcements, announcementCount, emptyAnnouncementCount, firstAnnouncementAt,
          announcementLatency: (firstAnnouncementAt != null && totalLoadingMs > 0) ? firstAnnouncementAt : null,
          transitionStateSummaries: watchTransitionSummaries.length ? watchTransitionSummaries : null,
        };
        api.lastWatch = result;

        console.groupCollapsed(`⏱️ A11YFlowAudit.watch — ${seconds}s — bursts=${bursts} loading=${totalLoadingMs}ms silent=${silentMs}ms focusLoss=${focusLoss}`);
        if (verdicts.length) console.warn("OVER budget:", verdicts);
        else console.info("Budgets OK ✅");
        console.table(events.slice(0, 120));
        console.log("Raw:", api.lastWatch);
        console.groupEnd();

        resolve(result);
      };

      timer = setInterval(() => {
        const t = +(performance.now() - start).toFixed(0);

        if (loaderNow) totalLoadingMs += tickMs;
        if (loaderNow && !announcementHookNow) silentMs += tickMs;

        if (loaderNow && !lastLoader) bursts += 1;
        lastLoader = loaderNow;

        // Re-discover live regions every ~2s (new regions may appear dynamically)
        if (t % 2000 < tickMs) observeLiveRegions();

        if (doc.activeElement === doc.body) {
          if (bodyFocusSince === null) { bodyFocusSince = performance.now(); bodyFocusCounted = false; }
          if (!bodyFocusCounted && performance.now() - bodyFocusSince > 350) {
            focusLoss += 1;
            bodyFocusCounted = true;
            events.push({ t, type: "focus_on_body", note: "Focus stayed on <body> >350ms (often remount/loader chain)." });
          }
        } else {
          bodyFocusSince = null;
          bodyFocusCounted = false;
        }

        // Focus jump detection: focus moves across unrelated subtrees
        const curActive = doc.activeElement;
        if (curActive && curActive !== doc.body && prevActiveElement && prevActiveElement !== doc.body && curActive !== prevActiveElement) {
          const ancestorDepth = commonAncestorDepth(curActive, prevActiveElement);
          if (ancestorDepth > 2) {
            focusJumps++;
            events.push({ t, type: "focus_jump", note: `Focus jumped across subtrees (depth=${ancestorDepth}): ${cssPath(prevActiveElement)} → ${cssPath(curActive)}` });
          }
          focusChangeTimestamps.push(performance.now());
        }

        prevActiveElement = curActive;

        // Focus thrashing detection: rapid focus changes from loader mount/unmount
        const now = performance.now();
        focusChangeTimestamps = focusChangeTimestamps.filter(ts => now - ts < 600);
        if (focusChangeTimestamps.length >= 3) {
          events.push({ t, type: "focus_thrashing", note: `${focusChangeTimestamps.length} focus changes in <600ms — likely loader mount/unmount churn.` });
          focusChangeTimestamps = [];
        }

        // State Transition Engine — watch mode C1 + C2 + C3 evaluation
        try {
          steResolveElement._fallbackCount = 0;
          const watchArtifacts = steBuildCaptureArtifacts("watch", announcementCount, announcementCount + emptyAnnouncementCount);
          const nextWState = steBuildTransitionState({ frameId: 0, frameKeyStable: "", rootSelector: null, captureArtifacts: watchArtifacts });
          watchTransitionSummaries.push(steBuildTransitionStateSummary(nextWState));
          if (prevWatchTransitionState) {
            const wDelta = steBuildStateDelta(prevWatchTransitionState, nextWState);
            const c1 = steEvaluateC1(wDelta, prevWatchTransitionState, nextWState, { emittedSet: watchEmittedSet });
            if (c1) {
              const el = steResolveElement(c1, watchArtifacts);
              add(findings, { type: c1.type, el, severity: c1.severity, wcag: c1.wcag, confidence: c1.confidence, note: c1.note });
            }
            const c2 = steEvaluateC2(wDelta, prevWatchTransitionState, nextWState, { emittedSet: watchEmittedSet });
            if (c2) {
              const el = steResolveElement(c2, watchArtifacts);
              add(findings, { type: c2.type, el, severity: c2.severity, wcag: c2.wcag, confidence: c2.confidence, note: c2.note });
            }
          }
          // C3 rules: structural checks on nextWState (no delta guard needed)
          const wc3_1 = steEvaluateC3_1(null, prevWatchTransitionState, nextWState, { emittedSet: watchEmittedSet });
          if (wc3_1) {
            const el = steResolveElement(wc3_1, watchArtifacts);
            add(findings, { type: wc3_1.type, el, severity: wc3_1.severity, wcag: wc3_1.wcag, confidence: wc3_1.confidence, note: wc3_1.note });
          }
          const wc3_2 = steEvaluateC3_2(null, prevWatchTransitionState, nextWState, { emittedSet: watchEmittedSet });
          if (wc3_2) {
            const el = steResolveElement(wc3_2, watchArtifacts);
            add(findings, { type: wc3_2.type, el, severity: wc3_2.severity, wcag: wc3_2.wcag, confidence: wc3_2.confidence, note: wc3_2.note });
          }
          prevWatchTransitionState = nextWState;
        } catch {}

        if (t >= seconds * 1000) {
          finalize();
        }
      }, tickMs);

      console.info(`👀 A11YFlowAudit.watch started (${seconds}s). Trigger the loader-heavy flow now.`);
    });
    watchInFlight = { promise };
    return promise;
  };

  // ---------------- tabWalk (heuristic keyboard order) ----------------
  const tabWalk = ({ steps = 60, includePositiveTabindex = true, overlay = false } = {}) => {
    const order = computeTabOrder();
    const filtered = includePositiveTabindex ? order : order.filter(el => getTabIndex(el) === 0);
    const max = Math.min(steps, filtered.length);

    const original = doc.activeElement;
    const events = [];
    const seen = new Set();

    const focusOne = (el, i) => {
      try { el.focus({ preventScroll: true }); } catch (_) { try { el.focus(); } catch (_) {} }
      const after = doc.activeElement;
      const ok = after === el;

      const key = cssPath(el);
      if (seen.has(key)) {
        events.push({ i, type: "duplicate_in_order", path: key, name: getAccName(el), tabIndex: getTabIndex(el), note: "Element appears multiple times in computed order (heuristic)." });
      } else {
        seen.add(key);
      }

      if (!ok) {
        events.push({
          i,
          type: "focus_failed",
          path: cssPath(el),
          name: getAccName(el),
          tabIndex: getTabIndex(el),
          note: "Tried to focus but activeElement did not change."
        });
      }

      if (after === doc.body) {
        events.push({ i, type: "focus_on_body", note: "Focus ended up on <body> during tabWalk." });
      }

      const role = el.getAttribute("role");
      if ((role === "button" || role === "link") && !ok) {
        events.push({ i, type: "role_interactive_not_focusable", path: cssPath(el), role, note: "role=button/link but cannot be focused." });
      }
    };

    for (let i = 0; i < max; i++) focusOne(filtered[i], i);

    // Focus trap detection: elements that cycle with short period
    const cycleCheck = new Map();
    for (let i = 0; i < max; i++) {
      const p = cssPath(filtered[i]);
      if (cycleCheck.has(p)) {
        const firstIdx = cycleCheck.get(p);
        if (i - firstIdx < 5) {
          events.push({ i, type: "possible_focus_trap", path: p, name: getAccName(filtered[i]), tabIndex: getTabIndex(filtered[i]), note: `Element appeared at indices ${firstIdx} and ${i} — possible focus trap (cycle length ${i - firstIdx}).` });
        }
      }
      cycleCheck.set(p, i);
    }

    // Dialog focus containment check
    doc.querySelectorAll("[role='dialog'],[role='alertdialog'],dialog[open]").forEach(dialog => {
      if (isHidden(dialog)) return;
      const dialogFocusables = [...dialog.querySelectorAll(focusableSelector)].filter(isFocusable);
      if (dialogFocusables.length === 0) {
        events.push({ i: -1, type: "dialog_no_focusables", path: cssPath(dialog), name: getAccName(dialog), tabIndex: 0, note: "Open dialog has no focusable elements inside it." });
      }
      const isModal = dialog.getAttribute("aria-modal") === "true" || dialog.tagName === "DIALOG";
      if (isModal && dialogFocusables.length > 0) {
        const siblingsInert = [...(dialog.parentElement?.children || [])].every(sib => sib === dialog || sib.inert || sib.getAttribute("aria-hidden") === "true");
        if (!siblingsInert) {
          events.push({ i: -1, type: "dialog_focus_not_trapped", path: cssPath(dialog), name: getAccName(dialog), tabIndex: 0, note: "Modal dialog is open but sibling content is not inert/aria-hidden — focus may escape." });
        }
      }
    });

    // Roach motel detection: non-dialog container capturing most tab stops
    const parentCounts = new Map();
    for (let i = 0; i < max; i++) {
      const parent = filtered[i].parentElement;
      if (!parent || parent === doc.body || parent === doc.documentElement) continue;
      const pp = cssPath(parent);
      if (!parentCounts.has(pp)) parentCounts.set(pp, { count: 0, el: parent });
      parentCounts.get(pp).count++;
    }
    for (const [pp, { count, el }] of parentCounts) {
      if (count >= max * 0.7 && max >= 5) {
        const role = el.getAttribute("role");
        if (role !== "dialog" && role !== "alertdialog" && el.tagName !== "DIALOG") {
          events.push({ i: -1, type: "roach_motel", path: pp, name: getAccName(el), tabIndex: 0,
            note: `${count}/${max} tab stops are inside a non-dialog container (${el.tagName.toLowerCase()}). Focus may be trapped.` });
        }
      }
    }

    // Non-dialog focus trap: container with consecutive tab stops forming a tight cycle
    const containerGroups = new Map();
    for (let i = 0; i < max; i++) {
      let ancestor = filtered[i].parentElement;
      while (ancestor && ancestor !== doc.body) {
        const role = ancestor.getAttribute("role");
        if (role && role !== "dialog" && role !== "alertdialog" && role !== "main" && role !== "navigation" && role !== "banner" && role !== "contentinfo" && role !== "complementary" && role !== "region" && ancestor.tagName !== "DIALOG") {
          const cp = cssPath(ancestor);
          if (!containerGroups.has(cp)) containerGroups.set(cp, { el: ancestor, indices: [] });
          containerGroups.get(cp).indices.push(i);
          break;
        }
        ancestor = ancestor.parentElement;
      }
    }
    for (const [cp, { el, indices }] of containerGroups) {
      if (indices.length >= 3 && indices.length < order.length / 3) {
        let consecutive = true;
        for (let j = 1; j < indices.length; j++) {
          if (indices[j] - indices[j - 1] !== 1) { consecutive = false; break; }
        }
        if (consecutive && indices[indices.length - 1] - indices[0] < 5) {
          events.push({ i: indices[0], type: "non_dialog_focus_trap", path: cp, name: getAccName(el), tabIndex: 0,
            note: `Non-dialog container trapping ${indices.length} consecutive tab stops. Consider if focus containment is intentional.` });
        }
      }
    }

    if (original && original !== doc.body) {
      try { original.focus({ preventScroll: true }); } catch (_) {}
    }

    const summary = {
      timestamp: nowIso(),
      href: w.location.href,
      totalFocusables: order.length,
      walked: max,
      events
    };
    api.lastTabWalk = summary;

    // Auto-show the tab-stops path overlay when requested via config
    if (overlay) {
      try { summary.overlay = showTabPath(events, { elements: filtered.slice(0, max) }); } catch {}
    }

    console.groupCollapsed(`⌨️ A11YFlowAudit.tabWalk — walked=${max}/${order.length} — events=${events.length}`);
    console.table(events.slice(0, 140));
    console.log("Raw:", summary);
    console.groupEnd();

    return summary;
  };

  // ---------------- contrastScan (approx) ----------------
  const contrastScan = ({ limit = 200, minTextLen = 2, wcagLevel = "2.1-AA" } = {}) => {
    const isAAAContrast = wcagLevel.endsWith("-AAA");
    const nodes = [...doc.querySelectorAll("p,span,a,button,label,li,td,th,h1,h2,h3,h4,h5,h6")]
      .filter(isEl)
      .filter(el => !isHidden(el))
      .filter(el => txt(el.textContent).length >= minTextLen)
      .slice(0, limit);

    const failures = [];
    const samples = [];

    for (const el of nodes) {
      const s = w.getComputedStyle(el);
      if (!s) continue;

      // Check cumulative opacity from ancestors
      let cumulativeOpacity = parseFloat(s.opacity) || 1;
      let ancestor = el.parentElement;
      while (ancestor && ancestor !== doc.documentElement && cumulativeOpacity > 0) {
        const ancestorOpacity = parseFloat(w.getComputedStyle(ancestor).opacity);
        if (Number.isFinite(ancestorOpacity)) cumulativeOpacity *= ancestorOpacity;
        ancestor = ancestor.parentElement;
      }
      if (cumulativeOpacity === 0) continue;

      const fg = parseRGBA(s.color);
      if (!fg || fg.a === 0) continue;

      const bg = getEffectiveBg(el);
      // Factor in cumulative opacity: effective fg blends toward bg at reduced opacity
      const effectiveFg = cumulativeOpacity < 1
        ? blend({ r: fg.r, g: fg.g, b: fg.b, a: fg.a * cumulativeOpacity }, bg)
        : { r: fg.r, g: fg.g, b: fg.b };
      const ratio = contrastRatio(effectiveFg, bg);

      const large = isLargeText(el);
      const req = isAAAContrast ? (large ? 4.5 : 7.0) : (large ? 3.0 : 4.5);

      const item = {
        ratio: +ratio.toFixed(2),
        required: req,
        largeText: large,
        text: txt(el.textContent, 60),
        tag: el.tagName,
        testId: testId(el),
        path: cssPath(el),
        note: cumulativeOpacity < 1 ? `Effective opacity: ${(cumulativeOpacity * 100).toFixed(0)}% — ratio adjusted for opacity blending.` : null
      };

      samples.push(item);
      if (ratio + 1e-6 < req) {
        const baseNote = item.note || "Approx contrast check (may be off with gradients/images). Verify manually for blockers.";
        // Suggested passing foreground (same hue, lightness shifted toward
        // the higher-contrast pole); null when no same-hue color can pass.
        const suggestion = suggestContrastColor(effectiveFg, bg, req);
        failures.push({
          ...item,
          wcag: "1.4.3",
          suggestedColor: suggestion ? suggestion.hex : null,
          suggestedRatio: suggestion ? suggestion.ratio : null,
          note: suggestion ? `${baseNote} → try ${suggestion.hex} (${suggestion.ratio}:1)` : baseNote
        });
      }
    }

    const res = {
      timestamp: nowIso(),
      href: w.location.href,
      scanned: nodes.length,
      failuresCount: failures.length,
      failures,
      samples
    };
    api.lastContrast = res;

    console.groupCollapsed(`🎚️ A11YFlowAudit.contrastScan — failures=${failures.length}/${nodes.length}`);
    console.table(failures.slice(0, 120));
    console.log("Samples:", res.samples);
    console.log("Raw:", res);
    console.groupEnd();

    return res;
  };

  const api = {
    run,
    observe,
    watch,
    tabWalk,
    contrastScan,
    annotate: annotateFindings,
    clearAnnotations,
    highlightTarget,
    highlightAll,
    clearHighlight,
    showTabPath,
    clearTabPath,
    applyAssist,
    clearAssist,
    getPageStructure,
    getA11yOutline,
    getGuidedCandidates,
    showStructureOverlay,
    clearStructureOverlay,
    get modeHints() { return modeHints; },
    set modeHints(v) { modeHints = v && typeof v === "object" ? v : defaultModeHints; },
    last: null,
    lastObserved: null,
    lastWatch: null,
    lastTabWalk: null,
    lastContrast: null,
    lastStructure: null,
    lastA11yOutline: null,
    lastGuided: null,
    help() {
      console.log("A11YFlowAudit.run({ strict:true })");
      console.log("A11YFlowAudit.run({ rootSelector: '#my-component' })  // subtree scan");
      console.log("A11YFlowAudit.observe({ seconds: 12 })  // loaders/remounts");
      console.log("A11YFlowAudit.watch({ seconds: 40 })     // loader chain + focus loss + silent loading budgets");
      console.log("A11YFlowAudit.tabWalk({ steps: 80 })     // heuristic keyboard order");
      console.log("A11YFlowAudit.tabWalk({ steps: 80, overlay: true }) // + tab path overlay");
      console.log("A11YFlowAudit.showTabPath(events)         // numbered tab-stop badges + path");
      console.log("A11YFlowAudit.clearTabPath()              // remove tab path overlay");
      console.log("A11YFlowAudit.contrastScan({ limit: 250 }) // approx contrast");
      console.log("A11YFlowAudit.annotate(findings)          // overlay annotations");
      console.log("A11YFlowAudit.clearAnnotations()          // remove overlays");
      console.log("A11YFlowAudit.highlightTarget({ path })   // persistent ring on one element");
      console.log("A11YFlowAudit.highlightAll(specs)         // rings on all findings of a rule (max 50)");
      console.log("A11YFlowAudit.clearHighlight()            // remove the highlight ring(s)");
      console.log("A11YFlowAudit.applyAssist('textSpacing')  // WCAG 1.4.12 text-spacing stress test");
      console.log("A11YFlowAudit.applyAssist('protanopia')   // CVD simulation (also: deuteranopia, tritanopia, achromatopsia, grayscale)");
      console.log("A11YFlowAudit.clearAssist()               // remove active assist mode");
      console.log("A11YFlowAudit.getPageStructure()          // headings outline + landmarks");
      console.log("A11YFlowAudit.getA11yOutline()            // linearized screen-reader view snapshot");
      console.log("A11YFlowAudit.getGuidedCandidates('images') // guided-check candidates (also: 'controls')");
      console.log("A11YFlowAudit.showStructureOverlay('headings') // labeled outline boxes (also: 'landmarks')");
      console.log("A11YFlowAudit.clearStructureOverlay()     // remove structure overlay");
    }
  };

  w[KEY] = api;
  console.log(`✅ ${KEY} installed`, w.location.href, "inIframe=", w.self !== w.top, "mode=", detectMode());
})();
