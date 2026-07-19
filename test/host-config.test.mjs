/**
 * HostConfig contract tests — panel-side.
 * Validates: vendor-free defaults, buildMatch merge/dedup/cap,
 * defaultProfiles, badge, rootSelector fallback, user override.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createContext } from './harness.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Vendor patterns that must never appear in generic source
const VENDOR_PATTERNS = [
  /usehurrier/i,
  /GST_CHAT/i,
  /help-center-root/i,
  /delivery\.?hero/i,
  /deliveryhero/i,
  /foodpanda/i,
  /talabat/i,
  /\bdhg\b/i,
];

function deepScanForVendor(obj, path = '') {
  const hits = [];
  if (typeof obj === 'string') {
    for (const pat of VENDOR_PATTERNS) {
      if (pat.test(obj)) hits.push(`${path}: "${obj}" matches ${pat}`);
    }
  } else if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) {
      hits.push(...deepScanForVendor(obj[i], `${path}[${i}]`));
    }
  } else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      hits.push(...deepScanForVendor(v, path ? `${path}.${k}` : k));
    }
  }
  return hits;
}

// ══════════════════════════════════════════════════════
// 1. Default HostConfig contains no vendor strings
// ══════════════════════════════════════════════════════

describe('HostConfig — default.config.json vendor-free', () => {
  const configPath = join(__dirname, '..', 'src', 'host', 'default.config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));

  it('default config contains no vendor strings', () => {
    const hits = deepScanForVendor(config);
    assert.equal(hits.length, 0, `Vendor strings found:\n${hits.join('\n')}`);
  });

  it('default config has id "generic"', () => {
    assert.equal(config.id, 'generic');
  });

  it('default config has empty defaultProfiles', () => {
    assert.ok(Array.isArray(config.defaultProfiles));
    assert.equal(config.defaultProfiles.length, 0);
  });
});

// ══════════════════════════════════════════════════════
// 2. BUILTIN_PROFILES contain no vendor strings
// ══════════════════════════════════════════════════════

describe('HostConfig — BUILTIN_PROFILES vendor-free', () => {
  const ctx = createContext();

  it('BUILTIN_PROFILES contain no vendor strings', () => {
    const profiles = ctx.BUILTIN_PROFILES;
    assert.ok(profiles && typeof profiles === 'object');
    const hits = deepScanForVendor(profiles);
    assert.equal(hits.length, 0, `Vendor strings found in BUILTIN_PROFILES:\n${hits.join('\n')}`);
  });
});

// ══════════════════════════════════════════════════════
// 3. buildMatch merges hostConfig selectors
// ══════════════════════════════════════════════════════

describe('HostConfig — buildMatch integration', () => {
  it('merges hostConfig.match.domSelectorsAny into buildMatch output', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'test-merge', defaultProfiles: [], rootSelector: null,
        match: { domSelectorsAny: ['#test-root'], urlIncludesAny: [], urlExcludesAny: [] },
        ui: {},
      },
    });
    // Activate a profile so buildMatch has something to merge with
    ctx.profileState.active = ['chat'];
    const result = ctx.buildMatch();
    assert.ok(result, 'buildMatch should return non-null');
    assert.ok(result.domSelectorsAny.includes('#test-root'),
      'should include hostConfig domSelectorsAny');
  });

  it('merges hostConfig.match.urlIncludesAny into buildMatch output', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'test-url', defaultProfiles: [], rootSelector: null,
        match: { domSelectorsAny: [], urlIncludesAny: ['example.com'], urlExcludesAny: [] },
        ui: {},
      },
    });
    const result = ctx.buildMatch();
    assert.ok(result, 'buildMatch should return non-null');
    assert.ok(result.urlIncludes.includes('example.com'),
      'should include hostConfig urlIncludesAny');
  });

  it('returns urlExcludesAny from hostConfig', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'test-exclude', defaultProfiles: [], rootSelector: null,
        match: { domSelectorsAny: [], urlIncludesAny: [], urlExcludesAny: ['analytics.com'] },
        ui: {},
      },
    });
    const result = ctx.buildMatch();
    assert.ok(result, 'buildMatch should return non-null');
    assert.ok(result.urlExcludesAny.includes('analytics.com'),
      'should include hostConfig urlExcludesAny');
  });

  it('deduplicates selectors from profile + hostConfig', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'test-dedup', defaultProfiles: [], rootSelector: null,
        match: { domSelectorsAny: ["[role='log']", '#unique-host'], urlIncludesAny: [], urlExcludesAny: [] },
        ui: {},
      },
    });
    ctx.profileState.active = ['chat'];  // chat profile has [role='log']
    const result = ctx.buildMatch();
    assert.ok(result, 'buildMatch should return non-null');
    const logCount = result.domSelectorsAny.filter(s => s === "[role='log']").length;
    assert.equal(logCount, 1, "duplicate [role='log'] should be deduplicated");
    assert.ok(result.domSelectorsAny.includes('#unique-host'));
  });

  it('caps each category at 80 selectors', () => {
    const big = Array.from({ length: 100 }, (_, i) => `.sel-${i}`);
    const ctx = createContext({
      hostConfig: {
        id: 'test-cap', defaultProfiles: [], rootSelector: null,
        match: { domSelectorsAny: big, urlIncludesAny: big, urlExcludesAny: big },
        ui: {},
      },
    });
    const result = ctx.buildMatch();
    assert.ok(result, 'buildMatch should return non-null');
    assert.ok(result.domSelectorsAny.length <= 80, `domSelectorsAny should be capped at 80, got ${result.domSelectorsAny.length}`);
    assert.ok(result.urlIncludes.length <= 80, `urlIncludes should be capped at 80, got ${result.urlIncludes.length}`);
    assert.ok(result.urlExcludesAny.length <= 80, `urlExcludesAny should be capped at 80, got ${result.urlExcludesAny.length}`);
  });

  it('returns null when no selectors from profiles or hostConfig', () => {
    const ctx = createContext();  // default hostConfig has empty match
    ctx.profileState.active = [];  // no active profiles
    const result = ctx.buildMatch();
    assert.equal(result, null, 'buildMatch should return null when no selectors');
  });
});

// ══════════════════════════════════════════════════════
// 4. Default active profiles from hostConfig
// ══════════════════════════════════════════════════════

describe('HostConfig — defaultProfiles', () => {
  it('uses hostConfig.defaultProfiles when non-empty', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'test-defaults', defaultProfiles: ['chat'], rootSelector: null,
        match: { domSelectorsAny: [], urlIncludesAny: [], urlExcludesAny: [] },
        ui: {},
      },
    });
    assert.ok(ctx.profileState.active.includes('chat'),
      'profileState.active should include "chat" from hostConfig.defaultProfiles');
  });

  it('empty defaultProfiles → empty profileState.active', () => {
    const ctx = createContext();  // default hostConfig has empty defaultProfiles
    assert.equal(ctx.profileState.active.length, 0,
      'generic build should start with no active profiles');
  });
});

// ══════════════════════════════════════════════════════
// 5. User stored profiles override hostConfig defaults
// ══════════════════════════════════════════════════════

describe('HostConfig — user stored profile override', () => {
  it('loadProfiles restores activeProfiles from storage, overriding hostConfig defaults', async () => {
    const ctx = createContext({
      storageData: {
        activeProfiles: ['helpcenter'],
      },
      hostConfig: {
        id: 'test-override', defaultProfiles: ['chat'], rootSelector: null,
        match: { domSelectorsAny: [], urlIncludesAny: [], urlExcludesAny: [] },
        ui: {},
      },
    });
    // Initially, profileState.active should be from hostConfig
    assert.ok(ctx.profileState.active.includes('chat'),
      'before loadProfiles: should use hostConfig default');

    // loadProfiles reads from storage and overrides
    await ctx.loadProfiles();
    assert.ok(ctx.profileState.active.includes('helpcenter'),
      'after loadProfiles: should use stored activeProfiles');
    assert.ok(!ctx.profileState.active.includes('chat'),
      'after loadProfiles: hostConfig default should be overridden');
  });
});

// ══════════════════════════════════════════════════════
// 6. Version badge uses hostConfig.ui.badgeText
// ══════════════════════════════════════════════════════

describe('HostConfig — version badge', () => {
  it('badge shows version + badgeText when set', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'test-badge', defaultProfiles: [], rootSelector: null,
        match: { domSelectorsAny: [], urlIncludesAny: [], urlExcludesAny: [] },
        ui: { badgeText: 'TEST' },
      },
    });
    ctx.setVersionBadge();
    const badge = ctx.document._elCache['versionBadge'];
    assert.ok(badge, 'versionBadge element should exist');
    assert.ok(badge.textContent.includes('TEST'),
      `badge should include "TEST", got: "${badge.textContent}"`);
  });

  it('badge shows only version when badgeText is null', () => {
    const ctx = createContext();
    ctx.setVersionBadge();
    const badge = ctx.document._elCache['versionBadge'];
    assert.ok(badge, 'versionBadge element should exist');
    assert.ok(!badge.textContent.includes(' DH'),
      `badge should not include " DH", got: "${badge.textContent}"`);
  });
});

// ══════════════════════════════════════════════════════
// 7. buildProfileRootSelector falls back to hostConfig
// ══════════════════════════════════════════════════════

describe('HostConfig — buildProfileRootSelector fallback', () => {
  it('falls back to hostConfig.rootSelector when no profile has rootSelector', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'test-root', defaultProfiles: ['chat'], rootSelector: '#host-root',
        match: { domSelectorsAny: [], urlIncludesAny: [], urlExcludesAny: [] },
        ui: {},
      },
    });
    ctx.profileState.active = ['chat'];
    const result = ctx.buildProfileRootSelector();
    assert.equal(result, '#host-root',
      'should fall back to hostConfig.rootSelector');
  });

  it('returns null when no rootSelector anywhere', () => {
    const ctx = createContext();
    ctx.profileState.active = ['chat'];
    const result = ctx.buildProfileRootSelector();
    assert.equal(result, null,
      'should return null when no rootSelector from profile or hostConfig');
  });

  it('profile rootSelector takes precedence over hostConfig', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'test-root2', defaultProfiles: [], rootSelector: '#host-root',
        match: { domSelectorsAny: [], urlIncludesAny: [], urlExcludesAny: [] },
        ui: {},
      },
    });
    ctx.profileState.profiles['custom'] = {
      label: 'Custom',
      rootSelector: '#profile-root',
      frame: { urlIncludes: [], domSelectors: [] },
    };
    ctx.profileState.active = ['custom'];
    const result = ctx.buildProfileRootSelector();
    assert.equal(result, '#profile-root',
      'profile rootSelector should take precedence over hostConfig');
  });
});

// ══════════════════════════════════════════════════════
// 8. Diagnostics includes hostConfigId
// ══════════════════════════════════════════════════════

describe('HostConfig — diagnostics', () => {
  it('buildDiagnosticsPayload includes hostConfigId', () => {
    const ctx = createContext();
    const result = ctx.buildDiagnosticsPayload({ hostConfigId: 'my-host' });
    assert.equal(result.hostConfigId, 'my-host');
  });

  it('buildDiagnosticsPayload defaults hostConfigId to "generic"', () => {
    const ctx = createContext();
    const result = ctx.buildDiagnosticsPayload({});
    assert.equal(result.hostConfigId, 'generic');
  });

  it('buildDiagnosticsMarkdown includes Host line', () => {
    const ctx = createContext();
    const payload = ctx.buildDiagnosticsPayload({ hostConfigId: 'my-host' });
    const md = ctx.buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes('Host: my-host'), 'markdown should include Host: my-host');
  });
});

// ══════════════════════════════════════════════════════
// 9. hostConfig is deeply frozen
// ══════════════════════════════════════════════════════

describe('HostConfig — deep freeze', () => {
  it('hostConfig is deeply frozen', () => {
    const ctx = createContext();
    assert.ok(Object.isFrozen(ctx.hostConfig), 'hostConfig should be frozen');
    assert.ok(Object.isFrozen(ctx.hostConfig.match), 'hostConfig.match should be frozen');
    assert.ok(Object.isFrozen(ctx.hostConfig.ui), 'hostConfig.ui should be frozen');
    assert.ok(Object.isFrozen(ctx.hostConfig.match.domSelectorsAny),
      'hostConfig.match.domSelectorsAny should be frozen');
    assert.ok(Object.isFrozen(ctx.hostConfig.match.urlIncludesAny),
      'hostConfig.match.urlIncludesAny should be frozen');
    assert.ok(Object.isFrozen(ctx.hostConfig.match.urlExcludesAny),
      'hostConfig.match.urlExcludesAny should be frozen');
  });

  it('hostConfig nested arrays resist mutation', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'freeze-test', defaultProfiles: ['a'], rootSelector: null,
        match: { domSelectorsAny: ['#w'], urlIncludesAny: ['x.com'], urlExcludesAny: ['y.com'] },
        ui: { badgeText: 'FT' },
      },
    });
    const origLen = ctx.hostConfig.match.domSelectorsAny.length;
    try { ctx.hostConfig.match.domSelectorsAny.push('#nope'); } catch (_) { /* strict mode throws */ }
    assert.equal(ctx.hostConfig.match.domSelectorsAny.length, origLen,
      'domSelectorsAny length should not change after push attempt');

    try { ctx.hostConfig.id = 'mutated'; } catch (_) { /* strict mode throws */ }
    assert.equal(ctx.hostConfig.id, 'freeze-test',
      'hostConfig.id should resist direct assignment');
  });

  it('custom hostConfig is also deeply frozen', () => {
    const ctx = createContext({
      hostConfig: {
        id: 'custom', defaultProfiles: ['p1', 'p2'], rootSelector: '#root',
        match: { domSelectorsAny: ['#a', '#b'], urlIncludesAny: ['a.com'], urlExcludesAny: [] },
        ui: { badgeText: 'CU', diagnosticsHint: 'test' },
      },
    });
    assert.ok(Object.isFrozen(ctx.hostConfig), 'custom hostConfig should be frozen');
    assert.ok(Object.isFrozen(ctx.hostConfig.match), 'custom match should be frozen');
    assert.ok(Object.isFrozen(ctx.hostConfig.defaultProfiles), 'defaultProfiles should be frozen');
  });
});

// ══════════════════════════════════════════════════════
// 10. Diagnostics includes gating transparency fields
// ══════════════════════════════════════════════════════

describe('HostConfig — gating transparency diagnostics', () => {
  it('buildDiagnosticsPayload includes frameGatingSelectorCount and excludedFrameCount', () => {
    const ctx = createContext();
    const result = ctx.buildDiagnosticsPayload({
      frameGatingSelectorCount: 3,
      excludedFrameCount: 2,
    });
    assert.equal(result.frameGatingSelectorCount, 3);
    assert.equal(result.excludedFrameCount, 2);
  });

  it('buildDiagnosticsPayload defaults gating fields to 0', () => {
    const ctx = createContext();
    const result = ctx.buildDiagnosticsPayload({});
    assert.equal(result.frameGatingSelectorCount, 0);
    assert.equal(result.excludedFrameCount, 0);
  });

  it('buildDiagnosticsMarkdown shows gating line when frameGatingSelectorCount > 0', () => {
    const ctx = createContext();
    const payload = ctx.buildDiagnosticsPayload({
      frameGatingSelectorCount: 5,
      excludedFrameCount: 0,
    });
    const md = ctx.buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes('Frame Gating: active (5 selectors)'),
      'markdown should include frame gating line');
  });

  it('buildDiagnosticsMarkdown shows excluded frames when excludedFrameCount > 0', () => {
    const ctx = createContext();
    const payload = ctx.buildDiagnosticsPayload({
      frameGatingSelectorCount: 2,
      excludedFrameCount: 3,
    });
    const md = ctx.buildDiagnosticsMarkdown(payload);
    assert.ok(md.includes('3 excluded by host match rules'),
      'markdown should include excluded frames line');
  });

  it('buildDiagnosticsMarkdown omits gating lines when counts are 0', () => {
    const ctx = createContext();
    const payload = ctx.buildDiagnosticsPayload({
      frameGatingSelectorCount: 0,
      excludedFrameCount: 0,
    });
    const md = ctx.buildDiagnosticsMarkdown(payload);
    assert.ok(!md.includes('Frame Gating:'), 'should not include frame gating line when 0');
    assert.ok(!md.includes('Excluded Frames:'), 'should not include excluded frames line when 0');
  });
});

// ══════════════════════════════════════════════════════
// 11. Shared cap constants — single source of truth
// ══════════════════════════════════════════════════════

describe('HostConfig — shared cap constants', () => {
  const limitsSource = readFileSync(join(__dirname, '..', 'src', 'shared', 'limits.js'), 'utf8');
  const arrMatch = limitsSource.match(/MAX_MATCH_ARRAY\s*=\s*(\d+)/);
  const strMatch = limitsSource.match(/MAX_MATCH_STRING\s*=\s*(\d+)/);
  const SHARED_MAX_ARRAY = arrMatch ? Number(arrMatch[1]) : null;
  const SHARED_MAX_STRING = strMatch ? Number(strMatch[1]) : null;

  it('limits.js defines MAX_MATCH_ARRAY=80', () => {
    assert.equal(SHARED_MAX_ARRAY, 80);
  });

  it('limits.js defines MAX_MATCH_STRING=256', () => {
    assert.equal(SHARED_MAX_STRING, 256);
  });

  it('sw.js isStringArray uses same caps as limits.js', () => {
    const swSource = readFileSync(join(__dirname, '..', 'src', 'sw', 'sw.js'), 'utf8');
    // All isStringArray(x, 80, 256) calls should match shared constants
    const calls = swSource.match(/isStringArray\([^)]+,\s*(\d+),\s*(\d+)\)/g) || [];
    assert.ok(calls.length >= 6, `expected at least 6 isStringArray calls, got ${calls.length}`);
    for (const call of calls) {
      const m = call.match(/isStringArray\([^)]+,\s*(\d+),\s*(\d+)\)/);
      assert.equal(Number(m[1]), SHARED_MAX_ARRAY,
        `isStringArray array cap should be ${SHARED_MAX_ARRAY}, got ${m[1]} in: ${call}`);
      assert.equal(Number(m[2]), SHARED_MAX_STRING,
        `isStringArray string cap should be ${SHARED_MAX_STRING}, got ${m[2]} in: ${call}`);
    }
  });

  it('build.mjs reads caps from limits.js', () => {
    const buildSource = readFileSync(join(__dirname, '..', 'scripts', 'build.mjs'), 'utf8');
    assert.ok(buildSource.includes('readLimits()'),
      'build.mjs should call readLimits() to extract caps from limits.js');
    assert.ok(!buildSource.includes('HOSTCONFIG_MAX_ARRAY = 200'),
      'build.mjs should no longer hardcode HOSTCONFIG_MAX_ARRAY = 200');
  });

  it('panel source buildMatch uses shared constant with fallback', () => {
    // panel.js is split into parts (src/panel/panel.parts.json) — scan the concatenation
    const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'src', 'panel', 'panel.parts.json'), 'utf8'));
    const panelSource = manifest.parts
      .map(name => readFileSync(join(__dirname, '..', 'src', 'panel', name), 'utf8'))
      .join('');
    assert.ok(panelSource.includes('MAX_MATCH_ARRAY'),
      'panel source should reference MAX_MATCH_ARRAY from limits.js');
  });
});
