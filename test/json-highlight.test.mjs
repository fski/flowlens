/**
 * JSON syntax highlighting — highlightJson / renderJsonInto.
 * The highlighted markup's textContent must stay byte-identical to the
 * input so copy actions keep working, and output must be deterministic.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

const ctx = createContext();

function stripTags(html) {
  return html.replaceAll(/<[^>]+>/g, '');
}

function unescapeHtml(s) {
  return s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

test('distinguishes object keys from string values', () => {
  const out = ctx.highlightJson('{\n  "name": "value"\n}');
  assert.match(out, /<span class="jt-key">"name"<\/span>\s*:/);
  assert.match(out, /<span class="jt-str">"value"<\/span>/);
});

test('highlights numbers, booleans and null', () => {
  const out = ctx.highlightJson('{"a": -1.5e3, "b": true, "c": false, "d": null}');
  assert.match(out, /<span class="jt-num">-1\.5e3<\/span>/);
  assert.match(out, /<span class="jt-bool">true<\/span>/);
  assert.match(out, /<span class="jt-bool">false<\/span>/);
  assert.match(out, /<span class="jt-null">null<\/span>/);
});

test('escapes HTML in string content — no raw markup survives', () => {
  const payload = JSON.stringify({ evil: '<script>alert(1)</script> & <img src=x>' }, null, 2);
  const out = ctx.highlightJson(payload);
  assert.ok(!out.includes('<script'), 'raw <script must not appear');
  assert.ok(!out.includes('<img'), 'raw <img must not appear');
  assert.match(out, /&lt;script&gt;/);
});

test('escaped quotes and colons inside strings do not break tokenization', () => {
  const payload = JSON.stringify({ 'k"ey': 'va"l: ue', note: 'a: b' }, null, 2);
  const out = ctx.highlightJson(payload);
  // textContent roundtrip: strip spans, unescape → original input
  assert.equal(unescapeHtml(stripTags(out)), payload);
});

test('textContent roundtrip is byte-identical for a representative export', () => {
  const payload = JSON.stringify({
    ok: true,
    findings: [
      { sev: 'critical', wcag: '4.1.2', name: 'chat composer', count: 3 },
      { sev: 'low', wcag: '1.4.3', ratio: 3.9, large: false, note: null },
    ],
    signature: 'a1b2c3',
  }, null, 2);
  const out = ctx.highlightJson(payload);
  assert.equal(unescapeHtml(stripTags(out)), payload);
});

test('is deterministic — identical input yields identical output', () => {
  const payload = JSON.stringify({ a: [1, 2, 3], b: 'x' }, null, 2);
  assert.equal(ctx.highlightJson(payload), ctx.highlightJson(payload));
});

test('digits inside strings are not tokenized as numbers', () => {
  const out = ctx.highlightJson('{"path": "div:nth-child(2)"}');
  assert.match(out, /<span class="jt-str">"div:nth-child\(2\)"<\/span>/);
  assert.ok(!out.includes('<span class="jt-num">2</span>'));
});

test('renderJsonInto highlights small payloads via innerHTML', () => {
  const el = { textContent: '', innerHTML: '' };
  ctx.renderJsonInto(el, '{"a": 1}');
  assert.match(el.innerHTML, /jt-key/);
});

test('renderJsonInto falls back to plain text above the size cap', () => {
  const el = { textContent: '', innerHTML: '' };
  const big = '"' + 'x'.repeat(ctx.JSON_HIGHLIGHT_MAX_CHARS + 10) + '"';
  ctx.renderJsonInto(el, big);
  assert.equal(el.textContent, big);
  assert.equal(el.innerHTML, '');
});

test('renderJsonInto stringifies non-string input', () => {
  const el = { textContent: '', innerHTML: '' };
  ctx.renderJsonInto(el, { a: true });
  assert.match(el.innerHTML, /<span class="jt-bool">true<\/span>/);
});
