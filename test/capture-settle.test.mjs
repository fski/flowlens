/**
 * Capture settle tests — the pure predicates that let observe()/watch() end
 * their fixed windows early when the page has settled, plus source-scan
 * guards that the capture path (and ONLY the capture path) opts in.
 *
 * Record-mode perf: observe held a hard 12s window (watch 40s) per frame per
 * step even on fully static pages — measured 12008ms wall clock for a 3ms
 * audit. Early-settle turns that into ~2.7s without changing manual-console
 * or Snap-tab RUN_AUDIT semantics (those stay full-window: the user is told
 * to interact with the page during the window).
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSnippetSettleContext } from "./snippet-harness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPET_SRC = readFileSync(join(__dirname, "..", "src", "snippet", "a11y-audit-snippet.js"), "utf8");
const SW_SRC = readFileSync(join(__dirname, "..", "src", "sw", "sw.js"), "utf8");

const ctx = createSnippetSettleContext();

// ══════════════════════════════════════════════════════════════════════
// observeShouldSettle
// ══════════════════════════════════════════════════════════════════════

describe("observeShouldSettle", () => {
  const base = { ticksDone: 4, minTicks: 4, settleTicks: 3, quietStreak: 3 };

  it("settles when enough ticks ran and the streak is quiet", () => {
    assert.equal(ctx.__observeShouldSettle({ ...base }), true);
  });

  it("is disabled when settleTicks is 0 (default: manual observe keeps full window)", () => {
    assert.equal(ctx.__observeShouldSettle({ ...base, settleTicks: 0 }), false);
  });

  it("never settles before minTicks even if quiet", () => {
    assert.equal(ctx.__observeShouldSettle({ ...base, ticksDone: 3 }), false);
  });

  it("does not settle while the page is still active (streak below threshold)", () => {
    assert.equal(ctx.__observeShouldSettle({ ...base, quietStreak: 2 }), false);
  });

  it("settles later once the streak recovers after activity", () => {
    assert.equal(ctx.__observeShouldSettle({ ...base, ticksDone: 9, quietStreak: 3 }), true);
  });
});

// ══════════════════════════════════════════════════════════════════════
// watchShouldSettle
// ══════════════════════════════════════════════════════════════════════

describe("watchShouldSettle", () => {
  const base = { elapsedMs: 8000, minMs: 8000, settleMs: 5000, quietForMs: 5000 };

  it("settles when past minMs and quiet for settleMs", () => {
    assert.equal(ctx.__watchShouldSettle({ ...base }), true);
  });

  it("is disabled when settleMs is 0 (default: manual watch keeps full window)", () => {
    assert.equal(ctx.__watchShouldSettle({ ...base, settleMs: 0 }), false);
  });

  it("never settles before minMs even if quiet the whole time", () => {
    assert.equal(ctx.__watchShouldSettle({ ...base, elapsedMs: 7800, quietForMs: 7800 }), false);
  });

  it("does not settle while loader/announcement activity is recent", () => {
    assert.equal(ctx.__watchShouldSettle({ ...base, elapsedMs: 20000, quietForMs: 4800 }), false);
  });
});

// ══════════════════════════════════════════════════════════════════════
// Wiring guards (source scan) — predicates are actually used, and only the
// capture path opts in.
// ══════════════════════════════════════════════════════════════════════

describe("settle wiring", () => {
  it("observe() consults observeShouldSettle and reports settledEarly", () => {
    assert.match(SNIPPET_SRC, /observeShouldSettle\(\{/, "observe must call the predicate");
    assert.match(SNIPPET_SRC, /finish\(true\)/, "observe must actually finish early (a parameter default alone would satisfy a bare settledEarly match)");
    assert.match(SNIPPET_SRC, /finalize\(true\)/, "watch must actually finalize early");
  });

  it("watch() consults watchShouldSettle", () => {
    assert.match(SNIPPET_SRC, /watchShouldSettle\(\{/, "watch must call the predicate");
  });

  it("capture-context observe skips the blanket transition window and ticks faster; defaults preserve old behavior", () => {
    assert.match(SNIPPET_SRC, /transitionTicks = 2/, "default transition window stays 2 ticks (old `tickIndex <= 1`)");
    assert.match(SNIPPET_SRC, /tickIndex < transitionTicks/, "window must be derived from the option");
    assert.match(SW_SRC, /intervalMs:\s*600[\s\S]{0,80}transitionTicks:\s*0/, "fastSettle observe passes intervalMs 600 + transitionTicks 0");
  });

  it("sw CAPTURE_STEP opts into fastSettle; RUN_AUDIT does not", () => {
    const captureBlock = SW_SRC.slice(SW_SRC.indexOf('msg.type === "CAPTURE_STEP"', SW_SRC.indexOf("chrome.runtime.onMessage")));
    assert.match(captureBlock, /fastSettle:\s*true/, "CAPTURE_STEP must pass fastSettle: true");
    const runAuditStart = SW_SRC.indexOf('msg.type === "RUN_AUDIT"', SW_SRC.indexOf("chrome.runtime.onMessage"));
    const runAuditBlock = SW_SRC.slice(runAuditStart, SW_SRC.indexOf('msg.type === "CAPTURE_STEP"', runAuditStart));
    assert.doesNotMatch(runAuditBlock, /fastSettle:\s*true/, "RUN_AUDIT keeps the full window (user interacts during it)");
  });
});
