/**
 * Structural tests for the vendored dom-accessibility-api bundle
 * (src/vendor/accname.js). Verifies the plain-script IIFE defines the
 * __FlowLensAccName global with the expected API surface, and that the
 * provenance header (MIT license + version marker) is intact.
 *
 * A full DOM-backed accessible-name test is intentionally out of scope —
 * the bundle is vendored unmodified from upstream, which carries its own
 * spec (wpt) test suite. Rebuild via scripts/vendor-accname.mjs.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const VENDOR_PATH = join(__dirname, "..", "src", "vendor", "accname.js");

const source = readFileSync(VENDOR_PATH, "utf8");

function runVendorBundle() {
  const ctx = createContext({
    Object, Array, String, Number, Boolean, Symbol,
    Math, JSON, RegExp, Error, TypeError, RangeError,
    Map, Set, WeakMap, WeakSet,
    parseInt, parseFloat, isNaN, isFinite,
    console,
  });
  const script = new Script(source, { filename: "accname.js" });
  script.runInContext(ctx);
  // Top-level `var __FlowLensAccName = ...` lands on the vm context object.
  return new Script("__FlowLensAccName").runInContext(ctx);
}

describe("vendored accname bundle — structure", () => {
  it("is a plain-script IIFE that defines the __FlowLensAccName global", () => {
    const global = runVendorBundle();
    assert.ok(global, "__FlowLensAccName should be defined after evaluating the bundle");
    assert.equal(typeof global, "object");
  });

  it("exposes computeAccessibleName as a function", () => {
    const global = runVendorBundle();
    assert.equal(typeof global.computeAccessibleName, "function");
  });

  it("exposes computeAccessibleDescription as a function", () => {
    const global = runVendorBundle();
    assert.equal(typeof global.computeAccessibleDescription, "function");
  });

  it("does not use import/export module syntax (must run as a plain script)", () => {
    // Evaluating via new Script() above already guarantees script (non-module)
    // grammar; also assert there is no top-level export statement.
    assert.doesNotMatch(source, /^\s*export\s/m);
    assert.doesNotMatch(source, /^\s*import\s/m);
  });
});

describe("vendored accname bundle — provenance header", () => {
  it("names the upstream package and carries a version marker", () => {
    assert.match(source, /dom-accessibility-api/);
    assert.match(source, /Version:\s+\d+\.\d+\.\d+/);
  });

  it("references the MIT license and upstream URL", () => {
    assert.match(source, /MIT/);
    assert.match(source, /github\.com\/eps1lon\/dom-accessibility-api/);
  });

  it("carries the vendored-unmodified rebuild note", () => {
    assert.match(source, /vendored unmodified; rebuild via scripts\/vendor-accname\.mjs/);
  });
});
