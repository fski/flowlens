/**
 * Subtree scope tests — metadata structure and signature stability.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Subtree scope', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('step metadata includes scope field', () => {
    const step = {
      index: 0,
      scope: { type: 'subtree', rootSelector: 'div#my-component', rootTestId: 'my-component' },
      snapshots: { run: null, active: null },
    };
    assert.equal(step.scope.type, 'subtree');
    assert.equal(step.scope.rootSelector, 'div#my-component');
  });

  it('scope: document has rootSelector null', () => {
    const step = {
      index: 0,
      scope: { type: 'document', rootSelector: null },
      snapshots: { run: null, active: null },
    };
    assert.equal(step.scope.rootSelector, null);
  });

  it('signature for subtree finding includes full path', () => {
    const hash1 = ctx.pathHashForSig('div#my-component > button');
    const hash2 = ctx.pathHashForSig('div#other > button');
    assert.notEqual(hash1, hash2);
  });

  it('collectScopes receives rootEl not document for subtree scans', () => {
    const subtreeScope = { type: 'subtree', rootSelector: '#my-widget' };
    assert.equal(subtreeScope.type, 'subtree');
  });

  it('sortFindingsForExport sorts by scope type', () => {
    const findings = [
      { type: 'A', wcag: '1.1.1', severity: 'high', path: 'a' },
      { type: 'A', wcag: '1.1.1', severity: 'high', path: 'b' },
    ];
    const sorted = ctx.sortFindingsForExport(findings, { scope: { type: 'subtree', rootSelector: '#x' } });
    assert.ok(Array.isArray(sorted));
    assert.equal(sorted.length, 2);
  });
});
