/**
 * Shared Chromium launcher for the headless scripts (ci-runner, e2e-smoke).
 *
 * Order: FLOWLENS_CHROMIUM (explicit executable) → Playwright's bundled
 * Chromium → the system `chrome` channel. The bundled build comes first so
 * results don't drift with whatever Chrome a CI image happens to ship.
 * Every failed attempt is reported, so a version mismatch surfaces its real
 * cause instead of a generic "no Chromium".
 */
export async function launchChromium() {
  let playwright;
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error("playwright not installed — run `npm ci && npx playwright install chromium`");
  }
  const attempts = [];
  if (process.env.FLOWLENS_CHROMIUM) attempts.push({ label: "FLOWLENS_CHROMIUM", opts: { executablePath: process.env.FLOWLENS_CHROMIUM } });
  attempts.push({ label: "bundled chromium", opts: {} });
  attempts.push({ label: "chrome channel", opts: { channel: "chrome" } });

  const errors = [];
  for (const { label, opts } of attempts) {
    try {
      return await playwright.chromium.launch({ headless: true, ...opts });
    } catch (err) {
      errors.push(`  ${label}: ${String(err?.message || err).split("\n")[0]}`);
    }
  }
  throw new Error(`could not launch Chromium:\n${errors.join("\n")}`);
}

/**
 * New page whose context ignores the site's Content-Security-Policy. The
 * snippet is injected as an inline script, which a `script-src` CSP would
 * otherwise block (the extension itself uses chrome.scripting, which CSP
 * doesn't affect).
 */
export async function newAuditPage(browser) {
  const context = await browser.newContext({ bypassCSP: true });
  return context.newPage();
}
