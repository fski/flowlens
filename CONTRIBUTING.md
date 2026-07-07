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
FlowLens makes zero network requests. All processing happens in the browser. No data is collected, transmitted, or stored externally. There is no account, no API key, no server.

## Development

### Running tests

```sh
node --test
```

All tests use `node:test` and `node:assert/strict` with zero npm dependencies. The test harness loads `src/panel/panel.js` into a `node:vm` context with mocked browser globals.

### Building

```sh
npm run build
```

The build must produce a bundle under 450K total. Check the build output for file sizes.

### Adding rules

1. Add the rule evaluation in `src/snippet/a11y-audit-snippet.js`
2. Add the rule → WCAG mapping in `src/shared/wcag-coverage.js` with `criterion`, `level`, `confidence`, and `depthLevel`
3. For Depth 3 rules, add a `group` field (`depth3/announcements`, `depth3/focus`, `depth3/semantics`, or `depth3/multiframe`)
4. Add corresponding tests
5. Run `npm run audit:vendor` to verify no vendor references

### Code style

- No external dependencies (zero npm packages)
- ES5-compatible function syntax in `src/panel/panel.js` (no arrow functions in top-level code)
- `var` in `src/panel/panel.js`; `const`/`let` in test files and build scripts
- No `async`/`await` in `src/panel/panel.js` function definitions (except in wire-up section event handlers)
