#!/usr/bin/env node
/**
 * Vendor script for aria-query role data — the generated WAI-ARIA 1.2 role
 * dataset used by the audit snippet (injected as aria-data.js between
 * accname.js and a11y-audit-snippet.js).
 *
 * Fetches the pinned package version from the npm registry via `npm pack`
 * (NOT added to package.json dependencies — this is a vendored dataset),
 * loads its rolesMap in Node, extracts a compact projection of the fields
 * the snippet rules actually use, and writes src/vendor/aria-data.js as a
 * plain script defining the global `__FlowLensAriaData` with a provenance
 * header.
 *
 * Extracted per role (empty fields omitted to keep the dataset compact):
 *   requiredProps   — required ARIA states/properties (attribute names)
 *   superClass      — flattened superclass role names (presence/ancestry)
 *   requiredContext — required parent (context) roles (requiredContextRole)
 *   requiredOwned   — required owned (child) roles, flattened alternatives
 *                     (requiredOwnedElements)
 *   prohibitedProps — ARIA properties prohibited on the role
 *   nameRequired    — accessibleNameRequired flag
 *   abstract        — abstract roles (invalid for authors, kept for ancestry)
 * The large elementRoles/roleElements concept maps are pruned — no snippet
 * rule consumes them.
 *
 * Usage:
 *   npm run vendor:aria                       — re-vendor the pinned version
 *   node scripts/vendor-aria-data.mjs 5.3.2   — vendor a specific version
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const PACKAGE_NAME = "aria-query";
const PINNED_VERSION = "5.3.2";
const UPSTREAM_URL = "https://github.com/A11yance/aria-query";
const GLOBAL_NAME = "__FlowLensAriaData";
const MAX_BYTES = 80 * 1024; // compactness guard (~80KB)

const ROOT = join(import.meta.dirname, "..");
const OUT_FILE = join(ROOT, "src", "vendor", "aria-data.js");

const version = process.argv[2] || PINNED_VERSION;

function extractRoles(rolesMap) {
  const uniq = (arr) => [...new Set(arr)];
  const entries = [...rolesMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  const roles = {};
  for (const [name, def] of entries) {
    const entry = {};
    if (def.abstract) entry.abstract = true;
    if (def.accessibleNameRequired) entry.nameRequired = true;
    const requiredProps = Object.keys(def.requiredProps || {}).sort();
    if (requiredProps.length) entry.requiredProps = requiredProps;
    const superClass = uniq((def.superClass || []).flat());
    if (superClass.length) entry.superClass = superClass;
    const requiredContext = uniq(def.requiredContextRole || []);
    if (requiredContext.length) entry.requiredContext = requiredContext;
    const requiredOwned = uniq((def.requiredOwnedElements || []).flat());
    if (requiredOwned.length) entry.requiredOwned = requiredOwned;
    const prohibitedProps = uniq(def.prohibitedProps || []);
    if (prohibitedProps.length) entry.prohibitedProps = prohibitedProps;
    roles[name] = entry;
  }
  return roles;
}

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), "flowlens-vendor-aria-"));
  try {
    // ── 1. Fetch tarball from the npm registry ──
    console.log(`  Fetching ${PACKAGE_NAME}@${version} via npm pack ...`);
    execSync(`npm pack ${PACKAGE_NAME}@${version}`, { cwd: workDir, stdio: "pipe" });
    const tarball = readdirSync(workDir).find(f => f.endsWith(".tgz"));
    if (!tarball) throw new Error("npm pack produced no tarball");
    execSync(`tar xzf "${tarball}"`, { cwd: workDir, stdio: "pipe" });
    const pkgDir = join(workDir, "package");

    // ── 2. Verify metadata (name, version, license) ──
    const pkgJson = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8"));
    if (pkgJson.name !== PACKAGE_NAME) throw new Error(`Unexpected package name: ${pkgJson.name}`);
    if (pkgJson.version !== version) throw new Error(`Unexpected version: ${pkgJson.version}`);
    if (pkgJson.license !== "Apache-2.0") throw new Error(`Unexpected license: ${pkgJson.license}`);
    const deps = Object.keys(pkgJson.dependencies || {});
    if (deps.length > 0) throw new Error(`Expected zero runtime deps, found: ${deps.join(", ")}`);

    // ── 3. Load the package in Node and extract the compact dataset ──
    const require = createRequire(import.meta.url);
    const ariaQuery = require(join(pkgDir, "lib", "index.js"));
    if (!ariaQuery.roles || typeof ariaQuery.roles.entries !== "function") {
      throw new Error("aria-query did not expose a roles map with entries()");
    }
    const roles = extractRoles(ariaQuery.roles);
    const roleCount = Object.keys(roles).length;
    if (roleCount < 100) throw new Error(`Suspiciously few roles extracted: ${roleCount}`);
    // Sanity-check known WAI-ARIA 1.2 semantics before emitting.
    if (!roles.checkbox?.requiredProps?.includes("aria-checked")) {
      throw new Error("Sanity check failed: checkbox should require aria-checked");
    }
    if (!roles.row?.requiredContext?.includes("grid")) {
      throw new Error("Sanity check failed: row should require grid context");
    }

    const data = {
      package: PACKAGE_NAME,
      version,
      license: "Apache-2.0",
      upstream: UPSTREAM_URL,
      roles,
    };

    // ── 4. Provenance header + plain-script output ──
    const header = [
      "/**",
      ` * WAI-ARIA 1.2 role dataset — generated from ${PACKAGE_NAME} v${version}.`,
      " *",
      ` * Package:  ${PACKAGE_NAME}`,
      ` * Version:  ${version}`,
      ` * License:  Apache-2.0 (see LICENSE in the upstream repository:`,
      ` *           ${UPSTREAM_URL}/blob/main/LICENSE)`,
      ` * Upstream: ${UPSTREAM_URL}`,
      " *",
      " * Generated data — a compact, unmodified-in-spirit projection of the",
      " * upstream rolesMap (requiredProps, superClass, required context/owned",
      " * roles, prohibitedProps, nameRequired, abstract); the large",
      " * elementRoles/roleElements concept maps are pruned as unused by rules.",
      ` * Rebuild via scripts/vendor-aria-data.mjs (npm run vendor:aria).`,
      " *",
      ` * Plain script defining the global \`${GLOBAL_NAME}\`. Injected by the`,
      " * service worker before a11y-audit-snippet.js, which prefers this data",
      " * for ARIA role rules (with a graceful fallback to its hand-maintained",
      " * tables when absent — same pattern as accname.js/__FlowLensAccName).",
      " */",
      "",
    ].join("\n");

    // `var` (not const/let) so idempotent re-injection into the same page
    // world cannot throw "Identifier has already been declared".
    const body = `var ${GLOBAL_NAME} = ${JSON.stringify(data, null, 2)};\n`;
    const out = header + body;
    const size = Buffer.byteLength(out);
    if (size > MAX_BYTES) {
      throw new Error(`Dataset too large: ${size} bytes (limit ${MAX_BYTES})`);
    }
    writeFileSync(OUT_FILE, out);
    console.log(`  Wrote src/vendor/aria-data.js (${(size / 1024).toFixed(1)}K, ${roleCount} roles, global: ${GLOBAL_NAME})`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
