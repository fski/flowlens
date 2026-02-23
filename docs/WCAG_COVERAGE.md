# FlowLens WCAG Coverage

## Overview

FlowLens provides automated and heuristic accessibility checks against WCAG 2.2 Level AA criteria. Coverage is honest: the engine does not claim full compliance for any criterion. Rules that rely on heuristics or page-structure inference produce `needs_review` findings, not automated pass/fail verdicts.

## Coverage model

FlowLens reports two complementary coverage metrics:

### Engine coverage

Based on the **rule catalog** in `RULE_TO_WCAG`. A criterion counts as "engine-covered" if at least one rule in the engine maps to it. This metric is static and does not depend on what the audited page contains. It answers: *"Which WCAG criteria does FlowLens have rules for?"*

### Observed coverage

Based on **findings produced during a specific audit run**. A criterion counts as "observed" if at least one finding referencing it was emitted. This metric is dynamic and page-dependent. It answers: *"Which WCAG criteria did FlowLens actually evaluate on this page?"*

A criterion can be engine-covered but not observed (e.g., the page has no `<audio>` elements, so 1.2.1 rules never fire). Conversely, observed coverage is always a subset of engine coverage.

## Confidence levels

Each rule has a confidence level that indicates how reliable its detection is:

| Confidence | Meaning |
|------------|---------|
| `strict` | Deterministic DOM check with near-zero false positives |
| `heuristic` | Pattern-based check that may produce false positives in edge cases |
| `advisory` | Informational signal that always requires manual review |
| `null` | Confidence not explicitly set; treated as heuristic for coverage purposes |

## Interpreting results

- **`needs_review`** findings require human judgment. The engine detected a pattern that *may* indicate a WCAG violation, but cannot confirm it programmatically.
- **`automated`** findings (severity high/medium with strict confidence) have high certainty and typically indicate real issues.
- **`info`** findings are informational signals that do not count toward failure thresholds.

## Limitations

1. **No full-compliance guarantee.** Even 100% engine coverage does not mean a page is WCAG-compliant. Many criteria require manual testing (e.g., 1.2.4 Captions (Live), 2.4.5 Multiple Ways).
2. **Static analysis only.** FlowLens audits the DOM at a point in time. Dynamic interactions, multi-page flows, and time-dependent behaviors require session-mode testing.
3. **Criteria without rules.** Some WCAG criteria cannot be meaningfully automated (e.g., 1.3.3 Sensory Characteristics, 2.3.1 Three Flashes). These remain in the "missing" list.
4. **Shadow DOM boundaries.** Coverage within shadow roots depends on the shadow coverage system; see the shadow coverage receipt for details.

## Versioning

- `WCAG_COVERAGE_VERSION` in `src/shared/wcag-coverage.js` is bumped whenever the criteria list or rule mappings change.
- `WCAG_TARGET` specifies the target standard (currently WCAG 2.2 Level AA).
- Coverage summaries in exports include the version for reproducibility.

## Files

| File | Purpose |
|------|---------|
| `src/shared/wcag-coverage.js` | Machine-readable criteria list and rule-to-WCAG mapping |
| `src/panel/panel.js` | Coverage computation functions (`engineCoverageSummary`, `runCoverageObserved`) |
| `test/wcag-coverage.test.mjs` | Coverage integrity and determinism tests |
