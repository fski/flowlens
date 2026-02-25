/**
 * Stable diff parity tests — verifies the new stable signature diff engine
 * produces correct results and matches expected behavior.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Stable diff engine', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext();
  });

  describe('computeStableDiff', () => {
    it('returns zero counts for identical sets', () => {
      const sigs = ['run|MISSING_ALT|1.1.1|high|abc', 'run|LOW_CONTRAST|1.4.3|medium|def'];
      const result = ctx.computeStableDiff(sigs, sigs);
      assert.equal(result.added, 0);
      assert.equal(result.fixed, 0);
      assert.equal(result.persisting, 2);
    });

    it('detects new findings as added', () => {
      const prev = ['run|MISSING_ALT|1.1.1|high|abc'];
      const curr = ['run|MISSING_ALT|1.1.1|high|abc', 'run|EMPTY_HEADING|1.3.1|medium|def'];
      const result = ctx.computeStableDiff(prev, curr);
      assert.equal(result.added, 1);
      assert.equal(result.fixed, 0);
      assert.equal(result.persisting, 1);
    });

    it('detects removed findings as fixed', () => {
      const prev = ['run|MISSING_ALT|1.1.1|high|abc', 'run|EMPTY_HEADING|1.3.1|medium|def'];
      const curr = ['run|MISSING_ALT|1.1.1|high|abc'];
      const result = ctx.computeStableDiff(prev, curr);
      assert.equal(result.added, 0);
      assert.equal(result.fixed, 1);
      assert.equal(result.persisting, 1);
    });

    it('handles empty previous set', () => {
      const result = ctx.computeStableDiff([], ['sig1', 'sig2']);
      assert.equal(result.added, 2);
      assert.equal(result.fixed, 0);
      assert.equal(result.persisting, 0);
    });

    it('handles empty current set', () => {
      const result = ctx.computeStableDiff(['sig1', 'sig2'], []);
      assert.equal(result.added, 0);
      assert.equal(result.fixed, 2);
      assert.equal(result.persisting, 0);
    });

    it('handles both empty', () => {
      const result = ctx.computeStableDiff([], []);
      assert.equal(result.added, 0);
      assert.equal(result.fixed, 0);
      assert.equal(result.persisting, 0);
    });

    it('handles null/undefined input gracefully', () => {
      const result = ctx.computeStableDiff(null, undefined);
      assert.equal(result.added, 0);
      assert.equal(result.fixed, 0);
    });

    it('deduplicates via Set — duplicate sigs counted once', () => {
      const prev = ['sig1', 'sig1', 'sig2'];
      const curr = ['sig1', 'sig2', 'sig2', 'sig3'];
      const result = ctx.computeStableDiff(prev, curr);
      assert.equal(result.added, 1); // sig3
      assert.equal(result.fixed, 0);
      assert.equal(result.persisting, 2); // sig1, sig2
    });
  });

  describe('buildStableSignature', () => {
    it('produces deterministic output', () => {
      const finding = { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>main>img', testId: 'hero-image' };
      const frameKeyStable = 'fk::v2::example.com::/';
      const a = ctx.buildStableSignature(finding, frameKeyStable, 'run');
      const b = ctx.buildStableSignature(finding, frameKeyStable, 'run');
      assert.equal(a, b);
    });

    it('excludes text content from signature', () => {
      const f1 = { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img', text: 'Click here' };
      const f2 = { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img', text: 'Submit form' };
      const fk = 'fk::v2::example.com::/';
      assert.equal(ctx.buildStableSignature(f1, fk), ctx.buildStableSignature(f2, fk));
    });

    it('excludes aria-label from signature', () => {
      const f1 = { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img', ariaLabel: 'hero image' };
      const f2 = { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img', ariaLabel: 'banner photo' };
      const fk = 'fk::v2::example.com::/';
      assert.equal(ctx.buildStableSignature(f1, fk), ctx.buildStableSignature(f2, fk));
    });

    it('differs by severity', () => {
      const base = { type: 'MISSING_ALT', wcag: '1.1.1', tag: 'img', path: 'body>img' };
      const fk = 'fk::v2::example.com::/';
      const highSig = ctx.buildStableSignature({ ...base, severity: 'high' }, fk);
      const lowSig = ctx.buildStableSignature({ ...base, severity: 'low' }, fk);
      assert.notEqual(highSig, lowSig);
    });

    it('differs by frameKeyStable', () => {
      const finding = { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' };
      const sig1 = ctx.buildStableSignature(finding, 'fk::v2::example.com::/');
      const sig2 = ctx.buildStableSignature(finding, 'fk::v2::other.com::/');
      assert.notEqual(sig1, sig2);
    });

    it('differs by ruleId (type+wcag)', () => {
      const fk = 'fk::v2::example.com::/';
      const sig1 = ctx.buildStableSignature({ type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' }, fk);
      const sig2 = ctx.buildStableSignature({ type: 'EMPTY_HEADING', wcag: '1.3.1', severity: 'high', tag: 'img', path: 'body>img' }, fk);
      assert.notEqual(sig1, sig2);
    });

    it('includes mode in signature', () => {
      const finding = { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' };
      const fk = 'fk::v2::example.com::/';
      const runSig = ctx.buildStableSignature(finding, fk, 'run');
      const observeSig = ctx.buildStableSignature(finding, fk, 'observe');
      assert.notEqual(runSig, observeSig);
    });

    it('contains no timestamp or dynamic content', () => {
      const finding = { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' };
      const sig = ctx.buildStableSignature(finding, 'fk::v2::example.com::/', 'run');
      // Should not contain anything that looks like a timestamp
      assert.ok(!sig.includes('2026'), 'should not contain year');
      assert.ok(!sig.includes('T'), 'should not contain ISO T separator');
    });
  });

  describe('computeStableSignatureSet', () => {
    it('returns empty for null snapshot', () => {
      const result = ctx.computeStableSignatureSet(null, {});
      assert.equal(result.stableFindingSignatureSet.length, 0);
      assert.equal(result.summaryScore, 0);
    });

    it('returns empty for snapshot without best', () => {
      const result = ctx.computeStableSignatureSet({ mode: 'run' }, {});
      assert.equal(result.stableFindingSignatureSet.length, 0);
    });

    it('computes severity counts correctly', () => {
      const snapshot = {
        mode: 'run',
        best: {
          frameKeyStable: 'fk::v2::example.com::/',
          frameId: 0,
          rawRef: 'raw::test',
        },
      };
      const rawAppendix = {
        'raw::test': {
          findings: [
            { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
            { type: 'LOW_CONTRAST', wcag: '1.4.3', severity: 'medium', tag: 'span', path: 'body>span' },
            { type: 'DEPRECATED_ATTR', wcag: '4.1.1', severity: 'low', tag: 'div', path: 'body>div' },
          ],
        },
      };
      const result = ctx.computeStableSignatureSet(snapshot, rawAppendix);
      assert.equal(result.stableFindingSignatureSet.length, 3);
      assert.equal(result.severityCounts.high, 1);
      assert.equal(result.severityCounts.medium, 1);
      assert.equal(result.severityCounts.low, 1);
      assert.equal(result.severityCounts.info, 0);
      assert.equal(result.blockingSet.length, 2); // high + medium
      assert.equal(result.summaryScore, 5 + 3 + 1); // high=5, medium=3, low=1
    });

    it('is deterministic for same input', () => {
      const snapshot = {
        mode: 'run',
        best: {
          frameKeyStable: 'fk::v2::example.com::/',
          rawRef: 'raw::det',
        },
      };
      const raw = {
        'raw::det': {
          findings: [
            { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
          ],
        },
      };
      const a = ctx.computeStableSignatureSet(snapshot, raw);
      const b = ctx.computeStableSignatureSet(snapshot, raw);
      assert.deepEqual(a.stableFindingSignatureSet, b.stableFindingSignatureSet);
      assert.deepEqual(a.severityCounts, b.severityCounts);
      assert.equal(a.summaryScore, b.summaryScore);
    });
  });

  describe('buildStepDiffs with stable signatures', () => {
    it('uses stable path when both steps have stableSignatures', () => {
      const step0 = {
        snapshots: { run: { mode: 'run', best: { frameKey: 'fk1' } } },
        stableSignatures: {
          run: {
            stableFindingSignatureSet: ['sig1', 'sig2'],
            severityCounts: { high: 1, medium: 1, low: 0, info: 0 },
            blockingSet: ['sig1', 'sig2'],
            summaryScore: 8,
          },
        },
      };
      const step1 = {
        snapshots: { run: { mode: 'run', best: { frameKey: 'fk1' } } },
        stableSignatures: {
          run: {
            stableFindingSignatureSet: ['sig1', 'sig3'],
            severityCounts: { high: 1, medium: 0, low: 1, info: 0 },
            blockingSet: ['sig1'],
            summaryScore: 6,
          },
        },
      };
      const diffs = ctx.buildStepDiffs(step1, step0, {});
      assert.equal(diffs.run.added, 1); // sig3
      assert.equal(diffs.run.fixed, 1); // sig2
      assert.equal(diffs.run.persisting, 1); // sig1
    });

    it('falls back to legacy when stableSignatures missing', () => {
      const step0 = {
        snapshots: {
          run: {
            mode: 'run',
            best: { frameKey: 'fk1', rawRef: 'raw::s0' },
          },
        },
        // no stableSignatures
      };
      const step1 = {
        snapshots: {
          run: {
            mode: 'run',
            best: { frameKey: 'fk1', rawRef: 'raw::s1' },
          },
        },
      };
      const raw = {
        'raw::s0': { findings: [{ type: 'A', severity: 'high', tag: 'img', path: 'body>img', wcag: '1.1.1' }] },
        'raw::s1': { findings: [{ type: 'A', severity: 'high', tag: 'img', path: 'body>img', wcag: '1.1.1' }] },
      };
      // Should not throw — falls back to legacy
      const diffs = ctx.buildStepDiffs(step1, step0, raw);
      assert.ok(diffs.run !== undefined);
    });
  });

  describe('STABLE_SIGNATURE_VERSION', () => {
    it('is 1', () => {
      assert.equal(ctx.__STABLE_SIGNATURE_VERSION, 1);
    });
  });
});
