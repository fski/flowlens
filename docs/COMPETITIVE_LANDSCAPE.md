# FlowLens — Competitive Landscape (2025–2026)

> Research snapshot: 2026-07-19. Sources: vendor docs and product pages of each tool.
> Purpose: positioning + UI-pattern adoption decisions for the v6 refactor.

## Comparison matrix

| Tool | Flow-aware (multi-step / state transitions) | iframe support | CI export | Determinism / diffing | Price |
|---|---|---|---|---|---|
| **axe DevTools (Deque)** | Free: no (1 page). **Pro: yes** — "User Flow Analysis" auto-detects unique states, dedupes into one report | Partial (axe-core traverses same-origin frames) | Yes — axe-core, `@axe-core/playwright`, CLI, Jira | Rule IDs stable; no content-addressed signatures; dedupe is Pro-only | Free tier; **Pro ~$40–75/user/mo** |
| **Lighthouse / Chrome built-in** | No — single snapshot of one page state | Limited | Yes (LHCI, JSON), but only ~50 of ~96 axe rules | Score 0–100 fluctuates; not designed for diffing findings | Free (built-in) |
| **WAVE (WebAIM)** | No — single rendered page | **No** — flags iframe presence, won't analyze contents | No native CI (API is paid, separate) | Visual icons, no machine signature | Free extension; API paid |
| **Accessibility Insights (Microsoft)** | No true flow engine, but **Tab Stops** visualizes keyboard path; guided Assessment is manual multi-step | Limited | Yes — axe-core in CI | FastPass ~50 checks; assessment state saved/resumable, not content-hashed | **Free, OSS** |
| **IBM Equal Access** | Multi-scan report combines up to 50 scans/states into one XLSX, flags common issues across states | DevTools integration; keyboard-checker mode | **Strong** — Node checker, Selenium/Puppeteer/Playwright, JSON/CSV/HTML/XLSX, **baseline files** | **Baseline-file regression** (closest mainstream analog to FlowLens CI diff) | **Free, OSS** |
| **Pa11y / pa11y-ci** | No — URL list / sitemap; scripted `actions` can reach a state | Depends on engine | **CI-first** — GH Actions/GitLab/Jenkins, JSON | Thresholds, no content-addressed sig | **Free, OSS** |
| **ARC Toolkit (TPGi)** | No — single page; visual tab-order path; ShadowDOM (experimental) | Limited | Enterprise ARC Platform (paid) | Deep rule explanations, no CI signature | Free extension; Platform paid |
| **Stark** | No — design files (Figma/Sketch) + browser ext; no runtime/dynamic ARIA | N/A (design) | Repo/design scanning (paid tiers) | AI suggestions, not deterministic | Freemium; paid teams |
| **Polypane** | Partial — 80+ a11y tests across viewports; site scans; no turn-by-turn state model | Yes (renders panes) | Cloud site scans | Same validators as Lighthouse | **Paid** (~$12–24/mo) |
| **Evinced** | **Yes — closest competitor.** CV + AI engine handles DOM mutations; User-Flow Analyzer extension; SPA dynamic content | Strong (CV-based) | SDKs: Playwright, Selenium, WebdriverIO, Cypress | AI/CV detection, dedupe; not content-addressed | **Paid / enterprise** (no free tier) |
| **Assistiv Labs** | **Yes — E2E flows** with real screen readers (NVDA/JAWS/VoiceOver/TalkBack) on every code change | Via real browser | Yes — E2E harness in CI | Real-AT behavioral pass/fail | **Paid** (subscription) |

## Positioning takeaways

Only **Evinced** and **Assistiv Labs** genuinely model multi-step flows — both paid/enterprise with no free tier. axe's User Flow Analysis is Pro-gated. In the free/OSS tier, **nobody does turn-by-turn state-transition auditing of a live flow**. That is FlowLens's open lane.

Market gaps FlowLens owns:

1. **Turn-by-turn conversational/flow auditing** — live-region config, focus-after-message, "screen reader hears nothing when the bot replies" — no free tool tests these as a flow.
2. **Deterministic, content-addressed signatures for CI diffing** — competitors have baseline files (IBM) or thresholds (Pa11y); nothing content-addressed. "Same flow → same signature → git-style diff of a11y state across commits" is novel.
3. **Multi-iframe awareness in the free tier** — WAVE/Lighthouse/ARC punt on iframe contents; third-party chat widgets live in iframes.
4. **Zero-telemetry / local-only** — the flow-capable competitors are cloud/account-bound.
5. **Free + OSS at the flow tier** — the entire flow-aware segment is paid.

One-line positioning: **"The free, local-first accessibility auditor for flows automated tools freeze out — chat widgets, wizards, and multi-step journeys — with git-style diffing for CI."**

Honesty hook (industry-standard candor, reframed): automation catches only ~30–40% of WCAG issues — FlowLens catches that 30–40% *across your whole flow, not just one frozen page*.

## UI/UX patterns worth adopting

| # | Pattern | Source | Status in FlowLens |
|---|---|---|---|
| 1 | Tab-stops visualization: numbered badges + focus path, extended across turns | Accessibility Insights | TabWalk exists; on-page numbered overlay = backlog |
| 2 | Auto state detection + dedupe, with visible per-state deltas ("Step 3 introduced 2 new issues") | axe Pro / Evinced | Flow timeline has new/fixed/persisting — surface more prominently |
| 3 | Two-speed entry: quick pass vs deep assessment | Accessibility Insights FastPass | Presets (Quick/Release/Focus) exist — expose as primary CTA choices |
| 4 | Violations vs Needs Review split (not everything is an error) | axe / Accessibility Insights / IBM | `needs_review` exists in CI export — reflect the split in the findings UI |
| 5 | Finding → why it matters → exact WCAG SC link + one-click highlight | ARC Toolkit / axe | Highlight + WCAG mapping exist; add SC links in finding detail |
| 6 | Cross-state common-issue rollup ("appears in 4 of 6 steps") | IBM Equal Access | Natural fit for session model — backlog |
| 7 | Traffic-light iconography on live DOM overlay | WAVE | Highlight exists; severity-colored overlay = backlog |
| 8 | Vision / reduced-motion simulators | Stark / Polypane | Out of scope for now (demo value only) |

## Severity vocabulary (industry convergence)

axe & Accessibility Insights: **Violations / Needs Review / Best Practices**. WAVE: Errors / Alerts / Features. IBM: Violation / Needs Review / Recommendation. Category label converging on **"user flow"** (Deque "User Flow Analysis", Evinced "User-Flow Analyzer").

FlowLens keeps its engine severities (critical/high/medium/low/info + needs_review) — they are part of the stable signature contract — but UI copy and docs should speak the Violations / Needs Review language where it doesn't touch exports.
