/**
 * Coverage-aware diff warning tests — checkShadowCoverageChange()
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Coverage-aware diff warnings', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('returns warning when scopesCapped changes', () => {
    const prev = { shadowCoverage: { scopesAudited: 50, scopesCapped: true, depthLimitReached: false } };
    const curr = { shadowCoverage: { scopesAudited: 10, scopesCapped: false, depthLimitReached: false } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.ok(result, 'should produce warning');
    assert.equal(result.type, 'SHADOW_COVERAGE_CHANGED');
    assert.equal(result.from.scopesCapped, true);
    assert.equal(result.to.scopesCapped, false);
  });

  it('returns warning when scopesAudited differs', () => {
    const prev = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false } };
    const curr = { shadowCoverage: { scopesAudited: 10, scopesCapped: false, depthLimitReached: false } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.ok(result, 'should produce warning');
    assert.equal(result.from.scopesAudited, 5);
    assert.equal(result.to.scopesAudited, 10);
  });

  it('returns warning when depthLimitReached changes', () => {
    const prev = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false } };
    const curr = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: true } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.ok(result, 'should produce warning');
  });

  it('returns null when coverage identical', () => {
    const prev = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false } };
    const curr = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.equal(result, null);
  });

  it('handles missing shadowCoverage gracefully (pre-v3)', () => {
    const prev = {};
    const curr = {};
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.equal(result, null, 'both missing → no warning');
  });

  it('warns when one snapshot lacks coverage (migration)', () => {
    const prev = {};
    const curr = { shadowCoverage: { scopesAudited: 3, scopesCapped: false, depthLimitReached: false } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.ok(result, 'should produce warning for asymmetric coverage');
  });

  it('warning does not alter diff results', () => {
    const warning = {
      type: 'SHADOW_COVERAGE_CHANGED',
      from: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false },
      to: { scopesAudited: 10, scopesCapped: false, depthLimitReached: false },
    };
    assert.ok(!('added' in warning), 'warning must not contain diff fields');
    assert.ok(!('fixed' in warning), 'warning must not contain diff fields');
  });
});
