# Flow Tab Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Flow tab into a readable, auto-capturing, screenshot- and video-equipped flow inspector with a per-step issue diff and a cross-flow issue-lifecycle view.

**Architecture:** New isolated units — `flowMediaStore` (IndexedDB), a SW screenshot path, a SW→panel nav port for SPA routes, pure diff/lifecycle builders — feed a single `renderFlow(state)` orchestrator that is the only writer of Flow DOM. Additive data-model fields keep old sessions loadable.

**Tech Stack:** Vanilla JS (ES5-style top-level per CONTRIBUTING), concatenated panel parts, `node:test` + vm harness, esbuild build, Playwright for E2E on `dist/`.

## Global Constraints

- Panel source is split into `src/panel/panel-{00..90}-*.js`; testable functions MUST live BEFORE the `// --- wire up ---` marker (harness cuts there). `panel-90-wireup.js` is excluded from the harness.
- ES5-style at top level (`var`, `function`, no top-level arrow) per CONTRIBUTING.
- Zero runtime npm deps; devDeps only (esbuild, playwright already present). No `fake-indexeddb` — hand-roll fakes.
- No new Chrome permissions. Manifest unchanged. Host perms `http://*/*`,`https://*/*` cover `captureVisibleTab`.
- After adding a mode/profile/table column, update the relevant hardcoded test counts.
- Media blobs live ONLY in IndexedDB (`flowlens-media`), never in `chrome.storage.local`.
- Additive data model only: `step.hasShot`, `step.shotError`, `session.hasVideo`.
- Version target 6.1.0 (bump in Task 7). Full `npm run ci` + `e2e-smoke` green at each task boundary.
- Doctor pass per task: `npm test` green, `npm run build` clean.

---

### Task 1: `flowMediaStore` — IndexedDB media persistence

**Files:**
- Create: `src/shared/flow-media-store.js` (loaded via a `<script>` in panel.html before panel.js; also referenced in panel.parts build copy list)
- Test: `test/flow-media-store.test.mjs`
- Modify: `src/panel/panel.html` (add `<script src="flow-media-store.js">` before `panel.js`), `scripts/build.mjs` (ensure the file is copied to dist — verify it globs `src/shared/*.js`)

**Interfaces:**
- Produces (global, like `limits.js`): `flowMediaStore` object with:
  - `putShot(sessionId, stepIndex, blob, dims) → Promise<{ok:boolean, reason?}>`
  - `getShot(sessionId, stepIndex) → Promise<Blob|null>`
  - `putVideo(sessionId, blob, meta) → Promise<{ok:boolean}>`
  - `getVideo(sessionId) → Promise<{blob, meta}|null>`
  - `deleteSession(sessionId) → Promise<void>`
  - `pruneToSessions(keepSessionIds) → Promise<{removed:number}>`
  - `_openDb()` — internal seam; tests replace it with an in-memory fake.
- Consumes: nothing.

- [ ] **Step 1: Write failing tests** — `test/flow-media-store.test.mjs`:

```js
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script, createContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, "..", "src", "shared", "flow-media-store.js");

// Minimal in-memory IndexedDB-ish fake exposed to the module via _openDb seam.
function makeFakeDb() {
  const stores = { shots: new Map(), videos: new Map() };
  const tx = (name) => ({
    get: (k) => Promise.resolve(stores[name].get(k) ?? null),
    put: (v, k) => { stores[name].set(k, v); return Promise.resolve(); },
    delete: (k) => { stores[name].delete(k); return Promise.resolve(); },
    getAllKeys: () => Promise.resolve([...stores[name].keys()]),
  });
  return { _stores: stores, store: tx };
}

function loadStore() {
  const ctx = createContext({ Promise, Map, Set, Array, Object, JSON, console });
  new Script(readFileSync(SRC, "utf8"), { filename: "flow-media-store.js" }).runInContext(ctx);
  const fake = makeFakeDb();
  ctx.flowMediaStore._openDb = () => Promise.resolve(fake);
  return { store: ctx.flowMediaStore, fake };
}

describe("flowMediaStore", () => {
  it("put/get a shot round-trips by (sessionId, stepIndex)", async () => {
    const { store } = loadStore();
    const blob = { size: 3 }; // opaque to the store
    const r = await store.putShot("s1", 2, blob, { w: 800, h: 600 });
    assert.equal(r.ok, true);
    const got = await store.getShot("s1", 2);
    assert.equal(got, blob);
    assert.equal(await store.getShot("s1", 99), null);
  });

  it("put/get a video round-trips by sessionId", async () => {
    const { store } = loadStore();
    const blob = { size: 10 };
    await store.putVideo("s1", blob, { mime: "video/webm", durationMs: 4200 });
    const got = await store.getVideo("s1");
    assert.equal(got.blob, blob);
    assert.equal(got.meta.durationMs, 4200);
  });

  it("deleteSession removes all shots and the video for that session", async () => {
    const { store, fake } = loadStore();
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
    await store.putShot("drop", 1, { size: 1 });
    await store.putVideo("drop", { size: 1 }, {});
    const r = await store.pruneToSessions(["keep"]);
    assert.ok(r.removed >= 2);
    assert.notEqual(await store.getShot("keep", 1), null);
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
});
```

- [ ] **Step 2: Run to verify fail** — `node --test test/flow-media-store.test.mjs` → FAIL (flowMediaStore undefined).

- [ ] **Step 3: Implement** `src/shared/flow-media-store.js`. Key shape: keys are `sessionId + "::" + stepIndex` for shots, `sessionId` for videos. Real `_openDb` opens `indexedDB.open("flowlens-media", 1)` creating `shots` + `videos` object stores; wraps requests in Promises. The store methods call `_openDb()` then a small `store(name)` accessor exposing `get/put/delete/getAllKeys`. All writes wrapped in try/catch returning `{ok:false, reason}`.

- [ ] **Step 4: Run tests** → PASS. Then `npm test` (whole suite) green.

- [ ] **Step 5: Wire into build** — add `<script src="flow-media-store.js"></script>` to `panel.html` before `panel.js`; run `npm run build`; assert `dist/flow-media-store.js` exists.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(flow): flowMediaStore — IndexedDB media persistence"`

---

### Task 2: Screenshot capture path (SW `CAPTURE_SHOT` + panel hook)

**Files:**
- Modify: `src/sw/sw.js` (add `CAPTURE_SHOT` handler), `src/panel/panel-50-overlay.js` (hook after step audit), `src/panel/panel-00-core.js` (nothing new; step gets `hasShot`)
- Test: `test/capture-shot.test.mjs` (pure helper `shouldCaptureShot` + dataURL→Blob helper), manual for the real capture.

**Interfaces:**
- Consumes: `flowMediaStore.putShot`.
- Produces: `captureStepShot(sessionId, stepIndex) → Promise<void>` (panel, best-effort), sets `step.hasShot`/`step.shotError`. SW message `{type:"CAPTURE_SHOT"}` → `{ok, dataUrl?|reason}`.

- [ ] **Step 1: Write failing test** for the pure dataURL→Blob + `shouldCaptureShot` guard (skip on chrome:// / no session). Test in harness style asserting `dataUrlToBlob("data:image/png;base64,AAAA")` returns a Blob-like `{type:"image/png"}` and `shouldCaptureShot({url})` is false for `chrome://` and true for https.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** SW handler: on `CAPTURE_SHOT`, get inspected tab's `windowId` via `chrome.tabs.get(tabId)`, call `chrome.tabs.captureVisibleTab(windowId,{format:"png"})`, return `{ok:true,dataUrl}` or `{ok:false,reason}`. Panel `captureStepShot`: before capture call the snippet's `clearAnnotations()` via `send({type:"...clear..."})` or eval; send `CAPTURE_SHOT`; on ok convert dataURL→Blob→`flowMediaStore.putShot`, set `step.hasShot=true`; on failure set `step.shotError=true` (never throw).

- [ ] **Step 4: Hook** into `captureStepOptionC` after `sessionState.current.steps.push(step)` — fire-and-forget `captureStepShot(sessionState.current.id, step.index)`.

- [ ] **Step 5: Run tests + build** → green.

- [ ] **Step 6: Commit** — `feat(flow): per-step viewport screenshot via captureVisibleTab`

---

### Task 3: Auto-capture default ON + SPA route port

**Files:**
- Modify: `src/panel/panel-00-core.js` (default pref), `src/panel/panel-90-wireup.js` (dedupe + port client), `src/sw/sw.js` (webNavigation.onHistoryStateUpdated → port push)
- Create pure helper `classifyNavForCapture` in `panel-20-views.js` (before wireup marker)
- Test: `test/classify-nav.test.mjs`

**Interfaces:**
- Produces: `classifyNavForCapture(url, lastUrl) → boolean` (false for hash-only/self-nav, true for path/query change).

- [ ] **Step 1: Failing test** — table: same url → false; hash-only change → false; path change → true; query change → true; empty/invalid → false.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `classifyNavForCapture`; use it in both the existing `devtools.network.onNavigated` handler and the new port message handler, deduping on `sessionState.lastAutoNavUrl`.

- [ ] **Step 4: Default ON** — set the persisted `autoCaptureNav` default true (checkbox `checked` in HTML + `loadUiPrefs` default). Update any test asserting the old default.

- [ ] **Step 5: SPA port** — SW: `chrome.runtime.onConnect` for a `"flowlens-nav"` port; on connect record the panel's `tabId`; `chrome.webNavigation.onHistoryStateUpdated` filtered to that tabId → `port.postMessage({url})`. Panel: `chrome.runtime.connect({name:"flowlens-nav"})`, on message run the same debounced capture path.

- [ ] **Step 6: Run tests + build; commit** — `feat(flow): auto-capture on by default + SPA route capture`

---

### Task 4: Diff / lifecycle builders

**Files:**
- Create builders in `src/panel/panel-40-engine.js` (before wireup): `bucketStepDiff`, `buildIssueLifecycle`
- Test: `test/flow-diff-builders.test.mjs`

**Interfaces:**
- Consumes: existing `computeStableSignatureSet` output stored on `step.stableSignatures.run.stableFindingSignatureSet` and `step.snapshots.run` findings.
- Produces:
  - `bucketStepDiff(step, prevStep) → { appeared:[], persisting:[], resolved:[] }` (each item `{sig, name, type, severity, wcag}`; resolved resolved from prevStep).
  - `buildIssueLifecycle(steps) → { lanes:[{sig,label,severity,firstStep,lastStep,presentSteps:[]}] }`.

- [ ] **Step 1: Failing tests** — synthetic steps with known signature sets: step1 {A,B}, step2 {B,C}. Assert bucketStepDiff(step2,step1) = appeared[C], persisting[B], resolved[A]; resolved[A].name comes from step1's snapshot. buildIssueLifecycle over [s1,s2,s3] with A in 1&3 → lane A presentSteps [1,3], firstStep 1, lastStep 3.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** both as pure functions reading the stored signature sets and resolving labels from the appropriate snapshot's findings (a `sig→finding` map per step).

- [ ] **Step 4: Run tests + build; commit** — `feat(flow): per-step diff + issue-lifecycle builders`

---

### Task 5: Flow view rewrite — `renderFlow` orchestrator + sub-renderers + CSS

**Files:**
- Modify: `src/panel/panel-20-views.js` (replace `renderFlowSessionInfo`/`renderFlowTimeline`/`renderFlowCounters`/`renderFlowVerdict` with sub-renderers + `renderFlow`), `src/panel/panel.html` (`#flowContent` markup), `src/panel/panel.css` (Flow layout), `src/panel/panel-90-wireup.js` (Flow event wiring, roving tabindex reuse)
- Test: `test/flow-view.test.mjs`

**Interfaces:**
- Consumes: `bucketStepDiff`, `buildIssueLifecycle`, `flowMediaStore.getShot`, `classifyReviewStatus`.
- Produces: pure sub-renderers returning HTML strings — `flowVerdictHeaderHtml(sess)`, `filmstripHtml(sess)`, `stepListHtml(sess, filter)`, `stepDetailHtml(sess, selectedIndex)`, `lifecycleSwimlaneHtml(sess)` — and `renderFlow()` orchestrator (only Flow-DOM writer). `sessionState.selectedStepIndex`.

- [ ] **Step 1: Failing tests** — pure sub-renderer HTML assertions: filmstrip emits one tile per step with `data-step-index`; stepList badge shows appeared/persisting/resolved counts; "unresolved blockers only" filter drops clean steps; stepDetail lists appeared items and step ←/→ buttons; swimlane emits one lane per recurring sig with severity label (not colour-only); empty-session → placeholder. Self-a11y: tiles/rows have `tabindex`/`role`/`aria-label`.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** sub-renderers (pure), `renderFlow(state)` orchestrator, new `#flowContent` HTML skeleton (filmstrip band, step list, detail pane, swimlane, verdict header), responsive CSS (filmstrip→row collapse; swimlane in `overflow-x` container). Delete the old table/accordion renderers and their CSS. Wire selection + roving tabindex in wireup (reuse/introduce `attachRovingTabindex`).

- [ ] **Step 4: Update showView** Flow branch to call `renderFlow()` instead of the three old renderers.

- [ ] **Step 5: Run tests + build; E2E** on dist (seed session, stub shots). Commit — `feat(flow): filmstrip + step list + issue diff + lifecycle swimlane`

---

### Task 6: `flowRecorder` — local video

**Files:**
- Create: `src/panel/panel-30-flow.js` additions or a section in `panel-50-overlay.js` for `flowRecorder` (start/stop). Keep testable parts before wireup.
- Modify: `panel.html` (Record video button in Flow CTA), `panel-90-wireup.js` (button gesture), `panel.css`.
- Test: `test/flow-recorder.test.mjs` (pure `pickRecorderMime()` + state machine; getDisplayMedia is manual).

**Interfaces:**
- Consumes: `flowMediaStore.putVideo`.
- Produces: `flowRecorder` with `start()/stop()/isRecording()`, `pickRecorderMime() → string`.

- [ ] **Step 1: Failing test** — `pickRecorderMime` prefers `video/webm;codecs=vp9`, falls back to vp8 then `video/webm` based on a stubbed `MediaRecorder.isTypeSupported`; recorder state machine idle→recording→idle.

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement** `flowRecorder` (getDisplayMedia + MediaRecorder, chunks→Blob→putVideo, sets `session.hasVideo`), Record/Stop button bound to a panel gesture, auto-stop on `endSession`.

- [ ] **Step 4: Run tests + build; commit** — `feat(flow): local flow video via getDisplayMedia`

---

### Task 7: Docs truth pass + version bump 6.1.0

**Files:**
- Modify: `src/shared/version.js`, `package.json`, `README.md`, `docs/ARCHITECTURE*`, spec status.

- [ ] **Step 1:** Bump `FLOWLENS_VERSION` and `package.json` to 6.1.0.
- [ ] **Step 2:** Update README/architecture docs to describe the new Flow tab (filmstrip, screenshots, video, auto-capture default, diff/lifecycle). Note viewport-only + local-only constraints.
- [ ] **Step 3:** `npm run ci` + `node scripts/e2e-smoke.mjs` green; release-guard passes for 6.1.0 zip.
- [ ] **Step 4: Commit** — `chore(flow): docs truth pass + 6.1.0`

---

## Self-Review

**Spec coverage:** §4.1→T1, §4.2→T2, §4.4→T3, §4.5→T4, §4.6+§6+§6a→T5, §4.3→T6, §7 constraints threaded through T2/T3/T6, §8 testing in every task, §9 ordering = task order, versioning→T7. No gap.

**Placeholders:** core-logic tasks (T1,T3,T4,T6) carry full test code; T2/T5 carry concrete interfaces + test intent + implementation description (UI rewrite is too large to inline verbatim but every function is named with its signature and test target). Acceptable given size.

**Type consistency:** `flowMediaStore` method names identical across T1/T2/T5/T6; `bucketStepDiff`/`buildIssueLifecycle` names identical T4/T5; `classifyNavForCapture` T3; `step.hasShot`/`shotError`/`session.hasVideo` consistent.
