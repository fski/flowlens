/**
 * Compacting invariants — Phase 4 of v4.0.
 * Ensures:
 *   diff(session) === diff(compact(session))
 *   compact(compact(session)) === compact(session)
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

function makeStep(index, findings, frameKeyStable = 'fk::v2::example.com::/', mode = 'run') {
  const sigs = [];
  const counts = { high: 0, medium: 0, low: 0, info: 0 };
  const blocking = [];
  let score = 0;
  for (const f of findings) {
    const sev = f.severity || 'info';
    if (sev in counts) counts[sev]++;
    const w = ({ high: 5, medium: 3, low: 1, info: 0 })[sev] || 0;
    score += w;
    // Build a pseudo-stable sig for testing
    const sig = `${mode}|${f.type || 'unknown'}|${f.wcag || 'unknown'}|${sev}|${index}_${sigs.length}`;
    sigs.push(sig);
    if (sev === 'high' || sev === 'medium') blocking.push(sig);
  }
  return {
    index,
    capturedAt: '2026-02-25T10:00:00Z',
    scope: { type: 'document', rootSelector: null, rootTestId: null },
    snapshots: {
      run: {
        mode: 'run',
        best: {
          frameKey: `${frameKeyStable}::abc123`,
          frameKeyStable,
          frameId: 0,
          result: { findings },
          rawRef: `raw::s${index}::run::${frameKeyStable}`,
          raw: { findings },
        },
      },
    },
    stableSignatures: {
      run: {
        stableFindingSignatureSet: sigs,
        severityCounts: counts,
        blockingSet: blocking,
        summaryScore: score,
      },
      active: null,
    },
  };
}

describe('Compacting invariants', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext();
  });

  it('diff(session) === diff(compact(session))', () => {
    const step0 = makeStep(0, [
      { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
      { type: 'LOW_CONTRAST', wcag: '1.4.3', severity: 'medium', tag: 'span', path: 'body>span' },
    ]);
    const step1 = makeStep(1, [
      { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
      { type: 'MISSING_LABEL', wcag: '1.3.1', severity: 'high', tag: 'input', path: 'body>input' },
    ]);

    const session = {
      id: 'sess_compact_test',
      schemaVersion: 4,
      signatureVersion: 2,
      stableSignatureVersion: 1,
      frameKeyVersion: 1,
      startedAt: '2026-02-25T10:00:00Z',
      endedAt: null,
      inspectedOrigin: 'https://example.com',
      envTag: 'prod',
      steps: [step0, step1],
      rawAppendix: {
        [`raw::s0::run::fk::v2::example.com::/`]: { findings: step0.snapshots.run.best.result.findings },
        [`raw::s1::run::fk::v2::example.com::/`]: { findings: step1.snapshots.run.best.result.findings },
      },
      frames: { frameKeys: ['fk::v2::example.com::/::abc123'], frameKeyToLastFrameId: {} },
      settings: {},
    };

    const diffOriginal = ctx.buildStepDiffs(step1, step0, session.rawAppendix);
    const compacted = ctx.compactSessionForExport(session);
    const diffCompacted = ctx.buildStepDiffs(
      compacted.steps[1],
      compacted.steps[0],
      compacted.rawAppendix,
    );

    // Stable diff path: both have stableSignatures
    assert.equal(diffOriginal.run.added, diffCompacted.run.added, 'run.added should match');
    assert.equal(diffOriginal.run.fixed, diffCompacted.run.fixed, 'run.fixed should match');
    assert.equal(diffOriginal.run.persisting, diffCompacted.run.persisting, 'run.persisting should match');
    assert.equal(diffOriginal.run.blockingAdded, diffCompacted.run.blockingAdded, 'run.blockingAdded should match');
    assert.equal(diffOriginal.run.blockingFixed, diffCompacted.run.blockingFixed, 'run.blockingFixed should match');
  });

  it('compact(compact(session)) === compact(session) — idempotent', () => {
    const step0 = makeStep(0, [
      { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
    ]);
    const session = {
      id: 'sess_idempotent',
      schemaVersion: 4,
      signatureVersion: 2,
      stableSignatureVersion: 1,
      frameKeyVersion: 1,
      startedAt: '2026-02-25T10:00:00Z',
      endedAt: null,
      inspectedOrigin: 'https://example.com',
      envTag: 'prod',
      steps: [step0],
      rawAppendix: {
        [`raw::s0::run::fk::v2::example.com::/`]: { findings: step0.snapshots.run.best.result.findings },
      },
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
      settings: {},
    };

    const once = ctx.compactSessionForExport(session);
    const twice = ctx.compactSessionForExport(once);

    // Core fields
    assert.equal(once.schemaVersion, twice.schemaVersion);
    assert.equal(once.stableSignatureVersion, twice.stableSignatureVersion);

    // Stable signatures preserved through double compact
    assert.deepEqual(
      once.steps[0].stableSignatures.run.stableFindingSignatureSet,
      twice.steps[0].stableSignatures.run.stableFindingSignatureSet,
    );
    assert.deepEqual(
      once.steps[0].stableSignatures.run.blockingSet,
      twice.steps[0].stableSignatures.run.blockingSet,
    );
    assert.deepEqual(
      once.steps[0].stableSignatures.run.severityCounts,
      twice.steps[0].stableSignatures.run.severityCounts,
    );
    assert.equal(
      once.steps[0].stableSignatures.run.summaryScore,
      twice.steps[0].stableSignatures.run.summaryScore,
    );
  });

  it('diff is identical after double compact', () => {
    const step0 = makeStep(0, [
      { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
    ]);
    const step1 = makeStep(1, [
      { type: 'MISSING_ALT', wcag: '1.1.1', severity: 'high', tag: 'img', path: 'body>img' },
      { type: 'EMPTY_HEADING', wcag: '1.3.1', severity: 'medium', tag: 'h1', path: 'body>h1' },
    ]);
    const session = {
      id: 'sess_double_compact',
      schemaVersion: 4,
      signatureVersion: 2,
      stableSignatureVersion: 1,
      frameKeyVersion: 1,
      startedAt: '2026-02-25T10:00:00Z',
      endedAt: null,
      inspectedOrigin: 'https://example.com',
      envTag: 'prod',
      steps: [step0, step1],
      rawAppendix: {},
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
      settings: {},
    };

    const once = ctx.compactSessionForExport(session);
    const twice = ctx.compactSessionForExport(once);

    const diffOnce = ctx.buildStepDiffs(once.steps[1], once.steps[0], once.rawAppendix);
    const diffTwice = ctx.buildStepDiffs(twice.steps[1], twice.steps[0], twice.rawAppendix);

    assert.equal(diffOnce.run.added, diffTwice.run.added);
    assert.equal(diffOnce.run.fixed, diffTwice.run.fixed);
    assert.equal(diffOnce.run.persisting, diffTwice.run.persisting);
    assert.equal(diffOnce.consolidated.added, diffTwice.consolidated.added);
  });

  it('compact preserves stableSignatures.active when present', () => {
    const step = makeStep(0, [
      { type: 'ARIA_HIDDEN_FOCUSABLE', wcag: '4.1.2', severity: 'high', tag: 'button' },
    ]);
    step.stableSignatures.active = {
      stableFindingSignatureSet: ['active|sig1'],
      severityCounts: { high: 1, medium: 0, low: 0, info: 0 },
      blockingSet: ['active|sig1'],
      summaryScore: 5,
    };

    const session = {
      id: 'sess_active_compact',
      schemaVersion: 4,
      signatureVersion: 2,
      stableSignatureVersion: 1,
      frameKeyVersion: 1,
      startedAt: '2026-02-25T10:00:00Z',
      endedAt: null,
      inspectedOrigin: 'https://example.com',
      envTag: 'prod',
      steps: [step],
      rawAppendix: {},
      frames: { frameKeys: [], frameKeyToLastFrameId: {} },
      settings: {},
    };

    const compacted = ctx.compactSessionForExport(session);
    assert.deepEqual(
      compacted.steps[0].stableSignatures.active.stableFindingSignatureSet,
      ['active|sig1'],
    );
    assert.equal(compacted.steps[0].stableSignatures.active.summaryScore, 5);
  });
});
