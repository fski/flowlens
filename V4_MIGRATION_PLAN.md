# FlowLens v3 → v4.1 Migration Plan

> Generated from the v4.1 target state spec against the v3.0.2 codebase.
> All line references are against `src/panel/panel.js` unless otherwise noted.

---

## Table of Contents

1. [Updated Step Schema (v4)](#1-updated-step-schema-v4)
2. [File-by-File Migration Plan](#2-file-by-file-migration-plan)
3. [Incremental Commit Structure](#3-incremental-commit-structure)
4. [Regression Test Matrix](#4-regression-test-matrix)
5. [Risk Assessment per Phase](#5-risk-assessment-per-phase)

---

## 1. Updated Step Schema (v4)

### Session envelope

```js
{
  id: "sess_...",
  schemaVersion: 4,                     // was: 3
  signatureVersion: 3,                  // was: 2 — bumped for stable signatures
  stableSignatureVersion: 1,            // NEW — tracks the stable signature format
  frameKeyVersion: 2,                   // was: 1 — bumped for stable frame identity
  startedAt: ISO8601,
  endedAt: ISO8601 | null,
  steps: [ Step ],
  rawAppendix: { ... },
  frames: { frameKeys: [...], frameKeyToLastFrameId: {...} },
  determinismMeta: { ... }
}
```

### Step object (v4 additions in **bold**)

```js
{
  id: "step_...",
  index: 0,
  label: "...",
  at: ISO8601,
  url: "...",
  routeHint: "...",
  snapshots: {
    run: ModeSnapshot,
    active: ModeSnapshot | null
  },
  diffs: {
    run: DiffSummary,
    active: DiffSummary | null,
    consolidated: DiffSummary
  },
  frameSelections: {
    usedFrameIds: [0, 1],
    usedFrameKeys: ["fk::v2::..."]
  },
  scope: { type, rootSelector, rootTestId },
  shadowCoverage: { ... },

  // ── v4 additions ──────────────────────────────────
  stableFindingSignatureSet: string[],   // NEW — deterministic finding IDs
  severityCounts: {                      // NEW — persisted at capture time
    high: number,
    medium: number,
    low: number,
    info: number
  },
  blockingSet: string[],                 // NEW — subset of stableFindingSignatureSet
  summaryScore: number,                  // NEW — persisted score (not recomputed)

  profileLabel: string | null,           // NEW (Phase 4) — which profile was active
  profileConfidence: "high"|"medium"|"low"|null, // NEW (Phase 4)
  profileMatchSignals: string[],         // NEW (Phase 4)

  stepQuality: {                         // NEW — per-step quality metadata
    signatureQualityCounts: { high: n, medium: n, low: n },
    hasRawData: boolean,
    frameKeyStable: boolean
  }
}
```

### Stable finding signature format (v1)

```
{ruleId}|{severity}|{normalizedLocatorHash}
```

Where:
- `ruleId` = `{mode}|{type}|{wcag}` (e.g., `run|missing-label|1.1.1`)
- `severity` = `high|medium|low|info`
- `normalizedLocatorHash` = FNV-1a of `{frameKeyStable}|testid:{testId}|pathh:{pathHash}`

This replaces the current multi-field signature format for diff purposes. The existing full signature is retained for export/display.

### FrameKey v2

```
fk::v2::{origin}::{normalizedPath}
```

Changes from v1:
- `markerHash` removed from identity (moved to diagnostic-only `frameSignalsHash`)
- `frameSignalsHash` stored alongside but not part of identity

### Highlight result (structured)

```js
{
  found: boolean,
  strategy: "path" | "testId" | "heuristic" | "html" | "none",
  reason?: "DOM_CHANGED" | "NO_MATCH" | "FRAME_INACCESSIBLE",
  matched?: { tag, role, labelSnippet }
}
```

### Profile confidence model (Phase 4)

```js
{
  matchScore: number,
  matchSignals: string[],
  confidence: "high" | "medium" | "low"
}
```

### Rule metadata (Phase 5 prep)

```js
// Added to each rule definition in a11y-audit-snippet.js
{
  depthLevel: 1 | 2 | 3,
  conversationalTag: string | null,
  confidence: "strict" | "heuristic" | "advisory"
}
```

### Migration (v3 → v4) on load

```js
function migrateV3ToV4(session) {
  // 1. Clone — never mutate original
  const out = structuredClone(session);

  // 2. Recompute stableFindingSignatureSet per step from rawAppendix
  for (const step of out.steps) {
    const sigs = recomputeStableSignatures(step, out.rawAppendix);
    step.stableFindingSignatureSet = sigs.signatures;
    step.severityCounts = sigs.severityCounts;
    step.blockingSet = sigs.blockingSet;
    step.summaryScore = step.snapshots?.run?.best?.normalized?.summaryScore ?? 0;
    step.stepQuality = computeStepQuality(step, out.rawAppendix);
  }

  // 3. Upgrade frameKeys (strip markerHash → v2)
  upgradeFrameKeys(out);

  // 4. Stamp versions
  out.schemaVersion = 4;
  out.stableSignatureVersion = 1;
  out.frameKeyVersion = 2;

  // 5. Record migration
  out._migrated = true;
  out._migrationWarnings = [...];

  return out;
}
```

---

## 2. File-by-File Migration Plan

### Legend

| Symbol | Meaning |
|--------|---------|
| **P1** | Phase 1 — Correctness & Stability |
| **P2** | Phase 2 — UI State Correctness |
| **P3** | Phase 3 — Modular Core |
| **P4** | Phase 4 — Profiles v2 |
| **P5** | Phase 5 — WCAG Depth v3 Preparation |
| ✂ | Extract from panel.js |
| ➕ | New file |
| ✏ | Modify in place |

---

### `src/panel/panel.js` (6,262 lines → ~2,000 lines by P3)

| Phase | Lines (approx) | Change |
|-------|----------------|--------|
| **P1** | 1780-1840 | ✏ Update `normalizeLoadedSession()` to handle v3→v4 migration, call `migrateV3ToV4()` |
| **P1** | 1870-2250 | ✏ Add `buildStableFindingSignature()` alongside existing signatures; persist `stableFindingSignatureSet`, `severityCounts`, `blockingSet`, `summaryScore` into step during `captureStepOptionC()` |
| **P1** | 2190-2250 | ✏ Modify `diffModeBundles()` to diff from `stableFindingSignatureSet` instead of recomputing from raw. Retain raw-based diff as fallback for v3 sessions only |
| **P1** | 2534-2690 | ✏ Verify `compact()` preserves `stableFindingSignatureSet` (must not be in rawAppendix). Add assertion: `diff(s) === diff(compact(s))` |
| **P1** | 4344-4360 | ✏ Update `highlightFinding()` to accept `frameId` per record, implement retry across `usedFrameIds`, return structured result |
| **P2** | ~3900-4100 | ✏ `renderExplorer()` empty-state: derive from `visibleRowsCount === 0` not `filteredData.length` |
| **P2** | 40-150 | ✏ Move `bestFrameId` from global `state` into per-record context. Reset filters on record change. Clear stale highlight state on past-run selection |
| **P2** | ➕ | ✏ Add HUD save-status indicator (`renderSaveStatus()`) replacing toast-only warnings |
| **P2** | ~3846-4153 | ✏ Enforce `loadRecord() → computeDerivedState() → render()` pipeline — remove render-time side effects |
| **P3** | ✂ 1870-2250 | Extract → `src/engines/diffEngine.js` |
| **P3** | ✂ 2340-2810 | Extract → `src/engines/sessionEngine.js` |
| **P3** | ✂ 3000-3550 | Extract → `src/engines/exportEngine.js` |
| **P3** | ✂ 4344-4400 | Extract → `src/engines/highlightEngine.js` (panel-side orchestration) |
| **P3** | ✂ 3700-3800 | Extract → `src/engines/coverageEngine.js` |
| **P4** | 264-330 | ✏ Update `BUILTIN_PROFILES` to return confidence model. Add `rootSelector`, `domSelectorsAny`, `urlIncludes`, `frameScope` as formal contract |
| **P4** | ~4200-4350 | ✏ Persist `profileLabel`, `profileConfidence`, `profileMatchSignals` into step metadata |
| Post-P3 panel.js retains: DOM binding (~500 lines), VirtualTable (~150 lines), orchestration (~400 lines), rendering (~700 lines), event handlers (~250 lines) |

---

### `src/sw/sw.js` (1,192 lines)

| Phase | Lines (approx) | Change |
|-------|----------------|--------|
| **P1** | 130-146 | ✏ `deriveFrameKey()`: produce `frameKeyStable` (origin + normalizedPath) and separate `frameSignalsHash` (markerHash). Return both. New format: `fk::v2::{origin}::{path}` |
| **P1** | 96-113 | ✏ `stablePathHint()`: no change needed — already normalizes. Wire into new v2 key |
| **P1** | 578-678 | ✏ `HIGHLIGHT` handler: accept `usedFrameIds[]`, retry across frames, return structured `{ found, strategy, reason, matched }` |
| **P1** | 800-855 | ✏ `computeFrameScores()`: when `manualFrameIds` present, restrict scope strictly. Do not override manual selection with scoring |
| **P3** | ✂ 800-950 | Extract → `src/engines/frameResolutionEngine.js` (frame scoring, target resolution, scope logic) |
| **P4** | 891-944 | ✏ When `score === 0`, implement fallback priority: `hasChat` → `hasHelpRoot` → `hasArticle` → `!looksShell` → top |

---

### `src/snippet/a11y-audit-snippet.js` (3,738 lines)

| Phase | Lines | Change |
|-------|-------|--------|
| **P5** | All rule `add()` calls | ✏ Add `depthLevel`, `conversationalTag`, `confidence` to every rule's metadata object |
| **P5** | Rule registry (~50 rules) | ✏ Categorize each rule with depth level (1=core WCAG, 2=enhanced, 3=conversational-specific) |

---

### ➕ `src/engines/diffEngine.js` (P3)

Extracted from `panel.js:1870-2250`. Contains:

```
buildStableFindingSignature(finding, frameKeyStable)
findingSignatureEntries(prefix, snapshot, rawAppendix)
runSignatureEntries(snapshot, rawAppendix)
contrastSignatureEntries(snapshot, rawAppendix)
tabWalkSignatureEntries(snapshot, rawAppendix)
watchSignatureEntries(snapshot, rawAppendix)
observeSignatureEntries(snapshot, rawAppendix)
buildModeSignatureBundle(snapshot, rawAppendix)
mergeSignatureBundles(bundles)
computeCountsDelta(prevCounts, nextCounts)
diffModeBundles(prevBundle, nextBundle)
buildStepDiffs(step, prevStep, rawAppendix)
```

**Interface contract:**
- Pure functions — no DOM, no `chrome.*`, no global state
- Input: step/snapshot/rawAppendix objects
- Output: diff summaries, signature sets

---

### ➕ `src/engines/sessionEngine.js` (P3)

Extracted from `panel.js:2340-2810`. Contains:

```
createSession(id, opts)
addStep(session, stepData, rawAppendix)
endSession(session)
normalizeLoadedSession(raw)
migrateV3ToV4(session)
compactRawForSession(raw, mode)
softCompactSessionRawAppendix(session)
pruneSessionRawAppendix(session)
registerSnapshotRawAppendix(session, key, value)
resolveSnapshotRaw(snapshot, rawAppendix)
toModeSnapshot(capture, mode, capturedAt, targeting)
```

**Interface contract:**
- Pure functions + session state transitions
- No DOM, no `chrome.*`
- Persistence delegated back to panel.js via callback/return

---

### ➕ `src/engines/exportEngine.js` (P3)

Extracted from `panel.js:3000-3550`. Contains:

```
sortFindingsForExport(findings, ctx)
buildJunitTestsuiteXml(opts)
buildJunitXmlForRun(opts)
buildJunitXmlForSession(opts)
buildSessionMarkdown(session, rawAppendix)
buildMarkdown(bestEntry, perFrame, opts)
compactSessionForExport(session)
enrichRunJsonExport(result)
computeSignatureQuality(finding)
```

---

### ➕ `src/engines/highlightEngine.js` (P3)

Extracted from `panel.js:4344-4400` + new retry logic. Contains:

```
buildHighlightRequest(finding, frameId, usedFrameIds)
parseHighlightResult(response)
formatHighlightStatus(result) → { icon, text, reason }
```

Panel-side orchestration only — actual injection remains in `sw.js`.

---

### ➕ `src/engines/frameResolutionEngine.js` (P3)

Extracted from `sw.js:800-950`. Contains:

```
computeFrameScores(frames, profiles, opts)
chooseBestEntry(entries)
resolveTargetFrameIds(frames, scope, manualFrameIds, profiles)
applyManualOverride(frames, manualFrameIds)
scoreFallbackWhenZero(frames) // P4 addition
```

---

### ➕ `src/engines/coverageEngine.js` (P3)

Extracted from `panel.js:3700-3800`. Contains:

```
checkShadowCoverageChange(prevStep, currentStep)
formatShadowCoverage(coverage)
formatShadowCoverageWarning(prev, current)
computeSessionShadowWarnings(session)
```

---

### `src/shared/flow-profiles.js` (existing)

| Phase | Change |
|-------|--------|
| **P4** | ✏ Add `rootSelector`, `domSelectorsAny`, `urlIncludes`, `frameScope` to each profile definition |
| **P4** | ✏ Add `computeConfidence(matchHits)` function returning `{ matchScore, matchSignals, confidence }` |

---

### `src/shared/version.js` (existing)

| Phase | Change |
|-------|--------|
| **P1** | ✏ Add `STABLE_SIGNATURE_VERSION = 1`. Bump `SESSION_SCHEMA_VERSION` from 3 to 4. Bump `SESSION_SIGNATURE_VERSION` from 2 to 3 |
| **P1** | ✏ Add `FRAME_KEY_VERSION = 2` |

Note: version constants may live in `sw.js` — need to check and centralize into `version.js`.

---

### `panel.html` (272 lines)

| Phase | Change |
|-------|--------|
| **P2** | ✏ Add HUD save-status indicator element (small, persistent badge) |
| **P2** | ✏ Add per-row highlight status slot in findings table template |
| **P1** | ✏ Add "Try other frames" action button for highlight failures |

---

### `panel.css` (1,918 lines)

| Phase | Change |
|-------|--------|
| **P2** | ✏ Styles for save-status HUD indicator (green/yellow/red dot) |
| **P1** | ✏ Styles for inline highlight status per row (✓ / ✕ icons) |

---

### `test/` directory

| Phase | File | Change |
|-------|------|--------|
| **P1** | ➕ `test/stable-signatures.test.mjs` | Test `buildStableFindingSignature()`, test invariant: identical finding → identical stable sig |
| **P1** | ➕ `test/diff-from-stable-sigs.test.mjs` | Test diff computed from `stableFindingSignatureSet` matches expected. Test `diff(s) === diff(compact(s))` |
| **P1** | ➕ `test/compact-idempotent.test.mjs` | Test `compact(compact(x)) === compact(x)`. Test diff invariant under compaction |
| **P1** | ✏ `test/migration.test.mjs` | Add v3→v4 migration tests: stable sigs computed, frameKey upgraded, versions stamped |
| **P1** | ➕ `test/frame-key-v2.test.mjs` | Test `deriveFrameKey()` v2 produces stable identity without markerHash |
| **P1** | ➕ `test/highlight-retry.test.mjs` | Test retry across `usedFrameIds`, structured result parsing |
| **P1** | ✏ `test/diff-calc.test.mjs` | Update existing diff tests to validate stable-sig-based path |
| **P2** | ➕ `test/empty-state.test.mjs` | Test empty state derived from visible rows count, not filtered data |
| **P2** | ➕ `test/state-isolation.test.mjs` | Test bestFrameId per-record, filter reset on record change |
| **P3** | ✏ All existing tests | Update imports from `panel.js` context to engine module imports |
| **P3** | ➕ `test/engines/diffEngine.test.mjs` | Engine-level unit tests (no VM harness needed) |
| **P3** | ➕ `test/engines/sessionEngine.test.mjs` | Session lifecycle, migration, compaction |
| **P3** | ➕ `test/engines/exportEngine.test.mjs` | Export format validation |
| **P4** | ➕ `test/profile-confidence.test.mjs` | Profile confidence model tests |
| **P4** | ➕ `test/target-fallback.test.mjs` | Score-zero fallback priority tests |
| **P5** | ➕ `test/rule-metadata.test.mjs` | Verify all rules have depthLevel, conversationalTag, confidence |

---

### `docs/`

| Phase | File | Change |
|-------|------|--------|
| **P1** | ✏ `SESSION_MODEL.md` | Update step schema, add stableFindingSignatureSet section, update diff model |
| **P1** | ✏ `ARCHITECTURE.md` | Update frame key section, add highlight contract |
| **P3** | ✏ `ARCHITECTURE.md` | Update module inventory with engine files |
| **P4** | ➕ `PROFILES_V2.md` | Document profile confidence model, rootSelector contract |

---

## 3. Incremental Commit Structure

### Release v3.x+1 — Highlight + UI Correctness (P1.4 + P2)

```
commit 01  fix(highlight): accept frameId per record, retry across usedFrameIds
             - sw.js: HIGHLIGHT handler returns structured result
             - panel.js: highlightFinding() uses per-record frameId
             - test/highlight-retry.test.mjs

commit 02  fix(highlight): do not gate on path — allow testId-only highlights
             - sw.js: highlight injection tries testId when path missing
             - panel.js: remove path-required guard

commit 03  feat(highlight): show inline status per findings row
             - panel.html: add highlight status slot
             - panel.css: ✓/✕ icons
             - panel.js: renderExplorer() updates status after highlight

commit 04  fix(ui): empty state from visibleRowsCount, not filteredData
             - panel.js: renderExplorer() empty-state condition
             - test/empty-state.test.mjs

commit 05  fix(ui): bestFrameId per-record, filters reset on record change
             - panel.js: move bestFrameId into per-record scope
             - panel.js: resetFilters() on loadRecord()
             - test/state-isolation.test.mjs

commit 06  fix(ui): clear stale highlight state on past-run selection
             - panel.js: renderPastRuns() clears highlight indicators

commit 07  feat(ui): persistent save-status HUD indicator
             - panel.html: add status badge element
             - panel.css: green/yellow/red styles
             - panel.js: renderSaveStatus() on persist/error

commit 08  refactor(ui): enforce loadRecord → computeDerivedState → render pipeline
             - panel.js: centralize render triggers, remove render-time side effects
```

### Release v3.x+2 — Frame Stability + Manual Override (P1.2 + P1.3)

```
commit 09  refactor(frame): split frameKey into frameKeyStable + frameSignalsHash
             - sw.js: deriveFrameKey() returns { frameKeyStable, frameSignalsHash }
             - sw.js: store both in frame metadata
             - test/frame-key-v2.test.mjs

commit 10  refactor(frame): use frameKeyStable for identity continuity
             - sw.js: all frameKey-dependent logic uses stable portion
             - panel.js: signature functions use frameKeyStable
             - Update existing tests

commit 11  fix(frame): enforce manual override contract
             - sw.js: resolveTargetFrameIds() strictly restricts to manualFrameIds
             - sw.js: scoring does not override manual selection
```

### Release v4.0 — Stable Diff + Schema v4 (P1.1 + P3)

```
commit 12  feat(schema): introduce schemaVersion 4 and stableSignatureVersion 1
             - version.js: bump constants
             - panel.js: update startSession() to stamp v4

commit 13  feat(diff): introduce buildStableFindingSignature()
             - panel.js: new function: ruleId + severity + normalizedLocatorHash
             - test/stable-signatures.test.mjs

commit 14  feat(session): persist stableFindingSignatureSet into steps
             - panel.js: captureStepOptionC() computes and stores stable sigs
             - panel.js: persist severityCounts, blockingSet, summaryScore

commit 15  feat(diff): diff from stableFindingSignatureSet
             - panel.js: diffModeBundles() uses stable sigs when available
             - panel.js: fallback to raw-based diff for v3 sessions
             - test/diff-from-stable-sigs.test.mjs

commit 16  feat(migration): v3 → v4 on-load migration
             - panel.js: normalizeLoadedSession() calls migrateV3ToV4()
             - Recomputes stable sigs from raw, upgrades frameKeys
             - test/migration.test.mjs (new cases)

commit 17  test(compact): verify compact() preserves diff outcome
             - test/compact-idempotent.test.mjs
             - Invariant: diff(s) === diff(compact(s))
             - Invariant: compact(compact(x)) === compact(x)

commit 18  feat(export): include stableSignatureVersion + stepQuality in exports
             - panel.js: JUnit/Markdown/JSON exports include new fields
             - Backwards compatible: new fields with defaults

commit 19  refactor(engines): extract diffEngine from panel.js
             - src/engines/diffEngine.js
             - test/engines/diffEngine.test.mjs
             - panel.js: import and delegate

commit 20  refactor(engines): extract sessionEngine from panel.js
             - src/engines/sessionEngine.js
             - test/engines/sessionEngine.test.mjs
             - panel.js: import and delegate

commit 21  refactor(engines): extract exportEngine from panel.js
             - src/engines/exportEngine.js
             - test/engines/exportEngine.test.mjs

commit 22  refactor(engines): extract highlightEngine from panel.js
             - src/engines/highlightEngine.js (panel-side orchestration)

commit 23  refactor(engines): extract frameResolutionEngine from sw.js
             - src/engines/frameResolutionEngine.js

commit 24  refactor(engines): extract coverageEngine from panel.js
             - src/engines/coverageEngine.js

commit 25  refactor(panel): panel.js as orchestration + DOM binding only
             - Remove extracted logic, wire imports
             - Update test harness for new module structure

commit 26  docs: update SESSION_MODEL.md and ARCHITECTURE.md for v4
```

### Release v4.1 — Profiles v2 + Targeting (P4)

```
commit 27  feat(profiles): add confidence model to profile matching
             - flow-profiles.js: computeConfidence() returns { matchScore, matchSignals, confidence }
             - BUILTIN_PROFILES: return confidence per match

commit 28  feat(profiles): rootSelector as profile contract
             - flow-profiles.js: add rootSelector, domSelectorsAny, urlIncludes, frameScope
             - Deterministic influence on run config

commit 29  feat(session): persist profileLabel, profileConfidence, profileMatchSignals per step
             - sessionEngine.js: step metadata includes profile info
             - test/profile-confidence.test.mjs

commit 30  feat(targeting): improved fallback when score === 0
             - frameResolutionEngine.js: hasChat → hasHelpRoot → hasArticle → !looksShell → top
             - test/target-fallback.test.mjs

commit 31  feat(export): include profileConfidence in all export formats
```

### Release v4.1+ — WCAG Depth Prep (P5)

```
commit 32  feat(rules): add depthLevel, conversationalTag, confidence to all rules
             - a11y-audit-snippet.js: annotate ~50 rules
             - test/rule-metadata.test.mjs: verify completeness

commit 33  feat(filter): support filtering by depthLevel
             - panel.js: add depth filter to explorer
```

---

## 4. Regression Test Matrix

### Core Invariants (must pass at every commit)

| ID | Invariant | Test File | Phases |
|----|-----------|-----------|--------|
| **INV-01** | `diff(session) === diff(compact(session))` | `compact-idempotent.test.mjs` | P1+ |
| **INV-02** | `compact(compact(x)) === compact(x)` | `compact-idempotent.test.mjs` | P1+ |
| **INV-03** | Same finding → same stable signature (deterministic) | `stable-signatures.test.mjs` | P1+ |
| **INV-04** | rawAppendix never affects diff (when stable sigs present) | `diff-from-stable-sigs.test.mjs` | P1+ |
| **INV-05** | v3 sessions load and function correctly in v4 code | `migration.test.mjs` | P1+ |
| **INV-06** | Exported session JSON includes all required version fields | `junit-export.test.mjs` | P1+ |
| **INV-07** | Frame identity stable across steps when markers change | `frame-key-v2.test.mjs` | P1.2+ |

### Existing Tests (must not regress)

| Test File | Coverage | Risk Areas |
|-----------|----------|------------|
| `diff-calc.test.mjs` | Signature generation, diff counting, weak matching | P1 modifies diff path — high risk |
| `session-state.test.mjs` | Session lifecycle, state transitions | P1/P2 touch session state — medium risk |
| `junit-export.test.mjs` | JUnit XML format, CDATA escaping, CI status | P1 adds new metadata fields — low risk |
| `migration.test.mjs` | v1→v3 migration path | P1 adds v3→v4 — must keep v1→v3→v4 chain |
| `persistence.test.mjs` / `persistence-2.test.mjs` | Storage get/set, compaction tiers | P2 changes state management — medium risk |
| `race-conditions.test.mjs` | Concurrent capture safety | P1/P2 changes state — medium risk |
| `flow-profiles.test.mjs` | Profile matching, heuristic scoring | P4 modifies profiles — high risk in P4 |
| `coverage-diff-warning.test.mjs` | Shadow coverage change detection | P3 extracts to engine — low risk |
| `shadow-coverage.test.mjs` | Shadow DOM coverage tracking | P3 extracts to engine — low risk |
| `overlay-lifecycle.test.mjs` | Highlight overlay lifecycle | P1.4 modifies highlight — high risk |
| `review-status.test.mjs` | Finding review classification | Stable — low risk |
| `conversational-state-rules.test.mjs` | Conversational rule application | P5 adds metadata — low risk |
| `selector-batching.test.mjs` | DOM selector batching | Stable — low risk |
| `diagnostics.test.mjs` | Diagnostic payload | P1/P2 changes versions — low risk |
| `en-mapping.test.mjs` | EN301549 mapping | Stable — low risk |
| `wcag-coverage.test.mjs` | WCAG criteria tracking | Stable — low risk |
| `signature-shadow-quality.test.mjs` | Shadow signature quality | P1 touches signature logic — medium risk |
| `subtree-scan.test.mjs` | Shadow DOM subtree scanning | Stable — low risk |
| `subtree-shadow-elevation.test.mjs` | Shadow root elevation | Stable — low risk |
| `shadow-coverage-ui-logic.test.mjs` | Shadow coverage display formatting | P3 extract — low risk |
| `shadow-coverage-exports.test.mjs` | Shadow coverage in exports | P3 extract — low risk |

### New Tests per Phase

| Phase | New Test File | What It Validates |
|-------|---------------|-------------------|
| **P1.1** | `stable-signatures.test.mjs` | Stable signature determinism, format correctness |
| **P1.1** | `diff-from-stable-sigs.test.mjs` | Diff correctness from persisted sigs vs raw recomputation |
| **P1.1** | `compact-idempotent.test.mjs` | Compaction idempotency, diff preservation |
| **P1.2** | `frame-key-v2.test.mjs` | FrameKey v2 stability, v1→v2 upgrade |
| **P1.4** | `highlight-retry.test.mjs` | Multi-frame retry, structured result, testId-only |
| **P2.1** | `empty-state.test.mjs` | Empty state from visible row count |
| **P2.2** | `state-isolation.test.mjs` | Per-record bestFrameId, filter reset, stale state |
| **P3** | `engines/diffEngine.test.mjs` | Extracted diff engine (no VM harness) |
| **P3** | `engines/sessionEngine.test.mjs` | Extracted session engine |
| **P3** | `engines/exportEngine.test.mjs` | Extracted export engine |
| **P4** | `profile-confidence.test.mjs` | Profile confidence model |
| **P4** | `target-fallback.test.mjs` | Score-zero fallback priority chain |
| **P5** | `rule-metadata.test.mjs` | All rules have depth/tag/confidence |

### Smoke Test Checklist (Manual, per release)

| # | Scenario | Expected |
|---|----------|----------|
| S1 | Load v3 exported session JSON in v4 | Migrates silently, diffs match |
| S2 | Start session → 3 steps → export JSON | Schema v4, stable sigs present |
| S3 | Start session → 3 steps → export Markdown | Flow summary correct |
| S4 | Highlight finding with path | Cyan overlay appears in correct frame |
| S5 | Highlight finding with testId only (no path) | Cyan overlay appears |
| S6 | Highlight finding → DOM changed | Shows "Not found (DOM_CHANGED)" |
| S7 | Pin frame → audit → verify frame used | Only pinned frame scanned |
| S8 | 100+ step session → compact → diff | Diffs match pre-compaction |
| S9 | SPA navigation during session → auto step | Frame identity preserved |
| S10 | Switch between past runs | Filters reset, no stale highlight |
| S11 | Quota exceeded during persist | HUD shows red indicator |
| S12 | JUnit export → CI validation | Valid XML, correct attributes |

---

## 5. Risk Assessment per Phase

### Phase 1 — Correctness & Stability

| Sub-phase | Risk Level | Risk | Mitigation |
|-----------|------------|------|------------|
| **P1.1 Diff Engine** | **HIGH** | Changing signature format may break diff continuity for existing sessions. Off-by-one in migration could produce phantom diffs | 1. Dual-path: compute both old and stable sigs, assert equality during dev. 2. Migration computes stable sigs from raw — if raw missing, fall back to normalized counts. 3. Golden-file tests with real v3 session exports |
| **P1.1 Compaction** | **MEDIUM** | Compaction must preserve `stableFindingSignatureSet` (which lives on the step, not in rawAppendix). Risk: code that compacts steps might inadvertently strip new fields | 1. `stableFindingSignatureSet` stored directly on step object — compaction only touches rawAppendix. 2. Idempotency test is gate for merge |
| **P1.2 Frame Identity** | **MEDIUM** | Changing FrameKey format breaks session continuity for in-progress sessions upgraded mid-session | 1. Version-check FrameKey format. 2. v1 keys remain valid — v2 is a derived superset. 3. In-progress sessions keep v1 keys until ended |
| **P1.3 Manual Override** | **LOW** | Strictly enforcing manual override might prevent auto-recovery when pinned frame disappears | 1. If manual frame not found, warn user (don't silently fall back). 2. Clear pin on frame loss |
| **P1.4 Highlight** | **MEDIUM** | Retry across frames could cause confusing overlay in wrong frame | 1. Retry only within `usedFrameIds` (not all frames). 2. Return matched frame in result. 3. Show which frame was highlighted |

### Phase 2 — UI State Correctness

| Sub-phase | Risk Level | Risk | Mitigation |
|-----------|------------|------|------------|
| **P2.1 Empty State** | **LOW** | Minor — changing condition may flash empty state during async renders | 1. Use `requestAnimationFrame` guard. 2. Only update after VirtualTable completes render |
| **P2.2 State Leaks** | **MEDIUM** | Moving `bestFrameId` per-record may break highlight for users who rely on "highlight from current frame" behavior | 1. Per-record frameId is the one from the record's `bestEntry.frameId`. 2. Falls back to current frame if record lacks it |
| **P2.3 Save Status** | **LOW** | Minor UI addition — no data model risk | 1. Purely additive. 2. Falls back to toast if element missing |
| **P2.4 Render Pipeline** | **MEDIUM** | Refactoring render flow may introduce timing issues (flicker, stale state) | 1. Incremental — start with `loadRecord()` path only. 2. Keep existing render calls as fallback initially. 3. A/B test with `DEBUG_SESSION` flag |

### Phase 3 — Modular Core

| Sub-phase | Risk Level | Risk | Mitigation |
|-----------|------------|------|------------|
| **P3 Extraction** | **HIGH** | Extracting from monolithic panel.js may break closures, implicit state sharing, DOM references that leak into "pure" logic | 1. Extract one engine at a time — ship between each. 2. Each extracted function must pass all existing tests via both VM harness (old path) and direct import (new path). 3. Temporary dual-export during transition. 4. Build script must bundle engines into panel.js output |
| **P3 Build** | **MEDIUM** | esbuild must bundle new modules correctly for Chrome extension (no ESM in content scripts) | 1. Test build output with `npm run build && npm run package:audit`. 2. Keep IIFE/CommonJS output format |
| **P3 Harness** | **MEDIUM** | Test harness loads panel.js via VM — extracted modules need new import strategy | 1. Keep harness working for integration tests. 2. Add direct imports for engine unit tests. 3. Phase: engine unit tests first, then migrate integration tests |

### Phase 4 — Profiles v2

| Sub-phase | Risk Level | Risk | Mitigation |
|-----------|------------|------|------------|
| **P4.1 Confidence** | **LOW** | Additive — new metadata on profiles. Existing profiles unaffected | 1. Default confidence: `{ matchScore: 0, matchSignals: [], confidence: "low" }`. 2. Old profiles work without confidence model |
| **P4.2 RootSelector** | **MEDIUM** | New profile fields may change audit scope behavior if rootSelector is incorrectly applied | 1. rootSelector only narrows, never widens. 2. `null` rootSelector = no restriction (backward compatible). 3. Test with all BUILTIN_PROFILES |
| **P4.3 Fallback** | **MEDIUM** | Changing score-zero fallback may select different frame than v3 for some users | 1. Log selection reason. 2. Users can pin to override. 3. A/B: `selectionReason` includes `"v4_fallback_chain"` for traceability |

### Phase 5 — WCAG Depth Prep

| Sub-phase | Risk Level | Risk | Mitigation |
|-----------|------------|------|------------|
| **P5 Metadata** | **LOW** | Purely additive metadata on rules. No behavioral change | 1. Default `depthLevel: 1` for all existing rules (conservative). 2. Filtering is opt-in. 3. Missing metadata treated as depth 1 |

### Cross-Phase Risks

| Risk | Level | Description | Mitigation |
|------|-------|-------------|------------|
| **Data compatibility** | **HIGH** | Users with v3 sessions in `chrome.storage.local` must not lose data or see corrupted diffs | 1. `migrateV3ToV4()` is non-destructive (clone first). 2. Original v3 JSON in storage untouched until explicitly overwritten by new persist. 3. Export always includes `schemaVersion` |
| **Mid-session upgrade** | **MEDIUM** | User upgrades extension mid-session → session has mixed v3/v4 steps | 1. Session retains its original `schemaVersion` until ended. 2. New steps in existing v3 session use v3 format. 3. Migration applied on next session load |
| **Build/test infrastructure** | **MEDIUM** | esbuild + VM test harness may not handle new module structure cleanly | 1. P3 extraction gated on build passing `npm run ci`. 2. Parallel test paths during transition |
| **Performance** | **LOW** | Persisting `stableFindingSignatureSet` per step adds ~2-5KB per step | 1. Well within `MAX_SESSION_BYTES_ESTIMATE` (4.5MB). 2. Stable sigs are string arrays — compact |

### Phase Dependency Graph

```
P1.1 (Diff Engine) ──────┐
P1.2 (Frame Identity) ───┤
P1.3 (Manual Override) ───┼──→ v3.x+2
P1.4 (Highlight) ────────┘       │
                                  │
P2.1 (Empty State) ──────┐       │
P2.2 (State Leaks) ──────┤       │
P2.3 (Save Status) ──────┼──→ v3.x+1 (can ship in parallel with P1.2/P1.3)
P2.4 (Render Pipeline) ──┘       │
                                  ▼
P3 (Modular Core) ──────────→ v4.0 (requires P1 + P2 complete)
                                  │
P4 (Profiles v2) ───────────→ v4.1 (requires P3 complete)
                                  │
P5 (WCAG Depth) ────────────→ v4.1+ (requires P4, can ship independently)
```

---

## Appendix: Version Constant Updates

| Constant | v3 Value | v4 Value | Location |
|----------|----------|----------|----------|
| `SESSION_SCHEMA_VERSION` | 3 | 4 | `src/shared/version.js` (centralize from sw.js) |
| `SESSION_SIGNATURE_VERSION` | 2 | 3 | `src/shared/version.js` |
| `STABLE_SIGNATURE_VERSION` | — | 1 | `src/shared/version.js` (new) |
| `FRAME_KEY_VERSION` | 1 | 2 | `src/shared/version.js` |

## Appendix: Export Field Additions

All export formats (JSON, Markdown, JUnit) must include:

| Field | Phase | Required In |
|-------|-------|-------------|
| `schemaVersion: 4` | P1 | JSON, JUnit root attr, Markdown header |
| `signatureVersion: 3` | P1 | JSON, JUnit root attr |
| `stableSignatureVersion: 1` | P1 | JSON, Markdown header |
| `profileConfidence` | P4 | JSON per-step, Markdown per-step |
| `stepQuality` | P1 | JSON per-step |
