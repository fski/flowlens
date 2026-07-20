/**
 * flowMediaStore — IndexedDB media persistence for Flow screenshots + video.
 * Tested against a hand-rolled in-memory fake injected through the _openDb seam
 * (no fake-indexeddb dependency; keeps the zero-runtime-dep rule).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "shared", "flow-media-store.js");

// Minimal in-memory stand-in for the { store(name) → {get,put,delete,getAllKeys} }
// accessor the real _openDb returns.
function makeFakeDb() {
  const stores = { shots: new Map(), videos: new Map() };
  const accessor = (name) => ({
    get: (k) => Promise.resolve(stores[name].get(k) ?? null),
    put: (v, k) => { stores[name].set(k, v); return Promise.resolve(); },
    delete: (k) => { stores[name].delete(k); return Promise.resolve(); },
    getAllKeys: () => Promise.resolve([...stores[name].keys()]),
  });
  return { _stores: stores, store: accessor };
}

function loadStore() {
  const ctx = createContext({ Promise, Map, Set, Array, Object, JSON, String, Number, console });
  new Script(readFileSync(SRC, "utf8"), { filename: "flow-media-store.js" }).runInContext(ctx);
  const fake = makeFakeDb();
  ctx.flowMediaStore._openDb = () => Promise.resolve(fake);
  return { store: ctx.flowMediaStore, fake };
}

describe("flowMediaStore", () => {
  it("put/get a shot round-trips by (sessionId, stepIndex)", async () => {
    const { store } = loadStore();
    const blob = { size: 3 };
    const r = await store.putShot("s1", 2, blob, { w: 800, h: 600 });
    assert.equal(r.ok, true);
    assert.equal(await store.getShot("s1", 2), blob);
    assert.equal(await store.getShot("s1", 99), null);
  });

  it("distinct steps and sessions do not collide", async () => {
    const { store } = loadStore();
    await store.putShot("s1", 1, { id: "a" });
    await store.putShot("s1", 2, { id: "b" });
    await store.putShot("s2", 1, { id: "c" });
    assert.equal((await store.getShot("s1", 1)).id, "a");
    assert.equal((await store.getShot("s1", 2)).id, "b");
    assert.equal((await store.getShot("s2", 1)).id, "c");
  });

  it("put/get a video round-trips by sessionId with meta", async () => {
    const { store } = loadStore();
    const blob = { size: 10 };
    await store.putVideo("s1", blob, { mime: "video/webm", durationMs: 4200 });
    const got = await store.getVideo("s1");
    assert.equal(got.blob, blob);
    assert.equal(got.meta.durationMs, 4200);
    assert.equal(await store.getVideo("nope"), null);
  });

  it("deleteSession removes all shots and the video for that session only", async () => {
    const { store } = loadStore();
    await store.putShot("s1", 1, { size: 1 });
    await store.putShot("s1", 2, { size: 1 });
    await store.putShot("s2", 1, { size: 1 });
    await store.putVideo("s1", { size: 1 }, {});
    await store.deleteSession("s1");
    assert.equal(await store.getShot("s1", 1), null);
    assert.equal(await store.getShot("s1", 2), null);
    assert.equal(await store.getVideo("s1"), null);
    assert.notEqual(await store.getShot("s2", 1), null);
  });

  it("pruneToSessions keeps only the given sessions' media", async () => {
    const { store } = loadStore();
    await store.putShot("keep", 1, { size: 1 });
    await store.putShot("keep", 2, { size: 1 });
    await store.putShot("drop", 1, { size: 1 });
    await store.putVideo("drop", { size: 1 }, {});
    const r = await store.pruneToSessions(["keep"]);
    assert.ok(r.removed >= 2, `removed ${r.removed}`);
    assert.notEqual(await store.getShot("keep", 1), null);
    assert.notEqual(await store.getShot("keep", 2), null);
    assert.equal(await store.getShot("drop", 1), null);
    assert.equal(await store.getVideo("drop"), null);
  });

  it("putShot reports a failure status instead of throwing", async () => {
    const { store } = loadStore();
    store._openDb = () => Promise.reject(new Error("no idb"));
    const r = await store.putShot("s1", 1, { size: 1 });
    assert.equal(r.ok, false);
    assert.ok(r.reason);
  });

  it("getShot returns null (not throw) when the DB is unavailable", async () => {
    const { store } = loadStore();
    store._openDb = () => Promise.reject(new Error("no idb"));
    assert.equal(await store.getShot("s1", 1), null);
  });
});
