# FlowLens — Codebase Explanation

> A comprehensive guide to the FlowLens source code, architecture, and internal design.

FlowLens is a Chrome DevTools extension (Manifest V3) that performs **deterministic conversational accessibility auditing** on dynamic support flows — chat widgets, help centers, hybrid portals, and AI bots. It goes beyond traditional static WCAG checks by capturing step-based state transitions across conversation turns and iframe boundaries.

---

## Table of Contents

1. [Repository Layout](#1-repository-layout)
2. [Architecture Overview](#2-architecture-overview)
3. [Runtime Files (Root)](#3-runtime-files-root)
4. [Source Modules (src/)](#4-source-modules-src)
5. [Build System](#5-build-system)
6. [Test Suite](#6-test-suite)
7. [The Depth Model](#7-the-depth-model)
8. [Audit Modes](#8-audit-modes)
9. [Frame Targeting and Scoring](#9-frame-targeting-and-scoring)
10. [Conversational Profiles](#10-conversational-profiles)
11. [Persistence and Storage](#11-persistence-and-storage)
12. [Export System](#12-export-system)
13. [Determinism Guarantees](#13-determinism-guarantees)
14. [CI Pipeline](#14-ci-pipeline)
15. [HostConfig Build Variants](#15-hostconfig-build-variants)
16. [Key Design Decisions](#16-key-design-decisions)

---

## 1. Repository Layout

```
flowlens/
├── manifest.json              # MV3 extension config (runtime, at root for dev loading)
├── devtools.html / devtools.js # DevTools panel registration
├── panel.html                 # Panel UI structure
├── panel.js                   # Panel logic (~200K, ~5,200 lines, the largest file)
├── panel.css                  # Styles (Ayu Dark / Light themes)
├── sw.js                      # Service worker — message routing, frame resolution
├── a11y-audit-snippet.js      # Audit engine injected into inspected pages
├── build.mjs                  # Simplified build script (root-level, predates src/ structure)
├── package.json               # npm scripts, version 5.0.0, esbuild devDependency
│
├── src/                       # Canonical source (build reads from here)
│   ├── panel/                 # panel.html, panel.js, panel.css
│   ├── sw/                    # sw.js
│   ├── snippet/               # a11y-audit-snippet.js
│   ├── engine/                # Pure logic: state transitions, depth3 aggregates, CI export
│   ├── shared/                # Shared constants: version, limits, WCAG coverage, profiles, EN 301 549 map
│   ├── devtools/              # devtools.html, devtools.js
│   ├── manifest/              # manifest.base.json (template for build)
│   ├── host/                  # default.config.json (HostConfig defaults)
│   └── assets/icons/          # SVG icons for panel UI + PNG extension icons
│
├── scripts/                   # Build, packaging, release, and audit scripts
│   ├── build.mjs              # Main build script (src/ → dist/)
│   ├── package.mjs            # Zips dist/ into artifacts/
│   ├── package-audit.mjs      # Validates the zip contents
│   ├── release-guard.mjs      # Pre-release version/consistency checks
│   ├── audit-vendor.mjs       # Scans src/ for vendor-specific references
│   └── audit-vendor-all.mjs   # Full vendor audit including root files
│
├── test/                      # Node.js test runner (--test) with ~50 test files
│   ├── harness.mjs            # Test harness simulating Chrome extension APIs
│   ├── engine-harness.mjs     # Harness for state transition engine tests
│   ├── snippet-harness.mjs    # Harness for snippet tests
│   ├── sw-harness.mjs         # Harness for service worker tests
│   └── *.test.mjs             # Individual test suites
│
├── docs/                      # Documentation
│   ├── ARCHITECTURE.md        # System architecture deep dive
│   ├── USER_GUIDE.md          # End-user guide
│   ├── ENGINE_RULES.md        # Rule catalog and registry
│   ├── SESSION_MODEL.md       # Session/Flow data model
│   ├── DEPTH_MODEL.md         # Depth 1/2/3 explanation
│   ├── SESSION_CAPTURE.md     # Session capture design
│   └── ...                    # Additional docs (QA, recipes, WCAG coverage, etc.)
│
├── fixtures/                  # Test fixtures (a11y-rule-fixtures.html)
├── artifacts/                 # Built extension zip (stale: flowlens-3.0.1.zip; source is at 5.0.0)
├── icons/                     # Extension icons (runtime, copied to dist/)
└── .github/workflows/ci.yml   # GitHub Actions CI pipeline
```

---

## 2. Architecture Overview

FlowLens follows a three-layer architecture dictated by Chrome's Manifest V3 extension model:

```
┌──────────────────────┐     chrome.runtime      ┌──────────────────────┐
│   Panel (DevTools)   │  ──── sendMessage ────▶  │   Service Worker     │
│   panel.html/.js/.css│  ◀─── sendResponse ────  │   sw.js              │
└──────────────────────┘                          └──────────┬───────────┘
                                                             │
                                                  chrome.scripting
                                                  .executeScript
                                                             │
                                                  ┌──────────▼───────────┐
                                                  │   Audit Snippet      │
                                                  │   a11y-audit-snippet │
                                                  │   (MAIN world)       │
                                                  └──────────────────────┘
```

### Data flow

1. **User action** — User clicks a mode button (Run, Observe, Watch, TabWalk, Contrast) in the DevTools panel.
2. **Message dispatch** — `panel.js` sends a `RUN_AUDIT` or `CAPTURE_STEP` message to the service worker via `chrome.runtime.sendMessage`.
3. **Frame resolution** — `sw.js` resolves target frames based on scope settings, profile heuristics, and pin overrides. It uses `chrome.webNavigation.getAllFrames` to enumerate frames and a scoring algorithm to pick the best target.
4. **Script injection** — `sw.js` injects `a11y-audit-snippet.js` into the target frame(s) via `chrome.scripting.executeScript` in the `MAIN` world context (full DOM access).
5. **Audit execution** — The snippet runs the requested audit mode and returns structured findings.
6. **Result normalization** — `sw.js` normalizes results (unified scoring: `blockingCount`, `summaryScore`, `primaryCounts`), derives frame keys, and responds to the panel.
7. **Rendering and persistence** — `panel.js` renders results in virtual-scrolling tables, persists records to `chrome.storage.local`, and supports diffing between runs.

### Message types

| Message | Direction | Purpose |
|---------|-----------|---------|
| `LIST_FRAMES` | Panel → SW | Enumerate frames in the inspected tab |
| `RUN_AUDIT` | Panel → SW | Execute an audit mode (run/observe/watch/tabWalk/contrast) |
| `CAPTURE_STEP` | Panel → SW | Capture a Flow session step (baseline + active mode) |
| `HIGHLIGHT` | Panel → SW | Highlight a specific element on the inspected page |

All messages are validated by `validateIncomingMessage()` in `sw.js` before processing.

---

## 3. Runtime Files (Root)

The root-level runtime files are the ones loaded directly when the extension is loaded unpacked for development. They mirror what the build system outputs to `dist/`.

### `manifest.json`
MV3 extension manifest. Declares permissions (`scripting`, `tabs`, `webNavigation`, `storage`), host permissions for all HTTP/HTTPS URLs, the service worker (`sw.js`), and the DevTools page (`devtools.html`).

### `devtools.html` / `devtools.js`
Minimal bootstrap — registers the FlowLens panel via `chrome.devtools.panels.create("FlowLens", ...)`.

### `panel.html` (~29K)
The panel UI structure. Contains:
- Header with scope/targeting controls (frame selector, pin, scope dropdown)
- Tab shell: **Snap** (single audit), **Flow** (multi-step session), **Settings**
- Mode buttons (Run, Observe, Watch, TabWalk, Contrast)
- Progress indicators
- Results zone with virtual-scrolling tables (findings, contrast, tab walk, watch)
- Export menu, past runs drawer, raw JSON toggle
- Preset buttons (Quick, Release, Focus)

### `panel.js` (~200K, ~5,200 lines at root; ~7,700 lines in src/)
The largest file. Contains all UI logic:
- **State management** — A `state` object tracks current findings, records, active mode, severity filters, session data, pinned frames, etc.
- **Virtual table rendering** — Findings tables use a virtual scrolling approach for performance with large result sets.
- **Flow sessions** — Multi-step session recording with start/mark/end lifecycle, step diffing, signature tracking, and session export.
- **Signatures** — Content-addressed FNV-1a hashes that produce stable identifiers for findings across runs (no timestamps, deterministic).
- **Diff engine** — Compares current findings against previous snapshots to identify new/fixed/regressed issues.
- **Profile system** — Loads and applies conversational profiles that tune frame targeting and audit behavior.
- **Persistence** — Reads/writes to `chrome.storage.local` (with `localStorage` fallback), progressive compaction on quota exceeded.
- **Export** — JSON, Markdown, CI-ready JSON, and session exports.
- **Keyboard shortcuts** — `1`/`2`/`3`/`4` switch tabs (Snap/Flow/Settings/About), `r` start recording (Flow tab), `s` mark step, `e` end session.
- **Accessibility** — The panel itself is built with ARIA attributes and keyboard navigation.

### `panel.css` (~61K)
Styles using the Ayu Dark color scheme (with a light theme toggle). Includes severity color coding, compact/normal density modes, virtual table styles, responsive layout, and animation for progress indicators.

### `sw.js` (~45K, ~1,460 lines in src/)
The service worker handles:
- **Message validation** — Strict schema validation of all incoming messages.
- **Frame scope resolution** — Implements the `PRIMARY`/`HOST`/`EMBEDDED`/`ALL` scope model.
- **Frame scoring** — `computeFrameScores()` assigns points based on URL pattern matches, DOM selector matches, and viewport area to select the best frame.
- **Frame key derivation** — `deriveFrameKey()` produces stable keys in the format `fk::v1::<origin>::<pathHint>::<markerHash8>` for diffing across navigations.
- **Script injection** — Injects the audit snippet into target frames via `chrome.scripting.executeScript`.
- **Result normalization** — `normalizeAuditResult()` creates a unified result shape with mode-specific scoring weights.
- **Highlight support** — Injects a CSS overlay to highlight specific elements on the inspected page.

### `a11y-audit-snippet.js` (~128K, ~4,060 lines in src/)
The audit engine injected into inspected pages. Runs in the page's `MAIN` world context for full DOM access. Implements:
- **~50 rule types** covering ARIA, labels, headings, landmarks, tab indexes, roles, etc.
- **Five audit modes**: `run()`, `observe()`, `watch()`, `tabWalk()`, `contrastScan()`
- **Shadow DOM traversal** — Walks shadow roots up to configurable depth limits.
- **Profile-aware checks** — Adjusts behavior based on modeHints from active profiles.
- **Capture artifacts** — Returns live region data, chat candidates, and structural metadata for Depth 3 evaluation.
- **Annotation system** — Can visually annotate elements on the page for debugging.

---

## 4. Source Modules (src/)

The `src/` directory contains the canonical source code that the build system assembles into `dist/`.

### `src/panel/`
Source versions of `panel.html`, `panel.js`, `panel.css`.

### `src/sw/`
Source version of `sw.js`.

### `src/snippet/`
Source version of `a11y-audit-snippet.js`.

### `src/engine/`
Pure, side-effect-free logic modules with no DOM access and no imports:

- **`stateTransitionEngine.js`** — The Depth 3 state transition evaluator. Implements C1–C4 conversational integrity rules:
  - C1: Announcement integrity (live region presence and mutation events)
  - C2: Focus stability (composer focus after bot responses)
  - C3: Feed semantics (feed/log role, item structure)
  - C4: Multi-frame linkage (structural connection across iframes)
  - Uses `buildTransitionState()` to extract normalized state from capture artifacts, then six evaluation functions to produce deterministic verdicts: `evaluateC1`, `evaluateC2`, `evaluateC3_1`, `evaluateC3_2`, `evaluateC4_1`, `evaluateC4_2` (C3 and C4 are each split into two sub-rules).
  - Hashes locators with FNV-1a for stable identification.

- **`depth3Aggregates.js`** — Aggregates Depth 3 findings into four integrity axes (`announcementIntegrity`, `focusStability`, `chatSemantics`, `multiFrameIntegrity`). Each axis is either `"ok"` or `"degraded"` with associated counts.

- **`ciExporter.js`** — Builds a CI-safe JSON report with `contractVersion: "1.0"`. Strips all DOM-derived data (selectors, HTML, URLs, text) using a forbidden-keys list. Exports only structural metadata suitable for automated pipelines.

### `src/shared/`
Constants and mappings shared across modules:

- **`version.js`** — Single source of truth: `FLOWLENS_VERSION = "5.0.0"`. The build script reads this and injects it into the manifest and panel.
- **`limits.js`** — Cap constants (`MAX_MATCH_ARRAY = 80`, `MAX_MATCH_STRING = 256`) used by the build script, panel, and service worker for validating match arrays.
- **`wcag-coverage.js`** — Machine-readable WCAG 2.2 coverage map. Lists all A+AA criteria with rule mappings (`RULE_TO_WCAG`). Each rule maps to its WCAG criterion, group (depth classification), depth level, and confidence tier.
- **`flow-profiles.js`** — Generic structural profiles for conversational UI detection (e.g., `generic-helpcenter-spa`, `generic-chat-widget`, `generic-ai-bot-tree`). Uses ARIA roles and DOM structure for matching — no vendor-specific selectors.
- **`en301549-map.js`** — Maps WCAG criteria to EN 301 549 V3.2.1 clauses for European accessibility compliance reporting.

### `src/devtools/`
Source versions of `devtools.html` and `devtools.js`.

### `src/manifest/`
`manifest.base.json` — Template manifest that the build script uses. Version and other fields are injected at build time from `version.js`.

### `src/host/`
`default.config.json` — Default HostConfig for the generic build. Contains no host-specific selectors and no default active profiles.

### `src/assets/icons/`
SVG icons used in the panel UI (mode icons, tab icons, action icons) plus PNG extension icons at 16/32/48/128px.

---

## 5. Build System

### Primary build (`scripts/build.mjs`)

```sh
npm run build          # Production build (minified)
npm run build:dev      # Dev build (unminified, sourcemaps)
npm run build:clean    # Clean dist/ first, then build
```

The build script:
1. Reads `FLOWLENS_VERSION` from `src/shared/version.js`
2. Reads shared limits from `src/shared/limits.js`
3. Optionally loads and validates a HostConfig (`HOST_CONFIG` env var)
4. Assembles runtime files from `src/` into `dist/`
5. Injects version into `manifest.json` and `panel.js` via esbuild `define`
6. Inlines shared modules (engine, profiles, WCAG coverage, EN mapping) into the consuming files
7. Minifies JS/CSS/HTML with esbuild
8. Copies icons to `dist/icons/`

### Simplified build (`build.mjs` at root)

A simpler build script (163 lines) that copies root-level runtime files to `dist/` with minification. Predates the `src/` structure — no version injection, no HostConfig support, no `--dev` mode. Not referenced by any `npm run` script; `npm run build` uses `scripts/build.mjs`.

### Packaging (`scripts/package.mjs`)

```sh
npm run package
```

Zips `dist/` into `artifacts/flowlens-{version}.zip` for Chrome Web Store submission.

### Package audit (`scripts/package-audit.mjs`)

```sh
npm run package:audit
```

Validates the zip: checks for required files, forbidden files, size limits, and structural integrity.

### Release guard (`scripts/release-guard.mjs`)

```sh
npm run release:guard
```

Pre-release checks: version consistency between `version.js`, `manifest.json`, and `package.json`; ensures no debug flags are enabled.

### Vendor audit (`scripts/audit-vendor.mjs`)

```sh
npm run audit:vendor
```

Scans `src/` (excluding `src/host/`) for company-specific or vendor-specific references. Fails if any are found. Ensures the generic build stays vendor-neutral.

---

## 6. Test Suite

Tests use Node.js's built-in test runner (`node --test`):

```sh
npm test    # runs: node --test test/*.test.mjs
```

### Test harnesses

The tests run outside the browser, so harness files simulate Chrome extension APIs:

- **`harness.mjs`** — Mocks `chrome.runtime`, `chrome.storage`, `chrome.devtools`, `chrome.scripting`, DOM APIs, and `document` for panel tests.
- **`engine-harness.mjs`** — Loads the state transition engine for isolated testing.
- **`snippet-harness.mjs`** — Loads the audit snippet with a simulated DOM.
- **`sw-harness.mjs`** — Loads the service worker with mocked Chrome APIs.

### Test coverage areas (~50 test files)

| Area | Test files | What they verify |
|------|-----------|-----------------|
| CI export | `ci-exporter.test.mjs` | CI report structure, forbidden key stripping, regression entries |
| State transitions | `state-transition-engine.test.mjs` | C1–C4 rules, edge cases, determinism |
| Depth 3 aggregates | `depth3-aggregates.test.mjs` | Axis aggregation, count accuracy |
| WCAG coverage | `wcag-coverage.test.mjs` | Rule-to-criterion mapping completeness |
| Diff calculation | `diff-calc.test.mjs`, `stable-diff-parity.test.mjs` | Snapshot diffing accuracy, signature stability |
| Profiles | `flow-profiles.test.mjs`, `profiles-v2.test.mjs`, `profile-matching.test.mjs` | Profile matching, frame scoring, scope defaults |
| HostConfig | `host-config.test.mjs`, `host-config-gating.test.mjs` | Config validation, gating behavior |
| Frame keys | `framekey-v2.test.mjs` | Key derivation determinism |
| Session model | `session-state.test.mjs` | Session lifecycle, step management |
| UI stability | `ui-stability.test.mjs`, `confidence-ui.test.mjs` | Rendering edge cases, confidence badge display |
| Shadow DOM | `shadow-dom.test.mjs`, `shadow-coverage.test.mjs` | Shadow root traversal, coverage in shadow scopes |
| Snippet parity | `snippet-engine-parity.test.mjs` | Snippet output matches engine expectations |
| Persistence | `persistence.test.mjs` | Storage compaction, quota handling |
| SW merge | `sw-merge.test.mjs` | Multi-frame result merging |
| JUnit export | `junit-export.test.mjs` | JUnit XML report generation |
| Diagnostics | `diagnostics.test.mjs` | Diagnostic panel data accuracy |
| Highlight | `highlight-hardening.test.mjs` | Element highlight injection safety |

---

## 7. The Depth Model

FlowLens organizes checks into three depth levels, each building on the one below:

```
Depth 3 — Conversation Integrity
    │   State transitions across steps and frames
    │   Four integrity axes: C1, C2, C3, C4
Depth 2 — Interaction Stability
    │   Focus management, keyboard order, mutation effects
    │   Requires observing DOM changes over time
Depth 1 — Static WCAG
        ARIA roles, semantics, contrast, structure
        Single DOM snapshot analysis
```

**Depth 1** is what traditional scanners do — check a frozen DOM.

**Depth 2** requires temporal observation — `observe` and `watch` modes detect issues that only appear when the DOM changes (focus traps, loading states, silent content replacement).

**Depth 3** is FlowLens's differentiator — it correlates findings across multiple conversation turns and frame boundaries to evaluate whether a dynamic support experience is actually accessible end-to-end.

### Depth 3 integrity axes

| Axis | Code | Question |
|------|------|----------|
| Announcement integrity | C1 | Are new messages announced to assistive technology via `aria-live` or equivalent? |
| Focus stability | C2 | Does the composer retain focus after bot responses? |
| Feed semantics | C3 | Is the message feed properly structured with `role="log"/"feed"` and discrete items? |
| Multi-frame linkage | C4 | When chat components span iframes, are they structurally connected? |

The state transition engine (`src/engine/stateTransitionEngine.js`) evaluates C1–C4 from capture artifacts (with C3 and C4 each split into two sub-rules: C3.1/C3.2 and C4.1/C4.2, for a total of six evaluation functions). It is **pure** — no DOM access, same input always produces identical output.

---

## 8. Audit Modes

| Mode | Function | Duration | What it does |
|------|----------|----------|-------------|
| **Run** | `run()` | Instant | One-shot static WCAG check: labels, ARIA, headings, landmarks, tab indexes, roles |
| **Observe** | `observe()` | ~12 seconds | Re-runs checks every ~900ms to catch dynamically rendered content |
| **Watch** | `watch()` | ~40 seconds | Monitors loader chains, silent loading, and focus loss |
| **TabWalk** | `tabWalk()` | Variable | Tabs through up to 80 focusable elements to detect focus traps and order issues |
| **Contrast** | `contrastScan()` | Variable | Scans up to 250 text nodes for approximate color contrast ratios (AA/AAA) |

The panel includes infrastructure for chaining modes sequentially via `_lockedPreset()`, though named presets are not currently wired into the UI.

---

## 9. Frame Targeting and Scoring

FlowLens is multi-frame aware. The scope system determines which frames are audited:

| Scope | Behavior |
|-------|----------|
| `PRIMARY` | Scans exactly one auto-selected frame (default) |
| `HOST` | Scans only the top-level document (`frameId=0`) |
| `EMBEDDED` | Scans one detected/selected iframe |
| `ALL` | Scans the host page and all embedded frames |

### Scoring algorithm (`computeFrameScores()` in sw.js)

When auto-selecting a frame, the service worker scores each frame:

| Signal | Points |
|--------|--------|
| URL pattern match (per match) | +5 |
| DOM selector match | +10 |
| Frame viewport area proportion | +0 to +3 |
| Iframe bonus (heuristic) | +1 |

The highest-scoring frame wins. The `selectionReason` field explains the choice: `auto_scored`, `manual_pin`, `manual_select`, `scope_embedded_missing`, etc.

### Pin behavior

Users can pin a frame per origin. A pinned frame acts as a manual override that persists across SPA navigations and hard reloads.

### Frame key derivation

Frame keys provide stable identifiers for diffing across navigations. There are two variants:

```
frameKeyStable = fk::v1::<origin>::<pathHint>           (primary, used for identity/diffing)
frameKey       = fk::v1::<origin>::<pathHint>::<markerHash8>  (legacy, includes marker hash)
```

- `origin` — Frame URL origin
- `pathHint` — Normalized URL path segments (volatile IDs replaced with `_id`)
- `markerHash8` — FNV-1a hash over stable selector/marker booleans (legacy key only)

The `frameKeyStable` variant is the primary identifier used for diffing — it stays the same when only marker hits toggle between audit steps. The full `frameKey` with `markerHash8` is retained for backward compatibility.

---

## 10. Conversational Profiles

Profiles tune frame targeting and audit behavior for specific UI patterns. They are vendor-agnostic — matching uses ARIA roles and DOM structure, not product-specific selectors.

### Built-in generic profiles (`src/shared/flow-profiles.js`)

| Profile ID | Label | Frame scope | What it matches |
|------------|-------|-------------|----------------|
| `generic-helpcenter-spa` | Generic Help Center | Primary | `[role='navigation']`, `main article`, `[role='main']` |
| `generic-chat-widget` | Generic Chat | Embedded | `[role='log']`, `[role='feed']`, `[aria-label*='chat' i]`, `textarea` |
| `generic-ai-bot-tree` | Generic AI Bot Tree | Embedded | `[role='tree']`, `[role='treeitem']`, `[role='log']`, `[role='feed']` |

### Profile state

- Active profiles are stored in `chrome.storage.local` under the `activeProfiles` key.
- Custom profiles can be defined and stored under the `customProfiles` key.
- Profiles are rendered as pill toggles in the Settings tab.
- `buildMatch()` in `panel.js` merges active profile selectors into the targeting message.

---

## 11. Persistence and Storage

All data is stored in `chrome.storage.local` (with `localStorage` fallback). No network requests are ever made.

### Storage key scheme

| Key pattern | Scope | Contents |
|-------------|-------|----------|
| `records::{origin}::{env}` | Per origin + env | Up to 20 compacted audit results |
| `pinnedFrames` | Global | Pinned frame per origin |
| `session::active::{origin}::{env}` | Per origin + env | Active Flow session with steps and raw appendix |
| `session::archive::{origin}::{env}::{id}` | Per session | Archived (ended) sessions |
| `uiPrefs` | Global | Theme, density, WCAG level, console mirror toggle |
| `activeProfiles` | Global | Array of active profile IDs |
| `customProfiles` | Global | User-defined profile objects |
| `colPrefs` | Global | Column visibility per table |
| `history` | Global (internally keyed by origin+env+frameUrl) | Snapshots for diff calculation |

### Env isolation

Environment is auto-derived from URL heuristics by `detectEnv()`:
- `"local"` — matches `localhost` or `127.0.0.1`
- `"staging"` — matches `staging`, `stage`, `preprod`, `preview`, `dev`, `test`, `qa`
- `"prod"` — everything else

Records and sessions are isolated per `{origin}::{env}`, so staging and production data never mix.

### Progressive compaction

When storage quota is exceeded, `persistRecords()` applies five-tier progressive compaction: 20 → 15 → 10 → 8 → 5 records (with corresponding per-record findings caps: 200 → 150 → 100 → 70 → 40). Sessions also compact their `rawAppendix` (cap at 200 entries) and soft-compact older steps.

---

## 12. Export System

### Single-run exports

| Export | Format | Content |
|--------|--------|---------|
| Copy JSON | Clipboard | Full result object |
| Download JSON | `.json` file | Full result with filename `a11yflowaudit-{timestamp}.json` |
| Copy Markdown | Clipboard | Top 10 findings + metadata |
| Download Markdown | `.md` file | Same content as Copy Markdown, saved as `a11yflowaudit-{timestamp}.md` |

### Session exports

| Export | Format | Content |
|--------|--------|---------|
| Session JSON | `.json` file | `determinismMeta`, `steps[]`, `rawAppendix`, `frames` index |
| Session Markdown | Clipboard | Session metadata, flow summary (top 24 blocking sigs), per-step diffs, frame key appendix |

### CI export (`src/engine/ciExporter.js`)

The CI exporter produces a `contractVersion: "1.0"` JSON report with:
- Tool metadata (name, version, hostId)
- Scope (depthMax, profileId, profileConfidence, rulePackHash)
- Quality (signatureQuality, diffConfidence)
- Summary (blocking added/fixed/current, total count, by severity)
- Regressions (blocking added/fixed entries)
- Depth 3 aggregates

**Privacy**: CI reports strip all DOM-derived data. A `CI_FORBIDDEN_KEYS` set blocks `selector`, `html`, `url`, `text`, `innerText`, `cssPath`, `ariaLabel`, `message`, `el` from appearing anywhere in the output.

---

## 13. Determinism Guarantees

FlowLens is designed for reproducible results:

- **Stable signatures** — Every finding produces a content-addressed FNV-1a hash signature that is identical across runs with the same inputs. No randomness, no UUIDs.
- **No timestamps in findings** — Findings carry no time-based data that would cause false diffs. Timestamps exist only in metadata (record creation time) and are excluded from signatures.
- **Bounded capture windows** — Observe (12s), Watch (40s), TabWalk (80 steps), Contrast (250 nodes) all have fixed upper bounds.
- **Frame key stability** — `deriveFrameKey()` normalizes volatile URL segments so the same logical frame produces the same key across navigations.
- **No raw text in CI** — The CI contract exports only structural metadata, never page content.
- **Version metadata** — Sessions include `determinismMeta` with `schemaVersion` (4), `signatureVersion` (2), `frameKeyVersion` (1), and `enMappingVersion` (1) for forward compatibility.

---

## 14. CI Pipeline

`.github/workflows/ci.yml` runs on push to `main` and on PRs:

1. Checkout + Node.js 22 setup
2. `npm ci` — Install dependencies
3. `npm test` — Run all test suites
4. `npm run build` — Build to `dist/`
5. Verify `dist/` structure (all required files present)
6. `npm run package` — Create zip artifact
7. `npm run package:audit` — Validate zip contents
8. `npm run release:guard` — Version consistency checks
9. Upload artifact (30-day retention)

The full CI script (`npm run ci`) also includes `audit:vendor` and `audit:vendor:all`.

---

## 15. HostConfig Build Variants

The HostConfig system allows private builds to customize targeting without affecting core determinism.

```sh
# Generic build (default)
npm run build

# Custom host build
HOST_CONFIG=./path/to/host.config.json npm run build
```

### HostConfig contract

| Field | Type | Purpose |
|-------|------|---------|
| `id` | string (required) | Build identifier |
| `label` | string or null | Display label in UI |
| `defaultProfiles` | string[] | Profile IDs activated by default |
| `rootSelector` | string or null | Default DOM scoping selector |
| `match.domSelectorsAny` | string[] | DOM selectors for frame targeting |
| `match.urlIncludesAny` | string[] | URL patterns for frame matching |
| `match.urlExcludesAny` | string[] | URL patterns to exclude |
| `ui.badgeText` | string or null | Version badge suffix |
| `ui.diagnosticsHint` | string or null | Diagnostics panel hint text |

**Invariant**: HostConfig never affects stable signatures, diff logic, FrameKey derivation, or highlight behavior. It only influences targeting (frame selection), profile defaults, UI labels, and DOM scoping.

---

## 16. Key Design Decisions

### No bundler for runtime code
The extension runs flat files — no webpack, no module system at runtime. The build script inlines shared modules into their consumers. This simplifies the MV3 content security policy and avoids module loading complexity in the DevTools panel and service worker contexts.

### Pure engine modules
The state transition engine, depth3 aggregates, and CI exporter are pure functions with no DOM access and no imports. This makes them testable outside the browser and guarantees determinism.

### Virtual scrolling
`panel.js` implements virtual table rendering for findings, contrast, and tab walk results. This is necessary because audits can produce hundreds or thousands of findings.

### Privacy by design
- No telemetry, no analytics, no network requests — ever.
- Cross-frame checks use hashed structural summaries, not raw content.
- CI exports strip all DOM-derived data via a forbidden-keys mechanism.
- Session exports exclude message text and DOM paths.

### FNV-1a everywhere
The FNV-1a hash function is used for signatures, frame keys, and locator hashing. The same implementation exists in `panel.js`, `sw.js`, and `stateTransitionEngine.js` to ensure consistency without cross-module imports.

### Env isolation by convention
Storage keys are scoped by `{origin}::{env}` so different environments on the same domain (staging vs. production) never share data. The env is heuristically derived from URL patterns.

### Progressive degradation
When storage quota is exceeded, records compact progressively rather than failing. Session raw appendixes are capped. This ensures the extension remains functional on storage-constrained environments.
