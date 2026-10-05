# Contributing to FlowLens

## Design Principles

These principles govern all contributions to FlowLens.

**Deterministic outputs**
Every finding, signature, and export must be reproducible. Same inputs produce same outputs. No timestamps, no random IDs, no environment-dependent values in any output path.

**Additive schema evolution**
Schema changes are additive only. New fields may be added; existing fields are never removed or renamed. Consumers of CI JSON, diagnostics payloads, and stable signatures must not break when FlowLens is updated.

**No vendor-specific logic in core**
The `src/` tree (excluding `src/host/`) must not contain references to specific companies, products, or platforms. All targeting uses generic selectors (ARIA roles, DOM structure, frame attributes). Run `npm run audit:vendor` to verify.

**HostConfig only for private builds**
Vendor-specific targeting, profile defaults, and UI labels belong in HostConfig files, not in core code. HostConfig is applied at build time and never affects signatures, diff logic, or highlight behavior.

**Depth model consistency**
Every rule in `wcag-coverage.js` has a `depthLevel` (1, 2, or 3). Depth 3 rules must have a `group` field mapping to one of the four integrity axes. New rules must follow this classification.

## What FlowLens Is Not

**Not a generic static WCAG scanner.**
FlowLens focuses on conversational accessibility integrity. While it includes Depth 1 static checks, its purpose is evaluating dynamic support flows across conversation steps and frame boundaries.

**Not a compliance certification tool.**
FlowLens findings are heuristic assessments, not legal compliance determinations. The `confidence` field on each rule indicates whether it is a definitive check or a heuristic that requires human review.

**Not a telemetry SaaS.**
The extension makes no network requests. All processing happens in the browser. No data is collected, transmitted, or stored externally. There is no account, no API key, no server.

## Development

Requires Node 22 (as in CI). Runtime code has no npm dependencies; the devDependencies are `esbuild` (required by the build) and `playwright` (headless E2E and the CI runner).

```sh
npm ci
npx playwright install chromium   # only for E2E / CI runner
```

### Tests

```sh
npm test            # node:test unit suites (test/*.test.mjs)
npm run build
npm run test:e2e    # scripts/e2e-smoke.mjs + scripts/panel-e2e.mjs against dist/
npm run ci          # tests → build → package → package audit → vendor audit → release guard
```

Unit tests use `node:test` and `node:assert/strict`. `test/harness.mjs` concatenates the panel parts (everything except `panel-90-wireup.js`) into a `node:vm` context with mocked browser globals, so testable panel functions must live outside the wireup part. The SW and snippet have their own harnesses (`sw-harness.mjs`, `snippet-harness.mjs`, `engine-harness.mjs`).

The E2E scripts run in headless Chromium: `e2e-smoke.mjs` checks the fixture rule counts (`EXPECTED`), accname/contrast fixtures and the console gate; `panel-e2e.mjs` loads `dist/` as an extension with a `chrome.devtools` shim. CI runs both plus a determinism check of `scripts/ci-runner.mjs`.

### Building

```sh
npm run build        # production (minified)
npm run build:dev    # unminified + sourcemaps
```

esbuild bundles `src/sw/sw.js` and `src/snippet/a11y-audit-snippet.js` (ES modules importing `src/engine/stateTransitionEngine.js`) and concatenates the panel parts into `dist/panel.js`. Keep the build lean (currently ~590 KB in `dist/`).

### Adding rules

See [docs/ENGINE_RULES.md §5](docs/ENGINE_RULES.md#5-how-to-add-a-new-rule). In short: implement in `a11y-audit-snippet.js`, map it in `src/shared/wcag-coverage.js` (`criterion`, `level`, `confidence`, `depthLevel`; Depth 3 rules also a `group`: `depth3/announcements`, `depth3/focus`, `depth3/semantics` or `depth3/multiframe`), add fixtures/tests, run `npm run ci` and `npm run test:e2e`.

### Code style

- **Panel** (`src/panel/panel-*.js`): classic scripts concatenated in `panel.parts.json` order into one global scope — top-level names must be unique across parts. Use top-level `function` declarations (no top-level arrow functions); `const`/`let`/`var` and `async` functions are all in use. New code goes into the thematically matching part; DOM wiring goes into `panel-90-wireup.js`.
- **SW, snippet, engine**: ES modules bundled by esbuild (`import`/`export`). Shared logic between SW and snippet belongs in `src/engine/stateTransitionEngine.js`, not in copies.
- **Shared scripts** (`src/shared/*.js`, `src/engine/depth3Aggregates.js`, `src/engine/ciExporter.js`): classic scripts loaded by `panel.html` and by the test harnesses.
- Tests and build scripts: ES modules (`.mjs`).
