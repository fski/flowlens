// Regression test — chrome.storage.local failures (QUOTA_BYTES exceeded,
// transient IO errors) must never propagate out of the best-effort persistence
// helpers that runAction() awaits un-guarded. A rejection there surfaced in
// production as an unhandled "panel.js (runAction)" crash after every run once
// the storage quota filled up.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

function makeRejectingStorageContext() {
  const ctx = createContext();
  const boom = () => Promise.reject(new Error('QUOTA_BYTES quota exceeded'));
  ctx.__mockChrome.storage.local.get = boom;
  ctx.__mockChrome.storage.local.set = boom;
  return ctx;
}

describe('storage failure resilience (runAction persistence path)', () => {
  it('loadHistorySnapshot resolves null instead of rejecting', async () => {
    const ctx = makeRejectingStorageContext();
    const result = await ctx.loadHistorySnapshot('snap::https://example.com::prod::');
    assert.equal(result, null);
  });

  it('saveHistorySnapshot resolves false instead of rejecting', async () => {
    const ctx = makeRejectingStorageContext();
    const result = await ctx.saveHistorySnapshot({
      key: 'snap::https://example.com::prod::',
      snapshot: { at: new Date().toISOString(), counts: {}, findingHashes: [] },
    });
    assert.equal(result, false);
  });

  it('setPinnedFrameIfNeeded resolves instead of rejecting', async () => {
    const ctx = makeRejectingStorageContext();
    await assert.doesNotReject(() => ctx.setPinnedFrameIfNeeded());
  });

  it('persistRecords resolves false instead of rejecting', async () => {
    const ctx = makeRejectingStorageContext();
    ctx.state.records = [{ id: '1', at: new Date().toISOString(), action: 'run', best: null }];
    const ok = await ctx.persistRecords('records::https://example.com::prod');
    assert.equal(ok, false);
  });

  it('full runAction success path resolves true even when storage rejects', async () => {
    const ctx = makeRejectingStorageContext();
    // initVirtualTables lives below the wire-up marker (not loaded in harness);
    // renderExplorer falls back to plain innerHTML when VT.all stays null.
    ctx.initVirtualTables = () => {};
    ctx.__mockChrome.runtime.sendMessage = (msg) => {
      if (msg && msg.type === 'RUN_AUDIT') {
        return Promise.resolve({
          ok: true,
          action: msg.action,
          usedFrameIds: [0],
          perFrame: [],
          bestEntry: {
            ok: true, frameId: 0, frameKey: 'fk::x', frameKeyStable: 'fk::x',
            result: {
              ok: true,
              findings: [{ type: 'IMG_NO_ALT', severity: 'high', name: 'img', wcag: '1.1.1', path: 'img', confidence: 'strict' }],
              summaryScore: 5,
            },
          },
          selectionReason: 'scored_best',
          scope: 'primary',
          frameKeyByFrameId: { 0: 'fk::x' },
        });
      }
      return Promise.resolve({ ok: true });
    };
    const ok = await ctx.runAction('run');
    assert.equal(ok, true, 'runAction should complete despite storage failures');
  });
});
