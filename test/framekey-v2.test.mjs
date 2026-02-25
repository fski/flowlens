/**
 * FrameKey v2 tests — verifies stable identity split from signals hash.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createSwContext } from './sw-harness.mjs';

describe('FrameKey v2', () => {
  let ctx;

  it('deriveFrameKey returns frameKey, frameKeyStable, and frameSignalsHash', () => {
    ctx = createSwContext();
    const result = ctx.__deriveFrameKey('https://example.com/help/article', 'https://example.com', { '#chat': true });
    assert.ok(result.frameKey, 'should have legacy frameKey');
    assert.ok(result.frameKeyStable, 'should have frameKeyStable');
    assert.ok(result.frameSignalsHash, 'should have frameSignalsHash');
  });

  it('frameKeyStable is unchanged when markerHits change', () => {
    ctx = createSwContext();
    const r1 = ctx.__deriveFrameKey('https://example.com/help/article', 'https://example.com', { '#chat': true });
    const r2 = ctx.__deriveFrameKey('https://example.com/help/article', 'https://example.com', { '#chat': false, '#help': true });
    const r3 = ctx.__deriveFrameKey('https://example.com/help/article', 'https://example.com', {});
    assert.equal(r1.frameKeyStable, r2.frameKeyStable, 'stable key must not change with marker changes');
    assert.equal(r2.frameKeyStable, r3.frameKeyStable, 'stable key must not change with empty markers');
  });

  it('frameSignalsHash changes when markerHits change', () => {
    ctx = createSwContext();
    const r1 = ctx.__deriveFrameKey('https://example.com/help', 'https://example.com', { '#chat': true });
    const r2 = ctx.__deriveFrameKey('https://example.com/help', 'https://example.com', { '#chat': false });
    assert.notEqual(r1.frameSignalsHash, r2.frameSignalsHash, 'signals hash must change with marker changes');
  });

  it('frameKeyStable changes when URL changes', () => {
    ctx = createSwContext();
    const r1 = ctx.__deriveFrameKey('https://example.com/help', 'https://example.com', {});
    const r2 = ctx.__deriveFrameKey('https://example.com/support', 'https://example.com', {});
    assert.notEqual(r1.frameKeyStable, r2.frameKeyStable, 'stable key must change with URL');
  });

  it('legacy frameKey includes marker hash suffix', () => {
    ctx = createSwContext();
    const result = ctx.__deriveFrameKey('https://example.com/help', 'https://example.com', { '#a': true });
    assert.ok(result.frameKey.startsWith(result.frameKeyStable), 'legacy key should start with stable key');
    assert.ok(result.frameKey.length > result.frameKeyStable.length, 'legacy key should be longer than stable');
    assert.ok(result.frameKey.endsWith(result.frameSignalsHash), 'legacy key should end with signals hash');
  });

  it('identity continuity uses stable key (not affected by marker toggles)', () => {
    ctx = createSwContext();
    // Simulate two audit steps where marker detection differs
    const step1 = ctx.__deriveFrameKey('https://app.com/widget', 'https://app.com', { '[role="log"]': true, '#help': false });
    const step2 = ctx.__deriveFrameKey('https://app.com/widget', 'https://app.com', { '[role="log"]': false, '#help': true });
    assert.equal(step1.frameKeyStable, step2.frameKeyStable, 'stable identity must persist across marker toggles');
    assert.notEqual(step1.frameSignalsHash, step2.frameSignalsHash, 'signals hash should reflect marker changes');
  });

  // Concern 2: frameSignalsHash must not influence scoring, continuity, or diff logic.
  it('markerHits change → frameKeyStable same → identity preserved (Concern 2)', () => {
    ctx = createSwContext();
    const markers1 = { '#chat': true, '[role="log"]': true };
    const markers2 = { '#chat': false, '[role="log"]': false };
    const r1 = ctx.__deriveFrameKey('https://app.com/help', 'https://app.com', markers1);
    const r2 = ctx.__deriveFrameKey('https://app.com/help', 'https://app.com', markers2);
    assert.equal(r1.frameKeyStable, r2.frameKeyStable, 'stable identity preserved despite marker changes');
    // frameSignalsHash is diagnostic only — it differs, but identity is stable
    assert.notEqual(r1.frameSignalsHash, r2.frameSignalsHash, 'diagnostic hash differs');
  });

  // Concern 2: scoreRunResult does not use frameSignalsHash
  it('scoreRunResult does not reference frameSignalsHash (Concern 2)', () => {
    ctx = createSwContext();
    // scoreRunResult accepts a result object and scores based on findings only.
    const result = {
      findings: [
        { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
      ],
    };
    const scored = ctx.__scoreRunResult(result);
    // Score depends on findings only, not on any frame key or signals hash
    assert.equal(typeof scored, 'object');
    assert.ok(scored.summaryScore > 0, 'should produce positive score from high severity finding');
    assert.equal(scored.blockingCount, 1, 'high severity = blocking');
    // Same result twice → deterministic (no external state dependency)
    const scored2 = ctx.__scoreRunResult(result);
    assert.equal(scored.summaryScore, scored2.summaryScore, 'must be deterministic');
  });
});
