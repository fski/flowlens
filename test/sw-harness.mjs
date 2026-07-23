/**
 * Test harness for sw.js — loads pure functions into a vm context
 * with mocked Chrome globals. Mirrors harness.mjs pattern for panel.js.
 *
 * Unlike panel.js, sw.js has function definitions both before AND after the
 * imperative onMessage listener. Since JS hoists function declarations, we
 * load the FULL source but mock out the Chrome APIs that trigger side effects.
 */

import { readFileSync } from 'node:fs';
import { createContext as vmCreateContext, Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SW_JS = join(__dirname, '..', 'src', 'sw', 'sw.js');

export function createSwContext(opts = {}) {
  const source = readFileSync(SW_JS, 'utf8');

  const ctx = vmCreateContext({
    // JS builtins
    Object, Array, String, Number, Boolean, Symbol,
    Math, Date, JSON, RegExp, Error, TypeError, RangeError,
    Map, Set, WeakMap, WeakSet,
    Promise, Proxy,
    parseInt, parseFloat, isNaN, isFinite,
    encodeURIComponent, decodeURIComponent,
    setTimeout: (fn) => { fn(); return 1; },
    clearTimeout: () => {},
    TextEncoder,
    URL,
    Uint8Array,
    console,

    // Chrome globals (mocked — addListener is a no-op so the imperative
    // handler registration runs but does nothing)
    chrome: {
      runtime: {
        id: 'test-extension-id',
        onMessage: { addListener: () => {} },
        ...(opts.onConnect ? { onConnect: opts.onConnect } : {}),
      },
      scripting: {
        executeScript: opts.executeScript || (() => Promise.resolve([])),
      },
      webNavigation: {
        getAllFrames: opts.getAllFrames || (() => Promise.resolve([])),
        ...(opts.webNavEvents || {}),
      },
    },
  });

  const script = new Script(source, { filename: 'sw.js' });
  script.runInContext(ctx);

  // Expose internal functions
  const expose = new Script(`
    this.__deriveFrameKey = deriveFrameKey;
    this.__chooseBestEntry = chooseBestEntry;
    this.__pickBestFrameFromCandidates = pickBestFrameFromCandidates;
    this.__resolveTargetFrameIds = resolveTargetFrameIds;
    this.__fnv1aHash8 = fnv1aHash8;
    this.__stablePathHint = stablePathHint;
    this.__safeOrigin = safeOrigin;
    this.__scoreRunResult = scoreRunResult;
    this.__normalizeAuditResult = normalizeAuditResult;
    this.__getManualFrameIdsFromTarget = getManualFrameIdsFromTarget;
    this.__hasManualOverride = hasManualOverride;
    this.__makeTargetResolution = makeTargetResolution;
    this.__FRAME_KEY_VERSION = FRAME_KEY_VERSION;
    this.__FRAME_SCOPE = FRAME_SCOPE;
    this.__computeFrameScores = computeFrameScores;
    this.__validateIncomingMessage = validateIncomingMessage;
    this.__collectFrameProbeData = collectFrameProbeData;
    this.__mergeFrameIntegrity = mergeFrameIntegrity;
    this.__executeAuditAcrossFrames = executeAuditAcrossFrames;
    this.__execAuditActionInFrame = execAuditActionInFrame;
    this.__evaluateC4_1 = evaluateC4_1;
    this.__evaluateC4_2 = evaluateC4_2;
  `, { filename: 'sw-expose.js' });
  expose.runInContext(ctx);

  return ctx;
}
