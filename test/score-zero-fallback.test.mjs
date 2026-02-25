/**
 * Score==0 fallback heuristics tests — probe-based frame selection.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSwContext } from './sw-harness.mjs';

describe('Score==0 fallback heuristics', () => {
  it('selects frame with hasChat when all scores are zero', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 1, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 2, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: true }],
      [1, { frameId: 1, hasChat: true, hasHelpRoot: false, hasArticle: false, looksShell: false }],
      [2, { frameId: 2, hasChat: false, hasHelpRoot: false, hasArticle: true, looksShell: false }],
    ]);
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 1, 'should select chat iframe');
    assert.equal(result.reason, 'score_zero_probe_heuristic');
  });

  it('selects frame with hasHelpRoot when no chat frame', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 3, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: true }],
      [3, { frameId: 3, hasChat: false, hasHelpRoot: true, hasArticle: false, looksShell: false }],
    ]);
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 3, 'should select help root iframe');
    assert.equal(result.reason, 'score_zero_probe_heuristic');
  });

  it('prefers hasChat over hasHelpRoot', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 1, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 2, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [1, { frameId: 1, hasChat: false, hasHelpRoot: true, hasArticle: true, looksShell: false }],
      [2, { frameId: 2, hasChat: true, hasHelpRoot: false, hasArticle: false, looksShell: false }],
    ]);
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 2, 'chat should rank higher than help root');
  });

  it('falls back to top frame when no probe signals', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 1, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: true }],
      [1, { frameId: 1, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: true }],
    ]);
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 0, 'should fall back to top frame');
    assert.equal(result.reason, 'score_zero_fallback_top');
  });

  it('avoids looksShell frames when non-shell exists', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 4, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: true }],
      [4, { frameId: 4, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: false }],
    ]);
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 4, 'should prefer non-shell frame');
    assert.equal(result.reason, 'score_zero_probe_heuristic');
  });

  it('still uses scoring when some frames have positive scores', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 5, blockingCount: 1 } },
      { frameId: 1, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: true }],
      [1, { frameId: 1, hasChat: true, hasHelpRoot: true, hasArticle: true, looksShell: false }],
    ]);
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target: {}, probeByFrameId });
    assert.equal(result.entry.frameId, 0, 'positive score should beat probe heuristics');
    assert.equal(result.reason, 'scored_best');
  });

  // Concern 5: manualFrameIds present + score==0 → fallback heuristics MUST NOT run.
  it('manual override + score==0: heuristics must NOT run (Concern 5)', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
      { frameId: 5, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: true, hasHelpRoot: true, hasArticle: true, looksShell: false }],
      [5, { frameId: 5, hasChat: false, hasHelpRoot: false, hasArticle: false, looksShell: true }],
    ]);
    // Manual override targets frame 5 — even though frame 0 has better heuristic signals
    const target = { frameIds: [5], mode: 'manual' };
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target, probeByFrameId });
    assert.equal(result.entry.frameId, 5, 'must use pinned frame, not heuristic winner');
    assert.equal(result.reason, 'manual_pinned_override', 'reason must be manual override, not heuristic');
  });

  it('manual override + score==0 + pinned frame missing: returns null (Concern 5)', () => {
    const ctx = createSwContext();
    const perFrame = [
      { frameId: 0, ok: true, normalized: { summaryScore: 0, blockingCount: 0 } },
    ];
    const probeByFrameId = new Map([
      [0, { frameId: 0, hasChat: true, hasHelpRoot: true, hasArticle: true, looksShell: false }],
    ]);
    const target = { frameIds: [99], mode: 'manual' };
    const result = ctx.__chooseBestEntry({ action: 'run', perFrame, target, probeByFrameId });
    assert.equal(result.entry, null, 'must not fallback to heuristic selection');
    assert.equal(result.reason, 'manual_frames_missing');
  });
});
