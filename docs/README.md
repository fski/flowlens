# FlowLens — Docs Index

## Guides

- **[USER_GUIDE.md](./USER_GUIDE.md)** — How to use FlowLens: philosophy, audit modes, Screen Audit & Flow Audit walkthroughs, practical scenarios, confidence lanes, troubleshooting, table schema reference.

## Architecture & Internals

- **[ARCHITECTURE.md](./ARCHITECTURE.md)** — System architecture: Panel → SW → Snippet flow, message contracts, frame targeting/scoring, profiles, persistence model, export contracts, env isolation, determinism metadata.
- **[ENGINE_RULES.md](./ENGINE_RULES.md)** — Rule catalog: RULE_REGISTRY, all inline rules, Tab Walk event types, how to add a new rule, FP hotspots, fixtures and expected counts.
- **[SESSION_MODEL.md](./SESSION_MODEL.md)** — Session/Flow technical model: step/snapshot schemas, signature strategy, blocking logic, diff model, caps and compaction, determinism versioning, maintainer guidelines.

## Technical References

- **[SESSION_CAPTURE.md](./SESSION_CAPTURE.md)** — Session capture design doc: schema, frame keys, diff/signatures, reliability caps, raw appendix, exports, HUD semantics.
- **[A11Y_RULE_FP_AUDIT.md](./A11Y_RULE_FP_AUDIT.md)** — False-positive audit and precision plan: FP hotspots, implemented fixes (A–E), confidence/severity adjustments, fixture validation protocol.
- **[QA_MANUAL.md](./QA_MANUAL.md)** — 10-minute QA script for session capture: setup, 3 test scripts, partial/failure checks, export verification, pass criteria.
