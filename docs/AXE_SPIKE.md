# Spike: FlowLens snippet vs axe-core (2026-10)

**Question:** should FlowLens replace its own static (Depth 1) rules with axe-core?

**Recommendation:** not now. After the rule fixes made during this spike, the
snippet's catch rate on the corpus is comparable to axe's, and the snippet is
about 10× faster and has no dependency. Its precision is still worse, though.
The best next step is an **optional axe cross-check** (described below), not a
replacement. Re-run this spike on real production pages before you decide
for good.

## Method

`scripts/spike-axe-compare.mjs` runs both tools on every page of a corpus in
headless Chromium:

- **Snippet:** `run()` + `contrastScan()`, info-severity findings excluded.
- **axe:** `axe.run()`, violations only.

A tool *flags* an element when one of its findings resolves to exactly that
element. Shadow DOM is included.

Corpus pages annotate elements in one of two ways:

- `data-defect` (or `id="bad-*"` / `id="fail-*"`) marks a planted defect;
- `data-ok` (or `id="ok-*"`) marks an element that is correct but easy to get
  wrong.

The pages are `fixtures/corpus/{checkout,chat,appshell}.html` plus the
accname, contrast and rule fixtures in `fixtures/`.

```sh
npm i --no-save axe-core@4          # or any axe.min.js
AXE_PATH=node_modules/axe-core/axe.min.js node scripts/spike-axe-compare.mjs
```

## Results (axe-core 4.13.0)

| | planted defects caught | false positives on ok-elements | findings | time (6 pages) |
|---|---|---|---|---|
| snippet on `main` (before this branch) | 17 / 26 | **24 / 32** | 183 | ~115 ms |
| snippet on this branch | **23 / 26** | 4 / 32 | 75 | ~90 ms |
| axe-core | 18 / 26 | **0 / 32** | 27 | ~950 ms |

### What fixed the snippet's precision

The spike turned up three rule bugs, all fixed on this branch:

- **`FOCUS_VISIBLE_SUPPRESSED`** flagged every control with no outline at
  rest, which is almost every control, because the browser only draws the
  focus ring on `:focus-visible`. It now fires only when author CSS removes
  the outline and nothing replaces it. The fixture count went from 23 to 1,
  the one control the fixture intends to flag.
- **`TOUCH_TARGET_TOO_SMALL`** ignored the WCAG 2.5.8 spacing exception. The
  fixture count went from 23 to 11.
- **Shadow-root paths:** findings on top-level shadow-root children got
  ambiguous paths, so they resolved to (and highlighted) the wrong element.

### The 4 remaining snippet false positives

None is a clear error:

- `CHAT_LOG_NO_ARIA_LIVE_SOFT` is low-severity advice on a correct `role=log`.
- `TOUCH_TARGET_TOO_SMALL` fires on two adjacent default-size buttons inside
  a shadow root. It is arguably a real 2.5.8 issue; my annotation was about
  their names.
- `CLICK_WITHOUT_KEYBOARD` fires on a `role=button` whose inline `onkeydown`
  never mentions Enter or Space. The rule is advisory and the handler is
  unproven.
- `MISSING_AUTOCOMPLETE` fires on a postal-code input. This is a valid 1.3.5
  finding; my annotation targeted something else.

### Where axe is better

- **ARIA role requirements:** the snippet missed a `role=checkbox` without
  `aria-checked` because it skips zero-size elements. axe catches it.
- **Breadth:** axe ships about 100 maintained rules with a well-tested
  accessible-name implementation. It also reports "incomplete" (needs
  review) results instead of guessing.

### Where the snippet is better (on this corpus)

The snippet uses heuristics axe deliberately leaves out:

- placeholder-only labels;
- link text like "click here";
- `onclick` on a `div` without keyboard support;
- the second unlabeled `<nav>`.

On the remaining three, the two tools anchor the finding differently. axe
reports the problem but attaches it to a different element than the one I
annotated, so these cases undercount axe:

- broken `aria-describedby`;
- focusable content inside `aria-hidden`: axe reports it on the container;
- duplicate ids.

## Caveats (read before relying on the numbers)

- **The corpus is mine, written after reading the snippet's rules**, so it
  leans toward what the snippet checks. Expect axe to do relatively better
  on real pages.
- **n is small:** 26 defects and 32 ok-elements across 6 pages. Treat the
  table as directional evidence, not a benchmark.
- **Element-exact matching undercounts axe** where axe anchors a finding on
  an ancestor (see the previous section).
- No external pages could be tested: the sandbox has no general internet
  access.

## Costs of adopting axe

- **Size:** 580 KB (minified). It would be injected into every audited frame,
  so it has to be loaded lazily with a "has axe" guard.
- **Licence:** MPL-2.0. That needs a notice, and the vendor audits must
  allowlist it.
- **Rule ID mapping:** finding `type` values feed stable signatures, diffs,
  `wcag-coverage.js` and `en301549-map.js`. Switching would need a mapping
  layer, and every stored baseline would shift once.
- **Speed:** about 10× slower on these pages, and async. Observe ticks every
  600–900 ms, so axe could only run on the first and the settled tick.

## Suggested next step

Add an **"axe cross-check"** toggle, off by default:

1. Lazily inject axe only into the audited frame.
2. Run it once per Run (and on the settled tick of Observe).
3. Show its violations as a separate source (`source: "axe"`), mapped to WCAG
   success criteria.
4. Keep them out of stable signatures until the mapping has settled.

This gives users axe's breadth without touching FlowLens's flow/diff
machinery. It also builds up real-page data for the replace-or-not decision.
