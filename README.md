# FlowLens

A deterministic accessibility inspector for dynamic multi-step flows — chat widgets, wizards, checkouts, onboarding, help centers, and AI bots.

FlowLens goes beyond static WCAG checks. It captures step-based state transitions across flow steps and frame boundaries to evaluate whether dynamic experiences are actually accessible to screen reader and keyboard users.

By [fski](https://fski.app)

## What makes FlowLens different

Traditional accessibility scanners check a static DOM snapshot. FlowLens inspects flow integrity across time and across frames.

Automated tooling catches roughly 30–40% of WCAG issues — FlowLens catches that share *across your whole flow, not just one frozen page*. The flow-aware tools that exist (axe DevTools Pro, Evinced, Assistiv Labs) are all paid; FlowLens is the free, local-first option in that tier. See [docs/COMPETITIVE_LANDSCAPE.md](docs/COMPETITIVE_LANDSCAPE.md) for the full comparison.

| | Traditional Scanner | FlowLens |
|---|---|---|
| Analysis model | Static DOM checks | Step-based state transitions |
| Scope | Per-page analysis | Conversation integrity across turns |
| Frame handling | Single-frame assumption | Multi-frame aware |
| Output | Raw rule counts | Integrity axes (Announcements, Focus, Semantics, Multi-frame) |
| Determinism | Varies | Stable signatures, no timestamps, bounded artifacts |

## The Depth Model

FlowLens organizes accessibility checks into three depth levels. Each level builds on the one below it.

```
Depth 3 — Conversation Integrity
        |
Depth 2 — Interaction Stability
        |
Depth 1 — Static WCAG
```

**Depth 1 — Static WCAG**
ARIA roles, semantic structure, contrast, headings, landmarks. The baseline that any scanner can check on a single DOM snapshot.

**Depth 2 — Interaction Stability**
Focus management, keyboard tab order, mutation correctness. Requires observing user interactions and DOM changes over time.

**Depth 3 — Conversation Integrity**
State transitions across conversation steps and frame boundaries. Four integrity axes:

- **Announcement integrity** — Are new messages announced to assistive technology? (C1)
- **Focus stability** — Does the composer retain focus after bot responses? (C2)
- **Feed semantics** — Is the message feed properly structured and itemized? (C3)
- **Multi-frame linkage** — When chat components span iframes, are they structurally connected? (C4)

Depth 3 checks cannot be performed by traditional scanners because they require capturing state across multiple conversation turns and correlating findings across frame boundaries.

See [docs/DEPTH_MODEL.md](docs/DEPTH_MODEL.md) for the full depth model reference.

## Deterministic by design

FlowLens outputs are deterministic and reproducible:

- **Stable signatures** — Every finding produces a content-addressed signature that is identical across runs with the same inputs
- **Time-free signatures** — stable signatures and diffs exclude timestamps, so time-based data never causes false diffs (captured result summaries do carry a timestamp for display)
- **Bounded capture artifacts** — All capture windows and observation periods have fixed upper bounds
- **No raw text in CI export** — The CI JSON contract exports structural metadata, not page content
- **No telemetry** — Zero network calls, zero analytics, zero tracking

## Privacy and data safety

All processing happens entirely in the browser:

- No message text is stored or exported
- No DOM paths appear in CI JSON output
- Cross-frame integrity checks operate on hashed structural summaries only
- The audit engine makes no network requests; the only outbound traffic is opening a W3C WCAG documentation link if you explicitly click one
- Per-step screenshots and optional flow video are stored locally in the browser's IndexedDB and never uploaded; pruned to the most recent sessions
- No data leaves the browser

## Audit modes

Five modes, each injected into the inspected page:

- **Run** — one-shot WCAG check (labels, ARIA, headings, landmarks, tab indexes, roles)
- **Observe** — re-runs checks every ~900ms for 12 seconds to catch dynamically rendered content
- **Watch** — monitors loader chains, silent loading, and focus loss for 40 seconds
- **TabWalk** — tabs through up to 80 focusable elements to detect focus traps and order issues, drawing numbered tab-stop markers and the focus path on the page
- **Contrast** — scans up to 250 text nodes for approximate color contrast ratios (AA/AAA)

Two guided presets are available from the empty state: **Quick scan** (Run + Contrast) and **Deep audit** (Watch + Observe + Run).

## Flow tab

The **Flow** tab records the accessibility state across the steps of a user flow (checkout, wizard, chat) and shows how issues appear and disappear as you go — the thing static scanners can't.

- **Auto-capture** — once you press **Record Flow**, the starting page is captured as a baseline step, then steps are captured automatically as you navigate: full navigations, SPA route changes (History API), and navigations **inside audited embedded frames** (microfrontends route within their iframe — those events are matched against the audited frame set, so a targeted embedded app on its own domain still records). Third-party sites (SSO logins, payment gateways) are skipped for privacy — auto-captured steps include viewport screenshots, and those pages routinely show credentials or card data; same-site subdomain hops capture normally. Manual **Mark step** stays for inserting a step by hand (works on a third-party page too — that's a deliberate action); the **Auto** toggle opts out.
- **Filmstrip** — a per-step screenshot strip (captured locally via `captureVisibleTab`, viewport only). Click a tile to inspect that step. Screenshots are downloadable: per step (**⤓ PNG** in the step detail) or all at once (**Export → Screenshots (.zip)**, dependency-free store ZIP).
- **Step list + per-step diff** — each step shows **Appeared / Persisting / Resolved** issues versus the previous step. Filter to *only steps with unresolved blockers* to stay readable on long flows.
- **Issue-lifecycle swimlane** — each recurring issue is drawn as a lane across the steps where it's present, so a violation introduced at step 3 and fixed at step 7 is visible at a glance.
- **Local video** — optional screen recording of the whole flow via `getDisplayMedia` (you pick the tab; no extra permission), saved locally as webm.

Everything is local — no new Chrome permissions, no uploads. Screenshots are viewport-only (full-page capture would conflict with the open DevTools session).

## Flow Profiles

FlowLens includes generic profiles that tune depth settings and frame targeting for common flow patterns:

- **Chat Widget** — embedded iframe chat, recommends Depth 3
- **Help Center + Bot Hybrid** — portal with integrated bot, recommends Depth 3
- **Help Center (Static)** — article-based help center, recommends Depth 2
- **Wizard / Multi-step Form** — checkouts, onboarding, multi-page forms, recommends Depth 2

Profiles are vendor-agnostic. Targeting uses ARIA roles and DOM structure, not product-specific selectors.

## Install

1. Clone or download this repo
2. Run `npm ci && npm run build` — this produces the loadable extension in `dist/`
3. Go to `chrome://extensions/`, enable Developer mode
4. Click "Load unpacked", select the `dist/` folder
5. Open DevTools (F12), go to the **FlowLens** tab

## Frame targeting

FlowLens uses explicit **Scope** targeting with deterministic behavior:

- **Primary frame** (default) — scans exactly one automatically selected frame
- **Host page only** — scans only the top-level document (`frameId=0`)
- **Embedded frame only** — scans one embedded frame (pinned/selected if provided, otherwise the best detected iframe)
- **All frames** — scans the host page and all embedded frames

You can pin a frame per origin so it persists across reloads and acts as a manual override when scope allows it.

## Keyboard shortcuts

`1` / `2` / `3` switch the Snap / Flow / Settings tabs. Inside the Flow tab: `r` starts a recording session, `s` marks a step, `e` ends the session. There are no per-mode shortcuts.

## Export

Results can be copied as JSON, downloaded as a `.json` file, copied as Markdown, or exported as CI-ready JSON (stable signatures, regression entries, depth 3 aggregates).

## Files

```
src/
  manifest/manifest.base.json   MV3 extension config (version injected at build)
  devtools/                     registers the DevTools panel
  panel/                        panel.html + panel.css + panel-*.js source parts
                                (panel.parts.json defines order; build concatenates
                                them into a single dist/panel.js)
  sw/sw.js                      service worker, message routing, script injection
  snippet/a11y-audit-snippet.js the actual audit code injected into pages
  engine/
    stateTransitionEngine.js    C1–C4 conversation integrity evaluators
    depth3Aggregates.js         integrity axis aggregation
    ciExporter.js               CI JSON report builder
  shared/
    flow-profiles.js            flow profiles
    wcag-coverage.js            rule → WCAG criterion mapping
    en301549-map.js             WCAG → EN 301 549 mapping
    limits.js                   capture bounds
    version.js                  single source of truth for the version
  host/default.config.json     generic HostConfig (build variants)
  assets/icons/                extension icons
scripts/                       build, package, release-guard, vendor audits
test/                          node:test suites (zero npm deps)
dist/                          build output — load this in Chrome (gitignored)
```

## How it works

`panel.js` sends messages to `sw.js`, which injects `a11y-audit-snippet.js` into the target frame(s) via `chrome.scripting.executeScript`. The snippet runs the audit in the page context and returns results. The panel stores results in `chrome.storage.local` (up to 20 per origin/env; fewer when storage quota forces progressive compaction), supports diffing between runs, and uses virtual scrolling for large result sets.

The state transition engine (C1–C4) evaluates conversation integrity from the audit findings. Depth 3 aggregates summarize integrity across four axes. The CI exporter produces a deterministic JSON report suitable for automated pipelines.

## Build Variants

FlowLens uses a build-time **HostConfig** system to keep the core tool generic while allowing private builds to customize targeting, profile defaults, and UI labels.

### Generic build (default)

```sh
npm run build
```

Uses `src/host/default.config.json` — no host-specific selectors, no default active profiles.

### Private host build

```sh
HOST_CONFIG=./path/to/host.config.json npm run build
```

The config file must match the HostConfig contract:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` (required) | Build identifier |
| `label` | `string\|null` | Display label |
| `defaultProfiles` | `string[]` | Profile IDs to activate by default |
| `rootSelector` | `string\|null` | Default DOM scoping selector |
| `match.domSelectorsAny` | `string[]` | DOM selectors for frame targeting |
| `match.urlIncludesAny` | `string[]` | URL patterns for frame matching |
| `match.urlExcludesAny` | `string[]` | URL patterns to exclude frames |
| `ui.badgeText` | `string\|null` | Version badge suffix |
| `ui.diagnosticsHint` | `string\|null` | Diagnostics panel hint |

JS config files require explicit opt-in: `HOST_CONFIG_ALLOW_JS=1`.

The config is validated and normalized at build time. HostConfig **never** affects stable signatures, diff logic, FrameKey derivation, or highlight behavior.

### Vendor audit

```sh
npm run audit:vendor
```

Scans `src/` for company-specific references (excluding `src/host/`). Fails if any are found. Runs automatically in CI.

## Chrome Web Store

**Short description** (132 chars):
> Inspect accessibility integrity across multi-step flows — chats, wizards, checkouts, help centers.

**Long description**:
> FlowLens is a deterministic accessibility inspector for dynamic flows. It evaluates chat widgets, wizards, checkouts, onboarding, and help centers across flow steps and frame boundaries — checking announcement integrity, focus stability, feed semantics, and cross-frame linkage. Multi-frame aware. No telemetry. CI-ready export.
