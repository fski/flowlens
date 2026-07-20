/**
 * Refactor wave (2026-07-20, ranks R3/R1/R2/R4) — regression guards.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('R2: decideNavAction — full auto-capture precedence, pure and testable', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  const NAV = () => ({ lastAutoNavUrl: null, lastFrameNavUrl: null, lastTopNavAt: 0, foreignSkips: 0, foreignSkipNotified: false });
  const SESSION = { inspectedOrigin: 'https://app.example.com' };
  const T = 100000;

  it('precedence: no-session, then auto-off', () => {
    assert.equal(ctx.decideNavAction('https://x.com/a', false, NAV(), null, true, T).reason, 'no-session');
    assert.equal(ctx.decideNavAction('https://x.com/a', false, NAV(), SESSION, false, T).reason, 'auto-off');
  });

  it('top nav bumps lastTopNavAt even when skipped (foreign site)', () => {
    const d = ctx.decideNavAction('https://accounts.google.com/x', false, NAV(), SESSION, true, T);
    assert.equal(d.reason, 'skip-foreign-site');
    assert.equal(d.nav.lastTopNavAt, T, 'settle window anchors on the nav EVENT');
  });

  it('frame navs inside the settle window are absorbed by the top nav', () => {
    const nav = { ...NAV(), lastTopNavAt: T - 1000 };
    assert.equal(ctx.decideNavAction('https://mfe.vendor.com/s2', true, nav, SESSION, true, T).reason, 'skip-frame-settle');
    const later = ctx.decideNavAction('https://mfe.vendor.com/s2', true, nav, SESSION, true, T + 5000);
    assert.equal(later.action, 'capture');
    assert.equal(later.reason, 'frame-nav');
  });

  it('frame navs bypass the foreign-site guard (the MFE is the target)', () => {
    const nav = { ...NAV(), lastTopNavAt: 0 };
    assert.equal(ctx.decideNavAction('https://mfe.vendor.com/s2', true, nav, SESSION, true, T).action, 'capture');
  });

  it('dedupe slots are per source: a frame URL never evicts the top slot', () => {
    const nav = { ...NAV(), lastAutoNavUrl: 'https://app.example.com/page', lastFrameNavUrl: 'https://mfe.vendor.com/s1', lastTopNavAt: 0 };
    assert.equal(ctx.decideNavAction('https://app.example.com/page', false, nav, SESSION, true, T).reason, 'skip-not-a-step');
    assert.equal(ctx.decideNavAction('https://mfe.vendor.com/s1', true, nav, SESSION, true, T).reason, 'skip-not-a-step');
    assert.equal(ctx.decideNavAction('https://app.example.com/next', false, nav, SESSION, true, T).action, 'capture');
  });
});

describe('R4: findingIndex covers run + active — view lists match verdict numbers', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  const runSnap = (findings) => ({
    mode: 'run', capturedAt: '2026-07-20T10:00:00.000Z',
    best: { frameKey: 'fk::v1::https://x.com::/:://', frameKeyStable: 'fk::v1::https://x.com::/:://', normalized: { raw: { findings } } },
    perFrame: [],
  });
  const contrastSnap = (n) => ({
    mode: 'contrast', capturedAt: '2026-07-20T10:00:00.000Z',
    best: { frameKey: 'fk::v1::https://x.com::/:://', frameKeyStable: 'fk::v1::https://x.com::/:://', normalized: { raw: { failures: Array.from({ length: n }, (_, i) => ({ path: `p${i}`, text: `sample ${i}`, fg: '#111', bg: '#222' })) } } },
    perFrame: [],
  });

  it('active contrast failures land in the index with blocking-aligned meta', () => {
    const finding = { type: 'MISSING_LABEL', name: 'x', severity: 'medium', confidence: 'strict', wcag: '3.3.2', path: 'html>body>a', product: 'axe', role: '', level: 'AA' };
    const idx = ctx.buildFindingIndexForStep({ run: runSnap([finding]), active: contrastSnap(2) }, {});
    const entries = Object.values(idx);
    assert.equal(entries.length, 3, 'run finding + 2 contrast failures');
    const contrast = entries.filter(e => e.type === 'CONTRAST_FAIL');
    assert.equal(contrast.length, 2);
    assert.equal(contrast[0].severity, 'high');
    assert.equal(contrast[0].wcag, '1.4.3');
    // Blocking classification agrees with the stable engine's counts.
    assert.ok(ctx.isRunFindingBlocking(contrast[0]));
  });

  it('issues-now (index size) now equals the consolidated stable universe', () => {
    const step = {
      id: 'step_1', index: 1,
      snapshots: { run: runSnap([]), active: contrastSnap(2) },
    };
    step.stableSignatures = {
      run: ctx.computeStableSignatureSet(step.snapshots.run, {}),
      active: ctx.computeStableSignatureSet(step.snapshots.active, {}),
    };
    step.findingIndex = ctx.buildFindingIndexForStep(step.snapshots, {});
    const universe = step.stableSignatures.run.stableFindingSignatureSet.length
      + step.stableSignatures.active.stableFindingSignatureSet.length;
    assert.equal(Object.keys(step.findingIndex).length, universe);
  });
});

describe('R3: uniqueRawRef — one ref scheme for session + export paths', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('returns the base ref when free, probes ::N on collision', () => {
    const appendix = {};
    const best = { frameKey: 'fk::v1::https://x.com::/:://' };
    const r1 = ctx.uniqueRawRef(appendix, 1, 'run', best, 50);
    assert.equal(r1, 'raw::s1::run::fk::v1::https://x.com::/:://');
    appendix[r1] = {};
    const r2 = ctx.uniqueRawRef(appendix, 1, 'run', best, 50);
    assert.equal(r2, r1 + '::1');
    appendix[r2] = {};
    assert.equal(ctx.uniqueRawRef(appendix, 1, 'run', best, 50), r1 + '::2');
  });

  it('falls back to frameId, then "unknown"', () => {
    assert.match(ctx.uniqueRawRef({}, 2, 'contrast', { frameId: 7 }, 50), /raw::s2::contrast::7$/);
    assert.match(ctx.uniqueRawRef({}, 2, 'run', {}, 50), /raw::s2::run::unknown$/);
  });
});
