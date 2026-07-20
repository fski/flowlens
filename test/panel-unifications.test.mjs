/**
 * Shared predicates/constants extracted from duplicated inline copies
 * (panel audit). Guards the single source of truth.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { createContext } from "./harness.mjs";

describe("isCrossFrameFinding", () => {
  const ctx = createContext();
  it("true only for an elementless multiframe-group finding", () => {
    // MULTIFRAME_* rules map to group depth3/multiframe in RULE_TO_WCAG.
    new Script("this.__mfType = Object.keys(RULE_TO_WCAG).find(k => RULE_TO_WCAG[k] && RULE_TO_WCAG[k].group === 'depth3/multiframe');", { filename: "t.js" }).runInContext(ctx);
    const mf = ctx.__mfType;
    assert.ok(mf, "expected a multiframe rule in RULE_TO_WCAG");
    assert.equal(ctx.isCrossFrameFinding({ type: mf }), true);               // no el
    assert.equal(ctx.isCrossFrameFinding({ type: mf, el: {} }), false);      // has el
    assert.equal(ctx.isCrossFrameFinding({ type: "MISSING_ALT" }), false);   // wrong group
    assert.equal(ctx.isCrossFrameFinding({}), false);
    assert.equal(ctx.isCrossFrameFinding(null), false);
  });
});

describe("UNKNOWN_FRAME_KEY", () => {
  const ctx = createContext();
  it("is the single canonical unknown-frame sentinel", () => {
    new Script("this.__ufk = typeof UNKNOWN_FRAME_KEY !== 'undefined' ? UNKNOWN_FRAME_KEY : null;", { filename: "t.js" }).runInContext(ctx);
    assert.equal(ctx.__ufk, "fk::unknown::unknown::root::00000000");
  });
});

describe("currentBestEntry", () => {
  const ctx = createContext();
  it("prefers bestEntry, falls back to best, else null", () => {
    ctx.state.lastResult = { bestEntry: { a: 1 }, best: { b: 2 } };
    assert.equal(ctx.currentBestEntry().a, 1);
    ctx.state.lastResult = { best: { b: 2 } };
    assert.equal(ctx.currentBestEntry().b, 2);
    ctx.state.lastResult = null;
    assert.equal(ctx.currentBestEntry(), null);
  });
});

describe("SEV_SCORE", () => {
  const ctx = createContext();
  it("is the single severity→summaryScore weight table", () => {
    new Script("this.__ss = typeof SEV_SCORE !== 'undefined' ? SEV_SCORE : null;", { filename: "t.js" }).runInContext(ctx);
    // Weights feed summaryScore in step signatures / CI diff reports —
    // a drifted weight silently changes exported scores.
    assert.ok(ctx.__ss, "SEV_SCORE must exist");
    assert.equal(ctx.__ss.high, 5);
    assert.equal(ctx.__ss.medium, 3);
    assert.equal(ctx.__ss.low, 1);
    assert.equal(ctx.__ss.info, 0);
  });
  it("no inline copies of the weight map remain in panel parts", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = new URL("../src/panel/", import.meta.url).pathname;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      const hits = src.match(/high: 5, medium: 3/g) || [];
      const allowed = f === "panel-00-core.js" ? 1 : 0;
      assert.equal(hits.length, allowed, `${f}: inline severity weight map`);
    }
  });
});

describe("envTag single source of truth", () => {
  it("only getCurrentScopeInfo builds the `origin • env` template", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = new URL("../src/panel/", import.meta.url).pathname;
    // Both literal "—"/"•" and —/• escaped spellings existed.
    const tpl = /\|\| "(?:—|\\u2014)"\} (?:•|\\u2022) \$\{/g;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".js"))) {
      const src = fs.readFileSync(path.join(dir, f), "utf8");
      const hits = src.match(tpl) || [];
      const allowed = f === "panel-20-views.js" ? 1 : 0;
      assert.equal(hits.length, allowed, `${f}: inline envTag template`);
    }
  });
});

describe("attachRovingTabindex", () => {
  const ctx = createContext();
  function makeBar(n) {
    const activated = [];
    const focused = [];
    const tabs = Array.from({ length: n }, (_, i) => ({
      i,
      dataset: { tab: `t${i}`, action: `a${i}` },
      focus() { focused.push(this.i); },
    }));
    const listeners = {};
    const container = {
      querySelectorAll: () => tabs,
      addEventListener: (type, fn) => { listeners[type] = fn; },
    };
    ctx.attachRovingTabindex(container, (tab) => activated.push(tab.i));
    const fire = (key, target) => {
      let prevented = false;
      listeners.keydown({ key, target, preventDefault: () => { prevented = true; } });
      return prevented;
    };
    return { tabs, activated, focused, fire };
  }

  it("ArrowRight/ArrowLeft cycle with wrap, activating and focusing", () => {
    const { tabs, activated, focused, fire } = makeBar(3);
    assert.equal(fire("ArrowRight", tabs[2]), true); // wraps 2 → 0
    assert.equal(fire("ArrowLeft", tabs[0]), true);  // wraps 0 → 2
    assert.deepEqual(activated.join(","), "0,2");
    assert.deepEqual(focused.join(","), "0,2");
  });

  it("Home/End jump to first/last", () => {
    const { tabs, activated, fire } = makeBar(3);
    fire("End", tabs[0]);
    fire("Home", tabs[2]);
    assert.equal(activated.join(","), "2,0");
  });

  it("ignores unrelated keys and foreign targets", () => {
    const { tabs, activated, fire } = makeBar(3);
    assert.equal(fire("Enter", tabs[0]), false);       // key not handled
    assert.equal(fire("ArrowRight", { i: 99 }), false); // target outside bar
    assert.equal(activated.length, 0);
  });

  it("tolerates a missing container", () => {
    ctx.attachRovingTabindex(null, () => {});
  });
});
