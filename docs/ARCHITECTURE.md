# FlowLens — Architecture

> Version 3.0.0 · Chrome DevTools extension for accessibility auditing (WCAG)
>
> **Audience:** Maintainers, contributors, anyone needing to understand data flow and system internals.

---

## Table of Contents

1. [High-Level Architecture](#1-high-level-architecture)
2. [Module Inventory](#2-module-inventory)
3. [Message Contracts](#3-message-contracts)
4. [Frame Targeting and Scoring](#4-frame-targeting-and-scoring)
5. [Profiles](#5-profiles)
6. [Persistence Model](#6-persistence-model)
7. [Export Contracts](#7-export-contracts)
8. [Env Isolation](#8-env-isolation)
9. [Determinism Metadata](#9-determinism-metadata)
10. [Evidence and Debug Surfaces](#10-evidence-and-debug-surfaces)
11. [Quick Start Presets (Internals)](#11-quick-start-presets-internals)

---

## 1. High-Level Architecture

```
┌─────────────────────┐      chrome.runtime       ┌──────────────────────┐
│   Panel (DevTools)  │  ──── onMessage ────────▶  │   Service Worker     │
│   panel.html / .js  │  ◀─── sendResponse ─────   │   sw.js              │
│   panel.css         │                            │                      │
└─────────────────────┘                            └──────────┬───────────┘
                                                              │
                                                   chrome.scripting
                                                   .executeScript
                                                              │
                                                   ┌──────────▼───────────┐
                                                   │  Audit Snippet       │
                                                   │  a11y-audit-snippet  │
                                                   │  .js                 │
                                                   │  (MAIN world)        │
                                                   └──────────────────────┘
```

**Data flow:**
1. User clicks a mode button in the panel (`panel.js`).
2. Panel sends a `RUN_AUDIT` or `CAPTURE_STEP` message to the service worker (`sw.js`).
3. Service worker resolves target frames (scope/frame targeting), injects the snippet (`a11y-audit-snippet.js`) into the frame in `MAIN` world context.
4. Snippet executes the audit and returns the result to the service worker.
5. Service worker normalizes the result, selects the "best entry", and responds to the panel.
6. Panel renders results in virtual tables, persists to `chrome.storage.local`.

---

## 2. Module Inventory

| File | Lines | Role |
|------|------:|------|
| `manifest.json` | 25 | MV3 config: permissions (`scripting`, `tabs`, `webNavigation`, `storage`), `host_permissions` (`http://*/*`, `https://*/*`), service worker, devtools page |
| `devtools.html` / `devtools.js` | ~10 | DevTools panel registration (`chrome.devtools.panels.create`) |
| `panel.html` | 272 | Panel HTML structure: header, scope/targeting, settings, modes, action bar, progress, results, export |
| `panel.js` | 4265 | UI logic: state, virtual table rendering, Flow sessions, signatures, exports, persistence, accessibility |
| `panel.css` | 1918 | Styles: Ayu Dark theme, light theme, compact mode, severity colors, responsive layout |
| `sw.js` | ~1100 | Service worker: message validation, frame scope resolution, frame scoring, script injection, result normalization, frame key generation |
| `a11y-audit-snippet.js` | ~2200 | WCAG audit engine: ~50 rule types, `run()`, `observe()`, `watch()`, `tabWalk()`, `contrastScan()`, profile-aware checks |
| `fixtures/a11y-rule-fixtures.html` | ~130 | Test page with fixtures for FP verification |
| `icons/` | — | Extension icons (16, 32, 48, 128px) |

---

## 3. Message Contracts

Communication between Panel and SW uses `chrome.runtime.sendMessage`. The SW validates every incoming message in `validateIncomingMessage()` (`sw.js:33-71`).

| Message type | Direction | Purpose | Key fields |
|-------------|----------|---------|------------|
| `LIST_FRAMES` | Panel → SW | Get the list of frames in the tab | `tabId` |
| `RUN_AUDIT` | Panel → SW | Run an audit in the selected mode | `tabId`, `action` (`run`/`contrast`/`tabWalk`/`watch`/`observe`), `target` (scope, frameIds, match), `wcagLevel`, `modeHints`, `appMarkers` |
| `CAPTURE_STEP` | Panel → SW | Capture a session step (baseline + active) | `tabId`, `action`, `activeMode`, `target`, `wcagLevel`, `modeHints`, `appMarkers` |
| `HIGHLIGHT` | Panel → SW | Highlight an element on the inspected page | `tabId`, `frameId`, `finding` |

**Responses** always contain `ok: boolean` plus result data or `error: string`.

---

## 4. Frame Targeting and Scoring

### Scope enum

Defined in `sw.js:225-274` (`FRAME_SCOPE`, `normalizeFrameScope`, `normalizeScopeAndCompatibility`):

| Scope | Behavior |
|-------|----------|
| `PRIMARY` | Scans exactly one auto-selected frame using scoring heuristics |
| `HOST` | Scans only the top-level document (`frameId=0`) |
| `EMBEDDED` | Scans one detected/selected iframe; uses pinned frame if set |
| `ALL` | Scans host + all iframes |

### Scoring algorithm

Implemented in `computeFrameScores()` (`sw.js:798-855`):

| Signal | Points |
|--------|--------|
| URL includes match (per match) | +5 |
| DOM selector match | +10 |
| Frame area (viewport proportion) | +0 to +3 |
| Iframe bonus (when heuristics apply) | +1 |

The highest-scoring frame is selected as `best`. The `selectionReason` field in results explains the outcome: `auto_scored`, `manual_pin`, `manual_select`, `no_frames`, `scope_embedded_missing`, etc.

### Pin behavior

- Toggling **Pin frame** persists the selected frame per origin in the `pinnedFrames` storage key.
- A pinned frame acts as a manual override within the chosen scope.
- Pin is origin-scoped and survives SPA navigation and hard reloads.

### Frame key generation

Implemented in `deriveFrameKey()` (`sw.js:127-143`):

```
fk::v1::<origin>::<pathHint>::<markerHash8>
```

- `origin`: frame URL origin (fallback: parent origin / `about:blank`)
- `pathHint`: first stable URL segments with volatile numeric/UUID-like tokens normalized
- `markerHash8`: FNV-1a hash over stable selector/marker booleans
- `frameId` is kept for debugging and runtime targeting; session diff identity uses `frameKey`
- `frameKeyVersion` is persisted in session metadata for forward compatibility

### Resolution flow

`resolveTargetFrameIds()` (`sw.js:867-1099`) orchestrates the full targeting pipeline:
1. List available frames via `chrome.webNavigation.getAllFrames`.
2. Apply scope filter.
3. Apply profile-based heuristics (URL includes, DOM selectors).
4. Compute scores via `computeFrameScores()`.
5. Apply pin override if active.
6. Select best entry via `chooseBestEntry()` (`sw.js:324-354`).

---

## 5. Profiles

Profiles add product-specific frame heuristics and audit rules.

### Built-in profiles

Defined in `BUILTIN_PROFILES` (`panel.js:208-256`):

| Profile | URL includes | DOM selectors | Sub-hints |
|---------|-------------|---------------|-----------|
| `helpcenter` | `helpcenter-webclient`, `usehurrier.com`, `helpcenter` | `#help-center-root`, `[data-testid='help-center-wrapper']`, etc. | `helpcenter-bot`, `helpcenter-tree` |
| `chat` | — | `[data-testid^='GST_CHAT__']`, `#GST_CHAT__FEED`, `[role='log']` | `chat` |

### Profile state

- `profileState` (`panel.js:208-256`): runtime state tracking active profiles.
- `activeProfiles` storage key: array of active profile IDs.
- `customProfiles` storage key: user-defined profile objects that extend or override built-ins.

Profiles are rendered as pill toggles in the Settings section (`panel.js:3473-3520`).

---

## 6. Persistence Model

### Normalization pipeline

| Layer | Location | Description |
|-------|----------|-------------|
| **Result normalization** | `sw.js:145-223` (`normalizeAuditResult`) | Unified per-mode scoring: `blockingCount`, `summaryScore`, `primaryCounts` |
| **Record compaction** | `panel.js:828-937` (`persistRecords`) | Progressive compaction on quota exceeded: 3 tiers (50→25→10 records) |
| **Session compaction** | `panel.js:1737-1875` | `rawAppendix` cap (200 entries), soft-compact (keep recent 30 steps), orphan pruning |
| **Persistence backend** | `panel.js:419-434` (`storageGet`/`storageSet`) | `chrome.storage.local` with `localStorage` fallback |

### Storage keys

| Key | Scope | Contents | Reset behavior |
|-----|-------|----------|----------------|
| `records::{origin}::{env}` | Per origin + env | Array of up to 20 compacted audit results. Each record: action, bestEntry, perFrame, timestamp | Never auto — overwritten progressively. Manual: clear extension storage |
| `pinnedFrames` | Global | `{ [origin]: { frameId: number } }` — pinned frames per origin | Manual: disable pin or clear storage |
| `session::active::{origin}::{env}` | Per origin + env | Active session — full object with steps, rawAppendix | Auto: moved to archive on End session. Manual: clear storage |
| `session::archive::{origin}::{env}::{sessionId}` | Per origin + env + session | Archived (ended) session | Manual: clear storage |
| `uiPrefs` | Global | `{ theme, compact, wcagLevel, alsoConsole }` | Manual: change in settings UI |
| `customProfiles` | Global | Custom MFE profile definitions | Manual: change in settings UI |
| `activeProfiles` | Global | Array of active profile IDs (e.g., `["helpcenter"]`) | Manual: toggle pill in settings |
| `colPrefs` | Global | `{ [tableId]: { [colIdx]: boolean } }` — column visibility per table | Manual: toggle in Columns dropdown |
| `history` | Per origin | `{ [snapshotKey]: summary }` — snapshots for diff calculation | Overwritten on new results |

### Reset behavior on navigation

| Event | Effect |
|-------|--------|
| **SPA navigation** (no hard reload) | Frames may change — click Refresh frames. Session continues. Pin preserved |
| **Hard reload** | Panel reloads. Records loaded from storage. Active session loaded from storage (if exists per origin/env). Pin preserved |
| **Origin change** | New scope key — records, session, history from new origin. Pin from new origin (or none). UI prefs (global) preserved |
| **Env change** | New scope key — records, session from new env. Pin per origin preserved |
| **Clear extension storage** | Everything reset |

---

## 7. Export Contracts

### Single-run exports

| Export | Format | Source | Content |
|--------|--------|--------|---------|
| Copy JSON | Clipboard (JSON) | `state.lastResult` | Full result object |
| Copy Markdown | Clipboard (MD) | `buildMarkdown()` (`panel.js:2483-2540`) | Top 10 findings + metadata (URL, frameIds, mode, env, counts) |
| Download JSON | File (`.json`) | `state.lastResult` | `a11yflowaudit-{timestamp}.json` |

### Session exports

| Export | Format | Source | Content |
|--------|--------|--------|---------|
| Session JSON | File (`.json`) | Session object | `flowlens-session_{originSlug}_{env}_{date}-{time}.json`. Contains `determinismMeta`, `steps[]`, `rawAppendix`, `frames` index |
| Session MD | Clipboard (MD) | `buildSessionMarkdown()` (`panel.js:2350-2481`) | Session metadata, flow summary (top 24 blocking sigs), per-step diffs, frame key appendix |

Export handlers: `panel.js:3721-3738` (single run), `panel.js:3384-3452` (session).

### Session Markdown sort order

The flow summary table sorts blocking signatures deterministically:
1. `blockingWeight` descending
2. `occurrences` descending
3. `firstSeenStep` ascending
4. Signature lexicographic

---

## 8. Env Isolation

Env tag is automatically derived from URL heuristics — checks for patterns: `localhost`, `staging`, `dev`, `preview`, `canary`, `production`, `prod`.

Env affects the **scope key** — records and sessions are isolated per `{origin}::{env}`. This means:
- Staging and production results never mix.
- Local development gets its own storage namespace.
- Switching environments on the same origin loads different record/session histories.

---

## 9. Determinism Metadata

Session JSON includes `determinismMeta`, built during export:

| Field | Value | Purpose |
|-------|-------|---------|
| `schemaVersion` | `1` | Bump when persisted session shape changes |
| `signatureVersion` | `1` | Bump when issue-signature construction rules change |
| `frameKeyVersion` | `1` | Bump when frame key algorithm changes |
| `totalSteps` | number | Total step count |
| `perStepFrameKeys` | bounded `count + hash` records | Frame key summary per step |
| `warnings[]` | string[] | Non-fatal consistency warnings (e.g., missing `usedFrameKeys`, version mismatch) |

This enables forward compatibility — downstream tools can check whether a session was built with a compatible version of the signature/schema/frameKey logic before processing.

---

## 10. Evidence and Debug Surfaces

### Finding evidence

Every finding has evidence fields built by `add()` (`a11y-audit-snippet.js:313-336`):
- `extra`: object with rule-specific details (must be serializable — no DOM refs, no circular structures)
- `html`: HTML snippet of the element
- `path`: CSS path to the element
- `testId`: `data-testid` attribute value
- `role`: ARIA role
- `tag`: HTML tag name

### Highlight

Clicking a row in the findings table highlights the element on the inspected page (cyan CSS overlay) via the `HIGHLIGHT` message → `sw.js:578-678`.

### Raw JSON toggle

The `jsonToggle` in the panel opens/closes the raw JSON result in a `<pre>` block. Copy via `copyJsonRaw`.

### Targeting summary

`targetingSummary` in `panel.html` shows the current targeting state after each run: scope, selected frame, pin status, selection reason.

### Debug flag

`DEBUG_SESSION` is dev-only, `false` by default in both `panel.js` and `sw.js`. When enabled, logs metadata-only diagnostics: durations, frame counts, selection reason, persistence size outcomes.

---

## 11. Quick Start Presets (Internals)

Defined in `panel.html:103-112`, handled in `panel.js:3615-3658`.

| Preset | Modes | Mechanism |
|--------|-------|-----------|
| `presetQuick` | Audit + Contrast | `_lockedPreset(["run", "contrast"])` |
| `presetRelease` | Watch + Observe + Audit | `_lockedPreset(["watch", "observe", "run"])` |
| `presetFocus` | Tab Walk + Audit | `_lockedPreset(["tabWalk", "run"])` |

`_lockedPreset([...modes])` runs modes sequentially, locking the UI between each mode execution.
