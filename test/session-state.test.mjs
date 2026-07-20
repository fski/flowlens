/**
 * Session state machine tests — startSession, endSession, captureStepOptionC
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Session state machine', () => {
  let ctx;

  beforeEach(() => {
    ctx = createContext();
  });

  describe('startSession()', () => {
    it('creates a new session with correct structure', async () => {
      const result = await ctx.startSession();
      assert.equal(result, true);
      const sess = ctx.sessionState.current;
      assert.ok(sess, 'session should exist');
      assert.ok(sess.id.startsWith('sess_'), 'id should start with sess_');
      assert.equal(sess.schemaVersion, 4);
      assert.equal(sess.signatureVersion, 2);
      assert.equal(sess.frameKeyVersion, 1);
      assert.ok(sess.startedAt, 'should have startedAt');
      assert.equal(sess.endedAt, null);
      assert.ok(Array.isArray(sess.steps), 'steps should be array');
      assert.equal(sess.steps.length, 0);
      assert.ok(sess.rawAppendix, 'rawAppendix should exist');
      assert.ok(sess.frames, 'frames should exist');
      assert.ok(Array.isArray(sess.frames.frameKeys));
    });

    it('prevents double-start when session is active', async () => {
      await ctx.startSession();
      const firstId = ctx.sessionState.current.id;
      const result = await ctx.startSession();
      // Should not create a new session (guard returns early)
      assert.equal(ctx.sessionState.current.id, firstId);
    });

    it('resets lastMarkStep and nav state', async () => {
      ctx.sessionState.lastMarkStep = { some: 'data' };
      ctx.sessionState.nav.lastAutoNavUrl = 'https://old.com';
      await ctx.startSession();
      assert.equal(ctx.sessionState.lastMarkStep, null);
      assert.equal(ctx.sessionState.nav.lastAutoNavUrl, null);
    });
  });

  describe('endSession()', () => {
    it('returns false when no session is active', async () => {
      const result = await ctx.endSession();
      assert.equal(result, false);
    });

    it('ends an active session and clears current', async () => {
      await ctx.startSession();
      const sessId = ctx.sessionState.current.id;
      assert.ok(ctx.sessionState.current);
      const result = await ctx.endSession();
      // Session should be cleared from current
      assert.equal(ctx.sessionState.current, null);
      assert.equal(ctx.sessionState.lastMarkStep, null);
    });

    it('preserves lastEndedSession for export', async () => {
      await ctx.startSession();
      const sessId = ctx.sessionState.current.id;
      await ctx.endSession();
      assert.ok(ctx.sessionState.lastEndedSession, 'lastEndedSession should be set');
      assert.equal(ctx.sessionState.lastEndedSession.id, sessId);
    });

    it('clears auto-capture state on end', async () => {
      await ctx.startSession();
      ctx.sessionState.autoCapturePending = 123;
      ctx.sessionState.nav.lastAutoNavUrl = 'https://test.com';
      ctx.sessionState.queuedCapture = { isAutoCapture: true };
      await ctx.endSession();
      assert.equal(ctx.sessionState.autoCapturePending, null);
      assert.equal(ctx.sessionState.nav.lastAutoNavUrl, null);
      assert.equal(ctx.sessionState.queuedCapture, null);
    });
  });

  describe('session lifecycle', () => {
    it('can start, end, and start a new session', async () => {
      await ctx.startSession();
      const id1 = ctx.sessionState.current.id;
      await ctx.endSession();
      assert.equal(ctx.sessionState.current, null);

      await ctx.startSession();
      const id2 = ctx.sessionState.current.id;
      assert.notEqual(id1, id2, 'new session should have different ID');
    });
  });
});
