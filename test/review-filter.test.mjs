/**
 * Needs-review explorer filter — state.reviewFilter narrows the findings list
 * to heuristic/advisory findings (classifyReviewStatus === "needs_review").
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

const FINDINGS = [
  { severity: 'high', confidence: 'strict', type: 'ARIA_HIDDEN_FOCUSABLE', name: 'a', path: 'x', wcag: '4.1.2' },
  { severity: 'medium', confidence: 'heuristic', type: 'PASTE_BLOCKED_INPUT', name: 'b', path: 'y', wcag: '3.3.8' },
  { severity: 'low', confidence: 'advisory', type: 'FOCUS_MAY_BE_OBSCURED', name: 'c', path: 'z', wcag: '2.4.11' },
];

test('reviewFilter=false keeps all findings', () => {
  const ctx = createContext();
  ctx.state.reviewFilter = false;
  assert.equal(ctx.applyExplorerFilters(FINDINGS).length, 3);
});

test('reviewFilter=true keeps only needs-review findings', () => {
  const ctx = createContext();
  ctx.state.reviewFilter = true;
  const out = ctx.applyExplorerFilters(FINDINGS);
  assert.equal(out.length, 2);
  for (const f of out) {
    assert.equal(ctx.classifyReviewStatus(f), 'needs_review');
  }
});
