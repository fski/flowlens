#!/usr/bin/env node
/**
 * E2E smoke: run the built audit snippet against the FP fixture page in a
 * real headless Chromium and assert the documented per-rule counts
 * (docs/A11Y_RULE_FP_AUDIT.md §4.5). Turns the manual FP protocol into a CI
 * gate — a rule change that shifts fixture counts fails here, not 11 days
 * later in a hand-run checklist.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SNIPPET_PATH = join(ROOT, "dist", "a11y-audit-snippet.js");
const FIXTURE_URL = `file://${join(ROOT, "fixtures", "a11y-rule-fixtures.html")}`;

// Expected counts — keep in sync with docs/A11Y_RULE_FP_AUDIT.md §4 step 5.
// Any fixture or rule change that shifts these must update BOTH places.
const EXPECTED = {
  FOCUS_VISIBLE_SUPPRESSED: 23,
  CLICK_WITHOUT_KEYBOARD: 7,
  ARIA_HIDDEN_FOCUSABLE: 1,
  TOUCH_TARGET_TOO_SMALL: 23,
  DUPLICATE_MAIN_LANDMARK: 1,
  IFRAME_MISSING_TITLE: 1,
  ACCESSKEY_CHAR_SHORTCUT: 1,
  SELECT_AUTO_SUBMIT: 1,
  PASTE_BLOCKED_INPUT: 2,
  COMPETING_SKIP_NAV: 1,
  HC_ACCORDION_NO_STATE: 1,
};

if (!existsSync(SNIPPET_PATH)) {
  console.error("ERROR: dist/a11y-audit-snippet.js missing — run `npm run build` first");
  process.exit(2);
}

const { chromium } = await import("playwright");
let browser = null;
for (const attempt of [{ channel: "chrome" }, {}]) {
  try { browser = await chromium.launch({ headless: true, ...attempt }); break; }
  catch { /* try next */ }
}
if (!browser) { console.error("ERROR: no Chromium (npx playwright install chromium)"); process.exit(2); }

const page = await browser.newPage();
await page.goto(FIXTURE_URL, { waitUntil: "load" });
await page.addScriptTag({ content: readFileSync(SNIPPET_PATH, "utf8") });
const byType = await page.evaluate(async () => {
  const r = await window.A11YFlowAudit.run({ strict: true });
  const m = {};
  for (const f of (r?.findings || [])) m[f.type] = (m[f.type] || 0) + 1;
  return m;
});
await browser.close();

let failed = 0;
for (const [type, expected] of Object.entries(EXPECTED)) {
  const actual = byType[type] || 0;
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${type}: expected ${expected}, got ${actual}`);
}
if (failed) {
  console.error(`\nE2E SMOKE FAILED — ${failed} rule count(s) drifted from docs/A11Y_RULE_FP_AUDIT.md`);
  console.error("All counts:", JSON.stringify(byType, null, 2));
  process.exit(1);
}
console.log(`\nE2E smoke OK — ${Object.keys(EXPECTED).length} documented rule counts match the fixture`);
