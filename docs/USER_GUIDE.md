# FlowLens — User Guide

> Version 3.0.0 · Chrome DevTools extension for accessibility auditing (WCAG)
>
> **Audience:** QA engineers, developers, anyone running audits with FlowLens.

---

## Philosophy of FlowLens

FlowLens is built around three principles:

1. **Frame-aware, not page-naive.** Modern apps embed iframes, microfrontends, and help center widgets. FlowLens targets frames explicitly — you always know which frame was scanned and why it was selected.

2. **Confidence over volume.** Every finding carries a confidence lane (`strict`, `heuristic`, or `advisory`) so you can triage by certainty, not just severity. Blocking classification combines both — a high-severity heuristic finding blocks, but a medium-severity advisory never does.

3. **Flow, not just snapshot.** Single-run audits catch the current state. Flow sessions track how accessibility issues appear, persist, and resolve across a multi-step journey — with deterministic signatures that survive page reloads and DOM churn.

Everything runs locally. No network requests, no telemetry, no data leaves the browser.

---

## Table of Contents

1. [Audit Modes](#1-audit-modes)
2. [How to Use: Screen Audit](#2-how-to-use-screen-audit)
3. [How to Use: Flow Audit](#3-how-to-use-flow-audit)
4. [Scenarios](#4-scenarios)
5. [Confidence Lanes & Blocking](#5-confidence-lanes--blocking)
6. [Troubleshooting](#6-troubleshooting)
7. [Table Schema Reference](#7-table-schema-reference)

---

## 1. Audit Modes

### Snapshot Modes (Screen Audit)

| Mode | Shortcut | What it does | Duration |
|------|----------|-------------|----------|
| **Audit** (Run) | `R` | One-shot WCAG check — labels, ARIA, headings, landmarks, tab indexes, roles, duplicate IDs, focus-visible, touch targets, iframe titles, and more | ~2s |
| **Contrast** | `C` | Approximate color contrast scan for up to 250 text nodes. Checks AA/AAA ratios | ~3s |
| **Tab Walk** | `T` | Heuristic keyboard navigation simulation — walks up to 80 focusable elements, detects focus traps, focus-on-body, dialog issues, roach motels | ~5s |

### Flow Modes

| Mode | Shortcut | What it does | Duration |
|------|----------|-------------|----------|
| **Observe** | `O` | Re-runs audit checks every ~900ms for 12 seconds to catch dynamically rendered content and DOM fluctuations | 12s |
| **Watch** | `W` | Monitors loader chains, silent loading, and focus loss for 40 seconds. Measures bursts, total loading time, focus loss events | 40s |

### Quick Start Presets

| Preset | Modes | Use case |
|--------|-------|----------|
| **Audit + Contrast** | Run, Contrast | Quick regression check |
| **Watch + Observe + Audit** | Watch, Observe, Run | Pre-release full scan |
| **Tab Walk + Audit** | TabWalk, Run | Keyboard navigation focus |

Presets run modes sequentially via the **Quick Start** dropdown.

### Profiles

Profiles add product-specific frame heuristics and audit rules. Toggle them in Settings.

| Profile | Targets | Adds |
|---------|---------|------|
| **Help Center** | Frames with DOM selectors `[role='navigation'][aria-label]`, `main article`, `[role='main'] article` | Tree/article/bot-specific WCAG checks |
| **Chat** | Frames with DOM selectors `[role='log']`, `[role='feed']`, `textarea` | `role=log`, message boundary, input label checks |

Custom profiles can be defined via `customProfiles` in extension storage.

---

## 2. How to Use: Screen Audit

### Step 1: Choose target scope

1. Open the **FlowLens** panel in DevTools (F12 → FlowLens tab).
2. In the Target section, select **Scope** from the `target` dropdown:
   - **Primary frame** (default) — scans exactly one auto-selected frame. Scoring heuristics consider URL patterns, DOM selectors, and frame size.
   - **Host page only** — scans the top-level document only (`frameId=0`). Ignores iframes.
   - **Embedded frame only** — scans one detected/selected iframe. Uses pinned frame if set.
   - **All frames** — scans the host page and all embedded iframes.

### Step 2: Pin / manual frame selection

1. Click **Refresh frames** to refresh the available frame list.
2. To manually select a frame, pick it from the `frameSelect` dropdown.
3. Enable the **Pin frame** toggle to persist this selection per origin. A pinned frame acts as a manual override within the chosen scope.
4. **Copy frame URL** copies the selected frame's URL to clipboard.
5. **Targeting summary** (below the dropdowns) shows current state: scope, selected frame, pin status.

### Step 3: Select screen mode

Click a mode button (or use keyboard shortcut):
- **Audit** `[R]` — full one-shot WCAG audit
- **Contrast** `[C]` — color contrast scan
- **Tab Walk** `[T]` — keyboard navigation simulation

Or use **Quick Start** menu for a preset.

### Step 4: Run and interpret results

1. Click **Run Audit** (or the appropriate button for your mode). The progress bar shows execution status.
2. After completion:
   - **Run summary**: blocking issue count, strict/heuristic/advisory breakdown, timestamp, scope, frame.
   - **Severity badges**: color-coded (high=red, medium=orange, low=yellow, info=cyan). Click a badge to filter the explorer to that severity.
   - **Stats row**: numeric summary of high/medium/low/info counts.

### Step 5: Triage (filter / sort)

1. **Prioritized view**: click the "Prioritized" chip to show blocking issues only (high+strict or medium+strict). The `topBlockingAlert` bar shows the blocking count.
2. **All findings**: click the "All findings" chip to see the full list.
3. **Filters** (Explorer section):
   - **Text search** (`q`) — searches type, name, testId, wcag, path, note, product. Debounced 120ms.
   - **Severity** (`sev`) — filter by: high / medium / low / info.
   - **Product** (`prod`) — dynamically populated from findings (e.g., `chat`, `helpcenter`).
   - **Type** (`type`) — dynamically populated from findings.
   - **Unique** — deduplicates by finding hash.
4. **Sorting**: click a column header. ↑ = ascending, ↓ = descending, ↕ = unsorted.
5. **Highlight**: click a row — the element is highlighted on the inspected page (cyan overlay).
6. **Copy cell**: hover a cell — a copy button appears.

### Step 6: Export

The **Export ▼** menu (top-right of the results section):
- **Copy JSON** — copies the full result JSON to clipboard.
- **Copy Markdown** — copies formatted Markdown (top 10 findings + metadata).
- **Download JSON** — downloads a `.json` file: `a11yflowaudit-{timestamp}.json`.
- **Raw JSON** toggle — opens/closes raw JSON in the panel.

### Step 7: Rerun and determinism

- **Rerun** button repeats the last mode.
- "Deterministic" in FlowLens means:
  - **Frame keys** are generated independently of `frameId` (which changes on reload), based on origin + normalized path + DOM marker hash.
  - **Finding signatures** are stable thanks to normalization of volatile tokens (UUIDs, numbers) in path and text.
  - **Strict rules** produce identical results for identical DOM. Heuristic/advisory rules may vary with timing and computed styles.
  - **Contrast** and **Tab Walk** results depend on rendered state — they may differ if CSS/layout changed.

---

## 3. How to Use: Flow Audit

### When to use Flow Audit

Flow Audit is appropriate when:
- You are testing a **multi-step journey** (checkout, onboarding, help center navigation).
- You want to track **how issues appear and resolve** across steps (new/persisting/fixed).
- You need a **session report** with a full timeline of blocking signatures for review.
- You want to compare a11y state **before and after** an interaction/navigation.

### Step 1: Start a session

1. Ensure scope and frame targeting are configured (see Screen Audit, steps 1–2).
2. Select an **active mode** — the mode that will be captured alongside the baseline `run` (e.g., Contrast, Tab Walk, Observe, Watch).
3. Click **Start session** (● icon). The button changes to "Session active".
4. The **Session HUD** appears in the export row: session ID, step count, elapsed time.

### Step 2: Mark steps

1. Perform an interaction on the page (e.g., click a button, navigate to a new SPA route, open a modal).
2. Click **Mark step** — FlowLens will:
   - Run a baseline `run` audit.
   - If active mode ≠ `run`, also run the active mode snapshot.
   - Compute diffs vs. the previous step: `added`, `fixed`, `persisting`, `weakMatched`, `blockingAdded`, `blockingFixed`.
   - Register raw data in `session.rawAppendix`.
   - Persist the session to storage (best-effort).
3. A toast shows the baseline findings count. The HUD updates step count and status.

**Optional: Labels**
- The label field lets you describe the step (e.g., "Cart modal opened").
- If empty, `routeHint` is auto-derived from the URL path or Help Center article ID.

### Step 3: Route hint behavior

Route hints are derived automatically:
1. Help Center article hint (if helpcenter profile is active and an article ID/slug is detected).
2. Normalized URL path hint (lowercase, volatile ID tokens normalized, query/hash stripped).
3. Normalized `document.title`.
4. `"(unknown)"` as fallback.

### Step 4: Interpret diffs

After 2+ steps, diffs show issue evolution:
- **new** — appeared in the current step, absent in the previous.
- **persisting** — present in both the previous and current step.
- **fixed** — was in the previous step, gone in the current.
- **weakMatched** — matched via weak signature fallback (for findings with low-quality identity).
- **blockingAdded** / **blockingFixed** — same as above, but only for blocking findings.
- **countsDelta** — numeric change per metric (findings, high, medium, low, info).

### Step 5: Budgets (Watch/Observe)

- **Watch** measures: `bursts` (loader chain bursts), `totalLoadingMs` (total loading time), `silentMs` (silent loading), `focusLossCount` (focus loss events).
- **Observe** measures: `peak` (max findings count in a single snapshot), `jumps` (how many times the count increased).
- In session diffs, watch verdicts and observe trends generate their own signatures from metric + value.

### Step 6: End session and export

1. Click **End session** — the session is archived in storage.
2. Exports become available in the **Export ▼** menu:
   - **Session JSON** — downloads a `.json` file: `flowlens-session_{originSlug}_{env}_{date}-{time}.json`. Contains `determinismMeta`, `steps[]`, `rawAppendix`, `frames` index.
   - **Session MD** — copies Markdown to clipboard. Inline "Copied ✓" hint confirms. Contains:
     - Session metadata (origin, env, start/end, versions).
     - **Flow summary** — table of top 24 blocking signatures sorted: blockingWeight desc → occurrences desc → firstSeenStep asc → signature lexicographic.
     - **Per-step** — route hint, URL, modes, diff summary, targeting info, best frame score.
     - **Appendix** — frame keys per step.
3. Ended session export remains available via `sessionState.lastEndedSession` (in-memory, lost on panel refresh; archive persists in storage).

### Common session workflows

**Pre-release check:**
1. Start session on the landing page.
2. Walk through the happy-path flow (5–8 steps).
3. Mark step after each key state.
4. End session → export Session MD → review blocking signatures.

**Quarterly audit:**
1. Start session.
2. Systematically visit key pages/views (15–20 steps).
3. End session → export Session JSON → archive for comparison with next quarter.

---

## 4. Scenarios

### Screen Audit Scenarios

#### S1: Pre-release snapshot

**Goal:** Quick a11y audit before a version release.

**Steps:**
1. Open DevTools → FlowLens on the production/staging page.
2. Scope: **Primary frame** (auto-detect).
3. Quick Start → **Watch + Observe + Audit** (Release preset).
4. Wait ~55 seconds (Watch 40s + Observe 12s + Run 2s).
5. Check the **Run summary**: how many blocking issues? Compare with the previous release.
6. Click the **Prioritized** chip → review blocking findings.
7. For each high finding: click the row to highlight the element on the page.
8. **Export** → Copy Markdown → paste into PR/review.

**Signals:**
- Blocking count > 0 → requires attention.
- `CLICK_WITHOUT_KEYBOARD` strict → custom control missing keyboard support.
- Watch `focus_loss` → loader chain loses focus.
- Contrast failures with ratio < 3.0 → critical contrast issue.

**Export:** Markdown to PR description or Slack.

**Pitfalls:**
- If the page is behind an auth wall, ensure you are logged in before scanning.
- Watch (40s) may produce FP loader detection on pages with lazy-loaded content — check the `bursts` count.

#### S2: Quick regression check

**Goal:** Fast check after a code change — any new regressions?

**Steps:**
1. Open DevTools → FlowLens on the changed page.
2. Scope: **Primary frame**.
3. Quick Start → **Audit + Contrast** (Quick preset).
4. Wait ~5 seconds.
5. Compare the **Run summary** with results before the change (e.g., from record history).
6. Filter: severity=high. Check if new high findings appeared.
7. If yes: click the finding → highlight → fix.

**Signals:** New `NO_ACCESSIBLE_NAME` on an added button, new `FORM_CONTROL_NO_LABEL` on a new input.

**Export:** Copy JSON → compare diff locally.

**Pitfalls:**
- Records from history may be compacted (raw data lost) if the 20-per-origin limit was exceeded.

#### S3: Contrast-only pass

**Goal:** Color audit after a design/theme change.

**Steps:**
1. Open DevTools → FlowLens.
2. Scope: **All frames** (to check the full layout including iframes).
3. Mode: **Contrast** `[C]`.
4. Run → wait ~3 seconds.
5. Check the **Contrast section**: failures table.
6. Enable the **Show All** toggle → compare passing and failing ratios.
7. Click the row with the lowest ratio → highlight the element on the page.
8. Export Markdown → paste into a color issue ticket.

**Signals:**
- ratio < 3.0 with `large: false` → fail AA normal text.
- ratio < 4.5 with `large: false` → fail AAA normal text.
- ratio < 3.0 with `large: true` → fail AA large text.

**Pitfalls:**
- Contrast is approximate — does not handle gradients, background images, or opacity layering.
- Dark mode vs. light mode — check both separately.
- Max 250 nodes scanned — large pages may produce an unrepresentative sample.

---

### Flow Audit Scenarios

#### F1: Checkout journey

**Goal:** A11y audit of a full purchase flow (cart → address → payment → confirmation).

**Steps:**
1. Open DevTools → FlowLens on the cart page.
2. Active mode: **Tab Walk** (to check keyboard navigation in forms).
3. **Start session**.
4. Mark step: "Cart state".
5. Click "Proceed to address" → Mark step: "Address form".
6. Fill form → click "Next" → Mark step: "Payment".
7. Click "Place order" → Mark step: "Confirmation".
8. **End session** → Export Session MD.

**Signals:**
- `blockingAdded > 0` on the payment step → new issues in the payment form.
- `FORM_CONTROL_NO_LABEL` persisting → a label problem carries through the entire flow.
- Tab Walk `focus_failed` → focus trap in a modal/overlay.
- `fixed > 0` → issues from the previous step were "fixed" (element removed from DOM).

**Export:** Session MD to a ticket/Jira — contains the full timeline with diffs.

**Pitfalls:**
- SPA navigation may not refresh frames — use Refresh frames if the frame list is stale.
- If checkout uses iframes (e.g., Stripe), set scope to **All frames** or **Embedded frame only**.

#### F2: Help Center multi-iframe flow

**Goal:** Audit a help center with embedded iframes, article tree, and chat bot.

**Steps:**
1. Open DevTools → FlowLens on the page with the help center.
2. Settings → enable the **Help Center** profile (pill toggle).
3. Scope: **Embedded frame only** (targeting the help center iframe).
4. Refresh frames → select the frame whose URL contains `helpcenter`.
5. Active mode: **Observe** (12s monitoring of dynamic changes in the help center).
6. **Start session**.
7. Mark step: "Help center home".
8. Click a category → Mark step: "Category".
9. Open an article → Mark step: "Article".
10. Open the chat bot → Mark step: "Chat bot".
11. **End session** → Export Session JSON.

**Signals:**
- `HC_TREE_ITEM_NO_NAME` → missing accessible name on a tree item (high severity).
- `HC_ARTICLE_NO_HEADING` → article without a heading.
- `CHAT_LOG_NO_ARIA_LIVE_SOFT` → `role=log` without `aria-live`.
- Route hint should show the article ID/slug.

**Export:** Session JSON to archive — contains `determinismMeta` for cross-release comparison.

**Pitfalls:**
- Cross-origin iframes cannot be scanned — `IFRAME_CROSS_ORIGIN` (info) will appear.
- Pin the frame if the iframe changes `frameId` during navigation within the help center.

#### F3: Modal/overlay-heavy flow

**Goal:** Audit a flow with many modals/overlays (e.g., account settings, confirmation dialogs).

**Steps:**
1. Open DevTools → FlowLens on the page with modals.
2. Active mode: **Tab Walk** (to check focus trapping in dialogs).
3. Scope: **Host page only** (modals are typically host DOM).
4. **Start session**.
5. Mark step: "Baseline (no modals)".
6. Open modal A → Mark step: "Modal A open".
7. Close modal A → Mark step: "Modal A closed".
8. Open modal B (nested) → Mark step: "Modal B".
9. **End session** → Export Session MD.

**Signals:**
- `ARIA_HIDDEN_FOCUSABLE` strict appears when a modal is open and the background is not inert.
- Tab Walk `dialog_focus_not_trapped` → focus escapes the modal.
- Tab Walk `roach_motel` → user enters an element but cannot Tab out.
- `added` count after opening a modal → new issues in the modal DOM.
- `fixed` count after closing a modal → issues removed from DOM.

**Export:** Session MD for review with the frontend team.

**Pitfalls:**
- Modals with CSS `transition` may produce `ARIA_HIDDEN_FOCUSABLE` advisory with `duringTransition=true` — this is expected behavior, not a strict blocking finding.
- If the modal renders in an iframe, switch scope to **All frames** or **Embedded**.

---

## 5. Confidence Lanes & Blocking

### Confidence levels

| Level | Meaning | Triage priority |
|-------|---------|-----------------|
| `strict` | Deterministic, certain — the rule has enough data for a clear-cut decision | A — fix first |
| `heuristic` | Based on heuristics — may have false positives | B — verify manually |
| `advisory` | Informational — flags a potential issue without a hard assertion | C — nice-to-have |

### Blocking classification

A finding is **blocking** when:

| Severity | Confidence | Blocking? |
|----------|-----------|-----------|
| `high` | `strict` | **Yes** (highest priority) |
| `high` | `heuristic` | **Yes** (high severity overrides heuristic uncertainty) |
| `high` | `advisory` | No |
| `medium` | `strict` | **Yes** (deterministic medium = confirmed problem) |
| `medium` | `heuristic` | No |
| `medium` | `advisory` | No |
| `low` / `info` | any | Never blocking |

### Using blocking in triage

- In the panel, the **Prioritized** view filters to blocking findings only.
- The `topBlockingAlert` bar shows the count.
- In Flow session markdown, the **Flow summary** table lists the top blocking signatures sorted deterministically.

### Known FP hotspots

For detailed analysis, see [A11Y_RULE_FP_AUDIT.md](./A11Y_RULE_FP_AUDIT.md). Brief summary:

1. `FOCUS_VISIBLE_SUPPRESSED` — may flag when `:focus-visible` styles are in a cross-origin stylesheet.
2. `CLICK_WITHOUT_KEYBOARD` — ancestor/global key handlers treated as unproven delegation (advisory, not strict).
3. `ARIA_HIDDEN_FOCUSABLE` — focus guard sentinels (`data-focus-guard`, 1×1 elements) are exempted.
4. `TOUCH_TARGET_TOO_SMALL` — heuristic confidence; inline text links exempted.
5. `IFRAME_MISSING_TITLE` — presentational/aria-hidden iframes exempted.

---

## 6. Troubleshooting

### "It's scanning the wrong frame"

**Symptom:** Results are from the host page instead of the iframe (or vice versa).

**Fix:**
1. Check the **Scope** dropdown — switch to `Embedded frame only` for an iframe, or `Host page only` for the host.
2. Click **Refresh frames** to update the frame list.
3. Select the specific frame from the `frameSelect` dropdown.
4. Enable **Pin frame** to persist the selection per origin.
5. Check **Targeting summary** — it should confirm the selected frame.

**Context:** Frame scoring uses URL includes (+5), DOM selector matches (+10), and frame area (+0–3). The result can be non-obvious when an iframe has a large area but doesn't match the heuristics.

### "Host + iframe mixed results"

**Symptom:** Results contain findings from different frames.

**Fix:**
- **Best practice:** Use **Primary frame** (1 frame) or **Host page only** / **Embedded frame only** (clear separation).
- **All frames** combines results from all frames — `perFrame` in the JSON export shows per-frame results.
- The `best` entry in the summary represents the highest-scoring frame — other frames are visible only in raw JSON / exports.

### "No scope match"

**Symptom:** Error `NO_SCOPE_MATCH` — no frame matches the scope.

**Fix:**
1. Click **Refresh frames** — frames may have changed after navigation.
2. Check the scope: `Embedded frame only` requires an iframe on the page. If there are no iframes, switch to `Primary frame` or `Host page only`.
3. Check pin: if the pin points to a frame that no longer exists, disable pin.
4. `selectionReason` in the JSON export tells you exactly why: `no_frames`, `scope_embedded_missing`, `scope_host_missing`, `no_scope_match_manual_outside_scope`.

### "Partial frame failures"

**Symptom:** Status `PARTIAL` — some frames succeeded, some didn't.

**Fix:**
- Check `perFrame` in the JSON export — each frame has `ok: boolean`, `error`, `reason`.
- Common reasons: `INJECT_FAILED` (CSP/cross-origin blocks injection), `NO_API` (snippet not loaded), `EXEC_FAILED` (runtime error).
- Cross-origin iframes always return `INJECT_FAILED` — this is expected. `IFRAME_CROSS_ORIGIN` appears as an info finding.
- `perFrame[n].normalized` contains per-frame scoring — null if the frame failed.

### "Too many findings / noise"

**Symptom:** Hundreds of findings, hard to find the important ones.

**Fix:**
1. Click the **Prioritized** chip → filters to blocking only.
2. Filter severity: **high** first, then **medium**.
3. Use confidence lanes for triage (see [Confidence Lanes & Blocking](#5-confidence-lanes--blocking)).
4. Filter by **product** (e.g., `chat` for chat widget issues only).
5. Filter by **type** (e.g., `FORM_CONTROL_NO_LABEL` for missing labels only).
6. Enable the **Unique** checkbox to deduplicate repeating findings.

### "False positives vs. false negatives"

See [Confidence Lanes & Blocking](#5-confidence-lanes--blocking) for how confidence is assigned and [A11Y_RULE_FP_AUDIT.md](./A11Y_RULE_FP_AUDIT.md) for the full FP audit and precision plan.

### "Export problems"

**Clipboard:**
- Copy Markdown/JSON uses `navigator.clipboard.writeText()` with a fallback to `document.execCommand("copy")` via a hidden textarea.
- If clipboard fails: check that the DevTools panel has focus; check browser permissions.

**Download:**
- Download JSON creates a Blob + `URL.createObjectURL()` + anchor click.
- If download is blocked: check browser download settings and CSP.

**Ended session export:**
- Available only after clicking **End session**.
- `sessionState.lastEndedSession` holds the ended session in memory.
- After a panel refresh, the in-memory ended session is lost (the archive in storage is preserved).
- To export an archived session, load it from the `session::archive::` storage key.

### Performance caps

| Cap | Value | Why it exists |
|-----|-------|---------------|
| `MAX_STEPS` | 100 | Prevents unbounded session growth. `mark-step` refuses beyond the limit |
| `MAX_RAW_APPENDIX_ENTRIES` | 200 (2 × MAX_STEPS) | Protects against raw payload growth. Soft-compact keeps the last 30 steps |
| `MAX_SESSION_BYTES_ESTIMATE` | 4.5 MB | Approximate session JSON size limit. Warning only, not a hard block |
| Records per origin | 20 (in memory) | `persistRecords` compacts progressively: 50→25→10 records on quota exceeded |
| Contrast scan nodes | 250 | Limits scan time — `contrastScan({ limit: 250 })` |
| Tab Walk steps | 80 | Limits Tab simulation — `tabWalk({ steps: 80 })` |
| `CAPTURE_SLOW_MS` | 4000 ms | If mark-step takes > 4s, HUD shows "CAPTURING (SLOW)" |
| Raw findings per mode | 220 (run), 120+40 (contrast), 200 (tabWalk/watch events), 80 (watch verdicts), 140 (observe snapshots) | `compactRawForSession()` truncates excess |

---

## 7. Table Schema Reference

### Findings Explorer (Run / Observe)

| Column | Field | Description |
|--------|-------|-------------|
| sev | `severity` | `"high"` / `"medium"` / `"low"` / `"info"` — default sort (high first) |
| product | `product` | Product tag (e.g., `chat`, `helpcenter`) or null |
| type | `type` | Rule type (e.g., `"NO_ACCESSIBLE_NAME"`) |
| wcag | `wcag` | WCAG criterion (e.g., `"4.1.2"`) |
| name | `name` | Accessible name of the element |
| testId | `testId` | `data-testid` attribute value or null |
| path | `path` | CSS path to the element |
| note | `note` | Additional context |
| fix | `fix` | Suggested fix |

Additional fields in JSON export (not in the table UI): `level`, `confidence`, `role`, `tag`, `html`, `extra`.

### Contrast Table

| Column | Field | Description |
|--------|-------|-------------|
| ratio | `ratio` | Actual contrast ratio (e.g., 2.1) |
| req | `required` | Required ratio (4.5 AA normal, 3.0 AA large, 7.0 AAA normal, 4.5 AAA large) |
| large | `largeText` | Whether text is "large" (≥18pt or ≥14pt bold) |
| text | `text` | Text content (truncated) |
| tag | `tag` | HTML tag |
| testId | `testId` | data-testid |
| path | `path` | CSS path |
| note | `note` | Additional info |

### Tab Walk Table

| Column | Field | Description |
|--------|-------|-------------|
| i | `i` | Event index (Tab order) |
| type | `type` | Event type (see below) |
| tabIndex | `tabIndex` | Element's tabIndex value |
| name | `name` | Accessible name |
| path | `path` | CSS path |
| note | `note` | Event description |

**Tab Walk event types:**

| Type | Blocking? | Description |
|------|-----------|-------------|
| `possible_focus_trap` | Yes | Element appears multiple times in tab order — likely a focus loop |
| `non_dialog_focus_trap` | Yes | Focus loop outside a dialog — container traps focus |
| `roach_motel` | Yes | Focus enters but cannot leave — roach motel pattern |
| `dialog_focus_not_trapped` | Yes | Modal dialog is open but focus escapes to sibling content |
| `focus_on_body` | Yes | Focus returned to `<body>` — likely a loader chain issue |
| `focus_failed` | Yes | Element did not accept focus as expected |
| `focus_jump` | No | Focus jumped across distant subtrees |
| `focus_thrashing` | No | Many focus changes in a short time — loader mount/unmount churn |
| `duplicate_in_order` | No | Element appears multiple times in tab order |
| `role_interactive_not_focusable` | No | `role=button/link` but element is not focusable |
| `dialog_no_focusables` | No | Open dialog with no focusable elements inside |
