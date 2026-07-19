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
  it('reports blocking > 0 when the last run has blocking findings', () => {
    const ctx = createContext();
    ctx.state.lastResult = {
      ok: true,
      action: 'run',
      bestEntry: {
        ok: true,
        frameId: 0,
        frameKey: 'fk::v1::x::root::00000000',
        frameKeyStable: 'fk::v1::x::root',
        result: {
          ok: true,
          findings: [
            { type: 'ARIA_HIDDEN_FOCUSABLE', severity: 'high', wcag: '4.1.2', name: 'x', path: 'p' },
            { type: 'IMG_NO_ALT', severity: 'medium', wcag: '1.1.1', name: 'y', path: 'q' },
          ],
        },
      },
    };
    const report = ctx.buildCIReportFromState();
    assert.ok(report, 'report should build');
    const blocking = report?.summary?.blockingCurrent ?? report?.summary?.blocking ?? null;
    assert.ok(Number(blocking) >= 2, `blocking should count high+medium findings, got ${blocking}`);
  });
});
