/**
 * Hang + clipboard fixes (Piotr's manual on the DH help center, 23.07):
 *
 * 1. Recording froze mid-session: chrome.devtools.inspectedWindow.eval can
 *    LOSE its callback when the page navigates mid-eval. captureStepOptionC
 *    awaited fetchInspectedTitleBestEffort inside its try — an unresolved
 *    promise meant finally never ran and sessionState.inFlight stayed true
 *    forever. Fix: hard eval timeout + a 90s capture watchdog.
 * 2. "Copy JSON" silently copied "{}" during flow sessions (no Snap result),
 *    and session JSON had NO clipboard path at all (download only, while MD
 *    had copy). Fix: guard toast + Copy Session JSON menu item.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createContext } from "./harness.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WIREUP_SRC = readFileSync(join(__dirname, "..", "src", "panel", "panel-90-wireup.js"), "utf8");
const CAPTURE_SRC = readFileSync(join(__dirname, "..", "src", "panel", "panel-45-capture.js"), "utf8");
const HTML_SRC = readFileSync(join(__dirname, "..", "src", "panel", "panel.html"), "utf8");

// The harness stubs setTimeout to fire synchronously; the timeout behavior
// under test needs real timers, so inject the host's.
function ctxWithRealTimers() {
  const ctx = createContext();
  ctx.setTimeout = (fn, ms) => setTimeout(fn, ms);
  ctx.clearTimeout = (t) => clearTimeout(t);
  return ctx;
}

describe("fetchInspectedTitleBestEffort eval timeout", () => {
  it("resolves empty when the eval callback is never invoked (lost on navigation)", async () => {
    const ctx = ctxWithRealTimers();
    ctx.chrome.devtools.inspectedWindow.eval = () => { /* callback dropped */ };
    const t0 = Date.now();
    const title = await ctx.fetchInspectedTitleBestEffort();
    assert.equal(title, "");
    const elapsed = Date.now() - t0;
    assert.ok(elapsed >= 1400 && elapsed < 5000, `should time out around 1.5s, took ${elapsed}ms`);
  });

  it("resolves the title immediately when the eval works", async () => {
    const ctx = ctxWithRealTimers();
    ctx.chrome.devtools.inspectedWindow.eval = (_expr, cb) => cb("Help Center", null);
    assert.equal(await ctx.fetchInspectedTitleBestEffort(), "Help Center");
  });

  it("resolves empty when eval throws synchronously", async () => {
    const ctx = ctxWithRealTimers();
    ctx.chrome.devtools.inspectedWindow.eval = () => { throw new Error("target detached"); };
    assert.equal(await ctx.fetchInspectedTitleBestEffort(), "");
  });
});

describe("capture watchdog + clipboard wiring", () => {
  it("captureStepOptionC anchors inFlightSince for the watchdog", () => {
    assert.match(CAPTURE_SRC, /inFlightSince = Date\.now\(\)/);
  });

  it("watchdog resets a stuck capture and fails loud", () => {
    assert.match(WIREUP_SRC, /CAPTURE_WATCHDOG_MS/);
    const wd = WIREUP_SRC.slice(WIREUP_SRC.indexOf("CAPTURE_WATCHDOG_MS"));
    assert.match(wd, /capture-watchdog-reset/, "reset must be visible in the nav log");
    assert.match(wd, /sessionState\.inFlight = false/);
  });

  it("Copy JSON refuses to silently copy an empty Snap result", () => {
    const handler = WIREUP_SRC.slice(WIREUP_SRC.indexOf('els.copyJson.addEventListener'));
    assert.match(handler.slice(0, 600), /if \(!state\.lastResult\)/);
  });

  it("session JSON has a clipboard path (menu item + handler + fn)", () => {
    assert.match(HTML_SRC, /copySessionJsonMenu/);
    assert.match(WIREUP_SRC, /copySessionJson\(\)/);
  });
});
