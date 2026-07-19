/**
 * wcagUnderstandingRef — criterion number → W3C Understanding page ref.
 * Slug must match W3C's convention (title lowercased, parens stripped,
 * non-alphanumerics collapsed to hyphens) or the link 404s.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

const ctx = createContext();

test('maps a simple criterion', () => {
  const ref = ctx.wcagUnderstandingRef('4.1.2');
  assert.equal(ref.title, 'Name, Role, Value');
  assert.equal(ref.url, 'https://www.w3.org/WAI/WCAG22/Understanding/name-role-value');
});

test('strips parentheses the way W3C slugs do', () => {
  const ref = ctx.wcagUnderstandingRef('1.4.3');
  assert.equal(ref.url, 'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum');
});

test('handles multi-word hyphenated titles', () => {
  const ref = ctx.wcagUnderstandingRef('1.4.13');
  assert.equal(ref.url, 'https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus');
});

test('returns null for unknown or empty criterion', () => {
  assert.equal(ctx.wcagUnderstandingRef('9.9.9'), null);
  assert.equal(ctx.wcagUnderstandingRef(''), null);
  assert.equal(ctx.wcagUnderstandingRef(null), null);
});
