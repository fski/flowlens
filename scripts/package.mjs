#!/usr/bin/env node
/**
 * Package dist/ into a versioned zip for Chrome Web Store upload.
 * Output: artifacts/flowlens-<version>.zip
 *
 * The zip contains dist/ CONTENTS at root (manifest.json at zip root).
 */
import { readFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const ARTIFACTS = join(ROOT, "artifacts");

// ── Validate dist/ exists ───────────────────────────────────────────────────

if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("ERROR: dist/manifest.json not found. Run `npm run build` first.");
  process.exit(1);
}

// ── Read version from built manifest ────────────────────────────────────────

const manifest = JSON.parse(readFileSync(join(DIST, "manifest.json"), "utf8"));
const version = manifest.version;
if (!version) {
  console.error("ERROR: manifest.json missing version field.");
  process.exit(1);
}

// ── Verify dist version matches source of truth ────────────────────────────

const versionSrc = readFileSync(join(ROOT, "src", "shared", "version.js"), "utf8");
const srcMatch = versionSrc.match(/FLOWLENS_VERSION\s*=\s*"([^"]+)"/);
if (srcMatch && srcMatch[1] !== version) {
  console.error(`ERROR: dist/manifest.json version (${version}) does not match src/shared/version.js (${srcMatch[1]}).`);
  console.error("Run `npm run build` first.");
  process.exit(1);
}

// ── Create artifacts/ and zip ───────────────────────────────────────────────

mkdirSync(ARTIFACTS, { recursive: true });
const zipName = `flowlens-${version}.zip`;
const zipPath = join(ARTIFACTS, zipName);

// Remove stale zip first so zip -r doesn't merge into an existing archive
if (existsSync(zipPath)) rmSync(zipPath);

// Use system zip — cd into dist so zip root = dist contents.
// Reproducible: fixed mtimes (touch), sorted entry order (find|sort), no
// platform extra fields (-X) — identical dist/ yields a byte-identical zip.
try {
  execSync(`find "${DIST}" -exec touch -t 202001010000 {} +`, { stdio: "pipe" });
  execSync(`cd "${DIST}" && find . -type f | sort | zip -X "${zipPath}" -@`, { stdio: "pipe" });
} catch (err) {
  console.error("ERROR: zip command failed. Ensure `zip` is installed.");
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
}

// ── Report ──────────────────────────────────────────────────────────────────

const { statSync } = await import("node:fs");
const zipSize = statSync(zipPath).size;
const sizeStr = zipSize < 1024 * 1024
  ? `${(zipSize / 1024).toFixed(1)}K`
  : `${(zipSize / (1024 * 1024)).toFixed(2)}MB`;

console.log(`  Packaged: artifacts/${zipName} (${sizeStr})`);
console.log(`  Version:  ${version}`);
