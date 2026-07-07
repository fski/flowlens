#!/usr/bin/env node
/**
 * Vendor string audit — scans src/ for company-specific references.
 * Excludes src/host/ (host configs are allowed to contain vendor strings).
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
// NOTE: grep --exclude-dir matches directory basenames only, so "host"
// (not "src/host") is the correct form.
const cmd = `grep -rniE "${pattern}" src/ --include="*.js" --include="*.html" --include="*.css" --include="*.json" --exclude-dir="host" || true`;

try {
  const result = execSync(cmd, { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname });
  const trimmed = result.trim();
  if (trimmed) {
    console.error("Vendor strings found in source:\n");
    console.error(trimmed);
    console.error("\nMove vendor-specific content into a host config file (src/host/).");
    process.exit(1);
  }
  console.log("Vendor audit: clean");
} catch (err) {
  console.error("Vendor audit failed:", err.message);
  process.exit(1);
}
