/**
 * Test harness — loads panel.js function definitions into a vm context
 * with mocked browser/Chrome globals. Zero npm dependencies.
 *
 * Usage:
 *   import { createContext } from './harness.mjs';
 *   const ctx = createContext();
 *   ctx.escapeHtml('<b>') // '&lt;b&gt;'
 */

import { readFileSync } from 'node:fs';
import { createContext as vmCreateContext, Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LIMITS_JS = join(__dirname, '..', 'src', 'shared', 'limits.js');
const FLOW_PROFILES_JS = join(__dirname, '..', 'src', 'shared', 'flow-profiles.js');
const WCAG_COVERAGE_JS = join(__dirname, '..', 'src', 'shared', 'wcag-coverage.js');
const D3AGG_JS = join(__dirname, '..', 'src', 'engine', 'depth3Aggregates.js');
const CI_EXPORTER_JS = join(__dirname, '..', 'src', 'engine', 'ciExporter.js');
const PANEL_DIR = join(__dirname, '..', 'src', 'panel');
const PANEL_PARTS = join(PANEL_DIR, 'panel.parts.json');

// Cut source before the "wire up" section where imperative DOM binding code begins.
// The wireup part is excluded via the manifest; the marker cut stays as a belt-and-braces
// guard in case wiring code ever creeps into an earlier part.
const INIT_MARKER = '\n// --- wire up ---\n';

/** Concatenated panel source minus the wireup part (function definitions only). */
function readPanelSource() {
  const manifest = JSON.parse(readFileSync(PANEL_PARTS, 'utf8'));
  return manifest.parts
    .filter(name => name !== manifest.wireup)
    .map(name => readFileSync(join(PANEL_DIR, name), 'utf8'))
    .join('');
}

function buildMockEls() {
  const noop = () => {};
  const mockEl = (overrides = {}) => ({
    textContent: '',
    innerHTML: '',
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    dataset: {},
    style: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop,
    getAttribute: () => null,
    addEventListener: noop,
    removeEventListener: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    focus: noop,
    blur: noop,
    append: noop,
    appendChild: noop,
    remove: noop,
    before: noop,
    after: noop,
    insertAdjacentHTML: noop,
    ...overrides,
  });

  // Build an els proxy: any property access returns a mock element
  return new Proxy({}, {
    get(target, prop) {
      if (prop in target) return target[prop];
      target[prop] = mockEl();
      return target[prop];
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  });
}

function buildMockChrome() {
  const storage = {};
  return {
    devtools: {
      inspectedWindow: { tabId: 1, eval: (expr, cb) => cb && cb('', null) },
      network: { onNavigated: { addListener: () => {} } },
    },
    runtime: {
      sendMessage: () => Promise.resolve({ ok: true }),
      onMessage: { addListener: () => {} },
      getURL: (path) => `chrome-extension://mock/${path}`,
      getManifest: () => ({ version: '0.0.0-test' }),
    },
    storage: {
      local: {
        get: (keys) => {
          if (keys === null) return Promise.resolve({ ...storage });
          const out = {};
          const ks = Array.isArray(keys) ? keys : Object.keys(keys || {});
          for (const k of ks) { if (k in storage) out[k] = storage[k]; }
          return Promise.resolve(out);
        },
        set: (obj) => {
          for (const [k, v] of Object.entries(obj || {})) {
            if (v === null || v === undefined) delete storage[k];
            else storage[k] = JSON.parse(JSON.stringify(v));
          }
          return Promise.resolve();
        },
        remove: (keys) => {
          for (const k of (Array.isArray(keys) ? keys : [keys])) delete storage[k];
          return Promise.resolve();
        },
        _raw: storage,  // exposed for test inspection
      },
    },
  };
}

function buildMockDocument() {
  const noop = () => {};
  const _elCache = {};
  const _makeEl = (tag) => ({
    tagName: (tag || 'DIV').toUpperCase(),
    className: '',
    innerHTML: '',
    textContent: '',
    dataset: {},
    style: {},
    hidden: false,
    disabled: false,
    checked: false,
    value: '',
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    setAttribute: noop,
    getAttribute: () => null,
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: noop,
    append: noop,
    remove: noop,
    after: noop,
    before: noop,
    insertAdjacentHTML: noop,
    click: noop,
    focus: noop,
    blur: noop,
    select: noop,
    setSelectionRange: noop,
    closest: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const body = _makeEl('body');
  body.appendChild = noop;
  body.removeChild = noop;
  const doc = {
    getElementById: (id) => { if (!_elCache[id]) _elCache[id] = _makeEl('div'); return _elCache[id]; },
    querySelector: () => _makeEl('div'),
    querySelectorAll: () => [],
    createElement: (tag) => _makeEl(tag),
    createTextNode: (text) => ({ textContent: text }),
    addEventListener: noop,
    execCommand: () => true,
    body,
    _elCache, // exposed for test setup
  };
  return doc;
}

/**
 * Create a sandboxed context with all panel.js functions available.
 * @param {object} [opts]
 * @param {object} [opts.storageData] - pre-populate chrome.storage.local
 * @returns {object} The vm context with all functions as properties
 */
export function createContext(opts = {}) {
  const source = readPanelSource();
  const markerIdx = source.indexOf(INIT_MARKER);
  const safeSource = markerIdx !== -1 ? source.slice(0, markerIdx) : source;

  const mockChrome = buildMockChrome();
  if (opts.storageData) {
    Object.assign(mockChrome.storage.local._raw, opts.storageData);
  }

  const ctx = vmCreateContext({
    // JS builtins
    Object, Array, String, Number, Boolean, Symbol,
    Math, Date, JSON, RegExp, Error, TypeError, RangeError,
    Map, Set, WeakMap, WeakSet,
    Promise, Proxy,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    setTimeout: (fn, ms) => { fn(); return 1; },
    clearTimeout: () => {},
    setInterval: (fn, ms) => 1,
    clearInterval: () => {},
    requestAnimationFrame: (fn) => { fn(); return 1; },
    cancelAnimationFrame: () => {},
    queueMicrotask: (fn) => { fn(); },
    TextEncoder,
    URL,
    Uint8Array,
    console,

    // Browser globals
    chrome: mockChrome,
    document: buildMockDocument(),
    window: {
      setInterval: (fn, ms) => 1,
      clearInterval: () => {},
      setTimeout: (fn, ms) => { fn(); return 1; },
      clearTimeout: () => {},
    },
    navigator: { clipboard: { writeText: () => Promise.resolve() } },
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = String(v); },
      removeItem(k) { delete this._store[k]; },
    },

    // DOM element cache
    els: buildMockEls(),

    // Stubs for globals panel.js defines at top level
    tabId: 1,

    // For __storageLocal detection
    __storageLocal: mockChrome.storage.local,
    __runtime: mockChrome.runtime,

    // HostConfig: injected at build time, overridable via opts.hostConfig
    __HOST_CONFIG__: opts.hostConfig || {
      id: "test", defaultProfiles: [], rootSelector: null,
      match: { domSelectorsAny: [], urlIncludesAny: [], urlExcludesAny: [] },
      ui: {},
    },

    // Expose internal mock for test access
    __mockChrome: mockChrome,
  });

  // Load shared modules before panel.js (mirrors script tag order in panel.html)
  const limitsSource = readFileSync(LIMITS_JS, 'utf8');
  const limitsScript = new Script(limitsSource, { filename: 'limits.js' });
  limitsScript.runInContext(ctx);

  const flowProfilesSource = readFileSync(FLOW_PROFILES_JS, 'utf8');
  const flowProfilesScript = new Script(flowProfilesSource, { filename: 'flow-profiles.js' });
  flowProfilesScript.runInContext(ctx);

  const wcagCoverageSource = readFileSync(WCAG_COVERAGE_JS, 'utf8');
  const wcagScript = new Script(wcagCoverageSource, { filename: 'wcag-coverage.js' });
  wcagScript.runInContext(ctx);

  const d3aggSource = readFileSync(D3AGG_JS, 'utf8');
  const d3aggScript = new Script(d3aggSource, { filename: 'depth3Aggregates.js' });
  d3aggScript.runInContext(ctx);

  const ciExpSource = readFileSync(CI_EXPORTER_JS, 'utf8');
  const ciExpScript = new Script(ciExpSource, { filename: 'ciExporter.js' });
  ciExpScript.runInContext(ctx);

  const script = new Script(safeSource, { filename: 'panel.js' });
  script.runInContext(ctx);

  // Expose const/let scoped variables via a secondary script in the same context
  const expose = new Script(`
    this.__sessionState = sessionState;
    this.__state = state;
    this.__VT = VT;
    this.__MODE_COLORS = typeof MODE_COLORS !== 'undefined' ? MODE_COLORS : {};
    this.__GENERIC_PROFILES = typeof GENERIC_PROFILES !== 'undefined' ? GENERIC_PROFILES : {};
    this.__FLOW_PROFILES_VERSION = typeof FLOW_PROFILES_VERSION !== 'undefined' ? FLOW_PROFILES_VERSION : 0;
    this.__WCAG_COVERAGE_VERSION = typeof WCAG_COVERAGE_VERSION !== 'undefined' ? WCAG_COVERAGE_VERSION : 0;
    this.__WCAG_TARGET = typeof WCAG_TARGET !== 'undefined' ? WCAG_TARGET : {};
    this.__WCAG_CRITERIA = typeof WCAG_CRITERIA !== 'undefined' ? WCAG_CRITERIA : [];
    this.__RULE_TO_WCAG = typeof RULE_TO_WCAG !== 'undefined' ? RULE_TO_WCAG : {};
    this.__MODE_TO_WCAG = typeof MODE_TO_WCAG !== 'undefined' ? MODE_TO_WCAG : {};
    this.__UNCOVERED_CRITERIA_REASONS = typeof UNCOVERED_CRITERIA_REASONS !== 'undefined' ? UNCOVERED_CRITERIA_REASONS : {};
    this.__STABLE_SIGNATURE_VERSION = typeof STABLE_SIGNATURE_VERSION !== 'undefined' ? STABLE_SIGNATURE_VERSION : 0;
    this.__RECIPES = typeof RECIPES !== 'undefined' ? RECIPES : {};
    this.__activeRecipeId = typeof activeRecipeId !== 'undefined' ? activeRecipeId : 'auto';
    this.__els = typeof els !== 'undefined' ? els : {};
    this.__hostConfig = typeof hostConfig !== 'undefined' ? hostConfig : {};
    this.__profileState = typeof profileState !== 'undefined' ? profileState : {};
    this.__BUILTIN_PROFILES = typeof BUILTIN_PROFILES !== 'undefined' ? BUILTIN_PROFILES : {};
    this.__buildDepth3Aggregates = typeof buildDepth3Aggregates !== 'undefined' ? buildDepth3Aggregates : null;
    this.__buildCIReport = typeof buildCIReport !== 'undefined' ? buildCIReport : null;
    this.__validateCIReport = typeof validateCIReport !== 'undefined' ? validateCIReport : null;
    this.__activeGroupFilter = typeof activeGroupFilter !== 'undefined' ? activeGroupFilter : null;
  `, { filename: 'expose.js' });
  expose.runInContext(ctx);

  // Convenience: also attach them as top-level properties
  ctx.sessionState = ctx.__sessionState;
  ctx._state = ctx.__state;
  ctx.RECIPES = ctx.__RECIPES;
  ctx.state = ctx.__state;
  ctx.els = ctx.__els;
  ctx.hostConfig = ctx.__hostConfig;
  ctx.profileState = ctx.__profileState;
  ctx.BUILTIN_PROFILES = ctx.__BUILTIN_PROFILES;

  // Pre-set inspected URL so getCurrentScopeInfo() returns a valid origin.
  // The real `els` is a const built from document.getElementById() inside panel.js,
  // so we must set properties on the document mock's cached element, not ctx.els.
  const inspectedUrlEl = ctx.document._elCache['inspectedUrl'];
  if (inspectedUrlEl) {
    inspectedUrlEl.dataset.full = 'https://example.com/test';
    inspectedUrlEl.textContent = 'https://example.com/test';
  }

  return ctx;
}
