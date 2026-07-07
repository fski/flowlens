/**
 * Baseline export/import — pure function tests for
 * buildBaselineFromFindings, validateBaselinePayload and
 * compareAgainstBaseline (exporters.js).
 */

import { strict as assert } from "node:assert";
import { describe, it, beforeEach } from "node:test";
import { createContext } from "./harness.mjs";

const FK = "fk::https://example.com::prod::root";

const FINDINGS = [
  {
    type: "IMG_MISSING_ALT", severity: "high", wcag: "1.1.1",
    name: "Logo", path: "header > img:nth-of-type(1)",
    role: "img", tag: "IMG", testId: null,
  },
  {
    type: "NO_ACCESSIBLE_NAME", severity: "medium", wcag: "4.1.2",
    name: "close", path: "div > button.close",
    role: "button", tag: "BUTTON", testId: "close-btn",
  },
  {
    type: "POSITIVE_TABINDEX", severity: "low", wcag: "2.4.3",
    name: "search", path: "form > input",
    role: "textbox", tag: "INPUT", testId: null,
  },
];

const meta = { at: "2026-07-07T00:00:00.000Z", origin: "https://example.com", frameKeyStable: FK, mode: "run" };

// ══════════════════════════════════════════════════════
// buildBaselineFromFindings
// ══════════════════════════════════════════════════════

describe("buildBaselineFromFindings", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("produces the documented top-level shape", () => {
    const b = ctx.buildBaselineFromFindings(FINDINGS, meta);
    assert.equal(b.schemaVersion, 1);
    assert.equal(b.createdAt, meta.at);
    assert.equal(b.origin, meta.origin);
    assert.ok(Array.isArray(b.issues));
    assert.equal(b.issues.length, FINDINGS.length);
  });

  it("maps findings into pa11y-shaped issues with stable signatures", () => {
    const b = ctx.buildBaselineFromFindings(FINDINGS, meta);
    const issue = b.issues[0];
    assert.equal(issue.code, "IMG_MISSING_ALT");
    assert.equal(issue.type, "high");
    assert.equal(issue.message, "Logo");
    assert.equal(issue.context, null);
    assert.equal(issue.selector, "header > img:nth-of-type(1)");
    assert.equal(typeof issue.signature, "string");
    assert.ok(issue.signature.length > 0);
  });

  it("signature matches buildStableSignature for the same frameKeyStable/mode", () => {
    const b = ctx.buildBaselineFromFindings(FINDINGS, meta);
    assert.equal(b.issues[1].signature, ctx.buildStableSignature(FINDINGS[1], FK, "run"));
  });

  it("tolerates empty / non-array findings and missing meta", () => {
    const b1 = ctx.buildBaselineFromFindings([], {});
    assert.equal(b1.schemaVersion, 1);
    assert.equal(b1.issues.length, 0);
    assert.equal(b1.createdAt, null);
    assert.equal(b1.origin, null);
    const b2 = ctx.buildBaselineFromFindings(null, undefined);
    assert.equal(b2.issues.length, 0);
  });
});

// ══════════════════════════════════════════════════════
// validateBaselinePayload — malformed baseline rejection
// ══════════════════════════════════════════════════════

describe("validateBaselinePayload", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("accepts a baseline built by buildBaselineFromFindings", () => {
    const b = ctx.buildBaselineFromFindings(FINDINGS, meta);
    const r = ctx.validateBaselinePayload(b);
    assert.equal(r.ok, true);
    assert.equal(r.reason, null);
  });

  it("rejects null / non-object / array payloads", () => {
    assert.equal(ctx.validateBaselinePayload(null).ok, false);
    assert.equal(ctx.validateBaselinePayload("json").ok, false);
    assert.equal(ctx.validateBaselinePayload([1, 2]).ok, false);
  });

  it("rejects wrong schemaVersion", () => {
    const r = ctx.validateBaselinePayload({ schemaVersion: 2, issues: [] });
    assert.equal(r.ok, false);
    assert.match(r.reason, /schemaVersion/);
  });

  it("rejects missing / non-array issues", () => {
    assert.equal(ctx.validateBaselinePayload({ schemaVersion: 1 }).ok, false);
    assert.equal(ctx.validateBaselinePayload({ schemaVersion: 1, issues: "x" }).ok, false);
  });

  it("rejects issues without a signature", () => {
    const r = ctx.validateBaselinePayload({
      schemaVersion: 1,
      issues: [{ code: "X", signature: "" }],
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /signature/);
  });
});

// ══════════════════════════════════════════════════════
// compareAgainstBaseline — round trips
// ══════════════════════════════════════════════════════

describe("compareAgainstBaseline", () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it("round trip: same findings ⇒ 0 new, 0 resolved, all matched", () => {
    const baseline = ctx.buildBaselineFromFindings(FINDINGS, meta);
    const cmp = ctx.compareAgainstBaseline(baseline, FINDINGS, FK, "run");
    assert.equal(cmp.newIssues.length, 0);
    assert.equal(cmp.resolvedIssues.length, 0);
    assert.equal(cmp.matchedCount, FINDINGS.length);
  });

  it("adding a finding ⇒ 1 new, 0 resolved", () => {
    const baseline = ctx.buildBaselineFromFindings(FINDINGS, meta);
    const added = {
      type: "NO_H1", severity: "medium", wcag: "2.4.6",
      name: "", path: "body", role: null, tag: "BODY", testId: null,
    };
    const cmp = ctx.compareAgainstBaseline(baseline, [...FINDINGS, added], FK, "run");
    assert.equal(cmp.newIssues.length, 1);
    assert.equal(cmp.newIssues[0], added);
    assert.equal(cmp.resolvedIssues.length, 0);
    assert.equal(cmp.matchedCount, FINDINGS.length);
  });

  it("removing a finding ⇒ 0 new, 1 resolved", () => {
    const baseline = ctx.buildBaselineFromFindings(FINDINGS, meta);
    const cmp = ctx.compareAgainstBaseline(baseline, FINDINGS.slice(0, 2), FK, "run");
    assert.equal(cmp.newIssues.length, 0);
    assert.equal(cmp.resolvedIssues.length, 1);
    assert.equal(cmp.resolvedIssues[0].code, "POSITIVE_TABINDEX");
    assert.equal(cmp.matchedCount, 2);
  });

  it("different frameKeyStable ⇒ nothing matches", () => {
    const baseline = ctx.buildBaselineFromFindings(FINDINGS, meta);
    const cmp = ctx.compareAgainstBaseline(baseline, FINDINGS, "fk::other-frame", "run");
    assert.equal(cmp.matchedCount, 0);
    assert.equal(cmp.newIssues.length, FINDINGS.length);
    assert.equal(cmp.resolvedIssues.length, FINDINGS.length);
  });

  it("empty current findings ⇒ all baseline issues resolved", () => {
    const baseline = ctx.buildBaselineFromFindings(FINDINGS, meta);
    const cmp = ctx.compareAgainstBaseline(baseline, [], FK, "run");
    assert.equal(cmp.newIssues.length, 0);
    assert.equal(cmp.resolvedIssues.length, FINDINGS.length);
    assert.equal(cmp.matchedCount, 0);
  });

  it("tolerates malformed baseline objects without crashing", () => {
    const cmp1 = ctx.compareAgainstBaseline(null, FINDINGS, FK, "run");
    assert.equal(cmp1.newIssues.length, FINDINGS.length);
    assert.equal(cmp1.resolvedIssues.length, 0);
    const cmp2 = ctx.compareAgainstBaseline({ issues: [null, { signature: 42 }] }, [], FK, "run");
    assert.equal(cmp2.resolvedIssues.length, 0);
    assert.equal(cmp2.matchedCount, 0);
  });

  it("signature match survives text/note churn (stable signatures ignore notes)", () => {
    const baseline = ctx.buildBaselineFromFindings(FINDINGS, meta);
    const churned = FINDINGS.map(f => ({ ...f, note: "different note this run" }));
    const cmp = ctx.compareAgainstBaseline(baseline, churned, FK, "run");
    assert.equal(cmp.newIssues.length, 0);
    assert.equal(cmp.resolvedIssues.length, 0);
    assert.equal(cmp.matchedCount, FINDINGS.length);
  });
});
