/**
 * Guided checks (IGT-lite wizard) — semi-automated tests for undecidable rules.
 *
 * Harness tests for buildGuidedFinding (signature-engine.js), source-level
 * tests for the snippet candidate collector (api exposure, caps, generic-label
 * list), GET_GUIDED_CANDIDATES message validation in sw.js (sw-harness),
 * RULE_TO_WCAG metadata for the three GUIDED_* rules, and panel wiring
 * presence checks.
 *
 * Follows the source-level assertion style of page-structure.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createContext } from './harness.mjs';
import { createSwContext } from './sw-harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPET_PATH = join(__dirname, '..', 'src', 'snippet', 'a11y-audit-snippet.js');
const SW_PATH = join(__dirname, '..', 'src', 'sw', 'sw.js');
const PANEL_PATH = join(__dirname, '..', 'src', 'panel', 'panel.js');
const PANEL_HTML_PATH = join(__dirname, '..', 'src', 'panel', 'panel.html');
const SIG_ENGINE_PATH = join(__dirname, '..', 'src', 'panel', 'signature-engine.js');

const snippet = readFileSync(SNIPPET_PATH, 'utf8');
const sw = readFileSync(SW_PATH, 'utf8');
const panel = readFileSync(PANEL_PATH, 'utf8');
const panelHtml = readFileSync(PANEL_HTML_PATH, 'utf8');
const sigEngine = readFileSync(SIG_ENGINE_PATH, 'utf8');

const ctx = createContext();

// The guided-check block in the snippet (kinds + generic list + collector)
const guidedBlock = (() => {
  const start = snippet.indexOf('// ---------------- Guided checks (candidate collection) ----------------');
  const end = snippet.indexOf('const showTabPath =', start);
  assert.ok(start > -1 && end > start, 'guided checks block should exist before showTabPath');
  return snippet.slice(start, end);
})();

// ══════════════════════════════════════════════════════
// 1. buildGuidedFinding — pure finding builder (harness)
// ══════════════════════════════════════════════════════

describe('buildGuidedFinding — images', () => {
  const candidate = { name: 'photo.jpg', path: 'main > img:nth-of-type(2)', extra: { tag: 'img', role: null } };

  it('is a pure function defined in signature-engine.js', () => {
    assert.match(sigEngine, /function buildGuidedFinding\(kind, answer, candidate\)/);
    assert.equal(typeof ctx.buildGuidedFinding, 'function');
  });

  it('answer "no" → GUIDED_IMG_NAME_POOR (medium / strict / 1.1.1)', () => {
    const f = ctx.buildGuidedFinding('images', 'no', candidate);
    assert.ok(f, 'finding should be produced');
    assert.equal(f.type, 'GUIDED_IMG_NAME_POOR');
    assert.equal(f.severity, 'medium');
    assert.equal(f.confidence, 'strict');
    assert.equal(f.wcag, '1.1.1');
    assert.equal(f.level, 'A');
    assert.equal(f.name, 'photo.jpg');
    assert.equal(f.path, 'main > img:nth-of-type(2)');
    assert.equal(f.tag, 'img');
    assert.ok(f.note && f.note.length > 0, 'has an explanatory note');
  });

  it('answer "decorative" + non-empty name → GUIDED_IMG_DECORATIVE_NAMED (low / 1.1.1)', () => {
    const f = ctx.buildGuidedFinding('images', 'decorative', candidate);
    assert.ok(f, 'finding should be produced');
    assert.equal(f.type, 'GUIDED_IMG_DECORATIVE_NAMED');
    assert.equal(f.severity, 'low');
    assert.equal(f.wcag, '1.1.1');
    assert.equal(f.confidence, 'strict');
  });

  it('answer "decorative" + empty/whitespace name → null (nothing to fix)', () => {
    assert.equal(ctx.buildGuidedFinding('images', 'decorative', { name: '', path: 'img' }), null);
    assert.equal(ctx.buildGuidedFinding('images', 'decorative', { name: '   ', path: 'img' }), null);
    assert.equal(ctx.buildGuidedFinding('images', 'decorative', { path: 'img' }), null);
  });

  it('answer "yes" → null', () => {
    assert.equal(ctx.buildGuidedFinding('images', 'yes', candidate), null);
  });
});

describe('buildGuidedFinding — controls', () => {
  const candidate = { name: 'go', path: 'nav > a.cta', extra: { tag: 'a', role: null } };

  it('answer "no" → GUIDED_CONTROL_LABEL_VAGUE (medium / strict / 2.4.4)', () => {
    const f = ctx.buildGuidedFinding('controls', 'no', candidate);
    assert.ok(f, 'finding should be produced');
    assert.equal(f.type, 'GUIDED_CONTROL_LABEL_VAGUE');
    assert.equal(f.severity, 'medium');
    assert.equal(f.confidence, 'strict');
    assert.equal(f.wcag, '2.4.4');
    assert.equal(f.level, 'A');
    assert.equal(f.name, 'go');
    assert.equal(f.tag, 'a');
  });

  it('answer "yes" → null', () => {
    assert.equal(ctx.buildGuidedFinding('controls', 'yes', candidate), null);
  });

  it('"decorative" is not a control answer → null', () => {
    assert.equal(ctx.buildGuidedFinding('controls', 'decorative', candidate), null);
  });
});

describe('buildGuidedFinding — robustness + escaping safety', () => {
  it('unknown kind / answer / malformed candidate → null (no throw)', () => {
    assert.equal(ctx.buildGuidedFinding('headings', 'no', { name: 'x' }), null);
    assert.equal(ctx.buildGuidedFinding(null, 'no', null), null);
    assert.equal(ctx.buildGuidedFinding('images', 'maybe', {}), null);
    assert.equal(ctx.buildGuidedFinding('controls', undefined, undefined), null);
  });

  it('is deterministic and does not mutate the candidate', () => {
    const candidate = { name: 'go', path: 'a.x', extra: { tag: 'a' } };
    const snapshot = JSON.stringify(candidate);
    const a = ctx.buildGuidedFinding('controls', 'no', candidate);
    const b = ctx.buildGuidedFinding('controls', 'no', candidate);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
    assert.equal(JSON.stringify(candidate), snapshot, 'candidate unchanged');
  });

  it('hostile page-derived strings stay plain data and are escaped at render time', () => {
    const hostile = '<img src=x onerror=alert(1)>';
    const f = ctx.buildGuidedFinding('controls', 'no', { name: hostile, path: `a[title="${hostile}"]`, extra: { tag: 'a' } });
    assert.equal(f.name, hostile, 'name is carried verbatim (plain string, no interpretation)');
    const row = ctx.explorerRowHtml(f, 0);
    assert.ok(!row.includes('<img'), 'explorer row must not contain unescaped page HTML');
    assert.ok(row.includes('&lt;img'), 'explorer row escapes page-derived name');
  });

  it('records the guided answer in extra (in-memory provenance only)', () => {
    const f = ctx.buildGuidedFinding('images', 'no', { name: 'x', path: 'img' });
    assert.equal(f.extra.guided, true);
    assert.equal(f.extra.kind, 'images');
    assert.equal(f.extra.answer, 'no');
  });
});

// ══════════════════════════════════════════════════════
// 2. Snippet — api.getGuidedCandidates
// ══════════════════════════════════════════════════════

describe('Guided checks — snippet API', () => {
  it('getGuidedCandidates is defined and exposed on the api object (plus lastGuided)', () => {
    assert.match(snippet, /const getGuidedCandidates = \(kind\) =>/);
    assert.match(snippet, /^\s+getGuidedCandidates,$/m, 'api exposes getGuidedCandidates');
    assert.match(snippet, /^\s+lastGuided: null,$/m, 'api caches lastGuided');
  });

  it('rejects unknown kinds', () => {
    assert.match(snippet, /const GUIDED_KINDS = new Set\(\["images", "controls"\]\);/);
    assert.ok(guidedBlock.includes('if (!GUIDED_KINDS.has(kind)) return { ok: false, error: "UNKNOWN_GUIDED_KIND" };'));
  });

  it('caps candidates at 100 and reports truncation', () => {
    assert.match(snippet, /const MAX_GUIDED_CANDIDATES = 100;/);
    assert.ok(guidedBlock.includes('candidates.length >= MAX_GUIDED_CANDIDATES'), 'cap enforced');
    assert.ok(guidedBlock.includes('truncated = true'), 'truncation reported');
    assert.ok(guidedBlock.includes('{ ok: true, kind, candidates, truncated, count: candidates.length }'),
      'returns {ok, kind, candidates, truncated, count}');
  });

  it('generic control-label list contains the full documented set', () => {
    const listMatch = guidedBlock.match(/const GUIDED_GENERIC_LABELS = new Set\(\[([\s\S]*?)\]\);/);
    assert.ok(listMatch, 'GUIDED_GENERIC_LABELS defined');
    for (const label of ['click', 'here', 'more', 'read more', 'learn more', 'click here', 'go', 'link', 'button']) {
      assert.ok(listMatch[1].includes(`"${label}"`), `generic list includes "${label}"`);
    }
  });

  it('controls are candidates when the name is short (<=3 chars) or generic — empty excluded', () => {
    assert.ok(guidedBlock.includes('n.length <= 3 || GUIDED_GENERIC_LABELS.has(n)'), 'short-or-generic logic');
    assert.ok(guidedBlock.includes('if (!n) return false;'), 'empty names are not guided candidates');
    assert.ok(guidedBlock.includes('if (kind === "controls" && !isGuidedGenericName(name)) continue;'));
  });

  it('image candidates cover img, [role=img] and svg[aria-label]', () => {
    assert.ok(guidedBlock.includes(`"img,[role='img'],svg[aria-label]"`));
  });

  it('control candidates cover links, buttons, input buttons and role=button/link', () => {
    assert.ok(guidedBlock.includes(`"a[href],button,input[type='button'],input[type='submit'],input[type='reset'],"`));
    assert.ok(guidedBlock.includes(`"[role='button'],[role='link']"`));
  });

  it('reuses existing helpers: getAccName, cssPath, isHidden, shadow-aware scope collector', () => {
    assert.ok(guidedBlock.includes('collectScopesWithCoverage(doc.documentElement)'), 'shadow traversal reused');
    assert.ok(guidedBlock.includes('txt(getAccName(node), 120)'), 'accessible name via getAccName');
    assert.ok(guidedBlock.includes('path: cssPath(node)'), 'path via cssPath');
    assert.ok(guidedBlock.includes('if (isHidden(node)) continue;'), 'hidden elements skipped');
    assert.ok(guidedBlock.includes(`node.closest("[aria-hidden='true']")`), 'aria-hidden ancestors skipped');
  });

  it('is read-only and listener/timer free (no behavior change when unused)', () => {
    assert.ok(!guidedBlock.includes('addEventListener'), 'no listeners');
    assert.ok(!guidedBlock.includes('setTimeout') && !guidedBlock.includes('setInterval'), 'no timers');
    assert.ok(!guidedBlock.includes('innerHTML'), 'no innerHTML');
    assert.ok(!guidedBlock.includes('appendChild') && !guidedBlock.includes('createElement'), 'no DOM writes');
  });
});

// ══════════════════════════════════════════════════════
// 3. SW message validation — GET_GUIDED_CANDIDATES
// ══════════════════════════════════════════════════════

describe('GET_GUIDED_CANDIDATES message validation', () => {
  const sender = { id: 'test-extension-id' };

  it('is registered in MESSAGE_TYPES', () => {
    assert.match(sw, /MESSAGE_TYPES = new Set\(\[[^\]]*"GET_GUIDED_CANDIDATES"[^\]]*\]\)/);
  });

  it('sw kind allowlist mirrors the snippet', () => {
    assert.match(sw, /const GUIDED_KINDS = new Set\(\["images", "controls"\]\);/);
  });

  it('accepts valid messages for both kinds', () => {
    const swCtx = createSwContext();
    for (const kind of ['images', 'controls']) {
      const result = swCtx.__validateIncomingMessage({ type: 'GET_GUIDED_CANDIDATES', tabId: 1, frameId: 0, kind }, sender);
      assert.equal(result.ok, true, `kind "${kind}" should be accepted`);
    }
  });

  it('rejects missing/invalid tabId and frameId', () => {
    const swCtx = createSwContext();
    const cases = [
      [{ type: 'GET_GUIDED_CANDIDATES', frameId: 0, kind: 'images' }, 'BAD_TAB_ID'],
      [{ type: 'GET_GUIDED_CANDIDATES', tabId: -2, frameId: 0, kind: 'images' }, 'BAD_TAB_ID'],
      [{ type: 'GET_GUIDED_CANDIDATES', tabId: 1, kind: 'images' }, 'BAD_FRAME_ID'],
      [{ type: 'GET_GUIDED_CANDIDATES', tabId: 1, frameId: 'x', kind: 'images' }, 'BAD_FRAME_ID'],
    ];
    for (const [msg, error] of cases) {
      const result = swCtx.__validateIncomingMessage(msg, sender);
      assert.equal(result.ok, false, JSON.stringify(msg));
      assert.equal(result.error, error, JSON.stringify(msg));
    }
  });

  it('rejects unknown, missing and non-string kinds', () => {
    const swCtx = createSwContext();
    for (const kind of ['headings', 'image', '', 42, null, undefined]) {
      const result = swCtx.__validateIncomingMessage({ type: 'GET_GUIDED_CANDIDATES', tabId: 1, frameId: 0, kind }, sender);
      assert.equal(result.ok, false, `kind ${JSON.stringify(kind)} should be rejected`);
      assert.equal(result.error, 'BAD_KIND');
    }
  });

  it('rejects unauthorized senders', () => {
    const swCtx = createSwContext();
    const result = swCtx.__validateIncomingMessage(
      { type: 'GET_GUIDED_CANDIDATES', tabId: 1, frameId: 0, kind: 'images' },
      { id: 'evil-extension' }
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, 'UNAUTHORIZED_SENDER');
  });

  it('handler reinjects the snippet files and calls the api with the validated kind', () => {
    const start = sw.indexOf('if (msg.type === "GET_GUIDED_CANDIDATES") {', sw.indexOf('sendResponse'));
    assert.ok(start > -1, 'GET_GUIDED_CANDIDATES handler should exist');
    const end = sw.indexOf('if (msg.type === "SHOW_STRUCTURE")', start);
    const body = sw.slice(start, end);
    assert.ok(body.includes('files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE]'), 'handler injects snippet files');
    assert.ok(body.includes('api.getGuidedCandidates'), 'handler calls getGuidedCandidates in the frame');
    assert.ok(body.includes('args: [kind]'), 'kind passed as executeScript arg');
  });
});

// ══════════════════════════════════════════════════════
// 4. RULE_TO_WCAG metadata for GUIDED_* rules
// ══════════════════════════════════════════════════════

describe('RULE_TO_WCAG — GUIDED_* entries', () => {
  const expected = {
    GUIDED_IMG_NAME_POOR: '1.1.1',
    GUIDED_IMG_DECORATIVE_NAMED: '1.1.1',
    GUIDED_CONTROL_LABEL_VAGUE: '2.4.4',
  };

  it('all three GUIDED_* rules are mapped', () => {
    for (const rule of Object.keys(expected)) {
      assert.ok(ctx.__RULE_TO_WCAG[rule], `${rule} should be in RULE_TO_WCAG`);
    }
  });

  it('entries conform to rule-metadata constraints (criterion, level, confidence, depthLevel)', () => {
    const critSet = new Set(ctx.__WCAG_CRITERIA.map(c => c.criterion));
    for (const [rule, criterion] of Object.entries(expected)) {
      const m = ctx.__RULE_TO_WCAG[rule];
      assert.equal(m.criterion, criterion, `${rule} criterion`);
      assert.ok(critSet.has(m.criterion), `${rule} criterion is a valid WCAG criterion`);
      assert.equal(m.level, 'A', `${rule} level`);
      assert.equal(m.confidence, 'strict', `${rule} confidence (user-confirmed)`);
      assert.ok([1, 2, 3].includes(m.depthLevel), `${rule} depthLevel valid`);
      assert.equal(m.depthLevel, 1, `${rule} depthLevel 1 — depth filtering never hides user-confirmed findings`);
    }
  });

  it('map stays alphabetically sorted after the GUIDED_* additions', () => {
    const keys = Object.keys(ctx.__RULE_TO_WCAG);
    for (let i = 1; i < keys.length; i++) {
      assert.ok(keys[i - 1] < keys[i], `RULE_TO_WCAG out of order: ${keys[i - 1]} before ${keys[i]}`);
    }
  });

  it('strict + medium guided findings classify as blocking (isRunFindingBlocking)', () => {
    const f = ctx.buildGuidedFinding('controls', 'no', { name: 'go', path: 'a.x' });
    assert.equal(ctx.isRunFindingBlocking(f), true);
    const low = ctx.buildGuidedFinding('images', 'decorative', { name: 'x', path: 'img' });
    assert.equal(ctx.isRunFindingBlocking(low), false, 'low severity is not blocking');
  });
});

// ══════════════════════════════════════════════════════
// 5. Panel wiring — Guided checks section + wizard
// ══════════════════════════════════════════════════════

describe('Panel guided checks section', () => {
  it('panel.html has the Guided checks collapsible with starters + wizard elements', () => {
    assert.match(panelHtml, /<details class="assistBar guidedBar" id="guidedSection">/);
    assert.match(panelHtml, /<summary class="assistSummary">Guided checks<\/summary>/);
    for (const id of [
      'guidedStartImages', 'guidedStartControls', 'guidedCancel',
      'guidedWizard', 'guidedStatus', 'guidedCandidate', 'guidedQuestion', 'guidedAnswers',
    ]) {
      assert.ok(panelHtml.includes(`id="${id}"`), `element #${id} present`);
    }
  });

  it('starter/cancel buttons are real <button type="button"> elements (keyboard-accessible)', () => {
    for (const id of ['guidedStartImages', 'guidedStartControls', 'guidedCancel']) {
      const m = panelHtml.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
      assert.ok(m, `#${id} is a <button>`);
      assert.ok(m[0].includes('type="button"'), `#${id} is type=button`);
    }
    assert.ok(!panelHtml.includes('onclick='), 'no inline handlers in panel.html (CSP-safe)');
  });

  it('progress status is an aria-live region ("Candidate 3 of 12")', () => {
    const m = panelHtml.match(/<p[^>]*id="guidedStatus"[^>]*>/);
    assert.ok(m, '#guidedStatus present');
    assert.ok(m[0].includes('role="status"'), 'role=status');
    assert.ok(m[0].includes('aria-live="polite"'), 'aria-live polite');
    assert.ok(panel.includes('`Candidate ${guidedState.index + 1} of ${total}`'), 'panel writes candidate counter');
  });

  it('panel sends GET_GUIDED_CANDIDATES via send() targeting bestFrameId ?? 0', () => {
    assert.match(panel, /send\(\{ type: "GET_GUIDED_CANDIDATES", frameId: state\.bestFrameId \?\? 0, kind \}\)/);
  });

  it('wizard highlights candidates through the existing highlight flow', () => {
    assert.ok(panel.includes('await highlightFinding(buildGuidedHighlightPayload(c), state._activeHighlightCtx)'));
  });

  it('answer buttons are dynamically created real <button>s with textContent (no page HTML)', () => {
    const start = panel.indexOf('function renderGuidedAnswerButtons');
    const end = panel.indexOf('function renderGuidedStep', start);
    assert.ok(start > -1 && end > start, 'renderGuidedAnswerButtons exists');
    const body = panel.slice(start, end);
    assert.ok(body.includes('document.createElement("button")'));
    assert.ok(body.includes('btn.type = "button"'));
    assert.ok(!body.includes('innerHTML'), 'no innerHTML in answer rendering');
  });

  it('candidate info renders page-derived strings only via textContent', () => {
    const start = panel.indexOf('function renderGuidedStep');
    const end = panel.indexOf('function buildGuidedHighlightPayload', start);
    assert.ok(start > -1 && end > start, 'renderGuidedStep exists');
    const body = panel.slice(start, end);
    assert.ok(!body.includes('innerHTML'), 'no innerHTML for candidate name/path');
    assert.ok(body.includes('.textContent ='), 'uses textContent');
  });

  it('wired via addEventListener (CSP-safe), including answer delegation', () => {
    assert.match(panel, /els\.guidedStartImages\.addEventListener\("click"/);
    assert.match(panel, /els\.guidedStartControls\.addEventListener\("click"/);
    assert.match(panel, /els\.guidedCancel\.addEventListener\("click"/);
    assert.match(panel, /els\.guidedAnswers\.addEventListener\("click"/);
    assert.match(panel, /button\[data-guided-answer\]/);
  });

  it('has FIX_SUGGESTIONS entries for all three GUIDED_* rules', () => {
    for (const rule of ['GUIDED_IMG_NAME_POOR', 'GUIDED_IMG_DECORATIVE_NAMED', 'GUIDED_CONTROL_LABEL_VAGUE']) {
      assert.ok(new RegExp(`^\\s+${rule}:`, 'm').test(panel), `FIX_SUGGESTIONS has ${rule}`);
    }
    const f = ctx.buildGuidedFinding('controls', 'no', { name: 'go', path: 'a.x' });
    const [withFix] = ctx.applyFixSuggestions([f]);
    assert.ok(withFix.fix && withFix.fix.includes('go'), 'fix suggestion generated for guided finding');
  });

  it('is cancelable and re-runnable (resetGuidedWizard restores the idle state)', () => {
    assert.match(panel, /function resetGuidedWizard\(\)/);
    const start = panel.indexOf('function resetGuidedWizard');
    const end = panel.indexOf('function renderGuidedAnswerButtons', start);
    const body = panel.slice(start, end);
    assert.ok(body.includes('guidedState.active = false'));
    assert.ok(body.includes('guidedState.candidates = []'));
    assert.ok(body.includes('setGuidedStartersDisabled(false)'));
    assert.ok(panel.includes('{ value: "skip", label: "Skip" }'), 'per-candidate Skip answer available');
  });
});

// ══════════════════════════════════════════════════════
// 6. Merge into the explorer view (harness)
// ══════════════════════════════════════════════════════

describe('mergeGuidedFindings — explorer integration', () => {
  it('appends into state.findingsByMode.run (created if absent) and refilters', () => {
    const mctx = createContext();
    assert.equal(mctx.state.findingsByMode.run, undefined, 'no run findings before merge');
    const f = mctx.buildGuidedFinding('controls', 'no', { name: 'go', path: 'nav > a.cta', extra: { tag: 'a' } });
    // Rendering helpers that live past the wire-up marker are unavailable in
    // the harness — state mutations happen first and are what we assert on.
    try { mctx.mergeGuidedFindings([f]); } catch { /* render path needs real DOM */ }
    assert.ok(Array.isArray(mctx.state.findingsByMode.run), 'run bucket created');
    assert.equal(mctx.state.findingsByMode.run.length, 1);
    assert.equal(mctx.state.findingsByMode.run[0].type, 'GUIDED_CONTROL_LABEL_VAGUE');
    assert.equal(mctx.state.currentFindings.length, 1, 'current findings refiltered via applyAllFindingFilters');
  });

  it('appends to existing run findings without replacing them', () => {
    const mctx = createContext();
    mctx.state.findingsByMode.run = [{ type: 'IMG_MISSING_ALT', severity: 'medium', wcag: '1.1.1' }];
    const f = mctx.buildGuidedFinding('images', 'no', { name: 'pic', path: 'img', extra: { tag: 'img' } });
    try { mctx.mergeGuidedFindings([f]); } catch { /* render path needs real DOM */ }
    assert.equal(mctx.state.findingsByMode.run.length, 2);
    assert.equal(mctx.state.findingsByMode.run[0].type, 'IMG_MISSING_ALT');
    assert.equal(mctx.state.findingsByMode.run[1].type, 'GUIDED_IMG_NAME_POOR');
  });

  it('empty / non-array input is a no-op', () => {
    const mctx = createContext();
    mctx.mergeGuidedFindings([]);
    mctx.mergeGuidedFindings(null);
    assert.equal(mctx.state.findingsByMode.run, undefined);
  });

  it('rerenders through the existing pipeline (rerenderFindings + severity tabs)', () => {
    const start = panel.indexOf('function mergeGuidedFindings');
    assert.ok(start > -1);
    const end = panel.indexOf('// ═══ WEIGHTED SCORE CHIP', start);
    const body = panel.slice(start, end);
    assert.ok(body.includes('applyAllFindingFilters(state.findingsByMode.run)'), 'depth/rule-pack filters applied');
    assert.ok(body.includes('rerenderFindings("guided_checks")'), 'existing rerender pipeline used');
    assert.ok(body.includes('showMode("run")'), 'run explorer view shown');
  });
});
