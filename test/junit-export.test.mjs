/**
 * Export sort tests — sortFindingsForExport determinism and immutability.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

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

  it('deterministic: same input → same output', () => {
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
    const sorted = ctx.sortFindingsForExport([]);
    assert.equal(sorted.length, 0);
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
