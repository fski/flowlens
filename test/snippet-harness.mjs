/**
 * Test harness for snippet ste* functions — extracts the State Transition
 * Engine functions from the snippet IIFE for parity testing with the
 * canonical engine module.
 *
 * Strategy: read snippet source, extract the ste* function block between
 * markers, and provide minimal DOM mocks so the utility functions (isEl,
 * testId, cssPath) work.
 */

import { readFileSync } from 'node:fs';
import { createContext as vmCreateContext, Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPET_JS = join(__dirname, '..', 'src', 'snippet', 'a11y-audit-snippet.js');

export function createSnippetEngineContext() {
  const source = readFileSync(SNIPPET_JS, 'utf8');

  // Extract the STE block between the markers
  const startMarker = '// ──────── State Transition Engine (Depth 3) ────';
  const endMarker = '// ──────── End State Transition Engine ────';
  const startIdx = source.indexOf(startMarker);
  const endIdx = source.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('Could not find STE markers in snippet source');
  }
  // Include everything up to (and including) the end marker line
  const endLineEnd = source.indexOf('\n', endIdx);
  const steBlock = source.slice(startIdx, endLineEnd > -1 ? endLineEnd : endIdx + endMarker.length);

  // Provide minimal mocks for the snippet helper functions that ste* functions depend on
  const preamble = `
    const isEl = (el) => el != null && typeof el === "object" && el._isElement === true;
    const testId = (el) => el?.testId || null;
    const cssPath = (el) => el?.cssPath || "";
    const doc = {
      querySelectorAll: () => [],
      querySelector: () => null,
      activeElement: null,
      body: { _isElement: true, tagName: "BODY" },
    };
  `;

  const ctx = vmCreateContext({
    Object, Array, String, Number, Boolean, Symbol,
    Math, JSON, RegExp, Error, TypeError, RangeError,
    Map, Set, WeakMap, WeakSet,
    parseInt, parseFloat, isNaN, isFinite,
    console,
  });

  // Run preamble + STE block
  const script = new Script(preamble + '\n' + steBlock, { filename: 'snippet-ste.js' });
  script.runInContext(ctx);

  // Expose ste* functions
  const expose = new Script(`
    this.__steBuildTransitionState = steBuildTransitionState;
    this.__steBuildStateDelta = steBuildStateDelta;
    this.__steEvaluateC1 = steEvaluateC1;
    this.__steEvaluateC2 = steEvaluateC2;
    this.__steEvaluateC3_1 = steEvaluateC3_1;
    this.__steEvaluateC3_2 = steEvaluateC3_2;
    this.__steBuildTransitionStateSummary = steBuildTransitionStateSummary;
    this.__steHashLocator = steHashLocator;
    this.__steFnv1aHash8 = steFnv1aHash8;
    this.__steClassifyPoliteness = steClassifyPoliteness;
  `, { filename: 'snippet-ste-expose.js' });
  expose.runInContext(ctx);

  return ctx;
}
