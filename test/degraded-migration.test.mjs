/**
 * Degraded migration tests — verifies v3→v4 migration handles:
 * - Full-quality migration (raw available)
 * - Inline findings fallback
 * - Degraded signatures (raw_capped, no raw)
 * - Never mutates original session
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Degraded migration (v3 → v4)', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext();
  });

  it('full-quality migration when raw available', () => {
    const session = {
      id: 'sess_full_raw',
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      steps: [{
        index: 0,
        scope: { type: 'document', rootSelector: null },
        snapshots: {
          run: {
            mode: 'run',
            best: {
              frameKeyStable: 'fk::v2::example.com::/',
              frameId: 0,
              rawRef: 'raw::s0::run::fk::v2::example.com::/',
            },
          },
        },
      }],
      rawAppendix: {
        'raw::s0::run::fk::v2::example.com::/': {
          findings: [
            { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
            { type: 'EMPTY_HEADING', wcag: '1.3.1', severity: 'medium', tag: 'h1', path: 'body>h1' },
          ],
        },
      },
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };

    const migrated = ctx.normalizeLoadedSession(session);
    assert.equal(migrated.schemaVersion, 4);
    assert.equal(migrated._migrated, true);
    assert.ok(migrated.steps[0].stableSignatures, 'step should have stableSignatures');
    assert.ok(migrated.steps[0].stableSignatures.run, 'should have run signatures');
    assert.equal(migrated.steps[0].stableSignatures.run.stableFindingSignatureSet.length, 2);
    assert.equal(migrated.steps[0].stableSignatures.run.severityCounts.high, 1);
    assert.equal(migrated.steps[0].stableSignatures.run.severityCounts.medium, 1);
    assert.equal(migrated.steps[0].stableSignatures.run.blockingSet.length, 2);
    // Not degraded when raw available
    assert.equal(migrated.steps[0].stableSignatures.run.stepQuality?.degraded, false);
  });

  it('inline findings fallback when rawAppendix missing', () => {
    const session = {
      id: 'sess_inline',
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      steps: [{
        index: 0,
        scope: { type: 'document', rootSelector: null },
        snapshots: {
          run: {
            mode: 'run',
            best: {
              frameKeyStable: 'fk::v2::example.com::/',
              frameId: 0,
              result: {
                findings: [
                  { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
                ],
              },
            },
          },
        },
      }],
      rawAppendix: {}, // empty — raw capped
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };

    const migrated = ctx.normalizeLoadedSession(session);
    assert.equal(migrated.schemaVersion, 4);
    const sigs = migrated.steps[0].stableSignatures.run;
    assert.equal(sigs.stableFindingSignatureSet.length, 1);
    assert.equal(sigs.severityCounts.high, 1);
    assert.equal(sigs.stepQuality.degraded, false); // inline findings = not degraded
  });

  it('degraded signatures when no raw and no inline findings', () => {
    const session = {
      id: 'sess_degraded',
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      steps: [{
        index: 0,
        scope: { type: 'document', rootSelector: null },
        snapshots: {
          run: {
            mode: 'run',
            best: {
              frameKeyStable: 'fk::v2::example.com::/',
              frameId: 0,
              normalized: {
                primaryCounts: { findings: 3, high: 2, medium: 1, low: 0, info: 0 },
              },
            },
          },
        },
      }],
      rawAppendix: {},
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };

    const migrated = ctx.normalizeLoadedSession(session);
    const sigs = migrated.steps[0].stableSignatures.run;

    // Should have 3 degraded signatures (2 high + 1 medium)
    assert.equal(sigs.stableFindingSignatureSet.length, 3);
    assert.equal(sigs.severityCounts.high, 2);
    assert.equal(sigs.severityCounts.medium, 1);
    assert.equal(sigs.blockingSet.length, 3); // all high+medium are blocking
    assert.equal(sigs.stepQuality.degraded, true);
    assert.equal(sigs.stepQuality.signatureQualityCounts.degraded, 3);

    // Degraded signatures have special format
    for (const sig of sigs.stableFindingSignatureSet) {
      assert.ok(sig.includes('degraded'), `degraded sig should contain "degraded": ${sig}`);
    }
  });

  it('empty step produces empty stable signatures', () => {
    const session = {
      id: 'sess_empty_step',
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      steps: [{
        index: 0,
        scope: { type: 'document', rootSelector: null },
        snapshots: { run: null },
      }],
      rawAppendix: {},
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };

    const migrated = ctx.normalizeLoadedSession(session);
    const sigs = migrated.steps[0].stableSignatures.run;
    assert.equal(sigs.stableFindingSignatureSet.length, 0);
    assert.equal(sigs.summaryScore, 0);
    assert.equal(sigs.stepQuality.degraded, false);
  });

  it('migration returns a new object (shallow copy)', () => {
    const session = {
      id: 'sess_copy',
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      steps: [{
        index: 0,
        scope: { type: 'document', rootSelector: null },
        snapshots: { run: null },
      }],
      rawAppendix: {},
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };
    const result = ctx.normalizeLoadedSession(session);
    assert.notEqual(result, session, 'result should be a new object');
    assert.equal(result.schemaVersion, 4);
    // Original top-level schemaVersion is preserved (shallow copy)
    assert.equal(session.schemaVersion, 3);
  });

  it('skips steps that already have stableSignatures', () => {
    const session = {
      id: 'sess_skip_existing',
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      steps: [{
        index: 0,
        scope: { type: 'document', rootSelector: null },
        snapshots: { run: null },
        stableSignatures: {
          run: {
            stableFindingSignatureSet: ['preexisting_sig'],
            severityCounts: { high: 1, medium: 0, low: 0, info: 0 },
            blockingSet: ['preexisting_sig'],
            summaryScore: 5,
          },
          active: null,
        },
      }],
      rawAppendix: {},
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };

    const migrated = ctx.normalizeLoadedSession(session);
    assert.deepEqual(
      migrated.steps[0].stableSignatures.run.stableFindingSignatureSet,
      ['preexisting_sig'],
      'should preserve existing signatures',
    );
  });

  it('stableSignatureVersion set on migrated session', () => {
    const session = {
      id: 'sess_version',
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      steps: [],
      rawAppendix: {},
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };
    const migrated = ctx.normalizeLoadedSession(session);
    assert.equal(migrated.stableSignatureVersion, 1);
  });

  it('active snapshot also migrated when present', () => {
    const session = {
      id: 'sess_active',
      schemaVersion: 3,
      signatureVersion: 2,
      frameKeyVersion: 1,
      steps: [{
        index: 0,
        scope: { type: 'document', rootSelector: null },
        snapshots: {
          run: {
            mode: 'run',
            best: {
              frameKeyStable: 'fk::v2::example.com::/',
              frameId: 0,
              result: {
                findings: [{ type: 'A', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' }],
              },
            },
          },
          active: {
            mode: 'run',
            best: {
              frameKeyStable: 'fk::v2::example.com::/',
              frameId: 0,
              result: {
                findings: [{ type: 'B', wcag: '1.3.1', severity: 'low', tag: 'h1', path: 'body>h1' }],
              },
            },
          },
        },
      }],
      rawAppendix: {},
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };

    const migrated = ctx.normalizeLoadedSession(session);
    assert.ok(migrated.steps[0].stableSignatures.active, 'should have active signatures');
    assert.equal(migrated.steps[0].stableSignatures.active.stableFindingSignatureSet.length, 1);
    assert.equal(migrated.steps[0].stableSignatures.active.severityCounts.low, 1);
  });
});
