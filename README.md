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
- **No timestamps** — Findings carry no time-based data that would cause false diffs
- **Bounded capture artifacts** — All capture windows and observation periods have fixed upper bounds
- **No raw text in CI export** — The CI JSON contract exports structural metadata, not page content
- **No telemetry** — Zero network calls, zero analytics, zero tracking

## Privacy and data safety

All processing happens entirely in the browser:

- No message text is stored or exported
- No DOM paths appear in CI JSON output
- Cross-frame integrity checks operate on hashed structural summaries only
- No network requests are made — ever
- No data leaves the browser

## Audit modes

Five modes, each injected into the inspected page:

- **Run** — one-shot WCAG check (labels, ARIA, headings, landmarks, tab indexes, roles)
- **Observe** — re-runs checks every ~900ms for 12 seconds to catch dynamically rendered content
- **Watch** — monitors loader chains, silent loading, and focus loss for 40 seconds
- **TabWalk** — tabs through up to 80 focusable elements to detect focus traps and order issues
- **Contrast** — scans up to 250 text nodes for approximate color contrast ratios (AA/AAA)

Presets combine modes: Quick (Run + Contrast), Release (Watch + Observe + Run), Focus (TabWalk + Run).

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

`r` Run, `o` Observe, `w` Watch, `t` TabWalk, `c` Contrast

## Export

Results can be copied as JSON, downloaded as a `.json` file, copied as Markdown, or exported as CI-ready JSON (stable signatures, regression entries, depth 3 aggregates).

## Files

```
src/
  manifest/manifest.base.json   MV3 extension config (version injected at build)
  devtools/                     registers the DevTools panel
  panel/                        panel.html + panel.css + panel.js (UI logic, state, virtual scrolling)
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

`panel.js` sends messages to `sw.js`, which injects `a11y-audit-snippet.js` into the target frame(s) via `chrome.scripting.executeScript`. The snippet runs the audit in the page context and returns results. The panel stores results in `chrome.storage.local` (last 20 per origin/env), supports diffing between runs, and uses virtual scrolling for large result sets.

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
