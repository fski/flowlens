#!/usr/bin/env node
/**
 * Full-repo vendor string audit — scans entire repo for company-specific references.
 * Excludes:
 *   dist/, node_modules/, .git/, src/host/  — build output, deps, host configs
 *   test/, scripts/, .context/, docs/       — tests, tooling, planning docs
 * Only scans text file extensions (js, mjs, json, html, css, md, yml, yaml).
 * Exit 1 if any matches found.
 */
import { execSync } from "node:child_process";

const PATTERNS = [
  "delivery.hero",
  "deliveryhero",
  "usehurrier",
  "GST_CHAT",
  "help-center-root",
  "foodpanda",
  "talabat",
  "\\bdhg\\b",
];

const pattern = PATTERNS.join("|");
const includes = [
  '--include="*.js"',
  '--include="*.mjs"',
  '--include="*.json"',
  '--include="*.html"',
  '--include="*.css"',
  '--include="*.md"',
  '--include="*.yml"',
  '--include="*.yaml"',
].join(" ");
const excludeDirs = [
  '--exclude-dir="dist"',
  '--exclude-dir="node_modules"',
  '--exclude-dir=".git"',
  '--exclude-dir="src/host"',
  '--exclude-dir="test"',
  '--exclude-dir="scripts"',
  '--exclude-dir=".context"',
  '--exclude-dir="docs"',
].join(" ");
// Legacy root-level source files (pre-refactor, superseded by src/).
const excludeFiles = [
  '--exclude="panel.js"',
  '--exclude="sw.js"',
  '--exclude="a11y-audit-snippet.js"',
].join(" ");
const excludes = `${excludeDirs} ${excludeFiles}`;

const cmd = `grep -rniE "${pattern}" . ${includes} ${excludes} || true`;

try {
  const result = execSync(cmd, { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname });
  const trimmed = result.trim();
  if (trimmed) {
    console.error("Vendor strings found in repo:\n");
    console.error(trimmed);
    console.error("\nMove vendor-specific content into a host config file (src/host/).");
    process.exit(1);
  }
  console.log("Full-repo vendor audit: clean");
} catch (err) {
  console.error("Full-repo vendor audit failed:", err.message);
  process.exit(1);
}
