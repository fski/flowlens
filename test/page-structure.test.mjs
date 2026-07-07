/**
 * Page structure (landmarks + headings) — inspired by matatk/landmarks and
 * headingsMap (concepts only; implemented natively).
 *
 * Structural tests against the snippet source (api exposure, caps,
 * level_skip / duplicate_unlabeled logic, shadow traversal, overlay safety),
 * GET_PAGE_STRUCTURE / SHOW_STRUCTURE message validation in sw.js, and
 * panel wiring presence checks.
 *
 * Follows the source-level assertion style of assist-modes.test.mjs.
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

// The full page-structure block in the snippet (collection + overlay)
const structureBlock = (() => {
  const start = snippet.indexOf('// ---------------- Page structure (landmarks + headings) ----------------');
  const end = snippet.indexOf('const showTabPath =', start);
  assert.ok(start > -1 && end > start, 'page structure block should exist before showTabPath');
  return snippet.slice(start, end);
})();

// ══════════════════════════════════════════════════════
// 1. Snippet API exposure
// ══════════════════════════════════════════════════════

describe('Page structure — snippet API', () => {
  it('getPageStructure / showStructureOverlay / clearStructureOverlay are defined', () => {
    assert.match(snippet, /const getPageStructure = \(\) =>/);
    assert.match(snippet, /const showStructureOverlay = \(kind\) =>/);
    assert.match(snippet, /const clearStructureOverlay = \(\) =>/);
  });

  it('all three are exposed on the api object (plus lastStructure)', () => {
    assert.match(snippet, /^\s+getPageStructure,$/m, 'api exposes getPageStructure');
    assert.match(snippet, /^\s+showStructureOverlay,$/m, 'api exposes showStructureOverlay');
    assert.match(snippet, /^\s+clearStructureOverlay,$/m, 'api exposes clearStructureOverlay');
    assert.match(snippet, /^\s+lastStructure: null,$/m, 'api caches lastStructure');
  });

  it('uses a dedicated overlay container id', () => {
    assert.match(snippet, /const STRUCTURE_CONTAINER_ID = "__flowlens_structure__"/);
  });

  it('returns the documented summary shape', () => {
    for (const key of ['h1Count:', 'headingCount:', 'landmarkCount:', 'issues: issueCount']) {
      assert.ok(structureBlock.includes(key), `summary includes ${key}`);
    }
  });
});

// ══════════════════════════════════════════════════════
// 2. Caps + shadow traversal
// ══════════════════════════════════════════════════════

describe('Page structure — caps and shadow DOM traversal', () => {
  it('caps headings at 200 and landmarks at 100', () => {
    assert.match(snippet, /const MAX_STRUCTURE_HEADINGS = 200;/);
    assert.match(snippet, /const MAX_STRUCTURE_LANDMARKS = 100;/);
    assert.ok(structureBlock.includes('headings.length >= MAX_STRUCTURE_HEADINGS'), 'heading cap enforced');
    assert.ok(structureBlock.includes('landmarks.length >= MAX_STRUCTURE_LANDMARKS'), 'landmark cap enforced');
    assert.ok(structureBlock.includes('headingsCapped'), 'heading cap reported');
    assert.ok(structureBlock.includes('landmarksCapped'), 'landmark cap reported');
  });

  it('traverses open shadow roots with the same scope collector as run()', () => {
    assert.ok(structureBlock.includes('collectScopesWithCoverage(doc.documentElement)'),
      'must reuse collectScopesWithCoverage for shadow traversal');
    assert.ok(!structureBlock.includes('_scopeCache ='),
      'must not mutate the per-run scope cache (no behavior change for audits)');
  });

  it('skips hidden elements like the audit scan does', () => {
    const hits = structureBlock.match(/if \(isHidden\(el\)\) continue;/g) || [];
    assert.ok(hits.length >= 2, 'both heading and landmark collection skip hidden elements');
  });
});

// ══════════════════════════════════════════════════════
// 3. Heading levels + level_skip logic
// ══════════════════════════════════════════════════════

describe('Page structure — headings', () => {
  it('derives the level from the tag or role=heading + aria-level (default 2)', () => {
    assert.match(snippet, /\/\^H\(\[1-6\]\)\$\/\.exec\(el\.tagName/);
    assert.ok(structureBlock.includes('parseInt(el.getAttribute("aria-level")'), 'reads aria-level');
    assert.ok(structureBlock.includes('lvl >= 1 && lvl <= 6 ? lvl : 2'), 'defaults role=heading to level 2');
    assert.ok(structureBlock.includes(`"h1,h2,h3,h4,h5,h6,[role='heading']"`), 'selector covers tags and role=heading');
  });

  it('flags level_skip when the level jumps by more than one', () => {
    assert.ok(structureBlock.includes('if (prevLevel != null && level > prevLevel + 1) issues.push("level_skip");'),
      'level_skip issue logic present');
  });

  it('truncates heading text to 80 chars via txt()', () => {
    assert.ok(structureBlock.includes('txt(el.textContent, 80)'));
  });

  it('records a cssPath for each heading and landmark', () => {
    const hits = structureBlock.match(/path: cssPath\(el\)/g) || [];
    assert.equal(hits.length, 2);
  });
});

// ══════════════════════════════════════════════════════
// 4. Landmarks + duplicate_unlabeled logic
// ══════════════════════════════════════════════════════

describe('Page structure — landmarks', () => {
  it('computes roles from tags and role attributes (allowlist)', () => {
    assert.match(snippet, /const LANDMARK_ROLES = new Set\(\[\s*"main", "nav", "banner", "contentinfo", "complementary", "region", "form", "search",\s*\]\);/);
    assert.ok(structureBlock.includes('if (explicit === "navigation") return "nav";'), 'role=navigation maps to nav');
    assert.ok(structureBlock.includes('if (tag === "aside") return "complementary";'), 'aside maps to complementary');
    assert.ok(structureBlock.includes('return tag === "header" ? "banner" : "contentinfo";'), 'header/footer map to banner/contentinfo');
  });

  it('header/footer are landmarks only outside sectioning content', () => {
    assert.ok(structureBlock.includes('el.closest("article, aside, main, nav, section")'),
      'scoped header/footer must not be treated as banner/contentinfo');
  });

  it('form/section are landmarks only when labeled', () => {
    assert.ok(structureBlock.includes('if (tag === "form") return landmarkLabel(el) ? "form" : null;'));
    assert.ok(structureBlock.includes('if (tag === "section") return landmarkLabel(el) ? "region" : null;'));
  });

  it('resolves labels from aria-label and aria-labelledby', () => {
    assert.ok(structureBlock.includes('el.getAttribute("aria-label")'));
    assert.ok(structureBlock.includes('el.getAttribute("aria-labelledby")'));
  });

  it('flags duplicate_unlabeled when a role repeats without distinct labels', () => {
    assert.ok(structureBlock.includes('if (group.length < 2) continue;'),
      'single-instance roles are never flagged');
    assert.ok(structureBlock.includes('if (lm.label == null || labelCounts.get(key) > 1) lm.issues.push("duplicate_unlabeled");'),
      'duplicate_unlabeled issue logic present');
  });
});

// ══════════════════════════════════════════════════════
// 5. Overlay behavior + safety
// ══════════════════════════════════════════════════════

describe('Page structure — overlay', () => {
  it('rejects unknown kinds', () => {
    assert.match(snippet, /const STRUCTURE_KINDS = new Set\(\["headings", "landmarks"\]\);/);
    assert.ok(structureBlock.includes('if (!STRUCTURE_KINDS.has(kind)) return { ok: false, error: "UNKNOWN_STRUCTURE_KIND" };'));
  });

  it('is idempotent (clears the previous overlay first)', () => {
    assert.match(structureBlock, /return \{ ok: false, error: "UNKNOWN_STRUCTURE_KIND" \};\s*\n\s*clearStructureOverlay\(\);/);
  });

  it('clearAnnotations also removes the structure overlay', () => {
    const block = snippet.match(/const clearAnnotations = \(\) => \{([\s\S]*?)\};/);
    assert.ok(block, 'clearAnnotations should be defined');
    assert.ok(block[1].includes('clearStructureOverlay()'), 'clearAnnotations integrates structure overlay cleanup');
  });

  it('renders badges via textContent (page text never parsed as HTML)', () => {
    assert.ok(structureBlock.includes('badge.textContent = item.badge;'), 'badge uses textContent');
    assert.ok(!structureBlock.includes('innerHTML'), 'structure block must not use innerHTML');
  });

  it('overlay is pointer-events none, aria-hidden and listener/timer free', () => {
    assert.ok(structureBlock.includes('container.setAttribute("aria-hidden", "true")'));
    const cssHits = structureBlock.match(/pointer-events:none/g) || [];
    assert.ok(cssHits.length >= 3, 'container, marker and badge are pointer-events:none');
    assert.ok(!structureBlock.includes('addEventListener'), 'no listeners');
    assert.ok(!structureBlock.includes('setTimeout') && !structureBlock.includes('setInterval'), 'no timers');
  });

  it('heading badges show H<level>; landmark badges show the role', () => {
    assert.ok(structureBlock.includes('badge: `H${h.level}`'), 'heading badge is H1..H6');
    assert.ok(structureBlock.includes('l.label ? `${l.role}: ${txt(l.label, 24)}` : l.role'), 'landmark badge shows role (+ label)');
  });
});

// ══════════════════════════════════════════════════════
// 6. SW message validation — GET_PAGE_STRUCTURE / SHOW_STRUCTURE
// ══════════════════════════════════════════════════════

describe('GET_PAGE_STRUCTURE / SHOW_STRUCTURE message validation', () => {
  const sender = { id: 'test-extension-id' };

  it('both are registered in MESSAGE_TYPES', () => {
    assert.match(sw, /MESSAGE_TYPES = new Set\(\[[^\]]*"GET_PAGE_STRUCTURE"[^\]]*\]\)/);
    assert.match(sw, /MESSAGE_TYPES = new Set\(\[[^\]]*"SHOW_STRUCTURE"[^\]]*\]\)/);
  });

  it('accepts a valid GET_PAGE_STRUCTURE message', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({ type: 'GET_PAGE_STRUCTURE', tabId: 1, frameId: 0 }, sender);
    assert.equal(result.ok, true);
  });

  it('GET_PAGE_STRUCTURE rejects missing/invalid tabId and frameId', () => {
    const ctx = createSwContext();
    const cases = [
      [{ type: 'GET_PAGE_STRUCTURE', frameId: 0 }, 'BAD_TAB_ID'],
      [{ type: 'GET_PAGE_STRUCTURE', tabId: -2, frameId: 0 }, 'BAD_TAB_ID'],
      [{ type: 'GET_PAGE_STRUCTURE', tabId: 1 }, 'BAD_FRAME_ID'],
      [{ type: 'GET_PAGE_STRUCTURE', tabId: 1, frameId: 'x' }, 'BAD_FRAME_ID'],
    ];
    for (const [msg, error] of cases) {
      const result = ctx.__validateIncomingMessage(msg, sender);
      assert.equal(result.ok, false, JSON.stringify(msg));
      assert.equal(result.error, error, JSON.stringify(msg));
    }
  });

  it('SHOW_STRUCTURE accepts headings, landmarks and clear', () => {
    const ctx = createSwContext();
    for (const kind of ['headings', 'landmarks', 'clear']) {
      const result = ctx.__validateIncomingMessage({ type: 'SHOW_STRUCTURE', tabId: 1, frameId: 0, kind }, sender);
      assert.equal(result.ok, true, `kind "${kind}" should be accepted`);
    }
  });

  it('SHOW_STRUCTURE rejects unknown, missing and non-string kinds', () => {
    const ctx = createSwContext();
    for (const kind of ['outline', '', 42, null, undefined]) {
      const result = ctx.__validateIncomingMessage({ type: 'SHOW_STRUCTURE', tabId: 1, frameId: 0, kind }, sender);
      assert.equal(result.ok, false, `kind ${JSON.stringify(kind)} should be rejected`);
      assert.equal(result.error, 'BAD_KIND');
    }
  });

  it('SHOW_STRUCTURE rejects missing frameId', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({ type: 'SHOW_STRUCTURE', tabId: 1, kind: 'headings' }, sender);
    assert.equal(result.ok, false);
    assert.equal(result.error, 'BAD_FRAME_ID');
  });

  it('rejects unauthorized senders', () => {
    const ctx = createSwContext();
    for (const type of ['GET_PAGE_STRUCTURE', 'SHOW_STRUCTURE']) {
      const result = ctx.__validateIncomingMessage({ type, tabId: 1, frameId: 0, kind: 'headings' }, { id: 'evil-extension' });
      assert.equal(result.ok, false);
      assert.equal(result.error, 'UNAUTHORIZED_SENDER');
    }
  });

  it('sw kind allowlist mirrors the snippet plus "clear"', () => {
    assert.match(sw, /const STRUCTURE_KINDS = new Set\(\["headings", "landmarks", "clear"\]\);/);
  });

  it('GET_PAGE_STRUCTURE handler reinjects the snippet files and calls the api', () => {
    const start = sw.indexOf('if (msg.type === "GET_PAGE_STRUCTURE") {', sw.indexOf('sendResponse'));
    assert.ok(start > -1, 'GET_PAGE_STRUCTURE handler should exist');
    const end = sw.indexOf('if (msg.type === "SHOW_STRUCTURE")', start);
    const body = sw.slice(start, end);
    assert.ok(body.includes('files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE]'), 'handler injects snippet files');
    assert.ok(body.includes('api.getPageStructure'), 'handler calls getPageStructure in the frame');
  });

  it('SHOW_STRUCTURE handler supports clear without reinjection + direct fallback', () => {
    const start = sw.indexOf('if (msg.type === "SHOW_STRUCTURE") {', sw.indexOf('sendResponse'));
    assert.ok(start > -1, 'SHOW_STRUCTURE handler should exist');
    const end = sw.indexOf('if (msg.type === "RUN_AUDIT")', start);
    const body = sw.slice(start, end);
    assert.ok(body.includes('api.showStructureOverlay'), 'handler calls showStructureOverlay in the frame');
    assert.ok(body.includes('api.clearStructureOverlay'), 'clear uses clearStructureOverlay');
    assert.ok(body.includes('__flowlens_structure__'), 'clear falls back to direct container removal');
    assert.ok(body.includes('files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE]'), 'show path injects snippet files');
  });
});

// ══════════════════════════════════════════════════════
// 7. Panel wiring — Page structure section
// ══════════════════════════════════════════════════════

describe('Panel page structure section', () => {
  it('panel.html has the Page structure collapsible with scan + show controls and one shared clear', () => {
    assert.match(panelHtml, /<details class="assistBar structureBar" id="structureSection">/);
    assert.match(panelHtml, /<summary class="assistSummary">Page structure<\/summary>/);
    for (const id of [
      'structureScanBtn', 'structureClearBtn', 'structureSummary',
      'structureHeadingsList', 'structureLandmarksList',
      'structureShowHeadings', 'structureShowLandmarks',
    ]) {
      assert.ok(panelHtml.includes(`id="${id}"`), `element #${id} present`);
    }
    // The overlay is one container regardless of kind — a single Clear suffices.
    assert.ok(!panelHtml.includes('structureClearHeadings'), 'per-list clear buttons removed');
    assert.ok(!panelHtml.includes('structureClearLandmarks'), 'per-list clear buttons removed');
  });

  it('all structure buttons are real <button type="button"> elements (keyboard-accessible)', () => {
    const ids = ['structureScanBtn', 'structureClearBtn', 'structureShowHeadings', 'structureShowLandmarks'];
    for (const id of ids) {
      const m = panelHtml.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
      assert.ok(m, `#${id} is a <button>`);
      assert.ok(m[0].includes('type="button"'), `#${id} is type=button`);
    }
    assert.ok(!panelHtml.includes('onclick='), 'no inline handlers in panel.html');
  });

  it('panel sends GET_PAGE_STRUCTURE and SHOW_STRUCTURE via send() targeting bestFrameId ?? 0', () => {
    assert.match(panel, /send\(\{ type: "GET_PAGE_STRUCTURE", frameId: state\.bestFrameId \?\? 0 \}\)/);
    assert.match(panel, /send\(\{ type: "SHOW_STRUCTURE", frameId: state\.bestFrameId \?\? 0, kind \}\)/);
  });

  it('renderers escape all page-derived text', () => {
    const start = panel.indexOf('function structureHeadingItemHtml');
    const end = panel.indexOf('function renderPageStructure', start);
    assert.ok(start > -1 && end > start, 'structure item renderers exist');
    const body = panel.slice(start, end);
    for (const field of ['h?.path', 'l?.path', 'l.label']) {
      assert.ok(body.includes(`escapeHtml(`) && body.includes(field), `renderer escapes ${field}`);
    }
    assert.match(body, /escapeHtml\(txt\(h\?\.text \|\| "", 80\)\)|\$\{text \? escapeHtml\(text\)/, 'heading text escaped');
    assert.match(body, /escapeHtml\(String\(l\?\.role \|\| ""\)\)/, 'landmark role escaped');
  });

  it('wired via addEventListener (CSP-safe)', () => {
    assert.match(panel, /els\.structureScanBtn\.addEventListener\("click"/);
    assert.match(panel, /els\.structureShowHeadings\.addEventListener\("click"/);
    assert.match(panel, /els\.structureShowLandmarks\.addEventListener\("click"/);
  });
});
