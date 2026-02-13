# FlowLens — Session Model

> Version 3.0.0 · Chrome DevTools extension for accessibility auditing (WCAG)
>
> **Audience:** Maintainers working on session capture, signature logic, diff algorithms, or export formatting.
>
> For the design-level overview of session capture, see [SESSION_CAPTURE.md](./SESSION_CAPTURE.md).

---

## Table of Contents

1. [Step Schema](#1-step-schema)
2. [ModeSnapshot Schema](#2-modesnapshot-schema)
3. [Signature Strategy](#3-signature-strategy)
4. [Blocking Logic](#4-blocking-logic)
5. [Diff Model](#5-diff-model)
6. [Caps and Compaction](#6-caps-and-compaction)
7. [Determinism Versioning](#7-determinism-versioning)
8. [Maintainer Guidelines](#8-maintainer-guidelines)

---

## 1. Step Schema

Each step captured by `Mark step` is stored as a `Step` object. Implemented in `panel.js` as plain objects with JSDoc type hints.

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique step ID |
| `index` | number | Step number (0-based) |
| `label` | string | User-provided label |
| `at` | ISO 8601 | Timestamp |
| `url` | string | Page URL at the moment of capture |
| `routeHint` | string | Auto-derived route hint (see below) |
| `snapshots.run` | ModeSnapshot | Baseline run snapshot |
| `snapshots.active` | ModeSnapshot \| null | Active mode snapshot (null if active mode = run) |
| `diffs.run` | DiffSummary | Diff of baseline vs. previous step |
| `diffs.active` | DiffSummary \| null | Diff of active mode vs. previous step |
| `diffs.consolidated` | DiffSummary | Merged diff across modes |
| `frameSelections` | object | `usedFrameIds`, `usedFrameKeys` |

### Route hint derivation

Priority order:
1. Help Center article hint (`articleId`/slug) — when helpcenter profile is active and an article ID is detected.
2. Normalized URL path hint — lowercase, volatile ID tokens normalized, query/hash stripped.
3. Normalized `document.title`.
4. `"(unknown)"` fallback.

---

## 2. ModeSnapshot Schema

Each mode captured per step produces a `ModeSnapshot`:

| Field | Type | Description |
|-------|------|-------------|
| `mode` | string | Mode name: `run`, `contrast`, `tabWalk`, `watch`, `observe` |
| `best` | object | `{ frameId, frameKey, normalized, rawRef }` — best-scoring frame entry |
| `perFrame` | array | Results per frame (compacted — raw data removed, only normalized summaries) |
| `targeting` | object | `{ scope, targetMode, pinned, helpCenterMatchEnabled, selectionReason, frameKeyVersion, usedFrameIds }` |

`best.rawRef` is a key into `session.rawAppendix` — only the best-entry raw per captured mode per step is stored. Legacy inline raw payloads are migrated/compacted during export.

---

## 3. Signature Strategy

Signatures are built per mode in `panel.js:1870-2128`. They provide deterministic identity for findings across steps and sessions.

### Signature formats per mode

| Mode | Signature format | Blocking? |
|------|-----------------|-----------|
| `run` | `run∣{frameKey}∣{type}∣{wcag}∣{confidence}∣{severity}∣{level}∣testid:{testId}∣pathh:{pathHash}∣{name}∣{note}` | `isRunFindingBlocking(f)` |
| `contrast` | `contrast∣{frameKey}∣{wcag}∣ratio:{bucket}∣required:{bucket}∣{tag}∣testid:{testId}∣pathh:{pathHash}∣{text}` | Always true |
| `tabWalk` | `tabwalk∣{frameKey}∣{type}∣pathh:{pathHash}∣{name}∣{note}∣tabi:{bucket}` | `TAB_BLOCKING_TYPES.has(type)` |
| `watch` | `watch∣{frameKey}∣{metric}∣b:{budget}∣v:{value}` + optionally `watch∣{frameKey}∣focus_loss∣v:{count}` | Always true |
| `observe` | `observe∣{frameKey}∣{type}∣{wcag}∣{severity}∣testid:{testId}∣pathh:{pathHash}∣{note}` + `observe∣{frameKey}∣trend∣peak:{bucket}∣jumps:{bucket}` | `isRunFindingBlocking(f)` / false (trend) |

Builder functions:
- `runSignatureEntries()` — `panel.js:~1900`
- `contrastSignatureEntries()` — `panel.js:~1956`
- `tabWalkSignatureEntries()` — `panel.js:~1988`
- `watchSignatureEntries()` — `panel.js:~2019`
- `observeSignatureEntries()` — `panel.js:~2061`

Merged via `buildModeSignatureBundle()` and `mergeSignatureBundles()` (`panel.js:2130-2175`).

### Signature quality

| Quality | Meaning |
|---------|---------|
| `high` | Finding has `testId` — strong, stable identity |
| `medium` | Good CSS path (not volatile) |
| `low` | Weak path — volatile/dynamic selectors; surfaced as "may be unstable" in Flow markdown |

### Stability mechanisms

- **Primary signatures always include `frameKey`** — ties identity to the frame, not the ephemeral `frameId`.
- **`normalizeIdentityText()`** strips volatile UUID/number-like tokens before hashing.
- **`pathHashForSig()`** (FNV-1a) replaces raw CSS paths — normalizes dynamic indices.
- **`bucketNumber()`** buckets numeric values — prevents micro-drift in floating-point comparisons.
- **Weak signature fallback**: findings with `signatureQuality: low` receive a `weakSignature` used only for Flow persistence matching (not Screen table identity).

---

## 4. Blocking Logic

### `isRunFindingBlocking(finding)`

Defined in `panel.js:1098-1105`:

```
1. severity ∉ {high, medium} → NOT blocking
2. confidence = advisory → NOT blocking
3. severity = high → BLOCKING
4. severity = medium AND confidence = strict → BLOCKING
5. severity = medium AND confidence = heuristic → NOT blocking
```

### Practical outcomes

| Severity | Confidence | Blocking? |
|----------|-----------|-----------|
| `high` | `strict` | **Yes** (highest priority) |
| `high` | `heuristic` | **Yes** (high severity overrides heuristic uncertainty) |
| `high` | `advisory` | No |
| `medium` | `strict` | **Yes** (deterministic medium = confirmed problem) |
| `medium` | `heuristic` | No |
| `medium` | `advisory` | No |
| `low` / `info` | any | Never blocking |

### Tab Walk blocking

`TAB_BLOCKING_TYPES` (`panel.js:122-129`): `possible_focus_trap`, `non_dialog_focus_trap`, `roach_motel`, `dialog_focus_not_trapped`, `focus_on_body`, `focus_failed`.

### Blocking in Flow

- Blocking signatures determine the flow summary in Session Markdown.
- Sorted by: `blockingWeight` desc → `occurrences` desc → `firstSeenStep` asc → signature lexicographic.
- `blockingAdded` / `blockingFixed` diff fields track blocking-only changes per step.

---

## 5. Diff Model

Diffs are computed per mode and consolidated in `diffModeBundles()` (`panel.js:2190-2250`).

### Diff fields

| Field | Description |
|-------|-------------|
| `added` | New findings — present in current step, absent in previous |
| `fixed` | Resolved findings — present in previous step, absent in current |
| `persisting` | Findings present in both steps (matched by primary signature) |
| `weakMatched` | Findings matched via weak signature fallback (low-quality identity) |
| `blockingAdded` | Subset of `added` that are blocking |
| `blockingFixed` | Subset of `fixed` that were blocking |
| `countsDelta` | Numeric change per metric: `findings`, `high`, `medium`, `low`, `info` |

### Matching algorithm

1. Build signature sets for current and previous step.
2. Match by primary signature (exact match).
3. For unmatched findings with `signatureQuality: low`, attempt weak signature matching.
4. Remaining unmatched in current = `added`; remaining unmatched in previous = `fixed`.

### Watch/Observe diffs

- **Watch** verdicts generate metric-based signatures: `watch∣{frameKey}∣{metric}∣b:{budget}∣v:{value}`.
- **Observe** trends generate: `observe∣{frameKey}∣trend∣peak:{bucket}∣jumps:{bucket}`.
- These participate in the same diff pipeline — a budget breach appearing in step N but not N-1 shows as `added`.

---

## 6. Caps and Compaction

### Session-level caps

| Cap | Value | Enforcement |
|-----|-------|-------------|
| `MAX_STEPS` | 100 | `mark-step` refuses new steps after the limit |
| `MAX_RAW_APPENDIX_ENTRIES` | 200 (2 × MAX_STEPS) | Protects against raw payload growth |
| `RAW_SOFT_COMPACT_KEEP_RECENT` | 30 | When at cap, raw refs are dropped from older steps first |
| `MAX_SESSION_BYTES_ESTIMATE` | 4.5 MB | Approximate session JSON size. Warning only, not a hard block |

### Raw appendix

- `session.rawAppendix: Record<string, object>` stores compacted raw objects.
- Each `ModeSnapshot.best` stores `rawRef` only (pointer into appendix).
- Only the best-entry raw per captured mode per step is stored.
- When the raw appendix is capped, new steps continue with normalized data only (`rawRef` omitted). Diffs and export continue — this is non-fatal.

### Per-mode raw caps

Applied by `compactRawForSession()`:

| Mode | Cap |
|------|-----|
| Run | 220 findings |
| Contrast | 120 failures + 40 samples |
| Tab Walk / Watch events | 200 |
| Watch verdicts | 80 |
| Observe snapshots | 140 |

### Record compaction (non-session)

`persistRecords()` (`panel.js:828-937`) progressively compacts audit records per origin:
- Tier 1: keep 50 records
- Tier 2: keep 25 records (on first quota exceeded)
- Tier 3: keep 10 records (on second quota exceeded)

---

## 7. Determinism Versioning

Session JSON includes `determinismMeta` for forward compatibility:

| Field | Current | Bump when |
|-------|---------|-----------|
| `schemaVersion` | `1` | Persisted session shape changes (field removed/moved) |
| `signatureVersion` | `1` | Issue-signature construction rules change |
| `frameKeyVersion` | `1` | Frame key algorithm changes (`deriveFrameKey` in `sw.js`) |

Additional fields: `totalSteps`, `perStepFrameKeys` (bounded count + hash records), `warnings[]` (non-fatal consistency issues).

Downstream tools should check version fields before processing a session to ensure compatibility.

---

## 8. Maintainer Guidelines

### Modifying signature logic

Signatures are built in `panel.js` `*SignatureEntries()` functions (see [§3](#3-signature-strategy) for locations).

Rules:
- **Bump `signatureVersion`** after any change to signature construction. This is persisted in `determinismMeta`.
- Signatures must be **deterministic** — identical finding must produce identical signature.
- Use `normalizeIdentityText()` for text field normalization.
- Use `pathHashForSig()` instead of raw CSS paths.
- Use `bucketNumber()` for numeric values to prevent float micro-drift.

### Modifying exports

**Single-run Markdown** — `buildMarkdown()` (`panel.js:2483`):
- Add new sections by appending (do not reorder existing sections).
- Add new fields by adding a new `lines.push()` — do not modify existing pushes.

**Session Markdown** — `buildSessionMarkdown()` (`panel.js:2350`):
- Flow summary sort order (`panel.js:2427-2434`) must remain deterministic: blockingWeight desc → occurrences desc → firstSeenStep asc → sig lexicographic.
- Add new columns by appending to the row template.
- Add new per-step sections by appending after existing `lines.push()` calls.

**Session JSON**:
- Add new fields with default values (not `undefined`) — backward compatible.
- **Bump `schemaVersion`** if you remove or move a field.
