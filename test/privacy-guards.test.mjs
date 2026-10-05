/**
 * Privacy guards:
 * - CAPTURE_SHOT must not screenshot when the inspected tab isn't the
 *   frontmost tab of its window (captureVisibleTab would grab another tab).
 * - The snippet's page-console output is gated by __A11YFLOW_CONSOLE__,
 *   which the SW sets from the panel's "also log to console" pref. (The
 *   snippet side is checked in a real browser by scripts/e2e-smoke.mjs.)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSwContext } from "./sw-harness.mjs";

function dispatch(listener, msg) {
  return new Promise((resolve) => {
    listener(msg, { id: "test-extension-id" }, resolve);
  });
}

describe("CAPTURE_SHOT — only the visible inspected tab", () => {
  function setup(active) {
    let listener = null;
    let captured = 0;
    createSwContext({
      captureListener: (fn) => { listener = fn; },
      tabs: {
        get: async (id) => ({ id, windowId: 9, active }),
        captureVisibleTab: async () => { captured++; return "data:image/png;base64,AAAA"; },
      },
    });
    return { listener, captured: () => captured };
  }

  it("captures when the inspected tab is active", async () => {
    const { listener, captured } = setup(true);
    const r = await dispatch(listener, { type: "CAPTURE_SHOT", tabId: 3 });
    assert.equal(r.ok, true);
    assert.equal(captured(), 1);
  });

  it("refuses when another tab is frontmost in that window", async () => {
    const { listener, captured } = setup(false);
    const r = await dispatch(listener, { type: "CAPTURE_SHOT", tabId: 3 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, "inspected-tab-not-visible");
    assert.equal(captured(), 0);
  });
});

describe("audit exec sets the snippet console gate from alsoConsole", () => {
  for (const alsoConsole of [false, true]) {
    it(`alsoConsole=${alsoConsole}`, async () => {
      let gate;
      // The injected func is compiled in the SW's vm context, so its `window`
      // resolves to the context global — point that at a fake page window.
      const fakeWindow = { A11YFlowAudit: { run: async () => ({ findings: [] }) } };
      const ctx = createSwContext({
        executeScript: async (opts) => {
          if (opts.files) return [];
          const result = await opts.func(...opts.args);
          gate = fakeWindow.__A11YFLOW_CONSOLE__;
          return [{ frameId: 0, result }];
        },
      });
      ctx.window = fakeWindow;
      await ctx.__execAuditActionInFrame({ tabId: 1, frameId: 0, action: "run", alsoConsole, wcagLevel: "2.1-AA" });
      assert.equal(gate, alsoConsole);
    });
  }
});
