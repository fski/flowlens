// ═══ VIEW ROUTING ═══
function showView(tab, sub) {
  // Update top-level tab
  if (tab) state.topTab = tab;
  const panels = { snap: els.snapContent, flow: els.flowContent, settings: els.settingsContent };
  document.querySelectorAll("#topTabBar [role='tab']").forEach(btn => {
    const isActive = btn.dataset.tab === state.topTab;
    btn.setAttribute("aria-selected", String(isActive));
    btn.setAttribute("tabindex", isActive ? "0" : "-1");
  });
  for (const [key, panel] of Object.entries(panels)) {
    if (!panel) continue;
    const active = key === state.topTab;
    panel.hidden = !active;
    if (active) panel.removeAttribute("inert");
    else panel.setAttribute("inert", "");
  }

  // Handle Snap subtab
  if (state.topTab === "snap" && sub) {
    setPressed(sub);
    showMode(sub);
  }

  // Diagnostics live at the bottom of Settings — refresh them on entry
  if (state.topTab === "settings") {
    renderDiagnostics();
  }

  // Auto-render flow tab content when switching to Flow
  if (state.topTab === "flow") {
    renderFlowSessionInfo();
    renderFlowTimeline();
    renderFlowCounters();
  }

  updateSessionButtons();
}

function updateResultsVisibility(forceValue = null) {
  const hasResults = typeof forceValue === "boolean" ? forceValue : state.records.length > 0;
  const hasSessionExport = !!(sessionState.current || sessionState.lastEndedSession);
  if (els.emptyState) els.emptyState.hidden = hasResults;
  if (els.resultsZone) {
    els.resultsZone.hidden = !hasResults;
    els.resultsZone.classList.toggle("visible", !!hasResults);
  }
  if (els.exportAnchor) els.exportAnchor.hidden = !(hasResults || hasSessionExport);
  // Reset error state when showing results
  if (hasResults && els.emptyState) {
    els.emptyState.classList.remove("emptyState--error");
    const retryBtn = document.getElementById("emptyRetry");
    if (retryBtn) retryBtn.hidden = true;
    const txt = document.getElementById("emptyText");
    const hint = document.getElementById("emptyHint");
    if (txt) txt.textContent = "Run an audit to see results";
    if (hint) hint.textContent = "Choose a mode above and click the button to start scanning";
  }
}

function showErrorEmptyState(message) {
  if (!els.emptyState) return;
  els.emptyState.hidden = false;
  els.emptyState.classList.add("emptyState--error");
  if (els.resultsZone) { els.resultsZone.hidden = true; els.resultsZone.classList.remove("visible"); }
  const txt = document.getElementById("emptyText");
  const hint = document.getElementById("emptyHint");
  const retryBtn = document.getElementById("emptyRetry");
  if (txt) txt.textContent = message || "Audit failed";
  if (hint) hint.textContent = "Check the console for details, or try again";
  if (retryBtn) retryBtn.hidden = false;
}

function buildCombinedGradient(colors) {
  const n = colors.length;
  if (n < 2) return "#2F2F2F";
  const stops = ["#2F2F2F 15%"];
  const range = 50;
  for (let i = 0; i < n; i++) {
    const pct = 25 + (i / (n - 1)) * range;
    stops.push(`${colors[i]} ${pct}%`);
  }
  stops.push("#2F2F2F 85%");
  return `conic-gradient(from 180deg at 50% 50%, ${stops.join(", ")})`;
}

function renderSevTabs(findings = null) {
  if (!els.sevTabs) return;
  const c = findings ? countBySeverity(findings) : null;
  const total = c ? (c.critical + c.high + c.medium + c.low + c.info) : null;
  const sel = state.sevFilter;
  const isAll = sel.size === 0;

  const renderTab = (sev, label, count, active) =>
    `<button class="sevTab" role="tab" data-sev="${sev}" aria-selected="${active}" tabindex="${active ? 0 : -1}" type="button" title="${sev ? "Shift+click to combine" : "Show all severities"}">
      <span class="sevLabel">${escapeHtml(label)}</span>
      <span class="sevCount">${count != null ? count : "&ndash;"}</span>
    </button>`;

  const allTab = renderTab("", "All", total, isAll);

  const sevTabs = SEV_LIST.map(sev => ({
    sev,
    label: sev === "critical" ? "Crit." : sev === "medium" ? "Med." : sev.charAt(0).toUpperCase() + sev.slice(1),
    count: c ? c[sev] : null,
    active: sel.has(sev),
  }));

  // Group consecutive active tabs into runs
  const groups = [];
  for (const tab of sevTabs) {
    if (tab.active && groups.length > 0 && groups[groups.length - 1].combined) {
      groups[groups.length - 1].tabs.push(tab);
    } else {
      groups.push({ tabs: [tab], combined: tab.active });
    }
  }

  const parts = [allTab];
  for (const group of groups) {
    if (group.combined && group.tabs.length >= 2) {
      const colors = group.tabs.map(t => SEV_COLORS[t.sev]);
      const gradient = buildCombinedGradient(colors);
      const inner = group.tabs.map((t, i) => {
        const btn = renderTab(t.sev, t.label, t.count, t.active);
        return i < group.tabs.length - 1 ? btn + `<span class="sevPlus">+</span>` : btn;
      }).join("");
      parts.push(`<div class="sevCombined" style="--comb-gradient:${gradient};--comb-n:${group.tabs.length}">${inner}</div>`);
    } else {
      parts.push(renderTab(group.tabs[0].sev, group.tabs[0].label, group.tabs[0].count, group.tabs[0].active));
    }
  }

  els.sevTabs.innerHTML = parts.join("");
}

function renderContrastSevTabs() {
  if (!els.sevTabs) return;
  const total = state.contrastSamples.length;
  const fail = state.contrastData.length;
  const pass = total - fail;
  const f = state.contrastFilter;

  const renderTab = (sev, label, count, active) =>
    `<button class="sevTab" role="tab" data-sev="${sev}" aria-selected="${active}" tabindex="${active ? 0 : -1}" type="button">
      <span class="sevLabel">${escapeHtml(label)}</span>
      <span class="sevCount">${count != null ? count : "&ndash;"}</span>
    </button>`;

  els.sevTabs.innerHTML = [
    renderTab("", "All", total, f === "all"),
    renderTab("fail", "Fail", fail, f === "fail"),
    renderTab("pass", "Pass", pass, f === "pass"),
  ].join("");
}

async function persistRecords(scopeKey) {
  const PERSIST_LIMIT_STEPS = [
    { records: 20, findings: 200, failures: 200, events: 200, samples: 30, snapshots: 120, verdicts: 60, maxString: 300 },
    { records: 15, findings: 150, failures: 150, events: 150, samples: 20, snapshots: 90, verdicts: 45, maxString: 220 },
    { records: 10, findings: 100, failures: 100, events: 100, samples: 12, snapshots: 70, verdicts: 30, maxString: 180 },
    { records: 8, findings: 70, failures: 70, events: 70, samples: 8, snapshots: 50, verdicts: 24, maxString: 140 },
    { records: 5, findings: 40, failures: 40, events: 40, samples: 5, snapshots: 35, verdicts: 16, maxString: 110 },
  ];

  const truncateString = (v, maxLen) => {
    if (typeof v !== "string") return v;
    if (!Number.isFinite(maxLen) || maxLen <= 0 || v.length <= maxLen) return v;
    return `${v.slice(0, maxLen)}…`;
  };

  const compactObjectStrings = (obj, maxLen) => {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = typeof v === "string" ? truncateString(v, maxLen) : v;
    return out;
  };

  // Highlight-critical fields must stay usable after compaction: an appended
  // '…' breaks querySelector (path/testId) and includes-matching (html), so
  // restored records could never be highlighted again. Paths are cut at a
  // segment boundary so the selector still parses (resolves to the parent).
  const truncateSelectorPath = (v, maxLen) => {
    if (typeof v !== "string" || v.length <= maxLen) return v;
    const cut = v.slice(0, maxLen);
    const idx = cut.lastIndexOf(" > ");
    return idx > 0 ? cut.slice(0, idx) : cut;
  };

  const compactFindingRow = (row, maxLen) => {
    if (!row || typeof row !== "object") return row;
    const out = compactObjectStrings(row, maxLen);
    if (typeof row.path === "string") out.path = truncateSelectorPath(row.path, Math.max(maxLen, 140));
    if (typeof row.testId === "string") out.testId = row.testId.slice(0, 200);
    if (typeof row.html === "string") out.html = row.html.slice(0, Math.max(maxLen, 120));
    return out;
  };

  const compactContrastRow = (row, maxLen) => {
    if (!row || typeof row !== "object") return row;
    return {
      ratio: row.ratio,
      required: row.required,
      largeText: !!row.largeText,
      text: truncateString(row.text ?? "", Math.min(maxLen, 120)),
      tag: truncateString(row.tag ?? "", 24),
      testId: (row.testId ?? "").slice(0, 96),
      path: truncateSelectorPath(row.path ?? "", Math.min(maxLen, 140)),
      note: row.note ? truncateString(row.note, Math.min(maxLen, 140)) : null,
      wcag: row.wcag ? truncateString(row.wcag, 24) : undefined,
    };
  };

  const compactRows = (arr, limit, maxLen, mapper = compactObjectStrings) => {
    if (!Array.isArray(arr)) return arr;
    return arr.slice(0, Math.max(0, limit)).map(item => mapper(item, maxLen));
  };

  const compactResult = (result, limits) => {
    if (!result || typeof result !== "object") return result;
    const out = { ...result };
    if (Array.isArray(result.findings)) out.findings = compactRows(result.findings, limits.findings, limits.maxString, compactFindingRow);
    if (Array.isArray(result.failures)) out.failures = compactRows(result.failures, limits.failures, limits.maxString);
    if (Array.isArray(result.events)) out.events = compactRows(result.events, limits.events, limits.maxString);
    if (Array.isArray(result.samples)) out.samples = compactRows(result.samples, limits.samples, limits.maxString, compactContrastRow);
    if (Array.isArray(result.snapshots)) out.snapshots = result.snapshots.slice(0, Math.max(0, limits.snapshots));
    if (Array.isArray(result.verdicts)) out.verdicts = compactRows(result.verdicts, limits.verdicts, limits.maxString);
    if (typeof out.href === "string") out.href = truncateString(out.href, limits.maxString * 2);
    return out;
  };

  const compactRecord = (rec, limits) => {
    if (!rec || typeof rec !== "object") return rec;
    const out = { ...rec };
    if (typeof out.envTag === "string") out.envTag = truncateString(out.envTag, limits.maxString);
    if (Array.isArray(out.usedFrameIds)) out.usedFrameIds = out.usedFrameIds.slice(0, 20);
    if (out.best && typeof out.best === "object") {
      const best = { ...out.best };
      if (best.normalized && typeof best.normalized === "object") {
        const { raw: _raw, ...normalizedWithoutRaw } = best.normalized;
        best.normalized = compactObjectStrings(normalizedWithoutRaw, limits.maxString);
      }
      if (best.result && typeof best.result === "object") best.result = compactResult(best.result, limits);
      out.best = best;
    }
    return out;
  };

  // keep latest records in-memory; persistence uses progressively more compact payloads
  if (state.records.length > 20) {
    state.records = state.records.slice(0, 20);
    state.byId = {};
    for (const rec of state.records) state.byId[String(rec.id)] = rec;
  }

  renderSaveStatus("saving");
  let lastErr = null;
  for (let i = 0; i < PERSIST_LIMIT_STEPS.length; i++) {
    const limits = PERSIST_LIMIT_STEPS[i];
    const compacted = state.records
      .slice(0, limits.records)
      .map(rec => compactRecord(rec, limits));
    try {
      await storageSet({ [scopeKey]: compacted });
      if (i > 0) {
        console.warn(`persistRecords recovered with compact level ${i + 1}/${PERSIST_LIMIT_STEPS.length}`, { bytes: estimateJsonBytes(compacted) });
      }
      renderSaveStatus("saved");
      return true;
    } catch (err) {
      lastErr = err;
      console.warn(`persistRecords attempt ${i + 1} failed`, { bytes: estimateJsonBytes(compacted), err });
    }
  }

  console.error("persistRecords failed", lastErr);
  renderSaveStatus("error", "quota");
  return false;
}

async function loadRecords(scopeKey) {
  const r = await storageGet([scopeKey]);
  const arr = Array.isArray(r?.[scopeKey]) ? r[scopeKey] : [];
  state.records = arr;
  state.byId = {};
  for (const rec of state.records) state.byId[String(rec.id)] = rec;
}

function resetFilters() {
  els.q.value = "";
  if (els.contrastQ) els.contrastQ.value = "";
  if (els.tabWalkQ) els.tabWalkQ.value = "";
  state.sevFilter = new Set();
  state.contrastFilter = "all";
}

function renderRecord(rec) {
  if (!rec) return;
  state.currentId = rec.id;
  state.hasRunMode.add(rec.action);
  // Store per-record highlight context (prevents global leakage)
  state._activeHighlightCtx = rec._highlightContext || {
    bestFrameId: rec.best?.frameId ?? 0,
    usedFrameIds: rec.usedFrameIds || [],
  };
  state.bestFrameId = state._activeHighlightCtx.bestFrameId;
  setPressed(rec.action);
  updateResultsVisibility(true);
  resetFilters();

  const bestResult = rec?.best?.result || null;
  const mode = rec.action;

  // default reset
  els.allTableBody.innerHTML = "";
  state.currentFindings = [];
  if (mode !== "contrast") renderSevTabs();
  if (els.integrityOverview) els.integrityOverview.hidden = true;
  if (els.shadowCoverageRow) els.shadowCoverageRow.hidden = true;
  showMode(mode);

  if (mode === "run") {
    renderRunSummary(bestResult, rec);
    const allFindings = Array.isArray(bestResult?.findings) ? bestResult.findings : [];
    const findings = applyAllFindingFilters(allFindings);
    state.currentFindings = findings;
    state.findingsByMode.run = allFindings;
    rerenderFindings();
  } else if (mode === "contrast") {
    state.contrastFilter = "all";
    renderContrast(bestResult);
    renderContrastSevTabs();
  } else if (mode === "tabWalk") {
    renderSevTabs();
    renderTabWalk(bestResult);
  } else if (mode === "observe" && bestResult) {
    const allFindings = Array.isArray(bestResult.findings) ? bestResult.findings : [];
    const oFindings = applyAllFindingFilters(allFindings);
    if (oFindings.length) {
      state.currentFindings = oFindings;
      state.findingsByMode.observe = allFindings;
      showMode("observe");
      rerenderFindings();
    } else {
      renderSevTabs();
    }
  } else if (mode === "watch" && bestResult) {
    renderWatch(bestResult);
  } else {
    renderSevTabs();
  }
}

// ═══ PAST RUNS BOTTOM SHEET ═══

const MODE_COLORS = { run: "var(--orange)", contrast: "#54B8A6", tabWalk: "#7BB85E", observe: "#5AADDB", watch: "#8B8EDB" };

function formatRunTime(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
}

function getRunCount(rec) {
  const r = rec?.best?.result;
  if (!r) return "";
  if (Array.isArray(r.findings)) return `${r.findings.length} findings`;
  if (Array.isArray(r.failures)) return `${r.failures.length} issues`;
  if (Array.isArray(r.events)) return `${r.events.length} events`;
  return "";
}

// Event delegation for pastRunsList — attached once, never leaked.
let _pastRunsDelegationAttached = false;
function _ensurePastRunsDelegation() {
  if (_pastRunsDelegationAttached || !els.pastRunsList) return;
  _pastRunsDelegationAttached = true;
  els.pastRunsList.addEventListener("click", async (e) => {
    const delBtn = e.target.closest(".pastRunDelete");
    if (delBtn) {
      e.stopPropagation();
      const item = delBtn.closest(".pastRunItem");
      const id = item?.dataset?.id;
      if (id) await deleteSingleRun(id);
      return;
    }
    const item = e.target.closest(".pastRunItem");
    if (!item) return;
    const id = item.dataset?.id;
    const found = id ? state.byId[String(id)] : null;
    if (found) {
      renderRecord(found);
      renderPastRuns();
    }
  });
}

function renderPastRuns() {
  if (!els.pastRunsList) return;
  _ensurePastRunsDelegation();
  const runs = state.records;
  if (els.pastRunsCount) {
    els.pastRunsCount.textContent = runs.length ? `(${runs.length})` : "";
  }
  if (!runs.length) {
    els.pastRunsList.innerHTML = `<div style="padding:12px 16px;color:var(--tx3);font-size:11px;">No past runs</div>`;
    if (els.pastRunsActions) els.pastRunsActions.hidden = true;
    return;
  }
  if (els.pastRunsActions) els.pastRunsActions.hidden = false;
  els.pastRunsList.innerHTML = runs.map(rec => {
    const isActive = String(rec.id) === String(state.currentId);
    const mode = rec.action || "run";
    const color = MODE_COLORS[mode] || "var(--tx3)";
    return `<div class="pastRunItem${isActive ? " isActive" : ""}" data-id="${escapeHtml(String(rec.id))}">` +
      `<span class="pastRunDot" style="background:${color}"></span>` +
      `<span class="pastRunInfo">` +
        `<span class="pastRunMode">${MODE_LABELS[mode] || mode}</span>` +
        `<span class="pastRunTime">${formatRunTime(rec.at)}</span>` +
      `</span>` +
      `<span class="pastRunCount">${getRunCount(rec)}</span>` +
      `<button class="pastRunDelete" type="button" title="Delete this run" aria-label="Delete run">&times;</button>` +
    `</div>`;
  }).join("");
}

async function deleteSingleRun(id) {
  const idStr = String(id);
  const deleted = state.records.find(x => String(x.id) === idStr);
  const deletedIdx = state.records.indexOf(deleted);
  state.records = state.records.filter(x => String(x.id) !== idStr);
  delete state.byId[idStr];
  if (String(state.currentId) === idStr) {
    if (state.records.length) {
      state.currentId = state.records[0].id;
      renderRecord(state.records[0]);
    } else {
      state.currentId = null;
      state.currentFindings = [];
      state.lastResult = null;
      els.json.textContent = "(no results yet)";
      updateResultsVisibility(false);
    }
  }
  renderPastRuns();
  const { origin, env } = getCurrentScopeInfo();
  const scopeKey = `records::${origin || ""}::${env}`;
  await persistRecords(scopeKey);
  toast("Run deleted", deleted ? { label: "Undo", fn: async () => {
    state.records.splice(deletedIdx, 0, deleted);
    state.byId[idStr] = deleted;
    if (!state.currentId) { state.currentId = deleted.id; renderRecord(deleted); updateResultsVisibility(true); }
    renderPastRuns();
    await persistRecords(scopeKey);
    toast("Run restored");
  }} : null);
}

async function deleteAllRunsAction() {
  if (!state.records.length) return;
  const backup = { records: [...state.records], byId: { ...state.byId }, currentId: state.currentId };
  state.records = [];
  state.byId = {};
  state.currentId = null;
  state.currentFindings = [];
  state.lastResult = null;
  state.hasRunMode = new Set();
  state.findingsByMode = {};
  els.json.textContent = "(no results yet)";
  updateResultsVisibility(false);
  renderPastRuns();
  const { origin, env } = getCurrentScopeInfo();
  const scopeKey = `records::${origin || ""}::${env}`;
  await persistRecords(scopeKey);
  toast("All runs deleted", { label: "Undo", fn: async () => {
    state.records = backup.records;
    state.byId = backup.byId;
    state.currentId = backup.currentId;
    const rec = state.currentId ? state.byId[state.currentId] : state.records[0];
    if (rec) { state.currentId = rec.id; renderRecord(rec); updateResultsVisibility(true); }
    renderPastRuns();
    await persistRecords(scopeKey);
    toast("Runs restored");
  }});
}

function summarizeFrames(perFrame = []) {

  const okFrames = perFrame.filter(x => x.ok);
  const findingsCount = okFrames.map(x => {
    if (Array.isArray(x?.result?.findings)) return x.result.findings.length;
    const n = Number(x?.normalized?.primaryCounts?.findings);
    return Number.isFinite(n) ? n : null;
  }).filter(x => typeof x === "number");
  const max = findingsCount.length ? Math.max(...findingsCount) : 0;
  return `frames_ok=${okFrames.length}/${perFrame.length}, max_findings=${max}`;
}

function inferResultType(result) {
  if (!result || typeof result !== "object") return "unknown";
  if (Array.isArray(result.failures)) return "contrast";
  if (Array.isArray(result.events) && ("walked" in result || "totalFocusables" in result)) return "tabWalk";
  if ("focusLossCount" in result || "bursts" in result || "totalLoadingMs" in result) return "watch";
  if (Array.isArray(result.snapshots)) return "observe";
  if (Array.isArray(result.findings)) return "run";
  return "unknown";
}

function asNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFindingConfidence(confidence) {
  const c = String(confidence || "").toLowerCase();
  if (c === "strict" || c === "heuristic" || c === "advisory") return c;
  return "strict";
}

function isRunFindingBlocking(finding) {
  const severity = normalizeWs(finding?.severity, 12);
  if (severity !== "high" && severity !== "medium") return false;
  const confidence = normalizeFindingConfidence(finding?.confidence);
  if (confidence === "advisory") return false;
  if (severity === "high") return true;
  return confidence === "strict";
}

function summarizeRunFindings(findings = []) {
  let strictHigh = 0;
  let strictMedium = 0;
  let heuristicHigh = 0;
  let heuristicMedium = 0;
  let advisoryHigh = 0;
  let advisoryMedium = 0;
  let low = 0;
  let info = 0;

  for (const f of findings) {
    const severity = normalizeWs(f?.severity, 12);
    const confidence = normalizeFindingConfidence(f?.confidence);
    if (severity === "high") {
      if (confidence === "strict") strictHigh++;
      else if (confidence === "heuristic") heuristicHigh++;
      else advisoryHigh++;
      continue;
    }
    if (severity === "medium") {
      if (confidence === "strict") strictMedium++;
      else if (confidence === "heuristic") heuristicMedium++;
      else advisoryMedium++;
      continue;
    }
    if (severity === "low") low++;
    else info++;
  }

  const blockingCount = strictHigh + strictMedium + heuristicHigh;
  const summaryScore = Number((
    (strictHigh * 5) +
    (strictMedium * 3) +
    (heuristicHigh * 1.5) +
    (heuristicMedium * 0.5) +
    (low * 0.2) +
    (info * 0.05)
  ).toFixed(2));

  return {
    blockingCount,
    summaryScore,
    primaryCounts: {
      findings: findings.length,
      blockingFindings: blockingCount,
      strictHigh,
      strictMedium,
      heuristicHigh,
      heuristicMedium,
      advisoryHigh,
      advisoryMedium,
      low,
      info,
    },
  };
}

function normalizeResultForExport(result, explicitType = null) {
  const type = explicitType || inferResultType(result);
  const raw = result && typeof result === "object" ? result : {};
  if (type === "watch") {
    const verdicts = Array.isArray(raw.verdicts) ? raw.verdicts.length : 0;
    const focusLossCount = asNumber(raw.focusLossCount, 0);
    const bursts = asNumber(raw.bursts, 0);
    const totalLoadingMs = asNumber(raw.totalLoadingMs, 0);
    return {
      type,
      blockingCount: verdicts + focusLossCount,
      summaryScore: (focusLossCount * 5) + bursts + (totalLoadingMs / 1000) + (verdicts ? 50 : 0),
      primaryCounts: { verdicts, focusLossCount, bursts, totalLoadingMs },
      raw
    };
  }
  if (type === "contrast") {
    const failures = Array.isArray(raw.failures) ? raw.failures.length : 0;
    const failuresCount = asNumber(raw.failuresCount, failures);
    return {
      type,
      blockingCount: failuresCount,
      summaryScore: failuresCount,
      primaryCounts: { failures: failuresCount, scanned: asNumber(raw.scanned, 0) },
      raw
    };
  }
  if (type === "tabWalk") {
    const events = Array.isArray(raw.events) ? raw.events.length : 0;
    return {
      type,
      blockingCount: events,
      summaryScore: events,
      primaryCounts: { events, walked: asNumber(raw.walked, 0), totalFocusables: asNumber(raw.totalFocusables, 0) },
      raw
    };
  }
  if (type === "observe") {
    const findingsArr = Array.isArray(raw.findings) ? raw.findings : [];
    const snapshots = Array.isArray(raw.snapshots) ? raw.snapshots.length : 0;
    const findingSummary = summarizeRunFindings(findingsArr);
    return {
      type,
      blockingCount: findingSummary.blockingCount,
      summaryScore: Number((findingSummary.summaryScore + (snapshots * 0.1)).toFixed(2)),
      primaryCounts: { ...findingSummary.primaryCounts, snapshots },
      raw
    };
  }
  const findingsArr = Array.isArray(raw.findings) ? raw.findings : [];
  const findingSummary = summarizeRunFindings(findingsArr);
  return {
    type: "run",
    blockingCount: findingSummary.blockingCount,
    summaryScore: findingSummary.summaryScore,
    primaryCounts: findingSummary.primaryCounts,
    raw
  };
}

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeWs(s, max = 120) {
  return String(s || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeIdentityText(s, max = 120) {
  return normalizeWs(s, max * 2)
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{13,}\b/gi, "#")
    .replace(/\b[0-9a-f]{12,}\b/gi, "#")
    .replace(/\b\d{2,}\b/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function normalizePathForSig(path, max = 140) {
  return normalizeWs(path, max)
    .replace(/nth-child\(\d+\)/g, "nth-child(*)")
    .replace(/\b[0-9a-f]{8,}\b/gi, "#")
    .replace(/\b\d{2,}\b/g, "#");
}

function pathHashForSig(path) {
  const normalized = normalizePathForSig(path, 220);
  return fnv1aHash8(normalized || "path:none");
}

function pathLooksWeak(path) {
  const normalized = normalizePathForSig(path, 220);
  if (!normalized) return true;
  const depth = normalized.split(">").length;
  return depth < 2 || /nth-child\(\*\)/.test(normalized);
}

function qualityWeight(signatureQuality) {
  if (signatureQuality === "high") return 2;
  if (signatureQuality === "medium") return 1;
  return 0;
}

function normalizeRouteSegment(seg) {
  const s = String(seg || "").toLowerCase().trim();
  if (!s) return "";
  if (/^[0-9]+$/.test(s)) return "_id";
  if (/^[0-9a-f]{8,}$/i.test(s)) return "_id";
  if (/^[0-9a-f]{4,}-[0-9a-f-]{8,}$/i.test(s)) return "_id";
  return s.slice(0, 36);
}

function stableRoutePathHint(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split("/").map(normalizeRouteSegment).filter(Boolean).slice(0, 3);
    return segs.length ? segs.join("/") : "root";
  } catch {
    return "root";
  }
}

function normalizedTitleHint(title) {
  const t = String(title || "").toLowerCase().replace(/\s+/g, " ").trim();
  return t ? t.slice(0, 80) : "";
}

function deriveHelpCenterRouteHint(url, activeProfileIds = []) {
  if (!Array.isArray(activeProfileIds) || !activeProfileIds.includes("helpcenter")) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.toLowerCase();
    const articleParam = u.searchParams.get("articleId")
      || u.searchParams.get("article_id")
      || u.searchParams.get("articleSlug")
      || u.searchParams.get("slug")
      || u.searchParams.get("aid");
    if (articleParam) return `article:${normalizeRouteSegment(articleParam)}`;
    const match = path.match(/\/articles?\/([^/?#]+)/i) || path.match(/\/article\/([^/?#]+)/i);
    if (match?.[1]) return `article:${normalizeRouteSegment(match[1])}`;
  } catch {
    // ignore
  }
  return null;
}

function fetchInspectedTitleBestEffort() {
  return new Promise(resolve => {
    chrome.devtools.inspectedWindow.eval("document.title", (res, err) => {
      if (err) return resolve("");
      resolve(String(res || ""));
    });
  });
}

async function deriveStepRouteHint(url, activeProfileIds = []) {
  const hcHint = deriveHelpCenterRouteHint(url, activeProfileIds);
  if (hcHint) return `hc/${hcHint}`.slice(0, 120);
  const pathHint = stableRoutePathHint(url);
  if (pathHint && pathHint !== "root") return pathHint.slice(0, 120);
  const titleHint = normalizedTitleHint(await fetchInspectedTitleBestEffort());
  if (titleHint) return `title:${titleHint}`.slice(0, 120);
  return "(unknown)";
}

async function deriveAutoLabel(url) {
  const title = await fetchInspectedTitleBestEffort();
  if (title && title.length > 2 && title.length < 80) return title;
  const hint = await deriveStepRouteHint(url, [...profileState.active]);
  if (hint && hint !== "(unknown)") return hint;
  return null;
}

function formatTimeHms(isoValue) {
  if (!isoValue) return "—";
  const d = new Date(isoValue);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toTimeString().slice(0, 8);
}

function fnv1aHash8(input) {
  const s = String(input ?? "");
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0").slice(0, 8);
}

function estimateJsonBytes(value) {
  try {
    const json = JSON.stringify(value);
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(json).length;
    return json.length;
  } catch {
    return -1;
  }
}

function safeSlug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 64) || "unknown";
}

function buildSessionFileName(session) {
  const origin = originFrom(session?.inspectedOrigin || "") || session?.inspectedOrigin || "unknown";
  const envFromTag = (() => {
    const tag = String(session?.envTag || "");
    if (tag.includes("local")) return "local";
    if (tag.includes("staging")) return "staging";
    if (tag.includes("prod")) return "prod";
    return "";
  })();
  const env = envFromTag || detectEnv(getCurrentScopeInfo().url || session?.inspectedOrigin || "");
  const date = new Date();
  const y = String(date.getFullYear());
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const host = (() => {
    try { return new URL(origin).host; } catch { return origin; }
  })();
  return `flowlens-session_${safeSlug(host)}_${safeSlug(env)}_${y}${m}${d}-${hh}${mm}.json`;
}

function classifyPersistReason(err) {
  const msg = String(err?.message || err || "").toLowerCase();
  if (msg.includes("quota") || msg.includes("max write") || msg.includes("exceeded")) return "QUOTA_EXCEEDED";
  return "TRANSIENT";
}

function reasonDetail(reasonCode) {
  return MARK_REASON_DETAILS[reasonCode] || "status recorded";
}

function normalizeReasonLabel(reasonCode = "-") {
  const code = String(reasonCode || "-").toLowerCase();
  if (code.includes("manual_frames_missing")) return "MANUAL_FRAMES_MISSING";
  if (code.includes("no_scope_match")) return "NO_SCOPE_MATCH";
  if (code.includes("transport")) return "TRANSPORT";
  if (code.includes("parse")) return "PARSE";
  if (code.includes("quota")) return "QUOTA";
  if (code.includes("raw:capped")) return "RAW_CAPPED";
  if (code.includes("limit")) return "LIMIT";
  if (code === "-") return "—";
  return String(reasonCode || "—").toUpperCase();
}

function isMeaningfulSelectionReason(reason = "") {
  const normalized = normalizeWs(reason, 80);
  if (!normalized || normalized === "—") return false;
  const defaultReasons = new Set([
    "scope_primary_scored_best",
    "auto",
    "auto-best",
    "default",
    "best_match",
  ]);
  return !defaultReasons.has(normalized);
}

function setPersistentStatus(status = "IDLE", reason = "-", detail = "") {
  const normalized = String(status || "IDLE").toUpperCase();
  const reasonLabel = normalizeReasonLabel(reason);
  state.lastPersistentStatus = { status: normalized, reason: reasonLabel, detail: String(detail || "") };
  if (!els.lastStatusLine) return;
  const isIdle = normalized === "IDLE";
  if (!isIdle) state.hasPersistentStatus = true;
  const shouldShow = !isIdle || state.hasPersistentStatus;
  els.lastStatusLine.hidden = !shouldShow;
  if (!shouldShow) return;
  els.lastStatusLine.classList.remove("ok", "partial", "failed");
  if (normalized === "OK") els.lastStatusLine.classList.add("ok");
  else if (normalized === "PARTIAL") els.lastStatusLine.classList.add("partial");
  else if (normalized === "FAILED") els.lastStatusLine.classList.add("failed");
  const reasonPart = reasonLabel && reasonLabel !== "—" ? ` • ${reasonLabel}` : "";
  const tail = detail ? ` • ${detail}` : "";
  els.lastStatusLine.textContent = `Last status: ${normalized}${reasonPart}${tail}`;
}

function setRunTelemetry({ usedFrames, diff } = {}) {
  if (typeof usedFrames === "string") state.lastUsedFramesSummary = usedFrames;
  if (typeof diff === "string") state.lastDiffSummary = diff;
  if (els.usedFrames) els.usedFrames.textContent = state.lastUsedFramesSummary;
  if (els.diff) els.diff.textContent = state.lastDiffSummary;
}

function getSelectedFrameLabel() {
  if (!els.frameSelect) return "Auto";
  const selected = els.frameSelect.selectedOptions?.[0];
  if (!selected) return "Auto";
  return txt(selected.textContent || selected.value || "Auto", 56);
}

function updateTargetingSummary(selectionReason = null) {
  if (!els.targetingSummary) return;
  const scope = getScopeValue();
  const scopeLabel = SCOPE_SUMMARY_LABELS[scope] || SCOPE_LABELS[scope] || scope;
  const frameLabel = getSelectedFrameLabel();
  const pinned = els.pinFrame?.checked ? "On" : "Off";
  const reasonRaw = selectionReason || state.lastSelectionReason || "";
  const frameCount = Number(els.frameSelect?.options?.length || 0);
  const shouldShowFrame = !!els.pinFrame?.checked || (scope === "embedded" && frameCount > 1);
  const meaningfulReason = isMeaningfulSelectionReason(reasonRaw) ? reasonRaw : "";
  const bits = [`Target: ${scopeLabel}`];
  if (shouldShowFrame && frameLabel && frameLabel !== "Auto") {
    bits.push(`Frame: ${frameLabel}${pinned === "On" ? " (pinned)" : ""}`);
  } else if (pinned === "On") {
    bits.push("Pin: On");
  }
  if (meaningfulReason) bits.push(`Reason: ${meaningfulReason}`);
  els.targetingSummary.textContent = bits.join(" • ");
}

function flashInlineHint(el, text = "Copied \u2713", ms = 1500) {
  if (!el) return;
  el.textContent = text;
  el.classList.add("show");
  window.setTimeout(() => {
    el.classList.remove("show");
    el.textContent = "";
  }, ms);
}

function bucketNumber(value, step = 1, fallback = "na") {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const b = Math.floor(n / step) * step;
  return String(b);
}

function getActiveModeForSessionCapture() {
  const candidates = ["run", "contrast", "tabWalk", "watch", "observe"];
  if (candidates.includes(state.activeMode)) return state.activeMode;
  const fromResult = state.lastResult?.bestEntry?.normalized?.type || state.lastResult?.bestEntry?.result?.mode;
  if (candidates.includes(fromResult)) return fromResult;
  return "run";
}

function getSmartModeForCapture(isAutoCapture) {
  if (!isAutoCapture) return getActiveModeForSessionCapture();
  const steps = sessionState.current?.steps || [];
  if (steps.length === 0) return "observe";
  const prevStep = steps[steps.length - 1];
  const prevDiff = prevStep?.diffs?.consolidated || {};
  const prevMode = prevStep?.activeModeCaptured || "run";
  if (prevMode === "observe" && prevDiff.blockingAdded > 0) return "watch";
  return "observe";
}

function getCurrentScopeInfo() {
  const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
  const origin = originFrom(url) || "";
  const env = detectEnv(url);
  return { url, origin, env, envTag: `${origin || "—"} • ${env}` };
}

function getSessionKeys(origin, env, sessionId = null) {
  return {
    active: `session::active::${origin || ""}::${env || ""}`,
    archive: sessionId ? `session::archive::${origin || ""}::${env || ""}::${sessionId}` : null,
  };
}

/**
 * Migrate a single snapshot to stable signatures during v3→v4 migration.
 * If rawAppendix has data, compute full signatures. Otherwise use degraded fallback.
 */
function migrateStepStableSignatures(snapshot, rawAppendix, step) {
  if (!snapshot || !snapshot.best) {
    return { stableFindingSignatureSet: [], severityCounts: { high: 0, medium: 0, low: 0, info: 0 }, blockingSet: [], summaryScore: 0, stepQuality: { degraded: false } };
  }
  const raw = resolveSnapshotRaw(snapshot, rawAppendix);
  const frameKeyStable = snapshot.best.frameKeyStable || snapshot.best.frameKey || "fk::unknown";
  const mode = snapshot.mode || "run";

  // Check if raw has meaningful content (findings, failures, events, verdicts)
  const rawHasContent = raw && typeof raw === "object" && (
    (Array.isArray(raw.findings) && raw.findings.length > 0) ||
    (Array.isArray(raw.failures) && raw.failures.length > 0) ||
    (Array.isArray(raw.events) && raw.events.length > 0) ||
    (Array.isArray(raw.verdicts) && raw.verdicts.length > 0)
  );

  if (rawHasContent) {
    // Full quality: can compute from raw
    const result = computeStableSignatureSet(snapshot, rawAppendix);
    result.stepQuality = { degraded: false };
    return result;
  }

  // Degraded fallback: rawAppendix missing (raw_capped case).
  // Build degraded signatures from whatever metadata is available.
  const signatures = [];
  const severityCounts = { high: 0, medium: 0, low: 0, info: 0 };
  const blockingSet = [];
  let summaryScore = 0;

  // Try to reconstruct from bestEntry.result.findings (stored inline in some cases)
  const inlineFindings = snapshot.best?.result?.findings
    || snapshot.best?.normalized?.raw?.findings
    || [];
  const findings = Array.isArray(inlineFindings) ? inlineFindings : [];

  if (findings.length > 0) {
    for (const f of findings) {
      const sig = buildStableSignature(f, frameKeyStable, mode);
      signatures.push(sig);
      const sev = normalizeWs(f?.severity, 10) || "info";
      if (sev in severityCounts) severityCounts[sev]++;
      if (sev === "high" || sev === "medium") { blockingSet.push(sig); }
      summaryScore += ({ high: 5, medium: 3, low: 1, info: 0 })[sev] || 0;
    }
    return { stableFindingSignatureSet: signatures, severityCounts, blockingSet, summaryScore, stepQuality: { degraded: false } };
  }

  // Last resort: build degraded signatures from type/severity counts only
  const counts = snapshot.best?.normalized?.primaryCounts || {};
  if (counts.findings > 0 || counts.high > 0 || counts.medium > 0) {
    // We know there were findings but don't have their details.
    // Build a single degraded signature per severity bucket.
    for (const [sev, count] of Object.entries({ high: counts.high || 0, medium: counts.medium || 0, low: counts.low || 0, info: counts.info || 0 })) {
      for (let i = 0; i < count; i++) {
        const degradedHash = fnv1aHash8(`${mode}|${frameKeyStable}|${sev}|${i}`);
        const sig = `${mode}|degraded|${sev}|${degradedHash}`;
        signatures.push(sig);
        if (sev in severityCounts) severityCounts[sev]++;
        if (sev === "high" || sev === "medium") blockingSet.push(sig);
        summaryScore += ({ high: 5, medium: 3, low: 1, info: 0 })[sev] || 0;
      }
    }
  }

  return {
    stableFindingSignatureSet: signatures,
    severityCounts,
    blockingSet,
    summaryScore,
    stepQuality: { degraded: true, signatureQualityCounts: { degraded: signatures.length } },
  };
}

function normalizeLoadedSession(session) {
  if (!session || typeof session !== "object") return null;
  const out = { ...session };
  const loadedSchema = asNumber(out.schemaVersion, 1);
  const warnings = [];
  let migrated = false;

  out.signatureVersion = asNumber(out.signatureVersion, 1);
  out.frameKeyVersion = asNumber(out.frameKeyVersion, 1);
  if (!out.rawAppendix || typeof out.rawAppendix !== "object") out.rawAppendix = {};
  if (!Array.isArray(out.steps)) out.steps = [];
  for (const step of out.steps) {
    if (!step || typeof step !== "object") continue;
    if (!step.snapshots || typeof step.snapshots !== "object") step.snapshots = { run: null, active: null };
    if (step.snapshots.run && !step.snapshots.run.targeting) step.snapshots.run.targeting = null;
    if (step.snapshots.active && !step.snapshots.active.targeting) step.snapshots.active.targeting = null;
    if (!step.transitionStates) step.transitionStates = null;
  }
  if (!out.frames || typeof out.frames !== "object") out.frames = { frameKeys: [], frameKeyToLastFrameId: {} };
  if (!Array.isArray(out.frames.frameKeys)) out.frames.frameKeys = [];
  if (!out.frames.frameKeyToLastFrameId || typeof out.frames.frameKeyToLastFrameId !== "object") out.frames.frameKeyToLastFrameId = {};

  // --- Schema v1 → v2 migration ---
  if (loadedSchema < 2) {
    migrated = true;
    warnings.push(`Session migrated from schemaVersion ${loadedSchema} to 3.`);
    for (const step of out.steps) {
      if (!step || typeof step !== "object") continue;
      if (!step.scope) {
        step.scope = { type: "document", rootSelector: null, rootTestId: null };
      }
    }
    if (!out.enMappingVersion) out.enMappingVersion = 0;
  }

  // --- Schema v2 → v3 migration ---
  if (loadedSchema < 3) {
    if (loadedSchema >= 2) {
      migrated = true;
      warnings.push(`Session migrated from schemaVersion ${loadedSchema} to 3.`);
    }
    // Add shadowCoverage to snapshots if missing — initialize with zeros (pre-v3)
    for (const step of out.steps) {
      if (!step || typeof step !== "object") continue;
      const runBest = step?.snapshots?.run?.best;
      if (runBest && !runBest.shadowCoverage) {
        runBest.shadowCoverage = {
          scopesFound: 0, scopesAudited: 0, scopesCapped: false,
          maxDepthObserved: 0, depthLimitReached: false,
        };
      }
    }
  }

  // --- Schema v3 → v4 migration ---
  if (loadedSchema < 4) {
    if (loadedSchema >= 3) {
      migrated = true;
      warnings.push(`Session migrated from schemaVersion ${loadedSchema} to 4.`);
    }
    // Compute stableSignatures for each step from rawAppendix or degraded fallback.
    for (const step of out.steps) {
      if (!step || typeof step !== "object") continue;
      if (step.stableSignatures) continue; // already has v4 data
      const rawAppendix = out.rawAppendix || {};

      const runStable = migrateStepStableSignatures(step.snapshots?.run, rawAppendix, step);
      const activeStable = step.snapshots?.active
        ? migrateStepStableSignatures(step.snapshots.active, rawAppendix, step)
        : null;

      step.stableSignatures = { run: runStable, active: activeStable };
    }
    if (!out.stableSignatureVersion) out.stableSignatureVersion = STABLE_SIGNATURE_VERSION;
  }

  out.schemaVersion = 4;
  out._migrated = migrated;
  out._migrationWarnings = warnings;
  return out;
}

function setLastMarkStatus(status, reasonCode = "-") {
  const code = status === "OK" ? "-" : String(reasonCode || "-");
  sessionState.lastMarkStep = {
    status,
    reasonCode: code.slice(0, 48),
    at: nowIso(),
  };
  setPersistentStatus(status, code, reasonDetail(code));
}

function formatElapsedHms(startIso, endIso = null) {
  const start = Date.parse(startIso || "");
  if (!Number.isFinite(start)) return "0:00";
  const end = endIso ? Date.parse(endIso) : Date.now();
  const totalSec = Math.max(0, Math.round((end - start) / 1000));
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

function ensureSessionHudTicker() {
  const hasSession = !!sessionState.current;
  // Always clear first to prevent stacking if called multiple times rapidly
  if (!hasSession || sessionState.hudTimer) {
    if (sessionState.hudTimer) {
      window.clearInterval(sessionState.hudTimer);
      sessionState.hudTimer = null;
    }
  }
  if (hasSession && !sessionState.hudTimer) {
    sessionState.hudTimer = window.setInterval(() => {
      if (!sessionState.current) return;
      renderSessionHud();
    }, 1000);
  }
}

function expandAccordion(sectionEl) {
  if (!sectionEl) return;
  const btn = sectionEl.querySelector(".accordionToggle");
  if (!btn) return;
  if (btn.getAttribute("aria-expanded") === "true") return;
  btn.setAttribute("aria-expanded", "true");
  const body = sectionEl.querySelector(".accordionBody");
  if (body) body.hidden = false;
  const chevron = btn.querySelector(".chevron");
  if (chevron) chevron.textContent = "\u2227";
}

function renderSessionHud() {
  renderFlowSessionInfo();
  renderFlowTimeline();
  renderFlowCounters();
  renderFlowVerdict();
}

function renderFlowSessionInfo() {
  const body = els.flowSessionInfoBody;
  if (!body) return;
  const sess = sessionState.current || sessionState.lastEndedSession;
  if (!sess?.id) {
    body.innerHTML = '<p class="placeholderText">Press <kbd class="keycap">r</kbd> or click <strong>Record Flow</strong> to start tracking accessibility changes across steps.</p>';
    return;
  }
  const steps = Array.isArray(sess.steps) ? sess.steps : [];
  const elapsed = formatElapsedHms(sess.startedAt, sess.endedAt);
  const status = sess.endedAt ? "ENDED" : "ACTIVE";
  const started = sess.startedAt ? new Date(sess.startedAt).toLocaleTimeString() : "—";
  const baseline = sess.baseline || "Run";
  const active = sess.activeMode || "Observe";
  const scope = sess.scope || "Primary";
  const wcag = sess.wcagLevel || "2.2 AA";
  const maxSteps = sess.maxSteps || 100;
  body.innerHTML = `
    <dl class="sessionInfoGrid">
      <dt>Status</dt><dd>${escapeHtml(status)}</dd>
      <dt>Started</dt><dd>${escapeHtml(started)}</dd>
      <dt>Duration</dt><dd>${escapeHtml(elapsed)}</dd>
      <dt>Steps</dt><dd>${steps.length} / ${maxSteps}</dd>
      <dt>Baseline</dt><dd>${escapeHtml(baseline)}</dd>
      <dt>Active</dt><dd>${escapeHtml(active)}</dd>
      <dt>Scope</dt><dd>${escapeHtml(scope)}</dd>
      <dt>WCAG</dt><dd>${escapeHtml(wcag)}</dd>
    </dl>
  `;
}

let _timelineRenderedCount = 0;
let _timelineSessionId = null;

function _buildTimelineRowHtml(s) {
  const d = s.diffs?.consolidated || {};
  const route = s.routeHint || s.url || "—";
  const shortRoute = route.length > 40 ? route.slice(-38) : route;
  const rawMode = s.activeModeCaptured || "—";
  const mode = rawMode === "run" || rawMode === "—" ? rawMode : `run + ${rawMode}`;
  const label = s.label ? `<span class="stepLabel">${escapeHtml(s.label)}</span> ` : "";
  const blockers = [];
  if (d.blockingAdded) blockers.push(`+${d.blockingAdded} blocking`);
  if (d.blockingFixed) blockers.push(`-${d.blockingFixed} blocking`);
  const delBtn = sessionState.current
    ? ` <button class="stepDeleteBtn" data-delete-step="${s.index}" type="button" aria-label="Delete step ${s.index}" title="Delete step">&times;</button>`
    : "";
  // Profile confidence badge (H/M/L)
  const confLevel = s.profileConfidence;
  const confBadge = confLevel === "high" ? "H" : confLevel === "medium" ? "M" : confLevel === "low" ? "L" : confLevel === "manual" ? "PIN" : "";
  const confData = confBadge ? ` data-level="${escapeHtml(confBadge === "PIN" ? "PIN" : confBadge[0])}"` : "";
  // Build explicit tooltip: prefer rootSelector reason over generic signals
  let confTooltip = "";
  if (s.profileSuspect && s.rootSelectorNotFound) {
    confTooltip = "Root selector not found";
  } else if (Array.isArray(s.profileMatchSignals) && s.profileMatchSignals.length) {
    confTooltip = s.profileMatchSignals.join(", ");
  } else {
    confTooltip = confLevel || "";
  }
  const confHtml = confBadge
    ? `<span class="confidenceBadge"${confData} title="${escapeHtml(confTooltip)}">${escapeHtml(confBadge)}</span>`
    : "";
  return `<tr class="trow" data-step-index="${s.index}" tabindex="0">
    <td>${s.index}${delBtn}</td>
    <td title="${escapeHtml(route)}">${label}${escapeHtml(shortRoute)}</td>
    <td>${escapeHtml(mode)}${confHtml ? " " + confHtml : ""}</td>
    <td>${d.added ?? 0}</td>
    <td>${d.fixed ?? 0}</td>
    <td>${d.persisting ?? 0}</td>
    <td>${escapeHtml(blockers.join(", ") || "—")}</td>
  </tr>`;
}

function renderFlowTimeline() {
  const body = els.flowTimelineBody;
  if (!body) return;
  const sess = sessionState.current || sessionState.lastEndedSession;
  const steps = Array.isArray(sess?.steps) ? sess.steps : [];
  const tbody = body.querySelector("tbody");
  if (!tbody) return;
  const sessId = sess?.id || null;
  if (!steps.length) {
    sessionState.expandedStepIndex = null;
    tbody.innerHTML = "";
    _timelineRenderedCount = 0;
    _timelineSessionId = sessId;
    return;
  }

  // Incremental append: same session, steps only grew by 1, no drill-down open
  const canAppend = sessId && sessId === _timelineSessionId
    && steps.length === _timelineRenderedCount + 1
    && sessionState.expandedStepIndex == null;

  if (canAppend) {
    // Remove any stale detail row before appending
    const existing = tbody.querySelector(".stepDetailRow");
    if (existing) existing.remove();
    tbody.insertAdjacentHTML("beforeend", _buildTimelineRowHtml(steps[steps.length - 1]));
  } else {
    tbody.innerHTML = steps.map(s => _buildTimelineRowHtml(s)).join("");
  }
  _timelineRenderedCount = steps.length;
  _timelineSessionId = sessId;

  // Restore drill-down if step still exists
  if (sessionState.expandedStepIndex != null) {
    const restoreIndex = sessionState.expandedStepIndex;
    const stillExists = steps.some(s => s.index === restoreIndex);
    if (stillExists) {
      sessionState.expandedStepIndex = null;
      renderStepDrillDown(restoreIndex);
    } else {
      sessionState.expandedStepIndex = null;
    }
  }
}

let _countersHash = "";
function renderFlowCounters() {
  const el = document.getElementById("flowCounterRow");
  if (!el) return;
  const sess = sessionState.current || sessionState.lastEndedSession;
  const steps = Array.isArray(sess?.steps) ? sess.steps : [];
  if (!steps.length) { el.hidden = true; _countersHash = ""; return; }
  let added = 0, fixed = 0, persisting = 0, blockingAdded = 0, blockingFixed = 0;
  const perStepAdded = [];
  for (const s of steps) {
    const d = s.diffs?.consolidated || {};
    added += d.added || 0;
    fixed += d.fixed || 0;
    persisting += d.persisting || 0;
    blockingAdded += d.blockingAdded || 0;
    blockingFixed += d.blockingFixed || 0;
    perStepAdded.push(d.added || 0);
  }
  const hash = `${added},${fixed},${persisting},${blockingAdded},${blockingFixed},${perStepAdded.join(";")}`;
  if (hash === _countersHash) return;
  _countersHash = hash;
  const blocking = blockingAdded - blockingFixed;

  // Build sparkline SVG for new issues per step
  let sparkline = "";
  if (perStepAdded.length > 1) {
    const maxVal = Math.max(...perStepAdded, 1);
    const barW = Math.min(12, Math.floor(80 / perStepAdded.length));
    const gap = 2;
    const svgW = perStepAdded.length * (barW + gap) - gap;
    const svgH = 28;
    const bars = perStepAdded.map((v, i) => {
      const h = Math.max(2, (v / maxVal) * (svgH - 2));
      const x = i * (barW + gap);
      const color = v > 0 ? "var(--red)" : "var(--tx3)";
      return `<rect x="${x}" y="${svgH - h}" width="${barW}" height="${h}" rx="1" fill="${color}" opacity="${v > 0 ? 0.8 : 0.3}"/>`;
    }).join("");
    sparkline = `<div class="flowCounter flowCounterSparkline"><svg width="${svgW}" height="${svgH}" aria-label="New issues per step">${bars}</svg><span class="flowCounterLabel">Per step</span></div>`;
  }

  el.innerHTML = `
    <div class="flowCounter"><span class="flowCounterValue${added > 0 ? " flowCounterValue--red" : ""}">${added}</span><span class="flowCounterLabel">New issues</span></div>
    <div class="flowCounter"><span class="flowCounterValue${fixed > 0 ? " flowCounterValue--green" : ""}">${fixed > 0 ? "-" : ""}${fixed}</span><span class="flowCounterLabel">Fixed</span></div>
    <div class="flowCounter"><span class="flowCounterValue">${persisting}</span><span class="flowCounterLabel">Persisting</span></div>
    <div class="flowCounter"><span class="flowCounterValue${blocking > 0 ? " flowCounterValue--red" : ""}">${blocking > 0 ? "+" : ""}${blocking}</span><span class="flowCounterLabel">Blocking</span></div>
    ${sparkline}
  `;
  el.hidden = false;
}

let _verdictHash = "";
function renderFlowVerdict() {
  const el = els.flowVerdict;
  if (!el) return;
  const sess = sessionState.current || sessionState.lastEndedSession;
  const steps = Array.isArray(sess?.steps) ? sess.steps : [];
  if (!steps.length) { el.hidden = true; _verdictHash = ""; return; }
  let totalBlockingAdded = 0;
  const blockingSteps = [];
  for (const s of steps) {
    const ba = s.diffs?.consolidated?.blockingAdded || 0;
    totalBlockingAdded += ba;
    if (ba > 0) blockingSteps.push(s.index);
  }
  // Cheap identity hash FIRST — this render runs on the 1s session HUD tick,
  // so the expensive cross-step rollup must stay behind the early-return gate.
  const hash = `${steps.length},${steps.map(s => s.index).join("+")},${totalBlockingAdded},${blockingSteps.join(";")}`;
  if (hash === _verdictHash) return;
  _verdictHash = hash;
  // Systemic issues: blocking signatures recurring across steps (cross-step rollup)
  const rawAppendix = sess?.rawAppendix && typeof sess.rawAppendix === "object" ? sess.rawAppendix : {};
  const systemic = computeFlowBlockingRollup(steps, rawAppendix).filter(x => x.occurrences >= 2).slice(0, 3);
  const pass = totalBlockingAdded === 0;
  const badge = pass ? "PASS" : "FAIL";
  const badgeCls = pass ? "flowVerdictBadge--pass" : "flowVerdictBadge--fail";
  const wrapCls = pass ? "flowVerdict--pass" : "flowVerdict--fail";
  let summary;
  if (pass) {
    summary = `${steps.length} step${steps.length !== 1 ? "s" : ""}, 0 blocking regressions`;
  } else {
    summary = `${totalBlockingAdded} blocking issue${totalBlockingAdded !== 1 ? "s" : ""} introduced in step${blockingSteps.length !== 1 ? "s" : ""} ${blockingSteps.join(", ")}`;
  }
  // Diff confidence: reduced — when any step has profileSuspect or degraded stableSignatures
  let diffConfNote = "";
  const hasSuspect = steps.some(s => s.profileSuspect === true);
  const hasDegraded = steps.some(s => s.stableSignatures?.run?.stepQuality?.degraded === true);
  const hasRootMissing = steps.some(s => s.rootSelectorNotFound === true);
  if (hasSuspect || hasDegraded || hasRootMissing) {
    const reasons = [];
    if (hasDegraded) reasons.push("degraded signatures");
    if (hasRootMissing) reasons.push("root selector not found");
    if (hasSuspect) reasons.push("low profile confidence");
    const tooltip = reasons.length ? reasons.join("; ") : "reduced confidence";
    diffConfNote = ` <span class="diffConfidenceReduced" title="${escapeHtml(tooltip)}">Diff confidence: reduced</span>`;
  }
  let systemicNote = "";
  if (systemic.length) {
    const items = systemic
      .map(x => `${x.label || x.wcag || "issue"} in ${x.occurrences}/${steps.length} steps`)
      .join(" · ");
    systemicNote = `<div class="flowSystemic" title="Blocking issues recurring across steps — likely systemic, not one-off">Systemic: ${escapeHtml(items)}</div>`;
  }
  el.className = `flowVerdict ${wrapCls}`;
  el.innerHTML = `<span class="flowVerdictBadge ${badgeCls}">${badge}</span><span class="flowVerdictText">${escapeHtml(summary)}</span>${diffConfNote}${systemicNote}`;
  el.hidden = false;
}

