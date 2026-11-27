/**
 * Test harness for stateTransitionEngine.js — the engine is an ES module
 * (bundled into the SW and the snippet), so tests import it directly. The
 * `__name` aliases keep the long-standing test API.
 */
import * as engine from '../src/engine/stateTransitionEngine.js';

export function createEngineContext() {
  return {
    __STE_MAX_LIVE_REGIONS: engine.STE_MAX_LIVE_REGIONS,
    __STE_MAX_CANDIDATES: engine.STE_MAX_CANDIDATES,
    __fnv1aHash8: engine.fnv1aHash8,
    __buildLocator: engine.buildLocator,
    __hashLocator: engine.hashLocator,
    __buildTransitionState: engine.buildTransitionState,
    __buildStateDelta: engine.buildStateDelta,
    __evaluateC1: engine.evaluateC1,
    __evaluateC2: engine.evaluateC2,
    __evaluateC3_1: engine.evaluateC3_1,
    __evaluateC3_2: engine.evaluateC3_2,
    __mergeFrameIntegrity: engine.mergeFrameIntegrity,
    __evaluateC4_1: engine.evaluateC4_1,
    __evaluateC4_2: engine.evaluateC4_2,
    __buildTransitionStateSummary: engine.buildTransitionStateSummary,
    __classifyPoliteness: engine.classifyPoliteness,
  };
}
