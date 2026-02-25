/**
 * RootSelector contract tests — validates the data shapes and rules that span
 * snippet + panel.js + sw.js without requiring full browser integration.
 *
 * Tests use fixture objects matching the expected shapes produced by each layer.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: simulate the contracts defined across snippet, panel.js, and sw.js
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Simulates buildProfileRootSelector() from panel.js:
 * Returns the first non-empty rootSelector from active profiles, or null.
 */
function buildProfileRootSelector(profileState) {
  for (const id of profileState.active) {
    const p = profileState.profiles[id];
    if (p?.rootSelector && typeof p.rootSelector === 'string') return p.rootSelector;
  }
  return null;
}

/**
 * Simulates the snippet scope output from a11y-audit-snippet.js:
 * When rootSelector is provided and the element IS found, scope.type = "subtree".
 * When rootSelector is provided but NOT found, rootSelectorNotFound = true and
 * the audit still returns ok (falls back to document root).
 */
function simulateSnippetScope(cfg, selectorFoundInDom) {
  const rootSelectorNotFound = !!(cfg.rootSelector && !selectorFoundInDom);
  const scope = cfg.rootSelector && !rootSelectorNotFound
    ? { type: 'subtree', rootSelector: cfg.rootSelector, rootTestId: null }
    : { type: 'document', rootSelector: null, rootTestId: null };
  return { ok: true, scope, rootSelectorNotFound };
}

/**
 * Simulates the downstream step enrichment from panel.js captureStep:
 * When bestEntry signals rootSelectorNotFound, sets profileSuspect = true
 * and adds "rootSelector_not_found" signal.
 */
function applyRootSelectorContract(step, runBestEntry, activeBestEntry) {
  const runRootNotFound = runBestEntry?.rootSelectorNotFound === true;
  const activeRootNotFound = activeBestEntry?.rootSelectorNotFound === true;
  if (runRootNotFound || activeRootNotFound) {
    step.profileSuspect = true;
    if (!step.profileMatchSignals.includes('rootSelector_not_found')) {
      step.profileMatchSignals = [...step.profileMatchSignals, 'rootSelector_not_found'].sort().slice(0, 6);
    }
  }
  return step;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('RootSelector contract', () => {

  // 1. rootSelector applied — profile with rootSelector injects into audit config
  it('rootSelector applied — profile with rootSelector injects into audit config', () => {
    const profileState = {
      profiles: {
        'helpcenter': { label: 'Help Center', rootSelector: '#help-root', frame: {}, modeHints: {} },
        'chat': { label: 'Chat Widget', frame: {}, modeHints: {} },
      },
      active: ['helpcenter', 'chat'],
    };

    const rootSelector = buildProfileRootSelector(profileState);
    assert.equal(rootSelector, '#help-root', 'should return first profile rootSelector');

    // When NOT manual, rootSelector flows into the audit config
    const target = { manual: false };
    const effectiveRootSelector = target?.manual ? null : rootSelector;
    assert.equal(effectiveRootSelector, '#help-root', 'non-manual target passes rootSelector through');
  });

  // 2. rootSelector missing from DOM — audit does NOT fail (returns ok with rootSelectorNotFound flag)
  it('rootSelector missing from DOM — audit does NOT fail', () => {
    const snippetResult = simulateSnippetScope({ rootSelector: '#missing-widget' }, false);

    assert.equal(snippetResult.ok, true, 'audit must still return ok');
    assert.equal(snippetResult.rootSelectorNotFound, true, 'rootSelectorNotFound flag must be set');
    assert.equal(snippetResult.scope.type, 'document', 'scope falls back to document when selector not found');
    assert.equal(snippetResult.scope.rootSelector, null, 'scope.rootSelector is null on fallback');
  });

  // 3. rootSelector missing from DOM — sets profileSuspect = true
  it('rootSelector missing from DOM — sets profileSuspect = true', () => {
    const step = {
      profileSuspect: false,
      profileMatchSignals: ['url_match'],
    };
    const bestEntry = { rootSelectorNotFound: true };

    applyRootSelectorContract(step, bestEntry, null);

    assert.equal(step.profileSuspect, true, 'profileSuspect must be true when rootSelector not found');
  });

  // 4. rootSelector missing from DOM — adds "rootSelector_not_found" signal
  it('rootSelector missing from DOM — adds rootSelector_not_found signal', () => {
    const step = {
      profileSuspect: false,
      profileMatchSignals: ['dom_selector'],
    };
    const bestEntry = { rootSelectorNotFound: true };

    applyRootSelectorContract(step, bestEntry, null);

    assert.ok(
      step.profileMatchSignals.includes('rootSelector_not_found'),
      'profileMatchSignals must contain rootSelector_not_found'
    );
    // Verify signal list remains sorted and capped
    const sorted = [...step.profileMatchSignals].sort();
    assert.deepEqual(step.profileMatchSignals, sorted, 'signals must be sorted');
    assert.ok(step.profileMatchSignals.length <= 6, 'signals must be capped at 6');
  });

  // 5. rootSelector does not override manual override — when manual mode, rootSelector is null
  it('rootSelector does not override manual override', () => {
    const profileState = {
      profiles: {
        'widget': { label: 'Widget', rootSelector: '#widget-root', frame: {}, modeHints: {} },
      },
      active: ['widget'],
    };

    const rootSelector = buildProfileRootSelector(profileState);
    assert.equal(rootSelector, '#widget-root', 'profile has a rootSelector');

    // Manual override nullifies rootSelector
    const target = { manual: true, frameIds: [5] };
    const effectiveRootSelector = target?.manual ? null : rootSelector;
    assert.equal(effectiveRootSelector, null, 'rootSelector must be null when manual override active');
  });

  // 6. manual override bypass — rootSelector ignored when manual
  it('manual override bypass — rootSelector ignored when manual', () => {
    const profileState = {
      profiles: {
        'spa-app': { label: 'SPA App', rootSelector: '#app-root', frame: {}, modeHints: {} },
        'secondary': { label: 'Secondary', rootSelector: '#secondary', frame: {}, modeHints: {} },
      },
      active: ['spa-app', 'secondary'],
    };

    // Without manual: first rootSelector wins
    const nonManualTarget = {};
    const nonManualSelector = nonManualTarget?.manual ? null : buildProfileRootSelector(profileState);
    assert.equal(nonManualSelector, '#app-root');

    // With manual: always null regardless of profiles
    const manualTarget = { manual: true, frameIds: [0] };
    const manualSelector = manualTarget?.manual ? null : buildProfileRootSelector(profileState);
    assert.equal(manualSelector, null, 'manual mode must bypass all rootSelector logic');
  });

  // 7. rootSelector scopes query — when selector found, scope is "subtree"
  it('rootSelector scopes query — when selector found, scope is subtree', () => {
    const snippetResult = simulateSnippetScope({ rootSelector: '#my-component' }, true);

    assert.equal(snippetResult.scope.type, 'subtree', 'scope.type must be subtree when selector found');
    assert.equal(snippetResult.scope.rootSelector, '#my-component', 'scope.rootSelector must echo the selector');
    assert.equal(snippetResult.rootSelectorNotFound, false, 'rootSelectorNotFound must be false');
  });

  // 8. rootSelector absent — scope defaults to "document"
  it('rootSelector absent — scope defaults to document', () => {
    // No rootSelector in config at all
    const snippetResult = simulateSnippetScope({}, true);

    assert.equal(snippetResult.scope.type, 'document', 'scope.type must default to document');
    assert.equal(snippetResult.scope.rootSelector, null, 'scope.rootSelector must be null');
    assert.equal(snippetResult.rootSelectorNotFound, false, 'rootSelectorNotFound must be false when no selector configured');

    // Profile with no rootSelector
    const profileState = {
      profiles: {
        'basic': { label: 'Basic', frame: {}, modeHints: {} },
      },
      active: ['basic'],
    };
    const rootSelector = buildProfileRootSelector(profileState);
    assert.equal(rootSelector, null, 'buildProfileRootSelector must return null when no profile has rootSelector');
  });

});
