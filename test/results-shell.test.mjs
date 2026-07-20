/**
 * Results shell — the single writer for the Snap body's idle / results /
 * error state. Guards the same "no random states" invariant as the
 * section-view core, one level up: emptyState, resultsZone and the empty-
 * state copy/retry are always mutually consistent, and an error never
 * lingers after returning to idle.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

function shellProbe(ctx) {
  const doc = ctx.document;
  return {
    emptyHidden: ctx.els.emptyState.hidden,
    resultsHidden: ctx.els.resultsZone.hidden,
    errorClass: ctx._errorClass, // set via classList.toggle spy below
    text: doc._elCache["emptyText"]?.textContent,
    hint: doc._elCache["emptyText"] ? doc._elCache["emptyHint"]?.textContent : undefined,
    retryHidden: doc._elCache["emptyRetry"]?.hidden,
  };
}

// classList.toggle is a noop in the mock — track the error class ourselves by
// wrapping the emptyState element's classList before each test.
function instrumentErrorClass(ctx) {
  const es = ctx.els.emptyState;
  ctx._errorClass = false;
  es.classList = {
    add: () => {}, remove: () => {}, contains: () => ctx._errorClass,
    toggle: (name, on) => { if (name === "emptyState--error") ctx._errorClass = !!on; },
  };
}

describe("renderResultsShell", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); instrumentErrorClass(ctx); });

  it("results view: results shown, empty hidden, export anchor shown", () => {
    ctx.renderResultsShell({ view: "results" });
    const p = shellProbe(ctx);
    assert.equal(p.resultsHidden, false);
    assert.equal(p.emptyHidden, true);
    assert.equal(p.errorClass, false);
    assert.equal(ctx.els.exportAnchor.hidden, false);
  });

  it("idle view: empty shown with idle copy, no error, no retry", () => {
    ctx.renderResultsShell({ view: "idle" });
    const p = shellProbe(ctx);
    assert.equal(p.emptyHidden, false);
    assert.equal(p.resultsHidden, true);
    assert.equal(p.errorClass, false);
    assert.match(p.text, /Run an audit/);
    assert.match(p.hint, /Choose a mode/);
    assert.equal(p.retryHidden, true);
  });

  it("error view: message + retry visible + error class", () => {
    ctx.renderResultsShell({ view: "error", message: "tabWalk failed — connection error" });
    const p = shellProbe(ctx);
    assert.equal(p.emptyHidden, false);
    assert.equal(p.resultsHidden, true);
    assert.equal(p.errorClass, true);
    assert.equal(p.text, "tabWalk failed — connection error");
    assert.match(p.hint, /Check the console/);
    assert.equal(p.retryHidden, false);
  });

  it("error → idle clears the error copy, class and retry (no stuck error)", () => {
    ctx.renderResultsShell({ view: "error", message: "boom" });
    ctx.renderResultsShell({ view: "idle" });
    const p = shellProbe(ctx);
    assert.equal(p.errorClass, false);
    assert.match(p.text, /Run an audit/);
    assert.equal(p.retryHidden, true);
  });

  it("thin wrappers map to the right view", () => {
    ctx.state.records = [{ id: 1 }];
    ctx.updateResultsVisibility();
    assert.equal(ctx.els.resultsZone.hidden, false);
    ctx.updateResultsVisibility(false);
    assert.equal(ctx.els.resultsZone.hidden, true);
    ctx.showErrorEmptyState("x failed");
    assert.equal(ctx._errorClass, true);
    assert.equal(ctx.document._elCache["emptyText"].textContent, "x failed");
  });
});

describe("sevTabButton — shared filter-tab markup", () => {
  const ctx = createContext();

  it("emits a sevTab with count and aria-selected", () => {
    const html = ctx.sevTabButton("high", "High", 3, true);
    assert.match(html, /class="sevTab"/);
    assert.match(html, /data-sev="high"/);
    assert.match(html, /aria-selected="true"/);
    assert.match(html, /tabindex="0"/);
    assert.match(html, />High</);
    assert.match(html, />3</);
  });

  it("null count renders an en-dash, inactive gets tabindex -1", () => {
    const html = ctx.sevTabButton("", "All", null, false);
    assert.match(html, /&ndash;/);
    assert.match(html, /tabindex="-1"/);
  });

  it("title is optional and escaped", () => {
    assert.doesNotMatch(ctx.sevTabButton("fail", "Fail", 1, false), /title=/);
    assert.match(ctx.sevTabButton("high", "High", 1, false, "Shift+click to combine"), /title="Shift\+click to combine"/);
  });

  it("renderContrastSevTabs builds all/fail/pass through the shared helper", () => {
    ctx.state.contrastData = [{}, {}];
    ctx.state.contrastSamples = [{}, {}, {}, {}, {}];
    ctx.state.contrastFilter = "fail";
    ctx.renderContrastSevTabs();
    const html = ctx.els.sevTabs.innerHTML;
    assert.equal((html.match(/class="sevTab"/g) || []).length, 3);
    assert.match(html, /data-sev="fail"[^>]*aria-selected="true"/);
  });
});
