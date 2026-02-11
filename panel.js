// DevTools Panel UI for FlowLens
// - frame-aware execution (auto HC iframe)
// - findings explorer + highlight
// - presets + history/diff + markdown export
// - keyboard shortcuts + toasts

const tabId = chrome.devtools.inspectedWindow.tabId;

const els = {
  target: document.getElementById("target"),
  refreshFrames: document.getElementById("refreshFrames"),
  frameSelect: document.getElementById("frameSelect"),
  copyFrameUrl: document.getElementById("copyFrameUrl"),
  profileSelect: document.getElementById("profileSelect"),
  alsoConsole: document.getElementById("alsoConsole"),
  pinFrame: document.getElementById("pinFrame"),
  density: document.getElementById("density"),
  themeToggle: document.getElementById("themeToggle"),
  wcagLevel: document.getElementById("wcagLevel"),

  copyJson: document.getElementById("copyJson"),
  downloadJson: document.getElementById("downloadJson"),
  copyMd: document.getElementById("copyMd"),

  presetQuick: document.getElementById("presetQuick"),
  presetRelease: document.getElementById("presetRelease"),
  presetFocus: document.getElementById("presetFocus"),

  json: document.getElementById("json"),
  inspectedUrl: document.getElementById("inspectedUrl"),
  copyInspectedUrl: document.getElementById("copyInspectedUrl"),
  brandEnv: document.getElementById("brandEnv"),
  copyDetected: document.getElementById("copyDetected"),
  usedFrames: document.getElementById("usedFrames"),
  summary: document.getElementById("summary"),
  diff: document.getElementById("diff"),

  runSummary: document.getElementById("runSummary"),
  sevBadges: document.getElementById("sevBadges"),
  topTableBody: document.querySelector("#topTable tbody"),

  // explorer
  q: document.getElementById("q"),
  sev: document.getElementById("sev"),
  prod: document.getElementById("prod"),
  type: document.getElementById("type"),
  unique: document.getElementById("unique"),
  allTableBody: document.querySelector("#allTable tbody"),

  toast: document.getElementById("toast"),
  viewSelect: document.getElementById("viewSelect"),
  clearHistory: document.getElementById("clearHistory"),
  viewRun: document.getElementById("viewRun"),
  viewContrast: document.getElementById("viewContrast"),
  viewTab: document.getElementById("viewTab"),
  viewWatch: document.getElementById("viewWatch"),
  viewObserve: document.getElementById("viewObserve"),
  contrastSection: document.getElementById("contrastSection"),
  contrastTbody: document.querySelector("#contrastTable tbody"),
  tabWalkSection: document.getElementById("tabWalkSection"),
  tabTbody: document.querySelector("#tabTable tbody"),
};

const ORDER = { high: 3, medium: 2, low: 1, info: 0 };

const state = { top: [], explorer: [], records: [], byId: {}, currentId: null, currentFindings: [], lastResult: null, bestFrameId: 0, _toastTimer: null, running: false, _progressInterval: null, contrastData: [], tabData: [] };

// --- MFE Profile Registry ---
// Each profile defines detection heuristics for one microfrontend product.
// Adding a new MFE = adding a new object here (or via custom profiles in storage).
const BUILTIN_PROFILES = {
  helpcenter: {
    label: "Help Center",
    frame: {
      urlIncludes: ["helpcenter-webclient", "usehurrier.com", "helpcenter"],
      domSelectors: [
        "#help-center-root",
        "[data-testid='help-center-wrapper']",
        "[data-testid='global-help-center-container']",
        "[data-testid*='HELP']",
        "[data-testid*='HC']",
      ],
    },
    modeHints: {
      "helpcenter-bot": {
        roles: [],
        testIds: ["[data-testid*='conversational']", "[data-testid*='BOT']"],
        url: "new-conversation",
      },
      "helpcenter-tree": {
        roles: ["[role='tree']", "[role='treeitem']"],
        testIds: ["[data-testid*='TREE']"],
        url: null,
      },
    },
  },
  chat: {
    label: "Chat",
    frame: {
      urlIncludes: [],
      domSelectors: ["[data-testid^='GST_CHAT__']", "#GST_CHAT__FEED", "[role='log']"],
    },
    modeHints: {
      chat: {
        roles: ["[role='log']"],
        testIds: ["[data-testid^='GST_CHAT__']", "#GST_CHAT__FEED"],
        url: null,
      },
    },
  },
};

// Active profile state: { profiles: { [id]: profileObj }, active: string[] }
const profileState = { profiles: { ...BUILTIN_PROFILES }, active: ["helpcenter"] };

// --- Column sorting ---
const sortState = {
  top: { col: null, dir: 'asc' },
  explorer: { col: null, dir: 'asc' },
  contrast: { col: null, dir: 'asc' },
  tab: { col: null, dir: 'asc' },
};

const SORT_KEYS = {
  top: [
    f => ORDER[f.severity] ?? -1, f => f.product ?? '', f => f.type ?? '',
    f => f.wcag ?? '', f => f.name ?? '', f => f.role ?? '', f => f.testId ?? '', f => f.note ?? '', f => f.fix ?? '',
  ],
  explorer: [
    f => ORDER[f.severity] ?? -1, f => f.product ?? '', f => f.type ?? '',
    f => f.wcag ?? '', f => f.name ?? '', f => f.testId ?? '', f => f.path ?? '', f => f.note ?? '', f => f.fix ?? '',
  ],
  contrast: [
    f => f.ratio ?? 0, f => f.required ?? 0, f => f.largeText ? 1 : 0,
    f => f.text ?? '', f => f.tag ?? '', f => f.testId ?? '', f => f.path ?? '', f => f.note ?? '',
  ],
  tab: [
    f => f.i ?? 0, f => f.type ?? '', f => f.tabIndex ?? 0,
    f => f.name ?? '', f => f.path ?? '', f => f.note ?? '',
  ],
};

function applySortState(arr, tableId) {
  const s = sortState[tableId];
  if (s.col == null) return arr;
  const keys = SORT_KEYS[tableId];
  if (!keys || !keys[s.col]) return arr;
  const extract = keys[s.col];
  const sorted = [...arr].sort((a, b) => {
    const va = extract(a), vb = extract(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return va - vb;
    return String(va).localeCompare(String(vb));
  });
  return s.dir === 'desc' ? sorted.reverse() : sorted;
}

function toggleSort(tableId, colIdx, theadEl) {
  const s = sortState[tableId];
  if (s.col === colIdx) {
    s.dir = s.dir === 'asc' ? 'desc' : 'asc';
  } else {
    s.col = colIdx;
    s.dir = 'asc';
  }
  if (theadEl) {
    theadEl.querySelectorAll('th').forEach(h => {
      h.removeAttribute('data-sort-dir');
      if (h.hasAttribute('aria-sort')) h.setAttribute('aria-sort', 'none');
    });
    const th = theadEl.querySelectorAll('th')[colIdx];
    if (th) {
      th.setAttribute('data-sort-dir', s.dir);
      th.setAttribute('aria-sort', s.dir === 'asc' ? 'ascending' : 'descending');
    }
  }
}

// --- Virtualized tables ----------------------------------------------------
class VirtualTable {
  constructor({ wrapEl, tbodyEl, colCount, rowRenderer, estimateRowHeight = 32, overscan = 10 }) {
    this.wrapEl = wrapEl;
    this.tbodyEl = tbodyEl;
    this.colCount = colCount;
    this.rowRenderer = rowRenderer;
    this.estimateRowHeight = estimateRowHeight;
    this.overscan = overscan;

    this.data = [];
    this.rowHeight = estimateRowHeight;

    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
    this._raf = null;

    this.wrapEl.addEventListener("scroll", this._onScroll, { passive: true });
    window.addEventListener("resize", this._onResize);
  }

  destroy() {
    this.wrapEl.removeEventListener("scroll", this._onScroll);
    window.removeEventListener("resize", this._onResize);
  }

  setData(data) {
    this.data = Array.isArray(data) ? data : [];
    // reset scroll window render
    this._render(true);
  }

  _onScroll() { this._render(); }
  _onResize() { this._render(true); }

  _render(force = false) {
    if (this._raf && !force) return;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      const n = this.data.length;
      const wrap = this.wrapEl;
      const vh = wrap.clientHeight || 0;
      const st = wrap.scrollTop || 0;

      const rh = Math.max(18, this.rowHeight || this.estimateRowHeight);
      const start0 = Math.floor(st / rh);
      const vis = Math.ceil(vh / rh) + 1;

      const start = Math.max(0, start0 - this.overscan);
      const end = Math.min(n, start0 + vis + this.overscan);

      const topPad = start * rh;
      const botPad = Math.max(0, (n - end) * rh);

      // Build HTML
      const rows = [];
      rows.push(`<tr class="vt-spacer" aria-hidden="true"><td colspan="${this.colCount}" style="height:${topPad}px"></td></tr>`);
      for (let i = start; i < end; i++) rows.push(this.rowRenderer(this.data[i], i));
      rows.push(`<tr class="vt-spacer" aria-hidden="true"><td colspan="${this.colCount}" style="height:${botPad}px"></td></tr>`);

      this.tbodyEl.innerHTML = rows.join("");

      // Measure row height from first real row if possible
      const firstRow = this.tbodyEl.querySelector("tr:not(.vt-spacer)");
      if (firstRow) {
        const h = firstRow.getBoundingClientRect().height;
        if (h && Math.abs(h - this.rowHeight) > 1) this.rowHeight = h;
      }
    });
  }
}

const VT = { all: null, contrast: null, tab: null };



const __runtime = (chrome && (chrome.runtime || chrome.extension)) || null;
const __storageLocal = (chrome && chrome.storage && chrome.storage.local) ? chrome.storage.local : null;

function hasRuntime() {
  return !!(__runtime && typeof __runtime.sendMessage === "function");
}

// Minimal async storage fallback using localStorage (panel-only).
const __lsPrefix = "a11yflowaudit::";
async function storageGet(keys) {
  if (__storageLocal) return await __storageLocal.get(keys);
  const out = {};
  const ks = Array.isArray(keys) ? keys : Object.keys(keys || {});
  for (const k of ks) {
    const raw = localStorage.getItem(__lsPrefix + k);
    if (raw != null) { try { out[k] = JSON.parse(raw); } catch { /* corrupted entry */ } }
  }
  return out;
}
async function storageSet(obj) {
  if (__storageLocal) return await __storageLocal.set(obj);
  for (const [k,v] of Object.entries(obj || {})) {
    localStorage.setItem(__lsPrefix + k, JSON.stringify(v));
  }
}


function send(msg) {
  if (!hasRuntime()) {
    toast("Extension runtime unavailable (reload DevTools / reload extension)");
    return Promise.reject(new Error("chrome.runtime.sendMessage unavailable"));
  }
  return __runtime.sendMessage({ tabId, ...msg });
}

function pretty(x) {
  try { return JSON.stringify(x, null, 2); } catch { return String(x); }
}

function toast(message) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(state._toastTimer);
  state._toastTimer = setTimeout(() => els.toast.classList.remove("show"), 1800);
}

const DURATIONS = { watch: 40, observe: 12, tabWalk: 5, contrast: 3, run: 2 };

function showProgress(durationSec) {
  const wrap = document.getElementById('progressWrap');
  const bar = document.getElementById('progressBar');
  const label = document.getElementById('progressLabel');
  if (!wrap || !bar) return;
  wrap.hidden = false;
  bar.style.transition = 'none';
  bar.style.width = '0%';
  bar.offsetWidth;
  bar.style.transition = `width ${durationSec}s linear`;
  bar.style.width = '100%';
  let remaining = durationSec;
  if (label) label.textContent = `~${remaining}s`;
  clearInterval(state._progressInterval);
  state._progressInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(state._progressInterval);
      if (label) label.textContent = 'finishing\u2026';
    } else {
      if (label) label.textContent = `~${remaining}s`;
    }
  }, 1000);
}

function hideProgress() {
  clearInterval(state._progressInterval);
  const wrap = document.getElementById('progressWrap');
  const bar = document.getElementById('progressBar');
  if (wrap) wrap.hidden = true;
  if (bar) { bar.style.transition = 'none'; bar.style.width = '0%'; }
}

function scrollToResults(action) {
  let el;
  if (action === 'contrast') el = document.getElementById('contrastSection');
  else if (action === 'tabWalk') el = document.getElementById('tabWalkSection');
  else if (action === 'run') el = document.getElementById('findingsSection');
  else el = document.getElementById('runSummary');
  if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

async function _runSingle(action, opts) {
  const btn = document.querySelector(`[data-action="${action}"]`);
  if (btn) btn.classList.add('running');
  showProgress(DURATIONS[action] || 2);
  try {
    await runAction(action, opts);
  } finally {
    if (btn) btn.classList.remove('running');
    hideProgress();
  }
}

async function _lockedPreset(actions) {
  if (state.running) return;
  state.running = true;
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) toolbar.classList.add('isRunning');
  try {
    for (const a of actions) await _runSingle(a);
    scrollToResults(actions[actions.length - 1]);
  } finally {
    state.running = false;
    if (toolbar) toolbar.classList.remove('isRunning');
  }
}

async function copyText(text) {
  // DevTools panel can have Clipboard API blocked by Permissions Policy.
  // Fallback to execCommand-based copy which still works in most environments.
  try {
    const ta = document.createElement("textarea");
    ta.value = String(text ?? "");
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (!ok) throw new Error("execCommand(copy) returned false");
    return true;
  } catch (e) {
    console.warn("Copy failed", e);
    toast("Copy failed (clipboard blocked)");
    return false;
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function detectEnv(url) {
  const u = (url || "").toLowerCase();
  if (/(localhost|127\.0\.0\.1)/.test(u)) return "local";
  if (/(staging|stage|preprod|preview|dev|test|qa)/.test(u)) return "staging";
  return "prod";
}

function originFrom(url) {
  try { return new URL(url).origin; } catch { return ""; }
}

function hashFinding(f) {
  // stable-ish signature for diff
  const parts = [
    f?.severity,
    f?.product,
    f?.type,
    f?.wcag,
    f?.testId,
    f?.path,
    f?.role,
    (f?.name || "").slice(0, 60),
    (f?.note || "").slice(0, 60),
  ];
  return parts.map(x => String(x || "")).join("|");
}

function countBySeverity(findings = []) {
  const out = { high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) out[f.severity] = (out[f.severity] || 0) + 1;
  return out;
}

function topFindings(findings = [], limit = 30) {
  return [...findings]
    .sort((a, b) => (ORDER[b.severity] ?? 0) - (ORDER[a.severity] ?? 0))
    .slice(0, limit);
}


function recordLabel(rec) {
  const at = rec?.at ? new Date(rec.at).toLocaleString() : "";
  const action = rec?.action || "—";
  const env = rec?.envTag || "";
  let frame = "";
  try { frame = rec?.best?.frameUrl ? new URL(rec.best.frameUrl).origin : ""; } catch {}
  return `${at} • ${action} • ${env}${frame ? " • " + frame : ""}`;
}

function setPressed(action) {
  const map = { run: els.viewRun, contrast: els.viewContrast, tabWalk: els.viewTab, watch: els.viewWatch, observe: els.viewObserve };
  Object.entries(map).forEach(([k,btn]) => { if (btn) btn.setAttribute("aria-pressed", String(k===action)); });
}

function showMode(mode) {
  const findings = document.getElementById("findingsSection");
  const explorer = document.getElementById("explorerSection");
  const contrast = document.getElementById("contrastSection");
  const tab = document.getElementById("tabWalkSection");
  if (findings) findings.hidden = mode !== "run";
  if (explorer) explorer.hidden = mode !== "run";
  if (contrast) contrast.hidden = mode !== "contrast";
  if (tab) tab.hidden = mode !== "tabWalk";
}

function updateViewSelect() {
  if (!els.viewSelect) return;
  const cur = String(state.currentId || "");
  els.viewSelect.innerHTML = "";
  if (!state.records.length) {
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "(no stored results yet)";
    els.viewSelect.appendChild(o);
    return;
  }
  for (const rec of state.records) {
    const o = document.createElement("option");
    o.value = String(rec.id);
    o.textContent = recordLabel(rec);
    els.viewSelect.appendChild(o);
  }
  if (cur && state.byId[cur]) els.viewSelect.value = cur;
}

async function persistRecords(scopeKey) {
  // keep last 20, cap findings per record to avoid filling chrome.storage (5MB limit)
  state.records = state.records.slice(0, 20).map(rec => {
    if (!rec?.best?.result) return rec;
    const r = rec.best.result;
    const trimmed = { ...r };
    if (Array.isArray(r.findings) && r.findings.length > 200) trimmed.findings = r.findings.slice(0, 200);
    if (Array.isArray(r.failures) && r.failures.length > 200) trimmed.failures = r.failures.slice(0, 200);
    if (Array.isArray(r.events) && r.events.length > 200) trimmed.events = r.events.slice(0, 200);
    return trimmed !== r ? { ...rec, best: { ...rec.best, result: trimmed } } : rec;
  });
  await storageSet({ [scopeKey]: state.records });
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
  els.sev.value = "";
  els.prod.value = "";
  els.type.value = "";
  els.unique.checked = true;
}

function renderRecord(rec) {
  if (!rec) return;
  state.currentId = rec.id;
  setPressed(rec.action);
  updateViewSelect();
  resetFilters();

  const bestResult = rec?.best?.result || null;
  const mode = rec.action;

  // default reset
  els.sevBadges.innerHTML = "";
  els.topTableBody.innerHTML = "";
  els.allTableBody.innerHTML = "";
  state.currentFindings = [];
  showMode(mode);

  if (mode === "run") {
    renderRunSummary(bestResult);
    const findings = Array.isArray(bestResult?.findings) ? bestResult.findings : [];
    state.currentFindings = findings;
    buildOptionsFromFindings(findings, els.prod, "product");
    buildOptionsFromFindings(findings, els.type, "type");
    renderExplorer(findings);
  } else if (mode === "contrast") {
    const scanned = escapeHtml(String(bestResult?.scanned ?? "—"));
    const failures = escapeHtml(String(bestResult?.failuresCount ?? bestResult?.failures?.length ?? "—"));
    els.runSummary.innerHTML =
      `<div class="kv"><b>action</b><span>contrast</span></div>` +
      `<div class="kv"><b>scanned</b><span>${scanned}</span></div>` +
      `<div class="kv"><b>failures</b><span>${failures}</span></div>` +
      `<div class="kv"><b>timestamp</b><span>${escapeHtml(bestResult?.timestamp || rec.at || "—")}</span></div>`;
    els.sevBadges.innerHTML = `<span class="badge info">failures: ${failures}</span><span class="badge low">scanned: ${scanned}</span>`;
    renderContrast(bestResult);
  } else if (mode === "tabWalk") {
    const walked = escapeHtml(String(bestResult?.walked ?? "—"));
    const totalFoc = escapeHtml(String(bestResult?.totalFocusables ?? "—"));
    const evtCount = escapeHtml(String(bestResult?.events?.length ?? "—"));
    els.runSummary.innerHTML =
      `<div class="kv"><b>action</b><span>tabWalk</span></div>` +
      `<div class="kv"><b>walked</b><span>${walked}/${totalFoc}</span></div>` +
      `<div class="kv"><b>events</b><span>${evtCount}</span></div>` +
      `<div class="kv"><b>timestamp</b><span>${escapeHtml(bestResult?.timestamp || rec.at || "—")}</span></div>`;
    els.sevBadges.innerHTML = `<span class="badge info">events: ${evtCount}</span><span class="badge low">walked: ${walked}/${totalFoc}</span>`;
    renderTabWalk(bestResult);
  } else if (mode === "observe" && bestResult) {
    const snapshots = Array.isArray(bestResult.snapshots) ? bestResult.snapshots : [];
    const oFindings = Array.isArray(bestResult.findings) ? bestResult.findings : [];
    els.runSummary.innerHTML =
      `<div class="kv"><b>action</b><span>observe</span></div>` +
      `<div class="kv"><b>duration</b><span>${escapeHtml(String(bestResult.seconds ?? "—"))}s (${escapeHtml(String(bestResult.intervalMs ?? 900))}ms interval)</span></div>` +
      `<div class="kv"><b>snapshots</b><span>${snapshots.length}</span></div>` +
      `<div class="kv"><b>unique findings</b><span>${oFindings.length}</span></div>` +
      `<div class="kv"><b>timestamp</b><span>${escapeHtml(bestResult.timestamp || rec.at || "—")}</span></div>`;
    if (oFindings.length) {
      const c = countBySeverity(oFindings);
      els.sevBadges.innerHTML =
        `<span class="badge high" data-sev="high" tabindex="0" role="button" title="Filter explorer by severity">high: ${c.high}</span>` +
        `<span class="badge medium" data-sev="medium" tabindex="0" role="button" title="Filter explorer by severity">medium: ${c.medium}</span>` +
        `<span class="badge low" data-sev="low" tabindex="0" role="button" title="Filter explorer by severity">low: ${c.low}</span>` +
        `<span class="badge info" data-sev="info" tabindex="0" role="button" title="Filter explorer by severity">info: ${c.info}</span>`;
      state.currentFindings = oFindings;
      showMode("run");
      buildOptionsFromFindings(oFindings, els.prod, "product");
      buildOptionsFromFindings(oFindings, els.type, "type");
      renderExplorer(oFindings);
    }
  } else if (mode === "watch" && bestResult) {
    const verdicts = Array.isArray(bestResult.verdicts) ? bestResult.verdicts : [];
    const wEvents = Array.isArray(bestResult.events) ? bestResult.events : [];
    const overBudget = verdicts.length > 0;
    els.runSummary.innerHTML =
      `<div class="kv"><b>action</b><span>watch</span></div>` +
      `<div class="kv"><b>duration</b><span>${escapeHtml(String(bestResult.seconds ?? "—"))}s</span></div>` +
      `<div class="kv"><b>loader bursts</b><span>${escapeHtml(String(bestResult.bursts ?? "—"))}</span></div>` +
      `<div class="kv"><b>total loading</b><span>${escapeHtml(String(bestResult.totalLoadingMs ?? "—"))}ms</span></div>` +
      `<div class="kv"><b>silent loading</b><span>${escapeHtml(String(bestResult.silentMs ?? "—"))}ms</span></div>` +
      `<div class="kv"><b>focus loss</b><span>${escapeHtml(String(bestResult.focusLossCount ?? "—"))}</span></div>` +
      `<div class="kv"><b>events</b><span>${wEvents.length}</span></div>` +
      `<div class="kv"><b>budget</b><span>${overBudget ? "OVER (" + verdicts.map(v => escapeHtml(String(v.metric))).join(", ") + ")" : "OK"}</span></div>` +
      `<div class="kv"><b>timestamp</b><span>${escapeHtml(bestResult.timestamp || rec.at || "—")}</span></div>`;
    els.sevBadges.innerHTML = overBudget
      ? `<span class="badge high">OVER BUDGET</span>`
      : `<span class="badge info">Budgets OK</span>`;
  } else {
    els.runSummary.innerHTML = `<div class="kv"><b>action</b><span>${escapeHtml(mode)}</span></div>` +
      `<div class="kv"><b>frameId</b><span>${escapeHtml(String(rec?.best?.frameId ?? "—"))}</span></div>` +
      `<div class="kv"><b>timestamp</b><span>${escapeHtml(bestResult?.timestamp || bestResult?.endedAt || rec.at || "—")}</span></div>`;
  }
}

function summarizeFrames(perFrame = []) {

  const okFrames = perFrame.filter(x => x.ok);
  const findingsCount = okFrames
    .map(x => Array.isArray(x?.result?.findings) ? x.result.findings.length : null)
    .filter(x => typeof x === "number");
  const max = findingsCount.length ? Math.max(...findingsCount) : 0;
  return `frames_ok=${okFrames.length}/${perFrame.length}, max_findings=${max}`;
}

function buildMarkdown({ inspectedUrl, best, perFrame, usedFrameIds, envTag }) {
  const r = best?.result;
  if (!r) return `FlowLens — no result (env=${envTag})\nURL: ${inspectedUrl}`;
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const c = countBySeverity(findings);
  const top = topFindings(findings, 10);
  const lines = [];
  lines.push(`**FlowLens** (${envTag})`);
  lines.push(`URL: ${inspectedUrl}`);
  lines.push(`FrameIds: ${(usedFrameIds || []).join(", ") || "?"}`);
  lines.push(`Mode: ${r.mode || "—"} • inIframe: ${String(r?.env?.inIframe ?? "—")}`);
  lines.push(`Findings: high=${c.high}, medium=${c.medium}, low=${c.low}, info=${c.info} (total=${findings.length})`);
  if (actionIsWatch(r)) {
    const w = r;
    lines.push(`Watch: bursts=${w.bursts?.length ?? "—"}, silentMs=${w.silentMs ?? "—"}, totalLoadingMs=${w.totalLoadingMs ?? "—"}, focusLossCount=${w.focusLossCount ?? "—"}`);
  }
  lines.push("");
    if (Array.isArray(r.failures)) {
    lines.push(`Contrast: failures=${r.failuresCount ?? r.failures.length}, scanned=${r.scanned ?? "—"}`);
    lines.push("");
    lines.push("Top contrast failures:");
    for (const f of r.failures.slice(0, 10)) {
      lines.push(`- [ratio ${f.ratio}/${f.required}] ${txt(f.text || "", 80)} • ${txt(f.path || "", 80)}`);
    }
    lines.push("");
    lines.push(`Panel summary: ${summarizeFrames(perFrame || [])}`);
    return lines.join("\n");
  }

  if (Array.isArray(r.events)) {
    lines.push(`TabWalk: events=${r.events.length}, walked=${r.walked ?? "—"}/${r.totalFocusables ?? "—"}`);
    lines.push("");
    lines.push("Top TabWalk events:");
    for (const e of r.events.slice(0, 12)) {
      lines.push(`- [${e.type}] i=${e.i ?? "—"} ${txt(e.name || "", 60)} • ${txt(e.path || "", 80)} ${e.note ? "— " + txt(e.note, 80) : ""}`);
    }
    lines.push("");
    lines.push(`Panel summary: ${summarizeFrames(perFrame || [])}`);
    return lines.join("\n");
  }

  lines.push("Top findings:");
  for (const f of top) {
    lines.push(`- [${f.severity}] ${f.product ? f.product + " • " : ""}${f.type || ""}${f.wcag ? ` (${f.wcag})` : ""} — ${txt(f.note || f.name || "", 120)}${f.testId ? ` • testId=${f.testId}` : ""}${f.fix ? "\n  Fix: " + txt(f.fix, 120) : ""}`);
  }
  lines.push("");
  lines.push(`Panel summary: ${summarizeFrames(perFrame || [])}`);
  return lines.join("\n");
}


function truncateMiddle(s, max = 80) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  const keep = Math.max(10, Math.floor((max - 3) / 2));
  return str.slice(0, keep) + "..." + str.slice(-keep);
}

function cellHtml(value, maxLen = 60) {
  const full = String(value ?? "");
  if (!full) return "";
  if (full.length <= maxLen) return escapeHtml(full);
  return `<span class="cellWrap"><span class="cellText" title="${escapeHtml(full)}">${escapeHtml(truncateMiddle(full, maxLen))}</span><button class="cellCopy" type="button" data-copy="${escapeHtml(full)}" aria-label="Copy"></button></span>`;
}

function txt(s, n = 140) {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function actionIsWatch(resultObj) {
  // watch() summary in snippet stores e.g. bursts/silentMs/totalLoadingMs/focusLossCount
  return !!(resultObj && ("silentMs" in resultObj || "bursts" in resultObj) && ("focusLossCount" in resultObj));
}

function renderRunSummary(r) {
  if (!r) {
    els.runSummary.innerHTML = '<div class="emptyGuide">Press <kbd>R</kbd> to run a strict audit, or try:<br><kbd>O</kbd> Observe \u00b7 <kbd>W</kbd> Watch \u00b7 <kbd>T</kbd> TabWalk \u00b7 <kbd>C</kbd> Contrast</div>';
    els.sevBadges.innerHTML = "";
    els.topTableBody.innerHTML = "";
    return;
  }

  const href = r?.env?.href ?? r?.href ?? "";
  const inIframe = r?.env?.inIframe ?? null;
  const mode = r?.mode ?? "";
  const findings = Array.isArray(r?.findings) ? r.findings : [];
  const lists = r?.lists || null;
  const headingsCount = Array.isArray(r?.headings) ? r.headings.length : null;

  els.runSummary.innerHTML = `
    <div class="kv"><b>timestamp</b><span>${escapeHtml(r.timestamp || "—")}</span></div>
    <div class="kv"><b>findings</b><span>${findings.length}</span></div>
    <div class="kv"><b>mode</b><span>${escapeHtml(mode || "—")}</span></div>
    <div class="kv"><b>inIframe</b><span>${inIframe === null ? "—" : String(inIframe)}</span></div>
    <div class="kv"><b>href</b><span class="truncate mono" title="${escapeHtml(href)}">${escapeHtml(truncateMiddle(href, 120))}</span><button class="btn xs" type="button" data-copy-href="1" aria-label="Copy href">Copy</button></div>
    ${lists ? `<div class="kv"><b>lists</b><span>ul=${lists.ul} ol=${lists.ol} dl=${lists.dl}</span></div>` : ""}
    ${headingsCount !== null ? `<div class="kv"><b>headings</b><span>${headingsCount}</span></div>` : ""}
  `;

  // copy full href (URLs are truncated in UI)
  const hrefBtn = els.runSummary.querySelector('[data-copy-href="1"]');
  if (hrefBtn) {
    hrefBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      copyText(href);
      toast("Copied href");
    });
  }

  const c = countBySeverity(findings);
  els.sevBadges.innerHTML = `
    <span class="badge high" data-sev="high" tabindex="0" role="button" title="Filter explorer by severity">high: ${c.high}</span>
    <span class="badge medium" data-sev="medium" tabindex="0" role="button" title="Filter explorer by severity">medium: ${c.medium}</span>
    <span class="badge low" data-sev="low" tabindex="0" role="button" title="Filter explorer by severity">low: ${c.low}</span>
    <span class="badge info" data-sev="info" tabindex="0" role="button" title="Filter explorer by severity">info: ${c.info}</span>
  `;

  const topRaw = topFindings(findings, 30);
  const top = applySortState(topRaw, 'top');
  if (!top.length) {
    els.topTableBody.innerHTML = '<tr><td colspan="9"><div class="successState">&#x2714; No accessibility issues found</div></td></tr>';
    state.top = top;
    return;
  }
  els.topTableBody.innerHTML = top.map((f, idx) => `
    <tr data-idx="${idx}" class="trow" tabindex="0">
      <td><span class="pill ${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
      <td>${escapeHtml(f.product ?? "")}</td>
      <td>${escapeHtml(f.type ?? "")}</td>
      <td>${escapeHtml(f.wcag ?? "")}</td>
      <td>${cellHtml(f.name, 50)}</td>
      <td>${escapeHtml(f.role ?? "")}</td>
      <td>${escapeHtml(f.testId ?? "")}</td>
      <td>${cellHtml(f.note, 60)}</td>
      <td class="fixCol">${cellHtml(f.fix, 60)}</td>
    </tr>
  `).join("");
  state.top = top;
}

function buildOptionsFromFindings(findings, elSelect, key) {
  const vals = [...new Set(findings.map(f => f?.[key]).filter(Boolean))].sort();
  const current = elSelect.value;
  elSelect.innerHTML = `<option value="">All ${key === "product" ? "products" : "types"}</option>` +
    vals.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("");
  if (vals.includes(current)) elSelect.value = current;
}

function applyExplorerFilters(findings) {
  const q = (els.q.value || "").trim().toLowerCase();
  const sev = els.sev.value;
  const prod = els.prod.value;
  const type = els.type.value;
  const unique = !!els.unique.checked;

  let list = Array.isArray(findings) ? findings : [];
  if (sev) list = list.filter(f => f.severity === sev);
  if (prod) list = list.filter(f => f.product === prod);
  if (type) list = list.filter(f => f.type === type);

  if (q) {
    list = list.filter(f => {
      const blob = [f.type, f.name, f.testId, f.wcag, f.path, f.note, f.product]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }

  if (unique) {
    const seen = new Set();
    list = list.filter(f => {
      const h = hashFinding(f);
      if (seen.has(h)) return false;
      seen.add(h);
      return true;
    });
  }

  return list;
}

function renderContrast(res) {
  const raw = Array.isArray(res?.failures) ? res.failures : [];
  state.contrastData = raw;
  const failures = applySortState(raw, 'contrast');
  if (VT.contrast) {
    VT.contrast.setData(failures);
    return;
  }
  // fallback (should not happen)
  const tbody = els.contrastTbody;
  if (!tbody) return;
  tbody.innerHTML = failures.slice(0, 200).map((f) => `
    <tr class="trow" tabindex="0">
      <td>${escapeHtml(String(f.ratio ?? ""))}</td>
      <td>${escapeHtml(String(f.required ?? ""))}</td>
      <td>${f.largeText ? "yes" : "no"}</td>
      <td>${cellHtml(f.text, 50)}</td>
      <td>${escapeHtml(f.tag ?? "")}</td>
      <td>${escapeHtml(f.testId ?? "")}</td>
      <td>${cellHtml(f.path, 60)}</td>
      <td>${cellHtml(f.note, 50)}</td>
    </tr>
  `).join("");
}


function renderTabWalk(res) {
  const raw = Array.isArray(res?.events) ? res.events : [];
  state.tabData = raw;
  const events = applySortState(raw, 'tab');
  if (VT.tab) {
    VT.tab.setData(events);
    return;
  }
  // fallback (should not happen)
  const tbody = els.tabTbody;
  if (!tbody) return;
  tbody.innerHTML = events.slice(0, 200).map((e) => `
    <tr class="trow" tabindex="0">
      <td>${escapeHtml(String(e.i ?? ""))}</td>
      <td>${escapeHtml(String(e.type ?? ""))}</td>
      <td>${escapeHtml(String(e.tabIndex ?? ""))}</td>
      <td>${cellHtml(e.name, 50)}</td>
      <td>${cellHtml(e.path, 60)}</td>
      <td>${cellHtml(e.note, 50)}</td>
    </tr>
  `).join("");
}


function renderExplorer(findings) {
  const filtered = applySortState(applyExplorerFilters(findings), 'explorer');
  state.explorer = filtered;

  if (VT.all) {
    VT.all.setData(filtered);
  } else {
    // fallback
    els.allTableBody.innerHTML = filtered.slice(0, 200).map((f, idx) => `
      <tr class="trow" tabindex="0" data-i="${idx}">
        <td><span class="pill ${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
        <td>${escapeHtml(f.product ?? "")}</td>
        <td>${escapeHtml(f.type ?? "")}</td>
        <td>${escapeHtml(f.wcag ?? "")}</td>
        <td>${cellHtml(f.name, 50)}</td>
        <td>${escapeHtml(f.testId ?? "")}</td>
        <td>${cellHtml(f.path, 60)}</td>
        <td>${cellHtml(f.note, 50)}</td>
        <td class="fixCol">${cellHtml(f.fix, 50)}</td>
      </tr>
    `).join("");
  }

  els.summary.textContent = `filtered=${filtered.length} / total=${(findings || []).length}`;
}


function refreshInspectedUrl() {
  return new Promise(resolve => {
  chrome.devtools.inspectedWindow.eval("location.href", async (res, err) => {
    const url = err ? "" : String(res);
    els.inspectedUrl.textContent = err ? "(eval error)" : truncateMiddle(url, 120);
    els.inspectedUrl.title = err ? "(eval error)" : url;
    els.inspectedUrl.dataset.full = err ? "" : url;
    const env = detectEnv(url);
    const origin = originFrom(url);
    const detected = `${origin || "—"} • env=${env}`;
    els.brandEnv.textContent = detected;
    els.brandEnv.title = detected;
    els.brandEnv.dataset.full = detected;

    // load stored records for this origin/env
    const scopeKey = `records::${origin || ""}::${env}`;
    await loadRecords(scopeKey);
    // if we have records, render newest
    if (state.records.length) {
      state.currentId = state.records[0].id;
      renderRecord(state.records[0]);
    } else {
      updateViewSelect();
    }

    // load pinned frame preference for this origin
    if (origin) {
      const { pinnedFrames = {} } = await storageGet(["pinnedFrames"]);
      const pin = pinnedFrames[origin];
      if (pin?.frameId != null) {
        els.pinFrame.checked = true;
        // switch to manual for pinned
        els.target.value = "manual";
      } else {
        els.pinFrame.checked = false;
      }
    }
    resolve();
  });
  });
}

async function refreshFrames() {
  const r = await send({ type: "LIST_FRAMES" });
  const frames = r?.frames || [];

  els.frameSelect.innerHTML = "";
  for (const f of frames) {
    const opt = document.createElement("option");
    opt.value = String(f.frameId);
    const fullUrl = f.url || "(no url)";
    opt.textContent = `#${f.frameId} — ${truncateMiddle(fullUrl, 70)}`;
    opt.title = fullUrl;
    opt.dataset.fullUrl = fullUrl;
    els.frameSelect.appendChild(opt);
  }
  els.frameSelect.disabled = els.target.value !== "manual";
}

function getTargetSpec() {
  // pinned frame overrides everything
  if (els.pinFrame.checked && els.target.value !== "manual") {
    els.target.value = "manual";
  }

  const mode = els.target.value;
  if (mode === "manual") {
    const frameId = Number(els.frameSelect.value);
    return { mode, frameIds: Number.isFinite(frameId) ? [frameId] : [] };
  }
  return { mode };
}

function buildMatch() {
  const active = profileState.active;
  if (!active.length) return null;
  const urlIncludes = [];
  const domSelectorsAny = [];
  for (const id of active) {
    const p = profileState.profiles[id];
    if (!p?.frame) continue;
    if (p.frame.urlIncludes) urlIncludes.push(...p.frame.urlIncludes);
    if (p.frame.domSelectors) domSelectorsAny.push(...p.frame.domSelectors);
  }
  if (!urlIncludes.length && !domSelectorsAny.length) return null;
  return { urlIncludes, domSelectorsAny };
}

function buildModeHints() {
  const hints = {};
  for (const id of profileState.active) {
    const p = profileState.profiles[id];
    if (!p?.modeHints) continue;
    Object.assign(hints, p.modeHints);
  }
  return Object.keys(hints).length ? hints : null;
}

function buildAppMarkers() {
  const sels = [];
  for (const id of profileState.active) {
    const p = profileState.profiles[id];
    if (p?.frame?.domSelectors) sels.push(...p.frame.domSelectors);
  }
  return sels.length ? sels.join(", ") : null;
}

async function setPinnedFrameIfNeeded() {
  // stores selected frame for this origin
  const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
  const origin = originFrom(url);
  if (!origin) return;

  const { pinnedFrames = {} } = await storageGet(["pinnedFrames"]);
  if (els.pinFrame.checked) {
    pinnedFrames[origin] = { frameId: Number(els.frameSelect.value) };
  } else {
    delete pinnedFrames[origin];
  }
  await storageSet({ pinnedFrames });
}

async function highlightFinding(finding) {
  if (!finding) return;
  const frameId = state.bestFrameId ?? 0;
  await send({ type: "HIGHLIGHT", frameId, finding });
  toast("Highlighted element");
}

async function saveHistorySnapshot({ key, snapshot }) {
  const { history = {} } = await storageGet(["history"]);
  history[key] = snapshot;
  await storageSet({ history });
}

async function loadHistorySnapshot(key) {
  const { history = {} } = await storageGet(["history"]);
  return history[key] || null;
}

function diffSnapshots(prev, next) {
  if (!prev || !next) return { text: "(no previous)" };
  const prevSet = new Set(prev.findingHashes || []);
  const nextSet = new Set(next.findingHashes || []);

  let added = 0;
  let removed = 0;
  for (const h of nextSet) if (!prevSet.has(h)) added++;
  for (const h of prevSet) if (!nextSet.has(h)) removed++;

  const cPrev = prev.counts || { high:0, medium:0, low:0, info:0 };
  const cNext = next.counts || { high:0, medium:0, low:0, info:0 };

  const d = (k) => (cNext[k] || 0) - (cPrev[k] || 0);
  const fmt = (n) => (n > 0 ? `+${n}` : `${n}`);
  const text = `added=${added}, fixed=${removed} • high ${fmt(d("high"))}, medium ${fmt(d("medium"))}, low ${fmt(d("low"))}, info ${fmt(d("info"))}`;
  return { added, removed, text };
}

async function runAction(action, opts = {}) {
  els.summary.textContent = "Running…";
  els.usedFrames.textContent = "—";
  els.diff.textContent = "—";

  const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
  const envTag = `${originFrom(url) || "—"} • ${detectEnv(url)}`;

  const target = getTargetSpec();
  const match = buildMatch();

  // pinned frame: if checked, ensure we persist
  await setPinnedFrameIfNeeded();

  const r = await send({
    type: "RUN_AUDIT",
    action,
    target,
    match,
    modeHints: buildModeHints(),
    appMarkers: buildAppMarkers(),
    alsoConsole: !!els.alsoConsole.checked,
    wcagLevel: els.wcagLevel?.value || "2.1-AA",
    ...opts,
  });

  state.lastResult = r;
  els.json.textContent = pretty(r);

  // store result record for quick switching
  const url0 = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
  const scopeKey = `records::${originFrom(url0)}::${detectEnv(url0)}`;
  const rec = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    at: new Date().toISOString(),
    action,
    envTag,
    usedFrameIds: r?.usedFrameIds || [],
    best: r?.bestEntry || (r?.perFrame || []).find(x => x.ok) || null,
  };
  // newest first
  state.records = [rec, ...state.records.filter(x => String(x.id) !== String(rec.id))];
  state.byId[String(rec.id)] = rec;
  await persistRecords(scopeKey);
  renderRecord(rec);

  els.usedFrames.textContent = (r?.usedFrameIds || []).join(", ") || "—";
  els.summary.textContent = r?.perFrame ? summarizeFrames(r.perFrame) : "—";

  const bestEntry = rec.best || null;
  state.bestFrameId = bestEntry?.frameId ?? 0;

  const bestResult = bestEntry?.result || null;
  const findings = Array.isArray(bestResult?.findings) ? bestResult.findings : [];

  // History/diff (only if we have findings)
  const key = `snap::${originFrom(url)}::${detectEnv(url)}::${bestEntry?.frameUrl || ""}`;
  const prev = await loadHistorySnapshot(key);
  const snapshot = {
    at: new Date().toISOString(),
    envTag,
    counts: countBySeverity(findings),
    findingHashes: findings.map(hashFinding),
  };
  if (findings.length) {
    const d = diffSnapshots(prev, snapshot);
    els.diff.textContent = d.text;
    await saveHistorySnapshot({ key, snapshot });
  } else {
    els.diff.textContent = "(no findings snapshot)";
  }

  const _fc = findings.length;
  const _cc = bestResult?.failuresCount ?? bestResult?.failures?.length;
  const _ec = bestResult?.events?.length;
  const detail = _fc ? ` — ${_fc} findings` : _cc != null ? ` — ${_cc} failures` : _ec != null ? ` — ${_ec} events` : "";
  toast(`${action} done${detail}`);
}

// --- Presets ---
async function presetQuick() { await _lockedPreset(["run", "contrast"]); }
async function presetRelease() { await _lockedPreset(["watch", "observe", "run"]); }
async function presetFocus() { await _lockedPreset(["tabWalk", "run"]); }

// --- Export ---
async function copyMarkdown() {
  const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
  const envTag = `${originFrom(url) || "—"} • ${detectEnv(url)}`;
  const md = buildMarkdown({
    inspectedUrl: url,
    best: state.lastResult?.bestEntry ? { result: state.lastResult.bestEntry.result } : state.lastResult?.best,
    perFrame: state.lastResult?.perFrame,
    usedFrameIds: state.lastResult?.usedFrameIds,
    envTag,
  });
  await copyText(md);
  toast("Copied Markdown");
}


function applyDensity(isCompact) {
  document.body.classList.toggle("compact", !!isCompact);
}

function applyTheme(light) {
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
}

function setVersionBadge() {
  try {
    const badge = document.getElementById("versionBadge");
    if (!badge) return;
    const v = (__runtime && __runtime.getManifest) ? __runtime.getManifest().version : (badge.dataset.version || badge.textContent.replace(/^v/, ""));
    badge.dataset.version = v;
    badge.textContent = "v" + v;
  } catch {}
}

async function loadProfiles() {
  const { customProfiles = {}, activeProfiles } = await storageGet(["customProfiles", "activeProfiles"]);
  // Merge custom profiles into registry (custom override builtins with same id)
  profileState.profiles = { ...BUILTIN_PROFILES, ...customProfiles };
  if (Array.isArray(activeProfiles)) {
    profileState.active = activeProfiles.filter(id => id in profileState.profiles);
  }
  renderProfileSelect();
}

async function saveActiveProfiles() {
  await storageSet({ activeProfiles: profileState.active });
}

async function saveCustomProfiles() {
  const custom = {};
  for (const [id, p] of Object.entries(profileState.profiles)) {
    if (!(id in BUILTIN_PROFILES)) custom[id] = p;
  }
  await storageSet({ customProfiles: custom });
}

function renderProfileSelect() {
  if (!els.profileSelect) return;
  els.profileSelect.innerHTML = "";
  for (const [id, p] of Object.entries(profileState.profiles)) {
    const o = document.createElement("option");
    o.value = id;
    o.textContent = p.label || id;
    o.selected = profileState.active.includes(id);
    els.profileSelect.appendChild(o);
  }
}

async function loadUiPrefs() {
  const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
  const compact = !!uiPrefs.compact;
  if (els.density) els.density.checked = compact;
  applyDensity(compact);
  const light = uiPrefs.theme === "light" || (uiPrefs.theme == null && window.matchMedia("(prefers-color-scheme: light)").matches);
  if (els.themeToggle) els.themeToggle.checked = light;
  applyTheme(light);
  if (els.wcagLevel && uiPrefs.wcagLevel) els.wcagLevel.value = uiPrefs.wcagLevel;
  await loadProfiles();
}

// --- wire up ---
document.querySelectorAll("button[data-action]").forEach(btn => {
  btn.addEventListener("click", () => _lockedPreset([btn.dataset.action]));
});

els.refreshFrames.addEventListener("click", refreshFrames);
els.target.addEventListener("change", () => {
  els.frameSelect.disabled = els.target.value !== "manual";
});

if (els.profileSelect) {
  els.profileSelect.addEventListener("change", () => {
    profileState.active = [...els.profileSelect.selectedOptions].map(o => o.value);
    saveActiveProfiles();
  });
}


if (els.copyInspectedUrl) {
  els.copyInspectedUrl.addEventListener("click", async () => {
    const full = els.inspectedUrl?.dataset?.full || els.inspectedUrl?.textContent || "";
    const ok = await copyText(full);
    if (ok) toast("Copied inspected URL");
  });
}
if (els.copyDetected) {
  els.copyDetected.addEventListener("click", async () => {
    const full = els.brandEnv?.dataset?.full || els.brandEnv?.textContent || "";
    const ok = await copyText(full);
    if (ok) toast("Copied detected");
  });
}
if (els.copyFrameUrl) {
  els.copyFrameUrl.addEventListener("click", async () => {
    const selected = els.frameSelect.selectedOptions[0];
    const url = selected?.dataset?.fullUrl || selected?.title || "";
    if (!url || url === "(no url)") { toast("No URL to copy"); return; }
    const ok = await copyText(url);
    if (ok) toast("Copied frame URL");
  });
}

els.copyJson.addEventListener("click", async () => {
  await copyText(pretty(state.lastResult || {}));
  toast("Copied JSON");
});

els.downloadJson.addEventListener("click", () => {
  const data = pretty(state.lastResult || {});
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `a11yflowaudit-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("Downloaded JSON");
});

els.copyMd.addEventListener("click", copyMarkdown);

// --- Results view controls ---
if (els.viewSelect) {
  els.viewSelect.addEventListener("change", () => {
    const id = String(els.viewSelect.value || "");
    const rec = state.byId[id];
    if (rec) renderRecord(rec);
  });
}

async function switchToAction(action) {
  const rec = state.records.find(r => r.action === action);
  if (rec) return renderRecord(rec);
  toast(`No stored result for ${action} yet`);
}

if (els.viewRun) els.viewRun.addEventListener("click", () => switchToAction("run"));
if (els.viewContrast) els.viewContrast.addEventListener("click", () => switchToAction("contrast"));
if (els.viewTab) els.viewTab.addEventListener("click", () => switchToAction("tabWalk"));
if (els.viewWatch) els.viewWatch.addEventListener("click", () => switchToAction("watch"));
if (els.viewObserve) els.viewObserve.addEventListener("click", () => switchToAction("observe"));

if (els.clearHistory) {
  let _clearConfirm = null;
  els.clearHistory.addEventListener("click", async () => {
    if (_clearConfirm) {
      clearTimeout(_clearConfirm);
      _clearConfirm = null;
      els.clearHistory.textContent = "Clear";
      els.clearHistory.classList.remove("confirming");
      const url0 = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
      const scopeKey = `records::${originFrom(url0)}::${detectEnv(url0)}`;
      state.records = [];
      state.byId = {};
      state.currentId = null;
      await storageSet({ [scopeKey]: [] });
      updateViewSelect();
      toast("Cleared stored results");
    } else {
      els.clearHistory.textContent = "Confirm?";
      els.clearHistory.classList.add("confirming");
      _clearConfirm = setTimeout(() => {
        _clearConfirm = null;
        els.clearHistory.textContent = "Clear";
        els.clearHistory.classList.remove("confirming");
      }, 3000);
    }
  });
}


// --- Cell copy (capture phase to intercept before table row handlers) ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".cellCopy");
  if (!btn) return;
  e.stopPropagation();
  e.preventDefault();
  copyText(btn.dataset.copy || "");
  toast("Copied");
}, true);

// Keyboard navigation for table rows (Enter/Space to activate)
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr.trow");
  if (!tr) return;
  e.preventDefault();
  tr.click();
});

// --- DELEGATED_TABLE_CLICKS ---
if (els.topTableBody && !els.topTableBody.__bound) {
  els.topTableBody.__bound = true;
  els.topTableBody.__selected = null;
  els.topTableBody.addEventListener("click", async (e) => {
    try {
      const tr = e?.target?.closest ? e.target.closest("tr.trow") : null;
      if (!tr) return;

      if (els.topTableBody.__selected) els.topTableBody.__selected.classList.remove("isSelected");
      tr.classList.add("isSelected");
      els.topTableBody.__selected = tr;

      const idx = Number(tr.getAttribute("data-idx"));
      const finding = Number.isFinite(idx) ? state.top[idx] : null;
      if (!finding) return;

      await highlightFinding(finding);
    } catch (err) {
      console.warn("Top table click failed", err);
      toast("Could not highlight element");
    }
  });
}

if (els.allTableBody && !els.allTableBody.__bound) {
  els.allTableBody.__bound = true;
  els.allTableBody.__selected = null;
  els.allTableBody.addEventListener("click", async (e) => {
    try {
      const tr = e?.target?.closest ? e.target.closest("tr.trow") : null;
      if (!tr) return;

      if (els.allTableBody.__selected) els.allTableBody.__selected.classList.remove("isSelected");
      tr.classList.add("isSelected");
      els.allTableBody.__selected = tr;

      const idx = Number(tr.getAttribute("data-i"));
      const finding = Number.isFinite(idx) ? state.explorer[idx] : null;
      if (!finding) return;

      await highlightFinding(finding);
    } catch (err) {
      console.warn("Explorer table click failed", err);
      toast("Could not highlight element");
    }
  });
}

els.presetQuick.addEventListener("click", presetQuick);
els.presetRelease.addEventListener("click", presetRelease);
els.presetFocus.addEventListener("click", presetFocus);

// Clickable severity badges → filter explorer
els.sevBadges.addEventListener("click", (e) => {
  const badge = e.target.closest('.badge[data-sev]');
  if (!badge) return;
  els.sev.value = badge.dataset.sev;
  scheduleExplorerRender();
  const explorer = document.getElementById('explorerSection');
  if (explorer) explorer.scrollIntoView({ behavior: 'smooth', block: 'start' });
});
els.sevBadges.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" && e.key !== " ") return;
  const badge = e.target.closest('.badge[data-sev]');
  if (!badge) return;
  e.preventDefault();
  badge.click();
});

if (els.density) {
  els.density.addEventListener("change", async () => {
    const compact = !!els.density.checked;
    applyDensity(compact);
    const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
    uiPrefs.compact = compact;
    await storageSet({ uiPrefs });
  });
}

if (els.themeToggle) {
  els.themeToggle.addEventListener("change", async () => {
    const light = !!els.themeToggle.checked;
    applyTheme(light);
    const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
    uiPrefs.theme = light ? "light" : "dark";
    await storageSet({ uiPrefs });
  });
}

if (els.wcagLevel) {
  els.wcagLevel.addEventListener("change", async () => {
    const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
    uiPrefs.wcagLevel = els.wcagLevel.value;
    await storageSet({ uiPrefs });
  });
}


// Explorer reactive filters (debounced)
let __explorerT = null;
function scheduleExplorerRender() {
  clearTimeout(__explorerT);
  __explorerT = setTimeout(() => {
    renderExplorer(state.currentFindings);
  }, 120);
}

[els.q, els.sev, els.prod, els.type, els.unique].forEach(el => {
  el.addEventListener("input", scheduleExplorerRender);
  el.addEventListener("change", scheduleExplorerRender);
});

// keyboard shortcuts (while panel focused)
window.addEventListener("keydown", (e) => {
  if (state.running) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && (e.target.matches("input,select,textarea") || e.target.isContentEditable)) return;
  const actions = { r: "run", o: "observe", w: "watch", t: "tabWalk", c: "contrast" };
  const action = actions[(e.key || "").toLowerCase()];
  if (action) _lockedPreset([action]);
});


// --- Column visibility ---
const TABLE_COLS = {
  topTable: ['sev', 'product', 'type', 'wcag', 'name', 'role', 'testId', 'note', 'fix'],
  allTable: ['sev', 'product', 'type', 'wcag', 'name', 'testId', 'path', 'note', 'fix'],
  contrastTable: ['ratio', 'req', 'large', 'text', 'tag', 'testId', 'path', 'note'],
  tabTable: ['i', 'type', 'tabIndex', 'name', 'path', 'note'],
};

const colVisibility = {};
const colStyleEl = document.createElement('style');
colStyleEl.id = 'colToggleStyles';
document.head.appendChild(colStyleEl);

function applyColStyles() {
  const rules = [];
  for (const [tableId, cols] of Object.entries(colVisibility)) {
    for (const [idx, visible] of Object.entries(cols)) {
      if (visible === false) {
        const n = Number(idx) + 1;
        rules.push(`#${tableId} th:nth-child(${n}), #${tableId} td:nth-child(${n}) { display: none; }`);
      }
    }
  }
  colStyleEl.textContent = rules.join('\n');
}

function isColVisible(tableId, colIdx) {
  return colVisibility[tableId]?.[colIdx] !== false;
}

function toggleColVisibility(tableId, colIdx) {
  if (!colVisibility[tableId]) colVisibility[tableId] = {};
  colVisibility[tableId][colIdx] = !isColVisible(tableId, colIdx) ? true : false;
  if (colVisibility[tableId][colIdx] === true) delete colVisibility[tableId][colIdx];
  if (Object.keys(colVisibility[tableId]).length === 0) delete colVisibility[tableId];
  applyColStyles();
  storageSet({ colPrefs: colVisibility });
}

function createColToggle(tableId, parentEl) {
  const cols = TABLE_COLS[tableId];
  if (!cols || !parentEl) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'colToggle';

  const btn = document.createElement('button');
  btn.className = 'btn xs';
  btn.type = 'button';
  btn.textContent = 'Columns';
  btn.setAttribute('aria-expanded', 'false');

  const dropdown = document.createElement('div');
  dropdown.className = 'colDropdown';
  dropdown.hidden = true;

  cols.forEach((name, idx) => {
    const label = document.createElement('label');
    label.className = 'colOption';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isColVisible(tableId, idx);
    cb.addEventListener('change', () => {
      toggleColVisibility(tableId, idx);
      cb.checked = isColVisible(tableId, idx);
    });
    label.appendChild(cb);
    label.appendChild(document.createTextNode(' ' + name));
    dropdown.appendChild(label);
  });

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    // Close any other open dropdowns first
    document.querySelectorAll('.colDropdown').forEach(d => { d.hidden = true; });
    document.querySelectorAll('.colToggle .btn').forEach(b => { b.setAttribute('aria-expanded', 'false'); });
    if (!isOpen) {
      dropdown.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
    }
  });

  dropdown.addEventListener('click', (e) => e.stopPropagation());

  wrapper.appendChild(btn);
  wrapper.appendChild(dropdown);
  parentEl.appendChild(wrapper);
}

// Close column dropdowns on outside click
document.addEventListener('click', () => {
  document.querySelectorAll('.colDropdown').forEach(d => { d.hidden = true; });
  document.querySelectorAll('.colToggle .btn').forEach(b => { b.setAttribute('aria-expanded', 'false'); });
});

function initColToggles() {
  // Load saved prefs then set up toggles
  storageGet(['colPrefs']).then(({ colPrefs = {} }) => {
    Object.assign(colVisibility, colPrefs);
    applyColStyles();

    const placements = [
      { tableId: 'topTable', selector: '#findingsSection .tableTitle' },
      { tableId: 'allTable', selector: '#explorerSection .cardTitle' },
      { tableId: 'contrastTable', selector: '#contrastSection .tableTitle' },
      { tableId: 'tabTable', selector: '#tabWalkSection .tableTitle' },
    ];

    for (const p of placements) {
      const el = document.querySelector(p.selector);
      if (el) createColToggle(p.tableId, el);
    }
  });
}

function initSortableHeaders() {
  const tables = [
    {
      id: 'top',
      thead: document.querySelector('#topTable thead'),
      render: () => {
        const findings = state.currentFindings;
        const topRaw = topFindings(findings, 30);
        const top = applySortState(topRaw, 'top');
        if (!top.length) return;
        els.topTableBody.innerHTML = top.map((f, idx) => `
          <tr data-idx="${idx}" class="trow" tabindex="0">
            <td><span class="pill ${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
            <td>${escapeHtml(f.product ?? "")}</td>
            <td>${escapeHtml(f.type ?? "")}</td>
            <td>${escapeHtml(f.wcag ?? "")}</td>
            <td>${cellHtml(f.name, 50)}</td>
            <td>${escapeHtml(f.role ?? "")}</td>
            <td>${escapeHtml(f.testId ?? "")}</td>
            <td>${cellHtml(f.note, 60)}</td>
            <td class="fixCol">${cellHtml(f.fix, 60)}</td>
          </tr>
        `).join("");
        state.top = top;
      },
    },
    {
      id: 'explorer',
      thead: document.querySelector('#allTable thead'),
      render: () => renderExplorer(state.currentFindings),
    },
    {
      id: 'contrast',
      thead: document.querySelector('#contrastTable thead'),
      render: () => {
        const sorted = applySortState(state.contrastData, 'contrast');
        if (VT.contrast) VT.contrast.setData(sorted);
      },
    },
    {
      id: 'tab',
      thead: document.querySelector('#tabTable thead'),
      render: () => {
        const sorted = applySortState(state.tabData, 'tab');
        if (VT.tab) VT.tab.setData(sorted);
      },
    },
  ];

  for (const t of tables) {
    if (!t.thead) continue;
    const ths = t.thead.querySelectorAll('th');
    ths.forEach((th, idx) => {
      th.classList.add('sortable');
      th.setAttribute('tabindex', '0');
      th.setAttribute('aria-sort', 'none');
      th.addEventListener('click', () => {
        toggleSort(t.id, idx, t.thead);
        t.render();
      });
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSort(t.id, idx, t.thead);
          t.render();
        }
      });
    });
  }
}

function initVirtualTables() {
  // All findings (potentially very large)
  const allWrap = document.querySelector("#allTable")?.closest?.(".tableWrap");
  if (allWrap && els.allTableBody && !VT.all) {
    VT.all = new VirtualTable({
      wrapEl: allWrap,
      tbodyEl: els.allTableBody,
      colCount: 9,
      rowRenderer: (f, idx) => `
        <tr class="trow" tabindex="0" data-i="${idx}">
          <td><span class="pill ${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
          <td>${escapeHtml(f.product ?? "")}</td>
          <td>${escapeHtml(f.type ?? "")}</td>
          <td>${escapeHtml(f.wcag ?? "")}</td>
          <td>${cellHtml(f.name, 50)}</td>
          <td>${escapeHtml(f.testId ?? "")}</td>
          <td>${cellHtml(f.path, 60)}</td>
          <td>${cellHtml(f.note, 50)}</td>
          <td class="fixCol">${cellHtml(f.fix, 50)}</td>
        </tr>
      `,
      estimateRowHeight: 33,
      overscan: 12,
    });
  }

  // Contrast failures
  const contrastWrap = document.querySelector("#contrastTable")?.closest?.(".tableWrap");
  if (contrastWrap && els.contrastTbody && !VT.contrast) {
    VT.contrast = new VirtualTable({
      wrapEl: contrastWrap,
      tbodyEl: els.contrastTbody,
      colCount: 8,
      rowRenderer: (f) => `
        <tr class="trow" tabindex="0">
          <td>${escapeHtml(String(f.ratio ?? ""))}</td>
          <td>${escapeHtml(String(f.required ?? ""))}</td>
          <td>${f.largeText ? "yes" : "no"}</td>
          <td>${cellHtml(f.text, 50)}</td>
          <td>${escapeHtml(f.tag ?? "")}</td>
          <td>${escapeHtml(f.testId ?? "")}</td>
          <td>${cellHtml(f.path, 60)}</td>
          <td>${cellHtml(f.note, 50)}</td>
        </tr>
      `,
      estimateRowHeight: 33,
      overscan: 10,
    });
  }

  // TabWalk events
  const tabWrap = document.querySelector("#tabTable")?.closest?.(".tableWrap");
  if (tabWrap && els.tabTbody && !VT.tab) {
    VT.tab = new VirtualTable({
      wrapEl: tabWrap,
      tbodyEl: els.tabTbody,
      colCount: 6,
      rowRenderer: (e) => `
        <tr class="trow" tabindex="0">
          <td>${escapeHtml(String(e.i ?? ""))}</td>
          <td>${escapeHtml(String(e.type ?? ""))}</td>
          <td>${escapeHtml(String(e.tabIndex ?? ""))}</td>
          <td>${cellHtml(e.name, 50)}</td>
          <td>${cellHtml(e.path, 60)}</td>
          <td>${cellHtml(e.note, 50)}</td>
        </tr>
      `,
      estimateRowHeight: 33,
      overscan: 10,
    });
  }
}


// auto refresh on navigation
chrome.devtools.network.onNavigated.addListener(() => {
  refreshInspectedUrl();
  refreshFrames();
  toast("Navigated — refreshed frames");
});

// JSON toggle
const _jsonToggle = document.getElementById('jsonToggle');
if (_jsonToggle) {
  _jsonToggle.addEventListener('click', () => {
    const expanded = _jsonToggle.getAttribute('aria-expanded') === 'true';
    _jsonToggle.setAttribute('aria-expanded', String(!expanded));
    els.json.classList.toggle('collapsed', expanded);
  });
}

// initial
initVirtualTables();
initSortableHeaders();
initColToggles();
refreshInspectedUrl();
refreshFrames();
setVersionBadge();
loadUiPrefs();

if (!hasRuntime()) {
  toast("Runtime API missing — try reopening DevTools after reloading extension");
}

