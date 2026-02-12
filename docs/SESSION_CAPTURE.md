# FlowLens Session Capture (Phase 1)

## Overview
Session capture is additive to single-run audits. It records step-by-step SOP flow state with deterministic signatures and best-effort persistence.

Option C capture flow on `Mark step`:
1. Capture baseline `run`.
2. Capture active mode (`contrast|tabWalk|watch|observe`) if active mode is not `run`.
3. Compute per-mode and consolidated diffs against the previous step.
4. Append the step in memory.
5. Persist session state best-effort without blocking UI.

## Session Model
Implemented in `panel.js` as plain objects with JSDoc type hints:
- `Session`
- `Step`
- `ModeSnapshot`
- `Normalized`
- `DiffSummary`

Version fields:
- `schemaVersion` (current: `1`): bump when persisted session shape changes.
- `signatureVersion` (current: `1`): bump when issue-signature construction rules change.
- `frameKeyVersion` (current: `1`): bump when `frameKey` algorithm changes.

Session HUD (Export row, inline):
- `Session: active|none` with short session id when active
- `Steps: N • Last: HH:MM:SS`
- `Last mark-step: OK|PARTIAL|FAILED` plus short reason (`baseline failed`, `active failed`, `persist warn`, `raw capped`, etc.)

Storage keys:
- Active: `session::active::<origin>::<env>`
- Archive: `session::archive::<origin>::<env>::<sessionId>`

## FrameKey Algorithm
Implemented in `sw.js` with deterministic, `frameId`-independent keys:

`fk::v1::<origin>::<pathHint>::<markerHash8>`

- `origin`: frame URL origin (fallback parent origin / `about:blank`)
- `pathHint`: first stable URL segments with volatile numeric/UUID-like tokens normalized
- `markerHash8`: FNV-1a hash over stable selector/marker booleans

`frameId` is kept for debugging and targeting; session diff identity uses `frameKey`.
`frameKeyVersion` is persisted in session and snapshot targeting metadata for forward compatibility.

## Diff and Signatures
Signatures are mode-aware and deterministic:
- `run`: rule-centric signature with wcag/level/confidence/severity and normalized path/text fields
- `contrast`: failure-centric signature with ratio/required buckets and normalized node hints
- `tabWalk`: event-centric signature with event type/path/name/tabIndex bucket
- `watch`: verdict-first signatures plus focus-loss marker
- `observe`: finding signatures plus trend marker (`peak/jumps`)

Flow signature hardening:
- Primary signatures always include `frameKey`.
- Signature text normalization strips volatile UUID/number-like tokens before hashing.
- Path identity uses normalized path hash (`pathh:*`) instead of raw CSS paths.
- Findings without strong identity fields (e.g., no `testId` + weak path) receive:
  - `signatureQuality: low`
  - `weakSignature` fallback used only for Flow persistence matching (not Screen table identity).
- `signatureQuality` values: `high | medium | low` (low is surfaced as “may be unstable” in Flow markdown summary).

Diff output per mode and consolidated:
- `added`
- `fixed`
- `persisting`
- `weakMatched` (persisting matched via weak signature fallback)
- `blockingAdded`
- `blockingFixed`
- `countsDelta`

Each mode snapshot also stores targeting metadata (`scope`, `targetMode`, `pinned`, `helpCenterMatchEnabled`, `selectionReason`, `frameKeyVersion`, `usedFrameIds`) to explain best-frame selection in exports.

## Reliability and Caps
- No new scan modes.
- No retries for audit runs themselves.
- Frame-level failures are preserved per frame and do not crash step capture.
- Baseline `run` must succeed for a step to be accepted.
- Persistence failures are warnings only; session continues in memory.
- Raw payloads are bounded and stored canonically in `session.rawAppendix`.

Guardrail limits:
- `MAX_STEPS` (current: `100`): mark-step refuses new steps after the limit.
- `MAX_RAW_APPENDIX_ENTRIES` (current: `MAX_STEPS * 2`): protects long sessions from raw payload growth.
- `RAW_SOFT_COMPACT_KEEP_RECENT` (current: `30`): when at cap, raw refs are dropped from older steps first.
- If raw appendix is still capped, new step capture continues with normalized data only (raw omitted), non-fatal.
- Optional session size warning uses an approximate JSON byte estimate (`MAX_SESSION_BYTES_ESTIMATE`).

Raw appendix convention:
- `session.rawAppendix: Record<string, object>` stores compacted raw objects.
- Each `ModeSnapshot.best` stores `rawRef` only.
- Only best-entry raw per captured mode per step is stored.
- Legacy inline raw payloads are migrated/compacted during export.

Route hint (`Step.routeHint`) derivation:
- Prefer Help Center article hint (`articleId`/slug) when Help Center profile is active.
- Else use deterministic URL path hint (lowercase, volatile id-like tokens normalized, query/hash stripped).
- Else fallback to normalized `document.title`.
- Else `"(unknown)"`.

## Exports
- Session JSON: bounded session object.
- JSON includes `determinismMeta`:
  - versions (`schemaVersion`, `signatureVersion`, `frameKeyVersion`)
  - `totalSteps`
  - `perStepFrameKeys` as bounded `count + hash` records
  - `warnings[]` from non-fatal consistency checks (e.g., missing `usedFrameKeys`, version mismatch)
- Session Markdown: summary-first report including:
  - session metadata
  - blocking issue flow summary sorted deterministically by:
    1) blocking weight/severity bucket desc
    2) occurrences desc
    3) first seen step asc
    4) signature lexicographic
  - per-step diffs (`new/persisting/fixed` + blocking delta), route hint, compact targeting lines, and best snapshot details
  - frame appendix

## Debug Flag
- `DEBUG_SESSION` is dev-only and `false` by default in `panel.js` and `sw.js`.
- When enabled, logs metadata-only diagnostics (durations, frame counts, selection reason, persistence size outcomes).

## How To Use Sessions
1. Click `Start session`.
2. Navigate/operate the product and click `Mark step` for each checkpoint.
3. Click `End session` when done.
4. Export with `Session JSON` or `Session MD`.

HUD status semantics:
- `OK/-`: baseline and active snapshot recorded successfully.
- `PARTIAL/<code>`: baseline was recorded, but part of capture was degraded.
- `FAILED/<code>`: step was not recorded.

Common reason codes:
- `baseline:parse`
- `baseline:ok:false`
- `active:ok:false`
- `active:parse`
- `active:transport`
- `persist:quota`
- `persist:error`
- `raw:capped`

Raw cap behavior:
- Capture continues with normalized summaries when raw appendix is capped.
- `rawRef` may be omitted for new steps while diffs/export continue.

Slice B fixture expectation:
1. Capture 3 steps on `fixtures/a11y-rule-fixtures.html`.
2. Use `#insertSigSibling` between steps 1 and 2.
3. The strong-id control (`data-testid="sig-strong-control"`) should persist without churn.
4. Weak-id findings may rely on `weakMatched`; low-quality signatures should appear as potentially unstable in markdown summary.

Persistence/reset notes:
- Active key: `session::active::<origin>::<env>`
- Archive key: `session::archive::<origin>::<env>::<sessionId>`
- Basic reset: end session and clear extension storage for these keys.
