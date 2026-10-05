# FlowLens — Engine Rules

> **Audience:** Maintainers adding or modifying audit rules, anyone triaging findings by rule type.
>
> The audit engine is `src/snippet/a11y-audit-snippet.js` (installs `window.A11YFlowAudit`). It imports the C1–C4 evaluators from `src/engine/stateTransitionEngine.js`; the build bundles both into `dist/a11y-audit-snippet.js`. The full rule → WCAG map (`RULE_TO_WCAG`, 124 types) is in `src/shared/wcag-coverage.js`. Locate code by rule type or symbol name.

---

## Table of Contents

1. [RULE_REGISTRY](#1-rule_registry)
2. [Inline Rules](#2-inline-rules)
3. [Rule Behavior Notes](#3-rule-behavior-notes)
4. [Tab Walk Event Types](#4-tab-walk-event-types)
5. [How to Add a New Rule](#5-how-to-add-a-new-rule)
6. [FP Hotspots](#6-fp-hotspots)
7. [Fixtures and Expected Counts](#7-fixtures-and-expected-counts)

---

## 1. RULE_REGISTRY

Rules in `RULE_REGISTRY` have a dedicated `run` function and explicit confidence/level metadata. A finding may override the registry confidence (e.g. `FOCUS_VISIBLE_SUPPRESSED` is emitted as advisory).

| Type | WCAG | Level | Confidence |
|------|------|-------|------------|
| `FOCUS_VISIBLE_SUPPRESSED` | 2.4.7 | AA | heuristic |
| `LOADER_WITHOUT_ANNOUNCEMENT_HOOK` | 4.1.3 | AA | heuristic |
| `TOUCH_TARGET_TOO_SMALL` | 2.5.8 | AA | heuristic |
| `CLICK_WITHOUT_KEYBOARD` | 2.1.1 | A | heuristic |
| `FOCUS_MAY_BE_OBSCURED` | 2.4.11 | AA | advisory |
| `CONSISTENT_HELP_CHECK` | 3.2.6 | A | advisory |
| `ARIA_HIDDEN_FOCUSABLE` | 4.1.2 | A | strict |
| `IFRAME_MISSING_TITLE` | 4.1.2 | A | strict |

---

## 2. Inline Rules

A selection of rules implemented inline in `run()` with `add(findings, {...})` (not exhaustive — see `RULE_TO_WCAG` for every type).

| Type | WCAG | Severity |
|------|------|----------|
| `SHELL_OR_MINIMAL_UI` | — | info |
| `SHADOW_DOM_DETECTED` | — | info |
| `IMG_MISSING_ALT` | 1.1.1 | medium |
| `IMG_EMPTY_ALT` | 1.1.1 | low |
| `NO_ACCESSIBLE_NAME` | 4.1.2 | high |
| `FORM_CONTROL_NO_LABEL` | 1.3.1 / 3.3.2 / 4.1.2 | medium |
| `HEADING_LEVEL_SKIP` | 1.3.1 | medium |
| `NO_H1` | 1.3.1 | info |
| `MULTIPLE_H1` | 1.3.1 | info |
| `NO_MAIN_LANDMARK` | 1.3.1 | low |
| `REGION_NO_NAME` | 1.3.1 / 4.1.2 | low |
| `BROKEN_ARIA_REFERENCE` | 4.1.2 | medium |
| `ARIA_LABELLEDBY_POINTS_TO_ARIA_HIDDEN` | 4.1.2 | medium |
| `POSITIVE_TABINDEX` | 2.4.3 | low |
| `CHAT_LOG_NO_ARIA_LIVE_SOFT` | 4.1.3 | medium/low |
| `DISABLED_INPUT_NO_EXPLANATION` | 3.3.2 / 3.2.2 | low |
| `CHAT_MESSAGE_NO_ROLE` | 1.3.1 | low |
| `CHAT_INPUT_NO_LABEL` | 1.3.1 / 4.1.2 | medium |
| `CHAT_TIMESTAMP_INACCESSIBLE` | 1.3.1 | low |
| `HC_TREE_ITEM_NO_NAME` | 4.1.2 | high |
| `HC_TREE_NO_ARIA_EXPANDED` | 4.1.2 | medium |
| `HC_ARTICLE_NO_HEADING` | 1.3.1 / 2.4.6 | medium |
| `LIVE_REGION_HIDDEN` | 4.1.3 | medium |
| `COMBOBOX_NO_LISTBOX` | 4.1.2 | medium |
| `DUPLICATE_ID` | 4.1.1 | medium; high when ARIA-referenced |
| `NO_SKIP_NAV` | 2.4.1 | low |
| `MISSING_AUTOCOMPLETE` | 1.3.5 | low |
| `ARIA_REQUIRED_ATTR_MISSING` | 4.1.2 | medium |
| `TABLE_NO_HEADERS` | 1.3.1 | medium |
| `LABEL_NOT_IN_NAME` | 2.5.3 | medium |
| `MISSING_LANG` | 3.1.1 | medium |
| `VIEWPORT_ZOOM_DISABLED` | 1.4.4 | medium |
| `COMPETING_ASSERTIVE_LIVE` | 4.1.3 | medium |
| `DUPLICATE_MAIN_LANDMARK` | 1.3.1 | medium |
| `DUPLICATE_NAV_NO_LABEL` | 1.3.1 / 4.1.2 | medium |
| `DUPLICATE_BANNER` | 1.3.1 | low |
| `DUPLICATE_CONTENTINFO` | 1.3.1 | low |
| `HEADING_HIERARCHY_FRAGMENTED` | 1.3.1 | medium |
| `COMPETING_SKIP_NAV` | 2.4.1 | low |
| `SHADOW_DOM_FOCUS_ISSUE` | 2.1.1 / 4.1.2 | medium |
| `IFRAME_CROSS_ORIGIN` | — | info |
| `DRAGGABLE_NO_ALTERNATIVE` | 2.5.8 | medium |
| `REDUNDANT_ENTRY` | 3.3.7 | low |
| `TARGET_SIZE_AAA` | 2.5.5 | low |
| `ACCESSKEY_CHAR_SHORTCUT` | 2.1.4 | low |
| `SELECT_AUTO_SUBMIT` | 3.2.2 | medium |
| `PASTE_BLOCKED_INPUT` | 3.3.8 | medium |

---

## 3. Rule Behavior Notes

- **Accessible name** (`getAccName`, used by `NO_ACCESSIBLE_NAME`, `FORM_CONTROL_NO_LABEL`, `HC_TREE_ITEM_NO_NAME`, …) follows a simplified accname order: `aria-labelledby` → `aria-label` → native label / `alt` / value → content (only for roles that take their name from content) → `title` → `placeholder`. ID references resolve in the element's own tree, including shadow roots. Simplifications: no CSS-hidden detection inside the content walk, no recursion into embedded controls' values. Cases are pinned by `fixtures/accname-fixtures.html`.
- **`FOCUS_VISIBLE_SUPPRESSED`** flags a keyboard-reachable control only when author CSS (a stylesheet rule or inline style) removes its outline and no matching `:focus`/`:focus-visible` rule supplies a replacement (outline, box-shadow, border, background, text decoration). Controls the author never touched keep the browser ring and are not flagged. Rules in cross-origin stylesheets can't be read, so suppression there is missed rather than guessed. Emitted as `low` / advisory.
- **`TOUCH_TARGET_TOO_SMALL`** (2.5.8) flags targets under 24×24 px unless the spacing exception holds: a 24 px circle centred on the target overlaps no other target and no other undersized target's circle. Inline text links and targets inside a larger interactive ancestor are exempt.
- **Contrast** (`contrastScan`) blends translucent text (rgba alpha and cumulative ancestor `opacity`) toward the background; text with effective opacity 0 is skipped. When a background image or gradient sits behind the text, the item is kept as a sample with `bgUncertain: true` and a "verify manually" note — not reported as a failure.
- **`DUPLICATE_ID`** is tree-scoped: IDs are compared within the same document or shadow root, so the same ID in two shadow roots is not a duplicate. Severity is `high` when the ID is referenced by an ARIA attribute, else `medium`.
- **C1 (announcement integrity)** fires only when a chat container's message count grew and nothing would announce it. A feed with `role="log"` counts as announced (implicit polite live region). In Observe, which doesn't count announcement events, a live region in scope gets the benefit of the doubt; Watch counts announcements and can flag a live region that stayed silent. See [DEPTH_MODEL.md](./DEPTH_MODEL.md).

---

## 4. Tab Walk Event Types

Generated by `tabWalk()`. Blocking types are `TAB_BLOCKING_TYPES` (`src/panel/panel-00-core.js`).

| Type | Blocking? | Description |
|------|-----------|-------------|
| `possible_focus_trap` | Yes | Element appears multiple times in tab order — likely a focus loop |
| `non_dialog_focus_trap` | Yes | Focus loop outside a dialog — container traps focus |
| `roach_motel` | Yes | Focus enters but cannot leave |
| `dialog_focus_not_trapped` | Yes | Modal dialog is open but focus escapes to sibling content |
| `focus_on_body` | Yes | Focus returned to `<body>` — likely a loader chain issue |
| `focus_failed` | Yes | Element did not accept focus as expected |
| `focus_jump` | No | Focus jumped across distant subtrees |
| `focus_thrashing` | No | Many focus changes in short time — loader mount/unmount churn |
| `duplicate_in_order` | No | Element appears multiple times in tab order |
| `role_interactive_not_focusable` | No | `role=button/link` but element is not focusable |
| `dialog_no_focusables` | No | Open dialog with no focusable elements inside |

---

## 5. How to Add a New Rule

1. **Implement** the check in `run()` in `src/snippet/a11y-audit-snippet.js` with `add(findings, { type, el, severity, note, extra, fix })`. Rules that need dedicated logic and fixed confidence/level metadata get a `RULE_REGISTRY` entry (`{ id, wcag, level, confidence, run }`).
2. **Map it** in `RULE_TO_WCAG` (`src/shared/wcag-coverage.js`) with criterion, level, confidence and `depthLevel`; Depth 3 rules also need a `group`.
3. **Fix suggestion**: add an entry to `FIX_SUGGESTIONS` (`src/panel/panel-50-overlay.js`).
4. **Evidence** in `extra` must be serializable (no DOM references, no functions, no cycles) and bounded.
5. **Fixture**: add flagging and non-flagging cases to `fixtures/a11y-rule-fixtures.html`; if the rule has a tracked count, add it to `EXPECTED` in `scripts/e2e-smoke.mjs` and to [A11Y_RULE_FP_AUDIT.md](./A11Y_RULE_FP_AUDIT.md) §4.
6. **Verify**: `npm test`, `npm run build`, `npm run test:e2e`.

---

## 6. FP Hotspots

Full analysis: [A11Y_RULE_FP_AUDIT.md](./A11Y_RULE_FP_AUDIT.md).

| Rank | Rule | FP reason | Mitigation |
|------|------|-----------|------------|
| 1 | `FOCUS_VISIBLE_SUPPRESSED` | Cross-origin stylesheets are unreadable | Flags only author-removed outlines without a replacement; always advisory |
| 2 | `CLICK_WITHOUT_KEYBOARD` | Ancestor/global key handlers cannot be proven | Ancestor delegation treated as unproven (advisory, never strict) |
| 3 | `ARIA_HIDDEN_FOCUSABLE` | Focus guard sentinels and inert patterns | Exempts `data-focus-guard`, sentinel signatures, 1×1 guards; transition ticks downgraded to advisory |
| 4 | `TOUCH_TARGET_TOO_SMALL` | Cannot detect wrapper/pseudo hit areas | Heuristic; 2.5.8 spacing exception; inline text links exempt |
| 5 | `IFRAME_MISSING_TITLE` | Presentational/AT-ignored iframes | Exempts `aria-hidden="true"` and `role="presentation\|none"` |
| 6 | `LOADER_WITHOUT_ANNOUNCEMENT_HOOK` | DOM-presence heuristic only | Kept heuristic |
| 7 | `DUPLICATE_MAIN_LANDMARK` | Microfrontend composition with isolated mount islands | None — expected in MFE contexts |
| 8 | `HEADING_HIERARCHY_FRAGMENTED` | Stitched MFEs with independent heading roots | None — expected in MFE contexts |

---

## 7. Fixtures and Expected Counts

| Fixture | Checked by |
|---------|------------|
| `fixtures/a11y-rule-fixtures.html` — one `<section>` per rule or group, elements annotated `(should flag)` / `(should not flag)` | Rule counts in `scripts/e2e-smoke.mjs` |
| `fixtures/accname-fixtures.html` — `ok-*` must not trigger a name rule, `bad-*` must trigger the rule in `data-expect` | `scripts/e2e-smoke.mjs` |
| `fixtures/contrast-fixtures.html` — `fail-*` must be failures, `ok-*` must not | `scripts/e2e-smoke.mjs` |
| `fixtures/corpus/*.html` (app shell, chat, checkout) | `scripts/panel-e2e.mjs`, `scripts/spike-axe-compare.mjs` |

`npm run test:e2e` (after `npm run build`) runs the smoke and panel E2E in headless Chromium; CI runs them on every push. Manual check: open the fixture, paste `dist/a11y-audit-snippet.js` into the console, run `A11YFlowAudit.run({ strict: true })` and count `A11YFlowAudit.last.findings` by type.

### Expected counts (`EXPECTED` in `scripts/e2e-smoke.mjs`)

| Type | Count |
|------|------:|
| `FOCUS_VISIBLE_SUPPRESSED` | 1 |
| `CLICK_WITHOUT_KEYBOARD` | 7 |
| `ARIA_HIDDEN_FOCUSABLE` | 1 |
| `TOUCH_TARGET_TOO_SMALL` | 11 |
| `DUPLICATE_MAIN_LANDMARK` | 1 |
| `IFRAME_MISSING_TITLE` | 1 |
| `ACCESSKEY_CHAR_SHORTCUT` | 1 |
| `SELECT_AUTO_SUBMIT` | 1 |
| `PASTE_BLOCKED_INPUT` | 2 |
| `COMPETING_SKIP_NAV` | 1 |
| `HC_ACCORDION_NO_STATE` | 1 |

### Keyboard guardrail expectations

| Fixture element | Expected result |
|----------------|-----------------|
| `#badKeyboardFocusable` | `CLICK_WITHOUT_KEYBOARD` strict |
| `#badKeyboardButton` | `CLICK_WITHOUT_KEYBOARD` advisory (not keyboard reachable) |
| `#ancestorDelegatedButton` / `#delegatedButton` | advisory with `extra.activationUnproven=true` |
| `#selfHandledButton`, `#nativeKeyboardButton` | No `CLICK_WITHOUT_KEYBOARD` |

### Transition fixture

Trigger the overlay fixture and run `A11YFlowAudit.observe({ seconds: 2, intervalMs: 300 })`. If `ARIA_HIDDEN_FOCUSABLE` appears during the transition window, it must have `confidence=advisory` with `extra.duringTransition=true`.

### Signature stability fixture

| Element | Purpose |
|---------|---------|
| `#sigStableStrong` (`data-testid="sig-strong-control"`) | Strong identity — its signature must survive DOM reorder across Flow steps |
| `#sigStableWeak` | Weak identity (path only) — may churn after a reorder |
| `#insertSigSibling` | Inserts a sibling between Flow steps to test the above |
