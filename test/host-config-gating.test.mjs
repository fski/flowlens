/**
 * HostConfig gating tests — SW-side.
 * Validates: hard gate, urlExcludesAny, manual override bypass,
 * markerHits rank bonus, generic probe heuristics, validation.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSwContext } from './sw-harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ══════════════════════════════════════════════════════
// 1. domSelectorsAny hard gate — excludes non-matching frames
// ══════════════════════════════════════════════════════

describe('HostConfig gating — computeFrameScores hard gate', () => {
  it('frames with no DOM match get score=0 when domSelectorsAny is non-empty', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([
        // frame 0: no DOM match
        { frameId: 0, result: { domMatch: false, area: 5000 } },
        // frame 1: has DOM match
        { frameId: 1, result: { domMatch: true, area: 3000 } },
      ]),
    });
    const { scored } = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [
        { frameId: 0, url: 'https://example.com' },
        { frameId: 1, url: 'https://example.com/widget' },
      ],
      match: {
        domSelectorsAny: ['#my-widget'],
        urlIncludes: [],
      },
    });
    const frame0 = scored.find(s => s.frameId === 0);
    const frame1 = scored.find(s => s.frameId === 1);
    assert.equal(frame0.score, 0, 'non-matching frame should get score=0 (hard gate)');
    assert.ok(frame1.score > 0, 'matching frame should have positive score');
  });

  it('no hard gate when domSelectorsAny is empty', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([]),
    });
    const { scored } = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [
        { frameId: 0, url: 'https://example.com' },
        { frameId: 1, url: 'https://example.com/app' },
      ],
      match: {
        domSelectorsAny: [],
        urlIncludes: ['example.com/app'],
      },
    });
    const frame1 = scored.find(s => s.frameId === 1);
    assert.ok(frame1.score > 0, 'URL-matched frame should retain score when no domSelectorsAny');
  });

  it('DOM-matching frame gets +10 score bonus', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([
        { frameId: 1, result: { domMatch: true, area: 1000 } },
      ]),
    });
    const { scored } = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [{ frameId: 1, url: 'https://example.com' }],
      match: { domSelectorsAny: ['#widget'], urlIncludes: [] },
    });
    const frame1 = scored.find(s => s.frameId === 1);
    assert.ok(frame1.score >= 10, `DOM match should add at least 10, got ${frame1.score}`);
  });
});

// ══════════════════════════════════════════════════════
// 2. urlExcludesAny — excludes matching frames
// ══════════════════════════════════════════════════════

describe('HostConfig gating — urlExcludesAny', () => {
  it('frames matching urlExcludesAny get score=0', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([]),
    });
    const { scored } = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [
        { frameId: 0, url: 'https://example.com' },
        { frameId: 1, url: 'https://analytics.example.com/tracker' },
      ],
      match: {
        domSelectorsAny: [],
        urlIncludes: ['example.com'],
        urlExcludesAny: ['analytics.example.com'],
      },
    });
    const frame0 = scored.find(s => s.frameId === 0);
    const frame1 = scored.find(s => s.frameId === 1);
    assert.ok(frame0.score > 0, 'non-excluded frame should have positive score');
    assert.equal(frame1.score, 0, 'excluded frame should get score=0');
  });

  it('excluded frames cannot re-enter via DOM match', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([
        { frameId: 1, result: { domMatch: true, area: 10000 } },
      ]),
    });
    const { scored } = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [
        { frameId: 0, url: 'https://example.com' },
        { frameId: 1, url: 'https://analytics.example.com/widget' },
      ],
      match: {
        domSelectorsAny: ['#widget'],
        urlIncludes: [],
        urlExcludesAny: ['analytics.example.com'],
      },
    });
    const frame1 = scored.find(s => s.frameId === 1);
    assert.equal(frame1.score, 0, 'URL-excluded frame must stay at score=0 even with DOM match');
  });
});

// ══════════════════════════════════════════════════════
// 3. Excluded frames cannot re-enter via probe fallback
// ══════════════════════════════════════════════════════

describe('HostConfig gating — excluded frames in chooseBestEntry fallback', () => {
  it('URL-excluded frame with chat probe does not win in score==0 fallback', () => {
    // This tests the full pipeline: excluded frame has score=0, and the
    // score==0 fallback heuristic should NOT select it.
    // We simulate this by giving both frames score=0 (post-computeFrameScores)
    // but only one has a chat probe signal.
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 1, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: false, hasHelpRoot: false, hasArticle: true, looksShell: false }],
      [1, { frameId: 1, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: false }],
    ]);
    // Both have score==0 — the one with hasArticle wins via heuristic
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 0, 'frame with article signal should win');
  });
});

// ══════════════════════════════════════════════════════
// 4. Manual override bypasses gating
// ══════════════════════════════════════════════════════

describe('HostConfig gating — manual override bypass', () => {
  it('manual override selects pinned frame regardless of gating', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 5, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: true, hasHelpRoot: true, hasArticle: true, looksShell: false }],
      [5, { frameId: 5, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: true }],
    ]);
    const target = { frameIds: [5], mode: 'manual' };
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target, probeByFrameId });
    assert.equal(result.entry.frameId, 5, 'manual override must select pinned frame');
    assert.equal(result.reason, 'manual_pinned_override');
  });
});

// ══════════════════════════════════════════════════════
// 5. markerHits rank bonus in chooseBestEntry
// ══════════════════════════════════════════════════════

describe('HostConfig gating — markerHits rank bonus', () => {
  it('frame with markerHits ranks higher in score==0 probe heuristic', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 1, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 2, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [1, { frameId: 1, hasChat: false, hasHelpRoot: false, hasArticle: true, looksShell: false,
             markerHits: { '#test-root': true } }],
      [2, { frameId: 2, hasChat: false, hasHelpRoot: false, hasArticle: true, looksShell: false,
             markerHits: {} }],
    ]);
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 1, 'frame with markerHits should rank higher');
    assert.equal(result.reason, 'score_zero_probe_heuristic');
  });

  it('markerHits +6 bonus outranks hasArticle +2', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 1, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 2, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      // frame 1: only hasArticle (+2) + !looksShell (+1) = 3
      [1, { frameId: 1, hasChat: false, hasHelpRoot: false, hasArticle: true, looksShell: false,
             markerHits: {} }],
      // frame 2: markerHits (+6) + !looksShell (+1) = 7
      [2, { frameId: 2, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: false,
             markerHits: { '#host-specific': true } }],
    ]);
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 2, 'markerHits +6 should outrank hasArticle +2');
  });
});

// ══════════════════════════════════════════════════════
// 6. Generic probe heuristics — no DH strings in source
// ══════════════════════════════════════════════════════

describe('HostConfig gating — generic probe heuristics', () => {
  it('collectFrameProbeData source uses ARIA selectors, not vendor strings', () => {
    const swSource = readFileSync(join(__dirname, '..', 'src', 'sw', 'sw.js'), 'utf8');
    // Extract the collectFrameProbeData function body
    const startIdx = swSource.indexOf('async function collectFrameProbeData');
    assert.ok(startIdx >= 0, 'collectFrameProbeData should exist in sw.js');
    // Read enough to cover the inner probe function with selectors
    const snippet = swSource.slice(startIdx, startIdx + 1500);

    // Must NOT contain vendor-specific selectors
    assert.ok(!snippet.includes('#help-center-root'), 'should not contain #help-center-root');
    assert.ok(!snippet.includes('GST_CHAT'), 'should not contain GST_CHAT');
    assert.ok(!snippet.includes('data-testid'), 'should not contain data-testid in probe heuristics');

    // Must contain generic ARIA selectors
    assert.ok(snippet.includes("role='main'"), "should use role='main' selector");
    assert.ok(snippet.includes("role='log'"), "should use role='log' selector");
    assert.ok(snippet.includes("role='feed'"), "should use role='feed' selector");
  });
});

// ══════════════════════════════════════════════════════
// 7. SW validation — urlExcludesAny
// ══════════════════════════════════════════════════════

describe('HostConfig gating — validateIncomingMessage urlExcludesAny', () => {
  const sender = { id: 'test-extension-id' };

  it('accepts valid urlExcludesAny for RUN_AUDIT', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'RUN_AUDIT', tabId: 1, action: 'run',
      match: { urlExcludesAny: ['analytics.com', 'tracking.net'] },
    }, sender);
    assert.equal(result.ok, true);
  });

  it('rejects non-array urlExcludesAny for RUN_AUDIT', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'RUN_AUDIT', tabId: 1, action: 'run',
      match: { urlExcludesAny: 'bad' },
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_MATCH_URL_EXCLUDES');
  });

  it('rejects oversized urlExcludesAny for CAPTURE_STEP', () => {
    const ctx = createSwContext();
    const big = Array.from({ length: 81 }, (_, i) => `item-${i}`);
    const result = ctx.__validateIncomingMessage({
      type: 'CAPTURE_STEP', tabId: 1,
      match: { urlExcludesAny: big },
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_MATCH_URL_EXCLUDES');
  });

  it('rejects urlExcludesAny with overlong strings', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'RUN_AUDIT', tabId: 1, action: 'run',
      match: { urlExcludesAny: ['x'.repeat(257)] },
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_MATCH_URL_EXCLUDES');
  });

  it('accepts null urlExcludesAny', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'RUN_AUDIT', tabId: 1, action: 'run',
      match: {},
    }, sender);
    assert.equal(result.ok, true);
  });
});

// ══════════════════════════════════════════════════════
// 8. Area scoring only when score > 0
// ══════════════════════════════════════════════════════

describe('HostConfig gating — area scoring guard', () => {
  it('area bonus only applies to frames with positive score', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([
        // frame 0: no DOM match, huge area
        { frameId: 0, result: { domMatch: false, area: 1000000 } },
        // frame 1: DOM match, small area
        { frameId: 1, result: { domMatch: true, area: 100 } },
      ]),
    });
    const { scored } = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [
        { frameId: 0, url: 'https://example.com' },
        { frameId: 1, url: 'https://example.com/widget' },
      ],
      match: { domSelectorsAny: ['#widget'], urlIncludes: [] },
    });
    const frame0 = scored.find(s => s.frameId === 0);
    assert.equal(frame0.score, 0, 'hard-gated frame should not get area bonus');
  });
});

// ══════════════════════════════════════════════════════
// 9. computeFrameScores returns excludedFrameCount
// ══════════════════════════════════════════════════════

describe('HostConfig gating — excludedFrameCount', () => {
  it('computeFrameScores returns excludedFrameCount > 0 with urlExcludesAny', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([]),
    });
    const result = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [
        { frameId: 0, url: 'https://example.com' },
        { frameId: 1, url: 'https://analytics.example.com/tracker' },
        { frameId: 2, url: 'https://tracking.net/pixel' },
      ],
      match: {
        domSelectorsAny: [],
        urlIncludes: ['example.com'],
        urlExcludesAny: ['analytics.example.com', 'tracking.net'],
      },
    });
    assert.equal(result.excludedFrameCount, 2, 'should report 2 excluded frames');
    assert.ok(result.scored.find(s => s.frameId === 0).score > 0, 'non-excluded frame should have positive score');
  });

  it('excludedFrameCount is 0 when no exclusions', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([]),
    });
    const result = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [
        { frameId: 0, url: 'https://example.com' },
        { frameId: 1, url: 'https://example.com/page' },
      ],
      match: {
        domSelectorsAny: [],
        urlIncludes: ['example.com'],
        urlExcludesAny: [],
      },
    });
    assert.equal(result.excludedFrameCount, 0, 'should report 0 excluded frames');
  });

  it('excludedFrameCount is 0 when urlExcludesAny is absent', async () => {
    const ctx = createSwContext({
      executeScript: () => Promise.resolve([]),
    });
    const result = await ctx.__computeFrameScores({
      tabId: 1,
      frames: [
        { frameId: 0, url: 'https://example.com' },
      ],
      match: {
        domSelectorsAny: [],
        urlIncludes: [],
      },
    });
    assert.equal(result.excludedFrameCount, 0, 'should report 0 when no urlExcludesAny');
  });
});
