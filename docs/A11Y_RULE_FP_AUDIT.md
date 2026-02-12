# A11Y Rule FP Audit and Precision Plan

## 1) FP Hotspots (ranked)

1. `FOCUS_VISIBLE_SUPPRESSED` (`RULE_REGISTRY.FOCUS_VISIBLE_SUPPRESSED.run`)
   - FP reason: used at-rest computed style only; ignored `:focus-visible` styles in stylesheets.
2. `CLICK_WITHOUT_KEYBOARD` (run block under `// 2.1.1 Keyboard`)
   - FP reason: assumed missing keyboard support from missing `tabindex` only; ignored delegated key handlers and actionable preconditions.
3. `ARIA_HIDDEN_FOCUSABLE` (run block under `// 4.1.2: aria-hidden="true" containing focusable elements`)
   - FP reason: flagged non-actionable focus guards/sentinels and elements not truly keyboard reachable.
4. `TOUCH_TARGET_TOO_SMALL` (`RULE_REGISTRY.TOUCH_TARGET_TOO_SMALL`, run block under `// 2.5.8 Target Size`)
   - FP reason: strict confidence despite not detecting wrapper/pseudo hit areas; also flagged inline text links where WCAG exceptions often apply.
5. `IFRAME_MISSING_TITLE` (run block under `// 4.1.2: Iframes missing title`)
   - FP reason: flagged presentational/aria-hidden iframes that are intentionally removed from accessibility tree.
6. `LOADER_WITHOUT_ANNOUNCEMENT_HOOK` (`RULE_REGISTRY.LOADER_WITHOUT_ANNOUNCEMENT_HOOK.run`)
   - FP potential: discovery is DOM-presence heuristic only; cannot prove runtime announcements.
7. `DUPLICATE_MAIN_LANDMARK` (run block under `// Duplicate main landmarks`)
   - FP potential in microfrontend composition where nested mount islands exist in isolated contexts.
8. `HEADING_HIERARCHY_FRAGMENTED` (run block under `// Heading hierarchy fragmentation`)
   - FP potential in stitched MFEs with independent heading roots.

## 2) Selected Fixes (implemented)

### Fix A: Focus-visible precision and evidence
- Rule: `FOCUS_VISIBLE_SUPPRESSED`
- Root cause: at-rest style checks missed authored focus selectors.
- Change:
  - Scans stylesheet rules for matching `:focus`/`:focus-visible` selectors.
  - Suppresses finding when matching selector provides visible indicator.
  - Downgrades unresolved result to `confidence: advisory`.
  - Adds bounded evidence in `finding.extra`: `matchedFocusRules`, `matchedIndicatorRules`, `scannedFocusRules`, `inaccessibleStylesheets`, outline/box-shadow state.
- Fixture test:
  - `#badFocusButton` should flag.
  - `.good-focus` should not flag.

### Fix B: Keyboard support on custom clickable controls
- Rule: `CLICK_WITHOUT_KEYBOARD`
- Root cause: broad click-role detection without reachability/actionability checks.
- Change:
  - Keeps native controls out of scope and evaluates only custom actionable controls.
  - Emits `strict` only when the control is keyboard reachable, clickable, and has no self keyboard activation evidence.
  - Treats ancestor/global key handling as unproven delegation and emits advisory (never strict).
  - Adds evidence: `hasClickHandler`, `clickHandlerScope`, `hasKeyHandlerSelf`, `hasKeyHandlerAncestor`, `keyHandlerScope`, `handlerDistance`, `activationKeysObserved`, `activationUnproven`, `tabIndex`, `keyboardReachable`.
- Fixture test:
  - `#badKeyboardFocusable` should flag strict/high.
  - `#badKeyboardButton` should flag advisory (not keyboard reachable).
  - `#ancestorDelegatedButton` should flag advisory with `keyHandlerScope=ancestor`.
  - `#selfHandledButton` should not flag.

### Fix C: aria-hidden focusable precision
- Rule: `ARIA_HIDDEN_FOCUSABLE`
- Root cause: flagged all focusables, including inert/sentinel patterns.
- Change:
  - Flags only keyboard-reachable actionable elements.
  - Exempts likely focus sentinels (`data-focus-guard`, sentinel signatures, 1x1 guards).
  - Avoids duplicates from nested `aria-hidden` containers.
  - During `observe()` transition ticks, downgrades otherwise-ambiguous hits to advisory (`duringTransition=true`) to avoid transition-window strict noise.
  - Adds evidence: `containerPath`, `focusableChildPath`, `containerRole`, `ariaHiddenValue`, `inertPresent`, `focusableType`, `reachabilityReason`, `duringTransition`, `tabIndex`, `keyboardReachable`, `actionable`.
- Fixture test:
  - `#badAriaHiddenButton` should flag strict/high.
  - `#inertAriaHiddenButton` should not flag strict (inert removes keyboard reachability).
  - `.focus-sentinel[data-focus-guard]` should not flag.
  - `#overlay-transition-fixture` driven via `observe()` should not produce strict transition-only noise.

### Fix D: Touch target severity/precision guardrails
- Rule: `TOUCH_TARGET_TOO_SMALL`
- Root cause: strict confidence with incomplete geometric knowledge.
- Change:
  - Rule confidence downgraded from `strict` to `heuristic`.
  - Exempts inline text link pattern (`display:inline`, in running text).
  - Skips targets with larger interactive ancestor proxy.
  - Adds evidence and honest fix guidance.
- Fixture test:
  - `#tinyIconButton` should flag.
  - `#inlineTextLink` should not flag.

### Fix E: Iframe title exemptions
- Rule: `IFRAME_MISSING_TITLE`
- Root cause: no exemption for AT-ignored iframe cases.
- Change:
  - Exempts `aria-hidden="true"` and `role="presentation|none"` iframes.
  - Adds deterministic evidence: `src`, `role`, `ariaHidden`, `titlePresent`.
- Fixture test:
  - `#iframeMissingTitle` should flag.
  - Presentational/aria-hidden fixture iframes should not flag.

## 3) Confidence and Severity Adjustments

- `FOCUS_VISIBLE_SUPPRESSED`: emitted as advisory when focus style cannot be proven.
- `TOUCH_TARGET_TOO_SMALL`: registry confidence changed to `heuristic`.
- `CLICK_WITHOUT_KEYBOARD`: strict only for clear unreachable role-controls; otherwise advisory with explicit verification note.
- `ARIA_HIDDEN_FOCUSABLE` and `IFRAME_MISSING_TITLE`: kept strict for clear deterministic cases only.

## 4) Validation Approach (A: fixtures + simple in-page script)

- Fixture file: `fixtures/a11y-rule-fixtures.html`
- Protocol:
  1. Open fixture in Chrome.
  2. Paste `a11y-audit-snippet.js` into DevTools console.
  3. Run `A11YFlowAudit.run({ strict: true })`.
  4. Run:
     ```js
     const byType = A11YFlowAudit.last.findings.reduce((m, f) => {
       m[f.type] = (m[f.type] || 0) + 1;
       return m;
     }, {});
     console.table(byType);
     ```
  5. Confirm expected counts:
     - `FOCUS_VISIBLE_SUPPRESSED`: 1
     - `CLICK_WITHOUT_KEYBOARD`: 3
     - `ARIA_HIDDEN_FOCUSABLE`: 1
     - `TOUCH_TARGET_TOO_SMALL`: 1
     - `DUPLICATE_MAIN_LANDMARK`: 1
     - `IFRAME_MISSING_TITLE`: 1
  6. Slice A transition fixture expectation:
     - Trigger overlay fixture and run `A11YFlowAudit.observe({ seconds: 2, intervalMs: 300 })`.
     - If `ARIA_HIDDEN_FOCUSABLE` appears during the transition window, it must be `confidence=advisory` with `extra.duringTransition=true`.
  7. Cross-origin edge manual check:
     - Run inside cross-origin iframe context and confirm `IFRAME_CROSS_ORIGIN` appears as `info`.
  8. Slice C keyboard guardrail expectations:
     - `#badKeyboardFocusable` => `CLICK_WITHOUT_KEYBOARD` strict.
     - `#badKeyboardButton` => `CLICK_WITHOUT_KEYBOARD` advisory.
     - `#ancestorDelegatedButton` / `#delegatedButton` => advisory with `extra.activationUnproven=true`.
     - `#selfHandledButton` and `#nativeKeyboardButton` => no `CLICK_WITHOUT_KEYBOARD`.

## 5) Verification Checklist

- [ ] `node --check a11y-audit-snippet.js` passes
- [ ] `node --check panel.js` passes
- [ ] Fixture counts match expected values above
- [ ] No strict-regression on deterministic rules (e.g., missing labels, missing `lang`, broken ARIA refs)
- [ ] Flow summary blocking now excludes advisory findings and de-weights heuristic findings
