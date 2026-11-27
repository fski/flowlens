#!/usr/bin/env node
/**
 * Vendor string audit — fails if company-specific references appear in any
 * git-tracked text file. Vendor-specific targeting belongs in a private host
 * config (see README → Build Variants), never in the generic tool.
 *
 * Allowed: src/host/** (host configs), this script (it holds the patterns)
 * and the tests that assert the patterns are absent. Pure Node — no grep, so the result doesn't depend on the
 * platform's grep flavour.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const PATTERNS = [
  /delivery.hero/i,
  /deliveryhero/i,
  /usehurrier/i,
  /GST_CHAT/i,
  /help-center-root/i,
  /foodpanda/i,
  /talabat/i,
  /\bdhg\b/i,
];
const TEXT_EXT = /\.(js|mjs|cjs|json|html|css|md|yml|yaml|txt)$/i;
const ALLOW = [
  /^src\/host\//,
  /^scripts\/audit-vendor\.mjs$/,
  // Tests that assert these strings are ABSENT from the source must name them.
  /^test\/(host-config|host-config-gating|flow-profiles)\.test\.mjs$/,
];

const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" })
  .split("\n")
  .filter((f) => f && TEXT_EXT.test(f) && !ALLOW.some((re) => re.test(f)));

const hits = [];
for (const file of files) {
  let text;
  try { text = readFileSync(join(ROOT, file), "utf8"); } catch { continue; }
  text.split("\n").forEach((line, i) => {
    if (PATTERNS.some((re) => re.test(line))) hits.push(`${file}:${i + 1}: ${line.trim().slice(0, 160)}`);
  });
}

if (hits.length) {
  console.error(`Vendor strings found (${hits.length}):\n`);
  console.error(hits.join("\n"));
  console.error("\nMove vendor-specific content into a private host config (src/host/).");
  process.exit(1);
}
console.log(`Vendor audit: clean (${files.length} tracked text files)`);
