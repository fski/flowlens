/**
 * EN 301 549 clause population — regression guard for the v6 wiring fix.
 * The snippet ships en301549Clauses: null; applyFixSuggestions must fill it
 * from the WCAG criterion (the map was previously never loaded by the panel).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

const ctx = createContext();
const norm = (o) => JSON.parse(JSON.stringify(o));

test('applyFixSuggestions populates en301549Clauses from wcag', () => {
  const out = ctx.applyFixSuggestions([{ type: 'ARIA_HIDDEN_FOCUSABLE', wcag: '4.1.2', en301549Clauses: null }]);
  assert.ok(Array.isArray(norm(out[0].en301549Clauses)), 'clauses should be an array');
  assert.ok(norm(out[0].en301549Clauses).includes('9.4.1.2'), 'should include the section-9 clause');
});

test('leaves findings without wcag untouched', () => {
  const out = ctx.applyFixSuggestions([{ type: 'SHADOW_DOM_NOTE', wcag: null, en301549Clauses: null }]);
  assert.equal(out[0].en301549Clauses, null);
});

test('does not overwrite pre-existing clauses', () => {
  const out = ctx.applyFixSuggestions([{ type: 'X', wcag: '4.1.2', en301549Clauses: ['custom'] }]);
  assert.deepEqual(norm(out[0].en301549Clauses), ['custom']);
});
