# FlowLens Audit Report

> **Version:** 3.0.1 | **Date:** 2026-02-23 | **Branch:** `fski/flowlens-audit-report`
>
> **Scope:** Full codebase audit of the FlowLens Chrome DevTools extension for accessibility auditing (WCAG).
>
> **Threat model:** Enterprise — all data local, no cloud services, no telemetry.

---

## 1. Executive Summary

FlowLens is a Manifest V3 Chrome DevTools extension that provides **session-based accessibility auditing** across multi-step user flows. It combines a custom WCAG audit engine (~50 rules), five distinct capture modes, deterministic frame targeting with signature-based diff tracking, and local-only persistence.

**Strengths:**
- Zero-dependency runtime — no npm packages, no network calls, no telemetry
- Deterministic signature system with versioning (`schemaVersion`, `signatureVersion`, `frameKeyVersion`)
- Multi-frame awareness with scoring-based frame selection and stable frame keys
- Progressive storage compaction (5 tiers) to handle chrome.storage.local quotas
- Race condition guards (R1-R8) for concurrent capture operations
- Comprehensive export: JSON + Markdown for both single-run and session workflows

**Risks:**
- Broad host permissions (`http://*/*`, `https://*/*`) — justified by MAIN-world injection requirement
- No explicit CSP in manifest (relies on MV3 defaults — acceptable but implicit)
- Audit snippet injected into MAIN world has access to page globals — required for accurate DOM analysis but carries injection surface
- 5,192-line `panel.js` monolith — maintainability concern at current scale
- Test coverage is limited to panel.js pure functions; sw.js and a11y-audit-snippet.js have no unit tests

**Verdict:** Production-quality for its current scope. The session-based workflow engine (Strategy 2) is substantially implemented. Key gaps are in test coverage, module decomposition, and cross-session comparison depth.

---

## 2. Current Capabilities

### 2.1 User-Visible Capabilities

| Capability | Mode | Description | File:Line |
|------------|------|-------------|-----------|
| Static WCAG audit | `run` | One-shot scan, ~50 rules, returns findings | `a11y-audit-snippet.js:941-999` |
| Contrast scan | `contrast` | Approximate contrast ratio for <=250 text nodes | `a11y-audit-snippet.js:868-935` |
| Tab order walk | `tabWalk` | Simulates Tab key navigation, detects focus traps (11 event types, 6 blocking) | `a11y-audit-snippet.js:861-866` |
| Watch mode | `watch` | Monitors loaders, silent loading, focus loss over ~40s | `a11y-audit-snippet.js:937-938` |
| Observe mode | `observe` | Periodic re-scan every ~900ms for ~12s, detects dynamic content changes | `a11y-audit-snippet.js:937` |
| Flow session recording | — | Start session, mark steps, end session with diff tracking | `panel.js:3846-3931` |
| Step capture (Option C) | — | Baseline run + active mode per step, automatic diffs | `panel.js:3933-4153` |
| Auto-capture on navigation | — | Auto-mark step when URL changes during session | `panel.js:3727-3768` |
| Session comparison | — | Compare two archived sessions side-by-side | `panel.js:2900-2960` |
| MFE profiles | — | Pre-configured frame targeting for Help Center and Chat products | `panel.js:235-277` |
| Frame pinning | — | Persist frame selection per origin across reloads | `panel.js:3533-3686` |
| Export: JSON/Markdown | — | Download or copy single-run and session results | `panel.js:2976-3133` |
| Virtual table rendering | — | Handles 1000+ findings with scroll-based windowing | `panel.js:352-445` |
| Theme toggle | — | Ayu Dark (default) / Light theme | `panel.css:1-50` |
| Keyboard shortcuts | — | r/o/w/t/c for modes, 1/2/3 for tabs, s for step, e for end | `panel.js:4443-4510` |

### 2.2 Internal Capabilities

| Capability | Description | File:Line |
|------------|-------------|-----------|
| Frame scoring | URL includes (+5), DOM selectors (+10), area proportion (+0-3), iframe bonus (+1) | `sw.js:887-944` |
| Frame key generation | `fk::v1::{origin}::{pathHint}::{markerHash8}` — deterministic, frameId-independent | `sw.js:127-143` |
| Audit lock | Per-tab mutex preventing concurrent audit runs | `sw.js:559-566` |
| Message validation | Validates sender ID, message type, field types for all incoming messages | `sw.js:33-71` |
| Signature generation | Mode-aware deterministic signatures with quality ratings (high/medium/low) | `panel.js:2610-2721` |
| Diff engine | Signature-based comparison: added/fixed/persisting/weakMatched/blockingAdded/blockingFixed | `panel.js:2783-2857` |
| Blocking logic | Severity x confidence matrix determines blocking status | `panel.js:1307-1314` |
| Storage compaction | 5-tier progressive compaction for records; raw appendix compaction for sessions | `panel.js:974-1073` |
| Session normalization | Migrates/normalizes loaded sessions for schema compatibility | `panel.js:2387-2421` |
| Identity normalization | Strips volatile UUIDs/numbers from signature text; FNV-1a path hashing | `panel.js:1445-1465` |

---

## 3. Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     DevTools Panel                           │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  panel.html + panel.js + panel.css                     │  │
│  │  ─ State management (state, sessionState, profileState)│  │
│  │  ─ VirtualTable rendering                              │  │
│  │  ─ Session engine (start/mark/end/export)              │  │
│  │  ─ Signature generation + diff calculation             │  │
│  │  ─ Persistence (chrome.storage.local + fallback)       │  │
│  └──────────────┬─────────────────────────────────────────┘  │
│                 │ chrome.runtime.sendMessage                  │
└─────────────────┼────────────────────────────────────────────┘
                  │
┌─────────────────┼────────────────────────────────────────────┐
│  Service Worker │ (sw.js)                                     │
│  ─ Message router: LIST_FRAMES | RUN_AUDIT | CAPTURE_STEP |  │
│    HIGHLIGHT                                                  │
│  ─ Frame enumeration (chrome.webNavigation.getAllFrames)      │
│  ─ Frame scoring + best-frame selection                       │
│  ─ Frame key derivation (deterministic)                       │
│  ─ Audit lock (per-tab mutex)                                 │
│  ─ Script injection (chrome.scripting.executeScript)          │
└──────────────┬───────────────────────────────────────────────┘
               │ MAIN world injection
               ▼
┌──────────────────────────────────────────────────────────────┐
│  Inspected Page (per frame)                                   │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  a11y-audit-snippet.js                                 │  │
│  │  Exposes: window.A11YFlowAudit                         │  │
│  │  Methods: .run() .observe() .watch() .tabWalk()        │  │
│  │           .contrastScan()                              │  │
│  │  ─ ~50 WCAG rules (8 registered + ~42 inline)         │  │
│  │  ─ Performance caching (WeakMap style/rect/hidden)     │  │
│  │  ─ Mode detection via modeHints                        │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Message contracts

| Message | Direction | Purpose | File:Line |
|---------|-----------|---------|-----------|
| `LIST_FRAMES` | Panel → SW | Enumerate all frames in tab | `sw.js:569-617` |
| `RUN_AUDIT` | Panel → SW | Execute audit across frames, return best result | `sw.js:762-795` |
| `CAPTURE_STEP` | Panel → SW | Capture baseline run + active mode for session step | `sw.js:797-879` |
| `HIGHLIGHT` | Panel → SW | Locate and flash-highlight element in inspected page | `sw.js:695-760` |

### Module inventory

| File | Lines | Size (approx.) | Responsibility |
|------|-------|-----------------|----------------|
| `panel.js` | ~4,500 | ~200 KB | UI, state, sessions, signatures, diffs, exports, persistence |
| `a11y-audit-snippet.js` | ~2,200 | ~130 KB | WCAG audit engine (injected per frame) |
| `sw.js` | ~1,189 | ~44 KB | Service worker: routing, framing, injection |
| `panel.css` | ~1,918 | ~60 KB | Styling (Ayu Dark + Light themes) |
| `panel.html` | ~440 | ~30 KB | UI skeleton with ARIA markup |
| `devtools.js` | ~5 | ~0.2 KB | Panel registration |
| `build.mjs` | ~163 | ~5 KB | esbuild minification pipeline |

---

## 4. Security & Privacy Audit

### 4.1 Network isolation

| Check | Result | Evidence |
|-------|--------|----------|
| External fetch/XHR/WebSocket calls | **None found** | Grep for `fetch(`, `XMLHttpRequest`, `WebSocket` across all JS: 0 matches |
| CDN or external script loads | **None** | `panel.html` loads only local `panel.js`, `panel.css` |
| Telemetry / analytics | **Zero** | No gtag, mixpanel, sentry, or analytics library imports |
| Home-phone on install/update | **None** | `sw.js` has no `onInstalled` network logic |

**Verdict:** Fully local. No data leaves the browser without explicit user-initiated export.

### 4.2 Permissions

| Permission | Justification | Over-scoped? |
|------------|---------------|-------------|
| `scripting` | Required for `chrome.scripting.executeScript` to inject audit snippet | No — core functionality |
| `tabs` | Required for `chrome.devtools.inspectedWindow.tabId` | No — DevTools panel requires tab context |
| `webNavigation` | Required for `chrome.webNavigation.getAllFrames` | No — multi-frame audit requires frame enumeration |
| `storage` | Required for `chrome.storage.local` persistence | No — session/record persistence |
| `host_permissions: http://*/*, https://*/*` | Required for MAIN-world injection on any inspected page | Broad but unavoidable for a DevTools audit tool |

**Verdict:** All permissions are actively used and justified. No unused permissions. Host permissions are broad by necessity.

### 4.3 Content Security Policy

- No explicit CSP in `manifest.json` — relies on MV3 defaults
- MV3 default CSP: no `eval()`, no inline scripts, no remote scripts, no `data:` script sources
- All JS/CSS loaded from local extension files
- **Recommendation:** Consider adding explicit `content_security_policy` to manifest for defense-in-depth

### 4.4 Injection surface

The audit snippet is injected into **MAIN world** (`sw.js:425-429`), giving it access to page globals. This is by design — the audit engine needs `window.getComputedStyle`, `document.querySelectorAll`, and other DOM APIs.

Mitigations present:
- Snippet assigns to `window.A11YFlowAudit` only — no prototype pollution, no global variable mutation
- Results are serialized via `chrome.scripting` return value (structured clone, not eval)
- Message validation in SW rejects messages not from the extension's own runtime ID (`sw.js:33-45`)
- Snippet is stateless per-invocation — no persistent listeners, no DOM mutation (except temporary highlight animation)

**Risk:** A malicious page could theoretically override `window.A11YFlowAudit` between injection and invocation. Impact is limited to returning falsified audit results. **Mitigation:** The snippet is injected and immediately invoked in a single `chrome.scripting.executeScript` call, minimizing the window for interception.

### 4.5 Data stored

| Storage key pattern | Contains PII? | Retention |
|--------------------|---------------|-----------|
| `records::{origin}::{env}` | No — findings contain rule type, WCAG ref, CSS paths, truncated accessible names | Per-origin, max 20 records, progressively compacted |
| `session::active::*` | No — same as records plus frame keys and step metadata | Until session end |
| `session::archive::*` | No — same as active session | Until manual deletion |
| `uiPrefs` | No — theme, compact mode, WCAG level | Indefinite |
| `pinnedFrames` | No — frame IDs per origin | Until manual unpin |

**Verdict:** No PII, no screenshots, no form data, no session tokens stored. HTML snippets are truncated to 240 chars (`a11y-audit-snippet.js:54`). Accessible names truncated to 160 chars (`a11y-audit-snippet.js:248`).

### 4.6 Supply chain

- **Runtime dependencies:** Zero
- **Build dependencies:** `esbuild ^0.25.0` only (via `package.json:10`)
- **Lock file:** `package-lock.json` present with integrity hashes
- **Build output:** `dist/` directory with minified copies of source files

---

## 5. Determinism & Reliability Audit

### 5.1 Frame key determinism

Frame keys are generated in `sw.js:127-143`:
```
fk::v{VERSION}::{origin}::{pathHint}::{markerHash8}
```

- `origin`: Normalized URL origin — deterministic (`sw.js:83-91`)
- `pathHint`: First stable URL path segments; volatile numeric/UUID tokens normalized to `_id` (`sw.js:102-110`)
- `markerHash8`: FNV-1a hash over sorted selector/marker boolean results — deterministic given same DOM (`sw.js:114-125`)

**Assessment:** Frame keys are deterministic for same page state. SPA navigation may change `pathHint` — acceptable, as it reflects a genuine route change.

### 5.2 Signature determinism

Signatures are built in `panel.js:2610-2721` with the following stability mechanisms:

| Mechanism | Purpose | File:Line |
|-----------|---------|-----------|
| `normalizeIdentityText()` | Strips volatile UUID/number tokens before hashing | `panel.js:1445-1453` |
| `pathHashForSig()` | FNV-1a hash of normalized CSS path (not raw path) | `panel.js:1462-1465` |
| `bucketNumber()` | Buckets numeric values to prevent float micro-drift | `panel.js:1467-1475` |
| `frameKey` prefix | Ties finding identity to frame, not ephemeral `frameId` | All signature builders |
| `signatureQuality` | Rates signature stability: high (testId) / medium (stable path) / low (weak path) | `panel.js:2610-2666` |
| `weakSignature` fallback | Secondary signature for low-quality findings — used only in Flow persistence matching | `panel.js:2650-2660` |

**Assessment:** Strong determinism for findings with `testId` or stable CSS paths. Findings with dynamic selectors (e.g., React-generated class names) receive `signatureQuality: low` and are surfaced as "may be unstable" in exports. This is an honest signal — not a bug.

### 5.3 Versioning system

| Version field | Current | Bump trigger | File:Line |
|---------------|---------|-------------|-----------|
| `schemaVersion` | 1 | Session shape changes | `panel.js` (persisted in session) |
| `signatureVersion` | 1 | Signature construction changes | `panel.js` (persisted in session) |
| `frameKeyVersion` | 1 | Frame key algorithm changes | `sw.js` (persisted in session) |

**Assessment:** Well-designed forward-compatibility scheme. Downstream tools can reject incompatible sessions by checking version fields. `determinismMeta` in exported JSON includes all three versions plus per-step frame key hashes.

### 5.4 Race condition guards

Documented race conditions and their mitigations (tested in `test/race-conditions.test.mjs`):

| ID | Race condition | Guard | File:Line |
|----|---------------|-------|-----------|
| R1 | Session existence check after await | Re-check `sessionState.current` after each async boundary | `panel.js:3933-3940` |
| R2 | `storageSet` error in quota-exceeded path | Try-catch with fallback logging | `panel.js:460-480` |
| R3 | `refreshInspectedUrl` promise never resolving | Wrapped in `Promise` with explicit `resolve()` | `panel.js` |
| R4 | Auto-capture timer dangling after session end | `clearTimeout` of `autoCapturePending` on end | `panel.js:3879-3931` |
| R5 | HUD timer stacking (multiple `setInterval`) | Clear existing timer before creating new one | `panel.js` |
| R6 | `inFlight` flag stuck after error | Reset in `finally` block and on session end | `panel.js:3933-4153` |
| R8 | Queued capture after session end | Clear `queuedCapture` on session end | `panel.js:3879-3931` |

**Assessment:** Comprehensive race condition awareness. All identified races have guards, and all guards have tests.

### 5.5 Audit lock

`acquireAuditLock()` (`sw.js:559-566`) implements a per-tab mutex using a `Map<tabId, Promise>`:
```javascript
while (_auditLockByTab.get(tabId)) await _auditLockByTab.get(tabId);
```

This serializes audit executions per tab — preventing concurrent injections that could produce interleaved results. Sequential frame execution within an audit (`sw.js:516-520`) further ensures deterministic ordering.

**Assessment:** Correct and sufficient for single-tab concurrency. No cross-tab race conditions are possible since each tab has independent state.

---

## 6. Multi-Frame / SPA Handling Audit

### 6.1 Frame enumeration

`chrome.webNavigation.getAllFrames({ tabId })` returns all frames in the tab (`sw.js:482`). Frames are filtered and scored in `resolveTargetFrameIds()` (`sw.js:956-1188`).

### 6.2 Frame scope modes

| Scope | Behavior | File:Line |
|-------|----------|-----------|
| `PRIMARY` | Top frame only (frameId 0) | `sw.js:956-970` |
| `HOST` | Frames matching host origin | `sw.js:970-990` |
| `EMBEDDED` | Non-host frames (iframes from different origin) | `sw.js:990-1010` |
| `ALL` | All frames | `sw.js:1010-1020` |

### 6.3 Frame scoring algorithm

`computeFrameScores()` (`sw.js:887-944`):

| Signal | Points | Source |
|--------|--------|--------|
| URL includes match | +5 per match | Profile `urlIncludes` array |
| DOM selector match | +10 | Profile `domSelectorsAny` + `appMarkers` |
| Frame area proportion | +0 to +3 | Viewport coverage via `getBoundingClientRect` |
| Iframe bonus (heuristic) | +1 | When frame is not top-level and heuristics apply |

Ties broken by `frameId` ascending (`sw.js:320-322`).

### 6.4 MFE profile system

Built-in profiles (`panel.js:235-277`):

| Profile | Frame targeting | Mode hints |
|---------|----------------|------------|
| `helpcenter` | `urlIncludes: ["help"]`, DOM selectors for HC containers | `helpcenter-tree`, `helpcenter-bot` modes |
| `chat` | DOM selectors for chat containers | `chat` mode |

Custom profiles supported via `customProfiles` storage key.

### 6.5 Frame key stability

Frame keys use origin + path hint + marker hash — not `frameId`. This means:
- Frame key survives page reload (same URL, same markers = same key)
- Frame key changes on SPA navigation to different route (expected)
- Frame key survives iframe re-creation if URL and markers are unchanged

### 6.6 Cross-frame audit execution

`executeAuditAcrossFrames()` (`sw.js:469-557`) runs audits **sequentially** across frames (not parallel), collecting per-frame results. The best-scoring frame's result is selected as the primary.

**Assessment:** Multi-frame handling is comprehensive. Frame scoring is deterministic. MFE profile system provides good extensibility. SPA navigation changes frame keys — this is correct behavior, not a bug, since the page state has changed.

---

## 7. Strategy 2 Gap Analysis

**Strategy 2 definition:** Session-based workflow engine for accessibility analysis across user flows — capturing step-by-step accessibility state, computing diffs, tracking blocking issues over time, and exporting actionable reports.

### 7.1 Session engine

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Start/end session lifecycle | **Implemented** | `startSession()` / `endSession()` — `panel.js:3846-3931` |
| Multi-step capture | **Implemented** | `captureStepOptionC()` with baseline run + active mode — `panel.js:3933-4153` |
| Step limit enforcement | **Implemented** | `MAX_STEPS = 100` — `docs/SESSION_MODEL.md:184` |
| Session persistence | **Implemented** | Active + archive keys in chrome.storage.local — `panel.js:2387-2421` |
| Session normalization on load | **Implemented** | `normalizeLoadedSession()` — `panel.js` |
| Session archival | **Implemented** | `archiveSessionBestEffort()` — `panel.js` |
| Auto-capture on navigation | **Implemented** | `autoCaptureNav` with configurable delay — `panel.js:3727-3768` |

### 7.2 Diff engine

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Signature-based diff | **Implemented** | `diffModeBundles()` — `panel.js:2783-2841` |
| Added/fixed/persisting tracking | **Implemented** | `buildStepDiffs()` — `panel.js:2843-2857` |
| Blocking issue tracking | **Implemented** | `blockingAdded` / `blockingFixed` in diff — `panel.js:2783-2841` |
| Weak signature fallback | **Implemented** | `weakSignature` for `signatureQuality: low` findings — `panel.js:2650-2660` |
| Cross-mode diffs | **Implemented** | Consolidated diff merges run + active mode diffs — `panel.js:2843-2857` |

### 7.3 Export

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Session JSON export | **Implemented** | Includes `determinismMeta`, steps, rawAppendix, frames — `panel.js` |
| Session Markdown export | **Implemented** | Flow summary table + per-step diffs — `panel.js:2976-3074` |
| Single-run JSON/Markdown | **Implemented** | `buildMarkdown()` — `panel.js:3076-3133` |
| Determinism metadata in export | **Implemented** | `schemaVersion`, `signatureVersion`, `frameKeyVersion`, per-step frame key hashes |
| Copy to clipboard | **Implemented** | `copyText()` with `navigator.clipboard.writeText` + fallback — `panel.js` |

### 7.4 Gaps identified

| Gap | Severity | Description | Effort |
|-----|----------|-------------|--------|
| **G1: No sw.js / snippet tests** | High | Service worker and audit snippet have zero unit tests. All tests cover panel.js only. | 1-2 weeks |
| **G2: Monolithic panel.js** | Medium | 4,500+ lines in a single file. Session engine, diff engine, signatures, persistence, UI rendering all co-located. | 1 week to split into modules |
| **G3: No cross-session regression tracking** | Medium | `runSessionComparison()` exists but is shallow — compares two sessions without trend analysis over time. | 1-2 weeks |
| **G4: No CI pipeline** | Medium | No automated test execution, no lint, no build verification on push. | 2-3 days |
| **G5: No WCAG coverage map** | Low | Rules cover ~30 of ~80 WCAG 2.2 criteria. No formal mapping document. | 1 week |
| **G6: Contrast scan is approximate** | Low | Cannot detect gradients, images behind text, text shadows. `a11y-audit-snippet.js:868-935` | Fundamental limitation — requires pixel-level analysis |
| **G7: Shadow DOM not audited** | Low | `SHADOW_DOM_DETECTED` is info-only — findings inside shadow roots are skipped. `a11y-audit-snippet.js:989-996` | 1-2 weeks |
| **G8: No configuration export/import** | Low | Profiles, pinned frames, preferences cannot be shared across team members. | 2-3 days |
| **G9: Observe/Watch timing variability** | Low | `observe` (~12s) and `watch` (~40s) results depend on page timing — inherent to the approach. | N/A — design trade-off |
| **G10: No persistent trend dashboard** | Low | Historical data exists (`records` key) but no visualization of trends over time. | 1-2 weeks |

---

## 8. Roadmap

### Sprint 1 (2 weeks): Reliability & Test Coverage

| # | Item | Type | Gap | Effort | Files |
|---|------|------|-----|--------|-------|
| 1.1 | Add sw.js unit tests | Test | G1 | 3 days | New: `test/sw.test.mjs`, harness extension |
| 1.2 | Add a11y-audit-snippet.js unit tests | Test | G1 | 3 days | New: `test/snippet.test.mjs`, JSDOM or VM harness |
| 1.3 | Add CI pipeline (GitHub Actions) | Infra | G4 | 1 day | New: `.github/workflows/ci.yml` |
| 1.4 | Add `node:test` runner script to package.json | Infra | G4 | 0.5 day | `package.json` |
| 1.5 | Add explicit CSP to manifest.json | Security | — | 0.5 day | `manifest.json` |
| 1.6 | Increase diff-calc test coverage for edge cases | Test | G1 | 1 day | `test/diff-calc.test.mjs` |

**Exit criteria:** `node --test test/` passes with >80% function coverage on panel.js, >50% on sw.js.

### Month 1 (4 weeks): Architecture & Depth

| # | Item | Type | Gap | Effort | Files |
|---|------|------|-----|--------|-------|
| 2.1 | Split panel.js into modules | Refactor | G2 | 1 week | New: `src/session-engine.js`, `src/diff-engine.js`, `src/signatures.js`, `src/persistence.js`, `src/ui.js` |
| 2.2 | Cross-session regression tracking | Feature | G3 | 1 week | `panel.js` (or new module), storage schema |
| 2.3 | WCAG coverage map document | Docs | G5 | 2 days | New: `docs/WCAG_COVERAGE.md` |
| 2.4 | Configuration export/import | Feature | G8 | 2 days | `panel.js`, `panel.html` |
| 2.5 | Integration test suite (end-to-end with fixtures) | Test | G1 | 3 days | New: `test/integration/` |
| 2.6 | Persistent trend dashboard (sparklines per origin) | Feature | G10 | 1 week | `panel.js`, `panel.html`, `panel.css` |

**Exit criteria:** panel.js broken into <=5 modules, each <1000 lines. Cross-session comparison shows trend arrows.

### Quarter 1 (13 weeks): Completeness & Scale

| # | Item | Type | Gap | Effort | Files |
|---|------|------|-----|--------|-------|
| 3.1 | Shadow DOM traversal for audit rules | Feature | G7 | 2 weeks | `a11y-audit-snippet.js` |
| 3.2 | Expand WCAG coverage to 50+ criteria | Feature | G5 | 3 weeks | `a11y-audit-snippet.js`, `docs/ENGINE_RULES.md` |
| 3.3 | Enhanced contrast analysis (pseudo-elements, overlays) | Feature | G6 | 2 weeks | `a11y-audit-snippet.js` |
| 3.4 | Team profile sharing (export/import + version) | Feature | G8 | 1 week | `panel.js`, storage schema |
| 3.5 | Performance profiling and optimization | Perf | — | 1 week | All JS files |
| 3.6 | Automated regression test suite against known sites | Test | G1 | 2 weeks | New: `test/regression/` |
| 3.7 | Session replay / step-back capability | Feature | — | 2 weeks | `panel.js`, session storage |

**Exit criteria:** 50+ WCAG criteria covered with tests. Shadow DOM audit support. Team workflows enabled.

---

## 9. Appendix

### A. File inventory

| Path | Purpose |
|------|---------|
| `manifest.json` | MV3 extension manifest |
| `devtools.html` | DevTools registration page |
| `devtools.js` | Panel creation (`chrome.devtools.panels.create`) |
| `panel.html` | Main UI markup (~440 lines, ARIA-annotated) |
| `panel.js` | Core logic (~4,500 lines) |
| `panel.css` | Styling (~1,918 lines, Ayu Dark + Light) |
| `sw.js` | Service worker (~1,189 lines) |
| `a11y-audit-snippet.js` | Audit engine (~2,200 lines) |
| `build.mjs` | esbuild build script (~163 lines) |
| `package.json` | npm config (esbuild dev dep only) |
| `test/harness.mjs` | VM-based test harness with mocked Chrome APIs |
| `test/diff-calc.test.mjs` | Diff, signature, utility function tests |
| `test/session-state.test.mjs` | Session lifecycle tests |
| `test/persistence.test.mjs` | Storage and persistence tests |
| `test/race-conditions.test.mjs` | Race condition guard tests |
| `docs/ARCHITECTURE.md` | Architecture documentation |
| `docs/SESSION_MODEL.md` | Session data model specification |
| `docs/SESSION_CAPTURE.md` | Session capture design document |
| `docs/ENGINE_RULES.md` | Full rule catalog and how-to guide |
| `fixtures/a11y-rule-fixtures.html` | Test fixture page for rule verification |

### B. Storage key reference

| Key pattern | Scope | Max size | Compaction |
|-------------|-------|----------|------------|
| `records::{origin}::{env}` | Per origin+env | 20 records x ~10KB | 5-tier progressive (`panel.js:975-981`) |
| `session::active::{origin}::{env}` | Per origin+env | ~4.5MB max (warning threshold) | Raw appendix capping (200 entries) |
| `session::archive::{origin}::{env}::{id}` | Per session | Same as active | Same caps |
| `pinnedFrames` | Global | Small (<1KB) | None |
| `uiPrefs` | Global | Small (<1KB) | None |
| `activeProfiles` | Global | Small (<1KB) | None |
| `customProfiles` | Global | Variable | None |
| `colPrefs` | Global | Small (<1KB) | None |

### C. WCAG rule coverage summary

**RULE_REGISTRY rules** (8): `a11y-audit-snippet.js:162-220`
- FOCUS_VISIBLE_SUPPRESSED (2.4.7 AA), LOADER_WITHOUT_ANNOUNCEMENT_HOOK (4.1.3 AA), TOUCH_TARGET_TOO_SMALL (2.5.8 AA), CLICK_WITHOUT_KEYBOARD (2.1.1 A), FOCUS_MAY_BE_OBSCURED (2.4.11 AA), CONSISTENT_HELP_CHECK (3.2.6 A), ARIA_HIDDEN_FOCUSABLE (4.1.2 A), IFRAME_MISSING_TITLE (4.1.2 A)

**Inline rules** (~42): Documented in `docs/ENGINE_RULES.md:37-87`
- Covering WCAG criteria: 1.1.1, 1.3.1, 1.3.5, 1.4.4, 2.1.1, 2.4.1, 2.4.3, 2.4.6, 2.4.7, 2.4.11, 2.5.3, 2.5.5, 2.5.8, 3.1.1, 3.2.2, 3.2.6, 3.3.2, 3.3.7, 4.1.1, 4.1.2, 4.1.3

**Tab Walk events** (11 types, 6 blocking): `docs/ENGINE_RULES.md:90-107`

### D. Blocking logic matrix

| Severity | Confidence | Blocking? |
|----------|-----------|-----------|
| high | strict | **Yes** |
| high | heuristic | **Yes** |
| high | advisory | No |
| medium | strict | **Yes** |
| medium | heuristic | No |
| medium | advisory | No |
| low / info | any | No |

Source: `panel.js:1307-1314`, documented in `docs/SESSION_MODEL.md:109-143`

### E. Test coverage map

| Test file | Functions tested | Coverage area |
|-----------|-----------------|---------------|
| `diff-calc.test.mjs` | `escapeHtml`, `fnv1aHash8`, `hashFinding`, `originFrom`, `detectEnv`, `asNumber`, `formatElapsedHms`, `isRunFindingBlocking`, `runSignatureEntries`, `buildStepDiffs`, `normalizeLoadedSession` | Utilities, signatures, diffs |
| `session-state.test.mjs` | `startSession`, `endSession` | Session lifecycle |
| `persistence.test.mjs` | `storageGet`, `storageSet`, `getSessionKeys`, `persistActiveSessionBestEffort`, `archiveSessionBestEffort`, `loadActiveSessionForScope`, `normalizeLoadedSession`, `compactSessionForExport`, `estimateJsonBytes` | Persistence layer |
| `race-conditions.test.mjs` | R1-R8 guards, `captureStepOptionC`, `ensureSessionHudTicker`, `refreshInspectedUrl` | Concurrency |

**Not tested:** `sw.js` (all functions), `a11y-audit-snippet.js` (all functions), `panel.js` UI rendering functions, VirtualTable class, export formatters.

### F. Assumptions

1. **Enterprise deployment:** Extension distributed via Chrome Web Store or enterprise policy — not sideloaded from unknown sources.
2. **Trusted build environment:** `npm install` and `node build.mjs` run in a CI pipeline with pinned Node.js version.
3. **Local-only data model:** No cloud sync, no shared storage, no multi-user workflows (team sharing requires manual export/import).
4. **MAIN-world injection is intentional:** The audit engine requires full DOM access — this is a conscious design decision, not a security oversight.
5. **Page state variability is expected:** Dynamic pages may produce different findings on repeated runs — this is inherent to the approach and documented via `signatureQuality` ratings.
