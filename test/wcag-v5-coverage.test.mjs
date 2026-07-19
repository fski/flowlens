/**
 * Coverage map v5 — mode-based coverage (Contrast/TabWalk), reasons for
 * uncovered criteria, and the three new automated rules (2.1.4 / 3.2.2 / 3.3.8).
 *
 * Key invariant: every criterion the engine cannot cover has an explicit,
 * current reason — no silent gaps, no stale reasons for covered criteria.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

const ctx = createContext();

describe('new automated rules', () => {
  it('ACCESSKEY_CHAR_SHORTCUT maps to 2.1.4 A heuristic', () => {
    const m = ctx.__RULE_TO_WCAG.ACCESSKEY_CHAR_SHORTCUT;
    assert.ok(m, 'entry should exist');
    assert.equal(m.criterion, '2.1.4');
    assert.equal(m.level, 'A');
    assert.equal(m.confidence, 'heuristic');
  });

  it('SELECT_AUTO_SUBMIT maps to 3.2.2 A heuristic', () => {
    const m = ctx.__RULE_TO_WCAG.SELECT_AUTO_SUBMIT;
    assert.ok(m, 'entry should exist');
    assert.equal(m.criterion, '3.2.2');
    assert.equal(m.level, 'A');
    assert.equal(m.confidence, 'heuristic');
  });

  it('PASTE_BLOCKED_INPUT maps to 3.3.8 AA heuristic', () => {
    const m = ctx.__RULE_TO_WCAG.PASTE_BLOCKED_INPUT;
    assert.ok(m, 'entry should exist');
    assert.equal(m.criterion, '3.3.8');
    assert.equal(m.level, 'AA');
    assert.equal(m.confidence, 'heuristic');
  });
});

describe('mode-based coverage', () => {
  it('MODE_TO_WCAG declares contrast → 1.4.3 and tabWalk → 2.1.2', () => {
    // JSON round-trip normalises cross-VM arrays for strict deep equality
    const norm = (o) => JSON.parse(JSON.stringify(o));
    assert.deepEqual(norm(ctx.__MODE_TO_WCAG.contrast), ['1.4.3']);
    assert.deepEqual(norm(ctx.__MODE_TO_WCAG.tabWalk), ['2.1.2']);
  });

  it('engineCoverageSummary counts mode-covered criteria', () => {
    const ecs = ctx.engineCoverageSummary();
    assert.ok(ecs.criteriaCovered.includes('1.4.3'), '1.4.3 covered via Contrast mode');
    assert.ok(ecs.criteriaCovered.includes('2.1.2'), '2.1.2 covered via Tab Walk');
    assert.ok(!ecs.criteriaMissing.includes('1.4.3'));
    assert.ok(!ecs.criteriaMissing.includes('2.1.2'));
  });

  it('new rule criteria are no longer missing', () => {
    const ecs = ctx.engineCoverageSummary();
    for (const c of ['2.1.4', '3.2.2', '3.3.8']) {
      assert.ok(ecs.criteriaCovered.includes(c), `${c} should be covered`);
    }
  });
});

describe('uncovered criteria are explicitly accounted for', () => {
  const ALLOWED_REASONS = new Set(['manual', 'media', 'multi-page', 'dynamic']);

  it('every missing criterion has a reason', () => {
    const ecs = ctx.engineCoverageSummary();
    for (const c of ecs.criteriaMissing) {
      assert.ok(ctx.__UNCOVERED_CRITERIA_REASONS[c],
        `criterion ${c} is uncovered but has no entry in UNCOVERED_CRITERIA_REASONS`);
    }
  });

  it('no stale reasons for criteria that are actually covered', () => {
    const ecs = ctx.engineCoverageSummary();
    const missing = new Set(ecs.criteriaMissing);
    for (const c of Object.keys(ctx.__UNCOVERED_CRITERIA_REASONS)) {
      assert.ok(missing.has(c),
        `UNCOVERED_CRITERIA_REASONS has "${c}" but the engine now covers it — remove the stale entry`);
    }
  });

  it('reasons use the documented enum', () => {
    for (const [c, r] of Object.entries(ctx.__UNCOVERED_CRITERIA_REASONS)) {
      assert.ok(ALLOWED_REASONS.has(r), `${c} has unknown reason "${r}"`);
    }
  });
});
