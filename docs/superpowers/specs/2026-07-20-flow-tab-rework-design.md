# Flow tab rework — design spec

**Date:** 2026-07-20
**Status:** approved (design direction) — pending spec review
**Version target:** FlowLens 6.1.0 (minor: new user-facing capability, no breaking data change)

## 1. Problem

The Flow tab is FlowLens's flagship feature — it records a11y audit snapshots
across the steps of a user flow (checkout, wizard, chat) and is meant to show
issues appearing and disappearing across steps. Today it works badly:

- The timeline is a dense 7-column table (`_buildTimelineRowHtml`,
  `panel-20-views.js`) that is unreadable at 20–30 steps.
- Step capture is opt-in (`autoCaptureNav` defaults OFF); the flagship "walk a
  flow and watch a11y change" story requires manual clicks.
- Session info, counters and verdict are scattered across accordions; the
  information is noisy and not responsive.
- There is no per-step visual — you cannot see what the page looked like at
  each step.

## 2. Goals / non-goals

**Goals**
- Auto-capture a step by default as the user walks the flow; manual "Mark step"
  becomes the exception, not the norm.
- A readable, responsive layout that stays legible at 20–30 steps.
- A per-step screenshot (filmstrip) captured locally.
- Optional local video recording of the whole flow.
- A first-class per-step **issue diff** (Appeared / Persisting / Resolved) and a
  cross-flow **issue-lifecycle** view — the two things competitors lack.
- Everything local. No new Chrome permissions. No Web Store re-review trigger.

**Non-goals**
- Full-page screenshots (viewport only — see Constraints).
- Cloud sync / sharing of media.
- Changing the audit engine, stable-signature format, or CI/diff contracts.
- Cross-browser (Chromium/DevTools only, as today).

## 3. Decisions (confirmed with Piotr, 2026-07-20)

| Decision | Choice |
|---|---|
| Scope | All at once — one spec covering redesign + screenshots + video. |
| Screenshots | Yes, early. `chrome.tabs.captureVisibleTab` (viewport), Blobs in IndexedDB. |
| Video | `getDisplayMedia` + `MediaRecorder` → webm. No new permission; one picker per recording. |
| Auto-capture trigger | Navigation **+ SPA route change** (`webNavigation.onHistoryStateUpdated`). |

`tabCapture` and full-page (`chrome.debugger` / `Page.captureScreenshot`) were
rejected: the former adds a permission + Web Store review; the latter conflicts
with an open DevTools session (single protocol client).

## 4. Architecture — units and boundaries

The rework is decomposed into isolated units, each with one purpose, a defined
interface, and independent tests. The overriding principle carried over from the
recent section-view / results-shell work: **one orchestrator is the single
writer for the Flow view** — nothing else mutates Flow DOM directly.

### 4.1 `flowMediaStore` (new) — IndexedDB media persistence
Separate from `chrome.storage.local` (which stays for records/session JSON and
would blow its ~10 MB quota on images). Screenshots and video are large binary
blobs; IndexedDB is the correct local store.

```
DB: "flowlens-media" (v1)
  store "shots"  — key `${sessionId}:${stepIndex}` → { blob, w, h, at }
  store "videos" — key `${sessionId}`             → { blob, mime, durationMs, at }
```

Interface (all async, Promise-based):
- `putShot(sessionId, stepIndex, blob, dims)`
- `getShot(sessionId, stepIndex) → Blob | null`
- `putVideo(sessionId, blob, meta)` / `getVideo(sessionId) → {blob,meta} | null`
- `deleteSession(sessionId)` — removes all shots + video for a session
- `pruneToSessions(keepSessionIds[])` — bounds disk; called on session end,
  keeps media only for the most recent N sessions (N=5) that still exist in the
  record store.
- `objectUrlForShot(sessionId, stepIndex)` — convenience returning a cached
  `URL.createObjectURL` (revoked on re-render) for `<img src>`.

Dependencies: `indexedDB` only. Testable via a thin `_openDb()` seam that tests
replace with an in-memory fake.

**Fail-loud:** every write returns a status; a failed `putShot` marks the step
`shotError = true` (filmstrip shows a "no image" tile) rather than silently
losing the shot.

### 4.2 Screenshot capture path
- Panel, inside `captureStepOptionC` after a successful audit, sends
  `{ type: "CAPTURE_SHOT", tabId }` to the SW.
- SW resolves the inspected tab's `windowId` and calls
  `chrome.tabs.captureVisibleTab(windowId, { format: "png" })`, returns the
  dataURL (or `{ok:false, reason}` if the tab isn't capturable — e.g. not
  frontmost, or a `chrome://` page).
- Panel converts dataURL → Blob, writes `flowMediaStore.putShot(...)`, sets
  `step.hasShot = true`.
- Capture is **best-effort and non-blocking**: a shot failure never fails the
  step audit; the step still records, filmstrip shows a placeholder tile.

Host permissions (`http://*/*`, `https://*/*`) already cover
`captureVisibleTab`; no manifest change.

### 4.3 `flowRecorder` (new) — local video
- Panel module. `start()` calls `navigator.mediaDevices.getDisplayMedia({video:true})`,
  wires a `MediaRecorder` (webm/vp9 or vp8 fallback), buffers chunks.
- `stop()` finalizes the Blob, writes `flowMediaStore.putVideo(sessionId, blob, meta)`,
  sets `session.hasVideo = true`, and offers a download.
- Recording is session-scoped and independent of step capture: the user starts
  it when they start the flow and stops it at the end (or it auto-stops on
  `endSession`). If the user cancels the picker, recording simply doesn't start
  (toast, no error state).
- Requires a user gesture — bound to a "Record video" button in the Flow CTA.

### 4.4 Auto-capture trigger (change to existing wiring)
- `state.autoCaptureNav` (or the persisted UI pref) **defaults ON**.
- The existing `webNavigation.onCommitted`-driven debounce is extended to also
  fire on **`webNavigation.onHistoryStateUpdated`** (SPA route change via the
  History API) for the inspected tab, same debounce.
- A small `classifyNavForCapture(details, lastUrl)` helper decides whether a nav
  event is a real step (URL/path changed, not a hash-only or self-nav) — pure
  and unit-tested to keep noise down.
- The "Auto" toggle remains as an explicit opt-out; "Mark step" stays for manual
  insertion.

### 4.5 Diff / lifecycle data builders (new, pure)
Reuse the existing per-step stable signatures already stored on each step
(`step.diffs`, `stableFindingSignatureSet`). No engine change.
- `bucketStepDiff(step, prevStep) → { appeared[], persisting[], resolved[] }` —
  finding-level buckets for the detail pane.
- `buildIssueLifecycle(steps) → { lanes: [{ sig, label, severity, firstStep,
  lastStep, presentSteps[] }] }` — one lane per recurring issue across the flow.
Both pure, deterministic, table-tested.

### 4.6 Flow view (rewrite) — `renderFlow(state)` orchestrator
Replaces `renderFlowSessionInfo` + `renderFlowTimeline` (table) +
`renderFlowCounters` + `renderFlowVerdict` accordions with one orchestrator that
composes pure sub-renderers, each returning HTML for its region:
- `renderFlowVerdictHeader(sess)` — consolidated: total issues, worst step,
  regression count, PASS/FAIL badge.
- `renderFilmstrip(sess)` — per-step thumbnail tiles (object URLs from
  `flowMediaStore`), status color, hover-magnify, click selects step.
- `renderStepList(sess, filter)` — clean rows (not a table): index, route,
  new/persisting/resolved badges, thumbnail; "only steps with unresolved
  blockers" filter.
- `renderStepDetail(sess, selectedIndex)` — the diff (Appeared/Persisting/
  Resolved), the screenshot, findings, step ←/→ nav.
- `renderLifecycleSwimlane(sess)` — issue lanes across steps, grouped by
  severity.
Selection state: `sessionState.selectedStepIndex`. The orchestrator is the only
function that writes Flow DOM; sub-renderers are pure string builders (testable
without the DOM).

## 5. Data model additions

Additive only — old sessions/records still load (missing fields treated as
absent, same pattern as the `stops` addition in v10):
- `step.hasShot: boolean` — a screenshot exists in the media store for this step.
- `step.shotError?: boolean` — capture was attempted and failed.
- `session.hasVideo: boolean` — a video exists in the media store.
Media blobs themselves live only in IndexedDB, keyed by `(sessionId, stepIndex)`
/ `(sessionId)` — no blob is ever placed in `chrome.storage.local`.

## 6. Layout & responsiveness

Desktop (wide panel): three regions — filmstrip band on top, step list left,
detail pane right; swimlane below the filmstrip. Narrow panel: filmstrip
collapses into the step list (thumbnail per row), detail pane stacks under the
list, swimlane becomes horizontally scrollable inside its own container (never
the page body). Uses the existing token system; new CSS lives beside the current
`#flowContent` block.

## 7. Constraints & risks (surfaced to the user)

- **Viewport-only screenshots.** `captureVisibleTab` captures the visible
  viewport of the frontmost tab, not the full page. Full-page needs the debugger
  protocol, which conflicts with open DevTools. Accepted.
- **Frontmost requirement.** If the inspected tab isn't frontmost at capture
  time, the shot fails → placeholder tile, step still records.
- **Video picker per recording.** `getDisplayMedia` prompts the user to pick the
  tab once per recording. Accepted as the no-permission tradeoff.
- **IndexedDB is async.** The panel renders filmstrip/detail with a loading
  state and fills images as object URLs resolve; object URLs are revoked on
  re-render to avoid leaks.
- **Disk growth.** Media is pruned to the most recent 5 sessions on session end.

## 8. Testing strategy

- **Unit (node:test + harness):**
  - `flowMediaStore` against an in-memory IndexedDB fake — put/get/delete/prune,
    and the fail-loud `shotError` path.
  - `bucketStepDiff` / `buildIssueLifecycle` — table tests over synthetic steps
    (appeared/persisting/resolved correctness; lane spans).
  - `classifyNavForCapture` — hash-only/self-nav ignored, path change accepted.
  - Flow sub-renderers — pure HTML assertions (badges, filter, empty states),
    following `section-view-core.test.mjs` style.
- **E2E (Playwright on `dist/panel.html`):** seed a multi-step session, stub
  screenshots as tiny data URLs, assert: filmstrip tiles render, step selection
  drives the detail pane, the diff buckets match, the swimlane lanes span the
  right steps, responsive collapse at narrow width, auto-capture default ON.
- **Manual:** real `captureVisibleTab` + real `getDisplayMedia` on a live SPA
  flow (screenshots and video are gesture/permission-bound and can't run headless).
- Full `npm run ci` gate (tests + build + package audit + vendor audits +
  release guard) and `e2e-smoke` must stay green.

## 9. Implementation ordering (single spec, staged commits)

Even as one spec, land in reviewable slices, each green on its own:
1. `flowMediaStore` + tests (no UI yet).
2. Screenshot capture path (SW `CAPTURE_SHOT` + panel hook) writing to the store.
3. Auto-capture default ON + SPA trigger + `classifyNavForCapture`.
4. Diff/lifecycle builders + tests.
5. Flow view rewrite (`renderFlow` orchestrator + sub-renderers + CSS) consuming
   all of the above; delete the old table/accordion renderers.
6. `flowRecorder` video + CTA.
7. Docs truth pass + version bump to 6.1.0.

## 10. Resolved defaults (override at review if desired)

- **Swimlane density:** cap to the top ~12 recurring issues, ranked by severity
  then frequency, with a "show all N" expander. Keeps the swimlane legible on
  noisy flows without hiding data.
- **Video retention:** persisted in the media store under the same 5-session
  prune, with an explicit download button. (Not download-only — persistence lets
  the video replay alongside the step timeline in a reopened session.)
- **Screenshot format:** PNG. Larger than JPEG but lossless for text/contrast
  inspection, which is the point of an a11y screenshot; the 5-session prune
  bounds disk.
