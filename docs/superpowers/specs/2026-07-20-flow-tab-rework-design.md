# Flow tab rework — design spec

**Date:** 2026-07-20
**Status:** reviewed (code-verified) — pending final user sign-off
**Reviewed:** 2026-07-20 — assumptions checked against source; corrections folded
into §4.1, §4.2, §4.4, §4.5, §6a. See "Review log" at the end.
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
- **Deletion wiring (verified gap):** `deleteSession` must be called from the
  existing "Delete run" and "Delete all runs" handlers (`panel-20-views.js:465,
  491`) and when a session is replaced — otherwise media orphans accumulate in
  IndexedDB independent of the record store. Prune is the backstop, not the
  primary cleanup.
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
- **Overlay hygiene (verified gap):** the audit snippet injects a tab-stop /
  highlight overlay (`__flowlens_annotations__`, lives up to 30 s) and finding
  highlights. Before `captureVisibleTab`, the panel MUST call the snippet's
  exported `clearAnnotations()` (and clear any active highlight) so the
  screenshot shows the real page, not FlowLens's own green badges.
- **Rate limit:** `captureVisibleTab` is quota-limited per second. Auto-capture
  is debounced (≥500 ms) so it won't hit it; rapid manual marking might — the
  best-effort path handles a throttled failure as a placeholder tile.
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

### 4.4 Auto-capture trigger (corrected after code review)
**Existing mechanism (verified):** auto-capture is driven **panel-side** by
`chrome.devtools.network.onNavigated` (`panel-90-wireup.js:1027`) with a
debounce, gated on the `autoCaptureNav` checkbox — NOT by a SW `webNavigation`
listener. SW↔panel today is request/response (`chrome.runtime.onMessage`); there
is **no long-lived port** to push events to a specific DevTools panel.

Plan:
- Flip `autoCaptureNav` (persisted UI pref) to **default ON**.
- `devtools.network.onNavigated` reliably catches full navigations but is
  **unreliable for pure History-API route changes** (pushState without a network
  load). To cover SPA routes we add a SW listener on
  `webNavigation.onHistoryStateUpdated` filtered to the inspected `tabId`, which
  **pushes an event to the panel over a NEW `runtime.connect` port** (new
  plumbing — costed into the plan, previously under-scoped).
- Panel **dedupes** the two sources by last-captured URL so a full navigation
  isn't counted twice (onNavigated + onHistoryStateUpdated can both fire).
- `classifyNavForCapture(url, lastUrl)` (pure, unit-tested) decides a real step:
  ignore hash-only changes and self-navigation, accept path/query changes.
- The "Auto" toggle stays as explicit opt-out; "Mark step" stays for manual
  insertion.

### 4.5 Diff / lifecycle data builders (new, pure — verified against data model)
The step object **already stores everything needed** (verified in
`captureStepOptionC`, `panel-50-overlay.js`): `step.snapshots.run` (full
normalized findings), `step.stableSignatures.run` (from the existing
`computeStableSignatureSet` → `stableFindingSignatureSet`), and `step.diffs`
(from the existing `buildStepDiffs`). No engine change; these builders wrap
existing machinery.
- `bucketStepDiff(step, prevStep) → { appeared[], persisting[], resolved[] }` —
  diffs the two steps' `stableSignatures.run` sets for identity. **Resolved
  findings (present in prev, gone in current) must be resolved to human-readable
  form from `prevStep`'s snapshot**, not the current one — the current step no
  longer contains them. Appeared/persisting resolve from the current snapshot.
- `buildIssueLifecycle(steps) → { lanes: [{ sig, label, severity, firstStep,
  lastStep, presentSteps[] }] }` — one lane per recurring signature across the
  flow, built from each step's `stableSignatures`.
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

## 6a. Self-accessibility (dogfooding — added after review)

FlowLens is an accessibility tool; its own new Flow UI must pass the bar it
enforces. Non-negotiable for the rewrite:
- **Filmstrip** tiles are a keyboard-navigable list (arrow keys, roving
  tabindex — reuse the `attachRovingTabindex` helper the tab bars will share),
  each tile labelled with step number + issue summary.
- **Step list** rows are focusable and operable by Enter/Space; selection is
  announced (`aria-selected` on an `aria-live` detail region).
- **Lifecycle swimlane** is not colour-only: each lane carries a text label and
  the severity is conveyed by label, not just hue.
- **Step ←/→ nav** is real buttons with labels, not click-only handlers.
- Detail pane updates announce via a polite live region so the change is
  perceivable without sight.
This is verified in the E2E pass (focus order, roles, labels), not just eyeballed.

## 7. Constraints & risks (surfaced to the user)

- **Viewport-only screenshots.** `captureVisibleTab` captures the visible
  viewport of the frontmost tab, not the full page. Full-page needs the debugger
  protocol, which conflicts with open DevTools. Accepted.
- **Frontmost requirement.** If the inspected tab isn't frontmost at capture
  time, the shot fails → placeholder tile, step still records.
- **Video picker per recording.** `getDisplayMedia` prompts the user to pick the
  tab once per recording. Accepted as the no-permission tradeoff. It also
  requires transient user activation **and the panel to be focused** — if focus
  is in the inspected page the call can reject; the Record button handler must
  run in the panel's own gesture. Manual-verify item.
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

## 11. Review log (2026-07-20, code-verified)

Findings from reviewing the design against the actual source, with resolutions:

| # | Severity | Finding | Resolution |
|---|---|---|---|
| A | HIGH | Auto-capture trigger was mis-described. Real source is panel-side `devtools.network.onNavigated`, not SW `webNavigation`. SW↔panel is request/response — no port exists to push SPA nav events. | §4.4 rewritten: default the panel listener ON; add SW `onHistoryStateUpdated` over a **new `runtime.connect` port** (extra plumbing, now costed), deduped against onNavigated. |
| B | HIGH (favourable) | Verified the step object retains full per-finding data (`snapshots`, `stableSignatures`, `diffs`) — a real finding-level Appeared/Persisting/Resolved diff IS possible, not just counts. | §4.5 confirmed; builders wrap existing `computeStableSignatureSet`/`buildStepDiffs`. |
| C | MED | Resolved findings can't be read from the current step (they're gone). | §4.5: resolve RESOLVED items from `prevStep`'s snapshot. |
| D | MED | Spec ignored the Flow UI's OWN accessibility — unacceptable for an a11y tool. | New §6a: keyboard nav, roles/labels, non-colour-only swimlane, live-region detail; verified in E2E. |
| E | MED | Media deletion not wired to existing delete-run / delete-all / session-replace — orphans accumulate. | §4.1: call `deleteSession` from those handlers; prune is only the backstop. |
| F | LOW-MED | `captureVisibleTab` per-second quota under rapid manual marking. | §4.2: debounce covers auto; best-effort placeholder covers throttled failure. |
| G | MED | Screenshot could capture FlowLens's own tab-stop/highlight overlay. | §4.2: call snippet `clearAnnotations()` + clear highlight before capture. |
| H | LOW | `getDisplayMedia` needs panel focus + transient activation. | §7: run from the panel's own Record-button gesture; manual-verify. |
| I | LOW | IndexedDB absent in the node:vm test harness. | §4.1 `_openDb()` seam + hand-rolled in-memory fake (keeps zero runtime deps). |

Net: design is sound and the hardest risk (finding-level diff) is de-risked by
existing data. The one real scope increase is the SW→panel port for SPA route
capture (finding A).
