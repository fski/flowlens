/**
 * Storage correctness and retention:
 * - a Snap run that finishes after the inspected page changed origin is
 *   filed under the origin it started on, not the new one;
 * - archived sessions are listed via an index (no storage.get(null)) and
 *   evicted past MAX_ARCHIVED_SESSIONS, with media dropped only for archives;
 * - records::<origin>::<env> keys are capped at MAX_RECORD_SCOPES.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Script } from "node:vm";
import { createContext } from "./harness.mjs";

// Top-level consts aren't context properties — evaluate them in the context.
const constOf = (ctx, name) => new Script(name).runInContext(ctx);

function setUrl(ctx, url) {
  const el = ctx.document._elCache["inspectedUrl"];
  el.dataset.full = url;
  el.textContent = url;
}

const okRun = { ok: true, usedFrameIds: [0], bestEntry: { frameId: 0, result: { findings: [] } } };

describe("runAction — result filed under the scope the run started on", () => {
  it("navigation mid-run: saved to the start origin, current view untouched", async () => {
    const ctx = createContext();
    setUrl(ctx, "https://start.example/a");
    ctx.__mockChrome.runtime.sendMessage = async (msg) => {
      if (msg.type === "RUN_AUDIT") setUrl(ctx, "https://other.example/b"); // navigates while running
      return okRun;
    };
    ctx.state.records = [];
    const ok = await ctx.runAction("run");
    assert.equal(ok, true);
    const raw = ctx.__mockChrome.storage.local._raw;
    const startKey = Object.keys(raw).find(k => k.startsWith("records::https://start.example::"));
    assert.ok(startKey, "record stored under the start origin");
    assert.equal(raw[startKey].length, 1);
    assert.ok(!Object.keys(raw).some(k => k.startsWith("records::https://other.example::")), "nothing filed under the new origin");
    assert.equal(ctx.state.records.length, 0, "the new page's history view is not polluted");
  });

  it("no navigation: renders and persists normally", async () => {
    const ctx = createContext();
    setUrl(ctx, "https://start.example/a");
    ctx.__mockChrome.runtime.sendMessage = async () => okRun;
    ctx.state.records = [];
    await ctx.runAction("run");
    assert.equal(ctx.state.records.length, 1);
  });
});

describe("archived sessions — index + retention", () => {
  const sess = (i) => ({ id: `s${i}`, startedAt: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(), steps: [{}, {}] });

  it("lists from the index without reading all of storage", async () => {
    const ctx = createContext();
    await ctx.registerArchivedSession("session::archive::o::prod::s1", sess(1));
    let fullReads = 0;
    const realGet = ctx.__mockChrome.storage.local.get;
    ctx.__mockChrome.storage.local.get = (keys) => { if (keys === null) fullReads++; return realGet(keys); };
    const list = await ctx.listArchivedSessions();
    assert.equal(fullReads, 0);
    assert.equal(list.length, 1);
    assert.equal(list[0].id, "s1");
    assert.equal(list[0].steps, 2);
  });

  it("migrates once from pre-index installs", async () => {
    const ctx = createContext({ storageData: {
      "session::archive::o::prod::old1": sess(1),
      "session::archive::o::prod::old2": sess(2),
    } });
    const list = await ctx.listArchivedSessions();
    assert.deepEqual(Array.from(list, e => e.id), ["s2", "s1"]);
    assert.deepEqual(Array.from(list, e => e.key), ["session::archive::o::prod::old2", "session::archive::o::prod::old1"]);
    assert.ok(Array.isArray(ctx.__mockChrome.storage.local._raw["session::archiveIndex"]));
  });

  it("evicts archives past the cap and drops media only for archived sessions", async () => {
    const ctx = createContext();
    const dropped = [];
    ctx.flowMediaStore.deleteSessions = async (ids) => { dropped.push(...ids); return { removed: ids.length }; };
    const raw = ctx.__mockChrome.storage.local._raw;
    const N = constOf(ctx, "MAX_ARCHIVED_SESSIONS") + 3;
    for (let i = 1; i <= N; i++) {
      const key = `session::archive::o::prod::s${i}`;
      raw[key] = sess(i);
      await ctx.registerArchivedSession(key, sess(i));
    }
    const idx = raw["session::archiveIndex"];
    assert.equal(idx.length, constOf(ctx, "MAX_ARCHIVED_SESSIONS"));
    assert.ok(!("session::archive::o::prod::s1" in raw), "oldest archive removed");
    assert.ok(`session::archive::o::prod::s${N}` in raw, "newest archive kept");
    // Media of the newest MAX_SESSIONS_WITH_MEDIA archives is never dropped.
    for (let i = N; i > N - constOf(ctx, "MAX_SESSIONS_WITH_MEDIA"); i--) assert.ok(!dropped.includes(`s${i}`));
    assert.ok(dropped.includes("s1"));
    // An active (unarchived) session id is never passed to the media store.
    assert.ok(!dropped.includes("active-elsewhere"));
  });
});

describe("records scopes — capped per origin/env", () => {
  it("keeps the most recently used scopes and removes the rest", async () => {
    const ctx = createContext();
    const raw = ctx.__mockChrome.storage.local._raw;
    const N = constOf(ctx, "MAX_RECORD_SCOPES") + 2;
    for (let i = 0; i < N; i++) {
      const key = `records::https://site${i}.example::prod`;
      ctx.state.records = [{ id: `r${i}`, action: "run", best: null }];
      await ctx.persistRecords(key);
      await new Promise(r => setImmediate(r));
    }
    const kept = Object.keys(raw).filter(k => k.startsWith("records::https://"));
    assert.equal(kept.length, constOf(ctx, "MAX_RECORD_SCOPES"));
    assert.ok(!("records::https://site0.example::prod" in raw), "least recently used scope evicted");
    assert.ok(`records::https://site${N - 1}.example::prod` in raw);
  });
});

describe("flowMediaStore.deleteSessions", () => {
  it("deletes shots and video only for the listed sessions", async () => {
    const ctx = createContext();
    const stores = { shots: new Map([["a::1", 1], ["a::2", 1], ["b::1", 1]]), videos: new Map([["a", 1], ["b", 1]]) };
    const fake = { store: (n) => ({
      getAllKeys: async () => [...stores[n].keys()],
      delete: async (k) => stores[n].delete(k),
    }) };
    ctx.flowMediaStore._openDb = async () => fake;
    const r = await ctx.flowMediaStore.deleteSessions(["a"]);
    assert.equal(r.removed, 3);
    assert.deepEqual([...stores.shots.keys()], ["b::1"]);
    assert.deepEqual([...stores.videos.keys()], ["b"]);
  });
});
