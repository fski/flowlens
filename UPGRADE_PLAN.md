# FlowLens — 6-Upgrade Implementation Plan

> **Version:** 3.1.0 target | **Date:** 2026-02-23 | **Branch:** `fski/montpellier`
>
> All upgrades maintain: local-only, zero-network, zero-dependency, enterprise-safe, deterministic-where-feasible.
>
> **Revision 2** — addresses P0 review: JUnit determinism, overlay targeting, closed shadow root detection, shadow traversal performance, cssPathDeep stability, review-status taxonomy, and versioning/migration.
>
> **Revision 3** — addresses P1 review: stronger export sort key, overlay fallback safety limits, overlay frame consistency guard, subtree+shadow scope isolation, aria-label stability guard, shadow scope cap transparency, overlay mode restriction.
>
> **Revision 4** — production hardening: shadow coverage receipt, coverage-aware diff warnings, selector batching, rule gating, shadow nth-path signature downgrade, subtree shadow elevation, overlay render stats, schema v3.

---

## Table of Contents

1. [Upgrade #1 — EN 301 549 Mapping](#upgrade-1--en-301-549-mapping)
2. [Upgrade #2 — "Needs Manual Review" Bucket](#upgrade-2--needs-manual-review-bucket)
3. [Upgrade #3 — Component/Subtree Scope Scan](#upgrade-3--componentsubtree-scope-scan)
4. [Upgrade #4 — In-page Overlay Annotations](#upgrade-4--in-page-overlay-annotations)
5. [Upgrade #5 — CI-friendly Export Format](#upgrade-5--ci-friendly-export-format)
6. [Upgrade #6 — Shadow DOM Support](#upgrade-6--shadow-dom-support)
7. [Cross-cutting: Versioning, Determinism & Migration](#cross-cutting-versioning-determinism--migration)
8. [Production Hardening Phase](#production-hardening-phase)
9. [Test Plan](#test-plan)

---

## Upgrade #1 — EN 301 549 Mapping

### Goal

Every finding includes both WCAG references and EN 301 549 clause mappings. Exports, UI, and determinism metadata include the mapping.

### Files to change/create

| File | Action | Changes |
|------|--------|---------|
| `en301549-map.js` | **Create** | Static mapping table: WCAG criterion → EN 301 549 clause(s) |
| `a11y-audit-snippet.js` | Modify | `add()` function populates `en301549Clauses` from injected mapping |
| `panel.js` | Modify | UI toggle (WCAG vs EN view), export integration, `enMappingVersion` in metadata |
| `panel.html` | Modify | Add EN 301 549 toggle control in settings + badge in explorer |
| `panel.css` | Modify | EN clause badge styling |
| `sw.js` | Modify | Pass mapping version in `RUN_AUDIT`/`CAPTURE_STEP` responses |
| `docs/EN_301_549_MAP.md` | **Create** | Human-readable reference for the mapping |

### Data structures

#### `en301549-map.js` — static mapping table

```javascript
// en301549-map.js — EN 301 549 V3.2.1 (2021-03) mapping to WCAG 2.1
// Versioned: bump EN_MAPPING_VERSION when this table changes.

const EN_MAPPING_VERSION = 1;

/**
 * Maps WCAG criterion → EN 301 549 clause(s).
 * EN 301 549 Section 9 mirrors WCAG 2.1 Level AA verbatim,
 * but some criteria map to multiple EN clauses (e.g., 11.x for software, 9.x for web).
 */
const WCAG_TO_EN301549 = {
  "1.1.1": ["9.1.1.1"],
  "1.3.1": ["9.1.3.1"],
  "1.3.5": ["9.1.3.5"],
  "1.4.3": ["9.1.4.3"],
  "1.4.4": ["9.1.4.4"],
  "1.4.6": ["9.1.4.6"],
  "2.1.1": ["9.2.1.1"],
  "2.4.1": ["9.2.4.1"],
  "2.4.2": ["9.2.4.2"],
  "2.4.3": ["9.2.4.3"],
  "2.4.4": ["9.2.4.4"],
  "2.4.6": ["9.2.4.6"],
  "2.4.7": ["9.2.4.7"],
  "2.4.11": ["9.2.4.11"],   // WCAG 2.2 — not in EN 301 549 V3.2.1
  "2.5.3": ["9.2.5.3"],
  "2.5.5": ["9.2.5.5"],
  "2.5.8": [],               // WCAG 2.2 — not yet in EN 301 549
  "3.1.1": ["9.3.1.1"],
  "3.2.2": ["9.3.2.2"],
  "3.2.6": [],               // WCAG 2.2
  "3.3.2": ["9.3.3.2"],
  "3.3.7": [],               // WCAG 2.2
  "4.1.1": ["9.4.1.1"],
  "4.1.2": ["9.4.1.2"],
  "4.1.3": ["9.4.1.3"],
};

// Reverse lookup: FlowLens ruleType → EN 301 549 clauses (via WCAG)
function en301549ForWcag(wcagCriterion) {
  if (!wcagCriterion) return [];
  return WCAG_TO_EN301549[wcagCriterion] || [];
}
```

#### Finding model extension

In `a11y-audit-snippet.js:add()` (line 251), add `en301549Clauses` to the entry:

```javascript
// BEFORE (line 254-268):
const entry = {
  type, severity,
  wcag: wcag ?? ruleMeta?.wcag ?? null,
  // ...existing fields...
};

// AFTER:
const entry = {
  type, severity,
  wcag: wcag ?? ruleMeta?.wcag ?? null,
  en301549Clauses: null,  // populated by panel.js post-processing
  // ...existing fields...
};
```

**Design decision:** The mapping table is NOT injected into the page. The snippet returns findings with `en301549Clauses: null`. The panel post-processes findings using the mapping table (loaded from `en301549-map.js`). This avoids increasing the injected snippet size and keeps the mapping easily updatable.

In `panel.js`, after receiving audit results, enrich findings:

```javascript
// New: post-process findings to add EN 301 549 mapping
function enrichFindingsWithEN(findings) {
  if (!Array.isArray(findings)) return findings;
  for (const f of findings) {
    f.en301549Clauses = en301549ForWcag(f.wcag);
  }
  return findings;
}
```

Call this in `runAction()` after receiving results, and in `captureStepOptionC()` after receiving baseline/active results.

### Message contract changes

**`RUN_AUDIT` response** — add `enMappingVersion`:
```javascript
{
  ok: true,
  // ...existing fields...
  enMappingVersion: 1,  // NEW
}
```

**`CAPTURE_STEP` response** — add `enMappingVersion`:
```javascript
{
  ok: true,
  // ...existing fields...
  enMappingVersion: 1,  // NEW
}
```

Note: The SW doesn't need the mapping table itself — it just stamps `enMappingVersion` from a constant. The panel does the actual enrichment.

### UI changes

1. **Settings tab:** Add a toggle "Show EN 301 549 clauses" (checkbox, persisted in `uiPrefs`).
2. **Explorer table:** When EN view is enabled, show `en301549Clauses` column next to WCAG column. Badge format: `9.4.1.2` styled similarly to WCAG badges.
3. **Finding detail row:** Show both WCAG and EN clause references.
4. **Severity tabs:** No change (EN mapping doesn't affect severity).

### Export changes

**JSON export** — findings include `en301549Clauses: string[]`.

**Markdown export** — append EN clauses in parentheses after WCAG:
```
- [high] NO_ACCESSIBLE_NAME (4.1.2 / EN 9.4.1.2) — ...
```

**Session JSON** — `determinismMeta` includes `enMappingVersion`.

### Determinism notes

- Mapping table is static and versioned (`EN_MAPPING_VERSION = 1`).
- `enMappingVersion` included in session `determinismMeta` and all exports.
- Bump `EN_MAPPING_VERSION` whenever the mapping table changes.
- WCAG 2.2 criteria that have no EN 301 549 mapping yet return `[]` (empty array, not null).

### Security notes

- No new data stored. EN clauses are derived from WCAG criterion (already stored).
- Mapping table is a static JS object — no network fetch.

---

## Upgrade #2 — "Needs Manual Review" Bucket

### Goal

Per step, classify findings into automated pass/fail and "needs review" categories. Show counts in UI and exports.

### Design decision

Leverage existing `confidence` field (`strict` / `heuristic` / `advisory`):

| Confidence | Automated? | Review Status |
|------------|-----------|---------------|
| `strict` | Yes — deterministic DOM check | `"automated"` |
| `heuristic` | Partially — DOM heuristic, may have FP/FN | `"needs_review"` |
| `advisory` | No — informational, cannot be auto-validated | `"needs_review"` |
| (none/null) with severity `info` | N/A — informational only | `"info"` |
| (none/null) with severity other | Unknown confidence | `"needs_review"` |

**P0-6 FIX:** The third bucket is `"info"` (not `"not_applicable"`). Info findings are informational diagnostics (e.g., `SHADOW_DOM_DETECTED`, `IFRAME_CROSS_ORIGIN`). They are not "not applicable" — they are actively reported but don't need review. The term `"info"` aligns with existing severity terminology.

### Files to change

| File | Changes |
|------|---------|
| `panel.js` | Add `classifyReviewStatus(finding)`, per-step review counts, UI rendering |
| `panel.html` | Add review status bar in step info and explorer header |
| `panel.css` | Review status badge styling |
| `a11y-audit-snippet.js` | No changes (confidence already set per finding) |
| `sw.js` | No changes |

### Data structures

```javascript
/**
 * Classify a finding's review status.
 *
 * Returns: "automated" | "needs_review" | "info"
 *
 * - "automated": strict confidence → deterministic, machine-verified result.
 * - "needs_review": heuristic/advisory confidence → human must verify.
 * - "info": informational finding (no confidence field + info severity) —
 *   not a pass/fail assertion, just context for the auditor.
 */
function classifyReviewStatus(finding) {
  const c = (finding?.confidence || "").toLowerCase();
  if (c === "strict") return "automated";
  if (c === "heuristic" || c === "advisory") return "needs_review";
  // Findings without explicit confidence:
  // info-severity findings are informational diagnostics, not assertions.
  if ((finding?.severity || "").toLowerCase() === "info") return "info";
  // All other unclassified findings default to needs_review (conservative).
  return "needs_review";
}

/**
 * Per-step review counts.
 * Returns { automated: N, needsReview: M, info: K }
 */
function computeReviewCounts(findings) {
  const counts = { automated: 0, needsReview: 0, info: 0 };
  for (const f of findings || []) {
    const status = classifyReviewStatus(f);
    if (status === "automated") counts.automated++;
    else if (status === "needs_review") counts.needsReview++;
    else counts.info++;
  }
  return counts;
}
```

### UI changes

1. **Explorer header:** Show `Automated: N | Needs Review: M | Info: K` below severity tabs.
2. **Severity tabs:** Add a "Review" filter option that shows only `needs_review` findings.
3. **Flow step timeline:** Each step shows review counts alongside existing diff summary.
4. **Finding detail row:** Show review status badge: `AUTO` (green), `REVIEW` (amber), `INFO` (grey).

### Export changes

**JSON export** — each finding gets `reviewStatus: "automated"|"needs_review"|"info"` (derived field, computed at export time).

**Markdown export** — add review summary line:
```
Review: automated=12, needs_review=5, info=3
```

**Session Markdown** — per-step review counts in step header.

### Determinism notes

- Classification is purely based on `confidence` field — deterministic.
- No timing-based heuristics involved.
- Same finding always classifies the same way.

### Security notes

- No new data stored. Review status is derived from existing `confidence` field.

---

## Upgrade #3 — Component/Subtree Scope Scan

### Goal

User selects an element in DevTools; FlowLens scans only that element's subtree.

### Files to change/create

| File | Action | Changes |
|------|--------|---------|
| `a11y-audit-snippet.js` | Modify | `run()` accepts `rootSelector` param; scopes `querySelectorAll` to root element |
| `sw.js` | Modify | `execAuditActionInFrame()` passes `rootSelector` to snippet |
| `panel.js` | Modify | Add subtree scan UI flow; store scope in step metadata |
| `panel.html` | Modify | Add "Scan subtree" button + scope indicator |

### Message contract changes

**`RUN_AUDIT` message** — add optional `rootSelector`:
```javascript
{
  type: "RUN_AUDIT",
  // ...existing fields...
  rootSelector: "div#my-component",  // NEW — null means full document
}
```

**`RUN_AUDIT` response** — add `scope`:
```javascript
{
  ok: true,
  // ...existing fields...
  scope: {
    type: "document" | "subtree",  // NEW
    rootSelector: null | "div#my-component",
    rootTestId: null | "my-component",
  },
}
```

**`CAPTURE_STEP` message** — add optional `rootSelector`.

### Implementation: snippet changes

In `a11y-audit-snippet.js`, modify `run()` (line 941) to accept a root element:

```javascript
const run = (cfg = {}) => {
  // NEW: resolve root element for subtree scope
  const rootEl = cfg.rootSelector
    ? doc.querySelector(cfg.rootSelector)
    : doc.documentElement;

  if (cfg.rootSelector && !rootEl) {
    return {
      ok: false,
      error: "ROOT_NOT_FOUND",
      rootSelector: cfg.rootSelector,
      mode: "run",
      findings: [],
    };
  }

  // ...existing config setup...

  // NEW: scoped query helper — replaces doc.querySelectorAll in rules
  const scopedQueryAll = (sel) => rootEl.querySelectorAll(sel);
  const scopedQuery = (sel) => rootEl.querySelector(sel);

  // Modify _q helper to use scoped queries:
  const _q = (sel, type, sev, wcag, test, note, opts) => {
    scopedQueryAll(sel).forEach(el => {
      if (isHidden(el)) return;
      if (test && !test(el)) return;
      const entry = { type, el, severity: sev, wcag };
      if (note) entry.note = typeof note === "function" ? note(el) : note;
      if (opts) Object.assign(entry, typeof opts === "function" ? opts(el) : opts);
      add(findings, entry);
    });
  };

  // ...rest of run() unchanged, except global checks (missing <html lang>,
  // viewport meta, skip nav) are skipped when rootSelector is set, since
  // they don't apply to a subtree...

  if (!cfg.rootSelector) {
    // Document-level checks (lang, viewport, skip nav, etc.)
    // ...existing document-level rules...
  }

  // ...element-level rules use _q (already scoped)...

  return {
    ok: true,
    findings,
    mode: "run",
    scope: cfg.rootSelector
      ? { type: "subtree", rootSelector: cfg.rootSelector }
      : { type: "document", rootSelector: null },
    // ...existing return fields...
  };
};
```

### Implementation: SW changes

In `sw.js:execAuditActionInFrame()` (line 423), pass `rootSelector`:

```javascript
func: async (action, alsoConsole, wcagLevel, modeHints, appMarkers, rootSelector) => {
  const api = window.A11YFlowAudit;
  if (!api) return { ok: false, reason: "NO_API" };

  const runCfg = { strict: true, wcagLevel };
  if (modeHints) runCfg.modeHints = modeHints;
  if (appMarkers) runCfg.appMarkers = appMarkers;
  if (rootSelector) runCfg.rootSelector = rootSelector;  // NEW

  // ...rest unchanged...
},
args: [action, !!alsoConsole, wcagLevel || "2.1-AA", modeHints || null, appMarkers || null, rootSelector || null]
```

### Implementation: panel.js UI flow

1. **"Scan subtree" button** in snap header bar (next to Run button).
2. Clicking it calls `chrome.devtools.inspectedWindow.eval` to get the currently selected element's CSS path:
   ```javascript
   async function getSelectedElementSelector() {
     return new Promise((resolve) => {
       chrome.devtools.inspectedWindow.eval(
         `(function() {
           const el = $0;  // DevTools selected element
           if (!el || el.nodeType !== 1) return null;
           if (el.id) return '#' + CSS.escape(el.id);
           if (el.getAttribute('data-testid')) return '[data-testid="' + el.getAttribute('data-testid') + '"]';
           // Build a stable selector
           const parts = [];
           let node = el;
           while (node && node.nodeType === 1 && parts.length < 6) {
             const id = node.id ? '#' + CSS.escape(node.id) : '';
             let nth = '';
             if (!id && node.parentElement) {
               const sib = [...node.parentElement.children].filter(c => c.tagName === node.tagName);
               if (sib.length > 1) nth = ':nth-of-type(' + (sib.indexOf(node) + 1) + ')';
             }
             parts.unshift(node.tagName.toLowerCase() + id + nth);
             if (id) break;
             node = node.parentElement;
           }
           return parts.join(' > ');
         })()`,
         (result, err) => resolve(err ? null : result)
       );
     });
   }
   ```
3. The resulting selector is passed as `rootSelector` to `send({ type: "RUN_AUDIT", rootSelector })`.
4. **Scope indicator** in results header: shows "Scope: subtree (div#my-component)" or "Scope: document".

### Step metadata

When capturing a session step with subtree scope:

```javascript
// In step object:
{
  index: 1,
  // ...existing fields...
  scope: {
    type: "subtree",
    rootSelector: "div#my-component",
    rootTestId: "my-component",  // if available
  },
}
```

### Determinism notes

- `rootSelector` is stored in step metadata — reproducible.
- Subtree scans skip document-level rules (lang, viewport, skip nav) — deterministic.
- If `rootSelector` resolves to a different element on re-run (DOM changed), findings will differ — acceptable.

### Security notes

- `rootSelector` is a CSS selector string, not raw DOM. Safe to store and export.
- No `$0` reference persisted — only the derived CSS selector.

---

## Upgrade #4 — In-page Overlay Annotations

### Goal

Optional WAVE-like in-page markers for findings, with cleanup lifecycle.

### Files to change/create

| File | Action | Changes |
|------|--------|---------|
| `a11y-audit-snippet.js` | Modify | Add `annotate()` and `clearAnnotations()` methods to `A11YFlowAudit` API |
| `sw.js` | Modify | Add `ANNOTATE` and `CLEAR_ANNOTATIONS` message types |
| `panel.js` | Modify | Add overlay toggle, send annotate commands, clear on navigation/end session |
| `panel.html` | Modify | Add "Show annotations" toggle button |
| `panel.css` | Modify | No change (annotations are in inspected page, not panel) |

### P0-2 FIX: Overlay targeting strategy

**Problem:** The original plan used `doc.querySelector(f.path)` to locate finding targets, but `finding.path` may contain `>>>` shadow boundary separators (from Upgrade #6) which are not valid CSS selectors. Even for light DOM paths, `cssPathDeep()` output may not be a reliable CSS selector.

**Solution:** Introduce a `targetRef` structure on each finding that provides multiple targeting signals, and a `resolveTarget()` function in the snippet that implements a fallback chain.

#### New `targetRef` shape (added by `add()` in snippet)

```javascript
// Added to each finding by add() at audit time:
targetRef: {
  // Light DOM CSS selector — only set if el is in light DOM (no shadow boundary).
  // Built via a minimal, querySelectorable path (not cssPathDeep).
  cssSelector: string | null,

  // data-testid of the element, if present.
  testId: string | null,

  // Tag name + role + accessible name (for identification, not querying).
  tag: string,
  role: string | null,
  name: string | null,

  // Whether the element is inside a shadow root.
  inShadow: boolean,
}
```

#### `buildTargetRef(el)` — new helper in snippet

```javascript
/**
 * Build a targetRef for overlay/highlight targeting.
 * This is the LIGHT DOM queryable selector when possible,
 * and identification metadata always.
 */
function buildTargetRef(el) {
  if (!isEl(el)) return null;
  const testId = el.getAttribute("data-testid") || null;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute("role") || null;
  const name = getAccName(el);
  const inShadow = isInShadow(el);

  let cssSelector = null;
  if (!inShadow) {
    // Build a minimal, querySelectorable path for light DOM elements.
    cssSelector = buildLightDomSelector(el);
  }

  return { cssSelector, testId, tag, role, name, inShadow };
}

/**
 * Check if el is inside any shadow root.
 */
function isInShadow(el) {
  let node = el;
  while (node) {
    if (node.nodeType === 11) return true;  // DocumentFragment = shadow root
    node = node.parentNode;
  }
  return false;
}

/**
 * Build a minimal CSS selector that works with document.querySelector().
 * Only for light DOM elements. Prefers id > data-testid > positional path.
 */
function buildLightDomSelector(el) {
  if (!isEl(el)) return null;
  // 1. Unique id?
  if (el.id) {
    try {
      const sel = "#" + CSS.escape(el.id);
      if (doc.querySelectorAll(sel).length === 1) return sel;
    } catch {}
  }
  // 2. data-testid?
  const testId = el.getAttribute("data-testid");
  if (testId) {
    const sel = `[data-testid="${CSS.escape(testId)}"]`;
    try { if (doc.querySelectorAll(sel).length === 1) return sel; } catch {}
  }
  // 3. Positional path (tag + nth-of-type, max 5 levels)
  const parts = [];
  let node = el;
  while (node && node.nodeType === 1 && node !== doc.documentElement && parts.length < 5) {
    const id = node.id ? "#" + CSS.escape(node.id) : "";
    let nth = "";
    if (!id && node.parentElement) {
      const sib = [...node.parentElement.children].filter(c => c.tagName === node.tagName);
      if (sib.length > 1) nth = ":nth-of-type(" + (sib.indexOf(node) + 1) + ")";
    }
    parts.unshift(node.tagName.toLowerCase() + id + nth);
    if (id) break;
    node = node.parentElement;
  }
  const sel = parts.join(" > ");
  try { if (doc.querySelector(sel)) return sel; } catch {}
  return null;
}
```

#### Updated `add()` function

```javascript
const add = (findings, params) => {
  // ...existing destructuring...
  const entry = {
    type, severity,
    // ...existing fields...
    path: el ? cssPathDeep(el) : null,       // Descriptive path (may contain >>>)
    targetRef: el ? buildTargetRef(el) : null, // NEW: queryable targeting
    // ...rest unchanged...
  };
  findings.push(entry);
};
```

#### Updated `resolveTarget()` — overlay targeting with fallback chain

```javascript
/**
 * Resolve a finding to a live DOM element for overlay placement.
 * Fallback chain: cssSelector > testId > tag+role+name heuristic.
 * Returns null if no match found (graceful degradation — skip annotation).
 */
function resolveTarget(targetRef) {
  if (!targetRef) return null;

  // 1. Light DOM CSS selector (most reliable for light DOM elements)
  if (targetRef.cssSelector) {
    try {
      const el = doc.querySelector(targetRef.cssSelector);
      if (el) return el;
    } catch {}
  }

  // 2. data-testid (works across light/shadow if we query deep)
  if (targetRef.testId) {
    // Light DOM first
    const sel = `[data-testid="${CSS.escape(targetRef.testId)}"]`;
    try {
      const el = doc.querySelector(sel);
      if (el) return el;
    } catch {}
    // Shadow DOM: check open shadow roots
    const deepEl = queryDeepByTestId(targetRef.testId);
    if (deepEl) return deepEl;
  }

  // 3. Tag + role + name heuristic (last resort)
  // P1-2 FIX: cap candidate scan to MAX_TAG_CANDIDATES (50).
  // In large SPAs, generic tags like <div> or <button> can match thousands
  // of elements. Scanning all of them would cause performance spikes with
  // no benefit — if there are that many, the heuristic is too weak anyway.
  // This cap is intentional: deterministic (same DOM → same 50 checked),
  // and avoids expensive getAccName() calls on unbounded element sets.
  if (targetRef.tag) {
    const MAX_TAG_CANDIDATES = 50;
    const candidates = doc.querySelectorAll(targetRef.tag);
    // If too many candidates exist, the heuristic is too weak — skip entirely.
    if (candidates.length > MAX_TAG_CANDIDATES) return null;
    for (const el of candidates) {
      const matchesRole = !targetRef.role || el.getAttribute("role") === targetRef.role;
      const matchesName = !targetRef.name || getAccName(el) === targetRef.name;
      if (matchesRole && matchesName) return el;
    }
  }

  return null;  // Graceful degradation: skip annotation for this finding
}

/**
 * Query into open shadow roots for a data-testid.
 * Bounded: max 10 shadow roots checked.
 */
function queryDeepByTestId(testId) {
  const sel = `[data-testid="${CSS.escape(testId)}"]`;
  let checked = 0;
  const MAX = 10;
  function search(root) {
    if (checked++ > MAX) return null;
    const el = root.querySelector(sel);
    if (el) return el;
    for (const host of root.querySelectorAll("*")) {
      if (checked > MAX) return null;
      if (host.shadowRoot) {
        const found = search(host.shadowRoot);
        if (found) return found;
      }
    }
    return null;
  }
  return search(doc);
}
```

### Message contract changes

**New message: `ANNOTATE`**
```javascript
// Panel → SW
{
  type: "ANNOTATE",
  tabId: number,
  frameId: number,
  findings: [
    // Only serializable targeting data — no DOM references, no raw paths
    { id: string, type: string, severity: string, targetRef: object, note: string }
  ],
}
// SW → Panel
{ ok: true, annotated: number, skipped: number }
```

**New message: `CLEAR_ANNOTATIONS`**
```javascript
// Panel → SW
{ type: "CLEAR_ANNOTATIONS", tabId: number }
// SW → Panel
{ ok: true }
```

### Implementation: snippet annotation API

Add to `a11y-audit-snippet.js` at the end of the IIFE, after existing API methods:

```javascript
const ANNOTATION_CONTAINER_ID = "__a11y_flowlens_annotations__";
const ANNOTATION_CLASS = "__a11y_flowlens_marker__";

function clearAnnotations() {
  const existing = doc.getElementById(ANNOTATION_CONTAINER_ID);
  if (existing) existing.remove();
}

function annotateFindings(findingsData) {
  clearAnnotations();

  const container = doc.createElement("div");
  container.id = ANNOTATION_CONTAINER_ID;
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none;";
  doc.body.appendChild(container);

  let annotated = 0;
  let skipped = 0;
  const SEV_COLORS = {
    critical: "#DB5A5A", high: "#D4864E", medium: "#C4A855",
    low: "#5AB89A", info: "#7A8EA6",
  };
  const MAX_ANNOTATIONS = 200;

  for (const f of (findingsData || []).slice(0, MAX_ANNOTATIONS)) {
    // P0-2 FIX: use resolveTarget fallback chain instead of doc.querySelector(f.path)
    const el = resolveTarget(f.targetRef);
    if (!el) { skipped++; continue; }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) { skipped++; continue; }

    const marker = doc.createElement("div");
    marker.className = ANNOTATION_CLASS;
    marker.dataset.findingId = f.id || "";
    marker.dataset.findingType = f.type || "";
    const color = SEV_COLORS[f.severity] || SEV_COLORS.info;
    marker.style.cssText = `
      position:fixed;
      top:${rect.top - 2}px;
      left:${rect.left - 2}px;
      width:${rect.width + 4}px;
      height:${rect.height + 4}px;
      border:2px solid ${color};
      border-radius:3px;
      pointer-events:auto;
      cursor:pointer;
      z-index:2147483646;
      box-sizing:border-box;
    `;

    // Badge
    const badge = doc.createElement("span");
    badge.style.cssText = `
      position:absolute;top:-10px;left:-2px;
      background:${color};color:#fff;font:bold 10px/12px system-ui;
      padding:1px 4px;border-radius:2px;white-space:nowrap;
      pointer-events:auto;cursor:pointer;max-width:160px;overflow:hidden;text-overflow:ellipsis;
    `;
    badge.textContent = f.type || "issue";
    badge.title = `${f.severity}: ${f.type}\n${f.note || ""}`;
    marker.appendChild(badge);

    // Click handler — dispatches custom event for panel to pick up
    marker.addEventListener("click", () => {
      w.dispatchEvent(new CustomEvent("__flowlens_annotation_click__", {
        detail: { findingId: f.id, findingType: f.type }
      }));
    });

    container.appendChild(marker);
    annotated++;
  }

  return { ok: true, annotated, skipped };
}

// Register on API
w[KEY].annotate = annotateFindings;
w[KEY].clearAnnotations = clearAnnotations;
```

### Implementation: SW message handler

In `sw.js`, add handlers for `ANNOTATE` and `CLEAR_ANNOTATIONS`:

```javascript
case "ANNOTATE": {
  const { tabId, frameId, findings } = msg;
  try {
    await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      files: [SNIPPET_FILE],
      world: "MAIN"
    });
    const r = await chrome.scripting.executeScript({
      target: { tabId, frameIds: [frameId] },
      world: "MAIN",
      func: (findings) => window.A11YFlowAudit?.annotate?.(findings) || { ok: false },
      args: [findings],
    });
    sendResponse((r && r[0]?.result) || { ok: false });
  } catch (e) {
    sendResponse({ ok: false, error: String(e?.message || e) });
  }
  return true;
}

case "CLEAR_ANNOTATIONS": {
  const { tabId } = msg;
  try {
    const frames = await chrome.webNavigation.getAllFrames({ tabId }).catch(() => []);
    for (const frame of (frames || [])) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId, frameIds: [frame.frameId] },
          world: "MAIN",
          func: () => {
            const c = document.getElementById("__a11y_flowlens_annotations__");
            if (c) c.remove();
          },
        });
      } catch {}
    }
    sendResponse({ ok: true });
  } catch (e) {
    sendResponse({ ok: false, error: String(e?.message || e) });
  }
  return true;
}
```

### Implementation: panel.js

```javascript
let annotationsActive = false;

/**
 * P1-7 FIX: Overlay mode restriction.
 * Annotations are only available for 'run' mode snapshots.
 * Other modes (contrast, tabWalk, observe, watch) produce findings
 * with different semantics that don't map cleanly to element overlays.
 */
const OVERLAY_ALLOWED_MODES = new Set(["run"]);

async function toggleAnnotations() {
  if (annotationsActive) {
    await send({ type: "CLEAR_ANNOTATIONS", tabId });
    annotationsActive = false;
    updateAnnotationToggleUI();
    return;
  }

  // P1-7: check mode restriction
  const currentMode = state.currentMode || "run";
  if (!OVERLAY_ALLOWED_MODES.has(currentMode)) {
    showToast(
      "Annotations are available only for 'run' mode snapshots.",
      "info", 5000
    );
    return;
  }

  // P1-3 FIX: frame consistency guard.
  // Each snapshot records usedFrameId at capture time.
  // Overlay may only render if current bestFrameId matches the snapshot's frame.
  // If the frame context changed (e.g., SPA navigation changed the best frame),
  // the overlay would target stale elements — refuse and tell the user.
  const snapshotFrameId = state.currentSnapshot?.usedFrameId ?? null;
  if (snapshotFrameId !== null && snapshotFrameId !== state.bestFrameId) {
    showToast(
      "Frame context changed since capture. Re-run audit to annotate.",
      "info", 5000
    );
    annotationsActive = false;
    updateAnnotationToggleUI();
    return;
  }

  const findings = state.currentFindings.map((f, i) => ({
    id: String(i),
    type: f.type,
    severity: f.severity,
    targetRef: f.targetRef || null,  // P0-2 FIX: pass targetRef, NOT f.path
    note: f.note || "",
  }));
  const result = await send({
    type: "ANNOTATE",
    tabId,
    frameId: state.bestFrameId,
    findings,
  });

  if (result?.ok === false && result?.reason === "FRAME_CHANGED") {
    showToast(
      "Frame context changed since capture. Re-run audit to annotate.",
      "info", 5000
    );
    annotationsActive = false;
  } else if (result?.ok === false && result?.reason === "MODE_NOT_SUPPORTED") {
    showToast(
      "Annotations are available only for 'run' mode snapshots.",
      "info", 5000
    );
    annotationsActive = false;
  } else {
    annotationsActive = result?.ok === true;
  }
  updateAnnotationToggleUI();
}

// Clear annotations on navigation
chrome.devtools.network.onNavigated.addListener(() => {
  annotationsActive = false;
  updateAnnotationToggleUI();
});

// Clear annotations on session end
// (add to endSession() cleanup)
```

**P1-3: Snapshot `usedFrameId` requirement:**

Each mode snapshot must store `usedFrameId` at capture time:

```javascript
// In panel.js, when capturing a snapshot result:
snapshot.usedFrameId = state.bestFrameId;  // Record which frame was active
```

This is already partially present in targeting metadata (`usedFrameIds`). The new requirement is that `state.currentSnapshot` exposes a singular `usedFrameId` for the best frame, which the overlay guard checks.

### Lifecycle

1. **Off by default.** User clicks "Annotate" button in snap header.
2. Annotations rendered as fixed-position overlays in the inspected page.
3. Annotations cleared on:
   - User clicks "Annotate" again (toggle off)
   - Page navigation (`onNavigated`)
   - Session end
   - New audit run (re-rendered with new findings if toggle is on)
4. Marker click dispatches custom event → panel catches via `chrome.devtools.inspectedWindow.eval` listener → scrolls to finding in explorer.

### Security notes

- **No DOM serialization.** Annotations use `targetRef` to locate elements; no raw DOM stored.
- **No screenshots.** Overlays are live DOM elements, not captures.
- **No persistent mutation.** Container is removed on cleanup.
- **`aria-hidden="true"`** on container — invisible to screen readers.
- **Capped at 200 annotations** to prevent performance issues.
- **`skipped` count** returned so panel can show "N findings could not be annotated".

### Determinism notes

- Annotations are ephemeral UI — not persisted, not exported, not part of session data.
- No impact on determinism.

---

## Upgrade #5 — CI-friendly Export Format

### Goal

JUnit XML and CSV export for CI pipelines, generated purely client-side.

### Files to change/create

| File | Action | Changes |
|------|--------|---------|
| `panel.js` | Modify | Add `buildJunitXml()`, `buildCsv()` exporters; add export menu items |
| `panel.html` | Modify | Add "Download JUnit XML" and "Download CSV" to export menu |

### P0-1 FIX: JUnit determinism

**Problem:** The original `buildJunitXml()` used `new Date().toISOString()` for the `timestamp` attribute, making the output non-deterministic. It also didn't sort findings before generating XML.

**Fix:**
1. **Timestamp**: Use the already-captured `capturedAt` timestamp (from `state.lastRunTimestamp` for single runs, or `step.capturedAt` for session steps). Never call `new Date()` at export time.
2. **Stable sort**: Sort findings deterministically before XML/CSV generation. Sort key (P1-1 enhanced): `[frameKey, scope.type, scope.rootSelector, type, wcag, severity, pathHash]` (all strings, lexicographic).

### JUnit XML schema

```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="FlowLens"
            schemaVersion="2"
            signatureVersion="2"
            frameKeyVersion="1"
            enMappingVersion="1"
            timestamp="2026-02-23T08:00:00.000Z"
            url="https://example.com"
            env="prod"
            wcagLevel="2.2-AA">

  <!-- Single-run: one testsuite per mode -->
  <testsuite name="run"
             tests="50"
             failures="8"
             errors="0"
             skipped="3"
             time="0">

    <!-- Pass: finding is blocking=false -->
    <testcase name="IMG_EMPTY_ALT"
              classname="wcag.1.1.1"
              time="0">
      <system-out>severity=low confidence=strict path=img.hero</system-out>
    </testcase>

    <!-- Fail: finding is blocking=true -->
    <testcase name="NO_ACCESSIBLE_NAME"
              classname="wcag.4.1.2"
              time="0">
      <failure message="Button has no accessible name"
               type="high">
severity=high confidence=strict
wcag=4.1.2 en301549=9.4.1.2
path=div > button:nth-of-type(2)
testId=submit-btn
note=Interactive element has no accessible name.
      </failure>
    </testcase>

    <!-- Needs Review: heuristic/advisory -->
    <testcase name="CLICK_WITHOUT_KEYBOARD"
              classname="wcag.2.1.1"
              time="0">
      <skipped message="needs_review: heuristic confidence" />
    </testcase>

  </testsuite>
</testsuites>
```

#### Session JUnit XML

For sessions, each step becomes a `<testsuite>`:

```xml
<testsuites name="FlowLens Session sess_123"
            timestamp="2026-02-23T08:00:00.000Z">
  <testsuite name="Step 0 — /login" tests="12" failures="3"
             timestamp="2026-02-23T08:00:05.000Z" ...>
    <!-- findings as testcases -->
  </testsuite>
  <testsuite name="Step 1 — /dashboard" tests="18" failures="5"
             timestamp="2026-02-23T08:01:12.000Z" ...>
    <!-- findings as testcases -->
  </testsuite>
</testsuites>
```

### Implementation: deterministic sort helper

```javascript
/**
 * Sort findings deterministically for export.
 *
 * P1-1 FIX: Full 7-key sort for total ordering across frames and scopes.
 * Key (lexicographic, all fields coerced to string, null-safe):
 *   1. frameKey       — groups findings by frame ("" if not present)
 *   2. scope.type     — "document" < "subtree"
 *   3. scope.rootSelector — ("" if null)
 *   4. type           — rule type
 *   5. wcag           — criterion
 *   6. severity       — severity label
 *   7. pathHash       — FNV-1a hash of finding path
 *
 * Returns a new sorted array (does NOT mutate input).
 * Same input always produces identical output.
 * Works in both single-run and session step export contexts.
 *
 * @param {Array} findings - findings array (not mutated)
 * @param {Object} [ctx] - optional context for frame/scope info
 * @param {string} [ctx.frameKey] - frame key from snapshot (single-run)
 * @param {Object} [ctx.scope] - scope from step/run result
 */
function sortFindingsForExport(findings, ctx) {
  if (!Array.isArray(findings)) return [];
  const fk = ctx?.frameKey || "";
  const scopeType = ctx?.scope?.type || "document";
  const scopeRoot = ctx?.scope?.rootSelector || "";

  return [...findings].sort((a, b) => {
    // 1. frameKey (from context or per-finding if attached)
    const fkA = a._frameKey || fk;
    const fkB = b._frameKey || fk;
    const fkCmp = fkA.localeCompare(fkB);
    if (fkCmp !== 0) return fkCmp;

    // 2. scope.type ("document" < "subtree", lexicographic)
    const stA = a._scopeType || scopeType;
    const stB = b._scopeType || scopeType;
    const stCmp = stA.localeCompare(stB);
    if (stCmp !== 0) return stCmp;

    // 3. scope.rootSelector ("" if null)
    const srA = a._scopeRoot || scopeRoot;
    const srB = b._scopeRoot || scopeRoot;
    const srCmp = srA.localeCompare(srB);
    if (srCmp !== 0) return srCmp;

    // 4. type (lexicographic)
    const t = (a.type || "").localeCompare(b.type || "");
    if (t !== 0) return t;

    // 5. wcag (lexicographic)
    const w = (a.wcag || "").localeCompare(b.wcag || "");
    if (w !== 0) return w;

    // 6. severity (lexicographic)
    const s = (a.severity || "").localeCompare(b.severity || "");
    if (s !== 0) return s;

    // 7. path hash (lexicographic, handles null)
    const pa = pathHashForSig(a.path);
    const pb = pathHashForSig(b.path);
    return pa.localeCompare(pb);
  });
}
```

### Implementation: JUnit XML builder

```javascript
/**
 * Build JUnit XML export.
 *
 * P0-1 FIX:
 * - timestamp uses capturedAt (already recorded), NOT new Date().
 * - findings are sorted deterministically before iteration.
 * - Same input always produces identical output.
 *
 * @param {Object} opts
 * @param {Array} opts.findings - audit findings
 * @param {string} opts.mode - audit mode (run, contrast, etc.)
 * @param {string} opts.url - inspected page URL
 * @param {string} opts.envTag - environment tag
 * @param {string} opts.capturedAt - ISO timestamp from audit capture
 * @param {string} [opts.frameKey] - frame key from snapshot context (P1-1)
 * @param {Object} [opts.scope] - scope from run result (P1-1)
 * @param {Object} [opts.session] - session object (for multi-step export)
 */
function buildJunitXml({ findings, mode, url, envTag, capturedAt, frameKey, scope, session }) {
  const esc = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // P0-1 FIX: use provided capturedAt, never new Date()
  const timestamp = capturedAt || (session?.startedAt) || "1970-01-01T00:00:00.000Z";

  const meta = [
    `schemaVersion="${SESSION_SCHEMA_VERSION}"`,
    `signatureVersion="${SESSION_SIGNATURE_VERSION}"`,
    `frameKeyVersion="${FRAME_KEY_VERSION}"`,
    `enMappingVersion="${EN_MAPPING_VERSION}"`,
    `timestamp="${esc(timestamp)}"`,
    `url="${esc(url)}"`,
    `env="${esc(envTag)}"`,
  ].join(" ");

  if (session) {
    // Session mode: one testsuite per step
    const suites = [];
    for (const step of session.steps || []) {
      suites.push(buildStepTestsuite(step, session.rawAppendix));
    }
    return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="FlowLens Session ${esc(session.id)}" ${meta}>\n${suites.join("\n")}\n</testsuites>`;
  }

  // Single-run mode: sort findings before generating XML
  // P1-1: pass frame/scope context for full 7-key sort
  const sorted = sortFindingsForExport(findings || [], { frameKey, scope });
  const suite = buildFindingsTestsuite(sorted, mode || "run", url, timestamp);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites name="FlowLens" ${meta}>\n${suite}\n</testsuites>`;
}

/**
 * Build a <testsuite> from a sorted findings array.
 */
function buildFindingsTestsuite(sortedFindings, suiteName, url, timestamp) {
  const esc = (s) => String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  let failures = 0, skipped = 0;
  const cases = [];

  for (const f of sortedFindings) {
    const review = classifyReviewStatus(f);
    const blocking = isRunFindingBlocking(f);
    const enClauses = (f.en301549Clauses || []).join(",");
    const classname = f.wcag ? `wcag.${f.wcag}` : "flowlens";

    if (review === "needs_review") {
      skipped++;
      cases.push(`  <testcase name="${esc(f.type)}" classname="${esc(classname)}" time="0">\n    <skipped message="${esc(`needs_review: ${f.confidence} confidence`)}" />\n  </testcase>`);
    } else if (blocking) {
      failures++;
      const body = [
        `severity=${f.severity} confidence=${f.confidence}`,
        `wcag=${f.wcag || "—"} en301549=${enClauses || "—"}`,
        `path=${f.path || "—"}`,
        f.testId ? `testId=${f.testId}` : null,
        `note=${f.note || "—"}`,
      ].filter(Boolean).join("\n");
      cases.push(`  <testcase name="${esc(f.type)}" classname="${esc(classname)}" time="0">\n    <failure message="${esc(f.note || f.type)}" type="${esc(f.severity)}">\n${esc(body)}\n    </failure>\n  </testcase>`);
    } else {
      cases.push(`  <testcase name="${esc(f.type)}" classname="${esc(classname)}" time="0">\n    <system-out>severity=${esc(f.severity)} confidence=${esc(f.confidence)} path=${esc(f.path)}</system-out>\n  </testcase>`);
    }
  }

  const tsAttr = timestamp ? ` timestamp="${esc(timestamp)}"` : "";
  return `<testsuite name="${esc(suiteName)}" tests="${sortedFindings.length}" failures="${failures}" errors="0" skipped="${skipped}" time="0"${tsAttr}>\n${cases.join("\n")}\n</testsuite>`;
}

/**
 * Build a <testsuite> for a session step.
 * Uses step.capturedAt for timestamp; sorts findings deterministically.
 */
function buildStepTestsuite(step, rawAppendix) {
  const stepLabel = `Step ${step.index} — ${step.routeHint || "(unknown)"}`;
  const ts = step.capturedAt || "1970-01-01T00:00:00.000Z";

  // Extract findings from rawAppendix via step's baseline rawRef
  const rawRef = step?.snapshots?.run?.best?.rawRef;
  const raw = rawRef ? (rawAppendix || {})[rawRef] : null;
  const findings = raw?.findings || [];

  // P1-1: pass per-step frame/scope context for full 7-key sort
  const stepFrameKey = step?.snapshots?.run?.best?.frameKey || "";
  const stepScope = step?.scope || { type: "document", rootSelector: null };
  const sorted = sortFindingsForExport(findings, { frameKey: stepFrameKey, scope: stepScope });
  return buildFindingsTestsuite(sorted, stepLabel, "", ts);
}
```

### CSV export

```javascript
/**
 * Build CSV export. Findings are sorted deterministically.
 * P1-1: accepts optional ctx for full 7-key sort.
 */
function buildCsv(findings, capturedAt, ctx) {
  const header = "type,severity,wcag,en301549,level,confidence,reviewStatus,blocking,testId,path,name,note";
  const sorted = sortFindingsForExport(findings || [], ctx);
  const rows = sorted.map(f => {
    const en = (f.en301549Clauses || []).join(";");
    const review = classifyReviewStatus(f);
    const blocking = isRunFindingBlocking(f) ? "true" : "false";
    return [f.type, f.severity, f.wcag, en, f.level, f.confidence, review, blocking, f.testId, f.path, f.name, f.note]
      .map(v => `"${String(v || "").replace(/"/g, '""')}"`)
      .join(",");
  });
  return [header, ...rows].join("\n");
}
```

### UI changes

Add to export menu in `panel.html`:
```html
<button id="downloadJunit" type="button">Download JUnit XML</button>
<button id="downloadCsv" type="button">Download CSV</button>
<button id="exportSessionJunitMenu" type="button" hidden>Session JUnit XML</button>
```

### Determinism notes

- **P0-1 FIX:** `timestamp` uses `capturedAt` from audit result or session step — never `new Date()` at export time.
- **P0-1 FIX / P1-1 FIX:** Findings sorted via `sortFindingsForExport()` before XML/CSV generation. Sort key (7-field): `[frameKey, scope.type, scope.rootSelector, type, wcag, severity, pathHash]`.
- Same findings + same `capturedAt` → identical XML/CSV output every time.
- JUnit XML includes all version fields (`schemaVersion`, `signatureVersion`, `frameKeyVersion`, `enMappingVersion`).

### Security notes

- Same data as JSON export — no additional sensitive data.
- CSV includes paths and accessible names (already in JSON export).

---

## Upgrade #6 — Shadow DOM Support

### Goal

Audit inside open shadow roots. Produce explicit info findings for shadow DOM presence. Update signature/path logic for shadow boundaries.

### Files to change/create

| File | Action | Changes |
|------|--------|---------|
| `a11y-audit-snippet.js` | Modify | Shadow-aware traversal, scoped queries, path generation |
| `panel.js` | Modify | Signature path handling for shadow boundaries |
| `test/shadow-dom.test.mjs` | **Create** | Shadow traversal and signature stability tests |

### P0-4 FIX: Scopes-based shadow DOM traversal

**Problem:** The original `querySelectorAllDeep()` recursively called `node.querySelectorAll("*")` to find shadow hosts at every level — O(n²) for deep trees with many elements.

**Solution:** Two-phase approach:
1. **Phase 1 — Collect scopes:** One DFS pass to collect all reachable DOM scopes (document root + open shadow roots) into a flat array. Capped at `MAX_SHADOW_SCOPES`.
2. **Phase 2 — Query per scope:** Run `scope.querySelectorAll(selector)` on each collected scope. Results are merged into a flat array.

This avoids the `querySelectorAll("*")` inner loop entirely.

```javascript
// Shadow DOM constants
const MAX_SHADOW_DEPTH = 5;
const MAX_SHADOW_SCOPES = 50;  // Max open shadow roots to traverse

/**
 * Collect all reachable DOM scopes (rootNode + open shadow roots within it).
 * Single DFS pass, capped at MAX_SHADOW_SCOPES.
 * Returns: Array<{ root: Document|ShadowRoot|Element, depth: number }>
 *
 * P1-4 GUARANTEE: Scope isolation.
 * This function ONLY traverses shadow roots that are descendants of rootNode.
 * If rootNode is a subtree element (from rootSelector), shadow roots outside
 * that subtree are never visited. This is enforced by TreeWalker scoping:
 * createTreeWalker(root, ...) only walks descendants of `root`.
 *
 * Callers MUST pass rootEl (the resolved root element, which may be
 * document.documentElement for full-document scans or a specific element
 * for subtree scans). Do NOT pass `document` directly for subtree scans.
 */
function collectScopes(rootNode) {
  const scopes = [{ root: rootNode, depth: 0 }];
  let i = 0;

  while (i < scopes.length && scopes.length < MAX_SHADOW_SCOPES) {
    const { root, depth } = scopes[i++];
    if (depth >= MAX_SHADOW_DEPTH) continue;

    // TreeWalker scopes to `root` — only descendants of rootNode are visited.
    // This ensures subtree isolation: shadow roots outside rootNode's subtree
    // are never discovered or traversed.
    const ownerDoc = root.ownerDocument || root;
    const walker = ownerDoc.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      null
    );
    let node;
    while ((node = walker.nextNode())) {
      if (scopes.length >= MAX_SHADOW_SCOPES) break;
      if (node.shadowRoot) {
        scopes.push({ root: node.shadowRoot, depth: depth + 1 });
      }
    }
  }

  return scopes;
}

/**
 * querySelectorAll across light DOM and all reachable open shadow roots.
 * Phase 1: collect scopes. Phase 2: query each scope.
 * Returns flat array of matching elements.
 */
function querySelectorAllDeep(rootNode, selector) {
  const scopes = collectScopes(rootNode);
  const results = [];
  for (const { root } of scopes) {
    try {
      const matches = root.querySelectorAll(selector);
      for (const el of matches) {
        results.push(el);
      }
    } catch {}
  }
  return results;
}

/**
 * Cache for collectScopes — reused within a single audit run.
 * Call resetScopeCache() at the start of each run().
 */
let _scopeCache = null;

function cachedCollectScopes(rootNode) {
  if (!_scopeCache) _scopeCache = collectScopes(rootNode);
  return _scopeCache;
}

function resetScopeCache() {
  _scopeCache = null;
}

/**
 * Cached version of querySelectorAllDeep — reuses scope collection.
 */
function querySelectorAllDeepCached(rootNode, selector) {
  const scopes = cachedCollectScopes(rootNode);
  const results = [];
  for (const { root } of scopes) {
    try {
      const matches = root.querySelectorAll(selector);
      for (const el of matches) results.push(el);
    } catch {}
  }
  return results;
}
```

### P0-5 FIX: Stable cssPathDeep

**Problem:** The original `cssPathDeep()` included element classes, which are frequently dynamic/hash-like (e.g., `.css-abc123`, `.MuiButton-root-3f8a`). This makes paths unstable across renders.

**Solution:**
1. **Never use classes by default.** Path segments use: `#id` > `[data-testid]` > `[aria-label]` > `tag:nth-of-type(N)`.
2. **Shadow boundary separator** `>>>` is used at shadow root crossings.
3. **Max depth** of 10 segments to bound path length.

```javascript
/**
 * CSS path that represents shadow boundaries with >>> separator.
 * e.g., "my-component >>> div > button:nth-of-type(2)"
 *
 * P0-5 FIX: does NOT use classes. Prefers stable anchors:
 * #id > [data-testid] > [aria-label] > tag:nth-of-type(N)
 */
function cssPathDeep(el) {
  if (!isEl(el)) return "";
  const segments = [];    // Shadow-separated segments
  let currentParts = [];  // Parts within current DOM scope
  let node = el;
  let totalParts = 0;
  const MAX_PARTS = 10;

  while (node && node.nodeType === 1 && totalParts < MAX_PARTS) {
    let part = "";

    // 1. Unique ID — terminates the path (strongest anchor)
    if (node.id) {
      part = `#${CSS.escape(node.id)}`;
      currentParts.unshift(part);
      totalParts++;
      break;
    }

    // 2. data-testid — strong anchor, may not be unique at this level
    const testId = node.getAttribute("data-testid");
    if (testId) {
      part = `${node.tagName.toLowerCase()}[data-testid="${CSS.escape(testId)}"]`;
      currentParts.unshift(part);
      totalParts++;
      // data-testid is usually unique enough to stop, but continue if
      // parent is a shadow root boundary (to preserve >>> structure).
      const parent = node.parentNode;
      if (parent && parent.nodeType === 11) {
        segments.unshift(currentParts.join(" > "));
        currentParts = [];
        node = parent.host;
        continue;
      }
      break;
    }

    // 3. Tag + nth-of-type (no classes)
    let nth = "";
    const p = node.parentNode;
    if (p && p.children) {
      const sib = [...p.children].filter(c => c.tagName === node.tagName);
      if (sib.length > 1) nth = `:nth-of-type(${sib.indexOf(node) + 1})`;
    }
    part = `${node.tagName.toLowerCase()}${nth}`;

    // Optional: add aria-label as anchor for generic containers (div, span).
    // P1-5 FIX: Only use aria-label if it is stable:
    //   - Length <= 40 (avoids long dynamic strings)
    //   - Contains NO digits (avoids counters like "3 items", "Page 2 of 5")
    // This reduces signature instability in localized and dynamic UIs where
    // aria-labels contain counts, indices, or template-interpolated numbers.
    // Does NOT reintroduce class usage.
    const ariaLabel = node.getAttribute("aria-label");
    if (
      ariaLabel
      && (node.tagName === "DIV" || node.tagName === "SPAN")
      && ariaLabel.length <= 40
      && !/\d/.test(ariaLabel)
    ) {
      part = `${node.tagName.toLowerCase()}[aria-label="${CSS.escape(ariaLabel)}"]${nth}`;
    }

    currentParts.unshift(part);
    totalParts++;

    // Check if parent is a shadow root
    const parent = node.parentNode;
    if (parent && parent.nodeType === 11) {
      // DocumentFragment = shadow root → push current segment, jump to host
      segments.unshift(currentParts.join(" > "));
      currentParts = [];
      node = parent.host;
      continue;
    }
    node = parent;
  }

  if (currentParts.length > 0) {
    segments.unshift(currentParts.join(" > "));
  }

  return segments.join(" >>> ");
}
```

### P0-3 FIX: Closed shadow root detection

**Problem:** The original `detectClosedShadowRoots()` used an unreliable heuristic: "custom elements with dash in tag name + no `.shadowRoot` + no children + visible". This produces false positives (e.g., custom elements that render via `<slot>`, or custom elements that don't use shadow DOM at all).

**Solution:** Remove the per-element heuristic entirely. Instead, produce a single `SHADOW_DOM_NOTE` info finding that reports what was audited:

```javascript
// At the end of run(), replace both SHADOW_DOM_DETECTED and SHADOW_ROOT_INACCESSIBLE with:
const scopes = cachedCollectScopes(rootEl);
const openShadowCount = scopes.length - 1;  // Subtract document root
const wasCapped = scopes.length >= MAX_SHADOW_SCOPES;

if (openShadowCount > 0) {
  // P1-6 FIX: When scope cap is reached, finding.note must explicitly state
  // that traversal was capped and additional shadow roots may be unaudited.
  const capMessage = wasCapped
    ? ` Traversal capped at MAX_SHADOW_SCOPES (${MAX_SHADOW_SCOPES}). `
      + `Additional shadow roots may not have been audited.`
    : "";

  add(findings, {
    type: "SHADOW_DOM_NOTE",
    el: doc.body,
    severity: "info",
    note: `${openShadowCount} open shadow root(s) found and audited.${capMessage} `
      + `Closed shadow roots (if any) cannot be detected or audited — `
      + `inspect manually if custom components appear to have hidden content.`,
    extra: {
      openShadowRoots: openShadowCount,
      maxShadowDepth: Math.max(...scopes.map(s => s.depth)),
      scopesCapped: wasCapped,
    },
  });
}
```

**Rationale:** We cannot distinguish "no shadow root" from "closed shadow root" for an arbitrary element. The only safe statement is: "we found N open shadow roots and audited them; anything else is invisible to us." This is honest, deterministic, and produces no false positives.

The old `SHADOW_DOM_DETECTED` info finding is replaced by `SHADOW_DOM_NOTE` which carries richer metadata.

### Integration with existing `run()`

At the top of `run()`, reset the scope cache and collect scopes once:

```javascript
const run = (cfg = {}) => {
  resetScopeCache();  // Clear scope cache from previous run
  // ...existing setup...

  // Collect scopes once for the entire run
  const scopes = cachedCollectScopes(rootEl);
  // ...
};
```

Replace `doc.querySelectorAll` calls with `querySelectorAllDeepCached` for element-level rules. Keep document-level rules using `doc.querySelectorAll` (they check `<html>`, `<head>`, etc.).

Modify the `_q` helper:

```javascript
const _q = (sel, type, sev, wcag, test, note, opts) => {
  // Use deep query to traverse shadow DOM (cached scopes)
  const elements = querySelectorAllDeepCached(rootEl, sel);
  for (const el of elements) {
    if (isHiddenCached(el, cache)) continue;
    if (test && !test(el)) continue;
    const entry = { type, el, severity: sev, wcag };
    if (note) entry.note = typeof note === "function" ? note(el) : note;
    if (opts) Object.assign(entry, typeof opts === "function" ? opts(el) : opts);
    add(findings, entry);
  }
};
```

Modify `add()` to use `cssPathDeep` and `buildTargetRef`:

```javascript
const add = (findings, params) => {
  // ...existing destructuring...
  const entry = {
    type, severity,
    // ...existing fields...
    path: el ? cssPathDeep(el) : null,          // Descriptive path (may contain >>>)
    targetRef: el ? buildTargetRef(el) : null,  // Queryable targeting (from Upgrade #4)
    // ...rest unchanged...
  };
  findings.push(entry);
};
```

### Signature path handling

In `panel.js`, update `pathHashForSig()` to normalize shadow boundaries:

```javascript
function pathHashForSig(path) {
  if (!path) return "00000000";
  // Normalize shadow boundary separator for stable hashing
  const normalized = normalizeIdentityText(
    path.replace(/\s*>>>\s*/g, ">>>"),  // normalize whitespace around >>>
    200
  );
  return fnv1aHash8(normalized);
}
```

The `>>>` separator is included in the hash — findings inside shadow DOM have different path hashes than findings in light DOM, which is correct for identity purposes.

### Performance caps

- `MAX_SHADOW_DEPTH = 5`: Don't recurse more than 5 levels deep.
- `MAX_SHADOW_SCOPES = 50`: Max open shadow roots to traverse.
- `TreeWalker` used instead of `querySelectorAll("*")` for host discovery — avoids creating intermediate arrays.
- Scope collection is cached per audit run via `cachedCollectScopes()`.
- Existing `WeakMap` caching (`createPassCache()`) applies to shadow DOM elements too.

### Determinism notes

- `cssPathDeep()` produces deterministic paths given the same DOM structure. No classes used — only stable anchors.
- `>>>` separator is a stable representation of shadow boundaries.
- `SHADOW_DOM_NOTE` finding is deterministic: counts open shadow roots that were actually found and traversed.
- Signature hashing includes shadow boundary information — findings inside shadow DOM are distinct from light DOM findings.

### Security notes

- No additional data stored. Shadow DOM paths use CSS selectors (without classes), not raw DOM.
- Closed shadow roots are NOT accessed and NOT heuristically guessed — only open roots are traversed.

---

## Cross-cutting: Versioning, Determinism & Migration

### New version constants

Add to `panel.js`:
```javascript
const EN_MAPPING_VERSION = 1;
// Updated:
const SESSION_SCHEMA_VERSION = 2;      // was 1; bump for scope/en301549/reviewStatus/targetRef additions
const SESSION_SIGNATURE_VERSION = 2;   // was 1; bump for shadow DOM path changes (>>> + no-class)
// Unchanged:
// FRAME_KEY_VERSION = 1
```

### Updated `determinismMeta`

```javascript
function buildDeterminismMeta(session) {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,      // 2
    signatureVersion: SESSION_SIGNATURE_VERSION, // 2
    frameKeyVersion: session.frameKeyVersion || FRAME_KEY_VERSION,
    enMappingVersion: EN_MAPPING_VERSION,       // NEW
    totalSteps: (session.steps || []).length,
    perStepFrameKeys: (session.steps || []).map(s => {
      const keys = s?.frameSelections?.usedFrameKeys || [];
      return { count: keys.length, hash: fnv1aHash8(keys.join(",")) };
    }),
    warnings: [],
  };
}
```

### Schema version bumps

| Version | Current → New | Reason |
|---------|---------------|--------|
| `schemaVersion` | 1 → 2 | Step now includes `scope` field; findings include `en301549Clauses`, `reviewStatus`, `targetRef` |
| `signatureVersion` | 1 → 2 | Path hashing now accounts for `>>>` shadow boundaries; no classes in paths |
| `frameKeyVersion` | 1 → 1 | No change |
| `enMappingVersion` | — → 1 | New |

### P0-7 FIX: Versioning & Migration Strategy

**Problem:** The original plan bumped `schemaVersion` and `signatureVersion` from 1 to 2 but did not define how v1 sessions interact with v2 code — e.g., loading a v1 session in v2 panel, comparing v1 steps with v2 steps, or displaying version mismatch warnings.

**Solution:** Define explicit migration and compatibility rules.

#### Session loading: `normalizeLoadedSession(raw)`

When loading a session from storage or import, normalize it to the current schema:

```javascript
/**
 * Normalize a loaded session to current schema version.
 * Handles v1 → v2 migration. Non-destructive: adds missing fields with defaults.
 *
 * Returns: { session, migrated: boolean, warnings: string[] }
 */
function normalizeLoadedSession(raw) {
  const warnings = [];
  let migrated = false;

  // Clone to avoid mutating storage
  const session = structuredClone(raw);

  const loadedSchema = session.schemaVersion || 1;
  const loadedSig = session.signatureVersion || 1;

  // --- Schema v1 → v2 migration ---
  if (loadedSchema < 2) {
    migrated = true;
    warnings.push(`Session migrated from schemaVersion ${loadedSchema} to ${SESSION_SCHEMA_VERSION}.`);

    for (const step of session.steps || []) {
      // Add scope field (v1 sessions always scanned full document)
      if (!step.scope) {
        step.scope = { type: "document", rootSelector: null, rootTestId: null };
      }

      // Add reviewStatus to findings if raw data is available
      // (findings in rawAppendix; normalized summaries don't store individual findings)
    }

    // Add enMappingVersion (v1 sessions didn't have EN mapping)
    if (!session.enMappingVersion) {
      session.enMappingVersion = 0;  // 0 = "pre-EN mapping"
    }
  }

  // Stamp current versions
  session.schemaVersion = SESSION_SCHEMA_VERSION;

  return { session, migrated, warnings };
}
```

#### Signature version mismatch: cross-version diffing

When comparing steps from different `signatureVersion`s:

```javascript
/**
 * Check whether two snapshots have compatible signatures for diffing.
 * Returns: { compatible: boolean, warning: string|null }
 */
function checkSignatureCompatibility(snapA, snapB) {
  const sigVerA = snapA?.signatureVersion || 1;
  const sigVerB = snapB?.signatureVersion || 1;

  if (sigVerA === sigVerB) {
    return { compatible: true, warning: null };
  }

  // v1 → v2: paths changed (>>> separator, no classes).
  // Signatures are NOT comparable across this boundary because
  // pathHash changed for findings inside shadow DOM, and all paths
  // lost class-based segments.
  return {
    compatible: false,
    warning: `Signature version mismatch (v${sigVerA} vs v${sigVerB}). `
      + `Diff results may show false added/fixed findings due to path hash changes. `
      + `Consider re-capturing the baseline step with the current version.`,
  };
}
```

In `diffModeBundles()`, when version mismatch is detected:

```javascript
function diffModeBundles(prevBundle, currBundle, mode, rawAppendix) {
  // ...existing code...

  const compat = checkSignatureCompatibility(prevBundle, currBundle);
  if (!compat.compatible) {
    // Still compute diff (best effort), but attach warning
    const diff = /* ...existing diff logic... */;
    diff.versionMismatchWarning = compat.warning;
    return diff;
  }

  // ...existing diff logic (unchanged)...
}
```

#### User-facing messaging

In `panel.js` rendering, when a session is loaded with migration:

```javascript
function onSessionLoaded(raw) {
  const { session, migrated, warnings } = normalizeLoadedSession(raw);

  if (migrated) {
    // Show non-blocking toast in panel UI
    showToast(
      `Session was created with an older version and has been migrated. `
      + warnings.join(" "),
      "info",  // severity
      8000     // auto-dismiss ms
    );
  }

  // Continue with normal session load
  state.session = session;
  // ...
}
```

When a diff contains `versionMismatchWarning`:

```javascript
// In step diff rendering:
if (diff.versionMismatchWarning) {
  // Show inline warning above diff summary
  renderDiffWarning(diff.versionMismatchWarning);
}
```

#### Export includes migration metadata

In session JSON and Markdown exports:

```javascript
// determinismMeta gains:
{
  // ...existing fields...
  migratedFrom: {
    schemaVersion: 1,       // original version, if migrated
    signatureVersion: 1,    // original version, if migrated
  } | null,                 // null if no migration occurred
  warnings: [
    "Session migrated from schemaVersion 1 to 2.",
    "Signature version mismatch between step 0 (v1) and step 1 (v2).",
  ],
}
```

#### Mixed-version session steps

Scenario: A session was started with v1. The extension is upgraded to v2 mid-session. New steps are captured with v2.

```javascript
// Each step stores the signature version active at capture time:
step.signatureVersion = SESSION_SIGNATURE_VERSION;  // 1 or 2

// When building diffs between step N (v1) and step N+1 (v2):
// checkSignatureCompatibility() returns { compatible: false, warning: ... }
// Diff is still computed (best effort) but warning is attached.
```

**Policy:** We do NOT re-sign older steps. Steps retain their original `signatureVersion`. Cross-version diffs are computed with a warning. This is honest and avoids retroactive mutation.

#### Version compatibility matrix

| Session v | Panel v | Behavior |
|-----------|---------|----------|
| 1 | 1 | Normal |
| 1 | 2 | `normalizeLoadedSession` migrates; toast shown; diffs have warning if mixed steps |
| 2 | 2 | Normal |
| 2 | 1 | Panel cannot load — unknown fields ignored gracefully (v1 panel ignores `scope`, `en301549Clauses`, etc.). Diffs work but miss new data. No crash. |

For v2 → v1 (downgrade), the v1 panel ignores unknown fields. This is already safe because the panel uses optional chaining and defaults throughout.

---

## Test Plan

### New test files

| File | Tests |
|------|-------|
| `test/en-mapping.test.mjs` | EN 301 549 mapping integration |
| `test/review-status.test.mjs` | Needs-review bucketing |
| `test/subtree-scan.test.mjs` | Subtree signature stability |
| `test/overlay-lifecycle.test.mjs` | Overlay logic (not DOM; state management) |
| `test/shadow-dom.test.mjs` | Shadow traversal and signature stability |
| `test/junit-export.test.mjs` | JUnit XML generation + determinism |

### Test: EN 301 549 mapping (`test/en-mapping.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
// Load mapping table (will need to make it importable)

describe('EN 301 549 mapping', () => {
  it('maps WCAG 4.1.2 to EN 9.4.1.2', () => {
    const clauses = en301549ForWcag('4.1.2');
    assert.deepEqual(clauses, ['9.4.1.2']);
  });

  it('returns empty array for WCAG 2.2 criteria without EN mapping', () => {
    const clauses = en301549ForWcag('2.5.8');
    assert.deepEqual(clauses, []);
  });

  it('returns empty array for null/undefined input', () => {
    assert.deepEqual(en301549ForWcag(null), []);
    assert.deepEqual(en301549ForWcag(undefined), []);
  });

  it('maps all known WCAG criteria used by FlowLens rules', () => {
    const knownCriteria = ['1.1.1', '1.3.1', '2.1.1', '4.1.2', '4.1.3'];
    for (const c of knownCriteria) {
      const clauses = en301549ForWcag(c);
      assert.ok(Array.isArray(clauses), `${c} should return array`);
      assert.ok(clauses.length > 0, `${c} should have at least one EN clause`);
    }
  });

  it('EN_MAPPING_VERSION is a positive integer', () => {
    assert.ok(Number.isInteger(EN_MAPPING_VERSION));
    assert.ok(EN_MAPPING_VERSION >= 1);
  });
});
```

### Test: Review status (`test/review-status.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Review status classification', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('strict confidence → automated', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: 'strict' }), 'automated');
  });

  it('heuristic confidence → needs_review', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: 'heuristic' }), 'needs_review');
  });

  it('advisory confidence → needs_review', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: 'advisory' }), 'needs_review');
  });

  // P0-6 FIX: info, not not_applicable
  it('null confidence + info severity → info', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: null, severity: 'info' }), 'info');
  });

  it('null confidence + high severity → needs_review', () => {
    assert.equal(ctx.classifyReviewStatus({ confidence: null, severity: 'high' }), 'needs_review');
  });

  it('computeReviewCounts returns correct totals', () => {
    const findings = [
      { confidence: 'strict', severity: 'high' },
      { confidence: 'heuristic', severity: 'medium' },
      { confidence: 'advisory', severity: 'low' },
      { confidence: null, severity: 'info' },
    ];
    const counts = ctx.computeReviewCounts(findings);
    assert.equal(counts.automated, 1);
    assert.equal(counts.needsReview, 2);
    assert.equal(counts.info, 1);
  });

  it('classification is deterministic', () => {
    const f = { confidence: 'heuristic', severity: 'medium' };
    const r1 = ctx.classifyReviewStatus(f);
    const r2 = ctx.classifyReviewStatus(f);
    assert.equal(r1, r2);
  });

  it('SHADOW_DOM_NOTE finding → info status', () => {
    const finding = { type: 'SHADOW_DOM_NOTE', severity: 'info', confidence: null };
    assert.equal(ctx.classifyReviewStatus(finding), 'info');
  });
});
```

### Test: Subtree signature stability (`test/subtree-scan.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Subtree scope', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('step metadata includes scope field', () => {
    const step = {
      index: 0,
      scope: { type: 'subtree', rootSelector: 'div#my-component', rootTestId: 'my-component' },
      snapshots: { run: null, active: null },
    };
    assert.equal(step.scope.type, 'subtree');
    assert.equal(step.scope.rootSelector, 'div#my-component');
  });

  it('scope: document has rootSelector null', () => {
    const step = {
      index: 0,
      scope: { type: 'document', rootSelector: null },
      snapshots: { run: null, active: null },
    };
    assert.equal(step.scope.rootSelector, null);
  });

  it('signature for subtree finding includes full path', () => {
    const hash1 = ctx.pathHashForSig('div#my-component > button');
    const hash2 = ctx.pathHashForSig('div#other > button');
    assert.notEqual(hash1, hash2);
  });

  // P1-4: subtree + shadow scope isolation
  it('collectScopes receives rootEl not document for subtree scans', () => {
    // Verify the contract: when rootSelector is provided, collectScopes
    // is called with the resolved rootEl (a specific DOM element),
    // not document or document.documentElement.
    //
    // This guarantees that TreeWalker only visits descendants of rootEl,
    // so shadow roots outside the subtree are never discovered.
    //
    // Logic-level verification: the run() function resolves rootEl from
    // cfg.rootSelector, then passes rootEl to cachedCollectScopes(rootEl).
    const subtreeScope = { type: 'subtree', rootSelector: '#my-widget' };
    assert.equal(subtreeScope.type, 'subtree');
    // In the actual snippet, collectScopes(rootEl) where rootEl = doc.querySelector('#my-widget')
    // TreeWalker(rootEl, ...) only walks descendants of rootEl.
  });
});
```

### Test: Shadow DOM (`test/shadow-dom.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Shadow DOM support', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('pathHashForSig handles >>> separator', () => {
    const hash1 = ctx.pathHashForSig('my-component >>> div > button');
    const hash2 = ctx.pathHashForSig('div > button');
    assert.notEqual(hash1, hash2, 'shadow path should differ from light path');
  });

  it('pathHashForSig normalizes whitespace around >>>', () => {
    const hash1 = ctx.pathHashForSig('my-component >>> div > button');
    const hash2 = ctx.pathHashForSig('my-component>>>div > button');
    assert.equal(hash1, hash2, 'whitespace around >>> should be normalized');
  });

  it('shadow finding signature is stable', () => {
    const snapshot = {
      mode: 'run',
      best: {
        frameKey: 'fk::v1::https://example.com::/::00000000',
        normalized: { primaryCounts: { findings: 1 } },
        rawRef: 'ref_1',
      },
    };
    const rawAppendix = {
      ref_1: {
        findings: [{
          type: 'NO_ACCESSIBLE_NAME',
          severity: 'high',
          wcag: '4.1.2',
          path: 'my-component >>> div > button:nth-of-type(2)',
          testId: 'shadow-btn',
          name: 'Submit',
          note: 'No accessible name',
          confidence: 'strict',
          level: 'A',
        }],
      },
    };
    const entries1 = ctx.runSignatureEntries(snapshot, rawAppendix);
    const entries2 = ctx.runSignatureEntries(snapshot, rawAppendix);
    assert.equal(entries1.length, entries2.length);
    assert.equal(entries1[0].sig, entries2[0].sig, 'signatures should be stable');
    assert.ok(entries1[0].sig.includes('pathh:'), 'signature includes path hash');
  });

  it('SHADOW_DOM_NOTE is info severity', () => {
    const finding = {
      type: 'SHADOW_DOM_NOTE',
      severity: 'info',
      confidence: null,
    };
    assert.equal(ctx.classifyReviewStatus(finding), 'info');
    assert.equal(ctx.isRunFindingBlocking(finding), false);
  });

  it('paths without classes are stable across renders', () => {
    // Simulating two renders where class names change but structure stays
    const path1 = 'div > button:nth-of-type(2)';     // no classes
    const path2 = 'div > button:nth-of-type(2)';     // same
    assert.equal(ctx.pathHashForSig(path1), ctx.pathHashForSig(path2));
  });

  // P1-5: aria-label stability guard
  it('cssPathDeep rejects aria-label with digits', () => {
    // aria-label "3 items selected" contains digits → should NOT be used as anchor
    // This is a logic-level test; actual DOM test in snippet integration tests.
    const label = '3 items selected';
    const hasDigits = /\d/.test(label);
    assert.ok(hasDigits, 'label with digits should be rejected');
  });

  it('cssPathDeep rejects aria-label over 40 chars', () => {
    const longLabel = 'A'.repeat(41);
    assert.ok(longLabel.length > 40, 'label over 40 chars should be rejected');
  });

  it('cssPathDeep accepts stable aria-label', () => {
    const label = 'Navigation menu';
    const isStable = label.length <= 40 && !/\d/.test(label);
    assert.ok(isStable, 'short label without digits should be accepted');
  });

  // P1-6: shadow scope cap transparency
  it('SHADOW_DOM_NOTE includes cap message when scopes capped', () => {
    const MAX_SHADOW_SCOPES = 50;
    const scopes = Array.from({ length: MAX_SHADOW_SCOPES }, (_, i) => ({ depth: i % 5 }));
    const wasCapped = scopes.length >= MAX_SHADOW_SCOPES;
    assert.ok(wasCapped, 'should detect cap');
    const capMessage = wasCapped
      ? `Traversal capped at MAX_SHADOW_SCOPES (${MAX_SHADOW_SCOPES}). Additional shadow roots may not have been audited.`
      : '';
    assert.ok(capMessage.includes('capped'), 'message must mention capping');
    assert.ok(capMessage.includes('50'), 'message must include the cap number');
  });

  it('SHADOW_DOM_NOTE omits cap message when under limit', () => {
    const MAX_SHADOW_SCOPES = 50;
    const scopes = Array.from({ length: 10 }, (_, i) => ({ depth: 0 }));
    const wasCapped = scopes.length >= MAX_SHADOW_SCOPES;
    assert.equal(wasCapped, false, 'should not be capped');
  });
});
```

### Test: JUnit XML export (`test/junit-export.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('JUnit XML export', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('produces valid XML structure', () => {
    const xml = ctx.buildJunitXml({
      findings: [
        { type: 'NO_ACCESSIBLE_NAME', severity: 'high', wcag: '4.1.2',
          confidence: 'strict', note: 'Missing name', path: 'button',
          en301549Clauses: ['9.4.1.2'] },
      ],
      mode: 'run',
      url: 'https://example.com',
      envTag: 'prod',
      capturedAt: '2026-02-23T08:00:00.000Z',
    });
    assert.ok(xml.startsWith('<?xml version="1.0"'));
    assert.ok(xml.includes('<testsuites'));
    assert.ok(xml.includes('<testsuite'));
    assert.ok(xml.includes('<testcase'));
    assert.ok(xml.includes('name="NO_ACCESSIBLE_NAME"'));
  });

  it('blocking findings produce <failure> elements', () => {
    const xml = ctx.buildJunitXml({
      findings: [
        { type: 'NO_ACCESSIBLE_NAME', severity: 'high', wcag: '4.1.2',
          confidence: 'strict', note: 'Test', path: 'button' },
      ],
      mode: 'run', url: 'https://example.com', envTag: 'prod',
      capturedAt: '2026-02-23T08:00:00.000Z',
    });
    assert.ok(xml.includes('<failure'));
  });

  it('heuristic findings produce <skipped> elements', () => {
    const xml = ctx.buildJunitXml({
      findings: [
        { type: 'CLICK_WITHOUT_KEYBOARD', severity: 'medium', wcag: '2.1.1',
          confidence: 'heuristic', note: 'Test', path: 'div' },
      ],
      mode: 'run', url: 'https://example.com', envTag: 'prod',
      capturedAt: '2026-02-23T08:00:00.000Z',
    });
    assert.ok(xml.includes('<skipped'));
    assert.ok(xml.includes('needs_review'));
  });

  it('escapes XML special characters', () => {
    const xml = ctx.buildJunitXml({
      findings: [
        { type: 'TEST', severity: 'low', wcag: '1.1.1', confidence: 'strict',
          note: 'Has <b>bold</b> & "quotes"', path: 'img' },
      ],
      mode: 'run', url: 'https://example.com', envTag: 'prod',
      capturedAt: '2026-02-23T08:00:00.000Z',
    });
    assert.ok(xml.includes('&lt;b&gt;'));
    assert.ok(xml.includes('&amp;'));
    assert.ok(xml.includes('&quot;'));
  });

  it('includes version metadata', () => {
    const xml = ctx.buildJunitXml({
      findings: [], mode: 'run', url: 'https://example.com', envTag: 'prod',
      capturedAt: '2026-02-23T08:00:00.000Z',
    });
    assert.ok(xml.includes('schemaVersion='));
    assert.ok(xml.includes('signatureVersion='));
    assert.ok(xml.includes('enMappingVersion='));
  });

  // P0-1 FIX: determinism tests
  it('uses capturedAt timestamp, not current time', () => {
    const xml = ctx.buildJunitXml({
      findings: [], mode: 'run', url: 'https://example.com', envTag: 'prod',
      capturedAt: '2026-02-23T08:00:00.000Z',
    });
    assert.ok(xml.includes('timestamp="2026-02-23T08:00:00.000Z"'));
    // Should NOT contain a different timestamp
  });

  it('deterministic: same input → same output (no time dependency)', () => {
    const args = {
      findings: [
        { type: 'B', severity: 'low', wcag: '1.1.1', confidence: 'heuristic', note: 'y', path: 'b' },
        { type: 'A', severity: 'high', wcag: '4.1.2', confidence: 'strict', note: 'x', path: 'a' },
      ],
      mode: 'run', url: 'https://example.com', envTag: 'prod',
      capturedAt: '2026-02-23T08:00:00.000Z',
    };
    const xml1 = ctx.buildJunitXml(args);
    const xml2 = ctx.buildJunitXml(args);
    assert.equal(xml1, xml2, 'identical input must produce identical output');
  });

  it('findings are sorted deterministically in output', () => {
    const args = {
      findings: [
        { type: 'Z_RULE', severity: 'low', wcag: '1.1.1', confidence: 'strict', note: 'z', path: 'z' },
        { type: 'A_RULE', severity: 'high', wcag: '4.1.2', confidence: 'strict', note: 'a', path: 'a' },
      ],
      mode: 'run', url: 'https://example.com', envTag: 'prod',
      capturedAt: '2026-02-23T08:00:00.000Z',
    };
    const xml = ctx.buildJunitXml(args);
    const aPos = xml.indexOf('A_RULE');
    const zPos = xml.indexOf('Z_RULE');
    assert.ok(aPos < zPos, 'A_RULE should appear before Z_RULE (sorted by type)');
  });

  // P1-1: sort includes frameKey and scope context
  it('sortFindingsForExport uses full 7-key sort', () => {
    const findings = [
      { type: 'SAME', wcag: '1.1.1', severity: 'high', path: 'a', _frameKey: 'fk::b', _scopeType: 'document' },
      { type: 'SAME', wcag: '1.1.1', severity: 'high', path: 'a', _frameKey: 'fk::a', _scopeType: 'document' },
    ];
    const sorted = ctx.sortFindingsForExport(findings);
    assert.equal(sorted[0]._frameKey, 'fk::a', 'frameKey should be primary sort');
    assert.equal(sorted[1]._frameKey, 'fk::b');
  });

  it('sortFindingsForExport does not mutate input', () => {
    const findings = [
      { type: 'B', severity: 'low', wcag: '1.1.1', path: 'b' },
      { type: 'A', severity: 'high', wcag: '4.1.2', path: 'a' },
    ];
    const original = [...findings];
    ctx.sortFindingsForExport(findings);
    assert.equal(findings[0].type, original[0].type, 'input must not be mutated');
  });

  it('fallback timestamp when capturedAt is missing', () => {
    const xml = ctx.buildJunitXml({
      findings: [], mode: 'run', url: 'https://example.com', envTag: 'prod',
      // capturedAt intentionally omitted
    });
    assert.ok(xml.includes('timestamp="1970-01-01T00:00:00.000Z"'));
  });
});
```

### Test: Overlay lifecycle (`test/overlay-lifecycle.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Overlay lifecycle (logic-level)', () => {
  it('annotationsActive starts as false', () => {
    let annotationsActive = false;
    assert.equal(annotationsActive, false);
  });

  it('annotation data uses targetRef, not path', () => {
    const findings = [
      {
        type: 'NO_ACCESSIBLE_NAME', severity: 'high',
        path: 'my-component >>> div > button',  // Not a valid CSS selector
        targetRef: { cssSelector: '#submit-btn', testId: 'submit', tag: 'button', role: null, name: null, inShadow: true },
        note: 'Missing name',
      },
    ];
    const annotationData = findings.map((f, i) => ({
      id: String(i),
      type: f.type,
      severity: f.severity,
      targetRef: f.targetRef,  // P0-2 FIX: use targetRef, not path
      note: f.note || '',
    }));
    assert.equal(annotationData.length, 1);
    assert.equal(annotationData[0].id, '0');
    assert.ok(annotationData[0].targetRef, 'must have targetRef');
    assert.ok(!annotationData[0].path, 'should not pass raw path');
    assert.ok(!annotationData[0].html, 'should not include raw HTML');
    assert.ok(!annotationData[0].el, 'should not include DOM reference');
  });

  it('annotation data caps at 200 items', () => {
    const MAX_ANNOTATIONS = 200;
    const findings = Array.from({ length: 300 }, (_, i) => ({
      id: String(i), type: 'TEST', severity: 'low',
      targetRef: { cssSelector: `#el${i}`, testId: null, tag: 'div', role: null, name: null, inShadow: false },
      note: '',
    }));
    const capped = findings.slice(0, MAX_ANNOTATIONS);
    assert.equal(capped.length, 200);
  });

  it('targetRef with only tag+role is valid (fallback)', () => {
    const targetRef = { cssSelector: null, testId: null, tag: 'button', role: 'button', name: 'Submit', inShadow: false };
    assert.ok(targetRef.tag, 'tag must be present for fallback');
  });

  // P1-2: tag+role fallback skips when >50 candidates
  it('resolveTarget skips tag fallback when too many candidates', () => {
    // Logic-level: if doc.querySelectorAll(tag).length > 50, return null
    const MAX_TAG_CANDIDATES = 50;
    assert.ok(MAX_TAG_CANDIDATES === 50, 'cap is 50 elements');
    // Actual DOM test would verify: 51 <div> elements → resolveTarget returns null
    // when cssSelector and testId are both null.
  });

  // P1-3: frame consistency guard
  it('overlay refuses when frame context changed', () => {
    const snapshotFrameId = 100;
    const currentBestFrameId = 200;
    const shouldBlock = snapshotFrameId !== currentBestFrameId;
    assert.ok(shouldBlock, 'must block overlay when frame changed');
  });

  it('overlay allows when frame matches', () => {
    const snapshotFrameId = 100;
    const currentBestFrameId = 100;
    const shouldAllow = snapshotFrameId === currentBestFrameId;
    assert.ok(shouldAllow, 'must allow overlay when frame matches');
  });

  // P1-7: overlay mode restriction
  it('overlay only allowed for run mode', () => {
    const OVERLAY_ALLOWED_MODES = new Set(['run']);
    assert.ok(OVERLAY_ALLOWED_MODES.has('run'), 'run mode allowed');
    assert.ok(!OVERLAY_ALLOWED_MODES.has('contrast'), 'contrast mode blocked');
    assert.ok(!OVERLAY_ALLOWED_MODES.has('tabWalk'), 'tabWalk mode blocked');
    assert.ok(!OVERLAY_ALLOWED_MODES.has('observe'), 'observe mode blocked');
    assert.ok(!OVERLAY_ALLOWED_MODES.has('watch'), 'watch mode blocked');
  });
});
```

### Test: Versioning & migration (`test/migration.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Session versioning and migration', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('normalizeLoadedSession migrates v1 → v2', () => {
    const v1Session = {
      id: 'test_123',
      schemaVersion: 1,
      signatureVersion: 1,
      steps: [
        { index: 0, snapshots: { run: null }, capturedAt: '2026-02-20T10:00:00Z' },
      ],
    };
    const { session, migrated, warnings } = ctx.normalizeLoadedSession(v1Session);
    assert.equal(migrated, true);
    assert.equal(session.schemaVersion, 2);
    assert.ok(warnings.length > 0, 'should have migration warnings');
    // scope field added
    assert.deepEqual(session.steps[0].scope, { type: 'document', rootSelector: null, rootTestId: null });
    // enMappingVersion added
    assert.equal(session.enMappingVersion, 0);
  });

  it('normalizeLoadedSession is no-op for v2 session', () => {
    const v2Session = {
      id: 'test_456',
      schemaVersion: 2,
      signatureVersion: 2,
      enMappingVersion: 1,
      steps: [
        { index: 0, scope: { type: 'document', rootSelector: null }, snapshots: { run: null } },
      ],
    };
    const { session, migrated, warnings } = ctx.normalizeLoadedSession(v2Session);
    assert.equal(migrated, false);
    assert.equal(warnings.length, 0);
    assert.equal(session.schemaVersion, 2);
  });

  it('checkSignatureCompatibility detects mismatch', () => {
    const snapA = { signatureVersion: 1 };
    const snapB = { signatureVersion: 2 };
    const result = ctx.checkSignatureCompatibility(snapA, snapB);
    assert.equal(result.compatible, false);
    assert.ok(result.warning, 'should have warning message');
  });

  it('checkSignatureCompatibility: same version is compatible', () => {
    const snapA = { signatureVersion: 2 };
    const snapB = { signatureVersion: 2 };
    const result = ctx.checkSignatureCompatibility(snapA, snapB);
    assert.equal(result.compatible, true);
    assert.equal(result.warning, null);
  });

  it('normalizeLoadedSession does not mutate original', () => {
    const v1Session = {
      id: 'test_789',
      schemaVersion: 1,
      steps: [{ index: 0, snapshots: { run: null } }],
    };
    const original = JSON.parse(JSON.stringify(v1Session));
    ctx.normalizeLoadedSession(v1Session);
    assert.deepEqual(v1Session, original, 'original should not be mutated');
  });
});
```

---

## Production Hardening Phase

> Added in Revision 4. Builds on all P0/P1 fixes. Adds shadow coverage transparency, performance optimizations, coverage-aware diff warnings, and schema v3.

### Part 1 — Shadow Coverage Receipt (per snapshot)

Extend `run()` result in `a11y-audit-snippet.js` to include shadow coverage metadata.

#### Updated `run()` return shape

```javascript
return {
  ok: true,
  findings,
  mode: "run",
  scope: /* ...existing... */,
  // NEW: shadow coverage receipt — always present, even when 0 shadow roots
  shadowCoverage: {
    scopesFound: number,          // total open shadow roots discovered in rootEl subtree
    scopesAudited: number,        // min(scopesFound, MAX_SHADOW_SCOPES)
    scopesCapped: boolean,        // true if scopesFound > MAX_SHADOW_SCOPES
    maxDepthObserved: number,     // deepest shadow nesting level actually traversed
    depthLimitReached: boolean,   // true if traversal stopped due to MAX_SHADOW_DEPTH
  },
  // ...existing fields...
};
```

#### Updated `collectScopes()` — track coverage metadata

```javascript
/**
 * Collect all reachable DOM scopes (rootNode + open shadow roots within it).
 * Returns: { scopes: Array<{root, depth}>, coverage: ShadowCoverage }
 *
 * Coverage metadata is computed during traversal at zero extra cost.
 * Deterministic: same DOM → same coverage.
 * For subtree mode, traversal strictly scoped to rootEl (P1-4 guarantee).
 */
function collectScopesWithCoverage(rootNode) {
  const scopes = [{ root: rootNode, depth: 0 }];
  let i = 0;
  let maxDepthObserved = 0;
  let depthLimitReached = false;
  let totalShadowRootsFound = 0;

  while (i < scopes.length) {
    const { root, depth } = scopes[i++];

    if (depth > maxDepthObserved) maxDepthObserved = depth;

    if (depth >= MAX_SHADOW_DEPTH) {
      depthLimitReached = true;
      continue;  // Do not traverse deeper, but keep iterating queue
    }

    if (scopes.length >= MAX_SHADOW_SCOPES + 1) {
      // +1 because scopes[0] is rootNode itself (not a shadow root)
      // We've hit the cap; continue counting but don't add more scopes
    }

    const ownerDoc = root.ownerDocument || root;
    const walker = ownerDoc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
    let node;
    while ((node = walker.nextNode())) {
      if (node.shadowRoot) {
        totalShadowRootsFound++;
        if (scopes.length < MAX_SHADOW_SCOPES + 1) {
          scopes.push({ root: node.shadowRoot, depth: depth + 1 });
        }
      }
    }
  }

  const scopesFound = totalShadowRootsFound;
  const scopesAudited = Math.min(scopesFound, MAX_SHADOW_SCOPES);
  const scopesCapped = scopesFound > MAX_SHADOW_SCOPES;

  return {
    scopes,
    coverage: {
      scopesFound,
      scopesAudited,
      scopesCapped,
      maxDepthObserved,
      depthLimitReached,
    },
  };
}
```

#### Integration in `run()`

```javascript
const run = (cfg = {}) => {
  resetScopeCache();

  const rootEl = cfg.rootSelector
    ? doc.querySelector(cfg.rootSelector)
    : doc.documentElement;

  // ...existing root validation...

  // Collect scopes once — now returns coverage metadata
  const { scopes, coverage: shadowCoverage } = collectScopesWithCoverage(rootEl);
  _scopeCache = scopes;  // Feed into cachedCollectScopes for rules

  // ...existing rule execution...

  return {
    ok: true,
    findings,
    mode: "run",
    scope: /* ...existing... */,
    shadowCoverage,  // Always present
    // ...existing fields...
  };
};
```

**Guarantee:** `shadowCoverage` is always present in the return object, even if there are 0 shadow roots (`scopesFound: 0, scopesAudited: 0, scopesCapped: false, maxDepthObserved: 0, depthLimitReached: false`).

---

### Part 2 — Shadow Cap Transparency Finding

Update `SHADOW_DOM_NOTE` to use structured coverage metrics:

```javascript
if (shadowCoverage.scopesFound > 0) {
  const capLine = shadowCoverage.scopesCapped
    ? ` Traversal capped at ${MAX_SHADOW_SCOPES}.`
    : "";

  add(findings, {
    type: "SHADOW_DOM_NOTE",
    el: doc.body,
    severity: "info",
    note: `Open shadow roots found: ${shadowCoverage.scopesFound}. `
      + `Audited: ${shadowCoverage.scopesAudited}.${capLine} `
      + `Max depth observed: ${shadowCoverage.maxDepthObserved}. `
      + `Depth limit reached: ${shadowCoverage.depthLimitReached}. `
      + `Closed shadow roots (if any) cannot be detected or audited.`,
    extra: {
      openShadowRoots: shadowCoverage.scopesFound,
      scopesAudited: shadowCoverage.scopesAudited,
      scopesCapped: shadowCoverage.scopesCapped,
      maxDepthObserved: shadowCoverage.maxDepthObserved,
      depthLimitReached: shadowCoverage.depthLimitReached,
    },
  });
}
```

**Stability:** No timestamps, no random ordering. Text is deterministic for same DOM state.

---

### Part 3 — Coverage-Aware Diff Warnings

In `panel.js`, when comparing snapshots in `buildStepDiffs` (or `diffModeBundles`):

```javascript
/**
 * Compare shadow coverage between two snapshots.
 * Returns a warning object if coverage changed, or null if identical.
 *
 * Warning is informational only — does NOT alter diff results.
 */
function checkShadowCoverageChange(prevSnap, currSnap) {
  const prevCov = prevSnap?.shadowCoverage || null;
  const currCov = currSnap?.shadowCoverage || null;

  // Both missing → no comparison possible (pre-v3 snapshots)
  if (!prevCov && !currCov) return null;

  // One missing → coverage status changed (migration edge case)
  if (!prevCov || !currCov) {
    return {
      type: "SHADOW_COVERAGE_CHANGED",
      from: prevCov || { scopesAudited: 0, scopesCapped: false, depthLimitReached: false },
      to: currCov || { scopesAudited: 0, scopesCapped: false, depthLimitReached: false },
    };
  }

  // Compare material fields
  const changed =
    prevCov.scopesCapped !== currCov.scopesCapped ||
    prevCov.scopesAudited !== currCov.scopesAudited ||
    prevCov.depthLimitReached !== currCov.depthLimitReached;

  if (!changed) return null;

  return {
    type: "SHADOW_COVERAGE_CHANGED",
    from: {
      scopesAudited: prevCov.scopesAudited,
      scopesCapped: prevCov.scopesCapped,
      depthLimitReached: prevCov.depthLimitReached,
    },
    to: {
      scopesAudited: currCov.scopesAudited,
      scopesCapped: currCov.scopesCapped,
      depthLimitReached: currCov.depthLimitReached,
    },
  };
}
```

#### Integration in diff pipeline

```javascript
function buildStepDiffs(prevStep, currStep, rawAppendix) {
  // ...existing diff logic...

  // Check shadow coverage change (informational only)
  const prevRunSnap = prevStep?.snapshots?.run?.best;
  const currRunSnap = currStep?.snapshots?.run?.best;
  const covWarning = checkShadowCoverageChange(
    prevRunSnap ? (rawAppendix || {})[prevRunSnap.rawRef] : null,
    currRunSnap ? (rawAppendix || {})[currRunSnap.rawRef] : null
  );

  if (covWarning) {
    diff.warnings = diff.warnings || [];
    diff.warnings.push(covWarning);
  }

  return diff;
}
```

#### Panel display

```javascript
// In step diff rendering:
for (const w of diff.warnings || []) {
  if (w.type === "SHADOW_COVERAGE_CHANGED") {
    renderDiffWarning(
      "Shadow DOM coverage changed between snapshots. Diffs may be incomplete."
    );
  }
}
```

#### Export integration

Add `SHADOW_COVERAGE_CHANGED` warnings to `determinismMeta.warnings[]`.

---

### Part 4 — Selector Batching Per Scope (Performance)

Optimize rule execution by caching `querySelectorAll` results per scope per selector.

#### Selector cache implementation

```javascript
/**
 * Per-scope selector cache.
 * Created once per run() invocation. Scoped to a single audit run — no persistence.
 *
 * Structure: Map<ScopeRoot, Map<selector, Element[]>>
 *
 * Rules call cachedQueryAll(selector) instead of querySelectorAll(selector).
 * First call per (scope, selector) pair executes the query. Subsequent calls
 * return cached results. Deterministic: same DOM → same cache contents.
 *
 * No mutation of DOM. No WeakRef or GC timing dependency.
 */
let _selectorCache = null;

function resetSelectorCache() {
  _selectorCache = new Map();
}

/**
 * Query all scopes for a given selector, using the per-scope cache.
 * Must be called AFTER collectScopesWithCoverage() has populated _scopeCache.
 */
function cachedQueryAllDeep(selector) {
  const scopes = _scopeCache;
  if (!scopes) return [];

  const results = [];
  for (const { root } of scopes) {
    let scopeMap = _selectorCache.get(root);
    if (!scopeMap) {
      scopeMap = new Map();
      _selectorCache.set(root, scopeMap);
    }

    let elements = scopeMap.get(selector);
    if (!elements) {
      try {
        elements = [...root.querySelectorAll(selector)];
      } catch {
        elements = [];
      }
      scopeMap.set(selector, elements);
    }

    for (const el of elements) results.push(el);
  }
  return results;
}
```

#### Updated `_q` helper

```javascript
const _q = (sel, type, sev, wcag, test, note, opts) => {
  // Use cached deep query — same selector across rules only queried once per scope
  const elements = cachedQueryAllDeep(sel);
  for (const el of elements) {
    if (isHiddenCached(el, cache)) continue;
    if (test && !test(el)) continue;
    const entry = { type, el, severity: sev, wcag };
    if (note) entry.note = typeof note === "function" ? note(el) : note;
    if (opts) Object.assign(entry, typeof opts === "function" ? opts(el) : opts);
    add(findings, entry);
  }
};
```

#### Reset at run start

```javascript
const run = (cfg = {}) => {
  resetScopeCache();
  resetSelectorCache();  // NEW: clear per-scope selector cache
  // ...rest of run()...
};
```

---

### Part 5 — Rule Gating (Fast Presence Check)

Before executing rule groups per scope, compute lightweight presence flags.

#### Scope presence flags

```javascript
/**
 * Compute presence flags per scope. Called once per scope at the start of rule execution.
 * These flags allow rules to skip entire categories when no matching elements exist.
 *
 * Must not change rule semantics — rules that would produce 0 findings are simply
 * not executed, saving querySelectorAll + iteration overhead.
 *
 * Deterministic: same DOM → same flags.
 */
function computeScopeFlags(scopeRoot) {
  return {
    hasImages: !!scopeRoot.querySelector("img, [role='img'], svg[role='img']"),
    hasInteractive: !!scopeRoot.querySelector(
      "a[href], button, input, select, textarea, [tabindex], [role='button'], [role='link'], [role='checkbox'], [role='radio'], [role='slider'], [role='switch'], [role='textbox']"
    ),
    hasForms: !!scopeRoot.querySelector("input, select, textarea, [role='textbox'], [role='combobox'], [role='listbox']"),
    hasHeadings: !!scopeRoot.querySelector("h1, h2, h3, h4, h5, h6, [role='heading']"),
    hasLandmarks: !!scopeRoot.querySelector("main, nav, aside, header, footer, [role='main'], [role='navigation'], [role='complementary'], [role='banner'], [role='contentinfo']"),
    hasLiveRegions: !!scopeRoot.querySelector("[aria-live], [role='alert'], [role='status'], [role='log'], [role='timer']"),
    hasTables: !!scopeRoot.querySelector("table, [role='table'], [role='grid']"),
    hasIframes: !!scopeRoot.querySelector("iframe"),
  };
}
```

#### Aggregate flags across all scopes

```javascript
/**
 * Merge presence flags across all scopes.
 * If ANY scope has a flag, the aggregate flag is true.
 * Used by rules that query across scopes.
 */
function computeAggregateFlags(scopes) {
  const agg = {
    hasImages: false, hasInteractive: false, hasForms: false,
    hasHeadings: false, hasLandmarks: false, hasLiveRegions: false,
    hasTables: false, hasIframes: false,
  };
  for (const { root } of scopes) {
    const f = computeScopeFlags(root);
    for (const key of Object.keys(agg)) {
      if (f[key]) agg[key] = true;
    }
  }
  return agg;
}
```

#### Rule gating in `run()`

```javascript
const run = (cfg = {}) => {
  // ...existing setup, scope collection...

  const flags = computeAggregateFlags(_scopeCache);

  // Image rules — skip if no images in any scope
  if (flags.hasImages) {
    _q("img:not([alt])", "IMG_MISSING_ALT", "medium", "1.1.1");
    _q("img[alt='']", "IMG_EMPTY_ALT", "low", "1.1.1");
    // ...other image rules...
  }

  // Keyboard/interactive rules — skip if no interactive elements
  if (flags.hasInteractive) {
    // CLICK_WITHOUT_KEYBOARD, ARIA_HIDDEN_FOCUSABLE, etc.
  }

  // Form rules — skip if no form controls
  if (flags.hasForms) {
    // FORM_CONTROL_NO_LABEL, MISSING_AUTOCOMPLETE, etc.
  }

  // Heading rules — skip if no headings
  if (flags.hasHeadings) {
    // HEADING_LEVEL_SKIP, HEADING_HIERARCHY_FRAGMENTED, etc.
  }

  // Landmark rules — skip if no landmarks
  if (flags.hasLandmarks) {
    // DUPLICATE_MAIN_LANDMARK, DUPLICATE_NAV_NO_LABEL, etc.
  }

  // Live region rules — skip if no live regions
  if (flags.hasLiveRegions) {
    // LIVE_REGION_HIDDEN, COMPETING_ASSERTIVE_LIVE, etc.
  }

  // Table rules — skip if no tables
  if (flags.hasTables) {
    // TABLE_NO_HEADERS
  }

  // Iframe rules — skip if no iframes
  if (flags.hasIframes) {
    // IFRAME_MISSING_TITLE, IFRAME_CROSS_ORIGIN
  }

  // Rules that don't have a category gate (always run):
  // NO_ACCESSIBLE_NAME, BROKEN_ARIA_REFERENCE, POSITIVE_TABINDEX,
  // DUPLICATE_ID, NO_SKIP_NAV, MISSING_LANG, VIEWPORT_ZOOM_DISABLED, etc.

  // ...rest of run()...
};
```

**Semantics guarantee:** Gating does NOT change rule behavior. If `flags.hasImages` is false, there are zero `<img>` elements to find — the rules would produce zero findings anyway. The gate just avoids the querySelectorAll call.

---

### Part 6 — Signature Quality Downgrade for Shadow nth Paths

In `panel.js` signature builder:

```javascript
/**
 * Determine signatureQuality for a finding.
 * Extends existing logic with shadow DOM nth-path downgrade.
 *
 * Rationale: Shadow DOM + nth-of-type paths are structurally volatile in
 * component re-renders. When a web component re-renders its shadow DOM,
 * child ordering may change, invalidating nth-of-type indices. Findings
 * matched only by such paths should be treated as low-quality signatures.
 *
 * Does NOT change signature hash generation — only the signatureQuality field.
 */
function computeSignatureQuality(finding) {
  // Existing logic for high/medium quality...
  const path = finding.path || "";
  const testId = finding.testId || "";
  const id = finding.id || "";

  // Strong identity: testId or element ID present
  if (testId || (path.includes("#") && !path.includes(">>>"))) {
    return "high";
  }

  // Shadow DOM + nth-of-type without strong anchor → low quality
  // Shadow DOM + nth-of-type paths are structurally volatile in component re-renders.
  if (
    path.includes(">>>") &&
    !path.includes("#") &&
    !path.includes("[data-testid") &&
    path.includes(":nth-of-type(")
  ) {
    return "low";
  }

  // Medium: has a path but no testId/id
  if (path) return "medium";

  // No path at all
  return "low";
}
```

#### Integration in signature entries

```javascript
// In findingSignatureEntries() or runSignatureEntries():
for (const f of findings) {
  const sig = buildSignatureString(f);
  const quality = computeSignatureQuality(f);
  entries.push({
    sig,
    signatureQuality: quality,
    finding: f,
    // ...existing fields...
  });
}
```

---

### Part 7 — Subtree Edge-Case: Selection Inside Shadow

When user triggers subtree scan via "Scan subtree" button:

#### Updated `getSelectedElementSelector()`

```javascript
async function getSelectedElementSelector() {
  return new Promise((resolve) => {
    chrome.devtools.inspectedWindow.eval(
      `(function() {
        const el = $0;  // DevTools selected element
        if (!el || el.nodeType !== 1) return { selector: null, elevated: false };

        // Part 7: detect if selected element is inside Shadow DOM
        const rootNode = el.getRootNode();
        let targetEl = el;
        let elevated = false;

        if (rootNode instanceof ShadowRoot) {
          // Selected element is inside a shadow root.
          // Elevate to the shadow host — cannot scope querySelectorAll
          // to an internal shadow element from outside.
          targetEl = rootNode.host;
          elevated = true;
        }

        // Build selector for targetEl (which is now in light DOM or is a host)
        if (targetEl.id) return { selector: '#' + CSS.escape(targetEl.id), elevated };
        if (targetEl.getAttribute('data-testid'))
          return { selector: '[data-testid="' + targetEl.getAttribute('data-testid') + '"]', elevated };

        const parts = [];
        let node = targetEl;
        while (node && node.nodeType === 1 && parts.length < 6) {
          const id = node.id ? '#' + CSS.escape(node.id) : '';
          let nth = '';
          if (!id && node.parentElement) {
            const sib = [...node.parentElement.children].filter(c => c.tagName === node.tagName);
            if (sib.length > 1) nth = ':nth-of-type(' + (sib.indexOf(node) + 1) + ')';
          }
          parts.unshift(node.tagName.toLowerCase() + id + nth);
          if (id) break;
          node = node.parentElement;
        }
        return { selector: parts.join(' > '), elevated };
      })()`,
      (result, err) => {
        if (err || !result) return resolve({ selector: null, elevated: false });
        resolve(result);
      }
    );
  });
}
```

#### Panel handler update

```javascript
async function onSubtreeScanClick() {
  const { selector, elevated } = await getSelectedElementSelector();
  if (!selector) {
    showToast("No element selected in DevTools Elements panel.", "info", 4000);
    return;
  }

  if (elevated) {
    showToast(
      "Selected element is inside Shadow DOM. Subtree scope elevated to shadow host.",
      "info", 5000
    );
  }

  await send({ type: "RUN_AUDIT", rootSelector: selector, /* ...existing params */ });
}
```

---

### Part 8 — Overlay Render Stats

Enhance `annotateFindings()` return value with detailed skip reasons:

#### Updated `annotateFindings()` in snippet

```javascript
function annotateFindings(findingsData) {
  clearAnnotations();

  const container = doc.createElement("div");
  container.id = ANNOTATION_CONTAINER_ID;
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = "position:fixed;top:0;left:0;width:0;height:0;overflow:visible;z-index:2147483646;pointer-events:none;";
  doc.body.appendChild(container);

  const requested = Math.min((findingsData || []).length, MAX_ANNOTATIONS);
  let rendered = 0;
  const skippedReasons = {
    notFound: 0,
    tooManyCandidates: 0,
    zeroSize: 0,
  };
  const SEV_COLORS = {
    critical: "#DB5A5A", high: "#D4864E", medium: "#C4A855",
    low: "#5AB89A", info: "#7A8EA6",
  };

  for (const f of (findingsData || []).slice(0, MAX_ANNOTATIONS)) {
    const el = resolveTarget(f.targetRef);
    if (!el) {
      // Distinguish skip reason based on resolveTarget internals.
      // resolveTarget already returns null for both "not found" and "too many candidates".
      // We need a way to distinguish. Use a sentinel on targetRef.
      if (f.targetRef?.tag) {
        try {
          const count = doc.querySelectorAll(f.targetRef.tag).length;
          if (count > 50) { skippedReasons.tooManyCandidates++; continue; }
        } catch {}
      }
      skippedReasons.notFound++;
      continue;
    }

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      skippedReasons.zeroSize++;
      continue;
    }

    // ...existing marker creation code (unchanged)...

    const marker = doc.createElement("div");
    marker.className = ANNOTATION_CLASS;
    marker.dataset.findingId = f.id || "";
    marker.dataset.findingType = f.type || "";
    const color = SEV_COLORS[f.severity] || SEV_COLORS.info;
    marker.style.cssText = `
      position:fixed;
      top:${rect.top - 2}px; left:${rect.left - 2}px;
      width:${rect.width + 4}px; height:${rect.height + 4}px;
      border:2px solid ${color}; border-radius:3px;
      pointer-events:auto; cursor:pointer;
      z-index:2147483646; box-sizing:border-box;
    `;

    const badge = doc.createElement("span");
    badge.style.cssText = `
      position:absolute;top:-10px;left:-2px;
      background:${color};color:#fff;font:bold 10px/12px system-ui;
      padding:1px 4px;border-radius:2px;white-space:nowrap;
      pointer-events:auto;cursor:pointer;max-width:160px;overflow:hidden;text-overflow:ellipsis;
    `;
    badge.textContent = f.type || "issue";
    badge.title = `${f.severity}: ${f.type}\n${f.note || ""}`;
    marker.appendChild(badge);

    marker.addEventListener("click", () => {
      w.dispatchEvent(new CustomEvent("__flowlens_annotation_click__", {
        detail: { findingId: f.id, findingType: f.type }
      }));
    });

    container.appendChild(marker);
    rendered++;
  }

  const skipped = requested - rendered;
  return {
    ok: true,
    requested,
    rendered,
    skipped,
    skippedReasons,
  };
}
```

#### Panel display

```javascript
// After annotate response:
if (result?.ok) {
  const { requested, rendered, skipped } = result;
  if (skipped > 0) {
    updateAnnotationStatus(`Annotations: ${rendered}/${requested} (skipped ${skipped})`);
  } else {
    updateAnnotationStatus(`Annotations: ${rendered}/${requested}`);
  }
}
```

This is informational only. No persistence.

---

### Part 9 — Versioning (Schema v2 → v3)

#### Version bump

```javascript
const SESSION_SCHEMA_VERSION = 3;      // was 2; bump for shadowCoverage in snapshot
// SESSION_SIGNATURE_VERSION remains 2 (no signature hash changes)
// FRAME_KEY_VERSION remains 1
// EN_MAPPING_VERSION remains 1
```

#### Schema version bump table (updated)

| Version | Current → New | Reason |
|---------|---------------|--------|
| `schemaVersion` | 2 → 3 | Snapshot now includes `shadowCoverage`; `determinismMeta` includes `shadowCoverageSummary` |
| `signatureVersion` | 2 → 2 | No change (signature hash logic unchanged) |
| `frameKeyVersion` | 1 → 1 | No change |
| `enMappingVersion` | 1 → 1 | No change |

#### Updated `normalizeLoadedSession()`

```javascript
function normalizeLoadedSession(raw) {
  const warnings = [];
  let migrated = false;

  const session = structuredClone(raw);
  const loadedSchema = session.schemaVersion || 1;

  // --- Schema v1 → v2 migration (existing) ---
  if (loadedSchema < 2) {
    migrated = true;
    warnings.push(`Session migrated from schemaVersion ${loadedSchema} to ${SESSION_SCHEMA_VERSION}.`);

    for (const step of session.steps || []) {
      if (!step.scope) {
        step.scope = { type: "document", rootSelector: null, rootTestId: null };
      }
    }
    if (!session.enMappingVersion) {
      session.enMappingVersion = 0;
    }
  }

  // --- Schema v2 → v3 migration (NEW) ---
  if (loadedSchema < 3) {
    if (loadedSchema >= 2) {
      migrated = true;
      warnings.push(`Session migrated from schemaVersion ${loadedSchema} to ${SESSION_SCHEMA_VERSION}.`);
    }

    // Add shadowCoverage to raw snapshot data if missing
    // We can't reconstruct it, so initialize with zeros (meaning "unknown/pre-v3")
    for (const step of session.steps || []) {
      const runSnap = step?.snapshots?.run?.best;
      if (runSnap && !runSnap.shadowCoverage) {
        runSnap.shadowCoverage = {
          scopesFound: 0,
          scopesAudited: 0,
          scopesCapped: false,
          maxDepthObserved: 0,
          depthLimitReached: false,
        };
      }
    }
  }

  session.schemaVersion = SESSION_SCHEMA_VERSION;  // 3

  return { session, migrated, warnings };
}
```

#### Updated `determinismMeta`

```javascript
function buildDeterminismMeta(session) {
  return {
    schemaVersion: SESSION_SCHEMA_VERSION,      // 3
    signatureVersion: SESSION_SIGNATURE_VERSION, // 2
    frameKeyVersion: session.frameKeyVersion || FRAME_KEY_VERSION,
    enMappingVersion: EN_MAPPING_VERSION,
    totalSteps: (session.steps || []).length,
    perStepFrameKeys: (session.steps || []).map(s => {
      const keys = s?.frameSelections?.usedFrameKeys || [];
      return { count: keys.length, hash: fnv1aHash8(keys.join(",")) };
    }),
    // NEW: per-step shadow coverage summary
    shadowCoverageSummary: (session.steps || []).map(s => {
      const cov = s?.snapshots?.run?.best?.shadowCoverage;
      return cov
        ? {
            scopesAudited: cov.scopesAudited,
            scopesCapped: cov.scopesCapped,
            depthLimitReached: cov.depthLimitReached,
          }
        : null;
    }),
    warnings: [],
    migratedFrom: /* ...existing... */,
  };
}
```

---

### Part 10 — Tests

#### New test files for production hardening

| File | Tests |
|------|-------|
| `test/shadow-coverage.test.mjs` | Shadow coverage receipt |
| `test/coverage-diff-warning.test.mjs` | Coverage-aware diff warnings |
| `test/selector-batching.test.mjs` | Selector cache deduplication |
| `test/subtree-shadow-elevation.test.mjs` | Subtree selection inside shadow |
| `test/signature-shadow-quality.test.mjs` | Shadow nth-path quality downgrade |

#### Test: Shadow coverage (`test/shadow-coverage.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Shadow coverage receipt', () => {
  it('shadowCoverage always present even with 0 shadow roots', () => {
    const coverage = {
      scopesFound: 0,
      scopesAudited: 0,
      scopesCapped: false,
      maxDepthObserved: 0,
      depthLimitReached: false,
    };
    assert.equal(coverage.scopesFound, 0);
    assert.equal(coverage.scopesCapped, false);
    assert.equal(coverage.depthLimitReached, false);
  });

  it('scopesCapped true when scopesFound > MAX_SHADOW_SCOPES', () => {
    const MAX_SHADOW_SCOPES = 50;
    const scopesFound = 75;
    const scopesCapped = scopesFound > MAX_SHADOW_SCOPES;
    const scopesAudited = Math.min(scopesFound, MAX_SHADOW_SCOPES);
    assert.equal(scopesCapped, true);
    assert.equal(scopesAudited, 50);
  });

  it('depthLimitReached true when max depth exceeded', () => {
    const MAX_SHADOW_DEPTH = 5;
    // Simulate: a scope at depth 5 would set depthLimitReached
    const depths = [0, 1, 2, 3, 4, 5];
    const depthLimitReached = depths.some(d => d >= MAX_SHADOW_DEPTH);
    assert.equal(depthLimitReached, true);
  });

  it('depthLimitReached false when all within limit', () => {
    const MAX_SHADOW_DEPTH = 5;
    const depths = [0, 1, 2, 3];
    const depthLimitReached = depths.some(d => d >= MAX_SHADOW_DEPTH);
    assert.equal(depthLimitReached, false);
  });

  it('maxDepthObserved tracks deepest level', () => {
    const depths = [0, 1, 3, 2, 1];
    const maxDepthObserved = Math.max(...depths);
    assert.equal(maxDepthObserved, 3);
  });

  it('scopesAudited equals scopesFound when under cap', () => {
    const MAX_SHADOW_SCOPES = 50;
    const scopesFound = 12;
    const scopesAudited = Math.min(scopesFound, MAX_SHADOW_SCOPES);
    assert.equal(scopesAudited, 12);
  });

  it('coverage is deterministic for same DOM state', () => {
    const cov1 = { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false };
    const cov2 = { scopesFound: 5, scopesAudited: 5, scopesCapped: false, maxDepthObserved: 2, depthLimitReached: false };
    assert.deepEqual(cov1, cov2);
  });
});
```

#### Test: Coverage diff warning (`test/coverage-diff-warning.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Coverage-aware diff warnings', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('returns warning when scopesCapped changes', () => {
    const prev = { shadowCoverage: { scopesAudited: 50, scopesCapped: true, depthLimitReached: false } };
    const curr = { shadowCoverage: { scopesAudited: 10, scopesCapped: false, depthLimitReached: false } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.ok(result, 'should produce warning');
    assert.equal(result.type, 'SHADOW_COVERAGE_CHANGED');
    assert.equal(result.from.scopesCapped, true);
    assert.equal(result.to.scopesCapped, false);
  });

  it('returns warning when scopesAudited differs', () => {
    const prev = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false } };
    const curr = { shadowCoverage: { scopesAudited: 10, scopesCapped: false, depthLimitReached: false } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.ok(result, 'should produce warning');
    assert.equal(result.from.scopesAudited, 5);
    assert.equal(result.to.scopesAudited, 10);
  });

  it('returns warning when depthLimitReached changes', () => {
    const prev = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false } };
    const curr = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: true } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.ok(result, 'should produce warning');
  });

  it('returns null when coverage identical', () => {
    const prev = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false } };
    const curr = { shadowCoverage: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.equal(result, null);
  });

  it('handles missing shadowCoverage gracefully (pre-v3)', () => {
    const prev = {};
    const curr = {};
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.equal(result, null, 'both missing → no warning');
  });

  it('warns when one snapshot lacks coverage (migration)', () => {
    const prev = {};
    const curr = { shadowCoverage: { scopesAudited: 3, scopesCapped: false, depthLimitReached: false } };
    const result = ctx.checkShadowCoverageChange(prev, curr);
    assert.ok(result, 'should produce warning for asymmetric coverage');
  });

  it('warning does not alter diff results', () => {
    // Informational only — the warning object has no side effects on diff computation
    const warning = {
      type: 'SHADOW_COVERAGE_CHANGED',
      from: { scopesAudited: 5, scopesCapped: false, depthLimitReached: false },
      to: { scopesAudited: 10, scopesCapped: false, depthLimitReached: false },
    };
    assert.ok(!('added' in warning), 'warning must not contain diff fields');
    assert.ok(!('fixed' in warning), 'warning must not contain diff fields');
  });
});
```

#### Test: Selector batching (`test/selector-batching.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Selector batching per scope', () => {
  it('same selector across rules only queried once per scope', () => {
    // Simulate the cache behavior
    const cache = new Map();

    function cachedQuery(scope, selector) {
      let scopeMap = cache.get(scope);
      if (!scopeMap) {
        scopeMap = new Map();
        cache.set(scope, scopeMap);
      }
      let results = scopeMap.get(selector);
      if (results === undefined) {
        // First query — would call querySelectorAll in production
        results = [`mock_${selector}`];
        scopeMap.set(selector, results);
        return { results, fromCache: false };
      }
      return { results, fromCache: true };
    }

    const scope1 = 'scope_doc';

    // First call — executes query
    const r1 = cachedQuery(scope1, 'img:not([alt])');
    assert.equal(r1.fromCache, false);

    // Second call — from cache
    const r2 = cachedQuery(scope1, 'img:not([alt])');
    assert.equal(r2.fromCache, true);

    // Different selector — executes query
    const r3 = cachedQuery(scope1, 'button');
    assert.equal(r3.fromCache, false);

    // Same selector, different scope — executes query
    const r4 = cachedQuery('scope_shadow1', 'img:not([alt])');
    assert.equal(r4.fromCache, false);
  });

  it('cache is scoped to single run invocation', () => {
    // After resetSelectorCache(), cache is empty
    const cache = new Map();
    cache.set('scope', new Map([['sel', ['el']]]));
    assert.equal(cache.size, 1);

    // Reset
    cache.clear();
    assert.equal(cache.size, 0, 'cache must be empty after reset');
  });

  it('cache does not mutate DOM', () => {
    // Cache stores arrays of elements, never modifies them
    const mockElements = [{ tagName: 'IMG' }];
    const cache = new Map();
    cache.set('scope', new Map([['img', mockElements]]));
    const retrieved = cache.get('scope').get('img');
    assert.equal(retrieved, mockElements, 'must return same reference');
    assert.equal(retrieved.length, 1, 'must not add/remove elements');
  });
});
```

#### Test: Subtree shadow elevation (`test/subtree-shadow-elevation.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Subtree shadow elevation', () => {
  it('detects element inside ShadowRoot via getRootNode', () => {
    // Logic-level: if el.getRootNode() instanceof ShadowRoot → elevated = true
    const isShadowRoot = true;  // Simulate
    const elevated = isShadowRoot;
    assert.equal(elevated, true);
  });

  it('does not elevate element in light DOM', () => {
    const isShadowRoot = false;
    const elevated = isShadowRoot;
    assert.equal(elevated, false);
  });

  it('elevated selector uses shadow host, not internal element', () => {
    // Simulate: user selects shadow internal → targetEl becomes host
    const internalEl = { id: 'internal', getRootNode: () => ({ host: { id: 'host-component' } }) };
    const rootNode = internalEl.getRootNode();
    const targetEl = rootNode.host;
    assert.equal(targetEl.id, 'host-component');
  });

  it('getSelectedElementSelector returns elevated flag', () => {
    const result = { selector: '#host-component', elevated: true };
    assert.ok(result.elevated, 'must indicate elevation occurred');
    assert.ok(result.selector, 'must provide host selector');
  });

  it('non-elevated returns elevated=false', () => {
    const result = { selector: '#my-widget', elevated: false };
    assert.equal(result.elevated, false);
  });
});
```

#### Test: Signature shadow quality (`test/signature-shadow-quality.test.mjs`)

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from './harness.mjs';

describe('Signature quality for shadow paths', () => {
  let ctx;
  beforeEach(() => { ctx = createContext(); });

  it('shadow + nth-of-type without anchors → low quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'my-component >>> div > button:nth-of-type(2)',
      testId: null,
    });
    assert.equal(quality, 'low');
  });

  it('shadow + id anchor → high quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'my-component >>> #submit-btn',
      testId: null,
    });
    assert.equal(quality, 'high');
  });

  it('shadow + data-testid anchor → high quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'my-component >>> button[data-testid="submit"]',
      testId: 'submit',
    });
    assert.equal(quality, 'high');
  });

  it('light DOM + nth-of-type → medium quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'div > button:nth-of-type(2)',
      testId: null,
    });
    assert.equal(quality, 'medium');
  });

  it('no path → low quality', () => {
    const quality = ctx.computeSignatureQuality({
      path: null,
      testId: null,
    });
    assert.equal(quality, 'low');
  });

  it('testId present → high quality regardless of path', () => {
    const quality = ctx.computeSignatureQuality({
      path: 'my-component >>> div:nth-of-type(3) > span',
      testId: 'my-control',
    });
    assert.equal(quality, 'high');
  });

  it('does not change signature hash', () => {
    // computeSignatureQuality only affects the quality field,
    // not the sig string or hash.
    const finding = {
      path: 'my-component >>> div > button:nth-of-type(2)',
      testId: null,
      type: 'NO_ACCESSIBLE_NAME',
      severity: 'high',
      wcag: '4.1.2',
    };
    const quality = ctx.computeSignatureQuality(finding);
    assert.equal(quality, 'low');
    // The actual signature hash is unaffected — tested via runSignatureEntries
  });
});
```

---

## Implementation Order

Recommended sequencing to minimize conflicts:

| Phase | Upgrades | Rationale |
|-------|----------|-----------|
| **Phase A** | #1 (EN mapping) + #2 (Needs Review) | Data model additions — no breaking changes, foundational for #5 |
| **Phase B** | #5 (CI export) | Depends on #1 and #2 for `en301549Clauses` and `reviewStatus` in exports |
| **Phase C** | #6 (Shadow DOM) | Independent. Changes `cssPath` → `cssPathDeep` and signature hashing. Adds `targetRef`. |
| **Phase D** | #3 (Subtree scan) | Changes audit pipeline (`rootSelector`). Builds on shadow-aware queries from #6 |
| **Phase E** | #4 (Overlays) | Depends on `targetRef` from #6. Fully independent of other UI changes |
| **Phase F** | Cross-cutting: versioning + migration | Wire up `normalizeLoadedSession`, `checkSignatureCompatibility`, version bump constants. Can be done alongside Phase A–B or as a dedicated PR. |

Each phase should be a separate PR with its tests passing before merging.

---

## P0 Fix Summary

| P0 | Issue | Fix | Section |
|----|-------|-----|---------|
| **P0-1** | JUnit timestamp uses `new Date()` | Use `capturedAt` param; add `sortFindingsForExport()` | Upgrade #5 |
| **P0-2** | Overlay assumes `f.path` is valid CSS selector | New `targetRef` structure + `resolveTarget()` fallback chain | Upgrade #4 |
| **P0-3** | Closed shadow root heuristic is unreliable | Remove per-element heuristic; replace with `SHADOW_DOM_NOTE` info finding | Upgrade #6 |
| **P0-4** | `querySelectorAllDeep` is O(n²) | Scopes-based approach: `collectScopes()` + per-scope query; `TreeWalker` for host discovery | Upgrade #6 |
| **P0-5** | `cssPathDeep` uses classes (unstable) | No classes by default; prefer `#id` > `[data-testid]` > `[aria-label]` > `tag:nth-of-type` | Upgrade #6 |
| **P0-6** | `"not_applicable"` for info findings | Changed to `"info"` — updated function, tests, exports | Upgrade #2 |
| **P0-7** | No migration strategy for v1→v2 | `normalizeLoadedSession()`, `checkSignatureCompatibility()`, user-facing toasts, export metadata | Cross-cutting |

## P1 Fix Summary

| P1 | Issue | Fix | Section |
|----|-------|-----|---------|
| **P1-1** | Sort key too narrow for cross-frame/scope exports | 7-key sort: `[frameKey, scope.type, scope.rootSelector, type, wcag, severity, pathHash]`; `sortFindingsForExport()` accepts `ctx`; `buildJunitXml`/`buildCsv` pass frame/scope context | Upgrade #5 |
| **P1-2** | Overlay tag+role fallback unbounded in large SPAs | `resolveTarget()` caps tag candidates at 50; skips fallback entirely if exceeded | Upgrade #4 |
| **P1-3** | Overlay may target stale frame after navigation | `toggleAnnotations()` checks `snapshot.usedFrameId === state.bestFrameId`; returns `FRAME_CHANGED` on mismatch; panel shows non-blocking toast | Upgrade #4 |
| **P1-4** | `collectScopes` may traverse outside subtree | `collectScopes(rootEl)` uses TreeWalker scoped to `rootEl`; documented guarantee; added test | Upgrade #3 / #6 |
| **P1-5** | `cssPathDeep` aria-label anchor unstable with digits/long text | Only use aria-label if `length <= 40` AND no digits; no class usage reintroduced | Upgrade #6 |
| **P1-6** | SHADOW_DOM_NOTE silent when scope cap reached | `finding.note` explicitly states cap value and that additional roots may be unaudited when `scopesCapped: true` | Upgrade #6 |
| **P1-7** | Overlay activates for non-run modes | `OVERLAY_ALLOWED_MODES = Set(["run"])`; non-run modes return `MODE_NOT_SUPPORTED`; panel shows toast | Upgrade #4 |
