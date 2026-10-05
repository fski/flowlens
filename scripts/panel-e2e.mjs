#!/usr/bin/env node
/**
 * Panel E2E: the built extension (dist/) loaded into a real Chromium — real
 * service worker, real snippet injection — with panel.html opened as an
 * extension page. chrome.devtools doesn't exist outside DevTools, so a thin
 * shim (init script) provides inspectedWindow.{tabId,eval} and
 * network.onNavigated on top of chrome.scripting / chrome.tabs, pointed at a
 * page served from a local HTTP server.
 *
 * Covers what the node:test harness can't: the wired-up panel (panel-90),
 * real DOM/CSS, keyboard access, and the panel ⇄ SW ⇄ snippet round trip.
 *
 *   node scripts/panel-e2e.mjs        (run `npm run build` first)
 */
import { createServer } from "node:http";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const DIST = join(ROOT, "dist");
if (!existsSync(join(DIST, "manifest.json"))) {
  console.error("ERROR: dist/ missing — run `npm run build` first");
  process.exit(2);
}

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
if (process.env.FLOWLENS_CHROMIUM) launchOpts.executablePath = process.env.FLOWLENS_CHROMIUM;
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

  // ── Snap: run an audit through the real SW + snippet ─────────────────────
  await panel.click("#runCurrentMode");
  const rows = await panel.waitForSelector("#allTable tr.trow", { timeout: 20000 }).then(() => true, () => false);
  check(rows, "Run Audit renders finding rows");
  const rowInfo = await panel.evaluate(() => {
    const rs = [...document.querySelectorAll("#allTable tr.trow")];
    return { n: rs.length, focusable: rs.every((r) => r.tabIndex === 0) };
  });
  check(rowInfo.n > 10, "fixture produces findings", `rows=${rowInfo.n}`);
  check(rowInfo.focusable, "every finding row is keyboard-focusable");

  // Arrow navigation + Enter expands the detail row.
  await panel.focus("#allTable tr.trow");
  await panel.keyboard.press("ArrowDown");
  const movedTo = await panel.evaluate(() => {
    const rs = [...document.querySelectorAll("#allTable tr.trow")];
    return rs.indexOf(document.activeElement);
  });
  check(movedTo === 1, "ArrowDown moves focus to the next row", `index=${movedTo}`);
  await panel.keyboard.press("Enter");
  const expanded = await panel.waitForSelector("#allTable tr.detailRow", { timeout: 3000 }).then(() => true, () => false);
  check(expanded, "Enter on a row opens its detail");

  // Severity filters: toggle buttons, all in the Tab order.
  const sev = await panel.evaluate(() => {
    const bs = [...document.querySelectorAll("#sevTabs .sevTab")];
    return { n: bs.length, pressed: bs.every((b) => b.hasAttribute("aria-pressed")), tabbable: bs.every((b) => b.tabIndex === 0), roleTab: bs.some((b) => b.getAttribute("role") === "tab") };
  });
  check(sev.n > 1 && sev.pressed && sev.tabbable && !sev.roleTab, "severity filters are tabbable aria-pressed toggles", JSON.stringify(sev));

  // Page console stays clean with "Log to console" off (default).
  const leaked = pageConsole.filter((t) => /A11YFlowAudit\.run|Raw findings|Sanity:/.test(t));
  check(leaked.length === 0, "no audit output in the inspected page's console", leaked[0]);

  // ── Navigation keeps data and view consistent (the 6.10.x hotfix class) ──
  // Another origin (localhost vs 127.0.0.1): no stale rows, fresh "Run" CTA.
  // Back: the scope's records restore with their rows and a "Rerun" CTA.
  const snapState = () => panel.evaluate(() => ({
    rows: document.querySelectorAll("#allTable tr.trow").length,
    label: document.getElementById("runLabel")?.textContent || "",
    empty: document.getElementById("explorerEmpty")?.hidden === false ? document.getElementById("explorerEmpty").textContent : null,
    results: document.getElementById("resultsZone")?.hidden === false,
  }));
  const ranLabel = (await snapState()).label;
  await page.goto(`http://localhost:${PORT}/corpus/chat.html`);
  await panel.waitForFunction((u) => document.getElementById("inspectedUrl")?.dataset.full === u, `http://localhost:${PORT}/corpus/chat.html`, { timeout: 10000 }).catch(() => {});
  await panel.waitForTimeout(300);
  const other = await snapState();
  check(other.rows === 0 && !other.results && other.label !== ranLabel,
    "navigating to another origin shows no stale findings and a fresh CTA", JSON.stringify(other));
  await page.goto(PAGE_URL);
  await panel.waitForFunction(() => document.querySelectorAll("#allTable tr.trow").length > 0, null, { timeout: 10000 }).catch(() => {});
  const back = await snapState();
  check(back.rows > 10 && back.label === ranLabel && back.empty === null,
    "navigating back restores the scope's audit (rows + rerun CTA, no empty message)", JSON.stringify(back));

  // ── Single-key shortcuts: on by default, can be turned off ───────────────
  await panel.locator("body").focus();
  await panel.evaluate(() => document.activeElement && document.activeElement.blur());
  await panel.keyboard.press("3");
  const onSettings = await panel.evaluate(() => document.getElementById("topTabSettings").getAttribute("aria-selected") === "true");
  check(onSettings, "shortcut 3 opens Settings");
  await panel.evaluate(() => { const c = document.getElementById("singleKeyShortcuts"); c.checked = false; c.dispatchEvent(new Event("change")); c.blur(); });
  await panel.keyboard.press("1");
  const stillSettings = await panel.evaluate(() => document.getElementById("topTabSettings").getAttribute("aria-selected") === "true");
  check(stillSettings, "shortcuts can be switched off (WCAG 2.1.4)");

  check(panelErrors.length === 0, "no uncaught errors in the panel", panelErrors.join(" | "));
} catch (err) {
  failed++;
  console.error("✗ panel e2e crashed:", err && err.stack || err);
} finally {
  await context.close();
  server.close();
  try { rmSync(userDataDir, { recursive: true, force: true }); } catch (_) { /* tmp */ }
}

if (failed) {
  console.error(`\nPANEL E2E FAILED — ${failed} check(s)`);
  process.exit(1);
}
console.log("\nPanel E2E OK");
