# FlowLens

Chrome DevTools extension for accessibility auditing. Runs WCAG checks, contrast scans, keyboard navigation tests, and DOM mutation monitoring on any page — including inside iframes.

By [fski](https://fski.app)

## Install

1. Clone or download this repo
2. Go to `chrome://extensions/`, enable Developer mode
3. Click "Load unpacked", select this folder
4. Open DevTools (F12), go to the **FlowLens** tab

## What it does

Five audit modes, each injected into the inspected page:

- **Run** — one-shot WCAG check (labels, ARIA, headings, landmarks, tab indexes, roles)
- **Observe** — re-runs checks every ~900ms for 12 seconds to catch dynamically rendered content
- **Watch** — monitors loader chains, silent loading, and focus loss for 40 seconds
- **TabWalk** — tabs through up to 80 focusable elements to detect focus traps and order issues
- **Contrast** — scans up to 250 text nodes for approximate color contrast ratios (AA/AAA)

Presets combine modes: Quick (Run + Contrast), Release (Watch + Observe + Run), Focus (TabWalk + Run).

## Frame targeting

FlowLens can target specific iframes. It has built-in heuristics for detecting Help Center iframes (URL patterns, DOM selectors, frame sizing). Four targeting modes:

- **Auto** — picks the best Help Center frame automatically
- **Top** — runs in the top frame only
- **All** — runs in all frames
- **Manual** — lets you pick a specific frame from the dropdown

You can pin a frame per origin so it persists across reloads.

## Keyboard shortcuts

`r` Run, `o` Observe, `w` Watch, `t` TabWalk, `c` Contrast

## Export

Results can be copied as JSON, downloaded as a `.json` file, or copied as Markdown.

## Files

```
manifest.json          MV3 extension config
devtools.html/js       registers the DevTools panel
panel.html             UI
panel.css              styles (Ayu Dark theme)
panel.js               UI logic, state, virtual scrolling
sw.js                  service worker, message routing, script injection
a11y-audit-snippet.js  the actual audit code injected into pages
icons/                 extension icons
```

## How it works

`panel.js` sends messages to `sw.js`, which injects `a11y-audit-snippet.js` into the target frame(s) via `chrome.scripting.executeScript`. The snippet runs the audit in the page context and returns results. The panel stores results in `chrome.storage.local` (last 20 per origin/env), supports diffing between runs, and uses virtual scrolling for large result sets.

## Privacy

Everything runs locally. No network requests, no telemetry, no data leaves the browser.
