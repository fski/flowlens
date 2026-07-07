/**
 * Tests for the contrast fix suggestion (Stark/WAVE pattern) added to the
 * snippet's contrastScan: each failure gains suggestedColor/suggestedRatio
 * and the note is extended with "→ try #rrggbb (x.x:1)".
 *
 * Executes the real helper functions by extracting the marked
 * "Contrast Math & Suggestion Helpers" block from the snippet source and
 * running it in a bare vm context (same pattern as test/snippet-harness.mjs),
 * plus source-level assertions on the contrastScan wiring.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SNIPPET_PATH = join(__dirname, "..", "src", "snippet", "a11y-audit-snippet.js");
const source = readFileSync(SNIPPET_PATH, "utf8");

const START = "// ──────── Contrast Math & Suggestion Helpers ────";
const END = "// ──────── End Contrast Math & Suggestion Helpers ────";

function createContrastContext() {
  const startIdx = source.indexOf(START);
  const endIdx = source.indexOf(END);
  if (startIdx === -1 || endIdx === -1) {
    throw new Error("Could not find contrast helper markers in snippet source");
  }
  const block = source.slice(startIdx, endIdx);
  const ctx = createContext({
    Object, Array, String, Number, Boolean, Symbol,
    Math, JSON, RegExp, Error, TypeError, RangeError,
    Map, Set, WeakMap, WeakSet,
    parseInt, parseFloat, isNaN, isFinite,
    console,
  });
  new Script(block + `
    this.__contrastRatio = contrastRatio;
    this.__rgbToHsl = rgbToHsl;
    this.__hslToRgb = hslToRgb;
    this.__rgbToHex = rgbToHex;
    this.__suggestContrastColor = suggestContrastColor;
  `, { filename: "snippet-contrast.js" }).runInContext(ctx);
  return ctx;
}

const hexToRgb = (hex) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});

const ctx = createContrastContext();
const contrastRatio = new Script("__contrastRatio").runInContext(ctx);
const rgbToHsl = new Script("__rgbToHsl").runInContext(ctx);
const suggest = new Script("__suggestContrastColor").runInContext(ctx);

describe("contrast suggestion helper — extraction", () => {
  it("suggestContrastColor exists in the snippet and is extractable", () => {
    assert.equal(typeof suggest, "function");
    assert.equal(typeof contrastRatio, "function");
  });
});

describe("contrast suggestion helper — numeric behavior", () => {
  const WHITE = { r: 255, g: 255, b: 255 };

  it("#777777 on #ffffff at 4.5 → suggested color really reaches >= 4.5", () => {
    const fg = hexToRgb("#777777");
    assert.ok(contrastRatio(fg, WHITE) < 4.5, "precondition: #777 on #fff fails AA");
    const s = suggest(fg, WHITE, 4.5);
    assert.ok(s, "a suggestion should be produced");
    assert.match(s.hex, /^#[0-9a-f]{6}$/);
    const achieved = contrastRatio(hexToRgb(s.hex), WHITE);
    assert.ok(achieved + 1e-6 >= 4.5, `suggested ${s.hex} should reach 4.5, got ${achieved}`);
    assert.ok(Math.abs(s.ratio - achieved) < 0.01, "reported ratio matches the suggested color");
  });

  it("keeps the hue while darkening a saturated failing color", () => {
    const fg = hexToRgb("#ff6666"); // light red on white — fails 4.5
    assert.ok(contrastRatio(fg, WHITE) < 4.5);
    const s = suggest(fg, WHITE, 4.5);
    assert.ok(s);
    const suggested = hexToRgb(s.hex);
    assert.ok(contrastRatio(suggested, WHITE) + 1e-6 >= 4.5);
    const h0 = rgbToHsl(fg).h;
    const h1 = rgbToHsl(suggested).h;
    // Hue is preserved modulo 8-bit rounding.
    const dh = Math.min(Math.abs(h1 - h0), 1 - Math.abs(h1 - h0));
    assert.ok(dh < 0.03, `hue should be preserved (Δh=${dh})`);
  });

  it("moves toward white on dark backgrounds", () => {
    const bg = { r: 20, g: 20, b: 30 };
    const fg = { r: 80, g: 80, b: 90 }; // dark gray on near-black — fails
    assert.ok(contrastRatio(fg, bg) < 4.5);
    const s = suggest(fg, bg, 4.5);
    assert.ok(s);
    assert.ok(contrastRatio(hexToRgb(s.hex), bg) + 1e-6 >= 4.5);
  });

  it("suggestion is minimal-ish: does not overshoot all the way to the pole when unnecessary", () => {
    const s = suggest(hexToRgb("#777777"), WHITE, 4.5);
    assert.ok(s);
    assert.notEqual(s.hex, "#000000", "should stop near the threshold, not slam to black");
    assert.ok(s.ratio < 6.0, `should stay reasonably close to 4.5, got ${s.ratio}`);
  });

  it("an already-passing color needs at most a trivial shift", () => {
    const fg = { r: 0, g: 0, b: 0 };
    const s = suggest(fg, WHITE, 4.5);
    assert.ok(s);
    assert.ok(s.ratio + 1e-6 >= 4.5);
  });

  it("returns null when no same-hue color can pass (mid-gray bg, AAA)", () => {
    const bg = { r: 128, g: 128, b: 128 };
    // Best achievable on #808080 is ~5.3:1 (black); 7.0 is impossible.
    const s = suggest({ r: 100, g: 100, b: 100 }, bg, 7.0);
    assert.equal(s, null);
  });
});

describe("contrastScan wiring — source-level", () => {
  it("failures gain suggestedColor and suggestedRatio", () => {
    const scanStart = source.indexOf("const contrastScan =");
    assert.ok(scanStart > -1, "contrastScan should exist");
    const scanBody = source.slice(scanStart, source.indexOf("const api =", scanStart));
    assert.ok(scanBody.includes("suggestContrastColor(effectiveFg, bg, req)"),
      "contrastScan should compute a suggestion against the effective background");
    assert.ok(scanBody.includes("suggestedColor:"), "failure objects should carry suggestedColor");
    assert.ok(scanBody.includes("suggestedRatio:"), "failure objects should carry suggestedRatio");
  });

  it("failure note is extended with the → try #rrggbb (ratio:1) hint", () => {
    assert.ok(source.includes("→ try ${suggestion.hex} (${suggestion.ratio}:1)"),
      "note should append the suggested color and its ratio");
  });

  it("suggestion failure is graceful (note falls back, fields become null)", () => {
    assert.ok(source.includes("suggestedColor: suggestion ? suggestion.hex : null"));
    assert.ok(source.includes("suggestedRatio: suggestion ? suggestion.ratio : null"));
  });
});
