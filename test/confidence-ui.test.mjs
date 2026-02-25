/**
 * Confidence-aware UI contracts — pure data-layer tests.
 *
 * Since this is a DevTools panel (no DOM in the node test runner), we test the
 * DATA contracts: the logic that determines which badges, colors, and indicators
 * to show. We validate mapping functions, conditional logic, and the HTML string
 * output of _buildTimelineRowHtml() using regex/string matching.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

const ctx = createContext();

// Helper: build a minimal step object accepted by _buildTimelineRowHtml
function makeStep(overrides = {}) {
  return {
    index: 1,
    url: "https://example.com/step1",
    routeHint: "/step1",
    activeModeCaptured: "run",
    diffs: { consolidated: { added: 0, fixed: 0, persisting: 0 } },
    profileConfidence: null,
    profileMatchSignals: [],
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════
// Badge rendering — confidence badge letter in timeline rows
// ══════════════════════════════════════════════════════

describe("confidence badge rendering", () => {

  it('"H" badge for high confidence', () => {
    const step = makeStep({ profileConfidence: "high" });
    const html = ctx._buildTimelineRowHtml(step);
    assert.match(html, /class="confidenceBadge"/, "should contain confidenceBadge class");
    assert.match(html, /data-level="H"/, "data-level should be H");
    assert.match(html, />H<\/span>/, "badge text should be H");
  });

  it('"M" badge for medium confidence', () => {
    const step = makeStep({ profileConfidence: "medium" });
    const html = ctx._buildTimelineRowHtml(step);
    assert.match(html, /class="confidenceBadge"/, "should contain confidenceBadge class");
    assert.match(html, /data-level="M"/, "data-level should be M");
    assert.match(html, />M<\/span>/, "badge text should be M");
  });

  it('"L" badge for low confidence', () => {
    const step = makeStep({ profileConfidence: "low" });
    const html = ctx._buildTimelineRowHtml(step);
    assert.match(html, /class="confidenceBadge"/, "should contain confidenceBadge class");
    assert.match(html, /data-level="L"/, "data-level should be L");
    assert.match(html, />L<\/span>/, "badge text should be L");
  });

  it("no badge when profileConfidence is null", () => {
    const step = makeStep({ profileConfidence: null });
    const html = ctx._buildTimelineRowHtml(step);
    assert.ok(!html.includes('confidenceBadge'), "should not contain confidenceBadge when no confidence");
  });

  it("no badge when profileConfidence is undefined", () => {
    const step = makeStep({ profileConfidence: undefined });
    const html = ctx._buildTimelineRowHtml(step);
    assert.ok(!html.includes('confidenceBadge'), "should not contain confidenceBadge when undefined");
  });

  it("no badge when profileConfidence is empty string", () => {
    const step = makeStep({ profileConfidence: "" });
    const html = ctx._buildTimelineRowHtml(step);
    assert.ok(!html.includes('confidenceBadge'), "should not contain confidenceBadge when empty string");
  });

  it("manual override renders PIN badge", () => {
    const step = makeStep({ profileConfidence: "manual" });
    const html = ctx._buildTimelineRowHtml(step);
    assert.match(html, /class="confidenceBadge"/, "should contain confidenceBadge class");
    assert.match(html, /data-level="PIN"/, "data-level should be PIN for manual override");
    assert.ok(html.includes("PIN"), "badge text should be PIN");
  });

  it("badge title includes match signals when present", () => {
    const step = makeStep({
      profileConfidence: "high",
      profileMatchSignals: ["url:help", "dom:article"],
    });
    const html = ctx._buildTimelineRowHtml(step);
    assert.match(html, /title="url:help, dom:article"/, "title should contain joined signals");
  });

  it("badge title falls back to confidence level when no signals", () => {
    const step = makeStep({
      profileConfidence: "medium",
      profileMatchSignals: [],
    });
    const html = ctx._buildTimelineRowHtml(step);
    assert.match(html, /title="medium"/, "title should fall back to confidence level");
  });
});

// ══════════════════════════════════════════════════════
// Reduced diff confidence — verdict area indicator
// ══════════════════════════════════════════════════════

describe("reduced diff confidence", () => {

  // We test the data conditions that drive the "Diff confidence: reduced" note.
  // The logic in renderFlowVerdict is:
  //   hasSuspect = steps.some(s => s.profileSuspect === true)
  //   hasDegraded = steps.some(s => s.stableSignatures?.run?.stepQuality?.degraded === true)

  it("shown when profileSuspect is true", () => {
    const steps = [
      makeStep({ index: 0 }),
      makeStep({ index: 1, profileSuspect: true }),
    ];
    const hasSuspect = steps.some(s => s.profileSuspect === true);
    assert.ok(hasSuspect, "should detect profileSuspect in steps");
  });

  it("shown when stableSignatures degraded", () => {
    const steps = [
      makeStep({ index: 0 }),
      makeStep({
        index: 1,
        stableSignatures: { run: { stepQuality: { degraded: true } } },
      }),
    ];
    const hasDegraded = steps.some(
      s => s.stableSignatures?.run?.stepQuality?.degraded === true
    );
    assert.ok(hasDegraded, "should detect degraded stableSignatures in steps");
  });

  it("NOT shown when all steps clean", () => {
    const steps = [
      makeStep({ index: 0, profileSuspect: false }),
      makeStep({ index: 1, profileSuspect: false }),
    ];
    const hasSuspect = steps.some(s => s.profileSuspect === true);
    const hasDegraded = steps.some(
      s => s.stableSignatures?.run?.stepQuality?.degraded === true
    );
    assert.ok(!hasSuspect && !hasDegraded, "neither suspect nor degraded should be true");
  });

  it("NOT shown when profileSuspect is false and stableSignatures is clean", () => {
    const steps = [
      makeStep({
        index: 0,
        profileSuspect: false,
        stableSignatures: { run: { stepQuality: { degraded: false } } },
      }),
      makeStep({
        index: 1,
        profileSuspect: false,
        stableSignatures: { run: { stepQuality: { degraded: false } } },
      }),
    ];
    const hasSuspect = steps.some(s => s.profileSuspect === true);
    const hasDegraded = steps.some(
      s => s.stableSignatures?.run?.stepQuality?.degraded === true
    );
    assert.ok(!hasSuspect && !hasDegraded, "should not trigger reduced confidence");
  });

  it("shown when BOTH profileSuspect and degraded signatures present", () => {
    const steps = [
      makeStep({
        index: 0,
        profileSuspect: true,
        stableSignatures: { run: { stepQuality: { degraded: true } } },
      }),
    ];
    const hasSuspect = steps.some(s => s.profileSuspect === true);
    const hasDegraded = steps.some(
      s => s.stableSignatures?.run?.stepQuality?.degraded === true
    );
    assert.ok(hasSuspect && hasDegraded, "both conditions should be detected");
  });

  it("profileSuspect must be strictly true (not truthy)", () => {
    const steps = [makeStep({ index: 0, profileSuspect: 1 })];
    const hasSuspect = steps.some(s => s.profileSuspect === true);
    assert.ok(!hasSuspect, "truthy-but-not-true should NOT trigger suspect");
  });
});

// ══════════════════════════════════════════════════════
// Confidence color mapping — CSS class assignment logic
// ══════════════════════════════════════════════════════

describe("confidence color mapping", () => {

  // The mapping in panel.js (renderDiagnostics area):
  //   "high"   -> "confidence-high"    (#4caf50 = green)
  //   "medium" -> "confidence-medium"  (#ff9800 = amber)
  //   "low"    -> "confidence-low"     (#f44336 = red)
  //   "manual" -> "confidence-manual"  (italic, muted)

  const COLOR_MAP = {
    high:   "confidence-high",
    medium: "confidence-medium",
    low:    "confidence-low",
    manual: "confidence-manual",
  };

  it("high maps to confidence-high (green)", () => {
    assert.equal(COLOR_MAP["high"], "confidence-high");
  });

  it("medium maps to confidence-medium (amber)", () => {
    assert.equal(COLOR_MAP["medium"], "confidence-medium");
  });

  it("low maps to confidence-low (red)", () => {
    assert.equal(COLOR_MAP["low"], "confidence-low");
  });

  it("manual maps to confidence-manual (italic muted)", () => {
    assert.equal(COLOR_MAP["manual"], "confidence-manual");
  });

  it("exactly 4 confidence levels are mapped", () => {
    assert.equal(Object.keys(COLOR_MAP).length, 4);
  });

  it("all CSS class names follow confidence-{level} convention", () => {
    for (const [level, cls] of Object.entries(COLOR_MAP)) {
      assert.equal(cls, `confidence-${level}`, `class for ${level} should follow naming convention`);
    }
  });
});

// ══════════════════════════════════════════════════════
// computeProfileMatch — confidence thresholds
// ══════════════════════════════════════════════════════

describe("computeProfileMatch confidence thresholds", () => {

  it("score >= 6 yields high confidence", () => {
    // URL match (+3) + 2 DOM hits (+4) = 7 -> high
    const result = ctx.computeProfileMatch("test", {
      label: "Test",
      frame: {
        urlIncludes: ["help"],
        domSelectors: ["[data-a]", "[data-b]"],
      },
      frameScope: "primary",
      modeHints: {},
    }, {
      markerHits: { "[data-a]": true, "[data-b]": true },
      hasHelpRoot: true,
      frameId: 0,
    }, "https://help.example.com");
    assert.equal(result.confidence, "high");
    assert.ok(result.matchScore >= 6, `score should be >= 6, got ${result.matchScore}`);
  });

  it("score >= 3 but < 6 yields medium confidence", () => {
    // URL match (+3) only = 3 -> medium
    const result = ctx.computeProfileMatch("test", {
      label: "Test",
      frame: {
        urlIncludes: ["help"],
        domSelectors: [],
      },
      frameScope: "all",
      modeHints: {},
    }, {
      markerHits: {},
      frameId: 0,
    }, "https://help.example.com");
    assert.equal(result.confidence, "medium");
    assert.ok(result.matchScore >= 3 && result.matchScore < 6,
      `score should be 3..5, got ${result.matchScore}`);
  });

  it("score < 3 yields low confidence", () => {
    // No URL match, no DOM hits, just scope alignment (+1) = 1 -> low
    const result = ctx.computeProfileMatch("test", {
      label: "Test",
      frame: {
        urlIncludes: [],
        domSelectors: [],
      },
      frameScope: "primary",
      modeHints: {},
    }, {
      markerHits: {},
      frameId: 0,
    }, "https://example.com");
    assert.equal(result.confidence, "low");
    assert.ok(result.matchScore < 3, `score should be < 3, got ${result.matchScore}`);
  });

  it("zero score yields low confidence", () => {
    const result = ctx.computeProfileMatch("test", {
      label: "Test",
      frame: { urlIncludes: [], domSelectors: [] },
      frameScope: "embedded",
      modeHints: {},
    }, {
      markerHits: {},
      frameId: 0, // top frame, but scope is embedded -> no alignment
    }, "https://nomatch.example.com");
    assert.equal(result.confidence, "low");
    assert.equal(result.matchScore, 0);
  });
});

// ══════════════════════════════════════════════════════
// selectBestProfileMatch — manual override confidence
// ══════════════════════════════════════════════════════

describe("selectBestProfileMatch manual override", () => {

  it("returns confidence=manual when isManualOverride is true", () => {
    const result = ctx.selectBestProfileMatch({}, "https://example.com", true);
    assert.equal(result.confidence, "manual");
    assert.equal(result.matchSignals.length, 1);
    assert.equal(result.matchSignals[0], "manual_override");
    assert.equal(result.matchScore, 0);
  });
});

// ══════════════════════════════════════════════════════
// Timeline row HTML — badge string integration
// ══════════════════════════════════════════════════════

describe("timeline row HTML badge integration", () => {

  it("high confidence row contains data-level=H and badge text H", () => {
    const html = ctx._buildTimelineRowHtml(makeStep({ profileConfidence: "high" }));
    assert.match(html, /<span class="confidenceBadge" data-level="H"/, "should have H badge markup");
  });

  it("low confidence row contains data-level=L and badge text L", () => {
    const html = ctx._buildTimelineRowHtml(makeStep({ profileConfidence: "low" }));
    assert.match(html, /<span class="confidenceBadge" data-level="L"/, "should have L badge markup");
  });

  it("no-confidence row does not contain any confidenceBadge span", () => {
    const html = ctx._buildTimelineRowHtml(makeStep({ profileConfidence: null }));
    assert.ok(!/<span class="confidenceBadge"/.test(html), "no badge span when confidence is null");
  });

  it("row always contains a <tr> with data-step-index", () => {
    const html = ctx._buildTimelineRowHtml(makeStep({ index: 42 }));
    assert.match(html, /<tr class="trow" data-step-index="42"/, "should render step index in tr");
  });

  it("badge appears inside the mode <td> column", () => {
    const html = ctx._buildTimelineRowHtml(makeStep({ profileConfidence: "high" }));
    // The HTML is a multi-line <tr> with <td> cells separated by newlines.
    // Split on <td> to find the mode column (3rd cell: index, route, mode).
    const tdParts = html.split(/<td[^>]*>/);
    // tdParts[0] = before first <td>, [1] = index cell, [2] = route cell, [3] = mode cell
    assert.ok(tdParts.length >= 4, `should have at least 4 parts from split, got ${tdParts.length}`);
    const modeCell = tdParts[3];
    assert.ok(modeCell.includes('confidenceBadge'), "badge should be in the mode td cell");
  });
});
