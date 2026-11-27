# FlowLens — Session Model

> **Audience:** Maintainers working on Flow capture, signatures, diffs, storage, or session exports.
>
> Code lives in the panel parts under `src/panel/` (capture: `panel-45-capture.js`; persistence, raw appendix, legacy signature bundles: `panel-30-flow.js`; stable signatures, diff and lifecycle builders: `panel-40-engine.js`; exports: `panel-50-overlay.js`). Locate code by symbol name.

---

## Table of Contents

1. [Capture Flow](#1-capture-flow)
2. [Step and ModeSnapshot Schemas](#2-step-and-modesnapshot-schemas)
3. [Signatures](#3-signatures)
4. [Blocking Logic](#4-blocking-logic)
5. [Diff Model](#5-diff-model)
6. [Caps, Compaction, Storage](#6-caps-compaction-storage)
7. [Status Codes](#7-status-codes)
8. [Exports and Determinism Versioning](#8-exports-and-determinism-versioning)
9. [Maintainer Guidelines](#9-maintainer-guidelines)

---

## 1. Capture Flow

A session starts with **Record Flow** (`startSession()`), which captures the current page as the baseline step. Steps are then added by auto-capture (navigation, SPA route change, embedded-frame navigation, DOM-step sentinel) or manually with **Mark step**; **End** (`endSession()`) archives the session.

Each step (`captureStepOptionC()`):

1. Sends one `CAPTURE_STEP` message; the SW runs a baseline `run` audit plus the active mode (if it isn't `run`).
   - Manual capture uses the Snap tab's active mode (`getActiveModeForSessionCapture()`).
   - Auto-capture uses `observe`, switching to `watch` after a step whose observe capture added blocking findings (`getSmartModeForCapture()`).
2. Builds `ModeSnapshot`s for run and active, registers their raw payloads in `session.rawAppendix`.
3. Computes `step.stableSignatures` (`computeStableSignatureSet()`), `step.findingIndex` (`buildFindingIndexForStep()`) and `step.diffs` (`buildStepDiffs()`) against the previous step.
4. Appends the step, prunes the raw appendix, and persists the active session best-effort (failures are warnings; the session continues in memory).

A step is accepted only if the baseline `run` succeeds. Frame-level failures are kept per frame and never abort the step. Screenshots (`CAPTURE_SHOT`) are best-effort and only taken while the inspected tab is the active tab of its window.

Route hint (`deriveStepRouteHint()`), in priority order: Help Center article hint (`hc/<slug>`, when a help-center profile is active) → normalized URL path (volatile ID segments → `_id`, query/hash stripped) → `title:<normalized document.title>` → `"(unknown)"`.

---

## 2. Step and ModeSnapshot Schemas

### Step

| Field | Description |
|-------|-------------|
| `id`, `index` | Step id; `index` is 1-based |
| `label` | User label or `null` |
| `at`, `url`, `routeHint` | Capture time, page URL, derived route hint |
| `activeModeCaptured` | Mode captured alongside the baseline |
| `snapshots.run` / `snapshots.active` | `ModeSnapshot` (active is `null` when the active mode is `run`) |
| `stableSignatures.run` / `.active` | `{ stableFindingSignatureSet, severityCounts, blockingSet, summaryScore }` |
| `findingIndex` | Stable signature → `{ name, type, severity, wcag, confidence }` (run + active) — used by the Flow view's Appeared/Persisting/Resolved lists and the lifecycle swimlane |
| `diffs.run` / `.active` / `.consolidated` | Diff summaries (see §5) |
| `frameSelections` | `{ usedFrameIds, usedFrameKeys }` |
| `profileLabel`, `profileConfidence`, `profileMatchSignals`, `profileSuspect` | Profile match for the best frame |
| `rootSelector`, `rootSelectorNotFound`, `depthMax`, `recipeId`, `transitionStates` | Capture context |
| `hasShot`, `shotError` | Screenshot status (image itself lives in IndexedDB) |

### ModeSnapshot (`toModeSnapshot()`)

| Field | Description |
|-------|-------------|
| `mode` | `run`, `contrast`, `tabWalk`, `watch`, `observe` |
| `best` | `{ frameId, frameKey, frameKeyStable, normalized: { type, blockingCount, summaryScore, primaryCounts }, rawRef }` |
| `perFrame` | Per-frame `{ frameId, frameKey, frameKeyStable, ok, normalized, error, reason }` — no raw payloads |
| `targeting` | `{ scope, pinned, selectionReason, frameKeyVersion, usedFrameIds, … }` |

`best.rawRef` points into `session.rawAppendix`; only the best frame's raw payload per mode per step is kept.

---

## 3. Signatures

### Frame keys (`deriveFrameKey()` in `src/sw/sw.js`)

- `frameKeyStable` = `fk::v1::<origin>::<pathHint>` — identity; `pathHint` is the first two URL path segments with numeric/hex/UUID-like segments normalized to `_id`.
- `frameKey` = `<frameKeyStable>::<markerHash8>` — adds an FNV-1a hash of the profile marker hits (diagnostic).
- `frameId` is used only for runtime targeting. Duplicate `frameKeyStable` values within one capture get an ordinal suffix.

### Stable signatures (diff identity)

`buildStableSignature()` → `<mode>|<type>|<wcag>|<severity>|<locatorHash>`, where `locatorHash` = FNV-1a over `frameKeyStable`, `testId`, `role`, `pathHashForSig(path)` and tag. Text content, labels and marker hashes are excluded. Contrast, Tab Walk and Watch items use `buildStableItemSignature()` with the same shape. These drive step diffs, the Flow view and the lifecycle swimlane.

### Rich signature bundles (Markdown flow summary)

`runSignatureEntries()`, `contrastSignatureEntries()`, `tabWalkSignatureEntries()`, `watchSignatureEntries()` and `findingSignatureEntries("observe", …)` build more descriptive signatures (wcag/level/confidence/severity, `testid:`, `pathh:`, normalized name/note; Observe adds a `trend|peak:|jumps:` entry; Watch adds `focus_loss`). `buildModeSignatureBundle()` / `mergeSignatureBundles()` feed `computeFlowBlockingRollup()`, used only by the Session Markdown "flow summary" and the Flow verdict's systemic-issues line.

### Signature quality (`computeSignatureQuality()`)

| Quality | Meaning |
|---------|---------|
| `high` | Has `testId` or the path contains an id (`#`) |
| `medium` | Has a non-volatile path |
| `low` | Shadow-DOM path with `:nth-of-type` and no strong anchor, or no path — shown as "may be unstable" in Markdown |

Normalization helpers: `normalizeIdentityText()` (strips volatile UUID/number-like tokens), `pathHashForSig()` (hashed normalized path), `bucketNumber()` (numeric bucketing).

---

## 4. Blocking Logic

`isRunFindingBlocking(finding)` is the single predicate (Snap, Flow and CI agree):

| Severity | Confidence | Blocking? |
|----------|-----------|-----------|
| `critical` / `high` | `strict` or `heuristic` | **Yes** |
| `medium` | `strict` | **Yes** |
| `medium` | `heuristic` | No |
| any | `advisory` | No |
| `low` / `info` | any | No |

Other modes: Contrast failures and Watch verdicts are always blocking; Tab Walk events are blocking when their type is in `TAB_BLOCKING_TYPES` (`possible_focus_trap`, `non_dialog_focus_trap`, `roach_motel`, `dialog_focus_not_trapped`, `focus_on_body`, `focus_failed`).

---

## 5. Diff Model

One diff engine: `buildStepDiffs()` compares stable signature sets (`computeStableDiff()`) per mode (`run`, `active`) and consolidated (run + active).

| Field | Description |
|-------|-------------|
| `added` | Signatures present now, absent in the previous step |
| `fixed` | Signatures present in the previous step, absent now |
| `persisting` | Present in both |
| `blockingAdded` / `blockingFixed` | Blocking subset of added / fixed |
| `countsDelta` | Per-severity count change |
| `text` | Human-readable summary |

The first step is a baseline: its blocking deltas are zeroed, so a one-step flow can pass. The Flow view's Appeared / Persisting / Resolved lists come from `bucketStepDiff()` over `step.findingIndex` (same identity), and `buildIssueLifecycle()` builds the swimlane.

Sessions saved before stable signatures are migrated on load (`normalizeLoadedSession()` → `migrateStepStableSignatures()`); without raw data the step is marked `stepQuality.degraded`.

---

## 6. Caps, Compaction, Storage

| Cap | Value | Enforcement |
|-----|-------|-------------|
| `MAX_STEPS` | 100 | Mark step refuses further steps (`session:limit`) |
| `MAX_RAW_APPENDIX_ENTRIES` | 200 | Raw appendix cap; older steps' raw refs are dropped first, keeping the most recent `RAW_SOFT_COMPACT_KEEP_RECENT` (30) |
| `MAX_SESSION_BYTES_ESTIMATE` | 4.5 MB | Warning only |
| `CAPTURE_SLOW_MS` | 4000 ms | Capture shown as slow |

When the appendix is still full, new steps keep normalized data only (`raw:capped`); diffs and exports continue. Per-mode raw caps (`compactRawForSession()`): run 220 findings; contrast 120 failures + 40 samples; Tab Walk 200 events/stops; Watch 200 events + 80 verdicts; Observe 220 findings + 140 snapshots.

Storage (`chrome.storage.local`):

| Key | Contents |
|-----|----------|
| `session::active::<origin>::<env>` | The recording session (resume prompt on reopen) |
| `session::archive::<origin>::<env>::<sessionId>` | Ended sessions |
| `session::archiveIndex` | `[{ key, id, startedAt, steps }]`, newest first — the archive listing (no `storage.get(null)`). Max 30 archived sessions; older ones are evicted |

Screenshots and video live in IndexedDB (`flowlens-media`, `src/shared/flow-media-store.js`); media is kept only for the newest 5 archived sessions.

---

## 7. Status Codes

The Flow status line shows `OK`, `PARTIAL/<code>` (baseline recorded, something degraded) or `FAILED/<code>` (step not recorded). Codes (`MARK_REASON_DETAILS`): `baseline:parse`, `baseline:ok:false`, `baseline:no_scope_match`, `baseline:transport`, `active:ok:false`, `active:no_scope_match`, `active:parse`, `active:transport`, `persist:quota`, `persist:error`, `raw:capped`, `session:limit`.

---

## 8. Exports and Determinism Versioning

- **Session JSON** — `compactSessionForExport()` + `determinismMeta` (`buildDeterminismMeta()`): versions, `totalSteps`, `perStepFrameKeys` (count + hash per step), `shadowCoverageSummary`, `warnings[]` (e.g. missing `usedFrameKeys`, `frameKeyVersion` mismatch). `runConfigSummary.rulePack` is always `null` (rule packs were removed; the field is kept).
- **Session Markdown** — `buildSessionMarkdown()`: metadata, flow summary (top 24 blocking signatures from `computeFlowBlockingRollup()`, sorted blockingWeight desc → signature quality desc → occurrences desc → first seen step asc → signature), per-step diffs and targeting, frame appendix.
- **Session JUnit XML**, **Diff Report JSON**, **Screenshots (.zip)** — from the export menu.

Versions are stamped by the SW (`src/sw/sw.js`):

| Field | Current | Bump when |
|-------|---------|-----------|
| `schemaVersion` | 4 | Persisted session shape changes (field removed/moved) |
| `signatureVersion` | 2 | Signature construction changes |
| `frameKeyVersion` | 1 | `deriveFrameKey()` changes |

---

## 9. Maintainer Guidelines

- Signatures must be deterministic: use `normalizeIdentityText()`, `pathHashForSig()` and `bucketNumber()`; never raw text, raw paths or timestamps. Bump `signatureVersion` after any change.
- Keep one diff engine: capture and `deleteStep()` both diff via `buildStepDiffs()` over `step.stableSignatures` (computed with `computeStableSignatureSet()` before the diff).
- Session JSON: add fields with defaults; bump `schemaVersion` if you remove or move a field.
- Markdown exports: append new sections/lines; keep the flow-summary sort order.
- Fixture check for signature stability: in `fixtures/a11y-rule-fixtures.html`, `#insertSigSibling` inserts a sibling between steps; the strong-id control (`data-testid="sig-strong-control"`) must persist across steps, while the weak control (`#sigStableWeak`) may churn.
