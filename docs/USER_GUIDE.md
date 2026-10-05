# FlowLens — User Guide

> **Audience:** QA engineers, developers, anyone running audits with FlowLens.

---

## Philosophy

1. **Frame-aware, not page-naive.** Apps embed iframes, microfrontends and widgets. FlowLens targets frames explicitly — you can always see which frame was scanned and why.
2. **Confidence over volume.** Every finding carries a confidence lane (`strict`, `heuristic`, `advisory`), so you triage by certainty, not just severity.
3. **Flow, not just snapshot.** The Flow tab tracks how issues appear, persist and resolve across a multi-step journey, using signatures that survive reloads and DOM churn.

Everything runs locally — see [Privacy](#7-privacy).

---

## Table of Contents

1. [The Panel](#1-the-panel)
2. [Snap: Auditing One Screen](#2-snap-auditing-one-screen)
3. [Flow: Auditing a Journey](#3-flow-auditing-a-journey)
4. [Settings](#4-settings)
5. [Keyboard Access](#5-keyboard-access)
6. [Confidence and Blocking](#6-confidence-and-blocking)
7. [Privacy](#7-privacy)
8. [Scenarios](#8-scenarios)
9. [Troubleshooting](#9-troubleshooting)
10. [Reference](#10-reference)

---

## 1. The Panel

Open DevTools (F12) → **FlowLens**. The panel has three tabs:

- **Snap** — run one audit mode on the current page.
- **Flow** — record a multi-step flow and compare steps.
- **Settings** — WCAG level, page type (depth and profiles under Advanced), frame targeting, Flow auto-capture and video, output, shortcuts, diagnostics and WCAG coverage.

---

## 2. Snap: Auditing One Screen

### Modes

Pick a mode from the Snap sub-tabs, then press the mode's button (e.g. **Run Audit**; it becomes **Rerun Audit** once a result exists).

| Sub-tab | Button | What it does | Duration |
|---------|--------|--------------|----------|
| **Audit** | Run Audit | One-shot WCAG check — names/labels, ARIA, headings, landmarks, tabindex, roles, duplicate IDs, focus visibility, target size, iframe titles, and more | ~2 s |
| **Contrast** | Check Contrast | Approximate contrast for up to 250 text nodes at the selected WCAG level | ~3 s |
| **Tab Walk** | Run Tab Walk | Tabs through up to 80 focusable elements; detects traps, focus on body, dialog issues; draws numbered tab stops on the page | ~5 s |
| **Observe** | Start Observe | Re-runs the audit about every second for 12 s to catch dynamic content | 12 s |
| **Watch** | Start Watch | Monitors loader chains, silent loading and focus loss | 40 s |

On an empty Snap tab, two presets run several modes in sequence: **Quick scan** (Audit + Contrast, ~5 s) and **Deep audit** (Watch + Observe + Audit, ~60 s).

### Reading results

- **Severity filters** above the table are toggle buttons (multi-select); each shows its count. Contrast uses All / Fail / Pass instead.
- **Integrity pills** (Announcements, Focus, Semantics, Multi-frame) appear when Depth 3 findings exist; click one to filter to that group, click again to clear.
- **Search** matches type, name, testId, WCAG, path, note and product. **Needs review** shows only heuristic/advisory findings.
- Duplicate findings are always collapsed. **Columns** hides/shows table columns; click a column header to sort.
- **Activate a row** (click, or Enter/Space) to expand it — details, fix suggestion, WCAG link — and highlight the element on the page. Cross-frame findings cannot be highlighted.
- Hover a cell to copy its value.

### Past runs, Raw JSON, Export

- **Past runs** lists saved results for this origin + environment; pick one to view it, delete one, or **Delete all**.
- **Raw JSON** shows the result object.
- **Export** (bottom of Snap): Download Markdown and Download JSON; after a Flow session ends, Session JSON, Session Markdown and Screenshots (.zip). With **Settings → Developer mode** on, the menu adds Copy JSON, Copy Raw, Download JUnit XML (with CI options), Session JUnit XML, Copy Session JSON and Diff Report JSON, and the Raw JSON sheet, the frame-selection reason and the diagnostics section appear.

### Determinism

Frame keys are derived from origin + normalized URL path, not the volatile `frameId`. Finding signatures normalize volatile tokens (UUIDs, numbers) and hash paths. Strict rules give identical results for an identical DOM; heuristic rules, Contrast and Tab Walk depend on rendered state and timing.

---

## 3. Flow: Auditing a Journey

Use Flow for checkouts, onboarding, wizards, help centers and chats — anything where issues appear and resolve across steps.

### Recording

1. Configure targeting if needed (Settings → Targeting).
2. Press **Record Flow** (or `r`). The current page is captured as the baseline step.
3. Walk the flow. With auto-capture on (default, Settings → Flow), a step is captured after each navigation, SPA route change, navigation inside an audited embedded frame, or — for widgets that don't change the URL — once a new screen holds stable. Settings → Flow also sets how long to wait after a navigation before capturing (0.5 s / 1 s / 2 s). Third-party sites (SSO, payment) are skipped by auto-capture.
4. Press **Mark step** (or `s`) to add a step by hand; you can then label it (Save / Skip). Manual steps capture the baseline audit plus the mode selected in Snap; auto-captured steps use Observe (Watch after a step that added blockers) and end early once the page settles.
5. Optional: turn on **Record a video with each flow** in Settings → Flow — Record Flow then asks which tab to record, and End downloads the local webm.
6. Press **End** (or `e` twice) to finish. The session is archived.

A step is recorded only if the baseline audit succeeds. The status line shows `OK`, `PARTIAL/<reason>` (recorded, but something degraded) or `FAILED/<reason>`. Sessions are limited to 100 steps.

### Reading a flow

- **Verdict** — PASS when no step introduced a blocking finding, else FAIL; also lists blocking issues that recur across steps.
- **Filmstrip** — viewport screenshot per step; select a tile to inspect that step.
- **Issue lifecycle** — one lane per issue across the steps where it is present.
- **Step list / step detail** — Appeared / Persisting / Resolved versus the previous step. **Only steps with unresolved blockers** shortens long flows. Steps can be deleted (×).
- **Compare sessions** — compare two archived sessions.

The first step is a baseline: its findings are not counted as regressions.

---

## 4. Settings

| Group | Setting | Notes |
|-------|---------|-------|
| Audit | WCAG level | 2.1 AA/AAA, 2.2 AA (default)/AAA |
| | Page type | Auto-detect (default), Chat widget, Help center, Help center + chat, Form / checkout / wizard — presets scope, depth and mode |
| | Advanced → Depth | 1 Fast, 2 Balanced, 3 Full (default) — filters which findings are shown |
| | Advanced → Profiles | Pills that add frame heuristics and profile-specific checks (`src/shared/flow-profiles.js`) |
| Targeting | Target scope | Primary frame (default, best-scoring frame), Host page only, Embedded frame only, All frames |
| | Frame | Pick a frame; **Pin** keeps it per origin across reloads; **Refresh**; **Copy URL**. The targeting summary shows scope, frame, pin and selection reason |
| Flow | Auto-capture | On by default — capture a step on each navigation; wait 0.5 s / 1 s / 2 s (default) before capturing |
| | Screen video | Off by default — record a local webm of a tab you pick with each flow; downloaded on End |
| Output | Log to console | Off by default — also print results to the inspected page's console |
| | Single-key shortcuts | On by default — see [Keyboard Access](#5-keyboard-access) |

**FlowLens Diagnostics** shows versions, scope, best frame, profile and root-selector state, with Copy diagnostics (JSON / Markdown) and **Copy CI JSON**. **WCAG Coverage** lists criteria the engine checks and the missing ones.

---

## 5. Keyboard Access

- The top tabs and Snap sub-tabs are tab lists: arrow keys, Home and End move between tabs.
- Finding rows are focusable: Tab into the table, ↑/↓ moves between rows, Enter/Space expands and highlights.
- Severity filters and **Needs review** are toggle buttons (`aria-pressed`). Status, progress and results counts are announced through live regions.
- The Export menu opens with Enter/Space/↓, closes with Escape.

**Single-key shortcuts** (ignored while typing in a field or when a modifier is held):

| Key | Action |
|-----|--------|
| `1` / `2` / `3` | Snap / Flow / Settings |
| `r` (Flow) | Record Flow |
| `s` (Flow) | Mark step |
| `e` (Flow) | End — press twice within 3 s |

There are no per-mode shortcuts. Turn single-key shortcuts off in **Settings → Output → Single-key shortcuts** if they clash with speech input or a screen reader (WCAG 2.1.4).

---

## 6. Confidence and Blocking

| Confidence | Meaning | Triage |
|------------|---------|--------|
| `strict` | Deterministic — clear-cut decision | Fix first |
| `heuristic` | May have false positives | Verify manually ("needs review") |
| `advisory` | Flags a potential issue without asserting it | Nice to have |

A finding is **blocking** when severity is `critical`/`high` and confidence is `strict` or `heuristic`, or severity is `medium` and confidence is `strict`. Advisory, low and info findings never block. Blocking drives the Flow verdict, JUnit failures and the CI report.

Known false-positive hotspots and the precision fixes are in [A11Y_RULE_FP_AUDIT.md](./A11Y_RULE_FP_AUDIT.md).

---

## 7. Privacy

- Audits run locally in the inspected page; nothing is uploaded and there is no telemetry. The only outbound request is a WCAG documentation link you click.
- The audit snippet writes nothing to the page console unless **Log to console** is on (page-side error/RUM tools capture console output).
- Screenshots are taken only while the inspected tab is the visible tab of its window, so an undocked DevTools never captures another tab. Auto-capture skips third-party sites.
- Results and sessions are stored in `chrome.storage.local`; screenshots and video in IndexedDB. Retention is bounded: 20 results per origin + environment, 25 origins, 30 archived sessions, media for the newest 5 sessions.
- Saved results keep short evidence (accessible names, an HTML excerpt); the CI JSON export contains no page text or DOM paths.

---

## 8. Scenarios

**Quick regression check.** Snap → **Quick scan**. Filter to high severity and compare with an earlier result from **Past runs**. Typical signals: new `NO_ACCESSIBLE_NAME` on an added button, new `FORM_CONTROL_NO_LABEL`.

**Pre-release check.** Snap → **Deep audit** (~60 s). Review blocking findings; activate rows to highlight elements; Export → Download Markdown for the PR. Watch `focus_loss` indicates a loader chain that drops focus.

**Contrast pass.** Settings → Target scope **All frames**; Snap → Contrast → Check Contrast. Filter Fail, highlight the lowest ratios. Text over gradients or images is reported as a sample with a "verify manually" note, not a failure. Check light and dark themes separately.

**Checkout journey.** Select Tab Walk in Snap, then Flow → Record Flow on the cart. Walk address → payment → confirmation (auto-capture records each page; press Mark step after in-page changes such as an opened modal). End → Session Markdown. Look for blocking findings that appear on the payment step and labels that persist across the flow. Hosted payment iframes on another site are third-party and are not auto-captured.

**Embedded help center or chat.** Pick the matching page type (or profile under Advanced), set scope to **Embedded frame only**, pick and pin the frame. Record the flow (home → category → article → bot). Signals: `HC_TREE_ITEM_NO_NAME`, `HC_ARTICLE_NO_HEADING`, `CHAT_LOG_NO_ARIA_LIVE_SOFT`. Cross-origin iframes can't be scanned from the host page (`IFRAME_CROSS_ORIGIN`, info) — target the frame itself.

**Modal-heavy flow.** Scope **Host page only**, Tab Walk selected. Mark steps with each modal open and closed. Signals: `ARIA_HIDDEN_FOCUSABLE` when the background isn't inert (advisory with `duringTransition=true` while a transition is running), Tab Walk `dialog_focus_not_trapped` and `roach_motel`.

More recipes for conversational UIs: [CONVERSATIONAL_RECIPES.md](./CONVERSATIONAL_RECIPES.md).

---

## 9. Troubleshooting

**Wrong frame scanned.** Check Settings → Target scope; Refresh the frame list; pick the frame and enable Pin; confirm in the targeting summary. In Primary scope a frame scores only through profile URL/DOM matches (+5 per URL match, +10 for a DOM match, up to +3 for size); with no match the top document wins.

**Mixed host + iframe results.** Use Primary, Host or Embedded scope for a clean separation. All frames combines frames; `perFrame` in the JSON export shows each frame.

**`NO_SCOPE_MATCH` / `MANUAL_FRAMES_MISSING`.** Refresh frames; Embedded scope needs an iframe; a pinned frame that no longer exists fails the run on purpose — unpin it. `selectionReason` in the JSON says why.

**Partial frame failures.** Each `perFrame` entry has `ok`, `error`, `reason` — e.g. `INJECT_FAILED` (page not scriptable), `NO_API`, `EXEC_TIMEOUT`. If every frame fails, the run reports `PAGE_NOT_SCRIPTABLE`, `AUDIT_TIMED_OUT` or `AUDIT_FAILED` instead of an empty pass.

**Too many findings.** Filter severity high, then medium; use **Needs review** to separate heuristics; use the integrity pills and search; lower Depth to 1 or 2.

**Export problems.** Clipboard needs the panel to have focus. Session exports appear after **End**; archived sessions can be compared under **Compare sessions**.

**Result not saved.** A toast reports when browser storage is full; old origins and sessions are evicted automatically (see Privacy).

---

## 10. Reference

### Caps

| Cap | Value |
|-----|-------|
| Steps per session | 100 |
| Contrast nodes | 250 |
| Tab Walk focusables | 80 |
| Observe / Watch | 12 s / 40 s (step captures end early once settled; Watch holds at least 8 s) |
| Saved results | 20 per origin + environment (compacted further if storage is tight), 25 origins |
| Archived sessions | 30 (media for the newest 5) |

Session internals (raw appendix caps, signatures, diffs): [SESSION_MODEL.md](./SESSION_MODEL.md).

### Findings table

Visible columns: **sev**, **wcag**, **name**, **type**. The expanded row and JSON export add `product`, `testId`, `path`, `note`, `fix`, `level`, `confidence`, `role`, `tag`, `html`, `extra`.

### Contrast table

`ratio`, `apca` (APCA Lc, informational), `req` (required ratio), `large` (≥ 18 pt or ≥ 14 pt bold), `text`, `tag`, `testId`, `path`, `note`.

### Tab Walk table and event types

Columns: `i`, `type`, `tabIndex`, `name`, `path`, `note`.

| Type | Blocking? | Description |
|------|-----------|-------------|
| `possible_focus_trap` | Yes | Element repeats in tab order — likely a focus loop |
| `non_dialog_focus_trap` | Yes | Focus loop outside a dialog |
| `roach_motel` | Yes | Focus enters but cannot leave |
| `dialog_focus_not_trapped` | Yes | Modal open but focus escapes |
| `focus_on_body` | Yes | Focus fell back to `<body>` |
| `focus_failed` | Yes | Element did not accept focus |
| `focus_jump` | No | Focus jumped across distant subtrees |
| `focus_thrashing` | No | Many focus changes in a short time |
| `duplicate_in_order` | No | Element appears multiple times in tab order |
| `role_interactive_not_focusable` | No | `role=button/link` but not focusable |
| `dialog_no_focusables` | No | Open dialog with nothing focusable |
