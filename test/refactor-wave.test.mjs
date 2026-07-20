/**
 * Refactor wave (2026-07-20, ranks R3/R1/R2/R4) — regression guards.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

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
