/**
 * Reduced-diff-confidence note in the Flow verdict header.
 *
 * The Flow rework (2026-07-20) replaced the old timeline table — the per-step
 * H/M/L confidence badge (_buildTimelineRowHtml) was intentionally dropped as
 * noise. The *reduced-confidence note* (a real signal: the appeared/resolved
 * diff may be unreliable) was preserved and moved into flowVerdictHeaderHtml.
 * This file guards that surviving behaviour.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

function headerFor(ctx, stepOverrides) {
  return ctx.flowVerdictHeaderHtml({
    id: 'sess_x',
    steps: [{ index: 1, diffs: { consolidated: { blockingAdded: 0 } }, snapshots: {}, findingIndex: {}, ...stepOverrides }],
  });
}

describe('flow verdict — reduced diff confidence note', () => {
  it('shows the note when a step has rootSelectorNotFound', () => {
    const ctx = createContext();
    const html = headerFor(ctx, { rootSelectorNotFound: true });
    assert.match(html, /Diff confidence: reduced/);
    assert.match(html, /root selector not found/);
  });

  it('shows the note for low profile confidence — only when a profile was in play', () => {
    const ctx = createContext();
    const html = headerFor(ctx, { profileSuspect: true, profileLabel: 'Wizard' });
    assert.match(html, /Diff confidence: reduced/);
    assert.match(html, /low profile confidence/);
  });

  it('suspect WITHOUT an applied profile does not reduce confidence', () => {
    // Generic pages with no matching profile are always "low confidence" —
    // that flagged every ordinary session as reduced (2026-07-20 UX audit).
    const ctx = createContext();
    const html = headerFor(ctx, { profileSuspect: true });
    assert.doesNotMatch(html, /Diff confidence: reduced/);
  });

  it('shows the note for degraded stable signatures', () => {
    const ctx = createContext();
    const html = headerFor(ctx, { stableSignatures: { run: { stepQuality: { degraded: true } } } });
    assert.match(html, /Diff confidence: reduced/);
    assert.match(html, /degraded signatures/);
  });

  it('omits the note when the step is structurally clean', () => {
    const ctx = createContext();
    const html = headerFor(ctx, {});
    assert.doesNotMatch(html, /Diff confidence: reduced/);
  });
});
