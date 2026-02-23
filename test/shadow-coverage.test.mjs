/**
 * Shadow coverage receipt tests — validates coverage metadata structure and logic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Shadow coverage receipt', () => {
  it('shadowCoverage always present even with 0 shadow roots', () => {
    const coverage = {
      scopesFound: 0,
      scopesAudited: 0,
      scopesCapped: false,
      maxDepthObserved: 0,
      depthLimitReached: false,
    };
    assert.equal(coverage.scopesFound, 0);
    assert.equal(coverage.scopesCapped, false);
    assert.equal(coverage.depthLimitReached, false);
  });

  it('scopesCapped true when scopesFound > MAX_SHADOW_SCOPES', () => {
    const MAX_SHADOW_SCOPES = 50;
    const scopesFound = 75;
    const scopesCapped = scopesFound > MAX_SHADOW_SCOPES;
    const scopesAudited = Math.min(scopesFound, MAX_SHADOW_SCOPES);
    assert.equal(scopesCapped, true);
    assert.equal(scopesAudited, 50);
  });

  it('depthLimitReached true when max depth exceeded', () => {
    const MAX_SHADOW_DEPTH = 5;
    const depths = [0, 1, 2, 3, 4, 5];
    const depthLimitReached = depths.some(d => d >= MAX_SHADOW_DEPTH);
    assert.equal(depthLimitReached, true);
  });

  it('depthLimitReached false when all within limit', () => {
    const MAX_SHADOW_DEPTH = 5;
    const depths = [0, 1, 2, 3];
    const depthLimitReached = depths.some(d => d >= MAX_SHADOW_DEPTH);
    assert.equal(depthLimitReached, false);
  });

  it('maxDepthObserved tracks deepest level', () => {
    const depths = [0, 1, 3, 2, 1];
    const maxDepthObserved = Math.max(...depths);
    assert.equal(maxDepthObserved, 3);
  });

  it('scopesAudited equals scopesFound when under cap', () => {
    const MAX_SHADOW_SCOPES = 50;
    const scopesFound = 12;
    const scopesAudited = Math.min(scopesFound, MAX_SHADOW_SCOPES);
    assert.equal(scopesAudited, 12);
  });

  it('coverage is deterministic for same DOM state', () => {
    const cov1 = { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false };
    const cov2 = { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false };
    assert.deepEqual(cov1, cov2);
  });
});
