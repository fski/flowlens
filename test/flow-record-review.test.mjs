/**
 * Record-flow review regressions (2026-07-20 audit).
 *
 * 1. Blocking predicate is SINGLE-SOURCE: the stable signature engine must
 *    classify blocking through isRunFindingBlocking (confidence-aware), not a
 *    bare severity check — the bare check made deleteStep's recompute flip the
 *    Flow verdict PASS→FAIL vs capture for medium+heuristic findings.
 * 2. First step is a BASELINE: buildStepDiffs(step, null) must report zero
 *    blocking deltas at the producer, or a one-step flow can never PASS.
 * 3. critical severity participates in blocking/weights (was invisible).
 * 4. Stable consolidated countsDelta merges run+active counts (was run-only).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

function finding(type, severity, confidence, opts = {}) {
  return {
    severity,
    confidence,
    type,
    name: opts.name || type,
    testId: opts.testId || '',
    wcag: opts.wcag || '4.1.2',
    path: opts.path || 'html>body>div>button',
    product: 'axe',
    role: '',
    level: 'AA',
  };
}

function stepSnapshot(findings, mode = 'run') {
  return {
    mode,
    capturedAt: '2026-07-20T10:00:00.000Z',
    best: {
      frameKey: 'fk::v1::https://example.com::/:://',
      frameKeyStable: 'fk::v1::https://example.com::/:://',
      normalized: { raw: { findings } },
    },
    perFrame: [],
  };
}

// A step as it exists post-capture: snapshots + stableSignatures.
function mkStep(ctx, index, findings) {
  const step = {
    id: `step_${index}`,
    index,
    snapshots: { run: stepSnapshot(findings), active: null },
  };
  step.stableSignatures = {
    run: ctx.computeStableSignatureSet(step.snapshots.run, {}),
    active: null,
  };
  return step;
}

describe('blocking predicate is single-source (stable engine)', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('medium+heuristic is non-blocking in BOTH engines', () => {
    const f = finding('MISSING_LABEL', 'medium', 'heuristic');
    assert.equal(ctx.isRunFindingBlocking(f), false);
    const stable = ctx.computeStableSignatureSet(stepSnapshot([f]), {});
    assert.equal(stable.blockingSet.length, 0, 'stable engine must agree with isRunFindingBlocking');
    assert.equal(stable.severityCounts.medium, 1);
  });

  it('medium+strict and high+heuristic are blocking in both engines', () => {
    for (const f of [finding('A', 'medium', 'strict'), finding('B', 'high', 'heuristic')]) {
      assert.equal(ctx.isRunFindingBlocking(f), true);
      assert.equal(ctx.computeStableSignatureSet(stepSnapshot([f]), {}).blockingSet.length, 1);
    }
  });

  it('deleteStep-style recompute matches capture: no verdict flip on unrelated delete', () => {
    // step2 introduces a medium+heuristic finding that persists into step3.
    const s1 = mkStep(ctx, 1, []);
    const s2 = mkStep(ctx, 2, [finding('MISSING_LABEL', 'medium', 'heuristic')]);
    const s3 = mkStep(ctx, 3, [finding('MISSING_LABEL', 'medium', 'heuristic')]);
    // Capture-order diffs (stable branch for s2/s3 since prev has stableSignatures).
    s1.diffs = ctx.buildStepDiffs(s1, null, {});
    s2.diffs = ctx.buildStepDiffs(s2, s1, {});
    s3.diffs = ctx.buildStepDiffs(s3, s2, {});
    const total = [s1, s2, s3].reduce((n, s) => n + s.diffs.consolidated.blockingAdded, 0);
    assert.equal(total, 0, 'PASS at capture');
    // Delete the last step → recompute survivors exactly like deleteStep does.
    const steps = [s1, s2];
    for (let i = 0; i < steps.length; i++) {
      steps[i].index = i + 1;
      steps[i].diffs = ctx.buildStepDiffs(steps[i], i > 0 ? steps[i - 1] : null, {});
    }
    const totalAfter = steps.reduce((n, s) => n + s.diffs.consolidated.blockingAdded, 0);
    assert.equal(totalAfter, 0, 'verdict must not flip after an unrelated delete');
  });
});

describe('first step is a baseline (blockingAdded=0 at the producer)', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('one-step flow with a high+strict blocker yields zero blocking deltas', () => {
    const s1 = mkStep(ctx, 1, [finding('BROKEN_NAME', 'high', 'strict')]);
    const diffs = ctx.buildStepDiffs(s1, null, {});
    assert.equal(diffs.consolidated.blockingAdded, 0);
    assert.equal(diffs.consolidated.blockingFixed, 0);
    assert.equal(diffs.run.blockingAdded, 0);
    assert.match(diffs.consolidated.text, /blocking \+0\/-0/);
  });

  it('second step still reports regressions normally', () => {
    const s1 = mkStep(ctx, 1, []);
    const s2 = mkStep(ctx, 2, [finding('BROKEN_NAME', 'high', 'strict')]);
    s1.diffs = ctx.buildStepDiffs(s1, null, {});
    const diffs = ctx.buildStepDiffs(s2, s1, {});
    assert.equal(diffs.consolidated.blockingAdded, 1);
  });
});

describe('critical severity participates', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('critical is blocking, counted, weighted and scored', () => {
    const f = finding('CRITICAL_THING', 'critical', 'heuristic');
    assert.equal(ctx.isRunFindingBlocking(f), true);
    const stable = ctx.computeStableSignatureSet(stepSnapshot([f]), {});
    assert.equal(stable.blockingSet.length, 1);
    assert.equal(stable.severityCounts.critical, 1);
    assert.ok(stable.summaryScore > 0, 'SEV_SCORE must cover critical');
    assert.ok(ctx.severityWeight('critical') > ctx.severityWeight('high'));
  });

  it('critical+advisory stays non-blocking (advisory always demotes)', () => {
    assert.equal(ctx.isRunFindingBlocking(finding('X', 'critical', 'advisory')), false);
  });
});

describe('session storage keys derive from the session, not the live URL', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('persist writes under the session origin during a cross-origin hop', async () => {
    ctx.document._elCache['inspectedUrl'].dataset.full = 'https://checkout.foreign.com/pay';
    const session = { id: 'sess_x', inspectedOrigin: 'https://app.example.com', env: 'prod', steps: [] };
    await ctx.persistActiveSessionBestEffort(session);
    const own = await ctx.storageGet(['session::active::https://app.example.com::prod']);
    const foreign = await ctx.storageGet(['session::active::https://checkout.foreign.com::prod']);
    assert.ok(own['session::active::https://app.example.com::prod'], 'written under session origin');
    assert.equal(foreign['session::active::https://checkout.foreign.com::prod'], undefined, 'no foreign-origin copy');
  });

  it('archive clears the session-origin active key, not the current-origin one', async () => {
    ctx.document._elCache['inspectedUrl'].dataset.full = 'https://checkout.foreign.com/pay';
    const session = { id: 'sess_y', inspectedOrigin: 'https://app.example.com', env: 'prod', steps: [] };
    await ctx.persistActiveSessionBestEffort(session);
    const ok = await ctx.archiveSessionBestEffort(session);
    assert.equal(ok, true);
    const active = await ctx.storageGet(['session::active::https://app.example.com::prod']);
    assert.ok(!active['session::active::https://app.example.com::prod'], 'own active key cleared');
    const archived = await ctx.storageGet(['session::archive::https://app.example.com::prod::sess_y']);
    assert.ok(archived['session::archive::https://app.example.com::prod::sess_y'], 'archived under session scope');
  });

  it('normalizeLoadedSession derives env for pre-env sessions', () => {
    const out = ctx.normalizeLoadedSession({ id: 's', schemaVersion: 4, inspectedOrigin: 'https://app.example.com', steps: [] });
    assert.ok(typeof out.env === 'string' && out.env.length > 0);
  });
});

describe('concurrent End is not a storage failure', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('second archive of the same session returns the in-flight sentinel', async () => {
    const session = { id: 'sess_dbl', inspectedOrigin: 'https://app.example.com', env: 'prod', steps: [] };
    const [first, second] = await Promise.all([
      ctx.archiveSessionBestEffort(session),
      ctx.archiveSessionBestEffort(session),
    ]);
    assert.equal(first, true);
    assert.equal(second, 'in-flight');
  });
});

describe('deleteStep hygiene', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  function seedSession() {
    const s1 = mkStep(ctx, 1, []);
    const s2 = mkStep(ctx, 2, []);
    const s3 = mkStep(ctx, 3, []);
    ctx.sessionState.current = {
      id: 'sess_del', inspectedOrigin: 'https://app.example.com', env: 'prod',
      rawAppendix: {}, steps: [s1, s2, s3], frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    };
    return [s1, s2, s3];
  }

  it('remaps a later selection down after deleting an earlier step', async () => {
    seedSession();
    ctx.sessionState.selectedStepIndex = 3;
    await ctx.deleteStep(1);
    assert.equal(ctx.sessionState.selectedStepIndex, 2, 'same step, renumbered');
  });

  it('falls back to the latest step when the selected step is deleted', async () => {
    seedSession();
    ctx.sessionState.selectedStepIndex = 2;
    await ctx.deleteStep(2);
    // deleteStep nulls the selection; renderFlow materializes the default
    // (latest step) back into sessionState — steps [1,2] remain.
    assert.equal(ctx.sessionState.selectedStepIndex, 2);
  });

  it('drops the deleted step\'s screenshot from the media store', async () => {
    const [s1] = seedSession();
    const deleted = [];
    ctx.flowMediaStore.deleteShot = (sid, stepId) => { deleted.push(`${sid}::${stepId}`); return Promise.resolve({ ok: true }); };
    await ctx.deleteStep(1);
    assert.deepEqual(deleted.join(','), `sess_del::${s1.id}`);
  });
});

describe('media pipeline honesty', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  function armShot() {
    ctx.send = async () => ({ ok: true, dataUrl: 'data:image/png;base64,AA==' });
    ctx.fetch = async () => ({ blob: async () => ({ size: 2 }) });
    const puts = [];
    ctx.flowMediaStore.putShot = async (sid, stepId) => { puts.push(`${sid}::${stepId}`); return { ok: true }; };
    return puts;
  }

  it('captureStepShot stores the shot while its session is still current', async () => {
    const puts = armShot();
    ctx.sessionState.current = { id: 'sess_live' };
    const step = { id: 'step_1' };
    const landed = await ctx.captureStepShot('sess_live', step, { url: 'https://x.com/a' }, 0);
    assert.equal(landed, true);
    assert.equal(step.hasShot, true);
    assert.deepEqual(puts.join(','), 'sess_live::step_1');
  });

  it('captureStepShot discards a shot that resolves after End (no orphaned blob)', async () => {
    const puts = armShot();
    ctx.sessionState.current = null; // session ended while shot was in flight
    const step = { id: 'step_1' };
    const landed = await ctx.captureStepShot('sess_gone', step, { url: 'https://x.com/a' }, 0);
    assert.equal(landed, false);
    assert.equal(puts.length, 0, 'must not write an orphaned blob');
    assert.ok(!step.hasShot);
  });

  it('handleRecorderAutoStop persists only a SAVED recording', async () => {
    ctx.sessionState.current = { id: 'sess_v', inspectedOrigin: 'https://app.example.com', env: 'prod', steps: [] };
    ctx.flowRecorder = { stop: async () => ({ ok: true, saved: true }) };
    await ctx.handleRecorderAutoStop();
    const stored = await ctx.storageGet(['session::active::https://app.example.com::prod']);
    assert.ok(stored['session::active::https://app.example.com::prod'], 'saved recording → session persisted');
  });

  it('handleRecorderAutoStop does not persist when the store write failed', async () => {
    ctx.sessionState.current = { id: 'sess_v', inspectedOrigin: 'https://app.example.com', env: 'prod', steps: [] };
    ctx.flowRecorder = { stop: async () => ({ ok: true, saved: false }) };
    await ctx.handleRecorderAutoStop();
    const stored = await ctx.storageGet(['session::active::https://app.example.com::prod']);
    assert.ok(!stored['session::active::https://app.example.com::prod'], 'failed save → nothing persisted');
  });
});

describe('stable consolidated countsDelta merges run+active', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('active-mode severity shifts appear in consolidated.countsDelta', () => {
    const mkContrast = (n) => ({
      mode: 'contrast',
      capturedAt: '2026-07-20T10:00:00.000Z',
      best: {
        frameKey: 'fk::v1::https://example.com::/:://',
        frameKeyStable: 'fk::v1::https://example.com::/:://',
        normalized: { raw: { failures: Array.from({ length: n }, (_, i) => ({ path: `p${i}`, fg: '#111', bg: '#222' })) } },
      },
      perFrame: [],
    });
    const mk = (index, contrastN) => {
      const step = {
        id: `step_${index}`,
        index,
        snapshots: { run: stepSnapshot([]), active: mkContrast(contrastN) },
      };
      step.stableSignatures = {
        run: ctx.computeStableSignatureSet(step.snapshots.run, {}),
        active: ctx.computeStableSignatureSet(step.snapshots.active, {}),
      };
      return step;
    };
    const s1 = mk(1, 0);
    const s2 = mk(2, 2); // two new contrast failures (counted as high in stable engine)
    const diffs = ctx.buildStepDiffs(s2, s1, {});
    assert.equal(diffs.consolidated.countsDelta.high, 2, 'contrast failures must reach consolidated delta');
  });
});
