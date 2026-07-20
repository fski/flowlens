/**
 * Flow view sub-renderers — pure HTML builders for the reworked Flow tab
 * (verdict header, filmstrip, step list, step detail, lifecycle swimlane).
 * The orchestrator renderFlow() is the only Flow-DOM writer; these are the
 * pure pieces it composes, tested without the DOM.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createContext } from "./harness.mjs";

const ctx = createContext();

const A = { sig: "A", name: "Missing alt", type: "MISSING_ALT", severity: "high", wcag: "1.1.1" };
const B = { sig: "B", name: "Low contrast", type: "LOW_CONTRAST", severity: "medium", wcag: "1.4.3" };
const C = { sig: "C", name: "No label", type: "MISSING_LABEL", severity: "high", wcag: "1.3.1" };

function mkStep(index, route, findings, extra) {
  const findingIndex = {};
  for (const f of findings) findingIndex[f.sig] = f;
  return Object.assign({ index, routeHint: route, url: "https://x.com" + route, findingIndex, hasShot: false }, extra || {});
}
function mkSess(steps, extra) {
  return Object.assign({ id: "sess1", steps, startedAt: 1, endedAt: null }, extra || {});
}

describe("flowStepViews", () => {
  it("computes per-step appeared/persisting/resolved counts", () => {
    const sess = mkSess([mkStep(1, "/a", [A, B]), mkStep(2, "/b", [B, C])]);
    const views = ctx.flowStepViews(sess);
    assert.equal(views.length, 2);
    assert.equal(views[0].appeared, 2); // first step: all appeared
    assert.equal(views[1].appeared, 1); // C
    assert.equal(views[1].persisting, 1); // B
    assert.equal(views[1].resolved, 1); // A
  });
});

describe("filmstripHtml", () => {
  it("emits one keyboard-navigable tile per step with data-step-index and label", () => {
    const sess = mkSess([mkStep(1, "/a", [A]), mkStep(2, "/b", [B])]);
    const html = ctx.filmstripHtml(sess, 1);
    const tiles = html.match(/class="filmstripTile/g) || [];
    assert.equal(tiles.length, 2);
    assert.match(html, /data-step-index="1"/);
    assert.match(html, /data-step-index="2"/);
    assert.match(html, /role="option"/);
    assert.match(html, /aria-selected="true"/); // selected step 1
    assert.match(html, /tabindex=/);
    assert.match(html, /aria-label="[^"]*[Ss]tep 1/);
  });

  it("shows a placeholder tile when a step has no screenshot", () => {
    const sess = mkSess([mkStep(1, "/a", [A], { hasShot: false })]);
    const html = ctx.filmstripHtml(sess, 1);
    assert.match(html, /filmstripTile--noshot/);
  });
});

describe("stepListHtml", () => {
  it("emits a focusable row per step with appeared/persisting/resolved badges", () => {
    const sess = mkSess([mkStep(1, "/a", [A, B]), mkStep(2, "/b", [B, C])]);
    const html = ctx.stepListHtml(sess, 2, false);
    const rows = html.match(/class="flowStepRow/g) || [];
    assert.equal(rows.length, 2);
    assert.match(html, /tabindex="0"/);
    assert.match(html, /role="listitem"|role="button"/);
    assert.match(html, /aria-current="true"/); // selected step 2
  });

  it("'unresolved blockers only' filter drops steps without unresolved blockers", () => {
    // step 1 introduces a high blocker (A), step 2 resolves it and adds only info
    const info = { sig: "I", name: "note", type: "INFO", severity: "info", wcag: "" };
    const sess = mkSess([mkStep(1, "/a", [A]), mkStep(2, "/b", [info])]);
    const all = ctx.stepListHtml(sess, 1, false).match(/flowStepRow/g) || [];
    const filtered = ctx.stepListHtml(sess, 1, true).match(/flowStepRow/g) || [];
    assert.equal(all.length, 2);
    assert.equal(filtered.length, 1); // only step 1 carries an unresolved blocker
  });
});

describe("stepDetailHtml", () => {
  it("lists appeared / resolved items and step nav buttons for the selected step", () => {
    const sess = mkSess([mkStep(1, "/a", [A]), mkStep(2, "/b", [C])]);
    const html = ctx.stepDetailHtml(sess, 2);
    assert.match(html, /Appeared/);
    assert.match(html, /Resolved/);
    assert.match(html, /No label/);   // appeared C
    assert.match(html, /Missing alt/); // resolved A (from prev step)
    assert.match(html, /data-step-nav="prev"/);
    assert.match(html, /data-step-nav="next"/);
  });

  it("empty session => placeholder, no throw", () => {
    assert.match(ctx.stepDetailHtml(mkSess([]), null), /placeholder|Record/i);
  });
});

describe("lifecycleSwimlaneHtml", () => {
  it("one labelled lane per recurring signature — severity by text, not colour only", () => {
    const sess = mkSess([mkStep(1, "/a", [A, B]), mkStep(2, "/b", [A])]);
    const html = ctx.lifecycleSwimlaneHtml(sess);
    const lanes = html.match(/class="swimLane/g) || [];
    assert.equal(lanes.length, 2);
    assert.match(html, /Missing alt/);
    assert.match(html, /high/i); // severity conveyed as text
  });
});
