/**
 * Test harness for pure blocks of the snippet IIFE, extracted between
 * marker comments. (The state-transition engine itself is a shared ES
 * module — see engine-harness.mjs — so there is no snippet copy to test.)
 */

import { readFileSync } from 'node:fs';
import { createContext as vmCreateContext, Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPET_JS = join(__dirname, '..', 'src', 'snippet', 'a11y-audit-snippet.js');

/**
 * Extracts the capture-settle predicate block (pure functions used by
 * observe()/watch() to end their fixed windows early when the page is quiet).
 */
export function createSnippetSettleContext() {
  const source = readFileSync(SNIPPET_JS, 'utf8');

  const startMarker = '// ──────── Capture settle predicates (pure) ────';
  const endMarker = '// ──────── End capture settle predicates ────';
  const startIdx = source.indexOf(startMarker);
  const endIdx = source.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not find capture-settle markers in snippet source');
  }
  const endLineEnd = source.indexOf('\n', endIdx);
  const block = source.slice(startIdx, endLineEnd > -1 ? endLineEnd : endIdx + endMarker.length);

  const ctx = vmCreateContext({
    Object, Array, String, Number, Boolean,
    Math, JSON, Error, TypeError,
    parseInt, parseFloat, isNaN, isFinite,
    console,
  });

  const script = new Script(block, { filename: 'snippet-settle.js' });
  script.runInContext(ctx);

  const expose = new Script(`
    this.__observeShouldSettle = observeShouldSettle;
    this.__watchShouldSettle = watchShouldSettle;
  `, { filename: 'snippet-settle-expose.js' });
  expose.runInContext(ctx);

  return ctx;
}
