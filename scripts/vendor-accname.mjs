#!/usr/bin/env node
/**
 * Vendor script for dom-accessibility-api — the accessible-name engine used
 * by the audit snippet (injected as accname.js before a11y-audit-snippet.js).
 *
 * Fetches the pinned package version from the npm registry via `npm pack`
 * (NOT added to package.json dependencies — this is a vendored copy),
 * bundles it with esbuild into a single plain-script IIFE exposing the
 * global `__FlowLensAccName`, and writes the readable (unminified) output
 * to src/vendor/accname.js with a provenance header.
 *
 * Usage:
 *   npm run vendor:accname            — re-vendor the pinned version
 *   node scripts/vendor-accname.mjs 0.7.1   — vendor a specific version
 */
import { mkdtempSync, rmSync, writeFileSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";

const PACKAGE_NAME = "dom-accessibility-api";
const PINNED_VERSION = "0.7.1";
const UPSTREAM_URL = "https://github.com/eps1lon/dom-accessibility-api";
const GLOBAL_NAME = "__FlowLensAccName";

const ROOT = join(import.meta.dirname, "..");
const OUT_FILE = join(ROOT, "src", "vendor", "accname.js");

const version = process.argv[2] || PINNED_VERSION;

async function main() {
  const workDir = mkdtempSync(join(tmpdir(), "flowlens-vendor-accname-"));
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
    if (pkgJson.license !== "MIT") throw new Error(`Unexpected license: ${pkgJson.license}`);
    const deps = Object.keys(pkgJson.dependencies || {});
    if (deps.length > 0) throw new Error(`Expected zero runtime deps, found: ${deps.join(", ")}`);

    // ── 3. Entry file: re-export only the API the snippet uses ──
    const entryPath = join(workDir, "entry.js");
    writeFileSync(entryPath, [
      `export { computeAccessibleName, computeAccessibleDescription } from "${join(pkgDir, "dist", "index.mjs")}";`,
      "",
    ].join("\n"));

    // ── 4. Bundle to a plain-script IIFE (readable, unminified) ──
    const esbuild = await import("esbuild");
    const result = await esbuild.build({
      entryPoints: [entryPath],
      bundle: true,
      format: "iife",
      globalName: GLOBAL_NAME,
      minify: false,
      target: "es2022",
      write: false,
      legalComments: "none",
    });
    const bundled = result.outputFiles[0].text;

    // ── 5. Provenance header + write output ──
    const header = [
      "/**",
      ` * ${PACKAGE_NAME} v${version} — accessible-name computation engine.`,
      " *",
      ` * Package:  ${PACKAGE_NAME}`,
      ` * Version:  ${version}`,
      ` * License:  MIT (see LICENSE.md in the upstream repository:`,
      ` *           ${UPSTREAM_URL}/blob/main/LICENSE.md)`,
      ` *           Copyright (c) 2020 Sebastian Silbermann`,
      ` * Upstream: ${UPSTREAM_URL}`,
      " *",
      " * vendored unmodified; rebuild via scripts/vendor-accname.mjs",
      " *",
      ` * Bundled with esbuild as a plain-script IIFE exposing \`${GLOBAL_NAME}\``,
      ` * ({ computeAccessibleName, computeAccessibleDescription }). Injected by`,
      " * the service worker before a11y-audit-snippet.js, which uses it as the",
      " * spec-order accessible-name engine (with a heuristic fallback when absent).",
      " */",
      "",
    ].join("\n");

    writeFileSync(OUT_FILE, header + bundled);
    const size = Buffer.byteLength(header + bundled);
    console.log(`  Wrote src/vendor/accname.js (${(size / 1024).toFixed(1)}K, global: ${GLOBAL_NAME})`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch(err => { console.error(err); process.exit(1); });
