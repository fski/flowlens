/**
 * Persistence layer tests — storage, session persistence, normalization
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Persistence layer', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext();
  });

  describe('storageGet / storageSet', () => {
    it('stores and retrieves a value', async () => {
      await ctx.storageSet({ foo: 'bar' });
      const result = await ctx.storageGet(['foo']);
      assert.equal(result.foo, 'bar');
    });

    it('stores complex objects', async () => {
      const obj = { nested: { deep: [1, 2, 3] }, flag: true };
      await ctx.storageSet({ complex: obj });
      const result = await ctx.storageGet(['complex']);
      assert.deepEqual(result.complex, obj);
    });

    it('returns empty for missing keys', async () => {
      const result = await ctx.storageGet(['nonexistent']);
      assert.equal(result.nonexistent, undefined);
    });

    it('overwrites existing values', async () => {
      await ctx.storageSet({ key: 'v1' });
      await ctx.storageSet({ key: 'v2' });
      const result = await ctx.storageGet(['key']);
      assert.equal(result.key, 'v2');
    });

    it('handles multiple keys at once', async () => {
      await ctx.storageSet({ a: 1, b: 2, c: 3 });
      const result = await ctx.storageGet(['a', 'b', 'c']);
      assert.equal(result.a, 1);
      assert.equal(result.b, 2);
      assert.equal(result.c, 3);
    });
  });

  describe('Session persistence key generation', () => {
    it('getSessionKeys generates correct key format', () => {
      const keys = ctx.getSessionKeys('https://example.com', 'prod');
      assert.equal(keys.active, 'session::active::https://example.com::prod');
      assert.equal(keys.archive, null); // no sessionId provided
    });

    it('getSessionKeys generates archive key with sessionId', () => {
      const keys = ctx.getSessionKeys('https://example.com', 'prod', 'sess_123');
      assert.equal(keys.archive, 'session::archive::https://example.com::prod::sess_123');
    });

    it('getSessionKeys handles empty origin/env', () => {
      const keys = ctx.getSessionKeys('', '');
      assert.equal(keys.active, 'session::active::::');
    });
  });

  describe('persistActiveSessionBestEffort()', () => {
    it('returns false for null session', async () => {
      const result = await ctx.persistActiveSessionBestEffort(null);
      assert.equal(result, false);
    });

    it('persists a session to storage', async () => {
      const session = {
        id: 'sess_test_123',
        schemaVersion: 1,
        signatureVersion: 1,
        frameKeyVersion: 1,
        startedAt: new Date().toISOString(),
        endedAt: null,
        inspectedOrigin: 'https://example.com',
        envTag: 'https://example.com • prod',
        steps: [],
        rawAppendix: {},
        frames: { frameKeys: [], frameKeyToLastFrameId: {} },
        settings: {},
      };
      const result = await ctx.persistActiveSessionBestEffort(session);
      // Should succeed (mock storage always works)
      assert.equal(result, true);
    });
  });

  describe('archiveSessionBestEffort()', () => {
    it('returns false for null session', async () => {
      const result = await ctx.archiveSessionBestEffort(null);
      assert.equal(result, false);
    });

    it('archives a session and clears active key', async () => {
      const session = {
        id: 'sess_archive_test',
        schemaVersion: 1,
        signatureVersion: 1,
        frameKeyVersion: 1,
        startedAt: '2024-01-01T00:00:00.000Z',
        endedAt: '2024-01-01T01:00:00.000Z',
        inspectedOrigin: 'https://example.com',
        envTag: 'https://example.com • prod',
        steps: [],
        rawAppendix: {},
        frames: { frameKeys: [], frameKeyToLastFrameId: {} },
        settings: {},
      };

      // First persist as active
      await ctx.storageSet({ 'session::active::::': session });

      // Then archive
      const result = await ctx.archiveSessionBestEffort(session);
      assert.equal(result, true);
      assert.equal(ctx.sessionState.lastArchiveId, 'sess_archive_test');
    });
  });

  describe('loadActiveSessionForScope()', () => {
    it('loads null when no session exists', async () => {
      await ctx.loadActiveSessionForScope('https://example.com', 'prod');
      assert.equal(ctx.sessionState.current, null);
    });

    it('loads a persisted session', async () => {
      const session = {
        id: 'sess_load_test',
        schemaVersion: 1,
        steps: [{ index: 1, snapshots: { run: null, active: null } }],
        rawAppendix: {},
        frames: { frameKeys: [] },
      };
      const key = 'session::active::https://example.com::prod';
      await ctx.storageSet({ [key]: session });

      await ctx.loadActiveSessionForScope('https://example.com', 'prod');
      assert.ok(ctx.sessionState.current);
      assert.equal(ctx.sessionState.current.id, 'sess_load_test');
      assert.equal(ctx.sessionState.current.steps.length, 1);
    });

    it('normalizes loaded session', async () => {
      const session = {
        id: 'sess_normalize_test',
        schemaVersion: '2',
        // missing steps, rawAppendix, frames
      };
      const key = 'session::active::https://example.com::prod';
      await ctx.storageSet({ [key]: session });

      await ctx.loadActiveSessionForScope('https://example.com', 'prod');
      const loaded = ctx.sessionState.current;
      assert.ok(loaded);
      assert.equal(loaded.schemaVersion, 3); // migrated to current
      assert.ok(Array.isArray(loaded.steps));
      assert.ok(loaded.rawAppendix);
      assert.ok(loaded.frames);
    });
  });

  describe('normalizeLoadedSession() edge cases', () => {
    it('preserves existing step data', () => {
      const step = {
        index: 1,
        at: '2024-01-01T00:00:00.000Z',
        url: 'https://example.com',
        snapshots: {
          run: { mode: 'run', best: null },
          active: null,
        },
      };
      const sess = ctx.normalizeLoadedSession({
        id: 'test',
        steps: [step],
      });
      assert.equal(sess.steps.length, 1);
      assert.equal(sess.steps[0].index, 1);
      assert.ok(sess.steps[0].snapshots);
    });

    it('adds targeting to snapshots that lack it', () => {
      const sess = ctx.normalizeLoadedSession({
        id: 'test',
        steps: [{
          index: 1,
          snapshots: {
            run: { mode: 'run', best: {} },
            active: null,
          },
        }],
      });
      assert.equal(sess.steps[0].snapshots.run.targeting, null);
    });
  });

  describe('compactSessionForExport()', () => {
    it('returns a deep clone (does not mutate original)', () => {
      const session = {
        id: 'test_compact',
        schemaVersion: 1,
        signatureVersion: 1,
        frameKeyVersion: 1,
        steps: [],
        rawAppendix: {},
        frames: { frameKeys: [], frameKeyToLastFrameId: {} },
      };
      const compacted = ctx.compactSessionForExport(session);
      assert.ok(compacted);
      assert.equal(compacted.id, 'test_compact');
      // Mutating compacted should not affect original
      compacted.id = 'mutated';
      assert.equal(session.id, 'test_compact');
    });

    it('handles null input', () => {
      const result = ctx.compactSessionForExport(null);
      assert.equal(result, null);
    });
  });

  describe('estimateJsonBytes()', () => {
    it('estimates bytes for simple object', () => {
      const bytes = ctx.estimateJsonBytes({ hello: 'world' });
      assert.ok(bytes > 0);
    });

    it('returns -1 for circular refs', () => {
      const obj = {};
      obj.self = obj;
      const bytes = ctx.estimateJsonBytes(obj);
      assert.equal(bytes, -1);
    });
  });
});
