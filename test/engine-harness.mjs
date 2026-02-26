/**
 * Test harness for stateTransitionEngine.js — loads pure functions into a
 * vm context. Follows the sw-harness.mjs pattern.
 *
 * The engine module has no DOM access and no imports, so only JS builtins
 * are provided.
 */

import { readFileSync } from 'node:fs';
import { createContext as vmCreateContext, Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENGINE_JS = join(__dirname, '..', 'src', 'engine', 'stateTransitionEngine.js');

export function createEngineContext() {
  const source = readFileSync(ENGINE_JS, 'utf8');

  const ctx = vmCreateContext({
    Object, Array, String, Number, Boolean, Symbol,
    Math, JSON, RegExp, Error, TypeError, RangeError,
    Map, Set, WeakMap, WeakSet,
    parseInt, parseFloat, isNaN, isFinite,
    console,
  });

  const script = new Script(source, { filename: 'stateTransitionEngine.js' });
  script.runInContext(ctx);

  const expose = new Script(`
    this.__STE_MAX_LIVE_REGIONS = STE_MAX_LIVE_REGIONS;
    this.__STE_MAX_CANDIDATES = STE_MAX_CANDIDATES;
    this.__fnv1aHash8 = fnv1aHash8;
    this.__buildLocator = buildLocator;
    this.__hashLocator = hashLocator;
    this.__buildTransitionState = buildTransitionState;
    this.__buildStateDelta = buildStateDelta;
    this.__evaluateC1 = evaluateC1;
    this.__evaluateC2 = evaluateC2;
    this.__evaluateC3_1 = evaluateC3_1;
    this.__evaluateC3_2 = evaluateC3_2;
    this.__mergeFrameIntegrity = mergeFrameIntegrity;
    this.__evaluateC4_1 = evaluateC4_1;
    this.__evaluateC4_2 = evaluateC4_2;
    this.__buildTransitionStateSummary = buildTransitionStateSummary;
    this.__classifyPoliteness = classifyPoliteness;
  `, { filename: 'engine-expose.js' });
  expose.runInContext(ctx);

  return ctx;
}
