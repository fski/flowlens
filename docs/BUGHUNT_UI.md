# FlowLens UI Bughunt Checklist

Manual smoke test for UI stability after Phase D (Integrity Overview, Group Filtering, Cross-Frame UX) and Phase F (Rendering Hardening).

## Pre-flight

1. `npm run build`, then load `dist/` in Chrome (`chrome://extensions/` → Load unpacked)
2. Open DevTools on any page with a multi-step flow (chat widget, wizard, help center)

## Core Smoke Tests

### 1. Run mode cycle
- Click Run
- Verify findings appear in explorer
- Verify severity tabs show counts
- Verify integrity pills appear (if Depth 3 findings exist)
- No flicker or duplicate rows

### 2. Observe mode cycle
- Click Observe
- Wait for completion
- Verify findings populate
- Verify integrity pills update
- Switch back to Run — verify cached findings restore

### 3. Run → Observe → Run cycle
- Run, then Observe, then Run again
- Verify no stale findings leak between modes
- Verify severity tab counts match visible rows

### 4. Integrity pill toggle
- Click an integrity pill (e.g., "Announcements")
- Verify findings filter to that group only
- Verify pill shows "active" state
- Click the same pill again — verify filter clears (all findings return)

### 5. Multiple pill clicks (rapid)
- Click different pills quickly in sequence
- Verify no duplicate rerenders (check `__flPerf.scheduledRerenderCount` vs `rerenderFindingsCount`)
- Verify final state matches last clicked pill

### 6. Severity filter + group filter interaction
- Apply a group filter (pill)
- Apply a severity filter (tab)
- Verify both filters apply together
- Clear group filter — verify severity filter still active

### 7. Cross-frame finding display
- Find a cross-frame finding (type with `depth3/multiframe` group and no `el`)
- Verify "Cross-frame" badge appears
- Click the row — verify toast appears: "Cross-frame finding — cannot highlight"
- Verify no highlight error in console

### 8. Cross-frame toast dedup
- Click the same cross-frame row twice quickly (within ~500ms)
- Verify toast appears only once (not twice)

### 9. Depth filter change
- Change depth filter dropdown
- Verify findings update
- Verify integrity pills update
- Verify no stale counts

### 10. Search + group filter
- Type in search box while group filter is active
- Verify search applies within the filtered group
- Clear search — verify group filter still active

### 11. Copy CI JSON
- Click "Copy CI JSON"
- Paste into text editor
- Verify valid JSON with `signatures`, `regressions`, `aggregates` fields
- Verify no raw DOM text in output

### 12. Diagnostics section
- Expand diagnostics
- Verify all fields populated (version, depth, recipe, etc.)
- If `localStorage.setItem("flowlens:debugPerf", "1")` is set, verify "Perf" row appears

### 13. Tab switching (modes)
- Switch between Run, Contrast, TabWalk, Watch tabs
- Verify no findings from one mode leak into another
- Verify integrity overview hides for non-run modes

### 14. Export stability
- Copy JSON, Copy Markdown, Copy CI JSON
- Verify no crashes
- Verify toast confirmation appears for each

### 15. Large result set
- Run on a page with many findings (50+)
- Verify virtual scrolling works
- Verify severity counts match total
- Scroll through the list — no blank rows or jank

## Performance Sanity Checks

Enable perf display:
```js
localStorage.setItem("flowlens:debugPerf", "1")
```

Then check diagnostics panel:

- **Rerenders** — should be low (< 10 for a typical session without rapid clicking)
- **Last ms** — should be under 50ms for typical finding counts
- **Rows** — should match visible finding count

Check in console:
```js
window.__flPerf
```

- `scheduledRerenderCount` should be >= `rerenderFindingsCount` (batching effective)
- `rerenderFindingsMsTotal` / `rerenderFindingsCount` gives average rerender time

## If Counts Mismatch

If severity tab counts don't match the visible explorer rows:

1. Check if a group filter is active (look for `.active` pill)
2. Check if a search query is filtering rows
3. Check if a severity filter is active
4. Open console: `window.__flPerf.lastFilterReason` to see what triggered the last rerender
5. File a bug with the specific filter combination that causes the mismatch
