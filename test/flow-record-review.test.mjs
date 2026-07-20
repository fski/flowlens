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

describe('auto-capture skips third-party SITES (privacy decision 2026-07-20)', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('cross-site is foreign; same-site subdomain hops are NOT', () => {
    const session = { inspectedOrigin: 'https://www.foodora.se' };
    assert.equal(ctx.isForeignAutoCaptureOrigin('https://accounts.google.com/signin', session), true);
    // Subdomain hops are the same product flow — full-origin comparison
    // silently killed auto-capture on ordinary sessions (Piotr, 20.07).
    assert.equal(ctx.isForeignAutoCaptureOrigin('https://login.foodora.se/auth', session), false);
    assert.equal(ctx.isForeignAutoCaptureOrigin('https://foodora.se/x', session), false);
  });

  it('registrableDomain handles shared SLDs and bare hosts', () => {
    assert.equal(ctx.registrableDomain('https://shop.example.co.uk/x'), 'example.co.uk');
    assert.equal(ctx.registrableDomain('https://a.b.example.com/x'), 'example.com');
    assert.equal(ctx.registrableDomain('https://example.com'), 'example.com');
  });

  it('IP literals compare whole — different IPs are different sites', () => {
    assert.equal(ctx.registrableDomain('http://10.0.3.4:3000/x'), '10.0.3.4');
    assert.notEqual(ctx.registrableDomain('http://10.0.3.4'), ctx.registrableDomain('http://172.16.3.4'));
    assert.equal(ctx.registrableDomain('http://localhost:8080/x'), 'localhost');
    const s = { inspectedOrigin: 'http://10.0.3.4:3000' };
    assert.equal(ctx.isForeignAutoCaptureOrigin('http://10.0.3.4:3000/step2', s), false);
    assert.equal(ctx.isForeignAutoCaptureOrigin('http://172.16.3.4/x', s), true);
  });

  it('no session origin → not foreign (no false blocking)', () => {
    assert.equal(ctx.isForeignAutoCaptureOrigin('https://x.com/a', null), false);
    assert.equal(ctx.isForeignAutoCaptureOrigin('https://x.com/a', {}), false);
  });
});

describe('microfrontend flows: subframe navs gated by the audited frame set', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  function sessionWithLastStep(frameSelections) {
    return { inspectedOrigin: 'https://host.example.com', steps: [{ index: 1, frameSelections }] };
  }

  it('frameKeyOrigin extracts the origin from fk::vN::origin::path', () => {
    assert.equal(ctx.frameKeyOrigin('fk::v1::https://mfe.vendor.com::/checkout:://'), 'https://mfe.vendor.com');
    assert.equal(ctx.frameKeyOrigin('garbage'), '');
  });

  it('matches by audited frameId (stable frame)', () => {
    const sess = sessionWithLastStep({ usedFrameIds: [7], usedFrameKeys: [] });
    assert.equal(ctx.isRelevantFrameNav('https://anything.example/x', 7, sess), true);
    assert.equal(ctx.isRelevantFrameNav('https://anything.example/x', 8, sess), false);
  });

  it('matches by SITE of an audited frameKey when the iframe was recreated (new frameId)', () => {
    const sess = sessionWithLastStep({
      usedFrameIds: [7],
      usedFrameKeys: ['fk::v1::https://mfe.vendor.com::/checkout:://'],
    });
    // New frameId (iframe recreated on nav), same vendor site → still the target.
    assert.equal(ctx.isRelevantFrameNav('https://mfe.vendor.com/checkout/step-2', 99, sess), true);
    // An ad iframe on a different site matches nothing.
    assert.equal(ctx.isRelevantFrameNav('https://ads.doubleclick.net/rotate', 99, sess), false);
  });

  it('no steps yet → nothing is relevant (baseline defines the audited set)', () => {
    assert.equal(ctx.isRelevantFrameNav('https://mfe.vendor.com/x', 1, { inspectedOrigin: 'https://h.com', steps: [] }), false);
  });
});

describe('session start captures a baseline step', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('startSession triggers an auto baseline capture when Auto is on', async () => {
    ctx.document._elCache['inspectedUrl'].dataset.full = 'https://app.example.com/home';
    ctx.document.getElementById('autoCaptureNav').checked = true;
    const calls = [];
    ctx.captureStepOptionC = async (label, opts) => { calls.push({ label, opts }); return true; };
    await ctx.startSession();
    assert.equal(calls.length, 1, 'baseline capture fired');
    assert.equal(calls[0].opts.isAutoCapture, true);
  });

  it('no baseline capture when Auto is off', async () => {
    ctx.document._elCache['inspectedUrl'].dataset.full = 'https://app.example.com/home';
    ctx.document.getElementById('autoCaptureNav').checked = false;
    const calls = [];
    ctx.captureStepOptionC = async () => { calls.push(1); return true; };
    await ctx.startSession();
    assert.equal(calls.length, 0);
  });
});

describe('auto-capture settings survive a panel reload', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('a deliberate OFF is restored; undefined defaults ON', async () => {
    const nav = ctx.document.getElementById('autoCaptureNav');
    nav.checked = true;
    await ctx.storageSet({ uiPrefs: { autoCaptureNav: false, autoCaptureDelay: 2000 } });
    await ctx.loadUiPrefs();
    assert.equal(nav.checked, false, 'deliberate OFF restored');
    assert.equal(ctx.document.getElementById('autoCaptureDelay').value, '2000');
    await ctx.storageSet({ uiPrefs: {} });
    await ctx.loadUiPrefs();
    assert.equal(nav.checked, true, 'undefined → HTML default ON');
  });
});

describe('UX audit 2026-07-20 (foodora session feedback)', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('groupDiffFindings clusters by type and sorts by severity then size', () => {
    const items = [
      { type: 'FOCUS_NOT_VISIBLE', severity: 'low', wcag: '2.4.7' },
      { type: 'NO_ACCESSIBLE_NAME', severity: 'high', wcag: '4.1.2' },
      { type: 'FOCUS_NOT_VISIBLE', severity: 'low', wcag: '2.4.7' },
      { type: 'NO_ACCESSIBLE_NAME', severity: 'high', wcag: '4.1.2' },
      { type: 'FOCUS_NOT_VISIBLE', severity: 'low', wcag: '2.4.7' },
    ];
    const groups = ctx.groupDiffFindings(items);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].type, 'NO_ACCESSIBLE_NAME'); // high first despite smaller count
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[1].items.length, 3);
  });

  it('step detail renders grouped headers, not a flat 99-row list', () => {
    const items = Array.from({ length: 40 }, (_, i) => ({ type: 'FOCUS_NOT_VISIBLE', severity: 'low', wcag: '2.4.7', name: `el${i}` }));
    const html = ctx._diffGroupHtml('Appeared', 'appeared', items);
    assert.match(html, /data-fgroup=/);
    assert.match(html, /×40/);
    assert.match(html, /hidden/); // instances collapsed by default
  });

  it('first step shows a baseline badge instead of "+N new"', () => {
    assert.match(ctx._badgeTriplet({ index: 1, appeared: 13, persisting: 0, resolved: 0 }), /13 · baseline/);
    assert.match(ctx._badgeTriplet({ index: 2, appeared: 5, persisting: 1, resolved: 0 }), /\+5/);
  });

  it('systemic note never repeats a rule label', () => {
    const mk = (i, n) => {
      const findings = Array.from({ length: n }, (_, j) => ({
        severity: 'high', confidence: 'strict', type: 'NO_ACCESSIBLE_NAME', name: `btn${j}`,
        wcag: '4.1.2', path: `html>body>div>button:nth-child(${j + 1})`, product: 'axe', role: '', level: 'AA',
      }));
      return mkStep(ctx, i, findings);
    };
    const steps = [mk(1, 3), mk(2, 3)];
    const html = ctx.flowVerdictHeaderHtml({ id: 's', rawAppendix: {}, steps });
    const hits = html.match(/NO_ACCESSIBLE_NAME in/g) || [];
    assert.ok(hits.length <= 1, `label repeated ${hits.length}× in systemic note`);
  });

  it('setPersistentStatus routes snap-surface writes away from the Flow line', () => {
    const flowLine = ctx.document.getElementById('lastStatusLine');
    const snapLine = ctx.document.getElementById('snapStatusLine');
    ctx.setPersistentStatus('OK', 'TABWALK', '0 issues', 'snap');
    assert.match(String(snapLine.textContent), /TABWALK/);
    assert.doesNotMatch(String(flowLine.textContent || ''), /TABWALK/);
    ctx.setPersistentStatus('OK', 'SESSION_STARTED', 'Session active');
    assert.match(String(flowLine.textContent), /SESSION_STARTED/);
  });

  it('applySectionView never shows an empty message over visible rows', () => {
    ctx.applySectionView('tabWalk', [{ i: 0, type: 'a' }], 'No focusable elements were walked');
    const emptyEl = ctx.document.getElementById('tabWalkEmpty');
    assert.equal(emptyEl.hidden, true, 'rows win over the empty message');
  });
});

describe('recorder error classification (policy block must be loud)', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  function err(name, message) { const e = new Error(message); e.name = name; return e; }

  it('permissions-policy blocks are "blocked", not "cancelled"', () => {
    assert.equal(ctx.classifyDisplayMediaError(err('NotAllowedError', 'display-capture is not allowed in this document.')), 'blocked');
    assert.equal(ctx.classifyDisplayMediaError(err('NotAllowedError', 'Access disallowed by permissions policy')), 'blocked');
  });

  it('user dismissal stays a silent cancel', () => {
    assert.equal(ctx.classifyDisplayMediaError(err('NotAllowedError', 'Permission denied')), 'cancelled');
    assert.equal(ctx.classifyDisplayMediaError(err('AbortError', 'The user aborted the request')), 'cancelled');
  });

  it('anything else is a plain failure', () => {
    assert.equal(ctx.classifyDisplayMediaError(err('TypeError', 'boom')), 'failed');
  });

  it('flowRecorder.start surfaces the classification and error detail', async () => {
    ctx.navigator = {
      mediaDevices: {
        getDisplayMedia: async () => { throw err('NotAllowedError', 'display-capture is not allowed in this document.'); },
      },
    };
    const r = await ctx.flowRecorder.start('sess_x');
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'blocked');
    assert.equal(r.errorName, 'NotAllowedError');
    assert.match(r.errorMessage, /not allowed in this document/);
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
