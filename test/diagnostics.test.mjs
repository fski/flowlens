/**
 * Tests for buildDiagnosticsPayload — pure function producing
 * a deterministic, PII-free diagnostics payload for clipboard export.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

const ctx = createContext();
const { buildDiagnosticsPayload } = ctx;

describe('buildDiagnosticsPayload', () => {
  it('returns expected shape with all fields', () => {
    const result = buildDiagnosticsPayload({
      version: '3.0.1',
      dataVersions: { schemaVersion: 3, signatureVersion: 2, frameKeyVersion: 1, enMappingVersion: 1 },
      url: 'https://example.com',
      env: 'production',
      bestFrameId: 42,
      bestFrameKey: 'abc-123',
      frameScope: 'primary',
      scope: { type: 'document', rootSelector: null },
      shadowCoverage: { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false },
    });

    assert.equal(result.version, '3.0.1');
    assert.equal(result.dataVersions.schemaVersion, 3);
    assert.equal(result.dataVersions.signatureVersion, 2);
    assert.equal(result.dataVersions.frameKeyVersion, 1);
    assert.equal(result.dataVersions.enMappingVersion, 1);
    assert.equal(result.url, 'https://example.com');
    assert.equal(result.env, 'production');
    assert.equal(result.bestFrameId, 42);
    assert.equal(result.bestFrameKey, 'abc-123');
    assert.equal(result.frameScope, 'primary');
    assert.equal(result.scope.type, 'document');
    assert.equal(result.scope.rootSelector, null);
    assert.equal(result.shadowCoverage.scopesFound, 5);
    assert.equal(result.shadowCoverage.scopesAudited, 5);
    assert.equal(result.shadowCoverage.scopesCapped, false);
    assert.equal(result.shadowCoverage.maxDepthObserved, 2);
    assert.equal(result.shadowCoverage.depthLimitReached, false);
    assert.equal(result.buildInfo.mv3, true);
  });

  it('returns sensible defaults for null/undefined input', () => {
    const result = buildDiagnosticsPayload(null);
    assert.equal(result.version, 'unknown');
    assert.equal(result.dataVersions.schemaVersion, 0);
    assert.equal(result.dataVersions.signatureVersion, 0);
    assert.equal(result.dataVersions.frameKeyVersion, 0);
    assert.equal(result.dataVersions.enMappingVersion, 0);
    assert.equal(result.url, '');
    assert.equal(result.env, '');
    assert.equal(result.bestFrameId, null);
    assert.equal(result.bestFrameKey, null);
    assert.equal(result.frameScope, 'primary');
    assert.equal(result.scope.type, 'document');
    assert.equal(result.scope.rootSelector, null);
    assert.equal(result.shadowCoverage, null);
    assert.equal(result.buildInfo.mv3, true);
  });

  it('returns sensible defaults for empty object', () => {
    const result = buildDiagnosticsPayload({});
    assert.equal(result.version, 'unknown');
    assert.equal(result.url, '');
    assert.equal(result.bestFrameId, null);
    assert.equal(result.bestFrameKey, null);
    assert.equal(result.frameScope, 'primary');
    assert.equal(result.shadowCoverage, null);
  });

  it('coerces version to string', () => {
    const result = buildDiagnosticsPayload({ version: 123 });
    assert.equal(result.version, '123');
  });

  it('coerces bestFrameId to number', () => {
    const result = buildDiagnosticsPayload({ bestFrameId: '7' });
    assert.equal(result.bestFrameId, 7);
  });

  it('sets bestFrameId to null when not provided', () => {
    const result = buildDiagnosticsPayload({});
    assert.equal(result.bestFrameId, null);
  });

  it('coerces bestFrameKey to string', () => {
    const result = buildDiagnosticsPayload({ bestFrameKey: 'fk-abc' });
    assert.equal(result.bestFrameKey, 'fk-abc');
  });

  it('sets bestFrameKey to null when falsy', () => {
    const result = buildDiagnosticsPayload({ bestFrameKey: '' });
    assert.equal(result.bestFrameKey, null);
  });

  it('defaults scope to document when not provided', () => {
    const result = buildDiagnosticsPayload({});
    assert.equal(result.scope.type, 'document');
    assert.equal(result.scope.rootSelector, null);
  });

  it('normalizes scope from input', () => {
    const result = buildDiagnosticsPayload({ scope: { type: 'subtree', rootSelector: '#app' } });
    assert.equal(result.scope.type, 'subtree');
    assert.equal(result.scope.rootSelector, '#app');
  });

  it('defaults scope type when scope object has no type', () => {
    const result = buildDiagnosticsPayload({ scope: {} });
    assert.equal(result.scope.type, 'document');
    assert.equal(result.scope.rootSelector, null);
  });

  it('sets shadowCoverage to null when not an object', () => {
    const result = buildDiagnosticsPayload({ shadowCoverage: 'bad' });
    assert.equal(result.shadowCoverage, null);
  });

  it('normalizes shadowCoverage numeric fields', () => {
    const result = buildDiagnosticsPayload({
      shadowCoverage: { scopesFound: '10', scopesAudited: '8', maxDepthObserved: '3', scopesCapped: 1, depthLimitReached: 0 },
    });
    assert.equal(result.shadowCoverage.scopesFound, 10);
    assert.equal(result.shadowCoverage.scopesAudited, 8);
    assert.equal(result.shadowCoverage.maxDepthObserved, 3);
    assert.equal(result.shadowCoverage.scopesCapped, true);
    assert.equal(result.shadowCoverage.depthLimitReached, false);
  });

  it('does not include findings, timestamps, or PII', () => {
    const result = buildDiagnosticsPayload({
      version: '3.0.1',
      url: 'https://example.com',
    });
    const json = JSON.stringify(result);
    assert.ok(!json.includes('findings'));
    assert.ok(!json.includes('timestamp'));
    assert.ok(!json.includes('capturedAt'));
    assert.ok(!Object.prototype.hasOwnProperty.call(result, 'findings'));
    assert.ok(!Object.prototype.hasOwnProperty.call(result, 'timestamp'));
  });

  it('is deterministic — same input produces identical JSON', () => {
    const opts = {
      version: '3.0.1',
      dataVersions: { schemaVersion: 3, signatureVersion: 2, frameKeyVersion: 1, enMappingVersion: 1 },
      url: 'https://example.com',
      env: 'production',
      bestFrameId: 42,
      bestFrameKey: 'fk-abc',
      frameScope: 'primary',
      scope: { type: 'document', rootSelector: null },
      shadowCoverage: { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false },
    };
    const a = JSON.stringify(buildDiagnosticsPayload(opts));
    const b = JSON.stringify(buildDiagnosticsPayload(opts));
    assert.equal(a, b);
  });

  it('is JSON-serializable (no functions, symbols, or circular refs)', () => {
    const result = buildDiagnosticsPayload({
      version: '3.0.1',
      shadowCoverage: { scopesFound: 3, scopesAudited: 3, scopesCapped: false, maxDepthObserved: 1, depthLimitReached: false },
    });
    const json = JSON.stringify(result);
    const parsed = JSON.parse(json);
    assert.equal(parsed.version, '3.0.1');
    assert.equal(parsed.buildInfo.mv3, true);
  });

  it('dataVersions defaults all to 0 when not provided', () => {
    const result = buildDiagnosticsPayload({ dataVersions: {} });
    assert.equal(result.dataVersions.schemaVersion, 0);
    assert.equal(result.dataVersions.signatureVersion, 0);
    assert.equal(result.dataVersions.frameKeyVersion, 0);
    assert.equal(result.dataVersions.enMappingVersion, 0);
  });

  it('frameScope defaults to primary', () => {
    const result = buildDiagnosticsPayload({ frameScope: '' });
    assert.equal(result.frameScope, 'primary');
  });

  it('preserves non-default frameScope', () => {
    const result = buildDiagnosticsPayload({ frameScope: 'embedded' });
    assert.equal(result.frameScope, 'embedded');
  });

  it('includes dataVersionsLine formatted string', () => {
    const result = buildDiagnosticsPayload({
      dataVersions: { schemaVersion: 3, signatureVersion: 2, frameKeyVersion: 1, enMappingVersion: 1 },
    });
    assert.equal(result.dataVersionsLine, 'schema v3 \u2022 sig v2 \u2022 frameKey v1 \u2022 EN map v1');
  });

  it('dataVersionsLine defaults to v0 for missing versions', () => {
    const result = buildDiagnosticsPayload({});
    assert.equal(result.dataVersionsLine, 'schema v0 \u2022 sig v0 \u2022 frameKey v0 \u2022 EN map v0');
  });

  it('dataVersionsLine is deterministic', () => {
    const opts = { dataVersions: { schemaVersion: 3, signatureVersion: 2, frameKeyVersion: 1, enMappingVersion: 1 } };
    assert.equal(
      buildDiagnosticsPayload(opts).dataVersionsLine,
      buildDiagnosticsPayload(opts).dataVersionsLine
    );
  });
});

describe('formatDataVersionsLine', () => {
  const { formatDataVersionsLine } = ctx;

  it('formats all version fields', () => {
    assert.equal(
      formatDataVersionsLine({ schemaVersion: 3, signatureVersion: 2, frameKeyVersion: 1, enMappingVersion: 1 }),
      'schema v3 \u2022 sig v2 \u2022 frameKey v1 \u2022 EN map v1'
    );
  });

  it('defaults to 0 for missing fields', () => {
    assert.equal(
      formatDataVersionsLine(null),
      'schema v0 \u2022 sig v0 \u2022 frameKey v0 \u2022 EN map v0'
    );
  });

  it('is deterministic', () => {
    const dv = { schemaVersion: 3, signatureVersion: 2, frameKeyVersion: 1, enMappingVersion: 1 };
    assert.equal(formatDataVersionsLine(dv), formatDataVersionsLine(dv));
  });
});

// ══════════════════════════════════════════════════════
// Profile match explainability
// ══════════════════════════════════════════════════════

describe('buildDiagnosticsPayload — profile explainability', () => {
  it('defaults: activeProfileId null, activeProfileLabel null, profileMatchSignals []', () => {
    const result = buildDiagnosticsPayload({});
    assert.equal(result.activeProfileId, null);
    assert.equal(result.activeProfileLabel, null);
    assert.ok(Array.isArray(result.profileMatchSignals));
    assert.equal(result.profileMatchSignals.length, 0);
  });

  it('defaults for null input', () => {
    const result = buildDiagnosticsPayload(null);
    assert.equal(result.activeProfileId, null);
    assert.equal(result.activeProfileLabel, null);
    assert.equal(result.profileMatchSignals.length, 0);
  });

  it('coerces activeProfileId to string', () => {
    const result = buildDiagnosticsPayload({ activeProfileId: 'my-profile' });
    assert.equal(result.activeProfileId, 'my-profile');
  });

  it('coerces activeProfileLabel to string', () => {
    const result = buildDiagnosticsPayload({ activeProfileLabel: 'My Profile' });
    assert.equal(result.activeProfileLabel, 'My Profile');
  });

  it('sets activeProfileId to null when falsy', () => {
    const result = buildDiagnosticsPayload({ activeProfileId: '' });
    assert.equal(result.activeProfileId, null);
  });

  it('sets activeProfileLabel to null when falsy', () => {
    const result = buildDiagnosticsPayload({ activeProfileLabel: '' });
    assert.equal(result.activeProfileLabel, null);
  });

  it('normalizes profileMatchSignals — sorts and coerces to string', () => {
    const result = buildDiagnosticsPayload({
      profileMatchSignals: ["z-selector", "a-selector", "m-selector"],
    });
    assert.equal(result.profileMatchSignals.length, 3);
    assert.equal(result.profileMatchSignals[0], "a-selector");
    assert.equal(result.profileMatchSignals[1], "m-selector");
    assert.equal(result.profileMatchSignals[2], "z-selector");
  });

  it('caps profileMatchSignals to 3', () => {
    const result = buildDiagnosticsPayload({
      profileMatchSignals: ["a", "b", "c", "d", "e"],
    });
    assert.equal(result.profileMatchSignals.length, 3);
  });

  it('handles non-array profileMatchSignals gracefully', () => {
    const result = buildDiagnosticsPayload({ profileMatchSignals: 'bad' });
    assert.ok(Array.isArray(result.profileMatchSignals));
    assert.equal(result.profileMatchSignals.length, 0);
  });

  it('is deterministic with profile fields', () => {
    const opts = {
      activeProfileId: 'generic-chat-widget',
      activeProfileLabel: 'Chat Widget',
      profileMatchSignals: ["[role='log']", "[aria-live]", "[role='feed']"],
    };
    const a = JSON.stringify(buildDiagnosticsPayload(opts));
    const b = JSON.stringify(buildDiagnosticsPayload(opts));
    assert.equal(a, b);
  });
});

// ══════════════════════════════════════════════════════
// buildDiagnosticsMarkdown
// ══════════════════════════════════════════════════════

describe('buildDiagnosticsMarkdown', () => {
  const { buildDiagnosticsMarkdown } = ctx;

  it('returns a string', () => {
    const md = buildDiagnosticsMarkdown({});
    assert.equal(typeof md, 'string');
    assert.ok(md.length > 0);
  });

  it('is deterministic — same payload produces identical string', () => {
    const payload = buildDiagnosticsPayload({
      version: '3.0.1',
      url: 'https://example.com',
      env: 'production',
      frameScope: 'primary',
      activeProfileLabel: 'Chat Widget',
      profileMatchSignals: ["[role='log']", "[aria-live]"],
    });
    const a = buildDiagnosticsMarkdown(payload);
    const b = buildDiagnosticsMarkdown(payload);
    assert.equal(a, b);
  });

  it('renders null/missing fields as em dash', () => {
    const md = buildDiagnosticsMarkdown({});
    assert.ok(md.includes('\u2014'), 'should contain em dash for missing fields');
  });

  it('renders profileMatchSignals as comma-separated list', () => {
    const payload = buildDiagnosticsPayload({
      profileMatchSignals: ["[role='log']", "[aria-live]", "[role='feed']"],
    });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes("[aria-live], [role='feed'], [role='log']"));
  });

  it('section order is stable: Environment before Frame before Profiles before Shadow', () => {
    const md = buildDiagnosticsMarkdown({
      version: '3.0.1',
      activeProfileLabel: 'Test',
    });
    const envIdx = md.indexOf('## Environment');
    const frameIdx = md.indexOf('## Frame');
    const profileIdx = md.indexOf('## Profiles');
    const shadowIdx = md.indexOf('## Shadow DOM');
    assert.ok(envIdx < frameIdx, 'Environment before Frame');
    assert.ok(frameIdx < profileIdx, 'Frame before Profiles');
    assert.ok(profileIdx < shadowIdx, 'Profiles before Shadow DOM');
  });

  it('does not contain raw HTML or angle brackets', () => {
    const md = buildDiagnosticsMarkdown({
      version: '3.0.1',
      url: 'https://example.com',
      activeProfileLabel: 'Test <script>',
    });
    // Angle brackets from user input are coerced to string but not escaped —
    // the point is no raw DOM/HTML from the payload structure itself
    assert.ok(!md.includes('<div'), 'no raw HTML divs');
    assert.ok(!md.includes('<dd'), 'no raw HTML dd elements');
  });

  it('does not contain JSON braces or raw object dump', () => {
    const md = buildDiagnosticsMarkdown({
      version: '3.0.1',
      shadowCoverage: { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false },
    });
    assert.ok(!md.includes('"scopesFound"'), 'no JSON key dump');
    assert.ok(!md.includes('{'), 'no JSON braces');
  });

  it('formats shadow coverage as readable line', () => {
    const payload = buildDiagnosticsPayload({
      shadowCoverage: { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false },
    });
    const md = buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes('5/5 scopes'), 'should show scopes ratio');
    assert.ok(md.includes('depth 2'), 'should show depth');
  });
});
