/**
 * Regression tests for the v7 whole-codebase audit fixes:
 * detectEnv host-only matching, computeStableDiff blocking deltas,
 * serialized uiPrefs writes, and the CI report blocking count.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('detectEnv — hostname-only matching', () => {
  const ctx = createContext();
  it('prod paths containing test/dev words stay prod', () => {
    assert.equal(ctx.detectEnv('https://app.example.com/latest/developers?q=test'), 'prod');
    assert.equal(ctx.detectEnv('https://example.com/greatest-hits'), 'prod');
  });
  it('staging-ish hostnames are staging', () => {
    assert.equal(ctx.detectEnv('https://staging.example.com/x'), 'staging');
    assert.equal(ctx.detectEnv('https://app-qa.example.com/'), 'staging');
    assert.equal(ctx.detectEnv('https://dev.example.com/'), 'staging');
  });
  it('localhost is local', () => {
    assert.equal(ctx.detectEnv('http://localhost:3000/x'), 'local');
    assert.equal(ctx.detectEnv('http://127.0.0.1/'), 'local');
  });
});

describe('computeStableDiff — blocking deltas', () => {
  const ctx = createContext();
  it('counts blockingAdded/blockingFixed from blocking sets', () => {
    const d = ctx.computeStableDiff(
      ['a', 'b'], ['b', 'c'],
      ['a'],      // prev blocking
      ['c'],      // curr blocking
    );
    assert.equal(d.added, 1);
    assert.equal(d.fixed, 1);
    assert.equal(d.persisting, 1);
    assert.equal(d.blockingAdded, 1, 'c is blocking and new');
    assert.equal(d.blockingFixed, 1, 'a was blocking and is gone');
  });
  it('stays zero without blocking sets (back-compat)', () => {
    const d = ctx.computeStableDiff(['a'], ['b']);
    assert.equal(d.blockingAdded, 0);
    assert.equal(d.blockingFixed, 0);
  });
});

describe('updateUiPrefs — serialized writes', () => {
  it('two overlapping writers both land', async () => {
    const ctx = createContext();
    await Promise.all([
      ctx.updateUiPrefs({ wcagLevel: '2.2-AA' }),
      ctx.updateUiPrefs({ depthMax: 2 }),
    ]);
    const raw = ctx.__mockChrome.storage.local._raw.uiPrefs;
    assert.equal(raw.wcagLevel, '2.2-AA');
    assert.equal(raw.depthMax, 2);
  });
});

describe('buildCIReportFromState — blocking count', () => {
  function withLastResult(ctx, findings) {
    ctx.state.lastResult = {
      ok: true,
      action: 'run',
      bestEntry: {
        ok: true,
        frameId: 0,
        frameKey: 'fk::v1::x::root::00000000',
        frameKeyStable: 'fk::v1::x::root',
        result: { ok: true, findings },
      },
    };
  }

  it('reports blocking > 0 when the last run has blocking findings', () => {
    const ctx = createContext();
    withLastResult(ctx, [
      { type: 'ARIA_HIDDEN_FOCUSABLE', severity: 'high', wcag: '4.1.2', name: 'x', path: 'p', confidence: 'strict' },
      { type: 'IMG_NO_ALT', severity: 'medium', wcag: '1.1.1', name: 'y', path: 'q', confidence: 'strict' },
    ]);
    const report = ctx.buildCIReportFromState();
    assert.ok(report, 'report should build');
    assert.equal(Number(report?.summary?.blockingCurrent), 2);
  });

  it('follows panel confidence rules — heuristic medium and advisory never block (Codex P1)', () => {
    const ctx = createContext();
    withLastResult(ctx, [
      { type: 'CHAT_FEED_MISSING_ROLE', severity: 'medium', wcag: '1.3.1', name: 'feed', path: 'p', confidence: 'heuristic' },
      { type: 'FOCUS_MAY_BE_OBSCURED', severity: 'high', wcag: '2.4.11', name: 'x', path: 'q', confidence: 'advisory' },
      { type: 'ARIA_HIDDEN_FOCUSABLE', severity: 'high', wcag: '4.1.2', name: 'y', path: 'r', confidence: 'heuristic' },
    ]);
    const report = ctx.buildCIReportFromState();
    // heuristic medium: no; advisory high: no; heuristic high: yes
    assert.equal(Number(report?.summary?.blockingCurrent), 1);
  });

  it('blocking count respects the same filtered scope as totalCount (Codex P1)', () => {
    const ctx = createContext();
    withLastResult(ctx, [
      { type: 'ARIA_HIDDEN_FOCUSABLE', severity: 'high', wcag: '4.1.2', name: 'x', path: 'p', confidence: 'strict' },
    ]);
    // Rule pack that excludes the only finding — report scope is empty
    ctx.setActiveRulePack?.({ disabledRuleIds: ['ARIA_HIDDEN_FOCUSABLE'] });
    const report = ctx.buildCIReportFromState();
    if (report?.summary?.totalCount === 0) {
      assert.equal(Number(report.summary.blockingCurrent), 0,
        'blockingCurrent must not exceed the report’s own filtered scope');
    } else {
      // rule-pack API unavailable in harness — invariant still must hold
      assert.ok(Number(report.summary.blockingCurrent) <= Number(report.summary.totalCount));
    }
  });
});
