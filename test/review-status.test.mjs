/**
 * Review status classification tests — classifyReviewStatus, computeReviewCounts.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Review status classification', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('strict confidence → automated', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: 'strict' }), 'automated');
  });

  it('heuristic confidence → needs_review', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: 'heuristic' }), 'needs_review');
  });

  it('advisory confidence → needs_review', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: 'advisory' }), 'needs_review');
  });

  it('null confidence + info severity → info', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: null, severity: 'info' }), 'info');
  });

  it('null confidence + high severity → needs_review', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: null, severity: 'high' }), 'needs_review');
  });

  it('computeReviewCounts returns correct totals', () => {
    const findings = [
      { confidence: 'strict', severity: 'high' },
      { confidence: 'heuristic', severity: 'medium' },
      { confidence: 'advisory', severity: 'low' },
      { confidence: null, severity: 'info' },
    ];
    const counts = ctx.computeReviewCounts(findings);
    assert.equal(counts.automated, 1);
    assert.equal(counts.needsReview, 2);
    assert.equal(counts.info, 1);
  });

  it('classification is deterministic', () => {
    const f = { confidence: 'heuristic', severity: 'medium' };
    const r1 = ctx.classifyReviewStatus(f);
    const r2 = ctx.classifyReviewStatus(f);
    assert.equal(r1, r2);
  });

  it('SHADOW_DOM_NOTE finding → info status', () => {
    const finding = { type: 'SHADOW_DOM_NOTE', severity: 'info', confidence: null };
    assert.equal(ctx.classifyReviewStatus(finding), 'info');
  });
});
