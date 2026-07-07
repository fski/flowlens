/**
 * Highlight reliability tests — v6 highlight contract.
 *
 * Covers:
 *  1. Snippet: api exposure + resolution-ladder presence (source-level).
 *  2. SW: HIGHLIGHT/HIGHLIGHT_ALL/CLEAR_HIGHLIGHT validation + handler
 *     behavior (inject-first, distinct error codes) via sw-harness dispatch.
 *  3. Panel: spec building (pathHash), honest toast mapping.
 *  4. Cleanup: no stale attribute/style highlight path left in sw.js.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createSwContext } from './sw-harness.mjs';
import { createContext } from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sw = readFileSync(join(__dirname, '..', 'src', 'sw', 'sw.js'), 'utf8');
const snippet = readFileSync(join(__dirname, '..', 'src', 'snippet', 'a11y-audit-snippet.js'), 'utf8');
const panel = readFileSync(join(__dirname, '..', 'src', 'panel', 'panel.js'), 'utf8');
const sender = { id: 'test-extension-id' };

// ══════════════════════════════════════════════════════
// 1. Snippet — api exposure + resolution ladder
// ══════════════════════════════════════════════════════

describe('Snippet highlight api', () => {
  it('exposes highlightTarget, highlightAll and clearHighlight on the api object', () => {
    const apiStart = snippet.indexOf('const api = {');
    assert.ok(apiStart > -1, 'api object exists');
    const apiBlock = snippet.slice(apiStart, snippet.indexOf('};', apiStart));
    assert.ok(apiBlock.includes('highlightTarget'), 'api.highlightTarget exposed');
    assert.ok(apiBlock.includes('highlightAll'), 'api.highlightAll exposed');
    assert.ok(apiBlock.includes('clearHighlight'), 'api.clearHighlight exposed');
  });

  it('implements the resolution ladder: direct path → deep path → shadow scopes → pathHash re-scan → ELEMENT_GONE', () => {
    const start = snippet.indexOf('const resolveHighlightTarget =');
    assert.ok(start > -1, 'resolveHighlightTarget exists');
    const body = snippet.slice(start, snippet.indexOf('const clearHighlight =', start));
    // (a) document.querySelector on the audit-time path
    assert.ok(body.includes('doc.querySelector(spec.path)'), 'ladder (a): direct querySelector');
    // (a2) cross-shadow ">>>" path support
    assert.ok(body.includes('queryShadowPath'), 'ladder (a2): cssPathDeep >>> walk');
    // (b) shadow-DOM-aware walk reusing the audit scope collection
    assert.ok(body.includes('collectScopesWithCoverage'), 'ladder (b): reuses audit scope collection');
    // (c) re-scan by tail segment + pathHash verification
    assert.ok(body.includes('steFnv1aHash8(p) === wantHash'), 'ladder (c): fnv1aHash8(cssPath(el)) === pathHash');
    assert.ok(body.includes('stripNth'), 'ladder (c): structural (:nth-of-type-stripped) match');
    // (d) not found → null → ELEMENT_GONE at the call site
    assert.ok(snippet.includes('return { ok: true, found: false, reason: "ELEMENT_GONE" }'), 'ladder (d): ELEMENT_GONE');
  });

  it('queryShadowPath pierces open shadow roots via the >>> separator', () => {
    const start = snippet.indexOf('const queryShadowPath =');
    assert.ok(start > -1);
    const body = snippet.slice(start, snippet.indexOf('};', start));
    assert.ok(body.includes('>>>'), 'splits on shadow boundary separator');
    assert.ok(body.includes('shadowRoot'), 'descends into shadowRoot');
  });

  it('renders a persistent overlay ring (no 6s auto-vanish; 30s safety auto-clear)', () => {
    assert.ok(snippet.includes('const HIGHLIGHT_AUTO_CLEAR_MS = 30000'), '30s safety auto-clear');
    assert.ok(!/,\s*6000\s*\)/.test(snippet.slice(snippet.indexOf('renderHighlightRings'))), 'no 6s timeout in highlight rendering');
    const render = snippet.slice(snippet.indexOf('const renderHighlightRings ='), snippet.indexOf('const highlightTarget ='));
    assert.ok(render.includes('getBoundingClientRect'), 'ring tracks getBoundingClientRect');
    assert.ok(render.includes('addEventListener("scroll", onMove, true)'), 'scroll listener');
    assert.ok(render.includes('addEventListener("resize", onMove, true)'), 'resize listener');
    assert.ok(render.includes('chip.textContent = chipText'), 'label chip uses textContent only');
  });

  it('clearHighlight removes ring, style, listeners and legacy attribute highlight', () => {
    const start = snippet.indexOf('const clearHighlight =');
    assert.ok(start > -1);
    const body = snippet.slice(start, snippet.indexOf('const renderHighlightRings ='));
    assert.ok(body.includes('removeEventListener("scroll"'), 'detaches scroll listener');
    assert.ok(body.includes('removeEventListener("resize"'), 'detaches resize listener');
    assert.ok(body.includes('HIGHLIGHT_CONTAINER_ID'), 'removes ring container');
    assert.ok(body.includes('HIGHLIGHT_STYLE_ID'), 'removes keyframes style');
    assert.ok(body.includes('a11yflow-highlight-style'), 'removes legacy pre-v6 style');
    assert.ok(body.includes('data-a11yflow-highlight'), 'removes legacy pre-v6 attribute');
  });

  it('highlightAll caps specs at 50 and reuses one scope collection', () => {
    assert.ok(snippet.includes('const MAX_HIGHLIGHT_SPECS = 50'), 'cap constant');
    const start = snippet.indexOf('const highlightAll =');
    assert.ok(start > -1);
    const body = snippet.slice(start, snippet.indexOf('// ---------------- main checks', start));
    assert.ok(body.includes('.slice(0, MAX_HIGHLIGHT_SPECS)'), 'caps incoming specs');
    assert.ok(body.includes('collectScopesWithCoverage'), 'collects scopes once');
    assert.ok(body.includes('resolveHighlightTarget(spec, scopes)'), 'threads scopes through the ladder');
  });

  it('sanitizes spec fields snippet-side (string type + length caps)', () => {
    const start = snippet.indexOf('const sanitizeHighlightSpec =');
    assert.ok(start > -1);
    const body = snippet.slice(start, snippet.indexOf('const isDeepPath ='));
    assert.ok(body.includes('path: str(s.path, 1024)'));
    assert.ok(body.includes('pathHash: str(s.pathHash, 16)'));
    assert.ok(body.includes('name: str(s.name, 200)'));
  });
});

// ══════════════════════════════════════════════════════
// 2. SW — message validation
// ══════════════════════════════════════════════════════

describe('SW highlight message validation', () => {
  it('HIGHLIGHT_ALL and CLEAR_HIGHLIGHT are registered in MESSAGE_TYPES', () => {
    assert.match(sw, /MESSAGE_TYPES = new Set\(\[[^\]]*"HIGHLIGHT_ALL"[^\]]*\]\)/);
    assert.match(sw, /MESSAGE_TYPES = new Set\(\[[^\]]*"CLEAR_HIGHLIGHT"[^\]]*\]\)/);
  });

  it('accepts a well-formed HIGHLIGHT message', () => {
    const ctx = createSwContext();
    const result = ctx.__validateIncomingMessage({
      type: 'HIGHLIGHT', tabId: 1, frameId: 0,
      finding: { path: 'button.x', pathHash: 'deadbeef', type: 'IMG_ALT', name: 'Go', severity: 'high' },
    }, sender);
    assert.equal(result.ok, true);
  });

  it('rejects HIGHLIGHT with non-string or oversized spec fields', () => {
    const ctx = createSwContext();
    const cases = [
      [{ type: 'HIGHLIGHT', tabId: 1, frameId: 0, finding: { path: 42 } }, 'BAD_FINDING'],
      [{ type: 'HIGHLIGHT', tabId: 1, frameId: 0, finding: { path: 'x'.repeat(3000) } }, 'BAD_FINDING'],
      [{ type: 'HIGHLIGHT', tabId: 1, frameId: 0, finding: { pathHash: 'f'.repeat(64) } }, 'BAD_FINDING'],
      [{ type: 'HIGHLIGHT', tabId: 1, frameId: 0, finding: [] }, 'BAD_FINDING'],
      [{ type: 'HIGHLIGHT', tabId: 1, finding: {} }, 'BAD_FRAME_ID'],
    ];
    for (const [msg, error] of cases) {
      const result = ctx.__validateIncomingMessage(msg, sender);
      assert.equal(result.ok, false, JSON.stringify(msg).slice(0, 80));
      assert.equal(result.error, error, JSON.stringify(msg).slice(0, 80));
    }
  });

  it('rejects HIGHLIGHT_ALL with missing/oversized/invalid specs arrays', () => {
    const ctx = createSwContext();
    const spec = { path: 'button' };
    const cases = [
      [{ type: 'HIGHLIGHT_ALL', tabId: 1, frameId: 0 }, 'BAD_SPECS'],
      [{ type: 'HIGHLIGHT_ALL', tabId: 1, frameId: 0, specs: {} }, 'BAD_SPECS'],
      [{ type: 'HIGHLIGHT_ALL', tabId: 1, frameId: 0, specs: Array(51).fill(spec) }, 'BAD_SPECS'],
      [{ type: 'HIGHLIGHT_ALL', tabId: 1, frameId: 0, specs: [{ path: 9 }] }, 'BAD_SPECS'],
      [{ type: 'HIGHLIGHT_ALL', tabId: 1, specs: [spec] }, 'BAD_FRAME_ID'],
    ];
    for (const [msg, error] of cases) {
      const result = ctx.__validateIncomingMessage(msg, sender);
      assert.equal(result.ok, false);
      assert.equal(result.error, error);
    }
    assert.equal(ctx.__validateIncomingMessage(
      { type: 'HIGHLIGHT_ALL', tabId: 1, frameId: 0, specs: Array(50).fill(spec) }, sender).ok, true);
  });

  it('CLEAR_HIGHLIGHT requires tabId + frameId', () => {
    const ctx = createSwContext();
    assert.equal(ctx.__validateIncomingMessage({ type: 'CLEAR_HIGHLIGHT', tabId: 1, frameId: 0 }, sender).ok, true);
    assert.equal(ctx.__validateIncomingMessage({ type: 'CLEAR_HIGHLIGHT', tabId: 1 }, sender).error, 'BAD_FRAME_ID');
    assert.equal(ctx.__validateIncomingMessage({ type: 'CLEAR_HIGHLIGHT', frameId: 0 }, sender).error, 'BAD_TAB_ID');
  });

  it('rejects unauthorized senders for the new types', () => {
    const ctx = createSwContext();
    for (const msg of [
      { type: 'HIGHLIGHT_ALL', tabId: 1, frameId: 0, specs: [] },
      { type: 'CLEAR_HIGHLIGHT', tabId: 1, frameId: 0 },
    ]) {
      const result = ctx.__validateIncomingMessage(msg, { id: 'evil-extension' });
      assert.equal(result.error, 'UNAUTHORIZED_SENDER');
    }
  });
});

// ══════════════════════════════════════════════════════
// 3. SW — handler behavior (dispatch through onMessage)
// ══════════════════════════════════════════════════════

describe('SW HIGHLIGHT handler behavior', () => {
  it('always injects the snippet stack first, then calls api.highlightTarget with the sanitized spec', async () => {
    const calls = [];
    const ctx = createSwContext({
      executeScript: async (opts) => {
        calls.push(opts);
        if (opts.files) return [];
        return [{ result: { ok: true, found: true, resolution: 'path', matched: { tag: 'button' } } }];
      },
    });
    const res = await ctx.__dispatchMessage({
      type: 'HIGHLIGHT', tabId: 7, frameId: 3,
      finding: { path: 'button.x', pathHash: 'deadbeef', type: 'IMG_ALT', name: 'Go', severity: 'high', extraneous: 'dropped' },
    });
    assert.equal(calls.length, 2);
    assert.deepEqual([...calls[0].files], ['accname.js', 'aria-data.js', 'a11y-audit-snippet.js']);
    assert.equal(calls[0].world, 'MAIN');
    assert.equal(calls[1].world, 'MAIN');
    assert.equal(typeof calls[1].func, 'function');
    const spec = calls[1].args[0];
    assert.equal(spec.path, 'button.x');
    assert.equal(spec.pathHash, 'deadbeef');
    assert.equal(spec.extraneous, undefined, 'unknown fields do not cross into the page');
    assert.equal(res.ok, true);
    assert.equal(res.found, true);
    assert.equal(res.resolution, 'path');
    assert.equal(res.frameIdUsed, 3);
  });

  it('returns {ok:false, error:"INJECT_FAILED"} when snippet injection fails', async () => {
    const ctx = createSwContext({
      executeScript: async (opts) => { if (opts.files) throw new Error('Cannot access contents'); return []; },
    });
    const res = await ctx.__dispatchMessage({ type: 'HIGHLIGHT', tabId: 1, frameId: 0, finding: { path: 'a' } });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'INJECT_FAILED');
  });

  it('returns {ok:false, error:"FRAME_GONE"} when the highlight call itself fails', async () => {
    const ctx = createSwContext({
      executeScript: async (opts) => { if (opts.files) return []; throw new Error('Frame was removed'); },
    });
    const res = await ctx.__dispatchMessage({ type: 'HIGHLIGHT', tabId: 1, frameId: 0, finding: { path: 'a' } });
    assert.equal(res.ok, false);
    assert.equal(res.error, 'FRAME_GONE');
  });

  it('passes ELEMENT_GONE through unchanged: {ok:true, found:false, reason:"ELEMENT_GONE"}', async () => {
    const ctx = createSwContext({
      executeScript: async (opts) => {
        if (opts.files) return [];
        return [{ result: { ok: true, found: false, reason: 'ELEMENT_GONE' } }];
      },
    });
    const res = await ctx.__dispatchMessage({ type: 'HIGHLIGHT', tabId: 1, frameId: 2, finding: { path: 'a' } });
    assert.equal(res.ok, true);
    assert.equal(res.found, false);
    assert.equal(res.reason, 'ELEMENT_GONE');
    assert.equal(res.frameIdUsed, 2);
  });

  it('HIGHLIGHT_ALL sanitizes + caps the specs array and calls api.highlightAll', async () => {
    const calls = [];
    const ctx = createSwContext({
      executeScript: async (opts) => {
        calls.push(opts);
        if (opts.files) return [];
        return [{ result: { ok: true, found: true, requested: 50, rendered: 48, missing: 2 } }];
      },
    });
    const res = await ctx.__dispatchMessage({
      type: 'HIGHLIGHT_ALL', tabId: 1, frameId: 0,
      specs: Array(50).fill({ path: 'button', type: 'IMG_ALT' }),
    });
    assert.equal(calls.length, 2);
    assert.deepEqual([...calls[0].files], ['accname.js', 'aria-data.js', 'a11y-audit-snippet.js']);
    assert.equal(calls[1].args[0].length, 50);
    assert.equal(calls[1].args[0][0].path, 'button');
    assert.equal(calls[1].args[1], true, 'isAll flag set');
    assert.equal(res.rendered, 48);
  });

  it('CLEAR_HIGHLIGHT works without injection and reports FRAME_GONE on failure', async () => {
    const calls = [];
    const okCtx = createSwContext({
      executeScript: async (opts) => { calls.push(opts); return [{ result: { ok: true, cleared: true } }]; },
    });
    const res = await okCtx.__dispatchMessage({ type: 'CLEAR_HIGHLIGHT', tabId: 1, frameId: 0 });
    assert.equal(calls.length, 1, 'no snippet injection for clear');
    assert.equal(calls[0].files, undefined);
    assert.equal(res.ok, true);
    assert.equal(res.cleared, true);

    const failCtx = createSwContext({ executeScript: async () => { throw new Error('gone'); } });
    const failRes = await failCtx.__dispatchMessage({ type: 'CLEAR_HIGHLIGHT', tabId: 1, frameId: 0 });
    assert.equal(failRes.ok, false);
    assert.equal(failRes.error, 'FRAME_GONE');
  });

  it('leaves no stale attribute/style highlight path in sw.js', () => {
    assert.ok(!sw.includes('a11yflow-highlight-style'), 'legacy injected <style> id gone from sw.js');
    assert.ok(!sw.includes('data-a11yflow-highlight'), 'legacy element attribute gone from sw.js');
    const handlerStart = sw.indexOf('if (msg.type === "HIGHLIGHT" || msg.type === "HIGHLIGHT_ALL")');
    assert.ok(handlerStart > -1, 'combined HIGHLIGHT/HIGHLIGHT_ALL handler exists');
    const handler = sw.slice(handlerStart, sw.indexOf('if (msg.type === "SHOW_TAB_PATH")', handlerStart));
    assert.ok(!handler.includes('FRAME_INACCESSIBLE'), 'no blanket FRAME_INACCESSIBLE in highlight handlers');
    assert.ok(handler.includes('files: [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE]'), 'inject-first like GET_PAGE_STRUCTURE');
    assert.ok(handler.includes('api?.highlightAll') && handler.includes('api?.highlightTarget'), 'delegates to snippet api');
  });
});

// ══════════════════════════════════════════════════════
// 4. Panel — spec building + honest toast mapping
// ══════════════════════════════════════════════════════

describe('Panel highlight spec + toasts', () => {
  it('buildHighlightSpec computes pathHash panel-side when the finding has none', () => {
    const ctx = createContext();
    const spec = ctx.buildHighlightSpec({ path: 'div#app > button.x', type: 'IMG_ALT', name: 'Go', severity: 'high' });
    assert.equal(spec.path, 'div#app > button.x');
    assert.equal(spec.pathHash, ctx.fnv1aHash8('div#app > button.x'));
    assert.equal(spec.type, 'IMG_ALT');
    assert.equal(spec.severity, 'high');
  });

  it('buildHighlightSpec prefers a carried pathHash (or outline `h`) over recomputing', () => {
    const ctx = createContext();
    assert.equal(ctx.buildHighlightSpec({ path: 'a', pathHash: 'cafef00d' }).pathHash, 'cafef00d');
    assert.equal(ctx.buildHighlightSpec({ path: 'a', h: '12345678' }).pathHash, '12345678');
    assert.equal(ctx.buildHighlightSpec({}).pathHash, null);
    assert.equal(ctx.buildHighlightSpec({ path: 'a', pathDeep: 'x >>> a' }).pathDeep, 'x >>> a');
  });

  it('maps reasons to honest toast messages', () => {
    const ctx = createContext();
    assert.equal(ctx.highlightToastMessage({ ok: true, found: true }), null);
    assert.equal(
      ctx.highlightToastMessage({ ok: true, found: false, reason: 'ELEMENT_GONE' }),
      'Element is no longer on the page (it may have re-rendered)');
    assert.equal(
      ctx.highlightToastMessage({ ok: false, error: 'FRAME_GONE' }),
      'Cannot reach the page — reload and re-run');
    assert.equal(
      ctx.highlightToastMessage({ ok: false, error: 'INJECT_FAILED' }),
      'Cannot reach the page — reload and re-run');
    assert.equal(ctx.highlightToastMessage({ ok: false, error: 'weird' }), 'Could not highlight element');
    assert.equal(ctx.highlightToastMessage(undefined), 'Could not highlight element');
  });

  it('highlightAllOfType sends HIGHLIGHT_ALL with capped specs for the rule type', async () => {
    const ctx = createContext();
    const sent = [];
    ctx.__mockChrome.runtime.sendMessage = (msg) => {
      sent.push(msg);
      return Promise.resolve({ ok: true, found: true, requested: msg.specs.length, rendered: msg.specs.length, missing: 0 });
    };
    ctx.state.explorer = Array.from({ length: 60 }, (_, i) => ({ type: 'IMG_ALT', path: `img:nth-of-type(${i + 1})`, severity: 'high' }))
      .concat([{ type: 'OTHER', path: 'p' }]);
    const res = await ctx.highlightAllOfType('IMG_ALT');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].type, 'HIGHLIGHT_ALL');
    assert.equal(sent[0].specs.length, 50, 'capped at 50');
    assert.ok(sent[0].specs.every(s => s.pathHash), 'each spec carries a pathHash');
    assert.equal(res.found, true);
  });

  it('highlightFinding retries other frames and returns the new contract result', async () => {
    const ctx = createContext();
    const sent = [];
    ctx.__mockChrome.runtime.sendMessage = (msg) => {
      sent.push(msg);
      if (msg.type !== 'HIGHLIGHT') return Promise.resolve({ ok: true });
      if (msg.frameId === 0) return Promise.resolve({ ok: true, found: false, reason: 'ELEMENT_GONE', frameIdUsed: 0 });
      return Promise.resolve({ ok: true, found: true, resolution: 'shadowPath', matched: { tag: 'button' }, frameIdUsed: msg.frameId });
    };
    const res = await ctx.highlightFinding({ path: 'button.x', type: 'IMG_ALT' }, { bestFrameId: 0, usedFrameIds: [0, 4] });
    assert.equal(sent.filter(m => m.type === 'HIGHLIGHT').length, 2, 'retried the other used frame');
    assert.equal(res.found, true);
    assert.equal(res.frameIdUsed, 4);
  });

  it('detail row offers "Highlight all of this type" wired to HIGHLIGHT_ALL', () => {
    assert.ok(panel.includes('detailHighlightAll'), 'button class present');
    assert.match(panel, /data-type="\$\{escapeHtml\(finding\.type\)\}"/, 'button carries the rule type');
    assert.ok(panel.includes('await highlightAllOfType(hlAllBtn.dataset.type || "")'), 'click handler delegates');
  });

  it('results toolbars offer a Clear highlight affordance wired to CLEAR_HIGHLIGHT', () => {
    const html = readFileSync(join(__dirname, '..', 'src', 'panel', 'panel.html'), 'utf8');
    assert.ok((html.match(/clearHighlightBtn/g) || []).length >= 3, 'clear button in explorer/contrast/tab-walk toolbars');
    assert.ok(panel.includes('send({ type: "CLEAR_HIGHLIGHT", frameId: fid })'), 'panel sends CLEAR_HIGHLIGHT');
    assert.ok(panel.includes('.closest(".clearHighlightBtn")'), 'delegated click wiring');
  });

  it('clearPageHighlight clears across best + used frames', async () => {
    const ctx = createContext();
    const sent = [];
    ctx.__mockChrome.runtime.sendMessage = (msg) => {
      sent.push(msg);
      return Promise.resolve({ ok: true, cleared: true });
    };
    ctx.state._activeHighlightCtx = { bestFrameId: 2, usedFrameIds: [2, 5] };
    const cleared = await ctx.clearPageHighlight();
    assert.equal(cleared, true);
    assert.deepEqual(sent.map(m => m.frameId), [2, 5]);
    assert.ok(sent.every(m => m.type === 'CLEAR_HIGHLIGHT'));
  });
});
