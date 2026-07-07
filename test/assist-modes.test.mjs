/**
 * Assist toolbox — WCAG stress-test toggles + vision simulators.
 * Structural tests against the snippet source, APPLY_ASSIST message
 * validation in sw.js, and panel wiring presence checks.
 *
 * Follows the source-level assertion style of tab-path-overlay.test.mjs.
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
const PANEL_HTML_PATH = join(__dirname, '..', 'src', 'panel', 'panel.html');

const snippet = readFileSync(SNIPPET_PATH, 'utf8');
const sw = readFileSync(SW_PATH, 'utf8');
const panel = readFileSync(PANEL_PATH, 'utf8');
const panelHtml = readFileSync(PANEL_HTML_PATH, 'utf8');

const ASSIST_KINDS = ['textSpacing', 'grayscale', 'protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'];

// ══════════════════════════════════════════════════════
// 1. applyAssist / clearAssist — definition + API exposure
// ══════════════════════════════════════════════════════

describe('Assist toolbox — applyAssist/clearAssist', () => {
  it('applyAssist is defined in the snippet', () => {
    assert.match(snippet, /const applyAssist = \(kind\) =>/,
      'applyAssist should be defined as an arrow function taking (kind)');
  });

  it('clearAssist is defined in the snippet', () => {
    assert.match(snippet, /const clearAssist = \(\) =>/);
  });

  it('both are exposed on the api object', () => {
    assert.match(snippet, /^\s+applyAssist,$/m, 'api object should expose applyAssist');
    assert.match(snippet, /^\s+clearAssist,$/m, 'api object should expose clearAssist');
  });

  it('uses dedicated style and svg element ids', () => {
    assert.match(snippet, /const ASSIST_STYLE_ID = "__flowlens_assist_style__"/);
    assert.match(snippet, /const ASSIST_SVG_ID = "__flowlens_assist_svg__"/);
    assert.match(snippet, /const ASSIST_CVD_FILTER_ID = "__flowlens_cvd__"/);
  });

  it('supports all six assist kinds', () => {
    const block = snippet.match(/const ASSIST_KINDS = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(block, 'snippet should define ASSIST_KINDS');
    const kinds = [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(kinds, [...ASSIST_KINDS].sort());
  });

  it('rejects unknown kinds', () => {
    assert.match(snippet, /if \(!ASSIST_KINDS\.has\(kind\)\) return \{ ok: false, error: "UNKNOWN_ASSIST_KIND" \};/);
  });

  it('returns {ok, kind} on success', () => {
    assert.match(snippet, /return \{ ok: true, kind \};/);
  });
});

// ══════════════════════════════════════════════════════
// 2. One-active-at-a-time + reversibility
// ══════════════════════════════════════════════════════

describe('Assist toolbox — replacement + cleanup', () => {
  it('applyAssist clears the previous assist before applying (one active at a time)', () => {
    assert.match(snippet, /if \(!ASSIST_KINDS\.has\(kind\)\) return \{ ok: false, error: "UNKNOWN_ASSIST_KIND" \};\s*\n\s*clearAssist\(\);/,
      'applyAssist must call clearAssist() first so applying replaces the previous mode');
  });

  it('clearAssist removes both the style element and the svg filter', () => {
    const block = snippet.match(/const clearAssist = \(\) => \{([\s\S]*?)\};/);
    assert.ok(block, 'clearAssist should be defined');
    assert.ok(block[1].includes('getElementById(ASSIST_STYLE_ID)'), 'clearAssist removes the assist style');
    assert.ok(block[1].includes('getElementById(ASSIST_SVG_ID)'), 'clearAssist removes the assist svg');
    assert.ok(block[1].includes('return { ok: true'), 'clearAssist returns {ok:true}');
  });

  it('applyAssist attaches no listeners and no timers', () => {
    const fnStart = snippet.indexOf('const clearAssist = ');
    const fnEnd = snippet.indexOf('const showTabPath =', fnStart);
    assert.ok(fnStart > -1 && fnEnd > fnStart, 'assist functions should be defined before showTabPath');
    const body = snippet.slice(fnStart, fnEnd);
    assert.ok(!body.includes('addEventListener'), 'assist code must not attach event listeners');
    assert.ok(!body.includes('setTimeout') && !body.includes('setInterval'), 'assist code must not use timers');
  });
});

// ══════════════════════════════════════════════════════
// 3. Mode payloads — text spacing, grayscale, CVD matrices
// ══════════════════════════════════════════════════════

describe('Assist toolbox — mode payloads', () => {
  it('textSpacing applies SC 1.4.12 minimums with !important', () => {
    assert.match(snippet, /line-height: 1\.5 !important; letter-spacing: 0\.12em !important; word-spacing: 0\.16em !important;/);
    assert.match(snippet, /p \{ margin-bottom: 2em !important; \}/);
  });

  it('grayscale applies an html-level grayscale filter', () => {
    assert.match(snippet, /html \{ filter: grayscale\(100%\) !important; \}/);
  });

  it('CVD kinds reference the hidden SVG filter from an html-level filter', () => {
    assert.match(snippet, /html \{ filter: url\(#\$\{ASSIST_CVD_FILTER_ID\}\) !important; \}/);
  });

  it('CVD svg is hidden (zero-size, aria-hidden) and uses feColorMatrix', () => {
    const fnStart = snippet.indexOf('const applyAssist = ');
    const fnEnd = snippet.indexOf('const showTabPath =', fnStart);
    const body = snippet.slice(fnStart, fnEnd);
    assert.ok(body.includes('svg.setAttribute("width", "0")'), 'svg width 0');
    assert.ok(body.includes('svg.setAttribute("height", "0")'), 'svg height 0');
    assert.ok(body.includes('svg.setAttribute("aria-hidden", "true")'), 'svg aria-hidden');
    assert.ok(body.includes('createElementNS(SVG_NS, "feColorMatrix")'), 'uses feColorMatrix');
    assert.ok(body.includes('matrix.setAttribute("type", "matrix")'), 'feColorMatrix type=matrix');
  });

  it('defines matrices for all four CVD kinds', () => {
    const block = snippet.match(/const ASSIST_CVD_MATRICES = \{([\s\S]*?)\n  \};/);
    assert.ok(block, 'snippet should define ASSIST_CVD_MATRICES');
    for (const kind of ['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia']) {
      assert.ok(block[1].includes(`${kind}:`), `matrix defined for ${kind}`);
    }
  });

  it('protanopia matrix starts with the standard first row values', () => {
    assert.match(snippet, /"0\.152286 1\.052583 -0\.204868 0 0 "/,
      'protanopia R\' row must be 0.152286 1.052583 -0.204868 (Machado/Brettel-derived)');
  });

  it('achromatopsia matrix uses Rec. 601 luminance weights on each channel row', () => {
    const achro = snippet.match(/achromatopsia:\s*\n([\s\S]*?)",\s*\n  \};/);
    assert.ok(achro, 'achromatopsia matrix present');
    const rows = [...achro[0].matchAll(/0\.299 0\.587 0\.114/g)];
    assert.equal(rows.length, 3, 'luminance weights repeated on all three channel rows');
  });
});

// ══════════════════════════════════════════════════════
// 4. SW message validation — APPLY_ASSIST
// ══════════════════════════════════════════════════════

describe('APPLY_ASSIST message validation', () => {
  const sender = { id: 'test-extension-id' };

  it('is registered in MESSAGE_TYPES', () => {
    assert.match(sw, /MESSAGE_TYPES = new Set\(\[[^\]]*"APPLY_ASSIST"[^\]]*\]\)/);
  });

  it('accepts every valid assist kind (plus "clear")', () => {
    const ctx = createSwContext();
    for (const kind of [...ASSIST_KINDS, 'clear']) {
      const result = ctx.__validateIncomingMessage({
        type: 'APPLY_ASSIST', tabId: 1, frameId: 0, kind,
      }, sender);
      assert.equal(result.ok, true, `kind "${kind}" should be accepted`);
    }
  });

  it('rejects an unknown kind', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'APPLY_ASSIST', tabId: 1, frameId: 0, kind: 'sepia',
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_KIND');
  });

  it('rejects a missing kind', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'APPLY_ASSIST', tabId: 1, frameId: 0,
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_KIND');
  });

  it('rejects a non-string kind', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'APPLY_ASSIST', tabId: 1, frameId: 0, kind: 42,
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_KIND');
  });

  it('rejects missing tabId', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'APPLY_ASSIST', frameId: 0, kind: 'grayscale',
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_TAB_ID');
  });

  it('rejects a negative tabId', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'APPLY_ASSIST', tabId: -1, frameId: 0, kind: 'grayscale',
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_TAB_ID');
  });

  it('rejects missing/invalid frameId', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'APPLY_ASSIST', tabId: 1, kind: 'grayscale',
    }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_FRAME_ID');
  });

  it('rejects unauthorized senders', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'APPLY_ASSIST', tabId: 1, frameId: 0, kind: 'grayscale',
    }, { id: 'evil-extension' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'UNAUTHORIZED_SENDER');
  });

  it('sw kind allowlist mirrors the snippet plus "clear"', () => {
    const block = sw.match(/const ASSIST_KINDS = new Set\(\[([\s\S]*?)\]\)/);
    assert.ok(block, 'sw.js should define ASSIST_KINDS');
    const kinds = [...block[1].matchAll(/"([^"]+)"/g)].map(m => m[1]).sort();
    assert.deepEqual(kinds, [...ASSIST_KINDS, 'clear'].sort());
  });

  it('sw handler reinjects accname+snippet files before applying (idempotent)', () => {
    const handlerStart = sw.indexOf('if (msg.type === "APPLY_ASSIST") {', sw.indexOf('sendResponse'));
    assert.ok(handlerStart > -1, 'APPLY_ASSIST handler should exist');
    const handlerEnd = sw.indexOf('if (msg.type === "RUN_AUDIT")', handlerStart);
    const body = sw.slice(handlerStart, handlerEnd);
    assert.ok(body.includes('files: [ACCNAME_FILE, SNIPPET_FILE]'), 'handler injects snippet files');
    assert.ok(body.includes('api.applyAssist'), 'handler calls applyAssist in the frame');
    assert.ok(body.includes('api.clearAssist'), 'handler supports clear via clearAssist');
    assert.ok(body.includes('__flowlens_assist_style__'), 'clear falls back to direct style removal');
    assert.ok(body.includes('__flowlens_assist_svg__'), 'clear falls back to direct svg removal');
  });
});

// ══════════════════════════════════════════════════════
// 5. Panel wiring — Assist bar
// ══════════════════════════════════════════════════════

describe('Panel assist bar', () => {
  it('panel.html has an Assist details row with a button per kind plus Clear', () => {
    assert.match(panelHtml, /<details class="assistBar" id="assistBar">/);
    for (const kind of [...ASSIST_KINDS, 'clear']) {
      assert.match(panelHtml, new RegExp(`data-assist="${kind}"`), `button for "${kind}" present`);
    }
  });

  it('assist buttons are real <button type="button"> elements (keyboard-accessible)', () => {
    const buttons = [...panelHtml.matchAll(/<button[^>]*data-assist="[^"]+"[^>]*>/g)];
    assert.equal(buttons.length, ASSIST_KINDS.length + 1);
    for (const b of buttons) {
      assert.ok(b[0].includes('type="button"'), `assist button is type=button: ${b[0]}`);
    }
  });

  it('toggle buttons carry aria-pressed state (Clear excluded)', () => {
    const pressed = [...panelHtml.matchAll(/data-assist="([^"]+)"[^>]*aria-pressed="false"/g)].map(m => m[1]).sort();
    assert.deepEqual(pressed, [...ASSIST_KINDS].sort());
  });

  it('panel sends APPLY_ASSIST via send() targeting bestFrameId ?? 0', () => {
    assert.match(panel, /send\(\{ type: "APPLY_ASSIST", frameId: state\.bestFrameId \?\? 0, kind \}\)/);
  });

  it('wired via addEventListener (CSP-safe, no inline handlers)', () => {
    assert.match(panel, /els\.assistBar\.addEventListener\("click"/);
    assert.ok(!panelHtml.includes('onclick='), 'no inline handlers in panel.html');
  });

  it('only one button is pressed at a time; Clear resets all', () => {
    assert.match(panel, /b\.setAttribute\("aria-pressed", String\(b\.dataset\.assist === activeKind\)\)/);
    assert.match(panel, /setAssistPressed\(kind === "clear" \? null : kind\)/);
  });

  it('toasts on failure', () => {
    assert.match(panel, /toast\(`Assist failed \(\$\{res\?\.error \|\| "unknown"\}\)`\)/);
    assert.match(panel, /toast\("Assist failed \(runtime unavailable\)"\)/);
  });
});
