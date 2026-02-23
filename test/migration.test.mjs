/**
 * Session versioning and migration tests — normalizeLoadedSession.
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Session versioning and migration', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('normalizeLoadedSession migrates v1 → v3', () => {
    const v1Session = {
      id: 'test_123',
      schemaVersion: 1,
      signatureVersion: 1,
      steps: [
        { index: 0, snapshots: { run: null }, capturedAt: '2026-02-20T10:00:00Z' },
      ],
    };
    const result = ctx.normalizeLoadedSession(v1Session);
    assert.equal(result._migrated, true);
    assert.equal(result.schemaVersion, 3);
    assert.ok(result._migrationWarnings.length > 0, 'should have migration warnings');
    const scope = { ...result.steps[0].scope };
    assert.deepEqual(scope, { type: 'document', rootSelector: null, rootTestId: null });
    assert.equal(result.enMappingVersion, 0);
  });

  it('normalizeLoadedSession is no-op for current version session', () => {
    const currentSession = {
      id: 'test_456',
      schemaVersion: 3,
      signatureVersion: 2,
      enMappingVersion: 1,
      steps: [
        { index: 0, scope: { type: 'document', rootSelector: null }, snapshots: { run: null } },
      ],
    };
    const result = ctx.normalizeLoadedSession(currentSession);
    assert.equal(result._migrated, false);
    assert.equal(result._migrationWarnings.length, 0);
    assert.equal(result.schemaVersion, 3);
  });

  it('normalizeLoadedSession returns null for invalid input', () => {
    assert.equal(ctx.normalizeLoadedSession(null), null);
    assert.equal(ctx.normalizeLoadedSession(undefined), null);
    assert.equal(ctx.normalizeLoadedSession('not an object'), null);
  });

  it('normalizeLoadedSession ensures rawAppendix exists', () => {
    const session = { id: 'test_raw', schemaVersion: 3, steps: [] };
    const result = ctx.normalizeLoadedSession(session);
    assert.ok(result.rawAppendix !== undefined);
    assert.equal(typeof result.rawAppendix, 'object');
  });

  it('normalizeLoadedSession ensures frames structure', () => {
    const session = { id: 'test_frames', schemaVersion: 3, steps: [] };
    const result = ctx.normalizeLoadedSession(session);
    assert.ok(Array.isArray(result.frames.frameKeys));
    assert.equal(typeof result.frames.frameKeyToLastFrameId, 'object');
  });
});
