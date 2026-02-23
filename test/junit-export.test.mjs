/**
 * JUnit XML export tests — xmlEscape, buildJunitXmlForRun,
 * buildJunitXmlForSession, buildJunitTestsuiteXml, plus
 * sortFindingsForExport determinism and immutability.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

// ── sortFindingsForExport (existing) ────────────────────────────────────────

describe('sortFindingsForExport', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('returns a new array (does not mutate input)', () => {
    const findings = [
      { type: 'B', severity: 'low', wcag: '1.1.1', path: 'b' },
      { type: 'A', severity: 'high', wcag: '4.1.2', path: 'a' },
    ];
    const original = [...findings];
    const sorted = ctx.sortFindingsForExport(findings);
    assert.equal(findings[0].type, original[0].type, 'input must not be mutated');
    assert.notEqual(sorted, findings, 'should return a new array');
  });

  it('sorts by type as primary key', () => {
    const findings = [
      { type: 'Z_RULE', severity: 'low', wcag: '1.1.1', path: 'z' },
      { type: 'A_RULE', severity: 'high', wcag: '4.1.2', path: 'a' },
    ];
    const sorted = ctx.sortFindingsForExport(findings);
    assert.equal(sorted[0].type, 'A_RULE');
    assert.equal(sorted[1].type, 'Z_RULE');
  });

  it('sorts by wcag when type is equal', () => {
    const findings = [
      { type: 'SAME', severity: 'low', wcag: '4.1.2', path: 'x' },
      { type: 'SAME', severity: 'high', wcag: '1.1.1', path: 'y' },
    ];
    const sorted = ctx.sortFindingsForExport(findings);
    assert.equal(sorted[0].wcag, '1.1.1');
    assert.equal(sorted[1].wcag, '4.1.2');
  });

  it('deterministic: same input produces same output', () => {
    const findings = [
      { type: 'B', severity: 'low', wcag: '1.1.1', confidence: 'heuristic', path: 'b' },
      { type: 'A', severity: 'high', wcag: '4.1.2', confidence: 'strict', path: 'a' },
    ];
    const sorted1 = ctx.sortFindingsForExport(findings);
    const sorted2 = ctx.sortFindingsForExport(findings);
    assert.equal(sorted1.length, sorted2.length);
    for (let i = 0; i < sorted1.length; i++) {
      assert.equal(sorted1[i].type, sorted2[i].type);
    }
  });

  it('returns empty array for non-array input', () => {
    assert.equal(ctx.sortFindingsForExport(null).length, 0);
    assert.equal(ctx.sortFindingsForExport(undefined).length, 0);
    assert.equal(ctx.sortFindingsForExport('not an array').length, 0);
  });

  it('returns empty array for empty input', () => {
    assert.equal(ctx.sortFindingsForExport([]).length, 0);
  });

  it('handles single-item array', () => {
    const findings = [{ type: 'A', severity: 'high', wcag: '4.1.2', path: 'a' }];
    const sorted = ctx.sortFindingsForExport(findings);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].type, 'A');
  });

  it('accepts optional ctx parameter for frameKey scope', () => {
    const findings = [
      { type: 'A', severity: 'high', wcag: '4.1.2', path: 'a' },
    ];
    const sorted = ctx.sortFindingsForExport(findings, {
      frameKey: 'fk::v1::https://example.com::/::00000000',
      scope: { type: 'document', rootSelector: null },
    });
    assert.equal(sorted.length, 1);
  });
});

// ── safeCdata ────────────────────────────────────────────────────────────────

describe('safeCdata', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('returns string unchanged when no ]]> present', () => {
    assert.equal(ctx.safeCdata('hello world'), 'hello world');
  });

  it('splits ]]> into safe CDATA boundary', () => {
    assert.equal(ctx.safeCdata('a]]>b'), 'a]]]]><![CDATA[>b');
  });

  it('handles multiple ]]> occurrences', () => {
    const result = ctx.safeCdata('x]]>y]]>z');
    assert.ok(!result.includes(']]>z'));
    assert.equal(result, 'x]]]]><![CDATA[>y]]]]><![CDATA[>z');
  });

  it('handles null and undefined', () => {
    assert.equal(ctx.safeCdata(null), '');
    assert.equal(ctx.safeCdata(undefined), '');
  });

  it('is deterministic', () => {
    const input = 'severity: high]]>note: bad';
    assert.equal(ctx.safeCdata(input), ctx.safeCdata(input));
  });
});

// ── CDATA hardening in JUnit output ──────────────────────────────────────────

describe('JUnit CDATA hardening', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  const baseMeta = {
    extensionVersion: '3.0.1', schemaVersion: 3, signatureVersion: 2,
    frameKeyVersion: 1, enMappingVersion: 1, url: 'https://example.com',
    envTag: 'test', wcagLevel: 'AA', capturedAt: '2025-01-01T00:00:00Z',
  };

  it('failure CDATA body with ]]> is split correctly', () => {
    const findings = [
      { type: 'TEST', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'div', note: 'bad]]>data' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    // The raw "]]>" from the note should be split
    assert.ok(!xml.includes('bad]]>data'));
    assert.ok(xml.includes('bad]]]]><![CDATA[>data'));
  });

  it('system-out CDATA body with ]]> in severity is split correctly', () => {
    const findings = [
      { type: 'INFO', severity: 'info]]>', confidence: null, wcag: '1.3.1', path: 'p' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.ok(!xml.match(/<!\[CDATA\[[^\]]*]]>[^\]]/));
  });

  it('output is still valid XML structure after CDATA splitting', () => {
    const findings = [
      { type: 'X', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: ']]>tricky' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    // Should not contain a bare ]]> that isn't part of a CDATA end marker
    const cdataBlocks = xml.match(/<!\[CDATA\[[\s\S]*?]]>/g) || [];
    for (const block of cdataBlocks) {
      const inner = block.slice(9, -3); // strip <![CDATA[ and ]]>
      assert.ok(!inner.includes(']]>'), `CDATA block contains unescaped ]]>: ${inner}`);
    }
  });
});

// ── xmlEscape ───────────────────────────────────────────────────────────────

describe('xmlEscape', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('escapes < > & " and apostrophe', () => {
    assert.equal(ctx.xmlEscape('<b>"a&b"</b>'), '&lt;b&gt;&quot;a&amp;b&quot;&lt;/b&gt;');
    assert.equal(ctx.xmlEscape("it's"), "it&apos;s");
  });

  it('handles null and undefined', () => {
    assert.equal(ctx.xmlEscape(null), '');
    assert.equal(ctx.xmlEscape(undefined), '');
  });

  it('handles numbers', () => {
    assert.equal(ctx.xmlEscape(42), '42');
  });
});

// ── buildJunitXmlForRun ─────────────────────────────────────────────────────

describe('buildJunitXmlForRun', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  const baseMeta = {
    extensionVersion: '3.0.1',
    schemaVersion: 3,
    signatureVersion: 2,
    frameKeyVersion: 1,
    enMappingVersion: 1,
    url: 'https://example.com',
    envTag: 'example.com \u2022 prod',
    wcagLevel: 'AA',
    capturedAt: '2025-01-15T10:30:00.000Z',
  };

  it('emits XML header and root elements', () => {
    const xml = ctx.buildJunitXmlForRun({ findings: [], ctx: {}, meta: baseMeta });
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('<testsuites'));
    assert.ok(xml.includes('</testsuites>'));
  });

  it('includes meta attributes on root element', () => {
    const xml = ctx.buildJunitXmlForRun({ findings: [], ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('extensionVersion="3.0.1"'));
    assert.ok(xml.includes('schemaVersion="3"'));
    assert.ok(xml.includes('signatureVersion="2"'));
    assert.ok(xml.includes('frameKeyVersion="1"'));
    assert.ok(xml.includes('enMappingVersion="1"'));
    assert.ok(xml.includes('url="https://example.com"'));
    assert.ok(xml.includes('wcagLevel="AA"'));
    assert.ok(xml.includes('capturedAt="2025-01-15T10:30:00.000Z"'));
  });

  it('includes scope attributes', () => {
    const xml = ctx.buildJunitXmlForRun({
      findings: [],
      ctx: { frameKey: 'fk::1::example::/::abc', scope: { type: 'subtree', rootSelector: '#main' } },
      meta: baseMeta,
    });
    assert.ok(xml.includes('frameKey="fk::1::example::/::abc"'));
    assert.ok(xml.includes('scopeType="subtree"'));
    assert.ok(xml.includes('scopeRootSelector="#main"'));
  });

  it('defaults scope to document when not provided', () => {
    const xml = ctx.buildJunitXmlForRun({ findings: [], ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('scopeType="document"'));
    assert.ok(xml.includes('scopeRootSelector=""'));
  });

  it('emits <testsuite> with correct test counts', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'div > img' },
      { type: 'BTN_NAME', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic', path: 'button' },
      { type: 'INFO_NOTE', severity: 'info', confidence: null, path: 'p' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('tests="3"'));
    assert.ok(xml.includes('failures="1"'));
    assert.ok(xml.includes('skipped="1"'));
    assert.ok(xml.includes('errors="0"'));
  });

  it('blocking finding emits <failure>', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'div > img', testId: 'hero', note: 'Missing alt' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('<failure'));
    assert.ok(xml.includes('severity: high'));
    assert.ok(xml.includes('confidence: strict'));
    assert.ok(xml.includes('wcag: 1.1.1'));
    assert.ok(xml.includes('path: div > img'));
    assert.ok(xml.includes('testId: hero'));
    assert.ok(xml.includes('note: Missing alt'));
  });

  it('needs_review finding emits <skipped>', () => {
    const findings = [
      { type: 'BTN_NAME', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic', path: 'button' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('<skipped message="needs_review: heuristic"'));
  });

  it('info finding emits <system-out>', () => {
    const findings = [
      { type: 'INFO_NOTE', severity: 'info', confidence: null, wcag: '1.3.1', path: 'section' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('<system-out>'));
    assert.ok(xml.includes('severity: info'));
    assert.ok(xml.includes('wcag: 1.3.1'));
  });

  it('deterministic: same input produces identical XML bytes', () => {
    const findings = [
      { type: 'Z_RULE', severity: 'low', wcag: '2.4.7', confidence: 'strict', path: 'z' },
      { type: 'A_RULE', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'a' },
    ];
    const xml1 = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    const xml2 = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.equal(xml1, xml2);
  });

  it('uses sortFindingsForExport ordering (unsorted input => stable order)', () => {
    const findings = [
      { type: 'Z_RULE', severity: 'low', wcag: '2.4.7', confidence: 'strict', path: 'z' },
      { type: 'A_RULE', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'a' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    const aIdx = xml.indexOf('A_RULE');
    const zIdx = xml.indexOf('Z_RULE');
    assert.ok(aIdx < zIdx, 'A_RULE should appear before Z_RULE after sorting');
  });

  it('does NOT contain runtime-generated date strings', () => {
    const xml = ctx.buildJunitXmlForRun({
      findings: [{ type: 'T', severity: 'high', confidence: 'strict' }],
      ctx: {},
      meta: baseMeta,
    });
    const matches = xml.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/g) || [];
    for (const m of matches) {
      assert.ok(m.startsWith('2025-01-15'), `timestamp should be from meta.capturedAt, not runtime: ${m}`);
    }
  });

  it('escapes special XML characters in finding fields', () => {
    const findings = [
      { type: 'X<Y', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: '<div "test">', note: 'A & B' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('X&lt;Y'));
    assert.ok(!xml.includes('classname="<'));
  });

  it('handles missing finding fields with placeholder', () => {
    const findings = [
      { type: null, severity: undefined, wcag: undefined, confidence: undefined, path: undefined },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('\u2014'));
    assert.ok(xml.includes('<testcase'));
  });

  it('handles empty findings', () => {
    const xml = ctx.buildJunitXmlForRun({ findings: [], ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('tests="0"'));
    assert.ok(xml.includes('failures="0"'));
    assert.ok(xml.includes('skipped="0"'));
  });

  it('time attribute is always "0"', () => {
    const findings = [
      { type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'a' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    const timeMatches = xml.match(/time="([^"]+)"/g) || [];
    for (const m of timeMatches) {
      assert.equal(m, 'time="0"');
    }
  });
});

// ── buildJunitTestsuiteXml ──────────────────────────────────────────────────

describe('buildJunitTestsuiteXml', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('includes <testsuite> with custom name', () => {
    const result = ctx.buildJunitTestsuiteXml({
      suiteName: 'Step 1 \u2014 /login',
      findings: [],
      ctx: {},
      meta: {},
      capturedAt: '2025-01-15T10:00:00Z',
    });
    assert.ok(result.xml.includes('name="Step 1'));
    assert.ok(result.xml.includes('timestamp="2025-01-15T10:00:00Z"'));
    assert.equal(typeof result.failures, 'number');
    assert.equal(typeof result.skipped, 'number');
  });

  it('includes <testcase> elements for each finding', () => {
    const findings = [
      { type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
      { type: 'B', severity: 'low', wcag: '2.4.7', confidence: 'strict', path: 'div' },
    ];
    const result = ctx.buildJunitTestsuiteXml({ suiteName: 'test', findings, ctx: {}, meta: {} });
    const caseCount = (result.xml.match(/<testcase/g) || []).length;
    assert.equal(caseCount, 2);
  });

  it('returns failures and skipped counts', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
      { type: 'BTN_NAME', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic', path: 'button' },
      { type: 'INFO', severity: 'info', confidence: null, path: 'p' },
    ];
    const result = ctx.buildJunitTestsuiteXml({ suiteName: 'test', findings, ctx: {}, meta: {} });
    assert.equal(result.failures, 1);
    assert.equal(result.skipped, 1);
  });

  it('includes <properties> section with CI option values', () => {
    const result = ctx.buildJunitTestsuiteXml({
      suiteName: 'test', findings: [], ctx: {}, meta: {},
    });
    assert.ok(result.xml.includes('<properties>'));
    assert.ok(result.xml.includes('name="failOnBlocking"'));
    assert.ok(result.xml.includes('name="treatNeedsReviewAsFailure"'));
    assert.ok(result.xml.includes('name="maxFailuresAllowed"'));
  });
});

// ── normalizeJunitCiOptions ─────────────────────────────────────────────────

describe('normalizeJunitCiOptions', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('returns defaults for null/undefined', () => {
    const d1 = ctx.normalizeJunitCiOptions(null);
    assert.equal(d1.failOnBlocking, true);
    assert.equal(d1.treatNeedsReviewAsFailure, false);
    assert.equal(d1.maxFailuresAllowed, 0);

    const d2 = ctx.normalizeJunitCiOptions(undefined);
    assert.equal(d2.failOnBlocking, true);
    assert.equal(d2.treatNeedsReviewAsFailure, false);
    assert.equal(d2.maxFailuresAllowed, 0);
  });

  it('returns defaults for empty object', () => {
    const d = ctx.normalizeJunitCiOptions({});
    assert.equal(d.failOnBlocking, true);
    assert.equal(d.treatNeedsReviewAsFailure, false);
    assert.equal(d.maxFailuresAllowed, 0);
  });

  it('respects explicit values', () => {
    const d = ctx.normalizeJunitCiOptions({
      failOnBlocking: false,
      treatNeedsReviewAsFailure: true,
      maxFailuresAllowed: 5,
    });
    assert.equal(d.failOnBlocking, false);
    assert.equal(d.treatNeedsReviewAsFailure, true);
    assert.equal(d.maxFailuresAllowed, 5);
  });

  it('floors fractional maxFailuresAllowed', () => {
    const d = ctx.normalizeJunitCiOptions({ maxFailuresAllowed: 3.7 });
    assert.equal(d.maxFailuresAllowed, 3);
  });

  it('clamps negative maxFailuresAllowed to 0', () => {
    const d = ctx.normalizeJunitCiOptions({ maxFailuresAllowed: -5 });
    assert.equal(d.maxFailuresAllowed, 0);
  });

  it('treats non-numeric maxFailuresAllowed as 0', () => {
    const d = ctx.normalizeJunitCiOptions({ maxFailuresAllowed: 'abc' });
    assert.equal(d.maxFailuresAllowed, 0);
  });

  it('is deterministic', () => {
    const input = { failOnBlocking: false, treatNeedsReviewAsFailure: true, maxFailuresAllowed: 2 };
    const a = ctx.normalizeJunitCiOptions(input);
    const b = ctx.normalizeJunitCiOptions(input);
    assert.equal(a.failOnBlocking, b.failOnBlocking);
    assert.equal(a.treatNeedsReviewAsFailure, b.treatNeedsReviewAsFailure);
    assert.equal(a.maxFailuresAllowed, b.maxFailuresAllowed);
  });
});

// ── computeCiStatus ─────────────────────────────────────────────────────────

describe('computeCiStatus', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('returns "pass" when totalFailures is 0 and maxAllowed is 0', () => {
    assert.equal(ctx.computeCiStatus(0, 0), 'pass');
  });

  it('returns "fail" when totalFailures exceeds maxAllowed', () => {
    assert.equal(ctx.computeCiStatus(1, 0), 'fail');
    assert.equal(ctx.computeCiStatus(5, 4), 'fail');
  });

  it('returns "pass" when totalFailures equals maxAllowed', () => {
    assert.equal(ctx.computeCiStatus(3, 3), 'pass');
  });

  it('returns "pass" when totalFailures is below maxAllowed', () => {
    assert.equal(ctx.computeCiStatus(2, 5), 'pass');
  });

  it('boundary: 1 failure with maxAllowed 0 is fail', () => {
    assert.equal(ctx.computeCiStatus(1, 0), 'fail');
  });

  it('boundary: 0 failures with maxAllowed 0 is pass', () => {
    assert.equal(ctx.computeCiStatus(0, 0), 'pass');
  });
});

// ── isNonDefaultJunitCiOptions ──────────────────────────────────────────────

describe('isNonDefaultJunitCiOptions', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('returns false for default options', () => {
    assert.equal(ctx.isNonDefaultJunitCiOptions({ failOnBlocking: true, treatNeedsReviewAsFailure: false, maxFailuresAllowed: 0 }), false);
  });

  it('returns false for null/undefined (defaults)', () => {
    assert.equal(ctx.isNonDefaultJunitCiOptions(null), false);
    assert.equal(ctx.isNonDefaultJunitCiOptions(undefined), false);
  });

  it('returns true when failOnBlocking is false', () => {
    assert.equal(ctx.isNonDefaultJunitCiOptions({ failOnBlocking: false }), true);
  });

  it('returns true when treatNeedsReviewAsFailure is true', () => {
    assert.equal(ctx.isNonDefaultJunitCiOptions({ treatNeedsReviewAsFailure: true }), true);
  });

  it('returns true when maxFailuresAllowed > 0', () => {
    assert.equal(ctx.isNonDefaultJunitCiOptions({ maxFailuresAllowed: 3 }), true);
  });

  it('returns true when multiple non-default values set', () => {
    assert.equal(ctx.isNonDefaultJunitCiOptions({
      failOnBlocking: false, treatNeedsReviewAsFailure: true, maxFailuresAllowed: 10,
    }), true);
  });
});

// ── buildJunitTestsuiteXml with ciOptions ───────────────────────────────────

describe('buildJunitTestsuiteXml with ciOptions', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('treatNeedsReviewAsFailure promotes needs_review to <failure>', () => {
    const findings = [
      { type: 'BTN_NAME', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic', path: 'button' },
    ];
    const result = ctx.buildJunitTestsuiteXml({
      suiteName: 'test', findings, ctx: {}, meta: {},
      ciOptions: { treatNeedsReviewAsFailure: true },
    });
    assert.ok(result.xml.includes('<failure'));
    assert.ok(result.xml.includes('type="needs_review"'));
    assert.equal(result.failures, 1);
    assert.equal(result.skipped, 0);
  });

  it('failOnBlocking:false demotes blocking to <system-out>', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
    ];
    const result = ctx.buildJunitTestsuiteXml({
      suiteName: 'test', findings, ctx: {}, meta: {},
      ciOptions: { failOnBlocking: false },
    });
    assert.ok(!result.xml.includes('<failure'));
    assert.ok(result.xml.includes('<system-out>'));
    assert.ok(result.xml.includes('blocking: true'));
    assert.equal(result.failures, 0);
  });

  it('default options produce same classification as no options', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
      { type: 'BTN_NAME', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic', path: 'button' },
      { type: 'INFO', severity: 'info', confidence: null, path: 'p' },
    ];
    const withDefaults = ctx.buildJunitTestsuiteXml({
      suiteName: 'test', findings, ctx: {}, meta: {},
      ciOptions: { failOnBlocking: true, treatNeedsReviewAsFailure: false, maxFailuresAllowed: 0 },
    });
    const noOptions = ctx.buildJunitTestsuiteXml({
      suiteName: 'test', findings, ctx: {}, meta: {},
    });
    assert.equal(withDefaults.failures, noOptions.failures);
    assert.equal(withDefaults.skipped, noOptions.skipped);
  });

  it('properties section reflects ciOptions', () => {
    const result = ctx.buildJunitTestsuiteXml({
      suiteName: 'test', findings: [], ctx: {}, meta: {},
      ciOptions: { failOnBlocking: false, treatNeedsReviewAsFailure: true, maxFailuresAllowed: 5 },
    });
    assert.ok(result.xml.includes('value="false"'), 'failOnBlocking should be false');
    assert.ok(result.xml.includes('value="true"'), 'treatNeedsReviewAsFailure should be true');
    assert.ok(result.xml.includes('value="5"'), 'maxFailuresAllowed should be 5');
  });

  it('combined: needs_review as failure + failOnBlocking:false', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
      { type: 'BTN_NAME', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic', path: 'button' },
    ];
    const result = ctx.buildJunitTestsuiteXml({
      suiteName: 'test', findings, ctx: {}, meta: {},
      ciOptions: { failOnBlocking: false, treatNeedsReviewAsFailure: true },
    });
    // BTN_NAME (needs_review) promoted to failure, IMG_ALT (blocking) demoted to system-out
    assert.equal(result.failures, 1);
    assert.ok(result.xml.includes('type="needs_review"'));
    assert.ok(result.xml.includes('blocking: true'));
  });

  it('is deterministic with ciOptions', () => {
    const findings = [
      { type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'a' },
      { type: 'B', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic', path: 'b' },
    ];
    const opts = {
      suiteName: 'test', findings, ctx: {}, meta: {},
      ciOptions: { treatNeedsReviewAsFailure: true, maxFailuresAllowed: 3 },
    };
    const a = ctx.buildJunitTestsuiteXml(opts);
    const b = ctx.buildJunitTestsuiteXml(opts);
    assert.equal(a.xml, b.xml);
    assert.equal(a.failures, b.failures);
    assert.equal(a.skipped, b.skipped);
  });
});

// ── buildJunitXmlForRun with ciOptions ──────────────────────────────────────

describe('buildJunitXmlForRun with ciOptions', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  const baseMeta = {
    extensionVersion: '3.0.1', schemaVersion: 3, signatureVersion: 2,
    frameKeyVersion: 1, enMappingVersion: 1, url: 'https://example.com',
    envTag: 'example.com \u2022 prod', wcagLevel: 'AA',
    capturedAt: '2025-01-15T10:30:00.000Z',
  };

  it('includes totalFailures, totalSkipped, ciStatus on root element', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
    ];
    const xml = ctx.buildJunitXmlForRun({ findings, ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('totalFailures="1"'));
    assert.ok(xml.includes('totalSkipped="0"'));
    assert.ok(xml.includes('ciStatus="fail"'));
  });

  it('ciStatus is pass when no failures and maxFailuresAllowed=0', () => {
    const xml = ctx.buildJunitXmlForRun({ findings: [], ctx: {}, meta: baseMeta });
    assert.ok(xml.includes('ciStatus="pass"'));
    assert.ok(xml.includes('totalFailures="0"'));
  });

  it('ciStatus respects maxFailuresAllowed threshold', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
      { type: 'BTN', severity: 'high', wcag: '4.1.2', confidence: 'strict', path: 'btn' },
    ];
    // 2 failures with maxAllowed=2 => pass
    const xml = ctx.buildJunitXmlForRun({
      findings, ctx: {}, meta: baseMeta,
      ciOptions: { maxFailuresAllowed: 2 },
    });
    assert.ok(xml.includes('ciStatus="pass"'));
    assert.ok(xml.includes('totalFailures="2"'));
  });

  it('treatNeedsReviewAsFailure increases totalFailures', () => {
    const findings = [
      { type: 'BTN_NAME', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic', path: 'button' },
    ];
    const xml = ctx.buildJunitXmlForRun({
      findings, ctx: {}, meta: baseMeta,
      ciOptions: { treatNeedsReviewAsFailure: true },
    });
    assert.ok(xml.includes('totalFailures="1"'));
    assert.ok(xml.includes('totalSkipped="0"'));
    assert.ok(xml.includes('ciStatus="fail"'));
  });

  it('failOnBlocking:false decreases totalFailures', () => {
    const findings = [
      { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
    ];
    const xml = ctx.buildJunitXmlForRun({
      findings, ctx: {}, meta: baseMeta,
      ciOptions: { failOnBlocking: false },
    });
    assert.ok(xml.includes('totalFailures="0"'));
    assert.ok(xml.includes('ciStatus="pass"'));
  });

  it('is deterministic with ciOptions', () => {
    const findings = [
      { type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'a' },
    ];
    const args = {
      findings, ctx: {}, meta: baseMeta,
      ciOptions: { treatNeedsReviewAsFailure: true, maxFailuresAllowed: 5 },
    };
    assert.equal(ctx.buildJunitXmlForRun(args), ctx.buildJunitXmlForRun(args));
  });
});

// ── buildJunitXmlForSession with ciOptions ──────────────────────────────────

describe('buildJunitXmlForSession with ciOptions', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  const sessionMeta2 = {
    extensionVersion: '3.0.1', schemaVersion: 3, signatureVersion: 2,
    frameKeyVersion: 1, enMappingVersion: 1, url: 'https://example.com',
    envTag: 'example.com \u2022 prod', wcagLevel: 'AA',
  };

  function makeSession2(steps) {
    return { id: 'sess_ci_test', startedAt: '2025-01-15T10:00:00.000Z', steps: steps || [] };
  }

  function makeStep2(index, findings) {
    return {
      id: `step_${index}`, index, label: null,
      at: `2025-01-15T10:0${index}:00.000Z`,
      url: 'https://example.com/page',
      snapshots: {
        run: {
          mode: 'run',
          capturedAt: `2025-01-15T10:0${index}:00.000Z`,
          best: {
            frameKey: 'fk::1::example::/::00000000',
            normalized: { raw: { findings } },
          },
        },
      },
    };
  }

  it('aggregates totalFailures across steps', () => {
    const steps = [
      makeStep2(1, [{ type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict' }]),
      makeStep2(2, [{ type: 'B', severity: 'high', wcag: '4.1.2', confidence: 'strict' }]),
    ];
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession2(steps), rawAppendix: {}, meta: sessionMeta2,
    });
    assert.ok(xml.includes('totalFailures="2"'));
    assert.ok(xml.includes('ciStatus="fail"'));
  });

  it('ciStatus with threshold across steps', () => {
    const steps = [
      makeStep2(1, [{ type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict' }]),
      makeStep2(2, [{ type: 'B', severity: 'high', wcag: '4.1.2', confidence: 'strict' }]),
    ];
    // 2 failures with maxAllowed=2 => pass
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession2(steps), rawAppendix: {}, meta: sessionMeta2,
      ciOptions: { maxFailuresAllowed: 2 },
    });
    assert.ok(xml.includes('totalFailures="2"'));
    assert.ok(xml.includes('ciStatus="pass"'));
  });

  it('treatNeedsReviewAsFailure propagates to all steps', () => {
    const steps = [
      makeStep2(1, [{ type: 'BTN', severity: 'medium', wcag: '4.1.2', confidence: 'heuristic' }]),
      makeStep2(2, [{ type: 'LNK', severity: 'medium', wcag: '2.4.4', confidence: 'heuristic' }]),
    ];
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession2(steps), rawAppendix: {}, meta: sessionMeta2,
      ciOptions: { treatNeedsReviewAsFailure: true },
    });
    assert.ok(xml.includes('totalFailures="2"'));
    assert.ok(xml.includes('totalSkipped="0"'));
  });

  it('is deterministic with ciOptions', () => {
    const steps = [
      makeStep2(1, [{ type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict' }]),
    ];
    const args = {
      session: makeSession2(steps), rawAppendix: {}, meta: sessionMeta2,
      ciOptions: { failOnBlocking: false, treatNeedsReviewAsFailure: true },
    };
    assert.equal(ctx.buildJunitXmlForSession(args), ctx.buildJunitXmlForSession(args));
  });
});

// ── buildJunitXmlForSession ─────────────────────────────────────────────────

describe('buildJunitXmlForSession', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  const sessionMeta = {
    extensionVersion: '3.0.1',
    schemaVersion: 3,
    signatureVersion: 2,
    frameKeyVersion: 1,
    enMappingVersion: 1,
    url: 'https://example.com',
    envTag: 'example.com \u2022 prod',
    wcagLevel: 'AA',
  };

  function makeSession(steps) {
    return {
      id: 'sess_test_123',
      startedAt: '2025-01-15T10:00:00.000Z',
      steps: steps || [],
    };
  }

  function makeStep(index, findings, opts = {}) {
    const fk = opts.frameKey || 'fk::1::example::/::00000000';
    return {
      id: `step_${index}`,
      index,
      label: opts.label || null,
      at: opts.at || `2025-01-15T10:0${index}:00.000Z`,
      url: opts.url || 'https://example.com/page',
      snapshots: {
        run: {
          mode: 'run',
          capturedAt: opts.at || `2025-01-15T10:0${index}:00.000Z`,
          best: {
            frameKey: fk,
            normalized: {
              raw: { findings },
            },
          },
        },
      },
    };
  }

  it('emits XML header and session root element', () => {
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession([]),
      rawAppendix: {},
      meta: sessionMeta,
    });
    assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
    assert.ok(xml.includes('name="FlowLens Session sess_test_123"'));
    assert.ok(xml.includes('capturedAt="2025-01-15T10:00:00.000Z"'));
  });

  it('emits one <testsuite> per step', () => {
    const steps = [
      makeStep(1, [{ type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict' }]),
      makeStep(2, [{ type: 'B', severity: 'low', wcag: '2.4.7', confidence: 'strict' }]),
    ];
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession(steps),
      rawAppendix: {},
      meta: sessionMeta,
    });
    const suiteCount = (xml.match(/<testsuite /g) || []).length;
    assert.equal(suiteCount, 2);
  });

  it('names each suite with step index and label', () => {
    const steps = [
      makeStep(1, [], { label: 'Login page' }),
      makeStep(2, [], { url: 'https://example.com/dashboard' }),
    ];
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession(steps),
      rawAppendix: {},
      meta: sessionMeta,
    });
    assert.ok(xml.includes('Step 1'));
    assert.ok(xml.includes('Login page'));
    assert.ok(xml.includes('Step 2'));
  });

  it('uses per-step capturedAt as timestamp', () => {
    const steps = [
      makeStep(1, [], { at: '2025-01-15T10:01:00.000Z' }),
      makeStep(2, [], { at: '2025-01-15T10:02:00.000Z' }),
    ];
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession(steps),
      rawAppendix: {},
      meta: sessionMeta,
    });
    assert.ok(xml.includes('timestamp="2025-01-15T10:01:00.000Z"'));
    assert.ok(xml.includes('timestamp="2025-01-15T10:02:00.000Z"'));
  });

  it('is deterministic across calls', () => {
    const steps = [
      makeStep(1, [
        { type: 'Z', severity: 'high', wcag: '4.1.2', confidence: 'strict' },
        { type: 'A', severity: 'high', wcag: '1.1.1', confidence: 'strict' },
      ]),
    ];
    const args = { session: makeSession(steps), rawAppendix: {}, meta: sessionMeta };
    const xml1 = ctx.buildJunitXmlForSession(args);
    const xml2 = ctx.buildJunitXmlForSession(args);
    assert.equal(xml1, xml2);
  });

  it('handles session with no steps', () => {
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession([]),
      rawAppendix: {},
      meta: sessionMeta,
    });
    assert.ok(xml.includes('<testsuites'));
    assert.ok(xml.includes('</testsuites>'));
    assert.equal((xml.match(/<testsuite /g) || []).length, 0);
  });

  it('handles step with no findings', () => {
    const steps = [makeStep(1, [])];
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession(steps),
      rawAppendix: {},
      meta: sessionMeta,
    });
    assert.ok(xml.includes('tests="0"'));
  });

  it('resolves findings from rawAppendix when inline raw missing', () => {
    const step = {
      id: 'step_1',
      index: 1,
      label: null,
      at: '2025-01-15T10:01:00.000Z',
      url: 'https://example.com',
      snapshots: {
        run: {
          mode: 'run',
          capturedAt: '2025-01-15T10:01:00.000Z',
          best: {
            frameKey: 'fk::1::example::/::00000000',
            rawRef: 'best:run:fk::1::example::/::00000000',
            normalized: {},
          },
        },
      },
    };
    const rawAppendix = {
      'best:run:fk::1::example::/::00000000': {
        findings: [
          { type: 'IMG_ALT', severity: 'high', wcag: '1.1.1', confidence: 'strict', path: 'img' },
        ],
      },
    };
    const xml = ctx.buildJunitXmlForSession({
      session: makeSession([step]),
      rawAppendix,
      meta: sessionMeta,
    });
    assert.ok(xml.includes('tests="1"'));
    assert.ok(xml.includes('IMG_ALT'));
  });
});
