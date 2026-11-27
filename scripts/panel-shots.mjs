#!/usr/bin/env node
/**
 * Panel screenshots: the built extension in Chromium (same setup as
 * scripts/panel-e2e.mjs) captured in its main states, for UI review and
 * before/after comparisons.
 *
 *   node scripts/panel-shots.mjs [out-dir]     (default: artifacts/panel-shots)
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const OUT = process.argv[2] || join(ROOT, "artifacts", "panel-shots");
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("ERROR: dist/ missing — run `npm run build` first");
  process.exit(2);
}

mkdirSync(OUT, { recursive: true });

// ── Local server for the inspected page ─────────────────────────────────────
const server = createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "a11y-rule-fixtures.html";
  const file = join(ROOT, "fixtures", name);
  if (!file.startsWith(join(ROOT, "fixtures")) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": extname(file) === ".html" ? "text/html; charset=utf-8" : "application/octet-stream" });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const PORT = server.address().port;
const PAGE_URL = `http://127.0.0.1:${PORT}/a11y-rule-fixtures.html`;

// ── Browser with the unpacked extension ─────────────────────────────────────
const { chromium } = await import("playwright");
const userDataDir = mkdtempSync(join(tmpdir(), "flowlens-e2e-"));
const launchOpts = {
  headless: true,
  args: [`--disable-extensions-except=${DIST}`, `--load-extension=${DIST}`],
};
// Extensions need full Chromium: Playwright's default headless binary
// (chromium-headless-shell) never loads them, so the SW would never start.
// channel "chromium" runs the full build in new-headless mode.
if (process.env.FLOWLENS_CHROMIUM) launchOpts.executablePath = process.env.FLOWLENS_CHROMIUM;
else launchOpts.channel = "chromium";
const context = await chromium.launchPersistentContext(userDataDir, launchOpts);

let failed = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
};

try {
  let [sw] = context.serviceWorkers();
  if (!sw) sw = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extId = new URL(sw.url()).host;

  // Inspected page.
  const page = await context.newPage();
  const pageConsole = [];
  page.on("console", (m) => pageConsole.push(m.text()));
  await page.goto(PAGE_URL);
  const tabId = await sw.evaluate(async (url) => (await chrome.tabs.query({})).find(t => t.url === url)?.id, PAGE_URL);
  check(Number.isInteger(tabId), "inspected tab id resolved");

  // chrome.devtools shim for the panel page.
  await context.addInitScript(() => {
    if (location.protocol !== "chrome-extension:" || !location.pathname.endsWith("/panel.html")) return;
    const tabId = Number(new URLSearchParams(location.search).get("tabId"));
    const navListeners = [];
    chrome.devtools = {
      inspectedWindow: {
        tabId,
        eval(expr, cb) {
          chrome.scripting.executeScript({
            target: { tabId }, world: "MAIN",
            func: (e) => { try { return (0, eval)(e); } catch (_) { return null; } },
            args: [expr],
          }).then((r) => cb && cb(r && r[0] ? r[0].result : undefined, null),
                  (err) => cb && cb(undefined, { isException: true, value: String(err) }));
        },
      },
      network: { onNavigated: { addListener: (fn) => navListeners.push(fn) } },
    };
    chrome.tabs.onUpdated.addListener((id, info) => {
      if (id === tabId && info.url) navListeners.forEach((fn) => fn(info.url));
    });
  });

  const panel = await context.newPage();
  const panelErrors = [];
  panel.on("pageerror", (e) => panelErrors.push(String(e && e.message || e)));
  await panel.goto(`chrome-extension://${extId}/panel.html?tabId=${tabId}`);
  await panel.waitForFunction((u) => document.getElementById("inspectedUrl")?.dataset.full === u, PAGE_URL, { timeout: 10000 })
    .then(() => check(true, "panel resolved the inspected URL"), () => check(false, "panel resolved the inspected URL"));

  // Viewport resembling a docked DevTools panel; full-page shots.
  await panel.setViewportSize({ width: 520, height: 1000 });
  const shot = async (name) => { await panel.waitForTimeout(300); await panel.screenshot({ path: join(OUT, name + ".png"), fullPage: true }); console.log("  " + name + ".png"); };
  await shot("01-snap-idle");
  await panel.click("#runCurrentMode");
  await panel.waitForSelector("#allTable tr.trow", { timeout: 20000 });
  await shot("02-snap-results");
  await panel.click("#exportToggle").catch(() => {});
  await shot("03-snap-export-menu");
  await panel.keyboard.press("Escape");
  await panel.click("#topTabSettings");
  await shot("04-settings");
  await panel.click("#topTabFlow");
  await shot("05-flow-idle");
  await panel.click("#sessionStart");
  await panel.waitForFunction(() => document.querySelectorAll("#flowStepList [data-step-index]").length > 0, null, { timeout: 30000 }).catch(() => {});
  await shot("06-flow-recording");
} catch (err) {
  failed++;
  console.error("✗ panel e2e crashed:", err && err.stack || err);
} finally {
  await context.close();
  server.close();
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch (_) { /* tmp */ }
}

if (failed) {
  console.error("\nPANEL SHOTS FAILED");
  process.exit(1);
}
console.log(`\nScreenshots → ${OUT}`);
