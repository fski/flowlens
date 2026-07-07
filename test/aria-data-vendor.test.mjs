/**
 * Structural tests for the vendored aria-query role dataset
 * (src/vendor/aria-data.js). Verifies the plain script defines the
 * __FlowLensAriaData global with the expected shape, that the provenance
 * header (Apache-2.0 license + version marker) is intact, that known
 * WAI-ARIA 1.2 semantics are present (checkbox requires aria-checked), and
 * that the snippet/service-worker integration points reference the data
 * with the graceful-fallback pattern.
 *
 * Rebuild the dataset via scripts/vendor-aria-data.mjs (npm run vendor:aria).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const VENDOR_PATH = join(ROOT, "src", "vendor", "aria-data.js");
const SNIPPET_PATH = join(ROOT, "src", "snippet", "a11y-audit-snippet.js");
const SW_PATH = join(ROOT, "src", "sw", "sw.js");

const source = readFileSync(VENDOR_PATH, "utf8");
const MAX_BYTES = 80 * 1024;

function runVendorScript() {
  const ctx = createContext({
    Object, Array, String, Number, Boolean, Symbol,
    Math, JSON, RegExp, Error, TypeError, RangeError,
    Map, Set, WeakMap, WeakSet,
    parseInt, parseFloat, isNaN, isFinite,
    console,
  });
  const script = new Script(source, { filename: "aria-data.js" });
  script.runInContext(ctx);
  // Top-level `var __FlowLensAriaData = ...` lands on the vm context object.
  return new Script("__FlowLensAriaData").runInContext(ctx);
}

describe("vendored aria-query dataset — structure", () => {
  it("is a plain script that defines the __FlowLensAriaData global", () => {
    const data = runVendorScript();
    assert.ok(data, "__FlowLensAriaData should be defined after evaluating the script");
    assert.equal(typeof data, "object");
  });

  it("uses a top-level `var` declaration (idempotent re-injection into the page)", () => {
    assert.match(source, /^var __FlowLensAriaData = \{/m);
    assert.doesNotMatch(source, /^\s*(const|let)\s+__FlowLensAriaData/m);
  });

  it("does not use import/export module syntax (must run as a plain script)", () => {
    assert.doesNotMatch(source, /^\s*export\s/m);
    assert.doesNotMatch(source, /^\s*import\s/m);
  });

  it("carries package metadata matching the provenance header", () => {
    const data = runVendorScript();
    assert.equal(data.package, "aria-query");
    assert.match(data.version, /^\d+\.\d+\.\d+$/);
    assert.equal(data.license, "Apache-2.0");
  });

  it("exposes a roles map with a plausible WAI-ARIA 1.2 role count", () => {
    const data = runVendorScript();
    assert.equal(typeof data.roles, "object");
    const count = Object.keys(data.roles).length;
    assert.ok(count >= 100, `expected >= 100 roles, got ${count}`);
  });

  it("stays compact (under ~80KB)", () => {
    assert.ok(Buffer.byteLength(source) <= MAX_BYTES,
      `dataset should stay under ${MAX_BYTES} bytes, got ${Buffer.byteLength(source)}`);
  });
});

describe("vendored aria-query dataset — known role semantics", () => {
  const roles = runVendorScript().roles;

  it("checkbox requires aria-checked (and is a non-abstract widget)", () => {
    const checkbox = roles.checkbox;
    assert.ok(checkbox, "checkbox role should exist");
    assert.ok(checkbox.requiredProps.includes("aria-checked"));
    assert.ok(!checkbox.abstract);
    assert.ok(checkbox.superClass.includes("widget"));
  });

  it("slider requires aria-valuenow; combobox requires aria-controls + aria-expanded", () => {
    assert.ok(roles.slider.requiredProps.includes("aria-valuenow"));
    assert.ok(roles.combobox.requiredProps.includes("aria-controls"));
    assert.ok(roles.combobox.requiredProps.includes("aria-expanded"));
  });

  it("row requires table/grid/treegrid/rowgroup context; listbox requires option children", () => {
    for (const ctx of ["grid", "rowgroup", "table", "treegrid"]) {
      assert.ok(roles.row.requiredContext.includes(ctx), `row context should include ${ctx}`);
    }
    assert.ok(roles.listbox.requiredOwned.includes("option"));
  });

  it("marks abstract roles (e.g. widget, roletype) as abstract", () => {
    assert.equal(roles.widget.abstract, true);
    assert.equal(roles.roletype.abstract, true);
    const abstractCount = Object.values(roles).filter(r => r.abstract).length;
    assert.equal(abstractCount, 12, "WAI-ARIA 1.2 defines 12 abstract roles");
  });

  it("records prohibited props (generic prohibits aria-label/aria-labelledby)", () => {
    assert.ok(roles.generic.prohibitedProps.includes("aria-label"));
    assert.ok(roles.generic.prohibitedProps.includes("aria-labelledby"));
  });
});

describe("vendored aria-query dataset — provenance header", () => {
  it("names the upstream package and carries a version marker", () => {
    assert.match(source, /aria-query/);
    assert.match(source, /Version:\s+\d+\.\d+\.\d+/);
  });

  it("references the Apache-2.0 license and upstream URL", () => {
    assert.match(source, /Apache-2\.0/);
    assert.match(source, /github\.com\/A11yance\/aria-query/);
  });

  it("carries the rebuild note", () => {
    assert.match(source, /rebuild via scripts\/vendor-aria-data\.mjs/i);
  });
});

describe("aria-data integration — snippet + service worker", () => {
  const snippet = readFileSync(SNIPPET_PATH, "utf8");
  const sw = readFileSync(SW_PATH, "utf8");

  it("snippet prefers window.__FlowLensAriaData with hand-maintained fallback", () => {
    assert.ok(snippet.includes("window.__FlowLensAriaData"),
      "snippet should read the injected global");
    assert.match(snippet, /const REQUIRED_ARIA_PROPS = \{/,
      "hand-maintained required-props fallback table should remain");
    for (const name of [
      "EFFECTIVE_VALID_ROLES",
      "EFFECTIVE_REQUIRED_CHILDREN",
      "EFFECTIVE_REQUIRED_PARENT",
      "EFFECTIVE_REQUIRED_ARIA_PROPS",
    ]) {
      assert.ok(snippet.includes(name), `snippet should derive ${name}`);
    }
  });

  it("rules consume the effective (data-preferred) tables", () => {
    assert.ok(snippet.includes("EFFECTIVE_VALID_ROLES.has(rolePrimary)"));
    assert.ok(snippet.includes("Object.entries(EFFECTIVE_REQUIRED_CHILDREN)"));
    assert.ok(snippet.includes("Object.entries(EFFECTIVE_REQUIRED_PARENT)"));
    assert.ok(snippet.includes("Object.entries(EFFECTIVE_REQUIRED_ARIA_PROPS)"));
  });

  it("service worker injects aria-data.js between accname.js and the snippet", () => {
    assert.ok(sw.includes('const ARIA_DATA_FILE = "aria-data.js"'));
    const matches = sw.match(/files: \[ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE\]/g) || [];
    assert.ok(matches.length >= 3,
      `all injection sites should use [ACCNAME_FILE, ARIA_DATA_FILE, SNIPPET_FILE], found ${matches.length}`);
    assert.doesNotMatch(sw, /files: \[ACCNAME_FILE, SNIPPET_FILE\]/,
      "no injection site should omit the aria data file");
  });

  it("snippet still runs without the data (fallback tables in force)", () => {
    // The effective tables must resolve even when window.__FlowLensAriaData
    // is absent — guarded by `typeof window !== "undefined"` + try/catch.
    assert.match(snippet, /typeof window !== "undefined" \? window\.__FlowLensAriaData : null/);
  });
});
