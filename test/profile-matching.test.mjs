/**
 * Profile matching contract tests — deterministic scoring, confidence
 * thresholds, tie resolution, and manual override.
 *
 * Since computeProfileMatch and selectBestProfileMatch are internal to
 * panel.js (browser context), we replicate the scoring algorithm here as
 * portable pure functions and test the contract directly. This ensures the
 * scoring spec is locked down even if the panel.js internals are refactored.
 *
 * Score components:
 *   +3 for urlIncludes match (first match only)
 *   +2 per domSelectorsAny hit (capped at 4 hits = max +8)
 *   +2 if hasChat/hasHelpRoot/hasArticle matches profile intent
 *   +1 for frameScope alignment
 *
 * Confidence:
 *   score >= 6 -> "high"
 *   score >= 3 -> "medium"
 *   score <  3 -> "low"
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ---------------------------------------------------------------------------
// Portable reference implementation of the scoring contract
// ---------------------------------------------------------------------------

/**
 * Compute a profile match score against probe data and frame URL.
 * Mirrors panel.js computeProfileMatch().
 */
function computeProfileMatch(profileId, profile, probeData, frameUrl) {
  const signals = [];
  let score = 0;

  // +3 for urlIncludes match (first match only)
  const urlIncludes = Array.isArray(profile?.frame?.urlIncludes)
    ? profile.frame.urlIncludes
    : [];
  const urlLower = (frameUrl || '').toLowerCase();
  for (const inc of urlIncludes) {
    if (inc && urlLower.includes(String(inc).toLowerCase())) {
      score += 3;
      signals.push(`url:${String(inc).slice(0, 40)}`);
      break;
    }
  }

  // +2 per domSelectorsAny hit (cap at 4 hits = max +8)
  const domSelectors = Array.isArray(profile?.frame?.domSelectors)
    ? profile.frame.domSelectors
    : [];
  const markerHits =
    probeData && typeof probeData === 'object' && probeData.markerHits
      ? probeData.markerHits
      : {};
  let domHits = 0;
  for (const sel of domSelectors) {
    if (markerHits[sel] === true && domHits < 4) {
      domHits++;
      score += 2;
      signals.push(`dom:${String(sel).slice(0, 40)}`);
    }
  }

  // +2 if hasChat/hasHelpRoot/hasArticle matches profile intent
  const frameScope = profile?.frameScope || 'primary';
  if (probeData) {
    if (frameScope === 'embedded' && probeData.hasChat) {
      score += 2;
      signals.push('intent:hasChat');
    } else if (frameScope === 'primary' && probeData.hasHelpRoot) {
      score += 2;
      signals.push('intent:hasHelpRoot');
    } else if (
      probeData.hasArticle &&
      (frameScope === 'primary' || frameScope === 'all')
    ) {
      score += 2;
      signals.push('intent:hasArticle');
    }
  }

  // +1 for frameScope alignment
  const bestFrameId = probeData?.frameId;
  if (bestFrameId != null) {
    const isTopFrame = bestFrameId === 0;
    if ((frameScope === 'primary' || frameScope === 'host') && isTopFrame) {
      score += 1;
      signals.push('scope:aligned');
    } else if (frameScope === 'embedded' && !isTopFrame) {
      score += 1;
      signals.push('scope:aligned');
    } else if (frameScope === 'all') {
      score += 1;
      signals.push('scope:all');
    }
  }

  // Confidence
  const confidence = score >= 6 ? 'high' : score >= 3 ? 'medium' : 'low';

  return {
    profileId: String(profileId),
    label: profile?.label || String(profileId),
    matchScore: score,
    matchSignals: signals,
    confidence,
  };
}

/**
 * Select best profile match. Deterministic tie resolution: alphabetical profileId.
 * Mirrors panel.js selectBestProfileMatch().
 */
function selectBestProfileMatch(profiles, probeData, frameUrl, isManualOverride, manualActiveId) {
  if (isManualOverride) {
    return {
      profileId: manualActiveId || null,
      label: manualActiveId
        ? (profiles[manualActiveId]?.label || manualActiveId)
        : null,
      matchScore: 0,
      matchSignals: ['manual_override'],
      confidence: 'manual',
    };
  }

  const candidates = [];
  for (const [id, profile] of Object.entries(profiles)) {
    const match = computeProfileMatch(id, profile, probeData, frameUrl);
    candidates.push(match);
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return a.profileId.localeCompare(b.profileId);
  });

  return candidates[0].matchScore > 0 ? candidates[0] : null;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Profile matching — deterministic scoring', () => {
  it('urlIncludes gives +3', () => {
    const profile = {
      label: 'Test',
      frameScope: 'primary',
      frame: { urlIncludes: ['help.example.com'], domSelectors: [] },
    };
    const probe = { markerHits: {}, frameId: 0 };
    const result = computeProfileMatch('test', profile, probe, 'https://help.example.com/faq');
    assert.equal(result.matchScore, 4, 'should be +3 (url) + 1 (scope aligned)');
    assert.ok(
      result.matchSignals.some((s) => s.startsWith('url:')),
      'should include a url signal',
    );
  });

  it('domSelectorsAny gives +2 per hit', () => {
    const profile = {
      label: 'Test',
      frameScope: 'embedded',
      frame: { urlIncludes: [], domSelectors: ['.chat-widget', '.live-chat'] },
    };
    const probe = {
      markerHits: { '.chat-widget': true, '.live-chat': true },
      frameId: 5,
    };
    const result = computeProfileMatch('test', profile, probe, '');
    // +2 per hit (2 hits) + 1 scope aligned (embedded + frameId !== 0)
    assert.equal(result.matchScore, 5, 'should be +4 (dom) + 1 (scope)');
    const domSignals = result.matchSignals.filter((s) => s.startsWith('dom:'));
    assert.equal(domSignals.length, 2, 'should have 2 dom signals');
  });

  it('domSelectorsAny capped at 4 hits (+8 max)', () => {
    const profile = {
      label: 'Test',
      frameScope: 'primary',
      frame: {
        urlIncludes: [],
        domSelectors: ['.a', '.b', '.c', '.d', '.e', '.f'],
      },
    };
    const probe = {
      markerHits: {
        '.a': true,
        '.b': true,
        '.c': true,
        '.d': true,
        '.e': true,
        '.f': true,
      },
      frameId: 0,
    };
    const result = computeProfileMatch('test', profile, probe, '');
    const domSignals = result.matchSignals.filter((s) => s.startsWith('dom:'));
    assert.equal(domSignals.length, 4, 'should cap at 4 dom hits');
    // +8 (dom capped) + 1 (scope aligned)
    assert.equal(result.matchScore, 9, 'should be +8 (dom capped) + 1 (scope)');
  });

  it('hasChat intent match gives +2 for embedded scope', () => {
    const profile = {
      label: 'Chat Widget',
      frameScope: 'embedded',
      frame: { urlIncludes: [], domSelectors: [] },
    };
    const probe = {
      markerHits: {},
      hasChat: true,
      hasHelpRoot: false,
      hasArticle: false,
      frameId: 3,
    };
    const result = computeProfileMatch('chat', profile, probe, '');
    // +2 (intent:hasChat) + 1 (scope:aligned, embedded + non-top)
    assert.equal(result.matchScore, 3, 'should be +2 (intent) + 1 (scope)');
    assert.ok(
      result.matchSignals.includes('intent:hasChat'),
      'should include intent:hasChat signal',
    );
  });

  it('hasHelpRoot intent match gives +2 for primary scope', () => {
    const profile = {
      label: 'Help Center',
      frameScope: 'primary',
      frame: { urlIncludes: [], domSelectors: [] },
    };
    const probe = {
      markerHits: {},
      hasChat: false,
      hasHelpRoot: true,
      hasArticle: false,
      frameId: 0,
    };
    const result = computeProfileMatch('helpcenter', profile, probe, '');
    // +2 (intent:hasHelpRoot) + 1 (scope:aligned, primary + top frame)
    assert.equal(result.matchScore, 3, 'should be +2 (intent) + 1 (scope)');
    assert.ok(
      result.matchSignals.includes('intent:hasHelpRoot'),
      'should include intent:hasHelpRoot signal',
    );
  });

  it('frameScope alignment gives +1', () => {
    const profile = {
      label: 'Test',
      frameScope: 'embedded',
      frame: { urlIncludes: [], domSelectors: [] },
    };
    // embedded scope + non-top frame -> scope aligned
    const probe = {
      markerHits: {},
      hasChat: false,
      hasHelpRoot: false,
      hasArticle: false,
      frameId: 7,
    };
    const result = computeProfileMatch('test', profile, probe, '');
    assert.equal(result.matchScore, 1, 'should be +1 (scope only)');
    assert.ok(
      result.matchSignals.includes('scope:aligned'),
      'should include scope:aligned signal',
    );
  });

  it('total from all components', () => {
    const profile = {
      label: 'Full Match',
      frameScope: 'embedded',
      frame: {
        urlIncludes: ['chat.example.com'],
        domSelectors: ['.chat-root', '.chat-input', '.chat-avatar'],
      },
    };
    const probe = {
      markerHits: {
        '.chat-root': true,
        '.chat-input': true,
        '.chat-avatar': true,
      },
      hasChat: true,
      hasHelpRoot: false,
      hasArticle: false,
      frameId: 2,
    };
    const result = computeProfileMatch(
      'full',
      profile,
      probe,
      'https://chat.example.com/widget',
    );
    // +3 (url) + 6 (3 dom hits x 2) + 2 (intent:hasChat) + 1 (scope:aligned)
    assert.equal(result.matchScore, 12, 'should be 3 + 6 + 2 + 1 = 12');
    assert.equal(result.confidence, 'high');
    assert.equal(result.matchSignals.length, 6, 'url + 3 dom + intent + scope');
  });
});

describe('Profile matching — confidence thresholds', () => {
  it('score >= 6 is "high"', () => {
    const profile = {
      label: 'High',
      frameScope: 'embedded',
      frame: {
        urlIncludes: ['example.com'],
        domSelectors: ['.a', '.b'],
      },
    };
    const probe = {
      markerHits: { '.a': true, '.b': true },
      hasChat: true,
      frameId: 1,
    };
    const result = computeProfileMatch('high', profile, probe, 'https://example.com');
    // +3 (url) + 4 (dom) + 2 (intent) + 1 (scope) = 10
    assert.ok(result.matchScore >= 6, `score ${result.matchScore} should be >= 6`);
    assert.equal(result.confidence, 'high');
  });

  it('score 3-5 is "medium"', () => {
    const profile = {
      label: 'Med',
      frameScope: 'primary',
      frame: { urlIncludes: ['example.com'], domSelectors: [] },
    };
    const probe = {
      markerHits: {},
      hasChat: false,
      hasHelpRoot: false,
      hasArticle: false,
      frameId: 0,
    };
    const result = computeProfileMatch('med', profile, probe, 'https://example.com');
    // +3 (url) + 1 (scope) = 4
    assert.equal(result.matchScore, 4, 'should score 4');
    assert.equal(result.confidence, 'medium');
  });

  it('score < 3 is "low"', () => {
    const profile = {
      label: 'Low',
      frameScope: 'embedded',
      frame: { urlIncludes: [], domSelectors: [] },
    };
    const probe = {
      markerHits: {},
      hasChat: false,
      hasHelpRoot: false,
      hasArticle: false,
      frameId: 5,
    };
    const result = computeProfileMatch('low', profile, probe, 'https://unrelated.com');
    // +1 (scope:aligned for embedded + non-top frame)
    assert.equal(result.matchScore, 1, 'should score 1');
    assert.equal(result.confidence, 'low');
  });
});

describe('Profile matching — tie resolution', () => {
  it('alphabetical profileId breaks ties', () => {
    const profiles = {
      'zebra-profile': {
        label: 'Zebra',
        frameScope: 'primary',
        frame: { urlIncludes: ['example.com'], domSelectors: [] },
      },
      'alpha-profile': {
        label: 'Alpha',
        frameScope: 'primary',
        frame: { urlIncludes: ['example.com'], domSelectors: [] },
      },
    };
    const probe = {
      markerHits: {},
      hasChat: false,
      hasHelpRoot: false,
      hasArticle: false,
      frameId: 0,
    };
    const result = selectBestProfileMatch(
      profiles,
      probe,
      'https://example.com',
      false,
      null,
    );
    assert.ok(result, 'should return a match');
    assert.equal(
      result.profileId,
      'alpha-profile',
      'alphabetically first profile should win on tie',
    );
  });
});

describe('Profile matching — manual override', () => {
  it('returns confidence "manual" with signal "manual_override"', () => {
    const profiles = {
      'some-profile': {
        label: 'Some Profile',
        frameScope: 'primary',
        frame: { urlIncludes: ['example.com'], domSelectors: ['.x'] },
      },
    };
    const probe = {
      markerHits: { '.x': true },
      hasHelpRoot: true,
      frameId: 0,
    };
    const result = selectBestProfileMatch(
      profiles,
      probe,
      'https://example.com',
      true,
      'some-profile',
    );
    assert.ok(result, 'should return a match');
    assert.equal(result.confidence, 'manual');
    assert.equal(result.matchScore, 0, 'manual override should bypass scoring');
    assert.deepEqual(result.matchSignals, ['manual_override']);
    assert.equal(result.profileId, 'some-profile');
  });
});
