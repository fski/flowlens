# FlowLens — Architecture

> **Audience:** Maintainers, contributors, anyone needing to understand data flow and system internals. Code is referenced by file and symbol; use grep to locate it.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Build and Module Inventory](#2-build-and-module-inventory)
3. [Message Contracts](#3-message-contracts)
4. [Frame Targeting and Scoring](#4-frame-targeting-and-scoring)
5. [Profiles](#5-profiles)
6. [Snap State](#6-snap-state)
7. [Persistence Model](#7-persistence-model)
8. [Export Contracts](#8-export-contracts)
9. [Env Isolation](#9-env-isolation)
10. [Determinism Metadata](#10-determinism-metadata)
11. [Evidence and Debug Surfaces](#11-evidence-and-debug-surfaces)

---

## 1. High-Level Architecture

```
┌─────────────────────┐   chrome.runtime        ┌──────────────────────┐
│   Panel (DevTools)  │  ── sendMessage ──────▶ │   Service Worker     │
│   panel.html / .js  │  ◀─ sendResponse ─────  │   sw.js              │
│   panel.css         │  ◀─ "flowlens-nav" port │                      │
└─────────────────────┘                         └──────────┬───────────┘
                                                           │ chrome.scripting
                                                           │ .executeScript
                                                ┌──────────▼───────────┐
                                                │  Audit Snippet       │
                                                │  a11y-audit-snippet  │
                                                │  (MAIN world)        │
                                                └──────────────────────┘
```

**Data flow:**
1. The user runs a mode in the Snap tab or records a flow in the Flow tab.
2. The panel sends `RUN_AUDIT` or `CAPTURE_STEP` to the service worker.
3. The SW resolves target frames (scope + scoring + pin), injects the snippet into each target frame in the `MAIN` world, and runs the action (frames run concurrently, except Tab Walk, which moves real focus and runs sequentially). One audit per tab at a time (`acquireAuditLock()`).
4. The SW normalizes results (`normalizeAuditResult()`), picks the best entry (`chooseBestEntry()`), runs the cross-frame C4 evaluators when several frames were audited, and responds.
5. The panel renders virtualized tables and persists results to `chrome.storage.local`.

---

## 2. Build and Module Inventory

`npm run build` (`scripts/build.mjs`) writes the loadable extension to `dist/`:

- **Panel**: the ordered parts listed in `src/panel/panel.parts.json` are concatenated into one classic script, `dist/panel.js` (shared global scope).
- **SW and snippet**: `src/sw/sw.js` and `src/snippet/a11y-audit-snippet.js` are ES modules that import the shared state-transition engine (`src/engine/stateTransitionEngine.js`). esbuild bundles each into a single file (`dist/sw.js`, `dist/a11y-audit-snippet.js`); the engine is not shipped as a separate file. esbuild is a hard build requirement (devDependency) — it also injects the version via `define`.
- **Shared scripts** (`src/shared/*.js`, `src/engine/depth3Aggregates.js`, `src/engine/ciExporter.js`) are copied as classic scripts and loaded by `panel.html`.
- `--dev` builds unminified with sourcemaps. `HOST_CONFIG` selects a HostConfig (see README → Build Variants).

| File | Role |
|------|------|
| `src/manifest/manifest.base.json` | MV3 config: permissions `scripting`, `webNavigation`, `storage`; `host_permissions: <all_urls>` (required by `captureVisibleTab`); SW; devtools page |
| `src/devtools/` | Registers the DevTools panel |
| `src/panel/panel.html` | Three top tabs (Snap / Flow / Settings), Snap mode sub-tabs, severity filters, findings tables, bottom sheets |
| `src/panel/panel-00-core.js` | `els`, `state`, derived Snap state, `MODES` registry, constants, HostConfig, profiles, recipes, sorting |
| `src/panel/panel-10-tables.js` | Virtualized tables, storage wrappers (`storageGet`/`storageSet`/`storageRemove`), `updateUiPrefs`, `detectEnv`, `_lockedPreset` |
| `src/panel/panel-20-views.js` | View routing, results shell, nav classification, severity filters, record persistence, Flow view builders |
| `src/panel/panel-30-flow.js` | Step labels/delete, session persistence and archive index, session comparison, raw appendix, signature bundles, step diffs |
| `src/panel/panel-40-engine.js` | Review status, export sort, JUnit, shadow coverage, stable signatures, Flow diff/lifecycle builders |
| `src/panel/panel-45-capture.js` | Session lifecycle: `startSession`, `endSession`, `captureStepOptionC` |
| `src/panel/panel-50-overlay.js` | Highlight, determinism metadata, session exports, fix suggestions, finding filters/rerender, video recorder |
| `src/panel/panel-60-export.js` | Settings restore, profile pills, diagnostics, WCAG coverage, CI report |
| `src/panel/panel-90-wireup.js` | Event wiring, keyboard handling (excluded from the test harness) |
| `src/sw/sw.js` | Message validation, frame scope resolution and scoring, injection, normalization, frame keys, screenshots, DOM fingerprint probe, nav port |
| `src/snippet/a11y-audit-snippet.js` | Audit engine (`window.A11YFlowAudit`): `run`, `observe`, `watch`, `tabWalk`, `contrastScan` |
| `src/engine/stateTransitionEngine.js` | C1–C4 evaluators and transition-state helpers (ES module, bundled into SW + snippet) |
| `src/engine/depth3Aggregates.js`, `ciExporter.js` | Depth 3 aggregates; CI JSON report builder/validator |
| `src/shared/` | `version.js`, `limits.js`, `flow-profiles.js`, `wcag-coverage.js` (`RULE_TO_WCAG`), `en301549-map.js`, `flow-media-store.js` (IndexedDB media) |

---

## 3. Message Contracts

The SW accepts only messages from the extension itself (`sender.id === chrome.runtime.id`) whose `type` is in `MESSAGE_TYPES`; `validateIncomingMessage()` checks every field (e.g. `tabId` must be a non-negative integer; `action` must be one of `run`/`observe`/`watch`/`tabWalk`/`contrast`; `wcagLevel` one of `2.1-AA`, `2.1-AAA`, `2.2-AA`, `2.2-AAA`). Rejections return `{ ok: false, error }` (`UNAUTHORIZED_SENDER`, `BAD_MESSAGE_SCHEMA`, `UNKNOWN_MESSAGE`, `BAD_TAB_ID`, …).

| Type | Purpose | Key fields |
|------|---------|------------|
| `LIST_FRAMES` | List the tab's frames (`webNavigation.getAllFrames`) | `tabId` |
| `RUN_AUDIT` | Run one mode | `tabId`, `action`, `target` (`scope`, `frameIds`, `pinned`, …), `wcagLevel`, `match`, `modeHints`, `appMarkers`, `rootSelector`, `alsoConsole` |
| `CAPTURE_STEP` | Flow step: baseline `run` + active mode | as `RUN_AUDIT` plus `activeMode` |
| `HIGHLIGHT` | Highlight a finding's element | `tabId`, `frameId`, `finding` |
| `CAPTURE_SHOT` | Viewport screenshot for a Flow step; clears FlowLens overlays first; optional crop rect for an embedded frame | `tabId`, `cropFrameUrl` |
| `PROBE_DOM_FINGERPRINT` | Read-only screen fingerprint (isolated world) for the DOM-step sentinel | `tabId`, `frameIds` (≤ 50) |

The panel always sends `target.scope`; an unknown scope falls back to `primary`.

Audit responses: `{ ok, action, usedFrameIds, perFrame, bestEntry, bestFrameProbe, selectionReason, scope, schemaVersion, signatureVersion, frameKeyVersion, excludedFrameCount, rootSelectorMatchedFrameIds }`. If every frame failed, `ok: false` with `PAGE_NOT_SCRIPTABLE`, `AUDIT_TIMED_OUT` or `AUDIT_FAILED`. `CAPTURE_SHOT` fails with `inspected-tab-not-visible` unless the inspected tab is the active tab of its window.

**Nav port**: the panel opens a `flowlens-nav` port and sends its `tabId`; the SW forwards `SPA_NAV` (top-frame History API / fragment changes) and `FRAME_NAV` (subframe navigations) for Flow auto-capture.

**Snippet console gate**: before each run the SW sets `window.__A11YFLOW_CONSOLE__` from the panel's "Log to console" setting; when `false` the snippet writes nothing to the page console.

---

## 4. Frame Targeting and Scoring

### Scopes (`FRAME_SCOPE`, `normalizeTargetScope()`)

| Scope | Behavior |
|-------|----------|
| `primary` (default) | Exactly one frame, the best-scoring one (falls back to the top frame) |
| `host` | Top-level document only (`frameId 0`) |
| `embedded` | One iframe: the pinned/selected one, else the best-scoring iframe |
| `all` | Host + all iframes |

Pinned/selected frames are a strict override (`hasManualOverride()`): every pinned frame must still exist, otherwise the run fails with `MANUAL_FRAMES_MISSING` instead of silently auditing something else.

### Scoring (`computeFrameScores()`)

| Signal | Points |
|--------|--------|
| URL matches a `urlExcludesAny` entry | score forced to 0 (frame excluded) |
| Each `urlIncludes` match | +5 |
| DOM selector match (`domSelectorsAny`) | +10; when selectors are given and none match, score is forced to 0 |
| Frame area (relative to the largest frame) | +0…+3, only for frames that already scored |
| Subframe tie-break | +1, only for frames that already scored (an unrelated ad iframe no longer beats the top document) |

Ties break by lower `frameId`. `selectionReason` explains the result (e.g. `scope_primary_scored_best`, `scope_primary_fallback_top`, `scope_embedded_manual_override`, `manual_frame_missing`, `no_scope_match_embedded_missing`).

After the audit, `chooseBestEntry()` picks the best result among the audited frames: manual frames first; otherwise highest `summaryScore` (then blocking count); with all scores 0, probe heuristics (chat, marker hits, help root, article, non-shell); else the top frame.

### Pin

**Pin** (Settings → Targeting) stores the selected frame per origin in `pinnedFrames`; it survives SPA navigation and reloads.

### Frame keys

`deriveFrameKey()`: `frameKeyStable = fk::v1::<origin>::<pathHint>` (identity, used by signatures) and `frameKey = <frameKeyStable>::<markerHash8>` (adds a hash of marker hits). Colliding stable keys within one audit get a `::dupN` suffix. See [SESSION_MODEL.md](./SESSION_MODEL.md#3-signatures).

---

## 5. Profiles

Built-in profiles are defined in `src/shared/flow-profiles.js` (`GENERIC_PROFILES`) — vendor-agnostic: targeting uses ARIA roles and semantic elements only (`urlIncludes` is empty). Vendor selectors belong in a private HostConfig build.

Runtime state is `profileState` (`panel-00-core.js`); pills are rendered by `renderProfileSelect()` in Settings. Storage: `activeProfiles` (active ids) and `customProfiles` (user-defined profiles). Recipes (`RECIPES`: Auto, Chat Widget, Help Center, Hybrid, Wizard / Form) preset frame scope, depth, active mode and a profile allowlist.

---

## 6. Snap State

The current scope's records (`state.records`, newest first, loaded per `records::<origin>::<env>`) are the single source of truth for the Snap tab. Everything else is derived on demand (`panel-00-core.js`):

- `hasRunMode(mode)` — whether any record for that mode exists in the scope.
- `rawFindingsForMode(mode)` — unfiltered findings of the record shown for Run/Observe: the one the user picked in **Past runs** (`state.selectedByMode[mode]`, ignored if not in the scope), else the newest.
- `currentFindings()` — those findings filtered by the Depth setting, for the active run-like mode (Run or Observe). Severity, search, review and integrity-group filters are applied at render time.

`state.restoringScope` is true between a navigation and the new scope's records being loaded, so the UI doesn't flash an empty state or stale results.

Presets: the empty state offers **Quick scan** (`_lockedPreset(["run", "contrast"])`) and **Deep audit** (`_lockedPreset(["watch", "observe", "run"])`); `_lockedPreset` runs modes sequentially with the UI locked.

---

## 7. Persistence Model

Storage goes through `storageGet`/`storageSet`/`storageRemove` (`chrome.storage.local`, `localStorage` fallback). Flow media lives in IndexedDB (`flowlens-media`), never in `chrome.storage.local`.

| Key | Contents | Retention |
|-----|----------|-----------|
| `records::<origin>::<env>` | Up to 20 compacted Snap results | `persistRecords()` retries with progressively more compact payloads when a write fails (20→15→10→8→5 records, shrinking row/string caps); a failed save shows a toast |
| `records::index` | `{ scopeKey: lastWrite }` | At most 25 record scopes; the least recently written are deleted |
| `session::active::<origin>::<env>` | Recording session | Moved to the archive on End |
| `session::archive::<origin>::<env>::<id>` | Ended session | Evicted via the index |
| `session::archiveIndex` | `[{ key, id, startedAt, steps }]`, newest first | At most 30 archived sessions; screenshots/video kept for the newest 5. Archives are listed from this index, never with `storage.get(null)` (one-time migration excepted) |
| `pinnedFrames` | `{ [origin]: { frameId } }` | Until unpinned |
| `uiPrefs` | `wcagLevel`, `alsoConsole`, `singleKeyShortcuts`, `depthMax`, `recipeId`, `frameScope`, `autoCaptureNav`, `autoCaptureDelay`, `junitCiOptions` | Settings |
| `activeProfiles`, `customProfiles` | Profiles | Settings |
| `colPrefs` | Column visibility by column name | Columns menu |

The obsolete global `history` key is removed on panel start.

Session caps and raw-appendix compaction: [SESSION_MODEL.md §6](./SESSION_MODEL.md#6-caps-compaction-storage).

### Navigation

| Event | Effect |
|-------|--------|
| SPA navigation | Same scope; Flow may auto-capture a step. Pin preserved |
| Hard reload / origin or env change | Scope key recomputed; that scope's records load (`state.restoringScope` meanwhile); an active session for the scope offers resume. UI prefs are global |

---

## 8. Export Contracts

| Export | Source | Notes |
|--------|--------|-------|
| Download / Copy JSON | `enrichRunJsonExport(state.lastResult)` | `a11yflowaudit-<ts>.json` |
| Download Markdown | `buildMarkdown()` | `a11yflowaudit-<ts>.md` |
| Download JUnit XML | `buildJunitXmlForRun()` | CI options: fail on blocking, treat needs-review as failures, max failures |
| Session JSON / Markdown / JUnit | `compactSessionForExport()`, `buildSessionMarkdown()`, `buildJunitXmlForSession()` | `flowlens-session_<origin>_<env>_<YYYYMMDD-HHMM>.json` |
| Diff Report JSON | `buildMachineReadableDiffReport()` | `flowlens-<version>-<env>-diff-report.json` |
| Screenshots (.zip) | flow media store | Per-step PNGs |
| Copy CI JSON (Settings → Diagnostics) | `buildCIReportFromState()` → `buildCIReport()` | No page text or DOM paths; `rulePackHash: null` |
| Copy diagnostics | Settings → Diagnostics | `rulePack: null` |

---

## 9. Env Isolation

`detectEnv(url)` classifies the **hostname** only: `localhost`/`127.0.0.1` → `local`; a `staging`, `stage`, `preprod`, `preview`, `dev`, `test` or `qa` label → `staging`; else `prod`. Records and sessions are keyed by `<origin>::<env>`.

---

## 10. Determinism Metadata

Session JSON carries `determinismMeta` (`buildDeterminismMeta()`): `schemaVersion` (4), `signatureVersion` (2), `frameKeyVersion` (1), `enMappingVersion`, `totalSteps`, `perStepFrameKeys` (count + hash), `shadowCoverageSummary`, `warnings[]`. Versions are stamped by the SW. Details: [SESSION_MODEL.md §8](./SESSION_MODEL.md#8-exports-and-determinism-versioning).

---

## 11. Evidence and Debug Surfaces

- **Finding evidence** (snippet `add()`): `type`, `severity`, `confidence`, `wcag`, `level`, `name`, `role`, `tag`, `testId`, `path`, `html` excerpt, `note`, `extra` (serializable, bounded), `fix`. Fix suggestions live in the panel (`FIX_SUGGESTIONS`, `panel-50-overlay.js`).
- **Highlight**: activating a finding row sends `HIGHLIGHT` (`highlightFinding()`); cross-frame findings without an element show a toast instead.
- **Raw JSON** sheet, **Targeting summary** (Settings → Targeting) and **FlowLens Diagnostics** (Settings) show the last result, targeting and versions.
- **Perf counters**: `window.__flPerf` (rerender counts/timings); set `localStorage["flowlens:debugPerf"] = "1"` to show a Perf row in Diagnostics.
- `DEBUG_SESSION` (`false` in panel and SW) enables metadata-only session logging.
