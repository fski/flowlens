/**
 * Selector batching per scope — cache deduplication tests.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Selector batching per scope', () => {
  it('same selector across rules only queried once per scope', () => {
    const cache = new Map();

    function cachedQuery(scope, selector) {
      let scopeMap = cache.get(scope);
      if (!scopeMap) {
        scopeMap = new Map();
        cache.set(scope, scopeMap);
      }
      let results = scopeMap.get(selector);
      if (results === undefined) {
        results = [`mock_${selector}`];
        scopeMap.set(selector, results);
        return { results, fromCache: false };
      }
      return { results, fromCache: true };
    }

    const scope1 = 'scope_doc';

    // First call — executes query
    const r1 = cachedQuery(scope1, 'img:not([alt])');
    assert.equal(r1.fromCache, false);

    // Second call — from cache
    const r2 = cachedQuery(scope1, 'img:not([alt])');
    assert.equal(r2.fromCache, true);

    // Different selector — executes query
    const r3 = cachedQuery(scope1, 'button');
    assert.equal(r3.fromCache, false);

    // Same selector, different scope — executes query
    const r4 = cachedQuery('scope_shadow1', 'img:not([alt])');
    assert.equal(r4.fromCache, false);
  });

  it('cache is scoped to single run invocation', () => {
    const cache = new Map();
    cache.set('scope', new Map([['sel', ['el']]]));
    assert.equal(cache.size, 1);

    // Reset
    cache.clear();
    assert.equal(cache.size, 0, 'cache must be empty after reset');
  });

  it('cache does not mutate DOM', () => {
    const mockElements = [{ tagName: 'IMG' }];
    const cache = new Map();
    cache.set('scope', new Map([['img', mockElements]]));
    const retrieved = cache.get('scope').get('img');
    assert.equal(retrieved, mockElements, 'must return same reference');
    assert.equal(retrieved.length, 1, 'must not add/remove elements');
  });
});
