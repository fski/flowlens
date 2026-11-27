# FlowLens Session Capture QA (10 minutes)

## Setup
1. Open the FlowLens panel on the target app page.
2. Settings → Targeting: confirm the frame list is populated (**Refresh** once).
3. Flow tab → **Record Flow** (the current page becomes the baseline step). Turn **Auto** off for Scripts A–C so only manual steps are recorded.

## Script A: 5 steps, no navigation
1. Mark step on initial state.
2. Trigger a small UI change (open menu/dialog), mark step.
3. Trigger another interaction, mark step.
4. Return to prior state, mark step.
5. Mark step once more without changes.
6. Verify the step list and status line update after each step.

## Script B: 5 steps, SPA navigation
1. Navigate to 2-3 SPA routes without hard reload.
2. Mark step on each route change.
3. Verify `routeHint` changes and `usedFrameKeys` are present in exports.

## Script C: Help Center iframe (if available)
1. Enable Help Center profile.
2. Navigate to article/chat context within iframe.
3. Mark 2 steps and verify frame targeting metadata in session markdown.

## Partial/failure checks
1. Force partial active-mode failure:
   - Select active mode that is likely unavailable in current frame context.
   - Mark step and verify `PARTIAL/active:*` appears in the status line.
2. Simulate quota pressure:
   - Run long session (many steps) until raw cap warning appears.
   - Verify capture continues (`PARTIAL/raw:capped`) and steps still append.

## Export checks
1. **End** the session, then Export → **Session Markdown** and verify it is copied to the clipboard.
2. Export → **Session JSON** and verify filename:
   - `flowlens-session_<originSlug>_<env>_<YYYYMMDD-HHMM>.json`
3. Verify JSON contains `determinismMeta`, versions, steps, and bounded raw appendix.

## Pass criteria
- No blocking UI errors during mark-step flow.
- In-flight mark-step cannot be double-triggered.
- Status/reason code remains deterministic and readable.
