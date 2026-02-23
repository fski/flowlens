/**
 * Signature quality for shadow paths — computeSignatureQuality() tests.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Signature quality for shadow paths', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('shadow + nth-of-type without anchors → low quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'my-component >>> div > button:nth-of-type(2)',
      testId: null,
    });
    assert.equal(quality, 'low');
  });

  it('shadow + id anchor → high quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'my-component >>> #submit-btn',
      testId: null,
    });
    assert.equal(quality, 'high');
  });

  it('shadow + data-testid anchor → high quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'my-component >>> button[data-testid="submit"]',
      testId: 'submit',
    });
    assert.equal(quality, 'high');
  });

  it('light DOM + nth-of-type → medium quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'div > button:nth-of-type(2)',
      testId: null,
    });
    assert.equal(quality, 'medium');
  });

  it('no path → low quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: null,
      testId: null,
    });
    assert.equal(quality, 'low');
  });

  it('testId present → high quality regardless of path', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'my-component >>> div:nth-of-type(3) > span',
      testId: 'my-control',
    });
    assert.equal(quality, 'high');
  });

  it('does not change signature hash', () => {
    const finding = {
      path: 'my-component >>> div > button:nth-of-type(2)',
      testId: null,
      type: 'NO_ACCESSIBLE_NAME',
      severity: 'high',
      wcag: '4.1.2',
    };
    const quality = ctx.computeSignatureQuality(finding);
    assert.equal(quality, 'low');
  });
});
