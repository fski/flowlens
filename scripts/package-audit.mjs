#!/usr/bin/env node
/**
 * Audit the packaged zip to ensure it contains ONLY expected extension files.
 * Fails with nonzero exit code if forbidden files are found or required files missing.
 */
import { readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");
const ARTIFACTS = join(ROOT, "artifacts");

// ── Find the zip ────────────────────────────────────────────────────────────

const zips = existsSync(ARTIFACTS)
  ? readdirSync(ARTIFACTS).filter(f => f.endsWith(".zip"))
  : [];

if (zips.length === 0) {
  console.error("ERROR: No zip found in artifacts/. Run `npm run package` first.");
  process.exit(1);
}

const zipPath = join(ARTIFACTS, zips[zips.length - 1]); // latest
console.log(`  Auditing: ${basename(zipPath)}\n`);

// ── List zip contents ───────────────────────────────────────────────────────

let listing;
try {
  listing = execSync(`unzip -l "${zipPath}"`, { encoding: "utf8" });
} catch (err) {
  console.error("ERROR: unzip command failed.");
  process.exit(1);
}

// Parse file paths from unzip -l output (skip header/footer lines)
const lines = listing.split("\n");
const files = [];
for (const line of lines) {
  const match = line.match(/^\s*\d+\s+[\d-]+\s+[\d:]+\s+(.+)$/);
  if (match) {
    const path = match[1].trim();
    if (path && !path.endsWith("/")) files.push(path);
  }
}

// ── Required files ──────────────────────────────────────────────────────────

const REQUIRED = [
  "manifest.json",
  "panel.html",
  "panel.css",
  "panel.js",
  "sw.js",
  "a11y-audit-snippet.js",
  "devtools.html",
  "devtools.js",
  "en301549-map.js",
  "icons/icon16.png",
  "icons/icon48.png",
  "icons/icon128.png",
];

// ── Forbidden patterns ──────────────────────────────────────────────────────

const FORBIDDEN_PATTERNS = [
  /^node_modules\//,
  /^test\//,
  /^tests?\//,
  /^docs?\//,
  /^fixtures?\//,
  /^\.git/,
  /^\.context/,
  /^\.github/,
  /^scripts\//,
  /^src\//,
  /package\.json$/,
  /package-lock\.json$/,
  /\.md$/,
  /\.mjs$/,
  /\.test\./,
  /\.spec\./,
  /\.map$/,
  /tsconfig/,
  /\.eslint/,
  /\.prettier/,
  /\.env/,
  /\.DS_Store/,
  /Thumbs\.db/,
];

// ── Allowed file extensions ─────────────────────────────────────────────────

const ALLOWED_EXTENSIONS = new Set([
  ".json", ".js", ".html", ".css",
  ".png", ".svg", ".ico",
]);

// ── Run checks ──────────────────────────────────────────────────────────────

const errors = [];

// Check required files present
for (const req of REQUIRED) {
  // Normalize: unzip may prefix with ./
  const found = files.some(f => f === req || f === `./${req}`);
  if (!found) {
    errors.push(`MISSING required file: ${req}`);
  }
}

// Check forbidden patterns
for (const file of files) {
  const normalized = file.replace(/^\.\//, "");

  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(normalized)) {
      errors.push(`FORBIDDEN file: ${normalized}  (matched ${pattern})`);
      break;
    }
  }

  // Check extension allowlist
  const ext = normalized.includes(".") ? "." + normalized.split(".").pop() : "";
  if (ext && !ALLOWED_EXTENSIONS.has(ext)) {
    errors.push(`UNEXPECTED extension: ${normalized}`);
  }
}

// Check manifest.json is at root (not nested in a folder)
const manifestAtRoot = files.some(f => f === "manifest.json" || f === "./manifest.json");
if (!manifestAtRoot) {
  errors.push("manifest.json is NOT at zip root (nested in a folder?)");
}

// ── Report ──────────────────────────────────────────────────────────────────

console.log(`  Files in zip: ${files.length}`);

if (errors.length > 0) {
  console.log(`\n  AUDIT FAILED — ${errors.length} issue(s):\n`);
  for (const err of errors) {
    console.log(`    ✗ ${err}`);
  }
  process.exit(1);
} else {
  console.log("  AUDIT PASSED — all checks OK\n");
  console.log("  Required files: ✓");
  console.log("  No forbidden files: ✓");
  console.log("  manifest.json at root: ✓");
}
