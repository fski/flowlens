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
    renderFlow();
  }

  updateSessionButtons();
}

// Roving tabindex for a [role="tab"] bar: Arrow keys cycle (wrapping),
// Home/End jump, activation goes through onActivate(tab). Shared by
// topTabBar and snapSubTabBar (previously two byte-identical handlers).
function attachRovingTabindex(container, onActivate) {
  if (!container) return;
  container.addEventListener("keydown", (e) => {
    const tabs = [...container.querySelectorAll("[role='tab']")];
    if (!tabs.length) return;
    const idx = tabs.indexOf(e.target);
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onActivate(tabs[next]);
    tabs[next].focus();
  });
}

// ═══ RESULTS SHELL ════════════════════════════════════════════════════════
// One level above the section-view core: decides what fills the Snap body —
// the idle CTA / the results zone / a blocking error — from a single view
// token. Previously updateResultsVisibility and showErrorEmptyState each
// poked emptyText/emptyHint/emptyRetry by getElementById with inline copy,
// and the idle path never cleared a prior error's text/class (a latent
// stuck-error state). renderResultsShell is the only writer now.
const RESULTS_SHELL_COPY = {
  idle: {
    text: "Run an audit to see results",
    hint: "Choose a mode above and click the button to start scanning",
  },
  error: {
    text: "Audit failed",
    hint: "Check the console for details, or try again",
  },
};

/**
 * @param {{view:"idle"|"results"|"error", message?:string}} shell
 */
function renderResultsShell(shell) {
  const view = shell?.view || "idle";
  const showResults = view === "results";
  const showError = view === "error";
  const hasSessionExport = !!(sessionState.current || sessionState.lastEndedSession);

  if (els.emptyState) {
    els.emptyState.hidden = showResults;
    els.emptyState.classList.toggle("emptyState--error", showError);
  }
  if (els.resultsZone) {
    els.resultsZone.hidden = !showResults;
    els.resultsZone.classList.toggle("visible", showResults);
  }
  if (els.exportAnchor) els.exportAnchor.hidden = !(showResults || hasSessionExport);

  // Empty-state body only matters when the empty state is visible.
  if (!showResults) {
    const copy = RESULTS_SHELL_COPY[showError ? "error" : "idle"];
    const txt = document.getElementById("emptyText");
    const hint = document.getElementById("emptyHint");
    const retryBtn = document.getElementById("emptyRetry");
    if (txt) txt.textContent = (showError && shell.message) ? shell.message : copy.text;
    if (hint) hint.textContent = copy.hint;
    if (retryBtn) retryBtn.hidden = !showError;
  }
}

// Naive registrable domain (eTLD+1): last two labels, three when the second
// level is a common shared SLD (co.uk, com.au, …). Not a full PSL — good
// enough to tell "same product, different subdomain" from "different site".
var _SHARED_SLD = { co: 1, com: 1, org: 1, net: 1, gov: 1, edu: 1, ac: 1 };
function registrableDomain(originOrUrl) {
  var host;
  try { host = new URL(String(originOrUrl)).hostname; } catch (_) { return String(originOrUrl || ""); }
  // IP literals have no registrable domain — compare them whole, or
  // 10.0.3.4 vs 172.16.3.4 would both collapse to "3.4" and count as the
  // same site (dev/staging MFEs live on bare IPs).
  if (/^\[/.test(host) || /^[0-9.]+$/.test(host)) return host;
  var parts = host.split(".");
  if (parts.length <= 2) return host;
  return parts.slice(_SHARED_SLD[parts[parts.length - 2]] ? -3 : -2).join(".");
}

// Origin embedded in a frameKey (`fk::vN::origin::pathHint`).
function frameKeyOrigin(frameKey) {
  var parts = String(frameKey || "").split("::");
  return parts.length >= 3 ? parts[2] : "";
}

// Is a subframe navigation part of the audited flow? Embedded apps
// (microfrontends) live in iframes on their own — often foreign — site, so
// the top-level URL says nothing about them. Ground truth is the audited
// frame set of the LAST step: match by frameId for stable frames, and by the
// SITE baked into the audited frameKeys for frames recreated on navigation
// (recreation assigns a new frameId). Unaudited frames (ads, widgets) match
// neither and stay ignored.
function isRelevantFrameNav(url, frameId, session) {
  var steps = (session && Array.isArray(session.steps)) ? session.steps : [];
  var last = steps.length ? steps[steps.length - 1] : null;
  var fs = (last && last.frameSelections) || {};
  var ids = Array.isArray(fs.usedFrameIds) ? fs.usedFrameIds : [];
  if (frameId != null && ids.indexOf(frameId) !== -1) return true;
  var keys = Array.isArray(fs.usedFrameKeys) ? fs.usedFrameKeys : [];
  var navSite = registrableDomain(url || "");
  if (!navSite) return false;
  for (var i = 0; i < keys.length; i++) {
    var o = frameKeyOrigin(keys[i]);
    if (o && registrableDomain(o) === navSite) return true;
  }
  return false;
}

// Cross-SITE navigations are SKIPPED by auto-capture (decision: Piotr,
// 2026-07-20). Auto-captured steps include viewport screenshots, and the
// third-party pages a flow crosses (SSO login, payment gateways) routinely
// show credentials/card data that must not land in IndexedDB. Same-SITE
// subdomain hops (www ↔ login ↔ city.example.com) are the same product flow —
// comparing full origins silently killed auto-capture on ordinary flows.
// Manual Mark on a foreign page still works — that's a deliberate action.
function isForeignAutoCaptureOrigin(url, session) {
  if (!session || !session.inspectedOrigin) return false;
  return registrableDomain(url || "") !== registrableDomain(session.inspectedOrigin);
}

// A top-level navigation drags its iframes along: every embedded frame emits
// onCommitted while it (re)loads, often later than the auto-capture debounce.
// Frame navs inside this window belong to the top nav's step, not a new one.
var FRAME_NAV_SETTLE_MS = 2500;

// Pure auto-capture decision — the whole precedence lives here so the harness
// can assert it (it used to sit in the untestable wireup zone, where every
// comment documented a shipped regression). The executor (maybeAutoCapture)
// only applies side effects: nav-state writeback, debounce, toast/status/log.
function decideNavAction(url, fromAuditedFrame, nav, session, autoOn, now) {
  var next = Object.assign({}, nav);
  if (!session) return { action: "skip", reason: "no-session", nav: next };
  if (!autoOn) return { action: "skip", reason: "auto-off", nav: next };
  if (!fromAuditedFrame) {
    next.lastTopNavAt = now;
    if (isForeignAutoCaptureOrigin(url, session)) return { action: "skip", reason: "skip-foreign-site", nav: next };
  } else if (now - (nav.lastTopNavAt || 0) < FRAME_NAV_SETTLE_MS) {
    return { action: "skip", reason: "skip-frame-settle", nav: next };
  }
  var last = fromAuditedFrame ? nav.lastFrameNavUrl : nav.lastAutoNavUrl;
  if (!classifyNavForCapture(url, last)) return { action: "skip", reason: "skip-not-a-step", nav: next };
  return { action: "capture", reason: fromAuditedFrame ? "frame-nav" : "top-nav", nav: next };
}

// Decide whether a navigation event is a real new step for auto-capture.
// Accepts path/query changes (incl. SPA route changes) and the first nav;
// rejects self-navigation and hash-only jumps that would just add noise.
function classifyNavForCapture(url, lastUrl) {
  if (!url || typeof url !== "string") return false;
  if (!lastUrl) return true;
  if (url === lastUrl) return false;
  try {
    const a = new URL(url);
    const b = new URL(lastUrl);
    // Same origin + path + search, differing only in hash → in-page anchor.
    if (a.origin === b.origin && a.pathname === b.pathname && a.search === b.search) return false;
  } catch (_) {
    // Unparseable — fall back to a raw inequality (already known non-equal).
  }
  return true;
}

function updateResultsVisibility(forceValue = null) {
  const hasResults = typeof forceValue === "boolean" ? forceValue : state.records.length > 0;
  renderResultsShell({ view: hasResults ? "results" : "idle" });
}

function showErrorEmptyState(message) {
  renderResultsShell({ view: "error", message });
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

// Shared filter-tab button for both the severity strip and the contrast
// all/fail/pass strip — the two renderers built byte-identical markup with
// their own copies.
function sevTabButton(sev, label, count, active, title = "") {
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
  return `<button class="sevTab" role="tab" data-sev="${sev}" aria-selected="${active}" tabindex="${active ? 0 : -1}" type="button"${titleAttr}>
      <span class="sevLabel">${escapeHtml(label)}</span>
      <span class="sevCount">${count != null ? count : "&ndash;"}</span>
    </button>`;
}

function renderSevTabs(findings = null) {
  if (!els.sevTabs) return;
  const c = findings ? countBySeverity(findings) : null;
  const total = c ? (c.critical + c.high + c.medium + c.low + c.info) : null;
  const sel = state.sevFilter;
  const isAll = sel.size === 0;

  const renderTab = (sev, label, count, active) =>
    sevTabButton(sev, label, count, active, sev ? "Shift+click to combine" : "Show all severities");

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

  els.sevTabs.innerHTML = [
    sevTabButton("", "All", total, f === "all"),
    sevTabButton("fail", "Fail", fail, f === "fail"),
    sevTabButton("pass", "Pass", pass, f === "pass"),
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
    // A truncated deep path is useless (each ">>>" hop must parse whole) —
    // keep it intact under a generous cap or drop it entirely.
    if (typeof row.pathDeep === "string") out.pathDeep = row.pathDeep.length <= 300 ? row.pathDeep : null;
    if (typeof row.testId === "string") out.testId = row.testId.slice(0, 200);
    if (typeof row.html === "string") out.html = row.html.slice(0, Math.max(maxLen, 120));
    return out;
  };

  const compactContrastRow = (row, maxLen) => {
    if (!row || typeof row !== "object") return row;
    return {
      ratio: row.ratio,
      apcaLc: row.apcaLc,
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
    if (Array.isArray(result.stops)) out.stops = compactRows(result.stops, limits.events, limits.maxString);
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
  // These two persisted across records and made a fresh run render zero rows
  // under a misleading "no results" message — a record switch resets every
  // row-hiding filter, and the chip/pill DOM state must follow.
  state.reviewFilter = false;
  if (els.reviewFilterChip) {
    els.reviewFilterChip.setAttribute("aria-pressed", "false");
    els.reviewFilterChip.classList.remove("isActive");
  }
  activeGroupFilter = null;
  document.querySelectorAll(".integrityPill.active").forEach(b => b.classList.remove("active"));
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
    const color = MODES[mode]?.color || "var(--tx3)";
    return `<div class="pastRunItem${isActive ? " isActive" : ""}" data-id="${escapeHtml(String(rec.id))}">` +
      `<span class="pastRunDot" style="background:${color}"></span>` +
      `<span class="pastRunInfo">` +
        `<span class="pastRunMode">${MODES[mode]?.label || mode}</span>` +
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
  if (severity !== "critical" && severity !== "high" && severity !== "medium") return false;
  const confidence = normalizeFindingConfidence(finding?.confidence);
  if (confidence === "advisory") return false;
  if (severity === "critical" || severity === "high") return true;
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

function setPersistentStatus(status = "IDLE", reason = "-", detail = "", surface = "flow") {
  const normalized = String(status || "IDLE").toUpperCase();
  const reasonLabel = normalizeReasonLabel(reason);
  state.lastPersistentStatus = { status: normalized, reason: reasonLabel, detail: String(detail || "") };
  // Two surfaces: Snap-run statuses render inside Snap; the Flow line shows
  // ONLY session events — a "Last status: OK • TABWALK" line in the Flow tab
  // was Snap state leaking into the wrong context.
  const line = surface === "snap" ? els.snapStatusLine : els.lastStatusLine;
  if (!line) return;
  const isIdle = normalized === "IDLE";
  if (!isIdle) state.hasPersistentStatus = true;
  const shouldShow = !isIdle || state.hasPersistentStatus;
  line.hidden = !shouldShow;
  if (!shouldShow) return;
  line.classList.remove("ok", "partial", "failed");
  if (normalized === "OK") line.classList.add("ok");
  else if (normalized === "PARTIAL") line.classList.add("partial");
  else if (normalized === "FAILED") line.classList.add("failed");
  const reasonPart = reasonLabel && reasonLabel !== "—" ? ` • ${reasonLabel}` : "";
  const tail = detail ? ` • ${detail}` : "";
  line.textContent = `Last status: ${normalized}${reasonPart}${tail}`;
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
    return { stableFindingSignatureSet: [], severityCounts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 }, blockingSet: [], summaryScore: 0, stepQuality: { degraded: false } };
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
  const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
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
      if (isRunFindingBlocking(f)) { blockingSet.push(sig); }
      summaryScore += SEV_SCORE[sev] || 0;
    }
    return { stableFindingSignatureSet: signatures, severityCounts, blockingSet, summaryScore, stepQuality: { degraded: false } };
  }

  // Last resort: build degraded signatures from type/severity counts only
  const counts = snapshot.best?.normalized?.primaryCounts || {};
  if (counts.findings > 0 || counts.high > 0 || counts.medium > 0) {
    // We know there were findings but don't have their details.
    // Build a single degraded signature per severity bucket.
    for (const [sev, count] of Object.entries({ critical: counts.critical || 0, high: counts.high || 0, medium: counts.medium || 0, low: counts.low || 0, info: counts.info || 0 })) {
      for (let i = 0; i < count; i++) {
        const degradedHash = fnv1aHash8(`${mode}|${frameKeyStable}|${sev}|${i}`);
        const sig = `${mode}|degraded|${sev}|${degradedHash}`;
        signatures.push(sig);
        if (sev in severityCounts) severityCounts[sev]++;
        // Degraded buckets carry no confidence — normalizeFindingConfidence
        // defaults to strict, so medium stays blocking (same as before).
        if (isRunFindingBlocking({ severity: sev })) blockingSet.push(sig);
        summaryScore += SEV_SCORE[sev] || 0;
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
  // Sessions persisted before session.env existed derive it from their own
  // origin (env is a pure function of hostname) — storage keys depend on it.
  if (!out.env) out.env = detectEnv(out.inspectedOrigin || "");
  if (!out.rawAppendix || typeof out.rawAppendix !== "object") out.rawAppendix = {};
  if (!Array.isArray(out.steps)) out.steps = [];
  for (const step of out.steps) {
    if (!step || typeof step !== "object") continue;
    if (!step.snapshots || typeof step.snapshots !== "object") step.snapshots = { run: null, active: null };
    if (step.snapshots.run && !step.snapshots.run.targeting) step.snapshots.run.targeting = null;
    if (step.snapshots.active && !step.snapshots.active.targeting) step.snapshots.active.targeting = null;
    if (!step.transitionStates) step.transitionStates = null;
    // Sessions persisted before the Flow rework lack findingIndex — synthesize
    // it from the (still present) run snapshot so resumed flows show real
    // issues + diff instead of an empty PASS.
    if (!step.findingIndex || typeof step.findingIndex !== "object") {
      step.findingIndex = buildFindingIndexForStep(step.snapshots, out.rawAppendix);
    }
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

// ═══ FLOW VIEW (rework) ════════════════════════════════════════════════════
// renderFlow() is the single writer of Flow-tab DOM. Everything below it is a
// pure HTML/string builder composed by the orchestrator — testable without the
// DOM, mirroring the section-view / results-shell discipline.

function renderSessionHud() {
  renderFlow();
}

// Per-step view model: route/label + Appeared/Persisting/Resolved counts and
// the unresolved-blocker flag, all derived purely from findingIndex.
// Blocking is classified with the SHARED isRunFindingBlocking predicate
// (confidence-aware) so the Flow verdict/filter agree with Snap + CI; the
// regression count comes from the authoritative engine diff (baseline = 0).
function flowStepViews(sess) {
  var steps = (sess && Array.isArray(sess.steps)) ? sess.steps : [];
  var out = [];
  for (var i = 0; i < steps.length; i++) {
    var step = steps[i];
    var prev = i > 0 ? steps[i - 1] : null;
    var d = bucketStepDiff(step, prev);
    var blockingAdded = (step.diffs && step.diffs.consolidated && Number(step.diffs.consolidated.blockingAdded)) || 0;
    var unresolvedBlockers = 0;
    var idx = step.findingIndex || {};
    for (var k in idx) { if (Object.prototype.hasOwnProperty.call(idx, k) && isRunFindingBlocking(idx[k])) unresolvedBlockers++; }
    out.push({
      index: step.index,
      id: step.id || String(step.index),
      route: step.routeHint || step.url || "—",
      label: step.label || null,
      hasShot: step.hasShot === true,
      shotError: step.shotError === true,
      shotErrorReason: step.shotErrorReason || null,
      appeared: d.appeared.length,
      persisting: d.persisting.length,
      resolved: d.resolved.length,
      blockingAdded: blockingAdded,
      unresolvedBlockers: unresolvedBlockers,
    });
  }
  return out;
}

function _shortRoute(route) {
  var r = String(route || "—");
  return r.length > 42 ? "…" + r.slice(-40) : r;
}
function _badgeTriplet(v) {
  // The first step has nothing to diff against — "+13 new" on a baseline read
  // as 13 regressions. Show it as what it is.
  if (v.index === 1) {
    return '<span class="flowBadge flowBadge--baseline" title="Issues present at the start of the flow">'
      + (v.appeared + v.persisting) + ' · baseline</span>';
  }
  var z = function (count) { return count === 0 ? " flowBadge--zero" : ""; };
  return '<span class="flowBadge flowBadge--new' + z(v.appeared) + '" title="New issues">+' + v.appeared + '</span>'
    + '<span class="flowBadge flowBadge--persist' + z(v.persisting) + '" title="Persisting">~' + v.persisting + '</span>'
    + '<span class="flowBadge flowBadge--resolved' + z(v.resolved) + '" title="Resolved">-' + v.resolved + '</span>';
}

function flowVerdictHeaderHtml(sess) {
  var steps = (sess && Array.isArray(sess.steps)) ? sess.steps : [];
  if (!steps.length) return "";
  var views = flowStepViews(sess);
  var totalBlockingAdded = 0, newTotal = 0, worst = null;
  for (var i = 0; i < views.length; i++) {
    totalBlockingAdded += views[i].blockingAdded;
    newTotal += views[i].appeared;
    if (!worst || views[i].appeared > worst.appeared) worst = views[i];
  }
  var last = views[views.length - 1];
  var issuesNow = last ? (last.appeared + last.persisting) : 0;
  void newTotal; void worst; // retained for future detail; not shown in the slim header
  var pass = totalBlockingAdded === 0;
  var badge = pass ? "PASS" : "FAIL";
  var badgeCls = pass ? "flowVerdictBadge--pass" : "flowVerdictBadge--fail";
  var wrapCls = pass ? "flowVerdict--pass" : "flowVerdict--fail";
  // Systemic rollup (blocking issues recurring across steps)
  var rawAppendix = (sess && sess.rawAppendix && typeof sess.rawAppendix === "object") ? sess.rawAppendix : {};
  // Rollup is keyed by signature — two elements failing the same rule are two
  // entries; dedupe by display label so the note never repeats a rule name.
  var systemic = [];
  if (typeof computeFlowBlockingRollup === "function") {
    var seenLabels = new Set();
    computeFlowBlockingRollup(steps, rawAppendix).forEach(function (x) {
      if (x.occurrences < 2 || systemic.length >= 3) return;
      var key = x.label || x.wcag || "issue";
      if (seenLabels.has(key)) return;
      seenLabels.add(key);
      systemic.push(x);
    });
  }
  var systemicNote = "";
  if (systemic.length) {
    var items = systemic.map(function (x) { return (x.label || x.wcag || "issue") + " in " + x.occurrences + "/" + steps.length; }).join(" · ");
    systemicNote = '<div class="flowSystemic" title="Blocking issues recurring across steps — likely systemic">Systemic: ' + escapeHtml(items) + '</div>';
  }
  var videoNote = (sess && sess.hasVideo)
    ? '<button class="btn xs flowVideoDownload" type="button" data-flow-download-video aria-label="Download flow recording">⤓ Video</button>'
    : '';
  // Reduced-diff-confidence note: preserved from the old verdict — flags that
  // the appeared/resolved diff may be unreliable for structural reasons.
  var diffConfNote = "";
  // Suspect only counts when a profile/root selector was actually in play —
  // generic pages with no matching profile are always "low confidence" and
  // flagged every ordinary session as reduced.
  var hasSuspect = steps.some(function (s) { return s.profileSuspect === true && (s.profileLabel || s.rootSelector); });
  var hasDegraded = steps.some(function (s) { return s.stableSignatures && s.stableSignatures.run && s.stableSignatures.run.stepQuality && s.stableSignatures.run.stepQuality.degraded === true; });
  var hasRootMissing = steps.some(function (s) { return s.rootSelectorNotFound === true; });
  if (hasSuspect || hasDegraded || hasRootMissing) {
    var reasons = [];
    if (hasDegraded) reasons.push("degraded signatures");
    if (hasRootMissing) reasons.push("root selector not found");
    if (hasSuspect) reasons.push("low profile confidence");
    diffConfNote = ' <span class="diffConfidenceReduced" title="' + escapeHtml(reasons.join("; ")) + '">Diff confidence: reduced</span>';
  }
  // Slim header (progressive disclosure): verdict badge + step count + the two
  // decision-relevant numbers (Issues now, Blocking). New-total / worst-step
  // are discoverable from the step list, not crowded into the header.
  return '<div class="flowVerdict ' + wrapCls + '">'
    + '<span class="flowVerdictBadge ' + badgeCls + '">' + badge + '</span>'
    + '<span class="flowVerdictText">' + steps.length + ' step' + (steps.length !== 1 ? "s" : "") + '</span>'
    + '<span class="flowStat"><span class="flowStatV">' + issuesNow + '</span><span class="flowStatL">Issues now</span></span>'
    + '<span class="flowStat' + (totalBlockingAdded > 0 ? ' flowStat--bad' : '') + '"><span class="flowStatV">' + totalBlockingAdded + '</span><span class="flowStatL">Blocking</span></span>'
    + videoNote
    + diffConfNote
    + '</div>' + systemicNote;
}

// Single source for a step's screenshot storage key: the stable step.id, with
// the numeric-index fallback pre-id sessions were written under. Write side
// (captureStepShot) and both read sites must agree — they drifted before.
function stepShotKey(step) {
  return String((step && (step.id || step.index)) || "");
}

function filmstripHtml(sess, selectedIndex) {
  var views = flowStepViews(sess);
  if (!views.length) return "";
  return views.map(function (v) {
    var sel = v.index === selectedIndex;
    var shotFailTitle = v.shotError
      ? ' title="Screenshot failed' + (v.shotErrorReason ? ": " + escapeHtml(v.shotErrorReason) : "") + '"'
      : '';
    var thumb = v.hasShot
      ? '<div class="filmstripThumb" data-shot-step="' + escapeHtml(stepShotKey(v)) + '" data-shot-idx="' + v.index + '"></div>'
      : '<div class="filmstripThumb filmstripThumb--empty" aria-hidden="true"' + shotFailTitle + '>' + (v.shotError ? "!" : "▢") + '</div>';
    var cls = "filmstripTile" + (sel ? " isSelected" : "") + (v.hasShot ? "" : " filmstripTile--noshot")
      + (v.blockingAdded > 0 ? " filmstripTile--blocking" : "");
    var aria = "Step " + v.index + ", " + _shortRoute(v.label || v.route)
      + ", " + v.appeared + " new, " + v.persisting + " persisting, " + v.resolved + " resolved";
    return '<div class="' + cls + '" role="option" data-step-index="' + v.index + '"'
      + ' aria-selected="' + (sel ? "true" : "false") + '" tabindex="' + (sel ? "0" : "-1") + '"'
      + ' aria-label="' + escapeHtml(aria) + '">'
      + thumb
      + '<span class="filmstripNum">' + v.index + '</span>'
      + '</div>';
  }).join("");
}

function stepListHtml(sess, selectedIndex, unresolvedOnly) {
  var views = flowStepViews(sess);
  if (unresolvedOnly) views = views.filter(function (v) { return v.unresolvedBlockers > 0; });
  if (!views.length) {
    return '<div class="sectionEmpty">' + (unresolvedOnly ? "No steps with unresolved blockers" : "No steps captured yet") + '</div>';
  }
  var canDelete = !!sessionState.current;
  return views.map(function (v) {
    var sel = v.index === selectedIndex;
    var del = canDelete
      ? ' <button class="stepDeleteBtn" data-delete-step="' + v.index + '" type="button" aria-label="Delete step ' + v.index + '" title="Delete step">×</button>'
      : "";
    var labelHtml = v.label ? '<span class="flowStepLabelTxt">' + escapeHtml(v.label) + '</span> ' : "";
    return '<div class="flowStepRow' + (sel ? " isSelected" : "") + '" role="button" tabindex="0"'
      + ' data-step-index="' + v.index + '" aria-current="' + (sel ? "true" : "false") + '"'
      + ' aria-label="Step ' + v.index + ' ' + escapeHtml(_shortRoute(v.label || v.route)) + '">'
      + '<span class="flowStepNum">' + v.index + del + '</span>'
      + '<span class="flowStepRoute" title="' + escapeHtml(v.route) + '">' + labelHtml + escapeHtml(_shortRoute(v.route)) + '</span>'
      + '<span class="flowStepBadges">' + _badgeTriplet(v) + '</span>'
      + '</div>';
  }).join("");
}

function _findingLineHtml(f) {
  return '<li class="flowDiffItem flowDiffItem--' + escapeHtml(String(f.severity || "info")) + '">'
    + '<span class="flowDiffSev">' + escapeHtml(String(f.severity || "info")) + '</span>'
    + '<span class="flowDiffName">' + escapeHtml(f.name || f.type || "issue") + '</span>'
    + (f.wcag ? '<span class="flowDiffWcag">' + escapeHtml(f.wcag) + '</span>' : '')
    + '</li>';
}

// Cluster a diff bucket by rule type: a 99-row flat list was unreadable.
// Groups sort by severity, then size; instances expand on demand.
function groupDiffFindings(items) {
  var by = new Map();
  (items || []).forEach(function (f) {
    var type = String(f.type || f.name || "issue");
    var severity = String(f.severity || "info");
    var key = type + "|" + severity + "|" + String(f.wcag || "");
    if (!by.has(key)) by.set(key, { type: type, severity: severity, wcag: String(f.wcag || ""), items: [] });
    by.get(key).items.push(f);
  });
  return [...by.values()].sort(function (a, b) {
    return ((ORDER[b.severity] || 0) - (ORDER[a.severity] || 0))
      || (b.items.length - a.items.length)
      || a.type.localeCompare(b.type);
  });
}

function _diffGroupHtml(title, cls, items) {
  var groups = groupDiffFindings(items);
  var body;
  if (!groups.length) {
    body = '<div class="flowDiffEmpty">none</div>';
  } else {
    body = groups.map(function (g) {
      // Content-hashed id: stable across re-renders (index-based ids shifted
      // when groups changed) and safe to embed (no page content in the attr).
      var gid = "fg" + fnv1aHash8(cls + "|" + g.type + "|" + g.severity + "|" + g.wcag);
      var open = !!state.expandedFGroups[gid];
      return '<div class="fGroup">'
        + '<button type="button" class="fGroupHdr flowDiffItem--' + escapeHtml(g.severity) + '" data-fgroup="' + gid + '" aria-expanded="' + (open ? "true" : "false") + '">'
        + '<span class="flowDiffSev">' + escapeHtml(g.severity) + '</span>'
        + '<span class="fGroupType">' + escapeHtml(g.type) + '</span>'
        + '<span class="fGroupCount">×' + g.items.length + '</span>'
        + (g.wcag ? '<span class="flowDiffWcag">' + escapeHtml(g.wcag) + '</span>' : '')
        + '<span class="fGroupChevron" aria-hidden="true">' + (open ? "▾" : "▸") + '</span>'
        + '</button>'
        + '<ul class="flowDiffList fGroupBody" data-fgroup-body="' + gid + '"' + (open ? '' : ' hidden') + '>' + g.items.map(_findingLineHtml).join("") + '</ul>'
        + '</div>';
    }).join("");
  }
  return '<div class="flowDiffGroup flowDiffGroup--' + cls + '">'
    + '<div class="flowDiffTitle">' + title + ' <span class="flowDiffCount">' + (items ? items.length : 0) + '</span></div>'
    + body
    + '</div>';
}
function stepDetailHtml(sess, selectedIndex) {
  var steps = (sess && Array.isArray(sess.steps)) ? sess.steps : [];
  if (!steps.length) {
    return '<div class="sectionEmpty" id="flowDetailEmpty">Record a flow, then select a step to see what changed.</div>';
  }
  var pos = -1;
  for (var i = 0; i < steps.length; i++) { if (steps[i].index === selectedIndex) { pos = i; break; } }
  if (pos === -1) pos = steps.length - 1;
  var step = steps[pos];
  var prev = pos > 0 ? steps[pos - 1] : null;
  var d = bucketStepDiff(step, prev);
  var shotKey = stepShotKey(step);
  var shot = step.hasShot
    ? '<div class="flowDetailShot" data-shot-step="' + escapeHtml(shotKey) + '" data-shot-idx="' + step.index + '"></div>'
      + '<button class="btn xs flowShotDownload" type="button" data-shot-download="' + step.index + '" aria-label="Download step ' + step.index + ' screenshot">⤓ PNG</button>'
    : '<div class="flowDetailShot flowDetailShot--empty">' + (step.shotError ? "screenshot unavailable" : "no screenshot") + '</div>';
  var hasPrev = pos > 0, hasNext = pos < steps.length - 1;
  var nav = '<div class="flowStepNav">'
    + '<button class="btn xs" type="button" data-step-nav="prev"' + (hasPrev ? "" : " disabled") + ' aria-label="Previous step">‹ Prev</button>'
    + '<span class="flowStepNavPos">Step ' + step.index + ' / ' + steps.length + '</span>'
    + '<button class="btn xs" type="button" data-step-nav="next"' + (hasNext ? "" : " disabled") + ' aria-label="Next step">Next ›</button>'
    + '</div>';
  // Empty buckets collapse into one muted summary line — three bordered
  // "none" boxes were pure chrome.
  var buckets = [["Appeared", "appeared", d.appeared], ["Persisting", "persisting", d.persisting], ["Resolved", "resolved", d.resolved]];
  var groupsHtml = "";
  var emptyNames = [];
  for (var bi = 0; bi < buckets.length; bi++) {
    if ((buckets[bi][2] || []).length) groupsHtml += _diffGroupHtml(buckets[bi][0], buckets[bi][1], buckets[bi][2]);
    else emptyNames.push(buckets[bi][0] + " 0");
  }
  if (emptyNames.length) groupsHtml += '<div class="flowDiffEmptyRow">' + emptyNames.join(" · ") + '</div>';
  return nav
    + shot
    + '<div class="flowDiffGroups">'
    + groupsHtml
    + '</div>';
}

function lifecycleSwimlaneHtml(sess) {
  var steps = (sess && Array.isArray(sess.steps)) ? sess.steps : [];
  if (!steps.length) return "";
  var lc = buildIssueLifecycle(steps);
  if (!lc.lanes.length) return '<div class="sectionEmpty">No recurring issues</div>';
  var n = steps.length;
  var CAP = 12;
  var lanes = lc.lanes.slice(0, CAP);
  var more = lc.lanes.length - lanes.length;
  // Header row: bars without a step axis were unreadable.
  var hdrCells = "";
  for (var h = 0; h < n; h++) hdrCells += '<span class="swimHdrCell">' + steps[h].index + '</span>';
  var header = '<div class="swimLane swimLane--hdr" aria-hidden="true">'
    + '<span class="swimLabel">issue \\ step</span>'
    + '<span class="swimTrack">' + hdrCells + '</span>'
    + '</div>';
  var body = lanes.map(function (lane) {
    var cells = "";
    for (var i = 0; i < n; i++) {
      var idx = steps[i].index;
      var on = lane.presentSteps.indexOf(idx) !== -1;
      cells += '<span class="swimCell' + (on ? " on" : "") + '" title="Step ' + idx + (on ? " — present" : " — absent") + '"></span>';
    }
    return '<div class="swimLane">'
      + '<span class="swimLabel" title="' + escapeHtml(lane.label) + '">'
      + '<span class="swimSev swimSev--' + escapeHtml(String(lane.severity)) + '">' + escapeHtml(String(lane.severity)) + '</span> '
      + escapeHtml(lane.label) + '</span>'
      + '<span class="swimTrack">' + cells + '</span>'
      + '</div>';
  }).join("");
  var moreNote = more > 0 ? '<div class="swimMore">+' + more + ' more recurring issues</div>' : "";
  return '<div class="swimlaneInner">' + header + body + moreNote + '</div>';
}

// ─── Orchestrator: the only writer of Flow-tab result DOM ───────────────────
function _flowSelectedIndex(sess) {
  var steps = (sess && Array.isArray(sess.steps)) ? sess.steps : [];
  if (!steps.length) return null;
  var sel = sessionState.selectedStepIndex;
  if (sel != null && steps.some(function (s) { return s.index === sel; })) return sel;
  return steps[steps.length - 1].index; // default: latest step
}

function renderFlow() {
  var sess = sessionState.current || sessionState.lastEndedSession;
  var steps = (sess && Array.isArray(sess.steps)) ? sess.steps : [];
  var hasSteps = steps.length > 0;

  // Capture-in-progress cover — one loud "wait" signal instead of a small
  // button-label change nobody notices. Runs before the early return so it
  // also covers the very first step of a session.
  if (els.flowCaptureOverlay) {
    var busy = !!(sessionState.current && sessionState.inFlight);
    els.flowCaptureOverlay.hidden = !busy;
    if (busy) {
      var stepNo = ((sessionState.current.steps || []).length) + 1;
      var extra = (sessionState.queuedCapture ? " One more step is queued." : "")
        + (sessionState.captureSlow ? " Still working — large page." : "");
      var overlayMarkup = '<div class="flowCaptureBox">'
        + '<div class="flowCaptureSpin" aria-hidden="true"></div>'
        + '<div class="flowCaptureTitle">Analyzing step ' + stepNo + '…</div>'
        + '<div class="flowCaptureSub">Keep the page as-is for a few seconds.' + escapeHtml(extra) + '</div>'
        // End must ALWAYS be reachable (the #68 rule) — the cover hides the
        // action bar, so it carries its own escape hatch.
        + '<button class="btn xs flowCaptureEndBtn" type="button" data-capture-end>End session</button>'
        + '</div>';
      // Idempotent write: renders fire several times per capture, and a blind
      // innerHTML rewrite restarts the spinner animation and re-announces the
      // aria-live status on every one of them.
      if (els.flowCaptureOverlay.__lastMarkup !== overlayMarkup) {
        els.flowCaptureOverlay.innerHTML = overlayMarkup;
        els.flowCaptureOverlay.__lastMarkup = overlayMarkup;
      }
    } else {
      els.flowCaptureOverlay.__lastMarkup = null;
    }
  }
  if (els.flowResults) els.flowResults.hidden = !hasSteps;
  if (els.flowPlaceholder) els.flowPlaceholder.hidden = hasSteps;
  if (!hasSteps) return;

  var selected = _flowSelectedIndex(sess);
  sessionState.selectedStepIndex = selected;
  var unresolvedOnly = !!(els.flowUnresolvedOnly && els.flowUnresolvedOnly.checked);

  if (els.flowVerdictHeader) els.flowVerdictHeader.innerHTML = flowVerdictHeaderHtml(sess);
  if (els.flowFilmstrip) els.flowFilmstrip.innerHTML = filmstripHtml(sess, selected);
  if (els.flowLifecycle) els.flowLifecycle.innerHTML = lifecycleSwimlaneHtml(sess);
  if (els.flowStepList) els.flowStepList.innerHTML = stepListHtml(sess, selected, unresolvedOnly);
  if (els.flowStepDetail) els.flowStepDetail.innerHTML = stepDetailHtml(sess, selected);

  // Collapsed-section counts (filmstrip = steps, lifecycle = recurring issues).
  if (els.flowFilmstripCount) els.flowFilmstripCount.textContent = "(" + steps.length + ")";
  if (els.flowLifecycleCount) {
    var laneCount = (buildIssueLifecycle(steps).lanes || []).length;
    els.flowLifecycleCount.textContent = "(" + laneCount + ")";
  }

  // Fill screenshot thumbnails/details asynchronously from the media store.
  _hydrateFlowShots(sess);
}

// Load screenshots (Blobs → object URLs) into the slots renderFlow drew.
// Object URLs are CACHED per (session, step): a re-render re-applies the
// cached URL synchronously (no blank-frame flicker, no repeated IndexedDB
// reads), and URLs are revoked only when the session changes — the old
// revoke-everything-then-refetch pass raced overlapping renders into blank
// thumbnails. Best-effort; a missing shot just leaves its placeholder.
var _flowShotUrlCache = { sessionId: null, byKey: {} };
function _flushFlowShotCache() {
  for (var k in _flowShotUrlCache.byKey) { try { URL.revokeObjectURL(_flowShotUrlCache.byKey[k]); } catch (_) {} }
  _flowShotUrlCache = { sessionId: null, byKey: {} };
}
function _hydrateFlowShots(sess) {
  if (typeof flowMediaStore === "undefined" || !sess) return;
  if (_flowShotUrlCache.sessionId !== sess.id) _flushFlowShotCache();
  _flowShotUrlCache.sessionId = sess.id;
  var slots = document.querySelectorAll("[data-shot-step]");
  slots.forEach(function (slot) {
    // Keys are the STABLE string step.id — read as a string, NOT Number()
    // (which yields NaN for "step_..."). Sessions captured before the id-key
    // change stored shots under the numeric step.index, so fall back to that.
    var id = slot.getAttribute("data-shot-step");
    var legacyIdx = slot.getAttribute("data-shot-idx");
    var apply = function (url) {
      slot.style.backgroundImage = 'url("' + url + '")';
      slot.classList.add("hasImage");
    };
    if (_flowShotUrlCache.byKey[id]) { apply(_flowShotUrlCache.byKey[id]); return; }
    flowMediaStore.getShot(sess.id, id).then(function (blob) {
      if (!blob && legacyIdx != null && legacyIdx !== id) {
        return flowMediaStore.getShot(sess.id, Number(legacyIdx));
      }
      return blob;
    }).then(function (blob) {
      if (!blob) return;
      // The cache may have been flushed for a newer session while this read
      // was in flight — don't resurrect a URL for a dead session.
      if (_flowShotUrlCache.sessionId !== sess.id) return;
      var url = _flowShotUrlCache.byKey[id];
      if (!url) {
        url = URL.createObjectURL(blob);
        _flowShotUrlCache.byKey[id] = url;
      }
      apply(url);
    }).catch(function () {});
  });
}

