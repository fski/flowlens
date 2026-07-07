#!/usr/bin/env node
/**
 * Audit the packaged zip to ensure it contains ONLY expected extension files.
 * Fails with nonzero exit code if forbidden files are found or required files missing.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { execSync } from "node:child_process";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
const ARTIFACTS = join(ROOT, "artifacts");

// ── Derive zip path from built manifest (deterministic) ─────────────────────

const manifestPath = join(DIST, "manifest.json");
if (!existsSync(manifestPath)) {
  console.error("ERROR: dist/manifest.json not found. Run `npm run build` first.");
  process.exit(1);
}
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const version = manifest.version;
if (!version) {
  console.error("ERROR: manifest.json missing version field.");
  process.exit(1);
}

const zipPath = join(ARTIFACTS, `flowlens-${version}.zip`);
if (!existsSync(zipPath)) {
  console.error(`ERROR: ${basename(zipPath)} not found in artifacts/. Run \`npm run package\` first.`);
  process.exit(1);
}
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
  "signature-engine.js",
  "exporters.js",
  "sw.js",
  "a11y-audit-snippet.js",
  "devtools.html",
  "devtools.js",
  "en301549-map.js",
  "flow-profiles.js",
  "wcag-coverage.js",
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

// ── Manifest content checks ────────────────────────────────────────────────

// Forbid "key" field (debug-only, must not ship to CWS)
if ("key" in manifest) {
  errors.push('manifest.json contains a "key" field — remove before publishing');
}

// manifest_version must be 3
if (manifest.manifest_version !== 3) {
  errors.push(`manifest_version must be 3, got ${manifest.manifest_version}`);
}

// externally_connectable must not be present (attack surface)
if ("externally_connectable" in manifest) {
  errors.push('manifest.json must NOT include "externally_connectable" — reduces attack surface');
}

// web_accessible_resources — fail if any are declared (fail-safe default)
if (manifest.web_accessible_resources && manifest.web_accessible_resources.length > 0) {
  errors.push(
    `manifest.json contains web_accessible_resources (${manifest.web_accessible_resources.length} entries) — ` +
    "web-accessible resources expose extension files to the web; remove unless explicitly required"
  );
}

// content_security_policy — forbid unsafe-eval and remote sources
const csp = manifest.content_security_policy;
if (csp && typeof csp === "object") {
  for (const [key, policy] of Object.entries(csp)) {
    if (typeof policy !== "string") continue;
    if (policy.includes("unsafe-eval")) {
      errors.push(`content_security_policy.${key} contains 'unsafe-eval' — forbidden`);
    }
    // Detect remote sources: http:// or https:// in CSP directives (excluding 'self')
    const remotePattern = /https?:\/\/[^\s'";]+/g;
    const remoteMatches = policy.match(remotePattern) || [];
    if (remoteMatches.length > 0) {
      errors.push(
        `content_security_policy.${key} references remote sources: ${remoteMatches.join(", ")} — forbidden`
      );
    }
  }
}

// Permissions allowlist
const ALLOWED_PERMISSIONS = ["scripting", "webNavigation", "storage"];
const ALLOWED_HOST_PERMISSIONS = ["http://*/*", "https://*/*"];

const actualPerms = [...(manifest.permissions || [])].sort();
const expectedPerms = [...ALLOWED_PERMISSIONS].sort();
if (JSON.stringify(actualPerms) !== JSON.stringify(expectedPerms)) {
  errors.push(
    `manifest.json permissions mismatch — expected [${expectedPerms}], got [${actualPerms}]`
  );
}

const actualHostPerms = [...(manifest.host_permissions || [])].sort();
const expectedHostPerms = [...ALLOWED_HOST_PERMISSIONS].sort();
if (JSON.stringify(actualHostPerms) !== JSON.stringify(expectedHostPerms)) {
  errors.push(
    `manifest.json host_permissions mismatch — expected [${expectedHostPerms}], got [${actualHostPerms}]`
  );
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
  console.log("  No 'key' field in manifest: ✓");
  console.log("  manifest_version === 3: ✓");
  console.log("  No externally_connectable: ✓");
  console.log("  No web_accessible_resources: ✓");
  console.log("  CSP safe (no unsafe-eval/remote): ✓");
  console.log("  Permissions allowlist: ✓");
}
