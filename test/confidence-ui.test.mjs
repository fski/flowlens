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
    // The note needs something to compare: a baseline step + the step under test.
    steps: [{ index: 1, diffs: { consolidated: { blockingAdded: 0 } }, snapshots: {}, findingIndex: {} },
      { index: 2, diffs: { consolidated: { blockingAdded: 0 } }, snapshots: {}, findingIndex: {}, ...stepOverrides }],
  });
}

describe('flow verdict — reduced diff confidence note', () => {
  it('shows the note when a step has rootSelectorNotFound', () => {
    const ctx = createContext();
    const html = headerFor(ctx, { rootSelectorNotFound: true });
    assert.match(html, /Comparison less reliable/);
    assert.match(html, /root element was not found/);
  });

  it('shows the note for low profile confidence — only when a profile was in play', () => {
    const ctx = createContext();
    const html = headerFor(ctx, { profileSuspect: true, profileLabel: 'Wizard' });
    assert.match(html, /Comparison less reliable/);
    assert.match(html, /page type match is uncertain/);
  });

  it('suspect WITHOUT an applied profile does not reduce confidence', () => {
    // Generic pages with no matching profile are always "low confidence" —
    // that flagged every ordinary session as reduced (2026-07-20 UX audit).
    const ctx = createContext();
    const html = headerFor(ctx, { profileSuspect: true });
    assert.doesNotMatch(html, /Comparison less reliable/);
  });

  it('shows the note for degraded stable signatures', () => {
    const ctx = createContext();
    const html = headerFor(ctx, { stableSignatures: { run: { stepQuality: { degraded: true } } } });
    assert.match(html, /Comparison less reliable/);
    assert.match(html, /lack stable identifiers/);
  });

  it('omits the note on a single-step flow (nothing to compare yet)', () => {
    const ctx = createContext();
    const html = ctx.flowVerdictHeaderHtml({ id: 's', steps: [{ index: 1, diffs: { consolidated: { blockingAdded: 0 } }, snapshots: {}, findingIndex: {}, rootSelectorNotFound: true }] });
    assert.doesNotMatch(html, /Comparison less reliable/);
  });

  it('omits the note when the step is structurally clean', () => {
    const ctx = createContext();
    const html = headerFor(ctx, {});
    assert.doesNotMatch(html, /Comparison less reliable/);
  });
});
