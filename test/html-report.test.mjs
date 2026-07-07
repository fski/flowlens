/**
 * Self-contained HTML report — pure function tests for buildHtmlReport
 * and htmlEscape (exporters.js). The report must be a static document:
 * inline CSS only, no scripts, no external references, everything escaped.
 */

import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { createContext } from "./harness.mjs";

const basePayload = () => ({
  title: "FlowLens Accessibility Report",
  generatedAt: "2026-07-07T12:00:00.000Z",
  url: "https://example.com/checkout?step=2",
  mode: "run",
  findings: [
    {
      severity: "high", wcag: "1.1.1", name: "Logo image",
      type: "IMG_MISSING_ALT", path: "header > img:nth-of-type(1)",
      fix: 'Add alt="description" to the <img> tag.',
    },
    {
      severity: "medium", wcag: "4.1.2", name: "close",
      type: "NO_ACCESSIBLE_NAME", path: "div > button.close",
      fix: "Add aria-label or visible text to this button.",
    },
  ],
  severityCounts: { critical: 0, high: 1, medium: 1, low: 0, info: 0 },
});

// ══════════════════════════════════════════════════════
// htmlEscape (local to exporters.js)
// ══════════════════════════════════════════════════════

describe("htmlEscape", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("escapes the five HTML-sensitive characters", () => {
    assert.equal(ctx.htmlEscape(`<a href="x" title='y'>&`), "&lt;a href=&quot;x&quot; title=&#039;y&#039;&gt;&amp;");
  });

  it("stringifies null/undefined to empty string", () => {
    assert.equal(ctx.htmlEscape(null), "");
    assert.equal(ctx.htmlEscape(undefined), "");
  });
});

// ══════════════════════════════════════════════════════
// buildHtmlReport — structure
// ══════════════════════════════════════════════════════

describe("buildHtmlReport structure", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("is a complete standalone HTML document", () => {
    const html = ctx.buildHtmlReport(basePayload());
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("<html"));
    assert.ok(html.includes("</html>"));
    assert.ok(html.includes('<meta charset="utf-8">'));
    assert.ok(html.includes("<title>FlowLens Accessibility Report</title>"));
    assert.ok(html.includes("<style>"));
  });

  it("renders header meta (generatedAt, url, mode)", () => {
    const html = ctx.buildHtmlReport(basePayload());
    assert.ok(html.includes("2026-07-07T12:00:00.000Z"));
    assert.ok(html.includes("https://example.com/checkout?step=2"));
    assert.ok(html.includes("Mode: run"));
  });

  it("renders the severity summary table with counts", () => {
    const html = ctx.buildHtmlReport(basePayload());
    assert.ok(html.includes("Severity summary"));
    for (const sev of ["critical", "high", "medium", "low", "info"]) {
      assert.ok(html.includes(`sev-${sev}`), `expected severity row for ${sev}`);
    }
  });

  it("renders one findings row per finding incl. fix and path", () => {
    const html = ctx.buildHtmlReport(basePayload());
    assert.ok(html.includes("IMG_MISSING_ALT"));
    assert.ok(html.includes("NO_ACCESSIBLE_NAME"));
    assert.ok(html.includes("header &gt; img:nth-of-type(1)"));
    assert.ok(html.includes("Add aria-label or visible text to this button."));
  });

  it("renders an empty-state message when there are no findings", () => {
    const html = ctx.buildHtmlReport({ ...basePayload(), findings: [] });
    assert.ok(html.includes("No findings."));
  });

  it("renders the optional flow steps table with per-step verdicts", () => {
    const payload = {
      ...basePayload(),
      sessionSummary: {
        id: "sess_abc",
        steps: [
          { index: 1, label: "Landing", route: "example.com/", added: 0, fixed: 0, persisting: 3, blockingAdded: 0 },
          { index: 2, label: "Checkout", route: "example.com/checkout", added: 2, fixed: 1, persisting: 3, blockingAdded: 2 },
        ],
      },
    };
    const html = ctx.buildHtmlReport(payload);
    assert.ok(html.includes("Flow steps"));
    assert.ok(html.includes("sess_abc"));
    assert.ok(html.includes("Landing"));
    assert.ok(html.includes("Checkout"));
    assert.ok(html.includes("<td>PASS</td>"));
    assert.ok(html.includes("<td>FAIL</td>"));
  });

  it("omits the flow steps section when sessionSummary is absent or empty", () => {
    assert.ok(!ctx.buildHtmlReport(basePayload()).includes("Flow steps"));
    const html = ctx.buildHtmlReport({ ...basePayload(), sessionSummary: { steps: [] } });
    assert.ok(!html.includes("Flow steps"));
  });

  it("tolerates a missing payload without crashing", () => {
    const html = ctx.buildHtmlReport(null);
    assert.ok(html.startsWith("<!doctype html>"));
    assert.ok(html.includes("No findings."));
  });
});

// ══════════════════════════════════════════════════════
// buildHtmlReport — escaping + self-containment
// ══════════════════════════════════════════════════════

describe("buildHtmlReport escaping and self-containment", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("escapes <script> injected via finding names", () => {
    const payload = basePayload();
    payload.findings[0].name = '<script>alert("xss")</script>';
    const html = ctx.buildHtmlReport(payload);
    assert.ok(html.includes("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"));
    assert.ok(!/<script\b/i.test(html));
  });

  it("escapes markup injected via path, fix, url, title and step labels", () => {
    const payload = basePayload();
    payload.title = 'Report "quoted" <b>';
    payload.url = 'https://example.com/"><img src=x onerror=alert(1)>';
    payload.findings[0].path = 'div > img[alt="<script>"]';
    payload.findings[0].fix = "<style>*{display:none}</style>";
    payload.sessionSummary = {
      steps: [{ index: 1, label: "<iframe src=evil>", route: "<svg onload=x>", added: 0, fixed: 0, persisting: 0, blockingAdded: 0 }],
    };
    const html = ctx.buildHtmlReport(payload);
    assert.ok(!/<script\b/i.test(html));
    assert.ok(!/<iframe\b/i.test(html));
    assert.ok(!/<svg\b/i.test(html));
    assert.ok(!/<img\b/i.test(html));
    assert.ok(!html.includes("<style>*{display:none}</style>"));
    assert.ok(html.includes("&lt;iframe src=evil&gt;"));
  });

  it("contains no external references: no http(s) src/href attributes", () => {
    const payload = basePayload();
    payload.sessionSummary = {
      steps: [{ index: 1, label: "s", route: "https://example.com/step", added: 0, fixed: 0, persisting: 0, blockingAdded: 0 }],
    };
    const html = ctx.buildHtmlReport(payload);
    // URLs may appear as escaped text, but never as fetchable src/href attributes.
    assert.ok(!/(?:src|href)\s*=\s*["']?\s*https?:\/\//i.test(html));
    assert.ok(!/<link\b/i.test(html));
    assert.ok(!/@import/i.test(html));
    assert.ok(!/url\s*\(\s*["']?https?:/i.test(html));
  });

  it("contains no script tags and no inline event handlers", () => {
    const html = ctx.buildHtmlReport(basePayload());
    assert.ok(!/<script\b/i.test(html));
    assert.ok(!/\son[a-z]+\s*=/i.test(html));
  });
});
