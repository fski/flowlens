/**
 * EN 301 549 mapping tests — validates WCAG → EN clause mapping.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext as vmCreateContext, Script } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MAP_JS = join(__dirname, '..', 'src', 'shared', 'en301549-map.js');

function loadMapping() {
  const source = readFileSync(MAP_JS, 'utf8');
  const ctx = vmCreateContext({ Object, Array, String, Number, Map, Set, console });
  const script = new Script(source, { filename: 'en301549-map.js' });
  script.runInContext(ctx);
  // Expose via secondary script
  const expose = new Script(`
    this.EN_MAPPING_VERSION = EN_MAPPING_VERSION;
    this.WCAG_TO_EN301549 = WCAG_TO_EN301549;
    this.en301549ForWcag = en301549ForWcag;
  `, { filename: 'expose-en.js' });
  expose.runInContext(ctx);
  return ctx;
}

describe('EN 301 549 mapping', () => {
  let ctx;
  ctx = loadMapping();

  // Helper: normalize cross-realm arrays for deepEqual
  const toArr = (v) => [...v];

  it('maps WCAG 4.1.2 to EN 9.4.1.2', () => {
    const clauses = toArr(ctx.en301549ForWcag('4.1.2'));
    assert.deepEqual(clauses, ['9.4.1.2']);
  });

  it('returns empty array for WCAG 2.2 criteria without EN mapping', () => {
    const clauses = toArr(ctx.en301549ForWcag('2.5.8'));
    assert.deepEqual(clauses, []);
  });

  it('returns empty array for null/undefined input', () => {
    assert.deepEqual(toArr(ctx.en301549ForWcag(null)), []);
    assert.deepEqual(toArr(ctx.en301549ForWcag(undefined)), []);
  });

  it('maps all known WCAG criteria used by FlowLens rules', () => {
    const knownCriteria = ['1.1.1', '1.3.1', '2.1.1', '4.1.2', '4.1.3'];
    for (const c of knownCriteria) {
      const clauses = ctx.en301549ForWcag(c);
      assert.ok(Array.isArray(clauses), `${c} should return array`);
      assert.ok(clauses.length > 0, `${c} should have at least one EN clause`);
    }
  });

  it('EN_MAPPING_VERSION is a positive integer', () => {
    assert.ok(Number.isInteger(ctx.EN_MAPPING_VERSION));
    assert.ok(ctx.EN_MAPPING_VERSION >= 1);
  });

  it('handles compound WCAG criteria like "1.3.1 / 3.3.2 / 4.1.2"', () => {
    const clauses = ctx.en301549ForWcag('1.3.1 / 3.3.2 / 4.1.2');
    assert.ok(clauses.length >= 3, 'should map all three criteria');
    assert.ok(clauses.includes('9.1.3.1'));
    assert.ok(clauses.includes('9.3.3.2'));
    assert.ok(clauses.includes('9.4.1.2'));
  });

  it('deduplicates clauses in compound lookup', () => {
    const clauses = ctx.en301549ForWcag('4.1.2 / 4.1.2');
    assert.equal(clauses.length, 1, 'duplicate criteria should produce unique clauses');
  });
});
