# FlowLens — Docs Index

## Guides

- **[USER_GUIDE.md](./USER_GUIDE.md)** — Using the panel: Snap modes, Flow recording, Settings, keyboard access, confidence/blocking, privacy, scenarios, troubleshooting, table reference.
- **[CONVERSATIONAL_RECIPES.md](./CONVERSATIONAL_RECIPES.md)** — Recipes for auditing chat widgets, help centers, AI bots and hybrid support UIs.
- **[SCENARIOS.md](./SCENARIOS.md)** — Three concrete Depth 3 problems FlowLens detects that static scanners miss.

## Architecture & Internals

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — Panel → SW → snippet flow, build and engine bundling, message contracts, frame targeting/scoring, Snap derived state, storage keys and retention, exports.
- **[SESSION_MODEL.md](./SESSION_MODEL.md)** — Flow sessions: capture flow, step/snapshot schemas, frame keys and signatures, blocking, diffs, caps, status codes, determinism versions.
- **[ENGINE_RULES.md](./ENGINE_RULES.md)** — Rule catalog, rule behavior notes, Tab Walk events, adding a rule, FP hotspots, fixtures and expected counts.
- **[DEPTH_MODEL.md](./DEPTH_MODEL.md)** — Depth 1–3 and the C1–C4 conversation-integrity checks.
- **[WCAG_COVERAGE.md](./WCAG_COVERAGE.md)** — Engine vs observed coverage, confidence levels, interpreting results, limitations.

## Quality

- **[A11Y_RULE_FP_AUDIT.md](./A11Y_RULE_FP_AUDIT.md)** — False-positive hotspots, implemented precision fixes, fixture validation protocol and expected counts.
- **[AXE_SPIKE.md](./AXE_SPIKE.md)** — FlowLens snippet vs axe-core on an annotated corpus; recommendation.
- **[QA_MANUAL.md](./QA_MANUAL.md)** — 10-minute manual QA script for Flow capture and exports.

## Project

- **[RELEASE.md](./RELEASE.md)** — Release checklist (version bump, `npm run release:check`, publish).
- **[COMPETITIVE_LANDSCAPE.md](./COMPETITIVE_LANDSCAPE.md)** — 2025–2026 competitive matrix, market gaps, positioning.

The CI runner and GitHub Action are documented in the [root README](../README.md#ci-runner--github-action); contribution workflow in [CONTRIBUTING.md](../CONTRIBUTING.md).
