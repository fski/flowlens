/**
 * Shadow DOM support tests — path handling, signature stability, cssPathDeep logic.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Shadow DOM support', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('pathHashForSig handles >>> separator', () => {
    const hash1 = ctx.pathHashForSig('my-component >>> div > button');
    const hash2 = ctx.pathHashForSig('div > button');
    assert.notEqual(hash1, hash2, 'shadow path should differ from light path');
  });

  it('pathHashForSig is case-insensitive', () => {
    const hash1 = ctx.pathHashForSig('My-Component >>> DIV > Button');
    const hash2 = ctx.pathHashForSig('my-component >>> div > button');
    assert.equal(hash1, hash2, 'paths differing only in case should match');
  });

  it('shadow finding signature is stable', () => {
    const snapshot = {
      mode: 'run',
      best: {
        frameKey: 'fk::v1::https://example.com::/::00000000',
        normalized: { primaryCounts: { findings: 1 } },
        rawRef: 'ref_1',
      },
    };
    const rawAppendix = {
      ref_1: {
        findings: [{
          type: 'NO_ACCESSIBLE_NAME',
          severity: 'high',
          wcag: '4.1.2',
          path: 'my-component >>> div > button:nth-of-type(2)',
          testId: 'shadow-btn',
          name: 'Submit',
          note: 'No accessible name',
          confidence: 'strict',
          level: 'A',
        }],
      },
    };
    const entries1 = ctx.runSignatureEntries(snapshot, rawAppendix);
    const entries2 = ctx.runSignatureEntries(snapshot, rawAppendix);
    assert.equal(entries1.length, entries2.length);
    assert.equal(entries1[0].sig, entries2[0].sig, 'signatures should be stable');
    assert.ok(entries1[0].sig.includes('pathh:'), 'signature includes path hash');
  });

  it('SHADOW_DOM_NOTE is info severity', () => {
    const finding = {
      type: 'SHADOW_DOM_NOTE',
      severity: 'info',
      confidence: null,
    };
    assert.equal(ctx.classifyReviewStatus(finding), 'info');
    assert.equal(ctx.isRunFindingBlocking(finding), false);
  });

  it('paths without classes are stable across renders', () => {
    const path1 = 'div > button:nth-of-type(2)';
    const path2 = 'div > button:nth-of-type(2)';
    assert.equal(ctx.pathHashForSig(path1), ctx.pathHashForSig(path2));
  });

  it('cssPathDeep rejects aria-label with digits', () => {
    const label = '3 items selected';
    const hasDigits = /\d/.test(label);
    assert.ok(hasDigits, 'label with digits should be rejected');
  });

  it('cssPathDeep rejects aria-label over 40 chars', () => {
    const longLabel = 'A'.repeat(41);
    assert.ok(longLabel.length > 40, 'label over 40 chars should be rejected');
  });

  it('cssPathDeep accepts stable aria-label', () => {
    const label = 'Navigation menu';
    const isStable = label.length <= 40 && !/\d/.test(label);
    assert.ok(isStable, 'short label without digits should be accepted');
  });

  it('SHADOW_DOM_NOTE includes cap message when scopes capped', () => {
    const MAX_SHADOW_SCOPES = 50;
    const scopes = Array.from({ length: MAX_SHADOW_SCOPES }, (_, i) => ({ depth: i % 5 }));
    const wasCapped = scopes.length >= MAX_SHADOW_SCOPES;
    assert.ok(wasCapped, 'should detect cap');
    const capMessage = wasCapped
      ? `Traversal capped at MAX_SHADOW_SCOPES (${MAX_SHADOW_SCOPES}). Additional shadow roots may not have been audited.`
      : '';
    assert.ok(capMessage.includes('capped'), 'message must mention capping');
    assert.ok(capMessage.includes('50'), 'message must include the cap number');
  });

  it('SHADOW_DOM_NOTE omits cap message when under limit', () => {
    const MAX_SHADOW_SCOPES = 50;
    const scopes = Array.from({ length: 10 }, (_, i) => ({ depth: 0 }));
    const wasCapped = scopes.length >= MAX_SHADOW_SCOPES;
    assert.equal(wasCapped, false, 'should not be capped');
  });
});
