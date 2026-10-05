#!/usr/bin/env node
/**
 * Spike: FlowLens snippet vs axe-core on an annotated page corpus.
 *
 * Each corpus page marks elements with
 *   data-defect="…"  (or id="bad-*" / id="fail-*")  — a planted defect
 *   data-ok="…"      (or id="ok-*")                  — correct but tricky
 * Both tools run on every page; a tool "flags" an element when one of its
 * findings resolves to exactly that element (shadow DOM included). Reported
 * per tool: planted defects caught, false positives on ok-elements, raw
 * finding counts and runtime.
 *
 * axe-core is NOT a dependency — point AXE_PATH at an axe.min.js:
 *   AXE_PATH=/path/to/axe.min.js node scripts/spike-axe-compare.mjs [corpus-dir…] [--json out.json]
 * Default corpus: fixtures/corpus/*.html plus the accname/contrast/rule fixtures.
 * Runs the built snippet (dist/a11y-audit-snippet.js: run() + contrastScan()).
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchChromium, newAuditPage } from "./lib/launch-browser.mjs";

const ROOT = join(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const jsonIdx = argv.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : null;
const dirs = argv.filter((_, i) => jsonIdx < 0 || (i !== jsonIdx && i !== jsonIdx + 1));
if (!process.env.AXE_PATH) {
  console.error("usage: AXE_PATH=…/axe.min.js node scripts/spike-axe-compare.mjs [corpus-dir…] [--json out.json]");
  process.exit(2);
}
const SNIPPET = readFileSync(join(ROOT, "dist", "a11y-audit-snippet.js"), "utf8");
const AXE = readFileSync(process.env.AXE_PATH, "utf8");

// In-page helpers: annotated elements (light + shadow DOM) and resolvers that
// turn a tool's selector into the element it points at.
const PAGE_HELPERS = `
window.__spike = {
  all(root = document) {
    const out = [];
    const walk = (r) => {
      for (const el of r.querySelectorAll("*")) {
        out.push(el);
        if (el.shadowRoot) walk(el.shadowRoot);
      }
    };
    walk(root);
    return out;
  },
  annotated() {
    return this.all().map((el, i) => {
      const id = el.id || "";
      const defect = el.dataset.defect || (/^(bad|fail)-/.test(id) ? id : null);
      const ok = el.dataset.ok || (/^ok-/.test(id) ? id : null);
      if (!defect && !ok) return null;
      el.__spikeIdx = i;
      return { idx: i, kind: defect ? "defect" : "ok", label: defect || ok, tag: el.tagName.toLowerCase() };
    }).filter(Boolean);
  },
  resolveDeep(pathDeep, path) {
    try {
      if (pathDeep && pathDeep.includes(">>>")) {
        let root = document, el = null;
        for (const seg of pathDeep.split(">>>").map(s => s.trim())) {
          el = root.querySelector(seg);
          if (!el) return null;
          root = el.shadowRoot || el;
        }
        return el;
      }
      return document.querySelector(pathDeep || path) || (path ? document.querySelector(path) : null);
    } catch (_) { return null; }
  },
  resolveAxe(target) {
    try {
      let root = document, el = null;
      const parts = Array.isArray(target) ? target : [target];
      for (const p of parts) {
        const sels = Array.isArray(p) ? p : [p];
        for (const s of sels) { el = root.querySelector(s); if (!el) return null; root = el.shadowRoot || root; }
      }
      return el;
    } catch (_) { return null; }
  },
};`;

const pages = dirs.length
  ? dirs.flatMap(d => readdirSync(d).filter(f => f.endsWith(".html")).sort().map(f => join(d, f)))
  : [
      ...readdirSync(join(ROOT, "fixtures", "corpus")).filter(f => f.endsWith(".html")).sort().map(f => join(ROOT, "fixtures", "corpus", f)),
      ...["a11y-rule-fixtures.html", "accname-fixtures.html", "contrast-fixtures.html"].map(f => join(ROOT, "fixtures", f)),
    ];
const browser = await launchChromium();
const report = [];

for (const path of pages) {
  const file = path.split("/").pop();
  const url = `file://${path}`;

  const runTool = async (tool) => {
    const page = await newAuditPage(browser);
    await page.goto(url, { waitUntil: "load" });
    await page.addScriptTag({ content: PAGE_HELPERS });
    await page.addScriptTag({ content: tool === "axe" ? AXE : SNIPPET });
    return page.evaluate(async (tool) => {
      const S = window.__spike;
      const annotated = S.annotated();
      const flags = new Map(); // idx -> [rule ids]
      const mark = (el, rule) => {
        if (!el || el.__spikeIdx == null) return;
        const arr = flags.get(el.__spikeIdx) || [];
        if (!arr.includes(rule)) arr.push(rule);
        flags.set(el.__spikeIdx, arr);
      };
      let total = 0, incomplete = 0, ms = 0, rules = new Set();
      if (tool === "axe") {
        const t0 = performance.now();
        const r = await window.axe.run(document, { resultTypes: ["violations", "incomplete"] });
        ms = performance.now() - t0;
        for (const v of r.violations) for (const n of v.nodes) { total++; rules.add(v.id); mark(S.resolveAxe(n.target), v.id); }
        for (const v of r.incomplete) incomplete += v.nodes.length;
      } else {
        window.__A11YFLOW_CONSOLE__ = false;
        const t0 = performance.now();
        const r = await window.A11YFlowAudit.run({ strict: true });
        const c = await window.A11YFlowAudit.contrastScan({ limit: 250 });
        ms = performance.now() - t0;
        for (const f of r.findings) {
          if (f.severity === "info") continue;
          total++; rules.add(f.type);
          mark(S.resolveDeep(f.pathDeep, f.path), f.type);
        }
        for (const f of c.failures || []) { total++; rules.add("CONTRAST"); mark(S.resolveDeep(null, f.path), "CONTRAST"); }
        incomplete = (c.samples || []).filter(s => s.bgUncertain).length;
      }
      return {
        ms: Math.round(ms), total, incomplete, rules: rules.size,
        items: annotated.map(a => ({ ...a, flaggedBy: flags.get(a.idx) || [] })),
      };
    }, tool);
  };

  const snip = await runTool("snippet");
  const axe = await runTool("axe");
  report.push({ page: file, snippet: snip, axe });
}
await browser.close();

// ── Summary ─────────────────────────────────────────────────────────────────
const agg = { snippet: { caught: 0, fp: 0, ms: 0, total: 0 }, axe: { caught: 0, fp: 0, ms: 0, total: 0 } };
let defects = 0, oks = 0;
const lines = [];
for (const r of report) {
  const items = r.snippet.items;
  lines.push(`\n## ${r.page}  (snippet: ${r.snippet.total} findings, ${r.snippet.ms} ms | axe: ${r.axe.total} violations + ${r.axe.incomplete} incomplete, ${r.axe.ms} ms)`);
  items.forEach((it, i) => {
    const s = it.flaggedBy, a = r.axe.items[i].flaggedBy;
    const sHit = s.length > 0, aHit = a.length > 0;
    if (it.kind === "defect") { defects++; if (sHit) agg.snippet.caught++; if (aHit) agg.axe.caught++; }
    else { oks++; if (sHit) agg.snippet.fp++; if (aHit) agg.axe.fp++; }
    const verdict = (hit) => it.kind === "defect" ? (hit ? "caught" : "MISSED") : (hit ? "FALSE+" : "ok");
    lines.push(`  ${it.kind === "defect" ? "D" : "K"} <${it.tag}> ${it.label.padEnd(30)} snippet: ${verdict(sHit).padEnd(7)} ${s.join(",").slice(0, 60).padEnd(60)} axe: ${verdict(aHit).padEnd(7)} ${a.join(",").slice(0, 50)}`);
  });
  for (const t of ["snippet", "axe"]) { agg[t].ms += r[t].ms; agg[t].total += r[t].total; }
}
console.log(lines.join("\n"));
console.log(`\n# Totals over ${report.length} pages: ${defects} planted defects, ${oks} ok-elements`);
for (const t of ["snippet", "axe"]) {
  console.log(`  ${t.padEnd(8)} caught ${agg[t].caught}/${defects}  false-positives ${agg[t].fp}/${oks}  findings ${agg[t].total}  time ${agg[t].ms} ms`);
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 2));
