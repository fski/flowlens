/**
 * Section view core — single choke point for results tables.
 *
 * Guards the bug class from the 2026-07-20 UI feedback: empty-state text
 * visible on top of a populated table ("Run a Contrast check to see results"
 * over rows) and misleading "No results match your search" after a plain run
 * caused by filters leaking across records (reviewFilter / integrity pill).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { createContext } from "./harness.mjs";

describe("sectionEmptyText — pure decisions", () => {
  const ctx = createContext();

  it("no run yet → mode CTA text", () => {
    assert.equal(ctx.sectionEmptyText("explorer", { ran: false, total: 0, shown: 0, filters: [] }), "Run an Audit to see results");
    assert.equal(ctx.sectionEmptyText("contrast", { ran: false, total: 0, shown: 0, filters: [] }), "Run a Contrast check to see results");
    assert.equal(ctx.sectionEmptyText("tabWalk", { ran: false, total: 0, shown: 0, filters: [] }), "Run a Tab Walk to see results");
  });

  it("ran with zero rows → clean-result text, never 'no results match'", () => {
    assert.equal(ctx.sectionEmptyText("explorer", { ran: true, total: 0, shown: 0, filters: [] }), "No issues found — this scan came back clean");
    assert.equal(ctx.sectionEmptyText("tabWalk", { ran: true, total: 0, shown: 0, filters: [] }), "No focusable elements were walked");
    assert.match(ctx.sectionEmptyText("contrast", { ran: true, total: 0, shown: 0, filters: [] }), /no measurable text/);
  });

  it("rows hidden by filters → names the filters and the count", () => {
    const msg = ctx.sectionEmptyText("explorer", { ran: true, total: 7, shown: 0, filters: ["needs-review chip"] });
    assert.equal(msg, "All 7 rows hidden by needs-review chip");
    const msg2 = ctx.sectionEmptyText("explorer", { ran: true, total: 3, shown: 0, filters: ["severity tab", "search"] });
    assert.equal(msg2, "All 3 rows hidden by severity tab + search");
  });

  it("contrast fail/pass tabs get dedicated texts when no user filter", () => {
    assert.equal(ctx.sectionEmptyText("contrast", { ran: true, total: 5, shown: 0, filters: [], contrastFilter: "fail" }), "No failures — all sampled text passes");
    assert.equal(ctx.sectionEmptyText("contrast", { ran: true, total: 5, shown: 0, filters: [], contrastFilter: "pass" }), "No passing samples in this check");
  });

  it("rows visible → null (empty state hidden)", () => {
    assert.equal(ctx.sectionEmptyText("explorer", { ran: true, total: 5, shown: 5, filters: [] }), null);
    assert.equal(ctx.sectionEmptyText("contrast", { ran: true, total: 5, shown: 2, filters: ["search"] }), null);
  });
});

describe("applySectionView — rows and empty state applied atomically", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("contrast with data: rows rendered, empty hidden — in the same sync pass", () => {
    ctx.state.hasRunMode.add("contrast");
    ctx.state.contrastData = [{ ratio: 2.1, apcaLc: -40, required: 4.5, largeText: false, text: "x", tag: "a", testId: "", path: "a", note: "" }];
    ctx.state.contrastSamples = [...ctx.state.contrastData];
    ctx.state.contrastFilter = "all";
    ctx.updateContrastView();
    assert.equal(ctx.els.contrastEmpty.hidden, true);
    assert.match(ctx.els.contrastTbody.innerHTML, /trow/);
  });

  it("contrast failures WITHOUT samples still render (restored/compacted records) — empty must hide", () => {
    // Persist compaction caps samples at 30→…→5 and pre-APCA records never
    // had the field: a restored past-run can be failures>0, samples=[].
    // Filter "all" used to render an empty table with the empty state
    // showing above real results (report 23.07).
    ctx.state.hasRunMode.add("contrast");
    ctx.state.contrastData = [{ ratio: 2.1, apcaLc: -40, required: 4.5, largeText: false, text: "x", tag: "a", testId: "", path: "a", note: "" }];
    ctx.state.contrastSamples = [];
    ctx.state.contrastFilter = "all";
    ctx.updateContrastView();
    assert.equal(ctx.els.contrastEmpty.hidden, true, "results exist — the empty state must disappear");
    assert.match(ctx.els.contrastTbody.innerHTML, /trow/);
    // Tab counts must use the same fallback — samples-only math showed
    // "All 0 / Pass -1" beside a visible row (Codex on #91).
    ctx.renderContrastSevTabs();
    const counts = [...ctx.els.sevTabs.innerHTML.matchAll(/sevCount">([^<]+)</g)].map((m) => m[1]);
    assert.deepEqual(counts, ["1", "1", "0"], "All=1 (fallback rows), Fail=1, Pass=0 — never negative");
  });

  it("contrast without data: empty visible with CTA text, zero rows", () => {
    ctx.state.contrastData = [];
    ctx.state.contrastSamples = [];
    ctx.updateContrastView();
    assert.equal(ctx.els.contrastEmpty.hidden, false);
    assert.equal(ctx.els.contrastEmpty.textContent, "Run a Contrast check to see results");
    assert.equal(ctx.els.contrastTbody.innerHTML, "");
  });

  it("tab walk: stops merged with events — one row per walked element, issues flagged", () => {
    ctx.renderTabWalk({
      totalFocusables: 5, walked: 3,
      stops: [
        { i: 0, tag: "a", tabIndex: 0, name: "Home", path: "nav > a", ok: true },
        { i: 1, tag: "button", tabIndex: 0, name: "Menu", path: "nav > button", ok: false },
        { i: 2, tag: "input", tabIndex: 0, name: "Search", path: "form > input", ok: true },
      ],
      events: [
        { i: 1, type: "focus_failed", path: "nav > button", name: "Menu", tabIndex: 0, note: "did not focus" },
        { i: -1, type: "dialog_no_focusables", path: "div.modal", name: "", tabIndex: 0, note: "empty dialog" },
      ],
    });
    assert.equal(ctx.els.tabWalkEmpty.hidden, true);
    const rows = ctx.els.tabTbody.innerHTML.match(/class="trow/g) || [];
    assert.equal(rows.length, 4, "3 stops + 1 page-level event");
    const issueRows = ctx.els.tabTbody.innerHTML.match(/tabIssue/g) || [];
    assert.equal(issueRows.length, 2, "focus_failed stop + dialog event flagged");
    assert.equal(ctx.state.tabData.length, 4);
  });

  it("tab walk: clean walk lists every stop instead of an empty table", () => {
    ctx.renderTabWalk({ totalFocusables: 2, walked: 2, stops: [
      { i: 0, tag: "a", tabIndex: 0, name: "A", path: "a", ok: true },
      { i: 1, tag: "a", tabIndex: 0, name: "B", path: "b", ok: true },
    ], events: [] });
    assert.equal(ctx.els.tabWalkEmpty.hidden, true);
    assert.equal((ctx.els.tabTbody.innerHTML.match(/class="trow/g) || []).length, 2);
  });

  it("tab walk: legacy events-only record still renders", () => {
    ctx.renderTabWalk({ totalFocusables: 4, walked: 4, events: [
      { i: 2, type: "focus_on_body", note: "focus fell to body" },
    ]});
    assert.equal((ctx.els.tabTbody.innerHTML.match(/class="trow/g) || []).length, 1);
    assert.equal(ctx.els.tabWalkEmpty.hidden, true);
  });
});

describe("explorer empty-state honesty", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  // confidence: "strict" → classifyReviewStatus = "automated", so the
  // needs-review chip genuinely hides them
  const FINDINGS = [
    { type: "MISSING_ALT", severity: "high", name: "img", path: "img", wcag: "1.1.1", confidence: "strict" },
    { type: "LOW_CONTRAST", severity: "medium", name: "p", path: "p", wcag: "1.4.3", confidence: "strict" },
  ];

  it("plain run with findings → rows visible, empty hidden", () => {
    ctx.state.hasRunMode.add("run");
    ctx.state.activeMode = "run";
    ctx.state.findingsByMode.run = FINDINGS;
    ctx.state.currentFindings = FINDINGS;
    ctx.renderExplorer(FINDINGS);
    assert.equal(ctx.els.explorerEmpty.hidden, true);
  });

  it("review filter hiding everything → names the chip, not 'your search'", () => {
    ctx.state.hasRunMode.add("run");
    ctx.state.activeMode = "run";
    ctx.state.findingsByMode.run = FINDINGS;
    ctx.state.currentFindings = FINDINGS;
    ctx.state.reviewFilter = true; // none of FINDINGS is needs_review
    ctx.renderExplorer(FINDINGS);
    assert.equal(ctx.els.explorerEmpty.hidden, false);
    assert.match(ctx.els.explorerEmpty.textContent, /needs-review chip/);
    assert.doesNotMatch(ctx.els.explorerEmpty.textContent, /your search/);
  });

  it("clean audit (zero findings) → clean-result text", () => {
    ctx.state.hasRunMode.add("run");
    ctx.state.activeMode = "run";
    ctx.state.findingsByMode.run = [];
    ctx.state.currentFindings = [];
    ctx.renderExplorer([]);
    assert.equal(ctx.els.explorerEmpty.hidden, false);
    assert.match(ctx.els.explorerEmpty.textContent, /came back clean/);
  });
});

describe("resetFilters — record switch clears every row-hiding filter", () => {
  it("clears reviewFilter and the integrity-pill group filter", () => {
    const ctx = createContext();
    ctx.state.reviewFilter = true;
    ctx.state.sevFilter = new ctx.Set(["high"]);
    ctx.state.contrastFilter = "fail";
    new Script("activeGroupFilter = 'depth3/focus';", { filename: "seed.js" }).runInContext(ctx);
    ctx.resetFilters();
    assert.equal(ctx.state.reviewFilter, false);
    assert.equal(ctx.state.sevFilter.size, 0);
    assert.equal(ctx.state.contrastFilter, "all");
    new Script("this.__agfAfter = activeGroupFilter;", { filename: "read.js" }).runInContext(ctx);
    assert.equal(ctx.__agfAfter, null);
  });
});
