#!/usr/bin/env node
/**
 * Release guard — validates version consistency before publish.
 *
 * Checks:
 *   1. src/shared/version.js version is valid semver (X.Y.Z)
 *   2. dist/manifest.json version matches version.js
 *   3. artifacts/flowlens-<version>.zip exists with matching version in filename
 */
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");
const ARTIFACTS = join(ROOT, "artifacts");

const errors = [];

// ── 1. Read and validate version.js ─────────────────────────────────────────

const versionFile = join(SRC, "shared", "version.js");
if (!existsSync(versionFile)) {
  console.error("ERROR: src/shared/version.js not found.");
  process.exit(1);
}

const versionContent = readFileSync(versionFile, "utf8");
const versionMatch = versionContent.match(/FLOWLENS_VERSION\s*=\s*"([^"]+)"/);
if (!versionMatch) {
  console.error("ERROR: Could not extract FLOWLENS_VERSION from src/shared/version.js");
  process.exit(1);
}

const srcVersion = versionMatch[1];
console.log(`  Source version: ${srcVersion}`);

// Validate semver format (X.Y.Z, digits only)
if (!/^\d+\.\d+\.\d+$/.test(srcVersion)) {
  errors.push(`version.js version "${srcVersion}" is not valid semver (expected X.Y.Z)`);
}

// ── 2. Check dist/manifest.json matches ─────────────────────────────────────

const manifestPath = join(DIST, "manifest.json");
if (!existsSync(manifestPath)) {
  errors.push("dist/manifest.json not found — run `npm run build` first");
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifestVersion = manifest.version;
  console.log(`  Manifest version: ${manifestVersion}`);

  if (manifestVersion !== srcVersion) {
    errors.push(
      `Version mismatch: version.js="${srcVersion}" vs manifest.json="${manifestVersion}"`
    );
  }
}

// ── 3. Check artifacts zip filename matches ─────────────────────────────────

const expectedZip = `flowlens-${srcVersion}.zip`;
const zipPath = join(ARTIFACTS, expectedZip);
if (!existsSync(zipPath)) {
  errors.push(`artifacts/${expectedZip} not found — run \`npm run package\` first`);
} else {
  console.log(`  Artifact: ${expectedZip}`);
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log("");
if (errors.length > 0) {
  console.log(`  RELEASE GUARD FAILED — ${errors.length} issue(s):\n`);
  for (const err of errors) {
    console.log(`    ✗ ${err}`);
  }
  process.exit(1);
} else {
  console.log("  RELEASE GUARD PASSED\n");
  console.log("  Semver format: ✓");
  console.log("  version.js == manifest.json: ✓");
  console.log("  Artifact zip matches version: ✓");
}
