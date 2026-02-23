/**
 * Diff calculation tests — buildStepDiffs, runSignatureEntries, signature generation
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Diff calculation', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext();
  });

  // Helper: build a minimal finding
  function finding(type, name, severity = 'medium', opts = {}) {
    return {
      severity,
      confidence: opts.confidence || 'strict',
      type,
      name,
      testId: opts.testId || '',
      wcag: opts.wcag || '4.1.2',
      path: opts.path || 'html>body>div>button',
      note: opts.note || '',
      product: opts.product || 'axe',
      role: opts.role || '',
      level: opts.level || 'AA',
    };
  }

  // Helper: build a step snapshot with inline raw data
  function stepSnapshot(findings) {
    return {
      mode: 'run',
      capturedAt: new Date().toISOString(),
      best: {
        frameKey: 'fk::v1::https://example.com::/:://',
        normalized: {
          raw: { findings },
        },
      },
      perFrame: [],
    };
  }

  describe('Pure utility functions', () => {
    it('escapeHtml escapes special characters', () => {
      assert.equal(ctx.escapeHtml('<script>alert("xss")</script>'),
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('escapeHtml handles non-string input', () => {
      assert.equal(ctx.escapeHtml(null), 'null');
      assert.equal(ctx.escapeHtml(undefined), 'undefined');
      assert.equal(ctx.escapeHtml(42), '42');
    });

    it('fnv1aHash8 is deterministic', () => {
      const h1 = ctx.fnv1aHash8('hello world');
      const h2 = ctx.fnv1aHash8('hello world');
      assert.equal(h1, h2);
      assert.equal(h1.length, 8, 'should be 8 hex chars');
    });

    it('fnv1aHash8 produces different hashes for different inputs', () => {
      assert.notEqual(ctx.fnv1aHash8('abc'), ctx.fnv1aHash8('xyz'));
    });

    it('hashFinding produces stable signatures', () => {
      const f = finding('aria-label', 'Missing label', 'high');
      const h1 = ctx.hashFinding(f);
      const h2 = ctx.hashFinding(f);
      assert.equal(h1, h2);
    });

    it('hashFinding differs for different findings', () => {
      const f1 = finding('aria-label', 'Missing label', 'high');
      const f2 = finding('color-contrast', 'Low contrast', 'medium');
      assert.notEqual(ctx.hashFinding(f1), ctx.hashFinding(f2));
    });

    it('originFrom extracts origin from URL', () => {
      assert.equal(ctx.originFrom('https://example.com/path'), 'https://example.com');
      assert.equal(ctx.originFrom('http://localhost:3000/foo'), 'http://localhost:3000');
    });

    it('originFrom returns empty string for invalid URL', () => {
      assert.equal(ctx.originFrom('not-a-url'), '');
      assert.equal(ctx.originFrom(''), '');
    });

    it('detectEnv identifies environments', () => {
      assert.equal(ctx.detectEnv('https://staging.example.com'), 'staging');
      assert.equal(ctx.detectEnv('http://localhost:3000'), 'local');
      assert.equal(ctx.detectEnv('http://127.0.0.1:8080'), 'local');
      assert.equal(ctx.detectEnv('https://www.example.com'), 'prod');
    });

    it('asNumber returns finite number or fallback', () => {
      assert.equal(ctx.asNumber(42), 42);
      assert.equal(ctx.asNumber('3.14'), 3.14);
      assert.equal(ctx.asNumber(NaN, 5), 5);
      assert.equal(ctx.asNumber(null, 0), 0);
      assert.equal(ctx.asNumber(Infinity, -1), -1);
    });

    it('formatElapsedHms formats duration', () => {
      const start = '2024-01-01T00:00:00.000Z';
      const end = '2024-01-01T00:02:30.000Z';
      const result = ctx.formatElapsedHms(start, end);
      assert.equal(result, '2:30');
    });
  });

  describe('isRunFindingBlocking()', () => {
    it('marks high severity as blocking', () => {
      assert.equal(ctx.isRunFindingBlocking(finding('test', 'test', 'high')), true);
    });

    it('marks medium+strict as blocking', () => {
      assert.equal(ctx.isRunFindingBlocking(finding('test', 'test', 'medium', { confidence: 'strict' })), true);
    });

    it('does not mark medium+heuristic as blocking', () => {
      assert.equal(ctx.isRunFindingBlocking(finding('test', 'test', 'medium', { confidence: 'heuristic' })), false);
    });

    it('does not mark low severity as blocking', () => {
      assert.equal(ctx.isRunFindingBlocking(finding('test', 'test', 'low')), false);
    });

    it('does not mark advisory confidence as blocking regardless of severity', () => {
      assert.equal(ctx.isRunFindingBlocking(finding('test', 'test', 'high', { confidence: 'advisory' })), false);
    });
  });

  describe('runSignatureEntries()', () => {
    it('returns empty array for null snapshot', () => {
      const entries = ctx.runSignatureEntries(null);
      assert.ok(Array.isArray(entries));
      assert.equal(entries.length, 0);
    });

    it('generates entries for findings', () => {
      const snap = stepSnapshot([
        finding('aria-label', 'Missing label', 'high'),
        finding('color-contrast', 'Low contrast', 'medium'),
      ]);
      const entries = ctx.runSignatureEntries(snap);
      assert.equal(entries.length, 2);
      assert.ok(entries[0].sig, 'should have sig');
      assert.ok(typeof entries[0].blocking === 'boolean');
    });

    it('produces deterministic signatures', () => {
      const snap = stepSnapshot([finding('aria-label', 'Missing label', 'high')]);
      const e1 = ctx.runSignatureEntries(snap);
      const e2 = ctx.runSignatureEntries(snap);
      assert.equal(e1[0].sig, e2[0].sig);
    });

    it('produces different sigs for different findings', () => {
      const snap1 = stepSnapshot([finding('aria-label', 'Missing label', 'high')]);
      const snap2 = stepSnapshot([finding('color-contrast', 'Low contrast', 'medium')]);
      const e1 = ctx.runSignatureEntries(snap1);
      const e2 = ctx.runSignatureEntries(snap2);
      assert.notEqual(e1[0].sig, e2[0].sig);
    });
  });

  describe('buildStepDiffs()', () => {
    it('returns zero diffs for first step (no previous)', () => {
      const step = {
        index: 1,
        snapshots: { run: stepSnapshot([finding('a', 'b', 'high')]), active: null },
      };
      const diffs = ctx.buildStepDiffs(step, null, {});
      assert.ok(diffs.consolidated);
      // First step: everything is "added", nothing fixed or persisting
      assert.ok(diffs.consolidated.added >= 0);
      assert.equal(diffs.consolidated.fixed, 0);
      assert.equal(diffs.consolidated.persisting, 0);
    });

    it('detects added findings in step 2', () => {
      const f1 = finding('aria-label', 'Missing label', 'high');
      const f2 = finding('color-contrast', 'Low contrast', 'medium');
      const step1 = { index: 1, snapshots: { run: stepSnapshot([f1]), active: null } };
      const step2 = { index: 2, snapshots: { run: stepSnapshot([f1, f2]), active: null } };
      const diffs = ctx.buildStepDiffs(step2, step1, {});
      assert.ok(diffs.consolidated.added >= 1, `expected added >= 1, got ${diffs.consolidated.added}`);
    });

    it('detects fixed findings in step 2', () => {
      const f1 = finding('aria-label', 'Missing label', 'high');
      const f2 = finding('color-contrast', 'Low contrast', 'medium');
      const step1 = { index: 1, snapshots: { run: stepSnapshot([f1, f2]), active: null } };
      const step2 = { index: 2, snapshots: { run: stepSnapshot([f1]), active: null } };
      const diffs = ctx.buildStepDiffs(step2, step1, {});
      assert.ok(diffs.consolidated.fixed >= 1, `expected fixed >= 1, got ${diffs.consolidated.fixed}`);
    });

    it('detects persisting findings across steps', () => {
      const f1 = finding('aria-label', 'Missing label', 'high');
      const step1 = { index: 1, snapshots: { run: stepSnapshot([f1]), active: null } };
      const step2 = { index: 2, snapshots: { run: stepSnapshot([f1]), active: null } };
      const diffs = ctx.buildStepDiffs(step2, step1, {});
      assert.ok(diffs.consolidated.persisting >= 1, `expected persisting >= 1, got ${diffs.consolidated.persisting}`);
    });

    it('handles empty steps gracefully', () => {
      const step = { index: 1, snapshots: { run: null, active: null } };
      const diffs = ctx.buildStepDiffs(step, null, {});
      assert.ok(diffs.consolidated);
      assert.equal(diffs.consolidated.added, 0);
      assert.equal(diffs.consolidated.fixed, 0);
    });

    it('tracks blocking findings separately', () => {
      const blocking = finding('aria-label', 'Critical issue', 'high', { confidence: 'strict' });
      const nonBlocking = finding('heading-order', 'Minor issue', 'low', { confidence: 'heuristic' });
      const step1 = { index: 1, snapshots: { run: stepSnapshot([]), active: null } };
      const step2 = { index: 2, snapshots: { run: stepSnapshot([blocking, nonBlocking]), active: null } };
      const diffs = ctx.buildStepDiffs(step2, step1, {});
      assert.ok(diffs.consolidated.blockingAdded >= 1, 'should have blocking added');
    });
  });

  describe('normalizeLoadedSession()', () => {
    it('returns null for null input', () => {
      assert.equal(ctx.normalizeLoadedSession(null), null);
    });

    it('returns null for non-object input', () => {
      assert.equal(ctx.normalizeLoadedSession('string'), null);
    });

    it('normalizes version fields', () => {
      const sess = ctx.normalizeLoadedSession({
        id: 'test',
        schemaVersion: '2',
        signatureVersion: undefined,
      });
      assert.equal(sess.schemaVersion, 3); // migrated to current
      assert.equal(sess.signatureVersion, 1); // default (input had none)
      assert.equal(sess.frameKeyVersion, 1); // default
    });

    it('ensures steps is an array', () => {
      const sess = ctx.normalizeLoadedSession({ id: 'test', steps: null });
      assert.ok(Array.isArray(sess.steps));
      assert.equal(sess.steps.length, 0);
    });

    it('ensures rawAppendix is an object', () => {
      const sess = ctx.normalizeLoadedSession({ id: 'test' });
      assert.ok(sess.rawAppendix);
      assert.equal(typeof sess.rawAppendix, 'object');
    });

    it('ensures frames structure exists', () => {
      const sess = ctx.normalizeLoadedSession({ id: 'test' });
      assert.ok(sess.frames);
      assert.ok(Array.isArray(sess.frames.frameKeys));
    });
  });
});
