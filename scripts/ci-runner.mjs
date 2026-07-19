#!/usr/bin/env node
/**
 * FlowLens headless CI runner (runner contract v1).
 *
 * Drives a real Chromium through one or more flow steps, injects the built
 * audit snippet (dist/a11y-audit-snippet.js) into each page, and emits:
 *   - <out>/flowlens-report.json  — deterministic CI JSON (buildCIReport contract)
 *   - <out>/junit.xml             — JUnit XML (one testcase per step)
 *
 * Usage:
 *   node scripts/ci-runner.mjs --url https://example.com [--url ...]
 *   node scripts/ci-runner.mjs --steps steps.json [--wcag 2.2-AA]
 *     [--out artifacts/ci] [--fail-on-blocking] [--max-failures 0]
 *
 * steps.json: [{ "url": "https://…", "label": "checkout step 1" }, …]
 *
 * Requires the `playwright` devDependency (browsers via `npx playwright
 * install chromium`, or an installed Google Chrome — the runner tries the
 * `chrome` channel first).
 *
 * Determinism note: findings come from the same snippet the extension
 * injects. Runner signatures (fnv1a over type|wcag|testId|path) are a
 * runner-v1 contract — stable for identical pages, but not identical to the
 * panel's session signature engine.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createContext as vmCreateContext, Script } from "node:vm";

const ROOT = join(import.meta.dirname, "..");
const SNIPPET_PATH = join(ROOT, "dist", "a11y-audit-snippet.js");

// ── Args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = { urls: [], stepsFile: null, wcag: "2.2-AA", out: join(ROOT, "artifacts", "ci"), failOnBlocking: false, maxFailures: 0 };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--url") opt.urls.push(args[++i]);
  else if (a === "--steps") opt.stepsFile = args[++i];
  else if (a === "--wcag") opt.wcag = args[++i];
  else if (a === "--out") opt.out = args[++i];
  else if (a === "--fail-on-blocking") opt.failOnBlocking = true;
  else if (a === "--max-failures") opt.maxFailures = Number(args[++i]) || 0;
  else if (a === "--help" || a === "-h") { console.log("See header of scripts/ci-runner.mjs"); process.exit(0); }
}

let steps = opt.urls.map((url, i) => ({ url, label: `step ${i + 1}` }));
if (opt.stepsFile) {
  const parsed = JSON.parse(readFileSync(opt.stepsFile, "utf8"));
  if (!Array.isArray(parsed)) { console.error("ERROR: steps file must be a JSON array"); process.exit(2); }
  steps = parsed.map((s, i) => ({ url: s.url, label: s.label || `step ${i + 1}` }));
}
if (!steps.length) { console.error("ERROR: no steps — pass --url or --steps"); process.exit(2); }
if (!existsSync(SNIPPET_PATH)) { console.error("ERROR: dist/a11y-audit-snippet.js missing — run `npm run build` first"); process.exit(2); }

// ── Load the CI exporter (browser-global script) via vm ─────────────────────
function loadCiExporter() {
  const src = readFileSync(join(ROOT, "src", "engine", "ciExporter.js"), "utf8");
  const ctx = vmCreateContext({ console });
  new Script(src + "\n;this.__buildCIReport = typeof buildCIReport !== 'undefined' ? buildCIReport : null;" +
    "this.__validateCIReport = typeof validateCIReport !== 'undefined' ? validateCIReport : null;",
    { filename: "ciExporter.js" }).runInContext(ctx);
  return { buildCIReport: ctx.__buildCIReport, validateCIReport: ctx.__validateCIReport };
}

// ── Blocking rule (mirrors panel isRunFindingBlocking) ──────────────────────
function isBlocking(f) {
  const sev = String(f?.severity || "").toLowerCase();
  if (sev !== "high" && sev !== "medium") return false;
  const conf = String(f?.confidence || "strict").toLowerCase();
  if (conf === "advisory") return false;
  if (sev === "high") return true;
  return conf === "strict";
}

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
const findingSig = (f) => `run-v1:${fnv1a(`${f.type}|${f.wcag || ""}|${f.testId || ""}|${f.path || ""}`)}`;

const xmlEscape = (s) => String(s ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&apos;");

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    console.error("ERROR: playwright not installed. Run: npm i -D playwright && npx playwright install chromium");
    process.exit(2);
  }

  let browser = null;
  for (const attempt of [{ channel: "chrome" }, {}]) {
    try { browser = await playwright.chromium.launch({ headless: true, ...attempt }); break; }
    catch { /* try next launch option */ }
  }
  if (!browser) { console.error("ERROR: could not launch Chromium (install browsers: npx playwright install chromium)"); process.exit(2); }

  const snippetSource = readFileSync(SNIPPET_PATH, "utf8");
  const page = await browser.newPage();
  const stepResults = [];

  for (const step of steps) {
    process.stdout.write(`▶ ${step.label}: ${step.url}\n`);
    await page.goto(step.url, { waitUntil: "load", timeout: 60000 });
    await page.addScriptTag({ content: snippetSource });
    const res = await page.evaluate(async (wcagLevel) => {
      const r = await window.A11YFlowAudit.run({ strict: true, wcagLevel });
      const findings = (r?.findings || []).map(f => ({
        type: f.type, severity: f.severity, confidence: f.confidence,
        wcag: f.wcag, level: f.level, testId: f.testId, path: f.path, name: f.name,
      }));
      return { findings, href: window.location.href };
    }, opt.wcag);

    const sigs = new Set(res.findings.map(findingSig));
    const blockingSigs = new Set(res.findings.filter(isBlocking).map(findingSig));
    const bySeverity = { high: 0, medium: 0, low: 0, info: 0 };
    for (const f of res.findings) { const s = String(f.severity || "info"); if (s in bySeverity) bySeverity[s]++; }
    stepResults.push({ ...step, findings: res.findings, sigs, blockingSigs, bySeverity });
    process.stdout.write(`  findings=${res.findings.length} blocking=${blockingSigs.size}\n`);
  }
  await browser.close();

  // ── Cross-step diffs ─────────────────────────────────────────────────────
  const last = stepResults[stepResults.length - 1];
  const blockingAdded = [];
  const blockingFixed = [];
  for (let i = 1; i < stepResults.length; i++) {
    const prev = stepResults[i - 1];
    const curr = stepResults[i];
    for (const f of curr.findings) {
      const sig = findingSig(f);
      if (curr.blockingSigs.has(sig) && !prev.sigs.has(sig)) {
        blockingAdded.push({ signature: sig, wcag: f.wcag || null, level: f.level || null, confidence: f.confidence || null, stepIndex: i + 1 });
      }
    }
    for (const f of prev.findings) {
      const sig = findingSig(f);
      if (prev.blockingSigs.has(sig) && !curr.sigs.has(sig)) {
        blockingFixed.push({ signature: sig, wcag: f.wcag || null, level: f.level || null, confidence: f.confidence || null, stepIndex: i + 1 });
      }
    }
  }

  const version = (() => {
    try { return /FLOWLENS_VERSION\s*=\s*"([^"]+)"/.exec(readFileSync(join(ROOT, "src", "shared", "version.js"), "utf8"))[1]; }
    catch { return "dev"; }
  })();

  const { buildCIReport, validateCIReport } = loadCiExporter();
  const report = buildCIReport({
    tool: { name: "FlowLens", version, hostId: "ci-runner-v1" },
    scope: { depthMax: 1, profileId: null, profileConfidence: null, rulePackHash: null },
    quality: { signatureQuality: "runner-v1", diffConfidence: stepResults.length > 1 ? "normal" : "single-step" },
    summary: {
      blockingAdded: blockingAdded.length,
      blockingFixed: blockingFixed.length,
      blockingCurrent: last.blockingSigs.size,
      totalCount: last.findings.length,
      bySeverity: last.bySeverity,
    },
    regressions: { blockingAdded, blockingFixed },
    depth3Aggregates: null,
  });
  const validation = validateCIReport(report);
  if (!validation.valid) {
    console.error("ERROR: generated report violates the CI contract:", validation.violations);
    process.exit(2);
  }

  // ── JUnit ────────────────────────────────────────────────────────────────
  const failures = [];
  stepResults.forEach((s, i) => {
    if (i === 0) {
      if (opt.failOnBlocking && s.blockingSigs.size > opt.maxFailures) {
        failures.push({ step: s, message: `${s.blockingSigs.size} blocking finding(s) at baseline (max ${opt.maxFailures})` });
      }
      return;
    }
    const added = blockingAdded.filter(x => x.stepIndex === i + 1);
    if (opt.failOnBlocking && added.length > 0) {
      failures.push({ step: s, message: `${added.length} blocking finding(s) introduced` });
    }
  });

  const testcases = stepResults.map((s, i) => {
    const fail = failures.find(f => f.step === s);
    const body = fail
      ? `\n    <failure message="${xmlEscape(fail.message)}">${xmlEscape(s.findings.filter(isBlocking).map(f => `${f.type} (${f.wcag || "—"})`).join("\n"))}</failure>\n  `
      : "";
    return `  <testcase classname="flowlens.flow" name="${xmlEscape(s.label)}">${body}</testcase>`;
  }).join("\n");
  const junit = `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="flowlens" tests="${stepResults.length}" failures="${failures.length}">\n${testcases}\n</testsuite>\n`;

  mkdirSync(opt.out, { recursive: true });
  writeFileSync(join(opt.out, "flowlens-report.json"), JSON.stringify(report, null, 2) + "\n");
  writeFileSync(join(opt.out, "junit.xml"), junit);

  console.log(`\nReport: ${join(opt.out, "flowlens-report.json")}`);
  console.log(`JUnit:  ${join(opt.out, "junit.xml")}`);
  console.log(`Steps: ${stepResults.length} | last-step findings: ${last.findings.length} | blocking: ${last.blockingSigs.size} | +${blockingAdded.length}/-${blockingFixed.length} across steps`);
  if (failures.length) {
    console.error(`FAIL: ${failures.length} step(s) over blocking budget`);
    process.exit(1);
  }
}

main().catch(err => { console.error("ERROR:", err?.message || err); process.exit(2); });
