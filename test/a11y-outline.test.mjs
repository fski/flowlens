/**
 * A11y outline (screen-reader view snapshot + per-step diff) — inspired by
 * aria-devtools (concept only; implemented natively).
 *
 * Structural tests against the snippet source (api exposure, caps, role map,
 * hidden skip), harness tests for the pure diffA11yOutlines engine function,
 * GET_A11Y_OUTLINE message validation in sw.js, panel capture/persistence/
 * drill-down wiring, and the HTML report "SR changes" column.
 *
 * Follows the conventions of page-structure.test.mjs.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSwContext } from './sw-harness.mjs';
import { createContext } from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPET_PATH = join(__dirname, '..', 'src', 'snippet', 'a11y-audit-snippet.js');
const SW_PATH = join(__dirname, '..', 'src', 'sw', 'sw.js');
const PANEL_PATH = join(__dirname, '..', 'src', 'panel', 'panel.js');
const SIG_ENGINE_PATH = join(__dirname, '..', 'src', 'panel', 'signature-engine.js');

const snippet = readFileSync(SNIPPET_PATH, 'utf8');
const sw = readFileSync(SW_PATH, 'utf8');
const panel = readFileSync(PANEL_PATH, 'utf8');
const sigEngine = readFileSync(SIG_ENGINE_PATH, 'utf8');

// The a11y outline block in the snippet (role map + collector)
const outlineBlock = (() => {
  const start = snippet.indexOf('// ---------------- A11y outline (screen-reader view snapshot) ----------------');
  const end = snippet.indexOf('Tab-stops path overlay', start);
  assert.ok(start > -1 && end > start, 'a11y outline block should exist before the tab path overlay');
  return snippet.slice(start, end);
})();

// ══════════════════════════════════════════════════════
// 1. Snippet API exposure + caps
// ══════════════════════════════════════════════════════

describe('A11y outline — snippet API', () => {
  it('getA11yOutline is defined and exposed on the api object (plus lastA11yOutline)', () => {
    assert.match(snippet, /const getA11yOutline = \(\) =>/);
    assert.match(snippet, /^\s+getA11yOutline,$/m, 'api exposes getA11yOutline');
    assert.match(snippet, /^\s+lastA11yOutline: null,$/m, 'api caches lastA11yOutline');
  });

  it('caps the outline at 400 nodes and reports truncation', () => {
    assert.match(snippet, /const MAX_A11Y_OUTLINE_NODES = 400;/);
    assert.ok(outlineBlock.includes('nodes.length >= MAX_A11Y_OUTLINE_NODES'), 'node cap enforced');
    assert.ok(outlineBlock.includes('truncated = true'), 'truncation reported');
    assert.ok(outlineBlock.includes('{ nodes, truncated, count: nodes.length }'), 'returns {nodes, truncated, count}');
  });

  it('traverses open shadow roots with the same scope collector as run()', () => {
    assert.ok(outlineBlock.includes('collectScopesWithCoverage(doc.documentElement)'),
      'must reuse collectScopesWithCoverage for shadow traversal');
  });
});

// ══════════════════════════════════════════════════════
// 2. Role map + node shape
// ══════════════════════════════════════════════════════

describe('A11y outline — role map', () => {
  it('has the implicit tag → role map (a[href]=link, button, select, textarea, img, table, h1-h6=heading)', () => {
    assert.ok(outlineBlock.includes('A11Y_OUTLINE_TAG_ROLES'), 'tag role map present');
    assert.ok(outlineBlock.includes('el.hasAttribute("href") ? "link" : null'), 'a[href] maps to link, bare <a> excluded');
    assert.match(outlineBlock, /button: "button"/);
    assert.match(outlineBlock, /select: "combobox"/);
    assert.match(outlineBlock, /textarea: "textbox"/);
    assert.match(outlineBlock, /img: "img"/);
    assert.match(outlineBlock, /table: "table"/);
    assert.match(outlineBlock, /h1: "heading", h2: "heading", h3: "heading",\s*\n\s*h4: "heading", h5: "heading", h6: "heading",/);
  });

  it('resolves <input> roles by type (checkbox/radio/slider/…) with textbox fallback and hidden excluded', () => {
    assert.ok(outlineBlock.includes('A11Y_OUTLINE_INPUT_ROLES'), 'input role map present');
    assert.match(outlineBlock, /checkbox: "checkbox", radio: "radio", range: "slider"/);
    assert.match(outlineBlock, /number: "spinbutton", search: "searchbox"/);
    assert.ok(outlineBlock.includes('if (type === "hidden") return null;'), 'input[type=hidden] excluded');
    assert.ok(outlineBlock.includes('A11Y_OUTLINE_INPUT_ROLES[type] || "textbox"'), 'textbox fallback');
  });

  it('explicit role attributes win; landmark tags resolve via computeLandmarkRole', () => {
    assert.ok(outlineBlock.includes('el.getAttribute("role")'), 'reads explicit role');
    assert.ok(outlineBlock.includes('return computeLandmarkRole(el);'), 'landmarks reuse computeLandmarkRole');
    assert.ok(outlineBlock.includes('explicit === "navigation" ? "nav" : explicit'), 'role=navigation normalized like landmarks');
  });

  it('selector covers headings, links, form controls, images, tables, explicit roles and landmarks', () => {
    assert.ok(outlineBlock.includes(
      '"h1,h2,h3,h4,h5,h6,a[href],button,input,select,textarea,img,table,[role]," +'),
      'outline selector present');
    assert.ok(outlineBlock.includes('LANDMARK_SELECTOR'), 'landmark selector reused');
  });

  it('per node: name via getAccName + txt(...,60), heading level, landmark depth capped at 3, fnv1a pathHash', () => {
    assert.ok(outlineBlock.includes('name: txt(getAccName(el), 60)'), 'name uses getAccName truncated to 60');
    assert.ok(outlineBlock.includes('level: role === "heading" ? headingLevel(el) : 0'), 'heading level');
    assert.match(snippet, /const MAX_A11Y_OUTLINE_DEPTH = 3;/);
    assert.ok(outlineBlock.includes('depth < MAX_A11Y_OUTLINE_DEPTH'), 'depth capped');
    assert.ok(outlineBlock.includes('pathHash: steFnv1aHash8(cssPath(el))'), 'pathHash = fnv1a of cssPath');
  });
});

// ══════════════════════════════════════════════════════
// 3. Hidden nodes are skipped entirely
// ══════════════════════════════════════════════════════

describe('A11y outline — hidden skip', () => {
  it('skips display:none / zero-rect elements via isHidden', () => {
    assert.ok(outlineBlock.includes('if (isHidden(el)) continue;'), 'isHidden skip present');
  });

  it('skips aria-hidden elements including via ancestors', () => {
    assert.ok(outlineBlock.includes(`el.closest("[aria-hidden='true']")`), 'aria-hidden ancestor skip present');
  });
});

// ══════════════════════════════════════════════════════
// 4. Pure diff engine — diffA11yOutlines
// ══════════════════════════════════════════════════════

describe('diffA11yOutlines (signature-engine)', () => {
  const ctx = createContext();
  const btn = (name) => ({ r: 'button', n: name, l: 0, h: 'aabbccdd' });
  // vm-context objects have foreign prototypes — normalize before deepEqual
  const plain = (x) => JSON.parse(JSON.stringify(x));

  it('is defined in signature-engine.js (pure module, no DOM access)', () => {
    assert.match(sigEngine, /function diffA11yOutlines\(prevNodes, currNodes\)/);
    assert.match(sigEngine, /const MAX_A11Y_OUTLINE_DIFF_ENTRIES = 50;/);
  });

  it('empty → empty produces an empty diff', () => {
    const d = ctx.diffA11yOutlines([], []);
    assert.deepEqual(plain(d), { added: [], removed: [], addedCount: 0, removedCount: 0 });
  });

  it('tolerates null/undefined/malformed input', () => {
    const d = ctx.diffA11yOutlines(null, undefined);
    assert.deepEqual(plain(d), { added: [], removed: [], addedCount: 0, removedCount: 0 });
    const d2 = ctx.diffA11yOutlines([null, 'x', 42], [btn('Save')]);
    assert.equal(d2.addedCount, 1);
    assert.equal(d2.removedCount, 0);
  });

  it('detects added and removed nodes', () => {
    const prev = [btn('Save'), { r: 'heading', n: 'Cart', l: 2, h: '11111111' }];
    const curr = [btn('Save'), { r: 'link', n: 'Checkout', l: 0, h: '22222222' }];
    const d = ctx.diffA11yOutlines(prev, curr);
    assert.deepEqual(plain(d.added), [{ r: 'link', n: 'Checkout', l: 0, count: 1 }]);
    assert.deepEqual(plain(d.removed), [{ r: 'heading', n: 'Cart', l: 2, count: 1 }]);
    assert.equal(d.addedCount, 1);
    assert.equal(d.removedCount, 1);
  });

  it('is a multiset diff: two identical buttons appearing → one entry with count 2', () => {
    const d = ctx.diffA11yOutlines([btn('Delete')], [btn('Delete'), btn('Delete'), btn('Delete')]);
    assert.deepEqual(plain(d.added), [{ r: 'button', n: 'Delete', l: 0, count: 2 }]);
    assert.equal(d.addedCount, 2);
    assert.equal(d.removedCount, 0);
  });

  it('is order-independent: reordering identical nodes produces no diff', () => {
    const a = [btn('One'), btn('Two'), { r: 'heading', n: 'T', l: 1, h: 'x' }];
    const b = [{ r: 'heading', n: 'T', l: 1, h: 'y' }, btn('Two'), btn('One')];
    const d = ctx.diffA11yOutlines(a, b);
    assert.equal(d.addedCount, 0);
    assert.equal(d.removedCount, 0);
  });

  it('keys by (role|name|level): same name at different heading levels differs', () => {
    const d = ctx.diffA11yOutlines(
      [{ r: 'heading', n: 'Results', l: 2, h: 'a' }],
      [{ r: 'heading', n: 'Results', l: 3, h: 'a' }],
    );
    assert.equal(d.addedCount, 1);
    assert.equal(d.removedCount, 1);
  });

  it('accepts both the compact stored form ({r,n,l}) and the full snippet form ({role,name,level})', () => {
    const d = ctx.diffA11yOutlines(
      [{ role: 'button', name: 'Save', level: 0, pathHash: 'ff' }],
      [{ r: 'button', n: 'Save', l: 0, h: 'ff' }],
    );
    assert.equal(d.addedCount, 0);
    assert.equal(d.removedCount, 0);
  });

  it('caps returned lists at 50 entries but keeps full counts', () => {
    const curr = [];
    for (let i = 0; i < 60; i++) curr.push({ r: 'link', n: `Link ${i}`, l: 0, h: `${i}` });
    const d = ctx.diffA11yOutlines([], curr);
    assert.equal(d.added.length, 50);
    assert.equal(d.addedCount, 60);
    const d2 = ctx.diffA11yOutlines(curr, []);
    assert.equal(d2.removed.length, 50);
    assert.equal(d2.removedCount, 60);
  });
});

// ══════════════════════════════════════════════════════
// 5. SW message validation — GET_A11Y_OUTLINE
// ══════════════════════════════════════════════════════

describe('GET_A11Y_OUTLINE message validation', () => {
  const sender = { id: 'test-extension-id' };

  it('is registered in MESSAGE_TYPES', () => {
    assert.match(sw, /MESSAGE_TYPES = new Set\(\[[^\]]*"GET_A11Y_OUTLINE"[^\]]*\]\)/);
  });

  it('accepts a valid GET_A11Y_OUTLINE message', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({ type: 'GET_A11Y_OUTLINE', tabId: 1, frameId: 0 }, sender);
    assert.equal(result.ok, true);
  });

  it('rejects missing/invalid tabId and frameId', () => {
    const ctx = createSwContext();
    const cases = [
      [{ type: 'GET_A11Y_OUTLINE', frameId: 0 }, 'BAD_TAB_ID'],
      [{ type: 'GET_A11Y_OUTLINE', tabId: -2, frameId: 0 }, 'BAD_TAB_ID'],
      [{ type: 'GET_A11Y_OUTLINE', tabId: 1 }, 'BAD_FRAME_ID'],
      [{ type: 'GET_A11Y_OUTLINE', tabId: 1, frameId: 'x' }, 'BAD_FRAME_ID'],
    ];
    for (const [msg, error] of cases) {
      const result = ctx.__validateIncomingMessage(msg, sender);
      assert.equal(result.ok, false, JSON.stringify(msg));
      assert.equal(result.error, error, JSON.stringify(msg));
    }
  });

  it('rejects unauthorized senders', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({ type: 'GET_A11Y_OUTLINE', tabId: 1, frameId: 0 }, { id: 'evil-extension' });
    assert.equal(result.ok, false);
    assert.equal(result.error, 'UNAUTHORIZED_SENDER');
  });

  it('handler mirrors GET_PAGE_STRUCTURE: reinjects the snippet files and returns {ok, outline}', () => {
    const start = sw.indexOf('if (msg.type === "GET_A11Y_OUTLINE") {', sw.indexOf('sendResponse'));
    assert.ok(start > -1, 'GET_A11Y_OUTLINE handler should exist');
    const end = sw.indexOf('if (msg.type === "SHOW_STRUCTURE")', start);
    const body = sw.slice(start, end);
    assert.ok(body.includes('files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE]'), 'handler injects snippet files');
    assert.ok(body.includes('api.getA11yOutline'), 'handler calls getA11yOutline in the frame');
    assert.ok(body.includes('{ ok: true, outline: api.getA11yOutline() }'), 'handler returns {ok, outline}');
    assert.ok(body.includes('FRAME_INACCESSIBLE'), 'handler reports inaccessible frames');
  });
});

// ══════════════════════════════════════════════════════
// 6. Panel wiring — capture, persistence guard, drill-down
// ══════════════════════════════════════════════════════

describe('Panel a11y outline wiring', () => {
  it('captureStepOptionC requests the outline for the best frame after the audit captures', () => {
    const start = panel.indexOf('async function captureStepOptionC');
    const end = panel.indexOf('function downloadText', start);
    assert.ok(start > -1 && end > start, 'captureStepOptionC exists');
    const body = panel.slice(start, end);
    assert.ok(body.includes('send({ type: "GET_A11Y_OUTLINE", frameId: outlineFrameId })'), 'sends GET_A11Y_OUTLINE');
    assert.ok(body.includes('r?.run?.bestEntry?.frameId ?? state.bestFrameId ?? 0'), 'targets the best frame');
    assert.ok(body.includes('a11yOutline = null;'), 'outline failure leaves null');
    assert.match(body, /try \{[\s\S]*?GET_A11Y_OUTLINE[\s\S]*?\} catch/, 'outline fetch wrapped in try/catch (capture stays robust)');
    assert.ok(body.includes('a11yOutline,'), 'step carries a11yOutline');
  });

  it('stores the outline in compact form {r,n,l,h} capped at 400 nodes', () => {
    assert.match(panel, /const MAX_A11Y_OUTLINE_STORED_NODES = 400;/);
    assert.ok(panel.includes('.slice(0, MAX_A11Y_OUTLINE_STORED_NODES)'), 'stored node cap enforced');
    assert.match(panel, /r: String\(n\.role \|\| ""\)\.slice\(0, 40\)/, 'compact role');
    assert.match(panel, /n: txt\(n\.name \|\| "", 60\)/, 'compact name truncated');
    assert.match(panel, /l: asNumber\(n\.level, 0\) \|\| 0/, 'compact level');
    assert.match(panel, /h: String\(n\.pathHash \|\| ""\)\.slice\(0, 8\)/, 'compact path hash');
  });

  it('size guard prunes outlines from steps older than the last 10 when the session gets large', () => {
    assert.match(panel, /const A11Y_OUTLINE_KEEP_RECENT = 10;/);
    assert.match(panel, /function pruneSessionA11yOutlines\(session, keepRecent = A11Y_OUTLINE_KEEP_RECENT\)/);
    const guardIdx = panel.indexOf('estimatedBytes > MAX_SESSION_BYTES_ESTIMATE');
    assert.ok(guardIdx > -1);
    assert.ok(panel.includes('pruneSessionA11yOutlines(sessionState.current)'), 'pruning wired into capture size guard');
  });

  it('pruneSessionA11yOutlines drops outlines from old steps only (behavioral)', () => {
    const ctx = createContext();
    const mkStep = (i) => ({ index: i, a11yOutline: { nodes: [{ r: 'button', n: `B${i}`, l: 0, h: 'ff' }], count: 1 } });
    const session = { steps: Array.from({ length: 14 }, (_, i) => mkStep(i + 1)) };
    const removed = ctx.pruneSessionA11yOutlines(session);
    assert.equal(removed, 4);
    for (let i = 0; i < 4; i++) assert.equal(session.steps[i].a11yOutline, null);
    for (let i = 4; i < 14; i++) assert.ok(session.steps[i].a11yOutline);
    // idempotent + tolerates malformed sessions
    assert.equal(ctx.pruneSessionA11yOutlines(session), 0);
    assert.equal(ctx.pruneSessionA11yOutlines(null), 0);
    assert.equal(ctx.pruneSessionA11yOutlines({}), 0);
  });

  it('normalizeLoadedSession guards a11yOutline reads (old sessions load fine)', () => {
    const ctx = createContext();
    const loaded = ctx.normalizeLoadedSession({
      id: 's1', schemaVersion: 4,
      steps: [
        { index: 1 },                                   // pre-outline session step
        { index: 2, a11yOutline: 'garbage' },           // malformed
        { index: 3, a11yOutline: { nodes: [{ r: 'button', n: 'Ok', l: 0, h: 'ff' }], count: 1 } },
      ],
    });
    assert.equal(loaded.steps[0].a11yOutline, null);
    assert.equal(loaded.steps[1].a11yOutline, null);
    assert.equal(loaded.steps[2].a11yOutline.count, 1);
  });

  it('drill-down renders the "Screen reader view changes" block only when both steps carry outlines', () => {
    const start = panel.indexOf('function buildStepDrillDownData');
    const end = panel.indexOf('function renderStepDrillDown', start);
    const body = panel.slice(start, end);
    assert.ok(body.includes('step?.a11yOutline && Array.isArray(step.a11yOutline.nodes)'), 'current outline guarded');
    assert.ok(body.includes('prevStep?.a11yOutline && Array.isArray(prevStep.a11yOutline.nodes)'), 'previous outline guarded');
    assert.ok(body.includes('diffA11yOutlines(prevOutline.nodes, currOutline.nodes)'), 'uses the pure diff');
    assert.ok(panel.includes('a11yOutlineSectionHtml(data.outline, data.outlineDiff)'), 'section wired into drill-down html');
  });

  it('a11yOutlineSectionHtml escapes page-derived text and caps shown diff lines at 25 (behavioral)', () => {
    const ctx = createContext();
    const diff = {
      added: [{ r: 'button<img>', n: '<script>alert(1)</script>', l: 0, count: 2 }],
      removed: [{ r: 'link', n: 'Old & busted', l: 0, count: 1 }],
      addedCount: 2,
      removedCount: 1,
    };
    const html = ctx.a11yOutlineSectionHtml(null, diff);
    assert.ok(html.includes('Screen reader view changes (+2 / −1)'));
    assert.ok(!html.includes('<script>'), 'names escaped');
    assert.ok(html.includes('&lt;script&gt;'), 'names escaped via escapeHtml');
    assert.ok(html.includes('button&lt;img&gt;'), 'roles escaped');
    assert.ok(html.includes('Old &amp; busted'));
    assert.ok(html.includes('×2'), 'multiset count rendered');

    // Cap: 30 distinct additions → 25 shown + "…and 5 more"
    const many = { added: Array.from({ length: 30 }, (_, i) => ({ r: 'link', n: `L${i}`, l: 0, count: 1 })), removed: [], addedCount: 30, removedCount: 0 };
    const capped = ctx.a11yOutlineSectionHtml(null, many);
    assert.equal((capped.match(/srOutlineSignAdd/g) || []).length, 25);
    assert.ok(capped.includes('…and 5 more'));
  });

  it('a11yOutlineSectionHtml renders the "View outline" toggle with headings indented by level (behavioral)', () => {
    const ctx = createContext();
    const outline = {
      count: 3,
      nodes: [
        { r: 'heading', n: 'Top', l: 1, h: 'a' },
        { r: 'heading', n: 'Sub', l: 3, h: 'b' },
        { r: 'button', n: 'Go', l: 0, h: 'c' },
      ],
    };
    const html = ctx.a11yOutlineSectionHtml(outline, null);
    assert.ok(html.includes('<details class="srOutlineDetails">'), 'toggle is a native <details> (keyboard accessible)');
    assert.ok(html.includes('View outline (3 nodes)'));
    assert.ok(html.includes('padding-left:0px'), 'h1 not indented');
    assert.ok(html.includes('padding-left:28px'), 'h3 indented by (level-1)*14');
    assert.ok(html.includes('>h1</span>'), 'heading badge carries the level');
    assert.ok(html.includes('>button</span>'), 'non-heading badge is the role');
    // No outline data at all → no section (old sessions unchanged)
    assert.equal(ctx.a11yOutlineSectionHtml(null, null), '');
  });

  it('drill-down section markup is CSP-safe (no inline handlers)', () => {
    const start = panel.indexOf('function a11yOutlineDiffLineHtml');
    const end = panel.indexOf('function renderStepDrillDown', start);
    const body = panel.slice(start, end);
    assert.ok(!/on\w+=/.test(body), 'no inline event handlers');
  });
});

// ══════════════════════════════════════════════════════
// 7. HTML report — "SR changes" column
// ══════════════════════════════════════════════════════

describe('HTML report SR changes column', () => {
  const ctx = createContext();
  const base = () => ({
    title: 'Report',
    generatedAt: '2026-01-01T00:00:00.000Z',
    url: 'https://example.com',
    findings: [],
  });

  it('adds the column when steps carry outline diff counts', () => {
    const html = ctx.buildHtmlReport({
      ...base(),
      sessionSummary: {
        id: 'sess_x',
        steps: [
          { index: 1, label: 'A', route: 'r1', added: 0, fixed: 0, persisting: 0, blockingAdded: 0 },
          { index: 2, label: 'B', route: 'r2', added: 1, fixed: 0, persisting: 0, blockingAdded: 0, srAdded: 3, srRemoved: 2 },
        ],
      },
    });
    assert.ok(html.includes('<th>SR changes</th>'));
    assert.ok(html.includes('<td>+3/&minus;2</td>'), 'counts rendered as +N/−M');
    assert.ok(html.includes('<td>&mdash;</td>'), 'steps without counts render a dash');
  });

  it('is backwards compatible: no column when no step has outline counts', () => {
    const html = ctx.buildHtmlReport({
      ...base(),
      sessionSummary: {
        id: 'sess_y',
        steps: [{ index: 1, label: 'A', route: 'r1', added: 0, fixed: 0, persisting: 0, blockingAdded: 0 }],
      },
    });
    assert.ok(!html.includes('SR changes'));
    assert.ok(html.includes('Flow steps'));
  });

  it('panel report payload builder wires srAdded/srRemoved from step outlines', () => {
    assert.ok(panel.includes('out.srAdded = od.addedCount;'), 'payload carries srAdded');
    assert.ok(panel.includes('out.srRemoved = od.removedCount;'), 'payload carries srRemoved');
    assert.ok(panel.includes('diffA11yOutlines(prev.a11yOutline.nodes, s.a11yOutline.nodes)'), 'payload uses the pure diff');
  });
});
