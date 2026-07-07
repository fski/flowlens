/**
 * Tab path overlay + watch focus history — structural tests against the
 * snippet source, plus SHOW_TAB_PATH message validation in sw.js.
 *
 * Follows the source-level assertion style of other snippet tests
 * (see host-config-gating.test.mjs section 6).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSwContext } from './sw-harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPET_PATH = join(__dirname, '..', 'src', 'snippet', 'a11y-audit-snippet.js');
const SW_PATH = join(__dirname, '..', 'src', 'sw', 'sw.js');
const PANEL_PATH = join(__dirname, '..', 'src', 'panel', 'panel.js');

const snippet = readFileSync(SNIPPET_PATH, 'utf8');
const sw = readFileSync(SW_PATH, 'utf8');
const panel = readFileSync(PANEL_PATH, 'utf8');

// ══════════════════════════════════════════════════════
// 1. showTabPath — definition + API exposure
// ══════════════════════════════════════════════════════

describe('Tab path overlay — showTabPath', () => {
  it('showTabPath is defined in the snippet', () => {
    assert.match(snippet, /const showTabPath = \(events, opts = \{\}\) =>/,
      'showTabPath should be defined as an arrow function taking (events, opts)');
  });

  it('showTabPath is exposed on the api object', () => {
    assert.match(snippet, /^\s+showTabPath,$/m, 'api object should expose showTabPath');
  });

  it('clearTabPath is defined and exposed on the api object', () => {
    assert.match(snippet, /const clearTabPath = \(\) =>/);
    assert.match(snippet, /^\s+clearTabPath,$/m, 'api object should expose clearTabPath');
  });

  it('uses a dedicated tab path container id', () => {
    assert.match(snippet, /const TAB_PATH_CONTAINER_ID = "__flowlens_tab_path__"/);
  });

  it('caps badges at 80 (tabWalk walks up to 80 focusables)', () => {
    assert.match(snippet, /const MAX_TAB_PATH_BADGES = 80/);
    assert.match(snippet, /Math\.min\(stops\.length, MAX_TAB_PATH_BADGES\)/);
  });

  it('draws an SVG polyline connecting stop centers', () => {
    assert.match(snippet, /createElementNS\(SVG_NS, "svg"\)/);
    assert.match(snippet, /createElementNS\(SVG_NS, "polyline"\)/);
    assert.match(snippet, /polyline\.setAttribute\("points", points\.join\(" "\)\)/);
  });

  it('overlay elements are pointer-events none (no listeners attached)', () => {
    const fnStart = snippet.indexOf('const showTabPath =');
    const fnEnd = snippet.indexOf('const annotateFindings =', fnStart);
    assert.ok(fnStart > -1 && fnEnd > fnStart, 'showTabPath should be defined before annotateFindings');
    const body = snippet.slice(fnStart, fnEnd);
    assert.ok(body.includes('pointer-events:none'), 'overlay uses pointer-events:none');
    assert.ok(!body.includes('addEventListener'), 'showTabPath must not attach event listeners');
  });

  it('blocking event types mirror TAB_BLOCKING_EVENT_TYPES in sw.js', () => {
    const swBlock = sw.match(/const TAB_BLOCKING_EVENT_TYPES = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(swBlock, 'sw.js should define TAB_BLOCKING_EVENT_TYPES');
    const swTypes = [...swBlock[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
    const snipBlock = snippet.match(/const TAB_PATH_BLOCKING_TYPES = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(snipBlock, 'snippet should define TAB_PATH_BLOCKING_TYPES');
    const snipTypes = [...snipBlock[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(snipTypes, swTypes, 'blocking types must stay in sync between snippet and sw.js');
  });

  it('blocked stops use red, others the accent color', () => {
    assert.match(snippet, /const TAB_PATH_BLOCKED_COLOR = "#DB5A5A"/);
    assert.match(snippet, /isBlocked \? TAB_PATH_BLOCKED_COLOR : TAB_PATH_ACCENT/);
  });

  it('badges are numbered in visit order (1..N)', () => {
    assert.match(snippet, /badge\.textContent = String\(idx \+ 1\)/);
  });
});

// ══════════════════════════════════════════════════════
// 2. Cleanup wiring
// ══════════════════════════════════════════════════════

describe('Tab path overlay — cleanup', () => {
  it('showTabPath clears the previous path before drawing (idempotent re-run)', () => {
    assert.match(snippet, /const showTabPath = \(events, opts = \{\}\) => \{\s*\n\s*clearTabPath\(\);/);
  });

  it('clearTabPath removes the tab path container', () => {
    assert.match(snippet, /const clearTabPath = \(\) => \{\s*\n\s*const existing = doc\.getElementById\(TAB_PATH_CONTAINER_ID\);\s*\n\s*if \(existing\) existing\.remove\(\);/);
  });

  it('clearAnnotations also removes the tab path overlay', () => {
    const block = snippet.match(/const clearAnnotations = \(\) => \{([\s\S]*?)\};/);
    assert.ok(block, 'clearAnnotations should be defined');
    assert.ok(block[1].includes('clearTabPath()'), 'clearAnnotations must call clearTabPath()');
  });
});

// ══════════════════════════════════════════════════════
// 3. tabWalk overlay option
// ══════════════════════════════════════════════════════

describe('Tab path overlay — tabWalk({overlay:true})', () => {
  it('tabWalk config accepts overlay flag (default false)', () => {
    assert.match(snippet, /const tabWalk = \(\{ steps = 60, includePositiveTabindex = true, overlay = false \} = \{\}\)/);
  });

  it('tabWalk auto-shows the path with the walked elements when overlay is set', () => {
    assert.match(snippet, /if \(overlay\) \{\s*\n\s*try \{ summary\.overlay = showTabPath\(events, \{ elements: filtered\.slice\(0, max\) \}\); \} catch \{\}/);
  });
});

// ══════════════════════════════════════════════════════
// 4. Watch focus history log
// ══════════════════════════════════════════════════════

describe('Watch focus history — focusin listener', () => {
  it('watch registers a capturing document-level focusin listener', () => {
    assert.match(snippet, /doc\.addEventListener\("focusin", onWatchFocusIn, true\)/);
  });

  it('watch removes the focusin listener in finalize (same cleanup path as observers)', () => {
    assert.match(snippet, /doc\.removeEventListener\("focusin", onWatchFocusIn, true\)/);
    // Removal must live inside finalize, next to the observer disconnects
    const finalizeIdx = snippet.indexOf('const finalize = () => {');
    const removeIdx = snippet.indexOf('doc.removeEventListener("focusin", onWatchFocusIn, true)');
    assert.ok(finalizeIdx > -1 && removeIdx > finalizeIdx, 'removeEventListener should be inside finalize');
    assert.ok(removeIdx < snippet.indexOf('watchInFlight = null', finalizeIdx),
      'listener removal should happen during finalize cleanup');
  });

  it('records focus_change events with a css selector note', () => {
    assert.match(snippet, /type: "focus_change", note: txt\(cssPath\(target\), 140\)/);
  });

  it('records focus_reset_body when focus lands on body/documentElement', () => {
    assert.match(snippet, /target === doc\.body \|\| target === doc\.documentElement/);
    assert.match(snippet, /type: "focus_reset_body", note: "focus reset to body"/);
  });

  it('caps focus history at 100 events per watch', () => {
    assert.match(snippet, /const MAX_FOCUS_HISTORY_EVENTS = 100/);
    assert.match(snippet, /if \(focusHistoryCount >= MAX_FOCUS_HISTORY_EVENTS\) return;/);
  });
});

// ══════════════════════════════════════════════════════
// 5. SW message validation — SHOW_TAB_PATH
// ══════════════════════════════════════════════════════

describe('SHOW_TAB_PATH message validation', () => {
  const sender = { id: 'test-extension-id' };

  it('is registered in MESSAGE_TYPES', () => {
    assert.match(sw, /MESSAGE_TYPES = new Set\(\[[^\]]*"SHOW_TAB_PATH"[^\]]*\]\)/);
  });

  it('accepts a valid SHOW_TAB_PATH message', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', tabId: 1, frameId: 0,
      events: [{ i: 2, type: 'possible_focus_trap', path: 'div > button' }],
    }, sender);
    assert.equal(result.ok, true);
  });

  it('accepts clear mode without events', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', tabId: 1, frameId: 0, clear: true,
    }, sender);
    assert.equal(result.ok, true);
  });

  it('rejects missing tabId', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', frameId: 0, events: [],
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_TAB_ID');
  });

  it('rejects missing/invalid frameId', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', tabId: 1, events: [],
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_FRAME_ID');
  });

  it('rejects non-array events', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', tabId: 1, frameId: 0, events: 'bad',
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_EVENTS');
  });

  it('rejects events with non-object entries', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', tabId: 1, frameId: 0, events: [{ i: 0 }, 'nope'],
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_EVENTS');
  });

  it('rejects oversized events arrays', () => {
    const ctx = createSwContext();
    const big = Array.from({ length: 401 }, (_, i) => ({ i }));
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', tabId: 1, frameId: 0, events: big,
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_EVENTS');
  });

  it('rejects non-boolean clear', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', tabId: 1, frameId: 0, clear: 'yes',
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_CLEAR');
  });

  it('rejects unauthorized senders', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'SHOW_TAB_PATH', tabId: 1, frameId: 0, events: [],
    }, { id: 'evil-extension' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'UNAUTHORIZED_SENDER');
  });

  it('sw handler sanitizes event fields before injection', () => {
    assert.match(sw, /i: Number\.isInteger\(Number\(e\.i\)\) \? Number\(e\.i\) : null/);
    assert.match(sw, /type: typeof e\.type === "string" \? e\.type\.slice\(0, 64\) : ""/);
    assert.match(sw, /path: typeof e\.path === "string" \? e\.path\.slice\(0, 512\) : null/);
  });
});

// ══════════════════════════════════════════════════════
// 6. Panel wiring — buttons use SHOW_TAB_PATH message flow
// ══════════════════════════════════════════════════════

describe('Panel tab path buttons', () => {
  it('show button sends SHOW_TAB_PATH with recorded events', () => {
    assert.match(panel, /send\(\{ type: "SHOW_TAB_PATH", frameId: state\.bestFrameId \?\? 0, events \}\)/);
  });

  it('clear button sends SHOW_TAB_PATH with clear flag', () => {
    assert.match(panel, /send\(\{ type: "SHOW_TAB_PATH", frameId: state\.bestFrameId \?\? 0, clear: true \}\)/);
  });

  it('buttons are wired via addEventListener (CSP-safe, no inline handlers)', () => {
    assert.match(panel, /els\.showTabPathBtn\.addEventListener\("click"/);
    assert.match(panel, /els\.clearTabPathBtn\.addEventListener\("click"/);
  });
});
