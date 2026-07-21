/**
 * flowlens-nav port client — reconnect/backoff transport (extracted from the
 * wireup zone, where it shipped untested; one SW reap without a reconnect
 * kills SPA auto-capture for the rest of the panel's life).
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

function fakePort() {
  const msgListeners = [];
  const discListeners = [];
  return {
    posted: [],
    postMessage(m) { this.posted.push(m); },
    onMessage: { addListener(fn) { msgListeners.push(fn); } },
    onDisconnect: { addListener(fn) { discListeners.push(fn); } },
    emit(m) { for (const fn of msgListeners) fn(m); },
    drop() { for (const fn of discListeners) fn(); },
  };
}

// Manual timer: records scheduled callbacks, fires on demand.
function fakeTimer() {
  const queue = [];
  const st = (fn, delay) => { queue.push({ fn, delay }); };
  st.queue = queue;
  st.fireNext = () => {
    const item = queue.shift();
    assert.ok(item, 'expected a scheduled callback');
    item.fn();
    return item.delay;
  };
  return st;
}

describe('createNavPortClient — nav port transport with reconnect', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  function makeClient({ connectImpl, timer, onNavMessage, warn } = {}) {
    const ports = [];
    let failures = 0;
    const client = ctx.createNavPortClient({
      connect: connectImpl || (() => { const p = fakePort(); ports.push(p); return p; }),
      tabId: 42,
      setTimeout: timer || fakeTimer(),
      onNavMessage: onNavMessage || (() => {}),
      warn: warn || (() => {}),
    });
    return { client, ports, failCount: () => failures };
  }

  it('open() connects and announces the tabId on the fresh port', () => {
    const { client, ports } = makeClient();
    client.open();
    assert.equal(ports.length, 1);
    assert.equal(ports[0].posted.length, 1);
    assert.equal(ports[0].posted[0].tabId, 42);
  });

  it('connect failure schedules a retry with exponential backoff capped at 30s', () => {
    const timer = fakeTimer();
    let calls = 0;
    const { client } = makeClient({
      timer,
      connectImpl: () => { calls++; throw new Error('no SW'); },
    });
    client.open();
    const delays = [];
    // 1s, 2s, 4s, 8s, 16s, then the 30s cap holds.
    for (let i = 0; i < 7; i++) delays.push(timer.fireNext());
    assert.deepEqual(delays, [1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    assert.equal(calls, 8, 'every scheduled retry attempts a fresh connect');
  });

  it('port disconnect schedules a reconnect and the new port gets the tabId again', () => {
    const timer = fakeTimer();
    const { client, ports } = makeClient({ timer });
    client.open();
    ports[0].drop();
    const delay = timer.fireNext();
    assert.equal(delay, 1000);
    assert.equal(ports.length, 2, 'reconnect opened a fresh port');
    assert.equal(ports[1].posted.length, 1);
    assert.equal(ports[1].posted[0].tabId, 42);
  });

  it('live nav traffic resets the backoff to 1s', () => {
    const timer = fakeTimer();
    let fail = false;
    const ports = [];
    const { client } = makeClient({
      timer,
      connectImpl: () => {
        if (fail) throw new Error('no SW');
        const p = fakePort(); ports.push(p); return p;
      },
    });
    client.open();
    // Grow the backoff: drop the port, then fail two reconnects.
    fail = true;
    ports[0].drop();
    assert.equal(timer.fireNext(), 1000);
    assert.equal(timer.fireNext(), 2000);
    // SW comes back, port carries traffic — backoff must reset.
    fail = false;
    assert.equal(timer.fireNext(), 4000);
    ports[1].emit({ type: 'SPA_NAV', url: 'https://x.com/a' });
    fail = true;
    ports[1].drop();
    assert.equal(timer.fireNext(), 1000, 'delay restarts at 1s after live traffic');
  });

  it('delegates FRAME_NAV and SPA_NAV to onNavMessage, ignores everything else', () => {
    const seen = [];
    const { client, ports } = makeClient({ onNavMessage: (m) => seen.push(m) });
    client.open();
    ports[0].emit(null);
    ports[0].emit({ type: 'PING' });
    ports[0].emit({ type: 'FRAME_NAV', url: 'https://x.com/f', frameId: 7 });
    ports[0].emit({ type: 'SPA_NAV', url: 'https://x.com/s' });
    assert.deepEqual(seen.map((m) => m.type), ['FRAME_NAV', 'SPA_NAV']);
  });

  it('unrelated messages do not reset the backoff', () => {
    const timer = fakeTimer();
    let fail = false;
    const ports = [];
    const { client } = makeClient({
      timer,
      connectImpl: () => {
        if (fail) throw new Error('no SW');
        const p = fakePort(); ports.push(p); return p;
      },
    });
    client.open();
    fail = true;
    ports[0].drop();
    assert.equal(timer.fireNext(), 1000);
    fail = false;
    assert.equal(timer.fireNext(), 2000);
    ports[1].emit({ type: 'PING' });
    fail = true;
    ports[1].drop();
    assert.equal(timer.fireNext(), 4000, 'backoff keeps growing — PING is not proof of nav traffic');
  });

  it('connect failure reports through warn, not an uncaught throw', () => {
    const warned = [];
    const timer = fakeTimer();
    const { client } = makeClient({
      timer,
      warn: (...a) => warned.push(a),
      connectImpl: () => { throw new Error('no SW'); },
    });
    client.open();
    assert.equal(warned.length, 1);
  });
});
