/**
 * Regression tests for the v6 code-review fixes (PR #55 review round):
 * recipe-vs-prefs ordering, profileAllowlist wiring, GFM pipe escaping,
 * lazy Raw JSON rendering, and the flow-verdict confidence note gating.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('loadUiPrefs vs applyRecipe ordering', () => {
  it('persisted depthMax survives a persisted non-auto recipe', async () => {
    const ctx = createContext({
      storageData: { uiPrefs: { recipeId: 'wizard', depthMax: 3 } },
    });
    await ctx.loadUiPrefs();
    // wizard recipe declares depthMax 2 — the user's saved 3 must win
    assert.equal(ctx.els.depthMax.value, '3');
  });
});

describe('applyRecipe profileAllowlist', () => {
  it('activates exactly the allowlisted profiles on explicit selection', () => {
    const ctx = createContext();
    ctx.profileState.profiles = { ...ctx.BUILTIN_PROFILES };
    ctx.profileState.active = ['helpcenter'];
    ctx.applyRecipe('chat_widget', { applyProfiles: true });
    assert.deepEqual([...ctx.profileState.active], ['chat']);
  });

  it('does NOT touch active profiles on restore (no applyProfiles opt)', () => {
    const ctx = createContext();
    ctx.profileState.profiles = { ...ctx.BUILTIN_PROFILES };
    ctx.profileState.active = ['helpcenter'];
    ctx.applyRecipe('chat_widget');
    assert.deepEqual([...ctx.profileState.active], ['helpcenter']);
  });

  it('ignores allowlist ids that are not loaded profiles', () => {
    const ctx = createContext();
    ctx.profileState.profiles = {};
    ctx.applyRecipe('chat_widget', { applyProfiles: true });
    assert.deepEqual([...ctx.profileState.active], []);
  });
});

describe('mdCell — GFM table cell escaping', () => {
  it('escapes pipes so signatures cannot split table columns', () => {
    const ctx = createContext();
    assert.equal(ctx.mdCell('run|frameA|IMG_NO_ALT|1.1.1'), 'run\\|frameA\\|IMG_NO_ALT\\|1.1.1');
    assert.equal(ctx.mdCell('no pipes'), 'no pipes');
    assert.equal(ctx.mdCell(null), '');
  });
});

describe('renderRawJson — lazy highlight for the collapsed sheet', () => {
  it('writes plain textContent while the sheet is hidden', () => {
    const ctx = createContext();
    const el = { textContent: '', innerHTML: '', dataset: {} };
    ctx.renderRawJson(el, { hidden: true }, '{"a": 1}');
    assert.equal(el.textContent, '{"a": 1}');
    assert.equal(el.innerHTML, '');
    assert.equal(el.dataset.hl, '0');
  });

  it('highlights immediately when the sheet is visible', () => {
    const ctx = createContext();
    const el = { textContent: '', innerHTML: '', dataset: {} };
    ctx.renderRawJson(el, { hidden: false }, '{"a": 1}');
    assert.match(el.innerHTML, /jt-key/);
    assert.equal(el.dataset.hl, '1');
  });
});

describe('flowVerdictHeaderHtml — confidence note gating', () => {
  function verdictHtmlFor(ctx, stepOverrides) {
    const sess = {
      id: 'sess_x',
      steps: [{
        index: 1,
        diffs: { consolidated: { blockingAdded: 0 } },
        snapshots: {},
        findingIndex: {},
        ...stepOverrides,
      }],
    };
    return ctx.flowVerdictHeaderHtml(sess);
  }

  it('rootSelectorNotFound alone surfaces the reduced-confidence note', () => {
    const ctx = createContext();
    const html = verdictHtmlFor(ctx, { rootSelectorNotFound: true });
    assert.match(html, /Diff confidence: reduced/);
    assert.match(html, /root selector not found/);
  });

  it('rootMissing no longer suppresses the low-profile-confidence reason', () => {
    const ctx = createContext();
    const html = verdictHtmlFor(ctx, { rootSelectorNotFound: true, profileSuspect: true });
    assert.match(html, /root selector not found/);
    assert.match(html, /low profile confidence/);
  });
});
