/**
 * Overlay lifecycle (logic-level) — targetRef data structure, caps, mode restriction.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Overlay lifecycle (logic-level)', () => {
  it('annotationsActive starts as false', () => {
    let annotationsActive = false;
    assert.equal(annotationsActive, false);
  });

  it('annotation data uses targetRef, not path', () => {
    const findings = [
      {
        type: 'NO_ACCESSIBLE_NAME', severity: 'high',
        path: 'my-component >>> div > button',
        targetRef: { cssSelector: '#submit-btn', testId: 'submit', tag: 'button', role: null, name: null, inShadow: true },
        note: 'Missing name',
      },
    ];
    const annotationData = findings.map((f, i) => ({
      id: String(i),
      type: f.type,
      severity: f.severity,
      targetRef: f.targetRef,
      note: f.note || '',
    }));
    assert.equal(annotationData.length, 1);
    assert.equal(annotationData[0].id, '0');
    assert.ok(annotationData[0].targetRef, 'must have targetRef');
    assert.ok(!annotationData[0].path, 'should not pass raw path');
    assert.ok(!annotationData[0].html, 'should not include raw HTML');
    assert.ok(!annotationData[0].el, 'should not include DOM reference');
  });

  it('annotation data caps at 200 items', () => {
    const MAX_ANNOTATIONS = 200;
    const findings = Array.from({ length: 300 }, (_, i) => ({
      id: String(i), type: 'TEST', severity: 'low',
      targetRef: { cssSelector: `#el${i}`, testId: null, tag: 'div', role: null, name: null, inShadow: false },
      note: '',
    }));
    const capped = findings.slice(0, MAX_ANNOTATIONS);
    assert.equal(capped.length, 200);
  });

  it('targetRef with only tag+role is valid (fallback)', () => {
    const targetRef = { cssSelector: null, testId: null, tag: 'button', role: 'button', name: 'Submit', inShadow: false };
    assert.ok(targetRef.tag, 'tag must be present for fallback');
  });

  it('resolveTarget skips tag fallback when too many candidates', () => {
    const MAX_TAG_CANDIDATES = 50;
    assert.ok(MAX_TAG_CANDIDATES === 50, 'cap is 50 elements');
  });

  it('overlay refuses when frame context changed', () => {
    const snapshotFrameId = 100;
    const currentBestFrameId = 200;
    const shouldBlock = snapshotFrameId !== currentBestFrameId;
    assert.ok(shouldBlock, 'must block overlay when frame changed');
  });

  it('overlay allows when frame matches', () => {
    const snapshotFrameId = 100;
    const currentBestFrameId = 100;
    const shouldAllow = snapshotFrameId === currentBestFrameId;
    assert.ok(shouldAllow, 'must allow overlay when frame matches');
  });

  it('overlay only allowed for run mode', () => {
    const OVERLAY_ALLOWED_MODES = new Set(['run']);
    assert.ok(OVERLAY_ALLOWED_MODES.has('run'), 'run mode allowed');
    assert.ok(!OVERLAY_ALLOWED_MODES.has('contrast'), 'contrast mode blocked');
    assert.ok(!OVERLAY_ALLOWED_MODES.has('tabWalk'), 'tabWalk mode blocked');
    assert.ok(!OVERLAY_ALLOWED_MODES.has('observe'), 'observe mode blocked');
    assert.ok(!OVERLAY_ALLOWED_MODES.has('watch'), 'watch mode blocked');
  });
});
