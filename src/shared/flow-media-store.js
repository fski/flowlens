// flowMediaStore — IndexedDB persistence for Flow per-step screenshots and
// per-session video. Kept OUT of chrome.storage.local (which holds record/session
// JSON and would blow its ~10 MB quota on image/video blobs).
//
// Shots are keyed `${sessionId}::${stepShotKey}` (stable step.id; numeric
// step.index only for pre-id legacy sessions), videos by `${sessionId}`.
// Every method is best-effort: writes return { ok, reason }, reads return the
// value or null — a missing/broken IndexedDB never throws into the caller, so a
// failed screenshot degrades to a placeholder tile instead of failing the audit.
//
// _openDb() is a seam: production opens the real "flowlens-media" DB; tests
// replace it with an in-memory fake. It resolves to { store(name) } where
// store(name) exposes get/put/delete/getAllKeys returning Promises.

var flowMediaStore = (function () {
  var DB_NAME = "flowlens-media";
  var DB_VERSION = 1;
  var SHOTS = "shots";
  var VIDEOS = "videos";

  function shotKey(sessionId, stepIndex) {
    return String(sessionId) + "::" + String(stepIndex);
  }
  function sessionOfShotKey(key) {
    var idx = String(key).lastIndexOf("::");
    return idx === -1 ? String(key) : String(key).slice(0, idx);
  }

  // Real IndexedDB adapter. Only used in the browser; tests override _openDb.
  function _openDb() {
    return new Promise(function (resolve, reject) {
      if (typeof indexedDB === "undefined") { reject(new Error("no-indexeddb")); return; }
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(SHOTS)) db.createObjectStore(SHOTS);
        if (!db.objectStoreNames.contains(VIDEOS)) db.createObjectStore(VIDEOS);
      };
      req.onerror = function () { reject(req.error || new Error("idb-open-failed")); };
      req.onsuccess = function () {
        var db = req.result;
        var reqAsPromise = function (r) {
          return new Promise(function (res, rej) {
            r.onsuccess = function () { res(r.result); };
            r.onerror = function () { rej(r.error); };
          });
        };
        resolve({
          store: function (name) {
            return {
              get: function (k) { return reqAsPromise(db.transaction(name, "readonly").objectStore(name).get(k)); },
              put: function (v, k) { return reqAsPromise(db.transaction(name, "readwrite").objectStore(name).put(v, k)); },
              delete: function (k) { return reqAsPromise(db.transaction(name, "readwrite").objectStore(name).delete(k)); },
              getAllKeys: function () { return reqAsPromise(db.transaction(name, "readonly").objectStore(name).getAllKeys()); },
            };
          },
        });
      };
    });
  }

  function putShot(sessionId, stepId, blob, meta) {
    return api._openDb().then(function (db) {
      // Only the blob is ever read back; `at` is kept for debugging. The old
      // w/h fields were write-only dead weight.
      return db.store(SHOTS).put({ blob: blob, at: (meta && meta.at) || 0 }, shotKey(sessionId, stepId));
    }).then(function () {
      return { ok: true };
    }).catch(function (e) {
      return { ok: false, reason: (e && e.message) || "put-shot-failed" };
    });
  }

  function getShot(sessionId, stepIndex) {
    return api._openDb().then(function (db) {
      return db.store(SHOTS).get(shotKey(sessionId, stepIndex));
    }).then(function (rec) {
      return rec ? rec.blob : null;
    }).catch(function () {
      return null;
    });
  }

  function putVideo(sessionId, blob, meta) {
    return api._openDb().then(function (db) {
      return db.store(VIDEOS).put({ blob: blob, meta: meta || {} }, String(sessionId));
    }).then(function () {
      return { ok: true };
    }).catch(function (e) {
      return { ok: false, reason: (e && e.message) || "put-video-failed" };
    });
  }

  function getVideo(sessionId) {
    return api._openDb().then(function (db) {
      return db.store(VIDEOS).get(String(sessionId));
    }).then(function (rec) {
      return rec ? { blob: rec.blob, meta: rec.meta || {} } : null;
    }).catch(function () {
      return null;
    });
  }

  function deleteShot(sessionId, stepId) {
    return api._openDb().then(function (db) {
      return db.store(SHOTS).delete(shotKey(sessionId, stepId));
    }).then(function () { return { ok: true }; }).catch(function (e) {
      return { ok: false, reason: (e && e.message) || "delete-shot-failed" };
    });
  }

  function deleteSession(sessionId) {
    var sid = String(sessionId);
    return api._openDb().then(function (db) {
      var shots = db.store(SHOTS);
      return shots.getAllKeys().then(function (keys) {
        var dels = (keys || [])
          .filter(function (k) { return sessionOfShotKey(k) === sid; })
          .map(function (k) { return shots.delete(k); });
        dels.push(db.store(VIDEOS).delete(sid));
        return Promise.all(dels);
      });
    }).then(function () { return undefined; }).catch(function () { return undefined; });
  }

  function pruneToSessions(keepSessionIds) {
    var keep = {};
    (keepSessionIds || []).forEach(function (id) { keep[String(id)] = true; });
    return api._openDb().then(function (db) {
      var shots = db.store(SHOTS);
      var videos = db.store(VIDEOS);
      var removed = 0;
      return Promise.all([shots.getAllKeys(), videos.getAllKeys()]).then(function (res) {
        var shotKeys = res[0] || [];
        var videoKeys = res[1] || [];
        var dels = [];
        shotKeys.forEach(function (k) {
          if (!keep[sessionOfShotKey(k)]) { removed++; dels.push(shots.delete(k)); }
        });
        videoKeys.forEach(function (k) {
          if (!keep[String(k)]) { removed++; dels.push(videos.delete(k)); }
        });
        return Promise.all(dels).then(function () { return { removed: removed }; });
      });
    }).catch(function () { return { removed: 0 }; });
  }

  var api = {
    _openDb: _openDb,
    putShot: putShot,
    getShot: getShot,
    putVideo: putVideo,
    getVideo: getVideo,
    deleteShot: deleteShot,
    deleteSession: deleteSession,
    pruneToSessions: pruneToSessions,
  };
  return api;
})();

if (typeof module !== "undefined" && module.exports) module.exports = { flowMediaStore: flowMediaStore };
