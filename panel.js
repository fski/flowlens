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
  frameSelectWrap: document.getElementById("frameSelectWrap"),
  copyFrameUrl: document.getElementById("copyFrameUrl"),
  profileSelect: document.getElementById("profileSelect"),
  alsoConsole: document.getElementById("alsoConsole"),
  pinFrame: document.getElementById("pinFrame"),
  density: document.getElementById("density"),
  themeToggle: document.getElementById("themeToggle"),
  wcagLevel: document.getElementById("wcagLevel"),
  targetingSummary: document.getElementById("targetingSummary"),

  exportAnchor: document.getElementById("exportAnchor"),
  exportToggle: document.getElementById("exportToggle"),
  exportMenu: document.getElementById("exportMenu"),
  copyJson: document.getElementById("copyJson"),
  downloadJson: document.getElementById("downloadJson"),
  copyMd: document.getElementById("copyMd"),
  sessionExportMenuLabel: document.getElementById("sessionExportMenuLabel"),
  exportSessionJsonMenu: document.getElementById("exportSessionJsonMenu"),
  exportSessionMdMenu: document.getElementById("exportSessionMdMenu"),
  copyMdHint: document.getElementById("copyMdHint"),
  sessionStart: document.getElementById("sessionStart"),
  sessionMark: document.getElementById("sessionMark"),
  sessionEnd: document.getElementById("sessionEnd"),
  lastStatusLine: document.getElementById("lastStatusLine"),

  runCurrentMode: document.getElementById("runCurrentMode"),

  json: document.getElementById("json"),
  inspectedUrl: document.getElementById("inspectedUrl"),
  brandEnv: document.getElementById("brandEnv"),
  usedFrames: document.getElementById("usedFrames"),
  diff: document.getElementById("diff"),

  sevTabs: document.getElementById("sevTabs"),
  emptyState: document.getElementById("emptyState"),
  resultsZone: document.getElementById("resultsZone"),

  // explorer
  q: document.getElementById("q"),
  allTableBody: document.querySelector("#allTable tbody"),

  toast: document.getElementById("toast"),
  runIcon: document.getElementById("runIcon"),
  runLabel: document.getElementById("runLabel"),
  runTimer: document.getElementById("runTimer"),
  progressWrap: document.getElementById("progressWrap"),
  progressBar: document.getElementById("progressBar"),
  progressLabel: document.getElementById("progressLabel"),
  progressTime: document.getElementById("progressTime"),
  progressStatus: document.getElementById("progressStatus"),
  contrastSection: document.getElementById("contrastSection"),
  contrastTbody: document.querySelector("#contrastTable tbody"),
  tabWalkSection: document.getElementById("tabWalkSection"),
  tabTbody: document.querySelector("#tabTable tbody"),
  contrastQ: document.getElementById("contrastQ"),
  tabWalkQ: document.getElementById("tabWalkQ"),
  copyJsonRaw: document.getElementById("copyJsonRaw"),

  // new tab shell elements
  snapContent: document.getElementById("snapContent"),
  flowContent: document.getElementById("flowContent"),
  settingsContent: document.getElementById("settingsContent"),
  snapHelper: document.getElementById("snapHelper"),
  flowRecordingBanner: document.getElementById("flowRecordingBanner"),
  flowRecordActions: document.getElementById("flowRecordActions"),
  flowSessionInfoBody: document.getElementById("flowSessionInfoBody"),
  flowTimelineBody: document.getElementById("flowTimelineBody"),
  watchSection: document.getElementById("watchSection"),
  watchSummary: document.getElementById("watchSummary"),
  watchVerdicts: document.getElementById("watchVerdicts"),
  watchTbody: document.querySelector("#watchTable tbody"),
  flowLabelInput: document.getElementById("flowLabelInput"),
  flowLabelField: document.getElementById("flowLabelField"),
  flowLabelSave: document.getElementById("flowLabelSave"),
  flowLabelSkip: document.getElementById("flowLabelSkip"),
  flowVerdict: document.getElementById("flowVerdict"),
  autoCaptureNav: document.getElementById("autoCaptureNav"),
  autoCaptureDelay: document.getElementById("autoCaptureDelay"),
};

const ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const SEV_LIST = ["critical", "high", "medium", "low", "info"];
const SEV_COLORS = {
  critical: "#DB5A5A", high: "#D4864E", medium: "#C4A855",
  low: "#5AB89A", info: "#7A8EA6",
};

const state = {
  explorer: [],
  records: [],
  byId: {},
  currentId: null,
  currentFindings: [],
  lastResult: null,
  bestFrameId: 0,
  _toastTimer: null,
  running: false,
  _progressInterval: null,
  _progressStartedAt: 0,
  contrastData: [],
  contrastSamples: [],
  tabData: [],
  activeMode: "run",
  sevFilter: new Set(),
  findingsByMode: {},
  contrastFilter: "all",
  hasRun: false,
  topTab: "snap",
  pinnedFrameId: null,
  lastDiffSummary: "—",
  lastUsedFramesSummary: "—",
  lastPersistentStatus: { status: "IDLE", reason: "-", detail: "" },
  lastSelectionReason: "—",
  hasPersistentStatus: false,
};

/**
 * @typedef {"strict"|"heuristic"|"advisory"} Confidence
 * @typedef {"run"|"contrast"|"tabWalk"|"watch"|"observe"} Mode
 * @typedef {string} FrameKey
 */

const TAB_BLOCKING_TYPES = new Set([
  "possible_focus_trap",
  "non_dialog_focus_trap",
  "roach_motel",
  "dialog_focus_not_trapped",
  "focus_on_body",
  "focus_failed",
]);

const DEBUG_SESSION = false;
const MAX_STEPS = 100;
const MAX_RAW_APPENDIX_ENTRIES = MAX_STEPS * 2;
const RAW_SOFT_COMPACT_KEEP_RECENT = 30;
const MAX_SESSION_BYTES_ESTIMATE = 4_500_000;
const CAPTURE_SLOW_MS = 4000;

const MODE_LABELS = {
  run: "Audit",
  contrast: "Contrast",
  tabWalk: "Tab\u00A0Walk",
  watch: "Watch",
  observe: "Observe",
};


const SCOPE_LABELS = {
  primary: "Primary frame",
  host: "Host page only",
  embedded: "Embedded frame only",
  all: "All frames",
};

const SCOPE_SUMMARY_LABELS = {
  primary: "Primary frame",
  host: "Host page",
  embedded: "Embedded",
  all: "All frames",
};

const SCOPE_TOOLTIPS = {
  primary: "Scan only the most relevant frame detected on this page.",
  host: "Scan the top-level page and ignore embedded frames.",
  embedded: "Scan a detected or selected embedded frame and ignore the host page.",
  all: "Scan the host page and all embedded frames.",
};

const MARK_REASON_DETAILS = {
  "-": "baseline recorded",
  "baseline:parse": "baseline payload was not parseable",
  "baseline:ok:false": "baseline run failed",
  "baseline:no_scope_match": "baseline failed: selected scope did not match any frame",
  "baseline:transport": "baseline capture transport failed",
  "active:ok:false": "baseline recorded, active mode failed",
  "active:no_scope_match": "baseline recorded, active mode scope did not match any frame",
  "active:parse": "baseline recorded, active mode payload was not parseable",
  "active:transport": "baseline recorded, active mode transport failed",
  "persist:quota": "captured in-memory, storage quota reached",
  "persist:error": "captured in-memory, storage write failed",
  "raw:capped": "captured with normalized data only (raw capped)",
  "session:limit": "mark-step blocked by session step limit",
};

const sessionState = {
  current: null,
  inFlight: false,
  lastArchiveId: null,
  lastEndedSession: null,
  lastMarkStep: null,
  captureSlowTimer: null,
  captureSlow: false,
  lastPersistReasonCode: "-",
  hudTimer: null,
  expandedStepIndex: null,
  autoCapturePending: null,
  lastAutoNavUrl: null,
  queuedCapture: null,
};

function debugSession(...args) {
  if (!DEBUG_SESSION) return;
  console.debug("[FlowLensSession]", ...args);
}

// --- MFE Profile Registry ---
// Each profile defines detection heuristics for one microfrontend product.
// Adding a new MFE = adding a new object here (or via custom profiles in storage).
const BUILTIN_PROFILES = {
  helpcenter: {
    label: "Help Center",
    description: "Targets Help Center iframes — adds tree, article and bot-specific WCAG checks",
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
    description: "Targets chat widgets — adds role=log, message boundary and input label checks",
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
  explorer: { col: null, dir: 'asc' },
  contrast: { col: null, dir: 'asc' },
  tab: { col: null, dir: 'asc' },
};

const SORT_KEYS = {
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
    const primary = (typeof va === 'number' && typeof vb === 'number')
      ? (va - vb)
      : String(va).localeCompare(String(vb));
    if (primary !== 0) return primary;
    if (tableId === "explorer") {
      const ah = hashFinding(a);
      const bh = hashFinding(b);
      if (ah !== bh) return ah.localeCompare(bh);
      return String(a?.wcag || "").localeCompare(String(b?.wcag || ""))
        || String(a?.name || "").localeCompare(String(b?.name || ""));
    }
    return 0;
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
    this.selectedIdx = null;

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
    this.selectedIdx = null;
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

      // Re-apply selection highlight after render
      if (this.selectedIdx != null) {
        const sel = this.tbodyEl.querySelector(`tr[data-i="${this.selectedIdx}"]`);
        if (sel) sel.classList.add("isSelected");
      }

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
const PROGRESS_LABELS = {
  run: "Scanning…",
  contrast: "Checking contrast…",
  tabWalk: "Walking focusables…",
  watch: "Monitoring…",
  observe: "Observing…",
};

function setProgressA11y(bar, percent, valueText) {
  if (!bar) return;
  const p = Math.max(0, Math.min(100, Number(percent) || 0));
  bar.setAttribute("aria-valuenow", String(Math.round(p)));
  bar.setAttribute("aria-valuetext", String(valueText || `${Math.round(p)}%`));
}

function showProgress(action, durationSec) {
  const wrap = els.progressWrap;
  const bar = els.progressBar;
  const label = els.progressLabel;
  const time = els.progressTime;
  const status = els.progressStatus;
  if (!wrap || !bar) return;
  const isObserve = action === "observe";
  // Observe uses inline CTA timer — hide the separate progress panel
  if (isObserve) {
    wrap.hidden = true;
  } else {
    wrap.hidden = false;
    wrap.classList.add("active");
    wrap.setAttribute("aria-busy", "true");
  }
  state._progressStartedAt = performance.now();
  if (!isObserve) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
    bar.offsetWidth;
    bar.style.transition = `width ${durationSec}s linear`;
    bar.style.width = '100%';
  }
  const prefix = PROGRESS_LABELS[action] || "Running";
  let remaining = durationSec;
  if (!isObserve && label) label.textContent = `${prefix}`;
  if (!isObserve && time) time.textContent = "0.0s";
  if (status) status.textContent = `${prefix}, ${remaining} seconds remaining`;
  setProgressA11y(bar, 0, `${remaining}s remaining`);
  // Seed the inline CTA timer for observe
  if (isObserve && els.runTimer) els.runTimer.textContent = `${durationSec}s`;
  clearInterval(state._progressInterval);
  state._progressInterval = setInterval(() => {
    const elapsed = Math.max(0, (performance.now() - state._progressStartedAt) / 1000);
    remaining--;
    const pct = durationSec > 0 ? ((durationSec - Math.max(remaining, 0)) / durationSec) * 100 : 100;
    if (!isObserve && time) time.textContent = `${elapsed.toFixed(1)}s`;
    // Update inline CTA timer for observe
    if (isObserve && els.runTimer) {
      els.runTimer.textContent = remaining > 0 ? `${Math.max(remaining, 0)}s` : "\u2026";
    }
    if (remaining <= 0) {
      clearInterval(state._progressInterval);
      if (!isObserve && label) label.textContent = `${prefix} \u2022 finishing\u2026`;
      if (status) status.textContent = `${prefix}, finishing`;
      setProgressA11y(bar, pct, "finishing");
    } else {
      if (status) status.textContent = `${prefix}, ${remaining} seconds remaining`;
      setProgressA11y(bar, pct, `${remaining}s remaining`);
    }
  }, 1000);
}

function hideProgress() {
  clearInterval(state._progressInterval);
  const wrap = els.progressWrap;
  const bar = els.progressBar;
  if (wrap) {
    wrap.hidden = true;
    wrap.classList.remove("active");
    wrap.setAttribute("aria-busy", "false");
  }
  if (els.progressLabel) els.progressLabel.textContent = "";
  if (els.progressTime) els.progressTime.textContent = "";
  if (els.progressStatus) els.progressStatus.textContent = "Audit idle";
  if (bar) {
    bar.style.transition = 'none';
    bar.style.width = '0%';
    setProgressA11y(bar, 0, "0%");
  }
}

function scrollToResults(action) {
  let el;
  if (action === 'contrast') el = document.getElementById('contrastSection');
  else if (action === 'tabWalk') el = document.getElementById('tabWalkSection');
  else if (action === 'run') el = document.getElementById('explorerSection');
  else el = document.getElementById('runSummary');
  if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

async function _runSingle(action, opts) {
  const btn = document.querySelector(`[data-action="${action}"]`);
  if (btn) btn.classList.add('running');
  showProgress(action, DURATIONS[action] || 2);
  try {
    return await runAction(action, opts);
  } finally {
    if (btn) btn.classList.remove('running');
    hideProgress();
  }
}

function setRunButtonBusy(busy) {
  if (!els.runCurrentMode) return;
  els.runCurrentMode.classList.toggle("running", !!busy);
  els.runCurrentMode.classList.toggle("busy", !!busy);
  const isObserve = state.activeMode === "observe";
  if (els.runIcon) {
    els.runIcon.textContent = busy ? "" : "\u25B6";
    if (busy) els.runIcon.hidden = true;
    else els.runIcon.hidden = false;
  }
  if (els.runTimer) {
    els.runTimer.hidden = !(busy && isObserve);
    if (!busy) els.runTimer.textContent = "";
  }
  if (els.runLabel) {
    if (busy) {
      const busyLabels = { run: "Running\u2026", contrast: "Checking\u2026", tabWalk: "Walking\u2026", observe: "Observing\u2026", watch: "Watching\u2026" };
      els.runLabel.textContent = busyLabels[state.activeMode] || "Running\u2026";
    } else {
      const cta = SNAP_CTA[state.activeMode] || SNAP_CTA.run;
      els.runLabel.textContent = cta.label;
    }
  }
}

async function _lockedPreset(actions) {
  if (state.running) return;
  if (sessionState.inFlight) {
    toast("Step capture in progress");
    return;
  }
  state.running = true;
  let lastSuccessAction = null;
  setRunButtonBusy(true);
  try {
    for (const a of actions) {
      setPressed(a);
      const ok = await _runSingle(a);
      if (!ok) break;
      lastSuccessAction = a;
    }
    if (lastSuccessAction) scrollToResults(lastSuccessAction);
  } finally {
    state.running = false;
    setRunButtonBusy(false);
  }
}


function exportMenuItems() {
  if (!els.exportMenu) return [];
  return [...els.exportMenu.querySelectorAll(".emItem")].filter(item => !item.hidden);
}

function setExportMenuOpen(open, { restoreFocus = false } = {}) {
  if (!els.exportMenu || !els.exportToggle) return;
  const isOpen = !!open;
  els.exportMenu.hidden = !isOpen;
  els.exportMenu.classList.toggle("open", isOpen);
  els.exportToggle.setAttribute("aria-expanded", String(isOpen));
  if (!isOpen && restoreFocus) els.exportToggle.focus();
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

function modeLabel(mode) {
  return MODE_LABELS[mode] || String(mode || "run");
}


function countBySeverity(findings = []) {
  const out = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) out[f.severity] = (out[f.severity] || 0) + 1;
  return out;
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
  if (action) state.activeMode = action;
  // Update snap subtab buttons aria-selected (new tab semantics)
  document.querySelectorAll("#snapSubTabBar button[data-action]").forEach(btn => {
    const selected = btn.dataset.action === (state.activeMode || "run");
    btn.setAttribute("aria-selected", String(selected));
    btn.setAttribute("tabindex", selected ? "0" : "-1");
    btn.classList.toggle("active", selected);
  });
  // Update CTA button label + color
  updateSnapCta(state.activeMode || "run");
}

const SNAP_CTA = {
  run:      { label: "Run Audit",      cls: "ctaBtn--amber", helper: "Perform a strict WCAG Audit" },
  contrast: { label: "Check Contrast", cls: "ctaBtn--cyan",  helper: "Check contrast on up to 250 text nodes" },
  tabWalk:  { label: "Run Tab\u00A0Walk",   cls: "ctaBtn--lime",  helper: "Walk 80 focusable elements" },
  observe:  { label: "Start Observe",  cls: "ctaBtn--teal",  helper: "Re-run WCAG check every ~1s for 12s" },
  watch:    { label: "Start Watch",    cls: "ctaBtn--mint",   helper: "Monitor loaders and focus bar for 40s" },
};

function updateSnapCta(mode) {
  const cta = SNAP_CTA[mode] || SNAP_CTA.run;
  let label = cta.label;
  if (mode === "run" && state.hasRun) label = "Re-run Audit";
  if (els.runLabel) els.runLabel.textContent = label;
  if (els.runCurrentMode) {
    els.runCurrentMode.className = "ctaBtn " + cta.cls;
  }
  if (els.snapHelper) els.snapHelper.textContent = cta.helper;
}

function showMode(mode) {
  const explorer = document.getElementById("explorerSection");
  const contrast = document.getElementById("contrastSection");
  const tab = document.getElementById("tabWalkSection");
  const watch = els.watchSection;
  const runLike = mode === "run" || mode === "observe";
  if (explorer) explorer.hidden = !runLike;
  if (contrast) contrast.hidden = mode !== "contrast";
  if (tab) tab.hidden = mode !== "tabWalk";
  if (watch) watch.hidden = mode !== "watch";
  if (els.sevTabs) els.sevTabs.hidden = !(runLike || mode === "contrast");

  // Restore cached findings when switching between run/observe
  if (runLike && state.findingsByMode[mode]) {
    state.currentFindings = state.findingsByMode[mode];
    renderSevTabs(state.currentFindings);
    renderExplorer(state.currentFindings);
  } else if (runLike) {
    renderSevTabs();
  }

  // Render contrast-specific tabs when switching to contrast
  if (mode === "contrast") {
    renderContrastSevTabs();
  }
}

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
    `<button class="sevTab" role="tab" data-sev="${sev}" aria-selected="${active}" tabindex="${active ? 0 : -1}" type="button">
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

  const compactContrastRow = (row, maxLen) => {
    if (!row || typeof row !== "object") return row;
    return {
      ratio: row.ratio,
      required: row.required,
      largeText: !!row.largeText,
      text: truncateString(row.text ?? "", Math.min(maxLen, 120)),
      tag: truncateString(row.tag ?? "", 24),
      testId: truncateString(row.testId ?? "", Math.min(maxLen, 96)),
      path: truncateString(row.path ?? "", Math.min(maxLen, 140)),
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
    if (Array.isArray(result.findings)) out.findings = compactRows(result.findings, limits.findings, limits.maxString);
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
      return true;
    } catch (err) {
      lastErr = err;
      console.warn(`persistRecords attempt ${i + 1} failed`, { bytes: estimateJsonBytes(compacted), err });
    }
  }

  console.error("persistRecords failed", lastErr);
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
  state.hasRun = true;
  setPressed(rec.action);
  updateResultsVisibility(true);
  resetFilters();

  const bestResult = rec?.best?.result || null;
  const mode = rec.action;

  // default reset
  els.allTableBody.innerHTML = "";
  state.currentFindings = [];
  if (mode !== "contrast") renderSevTabs();
  showMode(mode);

  if (mode === "run") {
    renderRunSummary(bestResult, rec);
    const findings = Array.isArray(bestResult?.findings) ? bestResult.findings : [];
    state.currentFindings = findings;
    state.findingsByMode.run = findings;
    renderExplorer(findings);
  } else if (mode === "contrast") {
    state.contrastFilter = "all";
    renderContrast(bestResult);
    renderContrastSevTabs();
  } else if (mode === "tabWalk") {
    renderSevTabs();
    renderTabWalk(bestResult);
  } else if (mode === "observe" && bestResult) {
    const oFindings = Array.isArray(bestResult.findings) ? bestResult.findings : [];
    if (oFindings.length) {
      renderSevTabs(oFindings);
      state.currentFindings = oFindings;
      state.findingsByMode.observe = oFindings;
      showMode("observe");
      renderExplorer(oFindings);
    } else {
      renderSevTabs();
    }
  } else if (mode === "watch" && bestResult) {
    renderWatch(bestResult);
  } else {
    renderSevTabs();
  }
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
  if (msg.includes("quota") || msg.includes("max write") || msg.includes("exceeded")) return "persist:quota";
  return "persist:error";
}

function reasonDetail(reasonCode) {
  return MARK_REASON_DETAILS[reasonCode] || "status recorded";
}

function normalizeReasonLabel(reasonCode = "-") {
  const code = String(reasonCode || "-").toLowerCase();
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

function normalizeLoadedSession(session) {
  if (!session || typeof session !== "object") return null;
  const out = { ...session };
  out.schemaVersion = asNumber(out.schemaVersion, 1);
  out.signatureVersion = asNumber(out.signatureVersion, 1);
  out.frameKeyVersion = asNumber(out.frameKeyVersion, 1);
  if (!out.rawAppendix || typeof out.rawAppendix !== "object") out.rawAppendix = {};
  if (!Array.isArray(out.steps)) out.steps = [];
  for (const step of out.steps) {
    if (!step || typeof step !== "object") continue;
    if (!step.snapshots || typeof step.snapshots !== "object") step.snapshots = { run: null, active: null };
    if (step.snapshots.run && !step.snapshots.run.targeting) step.snapshots.run.targeting = null;
    if (step.snapshots.active && !step.snapshots.active.targeting) step.snapshots.active.targeting = null;
  }
  if (!out.frames || typeof out.frames !== "object") out.frames = { frameKeys: [], frameKeyToLastFrameId: {} };
  if (!Array.isArray(out.frames.frameKeys)) out.frames.frameKeys = [];
  if (!out.frames.frameKeyToLastFrameId || typeof out.frames.frameKeyToLastFrameId !== "object") out.frames.frameKeyToLastFrameId = {};
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
  if (hasSession && !sessionState.hudTimer) {
    sessionState.hudTimer = window.setInterval(() => {
      if (!sessionState.current) return;
      renderSessionHud();
    }, 1000);
    return;
  }
  if (!hasSession && sessionState.hudTimer) {
    window.clearInterval(sessionState.hudTimer);
    sessionState.hudTimer = null;
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
    body.innerHTML = '<p class="placeholderText">No session data yet</p>';
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

function renderFlowTimeline() {
  const body = els.flowTimelineBody;
  if (!body) return;
  const sess = sessionState.current || sessionState.lastEndedSession;
  const steps = Array.isArray(sess?.steps) ? sess.steps : [];
  const tbody = body.querySelector("tbody");
  if (!tbody) return;
  if (!steps.length) {
    sessionState.expandedStepIndex = null;
    tbody.innerHTML = "";
    return;
  }
  tbody.innerHTML = steps.map(s => {
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
    return `<tr class="trow" data-step-index="${s.index}">
      <td>${s.index}${delBtn}</td>
      <td title="${escapeHtml(route)}">${label}${escapeHtml(shortRoute)}</td>
      <td>${escapeHtml(mode)}</td>
      <td>${d.added ?? 0}</td>
      <td>${d.fixed ?? 0}</td>
      <td>${d.persisting ?? 0}</td>
      <td>${escapeHtml(blockers.join(", ") || "—")}</td>
    </tr>`;
  }).join("");
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

function renderFlowCounters() {
  const el = document.getElementById("flowCounterRow");
  if (!el) return;
  const sess = sessionState.current || sessionState.lastEndedSession;
  const steps = Array.isArray(sess?.steps) ? sess.steps : [];
  if (!steps.length) { el.hidden = true; return; }
  let added = 0, fixed = 0, persisting = 0, blockingAdded = 0, blockingFixed = 0;
  for (const s of steps) {
    const d = s.diffs?.consolidated || {};
    added += d.added || 0;
    fixed += d.fixed || 0;
    persisting += d.persisting || 0;
    blockingAdded += d.blockingAdded || 0;
    blockingFixed += d.blockingFixed || 0;
  }
  const blocking = blockingAdded - blockingFixed;
  el.innerHTML = `
    <div class="flowCounter"><span class="flowCounterValue${added > 0 ? " flowCounterValue--red" : ""}">${added}</span><span class="flowCounterLabel">New issues</span></div>
    <div class="flowCounter"><span class="flowCounterValue${fixed > 0 ? " flowCounterValue--green" : ""}">${fixed > 0 ? "-" : ""}${fixed}</span><span class="flowCounterLabel">Fixed</span></div>
    <div class="flowCounter"><span class="flowCounterValue">${persisting}</span><span class="flowCounterLabel">Persisting</span></div>
    <div class="flowCounter"><span class="flowCounterValue${blocking > 0 ? " flowCounterValue--red" : ""}">${blocking > 0 ? "+" : ""}${blocking}</span><span class="flowCounterLabel">Blocking</span></div>
  `;
  el.hidden = false;
}

function renderFlowVerdict() {
  const el = els.flowVerdict;
  if (!el) return;
  const sess = sessionState.current || sessionState.lastEndedSession;
  const steps = Array.isArray(sess?.steps) ? sess.steps : [];
  if (!steps.length) { el.hidden = true; return; }
  let totalBlockingAdded = 0;
  const blockingSteps = [];
  for (const s of steps) {
    const ba = s.diffs?.consolidated?.blockingAdded || 0;
    totalBlockingAdded += ba;
    if (ba > 0) blockingSteps.push(s.index);
  }
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
  el.className = `flowVerdict ${wrapCls}`;
  el.innerHTML = `<span class="flowVerdictBadge ${badgeCls}">${badge}</span><span class="flowVerdictText">${escapeHtml(summary)}</span>`;
  el.hidden = false;
}

// ---- Step label input ----

function showStepLabelInput(stepIndex) {
  if (!els.flowLabelInput || !els.flowLabelField) return;
  els.flowLabelInput.hidden = false;
  els.flowLabelField.value = "";
  els.flowLabelField.dataset.stepIndex = String(stepIndex);
  requestAnimationFrame(() => els.flowLabelField.focus());
}

function hideStepLabelInput() {
  if (els.flowLabelInput) els.flowLabelInput.hidden = true;
  if (els.flowLabelField) {
    els.flowLabelField.value = "";
    delete els.flowLabelField.dataset.stepIndex;
  }
}

function saveStepLabel() {
  const field = els.flowLabelField;
  if (!field) return;
  const stepIndex = Number(field.dataset.stepIndex);
  const label = (field.value || "").trim();
  if (!label || !sessionState.current) {
    hideStepLabelInput();
    return;
  }
  const step = (sessionState.current.steps || []).find(s => s.index === stepIndex);
  if (step) {
    step.label = label;
    renderSessionHud();
    persistActiveSessionBestEffort(compactSessionForExport(sessionState.current));
    toast(`Label saved for step ${stepIndex}`);
  }
  hideStepLabelInput();
}

// ---- Step drill-down ----

function buildStepDrillDownData(stepIndex) {
  const sess = sessionState.current || sessionState.lastEndedSession;
  if (!sess) return null;
  const steps = Array.isArray(sess.steps) ? sess.steps : [];
  const step = steps.find(s => s.index === stepIndex);
  if (!step) return null;
  const prevStep = steps.find(s => s.index === stepIndex - 1) || null;
  const rawAppendix = sess.rawAppendix || {};

  const currRunRaw = resolveSnapshotRaw(step?.snapshots?.run, rawAppendix);
  const prevRunRaw = resolveSnapshotRaw(prevStep?.snapshots?.run, rawAppendix);
  const currFindings = Array.isArray(currRunRaw?.findings) ? currRunRaw.findings : [];
  const prevFindings = Array.isArray(prevRunRaw?.findings) ? prevRunRaw.findings : [];

  const currEntries = runSignatureEntries(step?.snapshots?.run, rawAppendix);
  const prevEntries = runSignatureEntries(prevStep?.snapshots?.run, rawAppendix);

  const currSigToFinding = new Map();
  for (let i = 0; i < Math.min(currEntries.length, currFindings.length); i++) {
    currSigToFinding.set(currEntries[i].sig, currFindings[i]);
  }
  const prevSigSet = new Set(prevEntries.map(e => e.sig));
  const currSigSet = new Set(currEntries.map(e => e.sig));

  const added = [];
  const fixed = [];
  const persisting = [];

  for (const [sig, finding] of currSigToFinding) {
    if (prevSigSet.has(sig)) {
      persisting.push(finding);
    } else {
      added.push(finding);
    }
  }
  // Fixed: in prev but not in current
  const prevSigToFinding = new Map();
  for (let i = 0; i < Math.min(prevEntries.length, prevFindings.length); i++) {
    prevSigToFinding.set(prevEntries[i].sig, prevFindings[i]);
  }
  for (const [sig, finding] of prevSigToFinding) {
    if (!currSigSet.has(sig)) {
      fixed.push(finding);
    }
  }

  return { step, added, fixed, persisting, diff: step.diffs?.consolidated || {} };
}

function renderStepDrillDown(stepIndex) {
  const tbody = document.querySelector("#flowTimelineTable tbody");
  if (!tbody) return;

  // Remove existing detail row
  const existing = tbody.querySelector(".stepDetailRow");
  if (existing) existing.remove();
  tbody.querySelectorAll("tr.isExpanded").forEach(r => r.classList.remove("isExpanded"));

  // Toggle: if same step, just collapse
  if (sessionState.expandedStepIndex === stepIndex) {
    sessionState.expandedStepIndex = null;
    return;
  }

  sessionState.expandedStepIndex = stepIndex;
  const data = buildStepDrillDownData(stepIndex);
  if (!data) return;

  // Find and mark the target row
  let targetRow = null;
  for (const r of tbody.querySelectorAll("tr.trow")) {
    if (Number(r.dataset.stepIndex) === stepIndex) {
      targetRow = r;
      r.classList.add("isExpanded");
      break;
    }
  }
  if (!targetRow) return;

  const s = data.step;
  const d = data.diff;

  const renderFindingList = (findings, max = 30) => {
    if (!findings.length) return '<span style="color:var(--tx3);font-size:11px;">None</span>';
    return `<ul class="stepFindingList">${findings.slice(0, max).map(f => {
      const sev = escapeHtml(f.severity || "info");
      const type = escapeHtml(f.type || f.product || "");
      const note = escapeHtml(txt(f.note || f.name || "", 100));
      return `<li class="stepFindingItem"><span class="stepFindingSev ${sev}">${sev}</span><span class="stepFindingType">${type}</span><span class="stepFindingNote">${note}</span></li>`;
    }).join("")}${findings.length > max ? `<li class="stepFindingItem"><span class="stepFindingNote">…and ${findings.length - max} more</span></li>` : ""}</ul>`;
  };

  const detailHtml = `
    <dl class="stepDetailMeta">
      <dt>Step</dt><dd>${s.index}</dd>
      <dt>Label</dt><dd>${escapeHtml(s.label || "—")}</dd>
      <dt>Time</dt><dd>${s.at ? new Date(s.at).toLocaleTimeString() : "—"}</dd>
      <dt>Mode</dt><dd>${escapeHtml(s.activeModeCaptured || "run")}</dd>
      <dt>URL</dt><dd title="${escapeHtml(s.url || "")}">${escapeHtml(txt(s.routeHint || s.url || "—", 60))}</dd>
      <dt>Diff</dt><dd>+${d.added || 0} new, -${d.fixed || 0} fixed, ${d.persisting || 0} persisting</dd>
    </dl>
    <div class="stepDetailSection">
      <div class="stepDetailSectionTitle">Added (${data.added.length})</div>
      ${renderFindingList(data.added)}
    </div>
    <div class="stepDetailSection">
      <div class="stepDetailSectionTitle">Fixed (${data.fixed.length})</div>
      ${renderFindingList(data.fixed)}
    </div>
  `;

  const detailRow = document.createElement("tr");
  detailRow.className = "stepDetailRow";
  detailRow.innerHTML = `<td colspan="7"><div class="stepDetail">${detailHtml}</div></td>`;
  targetRow.after(detailRow);
}

// ---- Delete step ----

async function deleteStep(stepIndex) {
  if (!sessionState.current) {
    toast("Cannot delete steps from an ended session");
    return;
  }
  const steps = sessionState.current.steps || [];
  const idx = steps.findIndex(s => s.index === stepIndex);
  if (idx === -1) {
    toast("Step not found");
    return;
  }
  steps.splice(idx, 1);
  const rawAppendix = sessionState.current.rawAppendix || {};
  for (let i = 0; i < steps.length; i++) {
    steps[i].index = i + 1;
    const prevStep = i > 0 ? steps[i - 1] : null;
    steps[i].diffs = buildStepDiffs(steps[i], prevStep, rawAppendix);
  }
  pruneSessionRawAppendix(sessionState.current);
  const compacted = compactSessionForExport(sessionState.current);
  await persistActiveSessionBestEffort(compacted);
  sessionState.expandedStepIndex = null;
  renderSessionHud();
  toast(`Step deleted, ${steps.length} remaining`);
}

function updateSessionButtons() {
  const hasSession = !!sessionState.current;
  const hasExportableSession = !!(sessionState.current || sessionState.lastEndedSession);
  const hasArchivedSession = !sessionState.current && !!sessionState.lastEndedSession;
  const inFlight = !!sessionState.inFlight;
  const panelBusy = inFlight || state.running;
  ensureSessionHudTicker();
  if (els.sessionStart) {
    els.sessionStart.disabled = panelBusy || hasSession;
    els.sessionStart.hidden = hasSession;
  }
  if (els.sessionMark) {
    els.sessionMark.disabled = !hasSession || state.running;
    const hasQueued = !!sessionState.queuedCapture;
    els.sessionMark.innerHTML = inFlight
      ? (hasQueued ? "Queued (1)\u2026" : "Capturing\u2026")
      : 'Mark step <kbd class="keycap" aria-hidden="true">s</kbd>';
  }
  if (els.sessionEnd) {
    els.sessionEnd.disabled = !hasSession || panelBusy;
  }
  // Toggle recording banner and actions in Flow Record view
  if (els.flowRecordingBanner) els.flowRecordingBanner.hidden = !hasSession;
  if (els.flowRecordActions) els.flowRecordActions.hidden = !hasSession;
  if (els.sessionExportMenuLabel) els.sessionExportMenuLabel.hidden = !hasExportableSession;
  if (els.exportSessionJsonMenu) {
    els.exportSessionJsonMenu.hidden = !hasExportableSession;
    const desc = els.exportSessionJsonMenu.querySelector(".dd");
    if (desc) desc.textContent = hasSession ? "Active session" : "Last ended session";
  }
  if (els.exportSessionMdMenu) {
    els.exportSessionMdMenu.hidden = !hasExportableSession;
    const desc = els.exportSessionMdMenu.querySelector(".dd");
    if (desc) desc.textContent = hasSession ? "Active session" : "Last ended session";
  }
  if (els.exportAnchor) els.exportAnchor.hidden = !((state.records.length > 0) || hasExportableSession);
  renderSessionHud();
}

async function persistActiveSessionBestEffort(session) {
  if (!session) return false;
  const { origin, env } = getCurrentScopeInfo();
  const keys = getSessionKeys(origin || session.inspectedOrigin || "", env || "prod");
  const estimatedBytes = estimateJsonBytes(session);
  try {
    await storageSet({ [keys.active]: session });
    sessionState.lastPersistReasonCode = "-";
    debugSession("persist_active_ok", { estimatedBytes });
    return true;
  } catch (err) {
    console.warn("persist active session failed", err);
    sessionState.lastPersistReasonCode = classifyPersistReason(err);
    debugSession("persist_active_fail", { estimatedBytes, error: String(err?.message || err) });
    return false;
  }
}

async function archiveSessionBestEffort(session) {
  if (!session) return false;
  const { origin, env } = getCurrentScopeInfo();
  const keys = getSessionKeys(origin || session.inspectedOrigin || "", env || "prod", session.id);
  const estimatedBytes = estimateJsonBytes(session);
  try {
    await storageSet({
      [keys.archive]: session,
      [getSessionKeys(origin || session.inspectedOrigin || "", env || "prod").active]: null
    });
    sessionState.lastArchiveId = session.id;
    debugSession("archive_ok", { estimatedBytes });
    return true;
  } catch (err) {
    console.warn("archive session failed", err);
    debugSession("archive_fail", { estimatedBytes, error: String(err?.message || err) });
    return false;
  }
}

async function loadActiveSessionForScope(origin, env) {
  const keys = getSessionKeys(origin || "", env || "");
  try {
    const r = await storageGet([keys.active]);
    const loaded = r?.[keys.active] || null;
    sessionState.current = normalizeLoadedSession(loaded);
    if (!sessionState.current) sessionState.lastMarkStep = null;
  } catch (err) {
    console.warn("load active session failed", err);
    sessionState.current = null;
    sessionState.lastMarkStep = null;
  }
  updateSessionButtons();
}

function buildSessionSettings() {
  const scope = getScopeValue();
  return {
    captureBaselineRun: true,
    captureActiveMode: true,
    targetModeAtCapture: scope, // legacy key retained for backward compatibility
    scopeAtCapture: scope,
    helpCenterMatchEnabled: !!buildMatch(),
  };
}

function compactRawForSession(raw, mode) {
  if (!raw || typeof raw !== "object") return raw;
  const out = { ...raw };
  const capRows = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : arr;
  if (mode === "run") out.findings = capRows(out.findings, 220);
  if (mode === "contrast") {
    out.failures = capRows(out.failures, 120);
    out.samples = capRows(out.samples, 40);
  }
  if (mode === "tabWalk") out.events = capRows(out.events, 200);
  if (mode === "watch") {
    out.events = capRows(out.events, 200);
    out.verdicts = capRows(out.verdicts, 80);
  }
  if (mode === "observe") {
    out.findings = capRows(out.findings, 220);
    out.snapshots = capRows(out.snapshots, 140);
  }
  return out;
}

function toModeSnapshot(capture, mode, capturedAt, targeting = null) {
  if (!capture || capture.ok !== true) {
    return { mode, capturedAt, best: null, perFrame: [], targeting: targeting || null };
  }
  const best = capture?.bestEntry || null;
  const bestNormalized = best?.normalized || normalizeResultForExport(best?.result || null, mode);
  const bestOut = (best && best.ok === true && best.result && typeof best.result === "object")
    ? {
      frameId: best.frameId,
      frameKey: best.frameKey || `fk::unknown::unknown::root::00000000`,
      normalized: {
        type: bestNormalized?.type || mode,
        blockingCount: asNumber(bestNormalized?.blockingCount, 0),
        summaryScore: asNumber(bestNormalized?.summaryScore, 0),
        primaryCounts: bestNormalized?.primaryCounts || {},
      },
      rawRef: `best:${mode}:${best.frameKey || best.frameId || "unknown"}`,
      raw: compactRawForSession(bestNormalized?.raw ?? best?.result ?? null, mode),
    }
    : null;

  const perFrame = Array.isArray(capture?.perFrame) ? capture.perFrame.map(f => {
    const n = f?.normalized || null;
    const normalizedNoRaw = n ? {
      type: n.type || mode,
      blockingCount: asNumber(n.blockingCount, 0),
      summaryScore: asNumber(n.summaryScore, 0),
      primaryCounts: n.primaryCounts || {},
    } : null;
    return {
      frameId: f?.frameId ?? 0,
      frameKey: f?.frameKey || `fk::unknown::unknown::root::00000000`,
      ok: !!f?.ok,
      normalized: normalizedNoRaw,
      error: f?.error || null,
      reason: f?.reason || null,
    };
  }) : [];

  return { mode, capturedAt, best: bestOut, perFrame, targeting: targeting || null };
}

function resolveSnapshotRaw(snapshot, rawAppendix = null) {
  const inlineRaw = snapshot?.best?.normalized?.raw;
  if (inlineRaw && typeof inlineRaw === "object") return inlineRaw;
  const ref = snapshot?.best?.rawRef;
  if (ref && rawAppendix && typeof rawAppendix === "object" && rawAppendix[ref] && typeof rawAppendix[ref] === "object") {
    return rawAppendix[ref];
  }
  return {};
}

function rawAppendixEntryCount(session) {
  if (!session?.rawAppendix || typeof session.rawAppendix !== "object") return 0;
  return Object.keys(session.rawAppendix).length;
}

function clearSnapshotRaw(snapshot, appendix = null) {
  if (!snapshot?.best) return;
  const ref = snapshot.best.rawRef;
  if (ref && appendix && typeof appendix === "object") delete appendix[ref];
  delete snapshot.best.rawRef;
  delete snapshot.best.raw;
  if (snapshot.best.normalized && typeof snapshot.best.normalized === "object") delete snapshot.best.normalized.raw;
}

function softCompactSessionRawAppendix(session) {
  if (!session || !Array.isArray(session.steps) || !session.steps.length) return 0;
  if (!session.rawAppendix || typeof session.rawAppendix !== "object") session.rawAppendix = {};
  const cut = Math.max(0, session.steps.length - RAW_SOFT_COMPACT_KEEP_RECENT);
  let removed = 0;
  for (let i = 0; i < cut; i++) {
    const step = session.steps[i];
    if (!step?.snapshots) continue;
    for (const key of ["run", "active"]) {
      const snap = step.snapshots[key];
      const ref = snap?.best?.rawRef;
      if (ref && session.rawAppendix[ref]) {
        delete session.rawAppendix[ref];
        removed += 1;
      }
      if (snap?.best?.rawRef) delete snap.best.rawRef;
    }
  }
  pruneSessionRawAppendix(session);
  return removed;
}

function registerSnapshotRawAppendix(session, snapshot, stepIndex) {
  if (!session || !snapshot?.best) return { stored: false, reason: "no_snapshot" };
  const mode = snapshot.mode || "run";
  const raw = snapshot.best.raw && typeof snapshot.best.raw === "object"
    ? snapshot.best.raw
    : snapshot.best.normalized?.raw;
  if (!raw || typeof raw !== "object") return { stored: false, reason: "no_raw" };
  if (!session.rawAppendix || typeof session.rawAppendix !== "object") session.rawAppendix = {};
  if (rawAppendixEntryCount(session) >= MAX_RAW_APPENDIX_ENTRIES) {
    softCompactSessionRawAppendix(session);
  }
  if (rawAppendixEntryCount(session) >= MAX_RAW_APPENDIX_ENTRIES) {
    clearSnapshotRaw(snapshot, session.rawAppendix);
    return { stored: false, reason: "raw_capped" };
  }
  const baseRef = `raw::s${stepIndex}::${mode}::${snapshot.best.frameKey || snapshot.best.frameId || "unknown"}`;
  let ref = baseRef;
  let i = 1;
  while (session.rawAppendix[ref] && i < 200) {
    ref = `${baseRef}::${i}`;
    i += 1;
  }
  session.rawAppendix[ref] = compactRawForSession(raw, mode);
  snapshot.best.rawRef = ref;
  delete snapshot.best.raw;
  if (snapshot.best.normalized && typeof snapshot.best.normalized === "object") {
    delete snapshot.best.normalized.raw;
  }
  return { stored: true, reason: "ok" };
}

function pruneSessionRawAppendix(session) {
  if (!session || typeof session !== "object") return;
  const appendix = session.rawAppendix;
  if (!appendix || typeof appendix !== "object") return;
  const used = new Set();
  for (const step of session.steps || []) {
    for (const key of ["run", "active"]) {
      const ref = step?.snapshots?.[key]?.best?.rawRef;
      if (ref) used.add(ref);
    }
  }
  for (const key of Object.keys(appendix)) {
    if (!used.has(key)) delete appendix[key];
  }
}

function runSignatureEntries(snapshot, rawAppendix = null) {
  const out = [];
  const frameKey = snapshot?.best?.frameKey || "fk::unknown::unknown::root::00000000";
  const findings = resolveSnapshotRaw(snapshot, rawAppendix)?.findings;
  if (!Array.isArray(findings)) return out;
  for (const f of findings) {
    const testIdNorm = normalizeIdentityText(f?.testId, 60);
    const roleNorm = normalizeIdentityText(f?.role, 20);
    const nameNorm = normalizeIdentityText(f?.name, 80);
    const noteNorm = normalizeIdentityText(f?.note, 80);
    const typeNorm = normalizeIdentityText(f?.type, 40);
    const wcagNorm = normalizeIdentityText(f?.wcag, 24);
    const levelNorm = normalizeIdentityText(f?.level, 12);
    const confidenceNorm = normalizeIdentityText(f?.confidence, 16);
    const severityNorm = normalizeIdentityText(f?.severity, 10);
    const productNorm = normalizeIdentityText(f?.product, 30);
    const pathHash = pathHashForSig(f?.path);
    const weakPath = pathLooksWeak(f?.path);
    const signatureQuality = testIdNorm ? "high" : (weakPath ? "low" : "medium");
    const weakSig = signatureQuality === "low"
      ? [
        "run:weak",
        frameKey,
        typeNorm || "type:none",
        wcagNorm || "wcag:none",
        severityNorm || "sev:none",
        roleNorm || "role:none",
        nameNorm || "name:none",
        noteNorm || "note:none",
      ].join("|")
      : null;
    const sig = [
      "run",
      frameKey,
      typeNorm,
      wcagNorm,
      levelNorm,
      confidenceNorm,
      severityNorm,
      productNorm,
      `testid:${testIdNorm || "none"}`,
      `role:${roleNorm || "none"}`,
      `pathh:${pathHash}`,
      nameNorm,
      noteNorm,
    ].join("|");
    const severity = normalizeWs(f?.severity, 12);
    const confidence = normalizeFindingConfidence(f?.confidence);
    out.push({
      sig,
      weakSig,
      signatureQuality,
      blocking: isRunFindingBlocking(f),
      wcag: f?.wcag || null,
      confidence,
      level: f?.level || null,
      severity: severity || null,
      label: f?.type || "run_finding",
    });
  }
  return out;
}

function contrastSignatureEntries(snapshot, rawAppendix = null) {
  const out = [];
  const frameKey = snapshot?.best?.frameKey || "fk::unknown::unknown::root::00000000";
  const failures = resolveSnapshotRaw(snapshot, rawAppendix)?.failures;
  if (!Array.isArray(failures)) return out;
  for (const f of failures) {
    const sig = [
      "contrast",
      frameKey,
      normalizeIdentityText(f?.wcag || "1.4.3", 24),
      `ratio:${bucketNumber(asNumber(f?.ratio, 0) * 10, 2)}`,
      `required:${bucketNumber(asNumber(f?.required, 0) * 10, 2)}`,
      normalizeIdentityText(f?.tag, 16),
      `testid:${normalizeIdentityText(f?.testId, 60) || "none"}`,
      `pathh:${pathHashForSig(f?.path)}`,
      normalizeIdentityText(f?.text, 60),
    ].join("|");
    out.push({
      sig,
      weakSig: null,
      signatureQuality: normalizeIdentityText(f?.testId, 60) ? "high" : "medium",
      blocking: true,
      wcag: f?.wcag || "1.4.3",
      confidence: f?.confidence || "heuristic",
      level: null,
      severity: "high",
      label: "contrast_failure",
    });
  }
  return out;
}

function tabWalkSignatureEntries(snapshot, rawAppendix = null) {
  const out = [];
  const frameKey = snapshot?.best?.frameKey || "fk::unknown::unknown::root::00000000";
  const events = resolveSnapshotRaw(snapshot, rawAppendix)?.events;
  if (!Array.isArray(events)) return out;
  for (const e of events) {
    const sig = [
      "tabwalk",
      frameKey,
      normalizeIdentityText(e?.type, 40),
      `pathh:${pathHashForSig(e?.path)}`,
      normalizeIdentityText(e?.name, 80),
      normalizeIdentityText(e?.note, 80),
      `tabi:${bucketNumber(asNumber(e?.tabIndex, 0), 1)}`,
    ].join("|");
    const type = normalizeWs(e?.type, 40);
    out.push({
      sig,
      weakSig: null,
      signatureQuality: pathLooksWeak(e?.path) ? "low" : "medium",
      blocking: TAB_BLOCKING_TYPES.has(type),
      wcag: null,
      confidence: "heuristic",
      level: null,
      severity: TAB_BLOCKING_TYPES.has(type) ? "medium" : "info",
      label: e?.type || "tabwalk_event",
    });
  }
  return out;
}

function watchSignatureEntries(snapshot, rawAppendix = null) {
  const out = [];
  const frameKey = snapshot?.best?.frameKey || "fk::unknown::unknown::root::00000000";
  const raw = resolveSnapshotRaw(snapshot, rawAppendix) || {};
  const verdicts = Array.isArray(raw?.verdicts) ? raw.verdicts : [];
  for (const v of verdicts) {
    const sig = [
      "watch",
      frameKey,
      normalizeWs(v?.metric, 32),
      `b:${bucketNumber(v?.budget, 1)}`,
      `v:${bucketNumber(v?.value, 1)}`,
    ].join("|");
    out.push({
      sig,
      weakSig: null,
      signatureQuality: "high",
      blocking: true,
      wcag: null,
      confidence: "heuristic",
      level: null,
      severity: "medium",
      label: v?.metric || "watch_verdict",
    });
  }
  const focusLossCount = asNumber(raw?.focusLossCount, 0);
  if (focusLossCount > 0) {
    out.push({
      sig: ["watch", frameKey, "focus_loss", `v:${bucketNumber(focusLossCount, 1)}`].join("|"),
      weakSig: null,
      signatureQuality: "high",
      blocking: true,
      wcag: null,
      confidence: "heuristic",
      level: null,
      severity: "high",
      label: "focus_loss",
    });
  }
  return out;
}

function observeSignatureEntries(snapshot, rawAppendix = null) {
  const out = [];
  const frameKey = snapshot?.best?.frameKey || "fk::unknown::unknown::root::00000000";
  const raw = resolveSnapshotRaw(snapshot, rawAppendix) || {};
  const findings = Array.isArray(raw?.findings) ? raw.findings : [];
  for (const f of findings) {
    const typeNorm = normalizeIdentityText(f?.type, 40);
    const wcagNorm = normalizeIdentityText(f?.wcag, 24);
    const severityNorm = normalizeIdentityText(f?.severity, 10);
    const noteNorm = normalizeIdentityText(f?.note, 80);
    const testIdNorm = normalizeIdentityText(f?.testId, 60);
    const pathHash = pathHashForSig(f?.path);
    const weakPath = pathLooksWeak(f?.path);
    const signatureQuality = testIdNorm ? "high" : (weakPath ? "low" : "medium");
    const weakSig = signatureQuality === "low"
      ? [
        "observe:weak",
        frameKey,
        typeNorm || "type:none",
        wcagNorm || "wcag:none",
        severityNorm || "sev:none",
        noteNorm || "note:none",
      ].join("|")
      : null;
    const sig = [
      "observe",
      frameKey,
      typeNorm,
      wcagNorm,
      severityNorm,
      `testid:${testIdNorm || "none"}`,
      `pathh:${pathHash}`,
      noteNorm,
    ].join("|");
    const severity = normalizeWs(f?.severity, 12);
    const confidence = normalizeFindingConfidence(f?.confidence);
    out.push({
      sig,
      weakSig,
      signatureQuality,
      blocking: isRunFindingBlocking(f),
      wcag: f?.wcag || null,
      confidence,
      level: f?.level || null,
      severity: severity || null,
      label: f?.type || "observe_finding",
    });
  }

  const snapshots = Array.isArray(raw?.snapshots) ? raw.snapshots : [];
  const peak = snapshots.reduce((m, s) => Math.max(m, asNumber(s?.count, 0)), 0);
  let jumps = 0;
  for (let i = 1; i < snapshots.length; i++) {
    if (asNumber(snapshots[i]?.count, 0) > asNumber(snapshots[i - 1]?.count, 0)) jumps += 1;
  }
  out.push({
    sig: ["observe", frameKey, "trend", `peak:${bucketNumber(peak, 5)}`, `jumps:${bucketNumber(jumps, 1)}`].join("|"),
    weakSig: null,
    signatureQuality: "high",
    blocking: false,
    wcag: null,
    confidence: "advisory",
    level: null,
    severity: "info",
    label: "trend",
  });
  return out;
}

function buildModeSignatureBundle(snapshot, rawAppendix = null) {
  const empty = { set: new Set(), blockingSet: new Set(), metaBySig: new Map(), counts: {} };
  if (!snapshot) return empty;

  let entries = [];
  if (snapshot.mode === "run") entries = runSignatureEntries(snapshot, rawAppendix);
  else if (snapshot.mode === "contrast") entries = contrastSignatureEntries(snapshot, rawAppendix);
  else if (snapshot.mode === "tabWalk") entries = tabWalkSignatureEntries(snapshot, rawAppendix);
  else if (snapshot.mode === "watch") entries = watchSignatureEntries(snapshot, rawAppendix);
  else if (snapshot.mode === "observe") entries = observeSignatureEntries(snapshot, rawAppendix);

  const set = new Set();
  const blockingSet = new Set();
  const metaBySig = new Map();
  for (const e of entries) {
    set.add(e.sig);
    if (e.blocking) blockingSet.add(e.sig);
    metaBySig.set(e.sig, {
      wcag: e.wcag || null,
      confidence: e.confidence || null,
      level: e.level || null,
      severity: e.severity || null,
      label: e.label || snapshot.mode,
      weakSignature: e.weakSig || null,
      signatureQuality: e.signatureQuality || "medium",
    });
  }
  return {
    set,
    blockingSet,
    metaBySig,
    counts: snapshot?.best?.normalized?.primaryCounts || {},
  };
}

function mergeSignatureBundles(bundles) {
  const out = { set: new Set(), blockingSet: new Set(), metaBySig: new Map(), counts: {} };
  for (const b of bundles || []) {
    if (!b) continue;
    for (const sig of b.set || []) out.set.add(sig);
    for (const sig of b.blockingSet || []) out.blockingSet.add(sig);
    for (const [sig, meta] of b.metaBySig || []) if (!out.metaBySig.has(sig)) out.metaBySig.set(sig, meta);
    for (const [k, v] of Object.entries(b.counts || {})) out.counts[k] = asNumber(out.counts[k], 0) + asNumber(v, 0);
  }
  return out;
}

function computeCountsDelta(currentCounts = {}, prevCounts = {}) {
  const keys = [...new Set([...Object.keys(currentCounts || {}), ...Object.keys(prevCounts || {})])];
  const out = {};
  for (const k of keys) out[k] = asNumber(currentCounts[k], 0) - asNumber(prevCounts[k], 0);
  return out;
}

function summarizeDiff({ added, fixed, persisting, countsDelta, blockingAdded, blockingFixed }) {
  const deltaKeys = Object.keys(countsDelta || {}).slice(0, 4);
  const deltaText = deltaKeys.map(k => `${k} ${countsDelta[k] > 0 ? "+" : ""}${countsDelta[k]}`).join(", ");
  return `new=${added}, persisting=${persisting}, fixed=${fixed}, blocking +${blockingAdded}/-${blockingFixed}${deltaText ? ` • ${deltaText}` : ""}`;
}

function diffModeBundles(prevBundle, nextBundle) {
  const prevSet = prevBundle?.set || new Set();
  const nextSet = nextBundle?.set || new Set();
  const matchedPrev = new Set();
  const matchedNext = new Set();
  let persisting = 0;

  for (const sig of nextSet) {
    if (prevSet.has(sig)) {
      matchedPrev.add(sig);
      matchedNext.add(sig);
      persisting += 1;
    }
  }

  const prevWeakBuckets = new Map();
  for (const sig of prevSet) {
    if (matchedPrev.has(sig)) continue;
    const weak = prevBundle?.metaBySig?.get(sig)?.weakSignature;
    if (!weak) continue;
    if (!prevWeakBuckets.has(weak)) prevWeakBuckets.set(weak, []);
    prevWeakBuckets.get(weak).push(sig);
  }

  let weakMatched = 0;
  for (const sig of nextSet) {
    if (matchedNext.has(sig)) continue;
    const weak = nextBundle?.metaBySig?.get(sig)?.weakSignature;
    if (!weak) continue;
    const bucket = prevWeakBuckets.get(weak);
    if (!bucket || !bucket.length) continue;
    const prevSig = bucket.pop();
    matchedPrev.add(prevSig);
    matchedNext.add(sig);
    persisting += 1;
    weakMatched += 1;
  }

  let added = 0;
  for (const sig of nextSet) if (!matchedNext.has(sig)) added += 1;
  let fixed = 0;
  for (const sig of prevSet) if (!matchedPrev.has(sig)) fixed += 1;

  let blockingAdded = 0;
  let blockingFixed = 0;
  for (const sig of nextSet) if (!matchedNext.has(sig) && nextBundle.blockingSet.has(sig)) blockingAdded += 1;
  for (const sig of prevSet) if (!matchedPrev.has(sig) && prevBundle.blockingSet.has(sig)) blockingFixed += 1;
  const countsDelta = computeCountsDelta(nextBundle.counts, prevBundle.counts);
  return {
    added,
    fixed,
    persisting,
    weakMatched,
    blockingAdded,
    blockingFixed,
    countsDelta,
    text: summarizeDiff({ added, fixed, persisting, countsDelta, blockingAdded, blockingFixed }),
  };
}

function buildStepDiffs(step, prevStep, rawAppendix = null) {
  const runNext = buildModeSignatureBundle(step?.snapshots?.run, rawAppendix);
  const runPrev = buildModeSignatureBundle(prevStep?.snapshots?.run, rawAppendix);
  const activeNext = buildModeSignatureBundle(step?.snapshots?.active, rawAppendix);
  const activePrev = (prevStep?.snapshots?.active?.mode && prevStep?.snapshots?.active?.mode === step?.snapshots?.active?.mode)
    ? buildModeSignatureBundle(prevStep?.snapshots?.active, rawAppendix)
    : { set: new Set(), blockingSet: new Set(), metaBySig: new Map(), counts: {} };
  const consolidatedNext = mergeSignatureBundles([runNext, activeNext]);
  const consolidatedPrev = mergeSignatureBundles([runPrev, activePrev]);
  return {
    run: step?.snapshots?.run ? diffModeBundles(runPrev, runNext) : undefined,
    active: step?.snapshots?.active ? diffModeBundles(activePrev, activeNext) : undefined,
    consolidated: diffModeBundles(consolidatedPrev, consolidatedNext),
  };
}

function updateSessionFramesIndex(session, step) {
  if (!session || !step) return;
  const keys = new Set(session.frames?.frameKeys || []);
  const mapping = { ...(session.frames?.frameKeyToLastFrameId || {}) };
  const snapshots = [step?.snapshots?.run, step?.snapshots?.active].filter(Boolean);
  for (const snap of snapshots) {
    for (const f of snap.perFrame || []) {
      if (!f?.frameKey) continue;
      keys.add(f.frameKey);
      mapping[f.frameKey] = f.frameId;
    }
  }
  session.frames = {
    frameKeys: [...keys].sort(),
    frameKeyToLastFrameId: mapping,
  };
}

function severityWeight(severity) {
  const s = String(severity || "").toLowerCase();
  if (s === "high") return 3;
  if (s === "medium") return 2;
  return 1;
}

function shortUrlForMarkdown(url) {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return txt(url || "—", 120);
  }
}

function formatTargetingShort(targeting) {
  if (!targeting || typeof targeting !== "object") return "—";
  const profiles = Array.isArray(targeting.profileIds) ? targeting.profileIds.join(",") : "";
  const scope = targeting.scope || targeting.targetMode || "primary";
  return [
    `scope=${scope}`,
    `pinned=${targeting.pinned ? "y" : "n"}`,
    `hc=${targeting.helpCenterMatchEnabled ? "y" : "n"}`,
    `why=${targeting.selectionReason || "scope_primary_scored_best"}`,
    profiles ? `profiles=${profiles}` : null,
  ].filter(Boolean).join(" • ");
}

function buildDeterminismMeta(session) {
  const out = {
    schemaVersion: asNumber(session?.schemaVersion, 1),
    signatureVersion: asNumber(session?.signatureVersion, 1),
    frameKeyVersion: asNumber(session?.frameKeyVersion, 1),
    totalSteps: Array.isArray(session?.steps) ? session.steps.length : 0,
    perStepFrameKeys: [],
    warnings: [],
  };
  const steps = Array.isArray(session?.steps) ? session.steps : [];
  for (const step of steps) {
    const keys = Array.isArray(step?.frameSelections?.usedFrameKeys)
      ? [...step.frameSelections.usedFrameKeys].map(String).sort()
      : [];
    out.perStepFrameKeys.push({
      step: asNumber(step?.index, out.perStepFrameKeys.length + 1),
      count: keys.length,
      hash: fnv1aHash8(keys.join("|") || "none"),
    });
    if (!keys.length) out.warnings.push(`step_${asNumber(step?.index, 0)}:missing_usedFrameKeys`);
    const runV = asNumber(step?.snapshots?.run?.targeting?.frameKeyVersion, out.frameKeyVersion);
    if (runV !== out.frameKeyVersion) out.warnings.push(`step_${asNumber(step?.index, 0)}:frameKeyVersion_mismatch`);
  }
  if (out.warnings.length > 40) out.warnings = out.warnings.slice(0, 40);
  return out;
}

function compactSessionForExport(session) {
  if (!session || typeof session !== "object") return session;
  const clone = JSON.parse(JSON.stringify(session));
  clone.schemaVersion = asNumber(clone.schemaVersion, 1);
  clone.signatureVersion = asNumber(clone.signatureVersion, 1);
  clone.frameKeyVersion = asNumber(clone.frameKeyVersion, 1);
  if (!clone.rawAppendix || typeof clone.rawAppendix !== "object") clone.rawAppendix = {};
  for (const step of clone.steps || []) {
    for (const key of ["run", "active"]) {
      const snap = step?.snapshots?.[key];
      if (!snap?.best) continue;
      const mode = snap.mode || key;
      const inlineRaw = snap.best.raw && typeof snap.best.raw === "object"
        ? snap.best.raw
        : snap.best?.normalized?.raw;
      if (inlineRaw && typeof inlineRaw === "object") {
        const baseRef = `raw::s${step.index || "x"}::${mode}::${snap.best.frameKey || snap.best.frameId || "unknown"}`;
        let ref = baseRef;
        let i = 1;
        while (clone.rawAppendix[ref] && i < 50) {
          ref = `${baseRef}::${i}`;
          i += 1;
        }
        clone.rawAppendix[ref] = compactRawForSession(inlineRaw, mode);
        snap.best.rawRef = ref;
      }
      const rawRef = snap.best.rawRef;
      if (rawRef && clone.rawAppendix[rawRef]) {
        clone.rawAppendix[rawRef] = compactRawForSession(clone.rawAppendix[rawRef], mode);
      }
      delete snap.best.raw;
      if (snap.best.normalized && typeof snap.best.normalized === "object") delete snap.best.normalized.raw;
    }
  }
  if (Object.keys(clone.rawAppendix).length > MAX_RAW_APPENDIX_ENTRIES) {
    const keys = Object.keys(clone.rawAppendix).sort();
    for (const key of keys.slice(0, keys.length - MAX_RAW_APPENDIX_ENTRIES)) delete clone.rawAppendix[key];
  }
  pruneSessionRawAppendix(clone);
  clone.determinismMeta = buildDeterminismMeta(clone);
  return clone;
}

function buildSessionMarkdown(session) {
  if (!session) return "FlowLens session export: no active session.";
  const steps = Array.isArray(session.steps) ? session.steps : [];
  const frameKeys = Array.isArray(session?.frames?.frameKeys) ? session.frames.frameKeys : [];
  const rawAppendix = session?.rawAppendix && typeof session.rawAppendix === "object" ? session.rawAppendix : {};
  const lines = [];
  lines.push(`**FlowLens Session** ${session.id}`);
  lines.push(`Origin: ${session.inspectedOrigin || "—"} • Env: ${session.envTag || "—"}`);
  lines.push(`Started: ${session.startedAt} • Ended: ${session.endedAt || "in-progress"}`);
  lines.push(`Steps: ${steps.length} • Frames: ${frameKeys.length}`);
  lines.push(`Versions: schema=v${asNumber(session.schemaVersion, 1)} signature=v${asNumber(session.signatureVersion, 1)} frameKey=v${asNumber(session.frameKeyVersion, 1)}`);
  lines.push(`Settings: baselineRun=${session.settings?.captureBaselineRun ? "yes" : "no"}, activeMode=${session.settings?.captureActiveMode ? "yes" : "no"}, scope=${session.settings?.scopeAtCapture || session.settings?.targetModeAtCapture || "primary"}, hcMatch=${session.settings?.helpCenterMatchEnabled ? "yes" : "no"}`);
  lines.push("");

  const flowMap = new Map();
  for (const step of steps) {
    const bundle = mergeSignatureBundles([
      buildModeSignatureBundle(step?.snapshots?.run, rawAppendix),
      buildModeSignatureBundle(step?.snapshots?.active, rawAppendix),
    ]);
    for (const sig of bundle.blockingSet) {
      const meta = bundle.metaBySig.get(sig) || {};
      const existing = flowMap.get(sig) || {
        sig,
        firstSeenStep: step.index,
        lastSeenStep: step.index,
        occurrences: 0,
        wcag: meta.wcag || "",
        level: meta.level || "",
        confidence: meta.confidence || "",
        signatureQuality: meta.signatureQuality || "medium",
        label: meta.label || "",
        blockingWeight: severityWeight(meta.severity),
      };
      existing.lastSeenStep = step.index;
      existing.occurrences += 1;
      existing.blockingWeight = Math.max(existing.blockingWeight, severityWeight(meta.severity));
      if (qualityWeight(meta.signatureQuality) > qualityWeight(existing.signatureQuality)) {
        existing.signatureQuality = meta.signatureQuality;
      }
      flowMap.set(sig, existing);
    }
  }

  const topBlocking = [...flowMap.values()]
    .sort((a, b) =>
      (b.blockingWeight - a.blockingWeight)
      || (qualityWeight(b.signatureQuality) - qualityWeight(a.signatureQuality))
      || (b.occurrences - a.occurrences)
      || (a.firstSeenStep - b.firstSeenStep)
      || a.sig.localeCompare(b.sig)
    )
    .slice(0, 24);
  lines.push("Flow summary (blocking signatures):");
  if (!topBlocking.length) {
    lines.push("- none");
  } else {
    lines.push("| Blocking | Occurrences | First | Last | Quality | Label | WCAG | Level | Confidence | Signature |");
    lines.push("| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |");
    for (const x of topBlocking) {
      const quality = x.signatureQuality || "medium";
      const qualityLabel = quality === "low" ? "low (may be unstable)" : quality;
      lines.push(`| ${x.blockingWeight} | ${x.occurrences} | ${x.firstSeenStep} | ${x.lastSeenStep} | ${qualityLabel} | ${txt(x.label || "issue", 26)} | ${x.wcag || "—"} | ${x.level || "—"} | ${x.confidence || "—"} | \`${txt(x.sig, 90)}\` |`);
    }
  }
  lines.push("");

  lines.push("Per-step:");
  for (const step of steps) {
    const routeHint = txt(step?.routeHint || "(unknown)", 120);
    lines.push(`### Step ${step.index} — ${routeHint}`);
    if (step.label) lines.push(`- Label: ${txt(step.label, 120)}`);
    lines.push(`- At: ${step.at || "—"}`);
    lines.push(`- URL: ${shortUrlForMarkdown(step.url || "—")} (\`${txt(step.url || "—", 180)}\`)`);
    lines.push(`- Modes: ${modeLabel("run")}${step.snapshots?.active ? ` + ${modeLabel(step.snapshots.active.mode)}` : ""}`);
    const diff = step.diffs?.consolidated || {};
    lines.push(`- Diff: new=${asNumber(diff.added, 0)} • persisting=${asNumber(diff.persisting, 0)} • fixed=${asNumber(diff.fixed, 0)} • blocking +${asNumber(diff.blockingAdded, 0)}/-${asNumber(diff.blockingFixed, 0)}`);
    const runTarget = step?.snapshots?.run?.targeting || null;
    const activeTarget = step?.snapshots?.active?.targeting || null;
    if (runTarget) {
      lines.push(`- Targeting(run): ${formatTargetingShort(runTarget)} • frameKeyV=v${asNumber(runTarget.frameKeyVersion, 1)}`);
    }
    if (activeTarget) {
      lines.push(`- Targeting(${modeLabel(step.snapshots.active.mode)}): ${formatTargetingShort(activeTarget)} • frameKeyV=v${asNumber(activeTarget.frameKeyVersion, 1)}`);
    }
    const runBest = step.snapshots?.run?.best;
    const activeBest = step.snapshots?.active?.best;
    if (runBest) lines.push(`- Run best: frameKey=${runBest.frameKey} • blocking=${runBest.normalized?.blockingCount ?? 0} • score=${runBest.normalized?.summaryScore ?? 0}`);
    if (activeBest) lines.push(`- Active best (${modeLabel(step.snapshots.active.mode)}): frameKey=${activeBest.frameKey} • blocking=${activeBest.normalized?.blockingCount ?? 0} • score=${activeBest.normalized?.summaryScore ?? 0}`);
    lines.push("");
  }

  lines.push("Appendix:");
  for (const step of steps) {
    const keys = step.frameSelections?.usedFrameKeys || [];
    lines.push(`- Step ${step.index} frames: ${keys.join(", ") || "—"}`);
  }
  return lines.join("\n");
}

function buildMarkdown({ inspectedUrl, best, perFrame, usedFrameIds, envTag }) {
  const r = best?.result;
  if (!r) return `FlowLens — no result (env=${envTag})\nURL: ${inspectedUrl}`;
  const normalized = best?.normalized || normalizeResultForExport(r);
  const findings = Array.isArray(r.findings) ? r.findings : [];
  const c = countBySeverity(findings);
  const top = [...findings].sort((a, b) => (ORDER[b.severity] || 0) - (ORDER[a.severity] || 0)).slice(0, 10);
  const withMeta = (item) => {
    const level = item?.level ? `, level=${item.level}` : "";
    const confidence = item?.confidence ? `, confidence=${item.confidence}` : "";
    return `${level}${confidence}`;
  };
  const lines = [];
  lines.push(`**FlowLens** (${envTag})`);
  lines.push(`URL: ${inspectedUrl}`);
  lines.push(`FrameIds: ${(usedFrameIds || []).join(", ") || "?"}`);
  lines.push(`Mode: ${modeLabel(r.mode || "run")} • inIframe: ${String(r?.env?.inIframe ?? "—")}`);
  lines.push(`Findings: high=${c.high}, medium=${c.medium}, low=${c.low}, info=${c.info} (total=${findings.length})`);
  if (actionIsWatch(r)) {
    const w = r;
    const watchCounts = normalized?.type === "watch" ? normalized.primaryCounts : {};
    lines.push(`Watch: bursts=${watchCounts?.bursts ?? asNumber(w.bursts, "—")}, silentMs=${w.silentMs ?? "—"}, totalLoadingMs=${watchCounts?.totalLoadingMs ?? w.totalLoadingMs ?? "—"}, focusLossCount=${watchCounts?.focusLossCount ?? w.focusLossCount ?? "—"}`);
  }
  lines.push("");
    if (Array.isArray(r.failures)) {
    const contrastCounts = normalized?.type === "contrast" ? normalized.primaryCounts : {};
    lines.push(`Contrast: failures=${contrastCounts?.failures ?? r.failuresCount ?? r.failures.length}, scanned=${contrastCounts?.scanned ?? r.scanned ?? "—"}`);
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
    const tabCounts = normalized?.type === "tabWalk" ? normalized.primaryCounts : {};
    lines.push(`TabWalk: events=${tabCounts?.events ?? r.events.length}, walked=${tabCounts?.walked ?? r.walked ?? "—"}/${tabCounts?.totalFocusables ?? r.totalFocusables ?? "—"}`);
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
    lines.push(`- [${f.severity}] ${f.product ? f.product + " • " : ""}${f.type || ""}${f.wcag ? ` (${f.wcag})` : ""}${withMeta(f)} — ${txt(f.note || f.name || "", 120)}${f.testId ? ` • testId=${f.testId}` : ""}${f.fix ? "\n  Fix: " + txt(f.fix, 120) : ""}`);
  }
  lines.push("");
  lines.push(`Panel summary: ${summarizeFrames(perFrame || [])}`);
  return lines.join("\n");
}


function truncateMiddle(s, max = 80) {
  const str = String(s ?? "");
  if (str.length <= max) return str;
  const keep = Math.max(10, Math.floor((max - 1) / 2));
  return str.slice(0, keep) + "…" + str.slice(-keep);
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

function renderRunSummary(r, rec = null) {
  if (!r) {
    renderSevTabs();
    return;
  }
  const findings = Array.isArray(r?.findings) ? r.findings : [];
  renderSevTabs(findings);
}


function applyExplorerFilters(findings) {
  const q = (els.q.value || "").trim().toLowerCase();
  const sevSet = state.sevFilter;

  let list = Array.isArray(findings) ? findings : [];
  if (sevSet.size > 0) list = list.filter(f => sevSet.has(f.severity));

  if (q) {
    list = list.filter(f => {
      const blob = [f.type, f.name, f.testId, f.wcag, f.path, f.note, f.product]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(q);
    });
  }

  // Always dedup
  const seen = new Set();
  list = list.filter(f => {
    const h = hashFinding(f);
    if (seen.has(h)) return false;
    seen.add(h);
    return true;
  });

  return [...list].sort((a, b) =>
    hashFinding(a).localeCompare(hashFinding(b))
    || String(a?.wcag || "").localeCompare(String(b?.wcag || ""))
    || String(a?.name || "").localeCompare(String(b?.name || ""))
  );
}

function renderContrast(res) {
  state.contrastData = Array.isArray(res?.failures) ? res.failures : [];
  state.contrastSamples = Array.isArray(res?.samples) ? res.samples : [];
  updateContrastView();
}

function updateContrastView() {
  let data;
  if (state.contrastFilter === "fail") {
    data = state.contrastData;
  } else if (state.contrastFilter === "pass") {
    data = state.contrastSamples.filter(s => s.ratio >= s.required);
  } else {
    // "all" — show all samples
    data = state.contrastSamples;
  }
  data = data || [];
  const q = (els.contrastQ?.value || "").trim().toLowerCase();
  if (q) {
    data = data.filter(f => {
      const blob = [f.text, f.tag, f.testId, f.path, f.note, String(f.ratio ?? "")]
        .filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }
  const sorted = applySortState(data, 'contrast');
  if (VT.contrast) {
    VT.contrast.setData(sorted);
    return;
  }
  const tbody = els.contrastTbody;
  if (!tbody) return;
  tbody.innerHTML = sorted.slice(0, 200).map((f, idx) => {
    const pass = f.ratio >= f.required;
    return `
    <tr class="trow${pass ? ' contrastPass' : ''}" data-i="${idx}">
      <td>${escapeHtml(String(f.ratio ?? ""))}</td>
      <td>${escapeHtml(String(f.required ?? ""))}</td>
      <td>${f.largeText ? "yes" : "no"}</td>
      <td>${cellHtml(f.text, 50)}</td>
      <td>${escapeHtml(f.tag ?? "")}</td>
      <td>${escapeHtml(f.testId ?? "")}</td>
      <td>${cellHtml(f.path, 60)}</td>
      <td>${cellHtml(f.note, 50)}</td>
    </tr>`;
  }).join("");
}


function renderTabWalk(res) {
  const raw = Array.isArray(res?.events) ? res.events : [];
  state.tabData = raw;
  let filtered = raw;
  const q = (els.tabWalkQ?.value || "").trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(e => {
      const blob = [e.type, e.name, e.path, e.note, String(e.tabIndex ?? "")]
        .filter(Boolean).join(" ").toLowerCase();
      return blob.includes(q);
    });
  }
  const events = applySortState(filtered, 'tab');
  if (VT.tab) {
    VT.tab.setData(events);
    return;
  }
  // fallback (should not happen)
  const tbody = els.tabTbody;
  if (!tbody) return;
  tbody.innerHTML = events.slice(0, 200).map((e, idx) => `
    <tr class="trow" data-i="${idx}">
      <td>${escapeHtml(String(e.i ?? ""))}</td>
      <td>${escapeHtml(String(e.type ?? ""))}</td>
      <td>${escapeHtml(String(e.tabIndex ?? ""))}</td>
      <td>${cellHtml(e.name, 50)}</td>
      <td>${cellHtml(e.path, 60)}</td>
      <td>${cellHtml(e.note, 50)}</td>
    </tr>
  `).join("");
}

function renderWatch(res) {
  if (!res) return;
  // Summary metrics
  if (els.watchSummary) {
    const metrics = [
      { label: "Bursts", value: res.bursts ?? 0 },
      { label: "Loading", value: `${((res.totalLoadingMs ?? 0) / 1000).toFixed(1)}s` },
      { label: "Silent", value: `${((res.silentMs ?? 0) / 1000).toFixed(1)}s` },
      { label: "Focus loss", value: res.focusLossCount ?? 0 },
      { label: "Focus jumps", value: res.focusJumps ?? 0 },
      { label: "Announcements", value: res.announcementCount ?? 0 },
      { label: "Empty", value: res.emptyAnnouncementCount ?? 0 },
      { label: "1st announce", value: res.firstAnnouncementAt != null ? `${(res.firstAnnouncementAt / 1000).toFixed(1)}s` : "\u2013" },
    ];
    els.watchSummary.innerHTML = metrics.map(m =>
      `<div class="watchMetric"><span class="watchMetricValue">${escapeHtml(String(m.value))}</span><span class="watchMetricLabel">${escapeHtml(m.label)}</span></div>`
    ).join("");
  }
  // Verdicts
  if (els.watchVerdicts) {
    const verdicts = Array.isArray(res.verdicts) ? res.verdicts : [];
    if (verdicts.length) {
      els.watchVerdicts.innerHTML = verdicts.map(v => {
        const over = v.value > v.budget;
        return `<span class="watchVerdict ${over ? "watchVerdict--fail" : "watchVerdict--pass"}">${escapeHtml(v.metric)}: ${v.value}${over ? " \u26A0" : " \u2713"}</span>`;
      }).join("");
    } else {
      els.watchVerdicts.innerHTML = '<span class="watchVerdict watchVerdict--pass">All metrics within budget \u2713</span>';
    }
  }
  // Events timeline table
  const events = Array.isArray(res.events) ? res.events : [];
  const tbody = els.watchTbody;
  if (!tbody) return;
  tbody.innerHTML = events.slice(0, 200).map(e =>
    `<tr class="trow"><td>${((e.t ?? 0) / 1000).toFixed(1)}s</td><td>${escapeHtml(String(e.type ?? ""))}</td><td>${cellHtml(e.note, 80)}</td></tr>`
  ).join("");
}

function renderExplorer(findings) {
  const filtered = applySortState(applyExplorerFilters(findings), 'explorer');
  state.explorer = filtered;

  // Clear row selection/dimming on re-render
  if (els.allTableBody) {
    els.allTableBody.__selected = null;
    const tw = els.allTableBody.closest(".tableWrap");
    if (tw) tw.classList.remove("hasSelection");
  }

  if (VT.all) {
    VT.all.setData(filtered);
  } else {
    // fallback
    els.allTableBody.innerHTML = filtered.slice(0, 200).map((f, idx) => `
      <tr class="trow" data-i="${idx}" data-sev="${escapeHtml(f.severity)}">
        <td><span class="pill ${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
        <td>${escapeHtml(f.product ?? "")}</td>
        <td>${escapeHtml(f.type ?? "")}</td>
        <td>${escapeHtml(f.wcag ?? "")}</td>
        <td>${cellHtml(f.name, 50)}</td>
        <td>${escapeHtml(f.testId ?? "")}</td>
        <td>${cellHtml(f.path, 60)}</td>
        <td>${cellHtml(f.note, 50)}</td>
        <td class="fixCol">${cellHtml(f.fix, 50)} <button class="rowAct" type="button" data-i="${idx}" aria-label="Highlight finding ${idx + 1}">Highlight</button></td>
      </tr>
    `).join("");
  }

}


function refreshInspectedUrl(retries = 3) {
  return new Promise(resolve => {
  chrome.devtools.inspectedWindow.eval("location.href", async (res, err) => {
    if (err && retries > 0) {
      setTimeout(() => refreshInspectedUrl(retries - 1).then(resolve), 300);
      return;
    }
    const url = err ? "" : String(res);
    els.inspectedUrl.textContent = url ? truncateMiddle(url, 120) : "—";
    els.inspectedUrl.title = url || "—";
    els.inspectedUrl.dataset.full = url;
    const env = detectEnv(url);
    const origin = originFrom(url);
    const detected = `${origin || "—"} • env=${env}`;
    els.brandEnv.textContent = detected;
    els.brandEnv.title = detected;
    els.brandEnv.dataset.full = detected;

    // load stored records for this origin/env
    const scopeKey = `records::${origin || ""}::${env}`;
    await loadRecords(scopeKey);
    await loadActiveSessionForScope(origin || "", env || "");
    // if we have records, render newest
    if (state.records.length) {
      state.currentId = state.records[0].id;
      renderRecord(state.records[0]);
    } else {
      state.currentId = null;
      state.currentFindings = [];
      renderRunSummary(null);
      showMode(state.activeMode || "run");
      updateResultsVisibility(false);
    }

    // load pinned frame preference for this origin
    if (origin) {
      const { pinnedFrames = {} } = await storageGet(["pinnedFrames"]);
      const pin = pinnedFrames[origin];
      if (pin?.frameId != null) {
        els.pinFrame.checked = true;
        state.pinnedFrameId = Number(pin.frameId);
        if (!Object.prototype.hasOwnProperty.call(SCOPE_LABELS, String(els.target.value || ""))) {
          els.target.value = "embedded";
        }
      } else {
        els.pinFrame.checked = false;
        state.pinnedFrameId = null;
      }
    } else {
      els.pinFrame.checked = false;
      state.pinnedFrameId = null;
    }
    if (Number.isFinite(state.pinnedFrameId) && els.frameSelect?.options?.length) {
      const wanted = String(state.pinnedFrameId);
      const found = [...els.frameSelect.options].some(opt => opt.value === wanted);
      if (found) els.frameSelect.value = wanted;
    }
    updateScopeUi();
    updateTargetingSummary();
    resolve();
  });
  });
}

function getScopeValue() {
  const value = String(els.target?.value || "primary");
  if (Object.prototype.hasOwnProperty.call(SCOPE_LABELS, value)) return value;
  return "primary";
}

function updateScopeUi() {
  const scope = getScopeValue();
  if (els.target) {
    els.target.value = scope;
    els.target.title = SCOPE_TOOLTIPS[scope] || "";
  }
  const showFrameSelect = !!els.pinFrame?.checked;
  if (els.frameSelectWrap) els.frameSelectWrap.hidden = !showFrameSelect;
  if (els.frameSelect) els.frameSelect.disabled = !showFrameSelect;
  updateTargetingSummary();
}

async function refreshFrames() {
  const r = await send({ type: "LIST_FRAMES" });
  const frames = r?.frames || [];
  let stalePinned = false;

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
  if (Number.isFinite(state.pinnedFrameId)) {
    const targetValue = String(state.pinnedFrameId);
    const found = [...els.frameSelect.options].some(opt => opt.value === targetValue);
    if (found) {
      els.frameSelect.value = targetValue;
    } else {
      // The previously pinned frame no longer exists after navigation/reload.
      state.pinnedFrameId = null;
      els.pinFrame.checked = false;
      stalePinned = true;
    }
  }
  updateScopeUi();
  updateTargetingSummary();
  if (stalePinned) await setPinnedFrameIfNeeded();
}

function getTargetSpec() {
  const scope = getScopeValue();
  const target = { scope };
  // Keep legacy mode field for best-effort compatibility with older runtimes.
  if (scope === "host") target.mode = "top";
  else if (scope === "all") target.mode = "all";
  else target.mode = "auto";

  if (els.pinFrame.checked) {
    const frameId = els.frameSelect.value === "" ? NaN : Number(els.frameSelect.value);
    if (Number.isFinite(frameId)) {
      target.frameIds = [frameId];
      target.manual = true;
      target.pinned = true;
      target.mode = "manual";
    }
  }
  return target;
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
    const selected = els.frameSelect.value === "" ? NaN : Number(els.frameSelect.value);
    if (!Number.isFinite(selected)) return;
    pinnedFrames[origin] = { frameId: selected };
    state.pinnedFrameId = Number.isFinite(selected) ? selected : null;
  } else {
    delete pinnedFrames[origin];
    state.pinnedFrameId = null;
  }
  await storageSet({ pinnedFrames });
  updateTargetingSummary();
}

async function highlightFinding(finding) {
  if (!finding) return;
  const frameId = state.bestFrameId ?? 0;
  try {
    const res = await send({ type: "HIGHLIGHT", frameId, finding });
    if (res?.found === false) {
      toast("Element not found on page — DOM may have changed");
    } else {
      toast("Highlighted element");
    }
  } catch {
    toast("Could not highlight — frame may be inaccessible");
  }
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
  state.activeMode = action;
  setPressed(action);
  setRunTelemetry({ usedFrames: "Running…", diff: "—" });
  setPersistentStatus("RUNNING", action.toUpperCase(), "Execution in progress");

  const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
  const envTag = `${originFrom(url) || "—"} • ${detectEnv(url)}`;

  const target = getTargetSpec();
  const match = buildMatch();

  // pinned frame: if checked, ensure we persist
  await setPinnedFrameIfNeeded();

  let r;
  try {
    r = await send({
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
  } catch (err) {
    const failed = { ok: false, action, error: String(err?.message || err) };
    state.lastResult = failed;
    els.json.textContent = pretty(failed);
    setRunTelemetry({ usedFrames: "—", diff: "(run failed)" });
    setPersistentStatus("FAILED", "TRANSPORT", "Run transport failure");
    console.error("RUN_AUDIT transport failure", err);
    toast(`${action} failed`);
    return false;
  }

  state.lastResult = r;
  els.json.textContent = pretty(r);
  if (!r?.ok) {
    const noScope = r?.reason === "NO_SCOPE_MATCH" || r?.error === "NO_SCOPE_MATCH";
    setRunTelemetry({ usedFrames: "—", diff: noScope ? "(no frame matches selected scope)" : "(run failed)" });
    setPersistentStatus("FAILED", noScope ? "NO_SCOPE_MATCH" : "BACKEND", noScope ? "No frame matches selected scope" : "Run failed");
    console.error("RUN_AUDIT backend failure", r);
    toast(noScope ? "No frame matches selected scope" : `${action} failed`);
    return false;
  }

  state.lastSelectionReason = r?.bestEntry?.selectionReason || r?.selectionReason || state.lastSelectionReason;
  updateTargetingSummary(state.lastSelectionReason);

  // store result record for quick switching
  const url0 = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
  const scopeKey = `records::${originFrom(url0)}::${detectEnv(url0)}`;
  const rec = {
    id: String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    at: new Date().toISOString(),
    action,
    envTag,
    usedFrameIds: r?.usedFrameIds || [],
    best: r?.bestEntry || null,
  };
  // newest first
  state.records = [rec, ...state.records.filter(x => String(x.id) !== String(rec.id))];
  state.byId[String(rec.id)] = rec;
  renderRecord(rec);
  const persisted = await persistRecords(scopeKey);
  if (!persisted) {
    console.warn("Record rendered but history persistence failed");
  }

  setRunTelemetry({ usedFrames: (r?.usedFrameIds || []).join(", ") || "—" });

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
    setRunTelemetry({ diff: d.text });
    await saveHistorySnapshot({ key, snapshot });
  } else {
    setRunTelemetry({ diff: "(no findings snapshot)" });
  }

  const _fc = findings.length;
  const _cc = bestResult?.failuresCount ?? bestResult?.failures?.length;
  const _ec = bestResult?.events?.length;
  const detail = _fc ? ` — ${_fc} findings` : _cc != null ? ` — ${_cc} failures` : _ec != null ? ` — ${_ec} events` : "";
  setPersistentStatus("OK", action.toUpperCase(), `${_fc || _cc || _ec || 0} issues`);
  toast(`${modeLabel(action)} done${detail}`);
  return true;
}

async function startSession() {
  if (sessionState.current) {
    toast("Session already active");
    return false;
  }
  const { url, origin, envTag } = getCurrentScopeInfo();
  if (!origin) {
    toast("Open a page before starting a session");
    return false;
  }
  sessionState.current = {
    id: makeId("sess"),
    schemaVersion: 1,
    signatureVersion: 1,
    startedAt: nowIso(),
    endedAt: null,
    frameKeyVersion: 1,
    inspectedOrigin: origin,
    envTag,
    settings: buildSessionSettings(),
    frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    rawAppendix: {},
    steps: [],
  };
  sessionState.lastMarkStep = null;
  sessionState.lastAutoNavUrl = null;
  await persistActiveSessionBestEffort(sessionState.current);
  updateSessionButtons();
  setPersistentStatus("OK", "SESSION_STARTED", "Session active");
  toast("Session started");
  return true;
}

async function endSession() {
  if (!sessionState.current) {
    toast("No active session");
    return false;
  }
  hideStepLabelInput();
  const exportableEndedSession = compactSessionForExport(normalizeLoadedSession(sessionState.current));
  const previousEndedAt = sessionState.current.endedAt || null;
  sessionState.current.endedAt = nowIso();
  const archived = await archiveSessionBestEffort(compactSessionForExport(sessionState.current));
  if (!archived) {
    // Keep active in-memory session so user can retry archive/export without data loss.
    sessionState.current.endedAt = previousEndedAt;
    updateSessionButtons();
    toast("Archive failed — session kept active");
    return false;
  }
  sessionState.lastEndedSession = exportableEndedSession;
  sessionState.current = null;
  sessionState.lastMarkStep = null;
  if (sessionState.autoCapturePending) {
    clearTimeout(sessionState.autoCapturePending);
    sessionState.autoCapturePending = null;
  }
  sessionState.lastAutoNavUrl = null;
  sessionState.queuedCapture = null;
  updateSessionButtons();
  setPersistentStatus("OK", "SESSION_ENDED", "Session archived");

  // Auto-copy verdict summary
  const sess = exportableEndedSession;
  if (sess) {
    const steps = Array.isArray(sess.steps) ? sess.steps : [];
    let totalBlockingAdded = 0;
    const blockingSteps = [];
    for (const s of steps) {
      const ba = s.diffs?.consolidated?.blockingAdded || 0;
      totalBlockingAdded += ba;
      if (ba > 0) blockingSteps.push(s.index);
    }
    const pass = totalBlockingAdded === 0;
    const verdict = pass
      ? `PASS — ${steps.length} steps, 0 blocking regressions`
      : `FAIL — ${totalBlockingAdded} blocking issues in steps ${blockingSteps.join(", ")}`;
    const summary = `FlowLens: ${verdict} (${sess.inspectedOrigin || "—"})`;
    await copyText(summary);
    toast(pass ? "Session ended — PASS (copied)" : "Session ended — FAIL (copied)");
  } else {
    toast("Session ended");
  }
  return true;
}

async function captureStepOptionC(label = null, { isAutoCapture = false } = {}) {
  if (!sessionState.current) {
    toast("Start a session first");
    return false;
  }
  if (state.running) {
    toast("Wait for current run to finish");
    return false;
  }
  if ((sessionState.current.steps?.length || 0) >= MAX_STEPS) {
    setLastMarkStatus("FAILED", "session:limit");
    updateSessionButtons();
    toast(`Step limit reached (${MAX_STEPS})`);
    return false;
  }
  if (sessionState.inFlight) {
    sessionState.queuedCapture = { isAutoCapture };
    if (!isAutoCapture) toast("Queued \u2014 will capture after current step");
    updateSessionButtons();
    return false;
  }

  sessionState.inFlight = true;
  sessionState.captureSlow = false;
  hideStepLabelInput();
  if (sessionState.captureSlowTimer) window.clearTimeout(sessionState.captureSlowTimer);
  sessionState.captureSlowTimer = window.setTimeout(() => {
    if (!sessionState.inFlight) return;
    sessionState.captureSlow = true;
    renderSessionHud();
  }, CAPTURE_SLOW_MS);
  updateSessionButtons();
  setRunTelemetry({ usedFrames: "Capturing step…" });
  const t0 = performance.now();
  try {
    const activeMode = getSmartModeForCapture(isAutoCapture);
    const target = getTargetSpec();
    const match = buildMatch();
    const baseTargeting = {
      targetMode: target?.scope || "primary", // legacy key retained for export compatibility
      scope: target?.scope || "primary",
      manual: !!target?.manual,
      manualFrameIds: Array.isArray(target?.frameIds) ? [...target.frameIds] : [],
      pinned: !!els.pinFrame.checked,
      helpCenterMatchEnabled: !!match,
      profileIds: [...profileState.active].sort(),
    };
    await setPinnedFrameIfNeeded();

    let r;
    try {
      r = await send({
        type: "CAPTURE_STEP",
        activeMode,
        target,
        match,
        modeHints: buildModeHints(),
        appMarkers: buildAppMarkers(),
        alsoConsole: !!els.alsoConsole.checked,
        wcagLevel: els.wcagLevel?.value || "2.1-AA",
      });
    } catch (err) {
      console.error("CAPTURE_STEP transport failure", err);
      setLastMarkStatus("FAILED", "baseline:transport");
      updateSessionButtons();
      toast("Step capture failed");
      return false;
    }

    if (!r?.ok || !r?.run?.ok) {
      console.error("CAPTURE_STEP failure", r);
      const noScope = r?.run?.error === "NO_SCOPE_MATCH" || r?.run?.reason === "NO_SCOPE_MATCH";
      setLastMarkStatus("FAILED", noScope ? "baseline:no_scope_match" : "baseline:ok:false");
      updateSessionButtons();
      toast(noScope ? "Step capture failed: no frame matches selected scope" : "Step capture failed");
      return false;
    }

    const capturedAt = nowIso();
    const runSnapshot = toModeSnapshot(r.run, "run", capturedAt, {
      ...baseTargeting,
      scope: r?.run?.scope || baseTargeting.scope,
      selectionReason: r?.run?.selectionReason || "scope_primary_scored_best",
      usedFrameIds: Array.isArray(r?.run?.usedFrameIds) ? [...r.run.usedFrameIds] : [],
      frameKeyVersion: asNumber(r?.run?.frameKeyVersion, 1),
    });
    state.lastSelectionReason = runSnapshot?.targeting?.selectionReason || state.lastSelectionReason;
    updateTargetingSummary(state.lastSelectionReason);
    const activeSnapshot = activeMode !== "run" ? toModeSnapshot(r.active, activeMode, capturedAt, {
      ...baseTargeting,
      scope: r?.active?.scope || baseTargeting.scope,
      selectionReason: r?.active?.selectionReason || "scope_primary_scored_best",
      usedFrameIds: Array.isArray(r?.active?.usedFrameIds) ? [...r.active.usedFrameIds] : [],
      frameKeyVersion: asNumber(r?.active?.frameKeyVersion, asNumber(r?.run?.frameKeyVersion, 1)),
    }) : null;
    if (!runSnapshot?.best?.normalized || typeof runSnapshot.best.normalized !== "object") {
      setLastMarkStatus("FAILED", "baseline:parse");
      updateSessionButtons();
      toast("Step capture failed (invalid baseline)");
      return false;
    }

    const { url } = getCurrentScopeInfo();
    const usedFrameIds = [...new Set([...(r?.run?.usedFrameIds || []), ...(r?.active?.usedFrameIds || [])])];
    const usedFrameKeysSet = new Set();
    for (const snap of [runSnapshot, activeSnapshot].filter(Boolean)) {
      for (const f of snap.perFrame || []) if (f?.frameKey) usedFrameKeysSet.add(f.frameKey);
      if (snap?.best?.frameKey) usedFrameKeysSet.add(snap.best.frameKey);
    }

    const stepIndex = (sessionState.current.steps?.length || 0) + 1;
    const runRawStored = registerSnapshotRawAppendix(sessionState.current, runSnapshot, stepIndex);
    const activeRawStored = activeSnapshot ? registerSnapshotRawAppendix(sessionState.current, activeSnapshot, stepIndex) : { stored: true, reason: "none" };
    if (runRawStored.reason === "raw_capped" || activeRawStored.reason === "raw_capped") {
      toast("Raw appendix capped; continuing without raw");
    }
    const routeHint = await deriveStepRouteHint(url, baseTargeting.profileIds);

    const step = {
      id: makeId("step"),
      index: stepIndex,
      label: label || null,
      at: capturedAt,
      url: url || "",
      routeHint,
      activeModeCaptured: activeMode,
      frameSelections: {
        usedFrameIds,
        usedFrameKeys: [...usedFrameKeysSet],
      },
      snapshots: {
        run: runSnapshot,
        active: activeSnapshot,
      },
      diffs: { consolidated: { added: 0, fixed: 0, persisting: 0, blockingAdded: 0, blockingFixed: 0, countsDelta: {}, text: "—" } },
    };

    const prevStep = (sessionState.current.steps || []).slice(-1)[0] || null;
    sessionState.current.schemaVersion = asNumber(r?.schemaVersion, sessionState.current.schemaVersion || 1);
    sessionState.current.signatureVersion = asNumber(r?.signatureVersion, sessionState.current.signatureVersion || 1);
    sessionState.current.frameKeyVersion = asNumber(r?.run?.frameKeyVersion, sessionState.current.frameKeyVersion || 1);
    step.diffs = buildStepDiffs(step, prevStep, sessionState.current.rawAppendix || {});
    sessionState.current.steps.push(step);
    // Prune only after the new step is attached, so newly written raw refs are discoverable.
    pruneSessionRawAppendix(sessionState.current);
    updateSessionFramesIndex(sessionState.current, step);

    const compacted = compactSessionForExport(sessionState.current);
    const estimatedBytes = estimateJsonBytes(compacted);
    if (estimatedBytes > MAX_SESSION_BYTES_ESTIMATE) {
      console.warn("session size warning", { estimatedBytes });
      toast("Session is large; exports may be compacted");
    }
    const persisted = await persistActiveSessionBestEffort(compacted);
    if (!persisted) console.warn("session persistence failed; continuing in-memory");
    debugSession("capture_step", {
      durationMs: Math.round(performance.now() - t0),
      usedFrames: usedFrameIds.length,
      bestFrameKey: runSnapshot?.best?.frameKey || null,
      selectionReason: runSnapshot?.targeting?.selectionReason || "scope_primary_scored_best",
      persisted,
      estimatedBytes,
    });

    setRunTelemetry({ diff: step.diffs?.consolidated?.text || "—" });
    const baselineFindings = asNumber(runSnapshot?.best?.normalized?.primaryCounts?.findings, 0);
    const activeFailed = activeMode !== "run" && (!r?.active?.ok || !activeSnapshot?.best);
    const activeReasonCode = activeMode === "run"
      ? "-"
      : (!r?.active ? "active:transport" : (
        r.active.ok === false
          ? ((r.active.error === "NO_SCOPE_MATCH" || r.active.reason === "NO_SCOPE_MATCH") ? "active:no_scope_match" : "active:ok:false")
          : (!activeSnapshot?.best ? "active:parse" : "-")
      ));
    const persistWarn = !persisted;
    const rawWarn = runRawStored.reason === "raw_capped" || activeRawStored.reason === "raw_capped";
    if (activeFailed) setLastMarkStatus("PARTIAL", activeReasonCode);
    else if (persistWarn) setLastMarkStatus("PARTIAL", sessionState.lastPersistReasonCode || "persist:error");
    else if (rawWarn) setLastMarkStatus("PARTIAL", "raw:capped");
    else setLastMarkStatus("OK", "-");
    updateSessionButtons();
    toast(`Step ${step.index} captured (${baselineFindings} baseline findings)`);
    if (!label && !isAutoCapture) showStepLabelInput(step.index);
    expandAccordion(document.getElementById("flowTimeline"));
    return true;
  } finally {
    sessionState.inFlight = false;
    sessionState.captureSlow = false;
    if (sessionState.captureSlowTimer) {
      window.clearTimeout(sessionState.captureSlowTimer);
      sessionState.captureSlowTimer = null;
    }
    updateSessionButtons();
    // Drain queued capture
    const queued = sessionState.queuedCapture;
    sessionState.queuedCapture = null;
    if (queued && sessionState.current) {
      const qLabel = queued.isAutoCapture
        ? await deriveAutoLabel(getCurrentScopeInfo().url || "")
        : null;
      setTimeout(() => captureStepOptionC(qLabel, { isAutoCapture: queued.isAutoCapture }), 0);
    }
  }
}

function downloadText(name, text, mime = "text/plain") {
  const blob = new Blob([String(text ?? "")], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportSessionJson() {
  const session = sessionState.current || sessionState.lastEndedSession;
  if (!session) {
    toast("No active session");
    return false;
  }
  try {
    const payload = compactSessionForExport(normalizeLoadedSession(session));
    if (!payload || typeof payload !== "object") {
      toast("Session JSON export failed");
      return false;
    }
    downloadText(buildSessionFileName(payload), JSON.stringify(payload, null, 2), "application/json");
    setExportMenuOpen(false);
    toast("Session JSON exported");
    return true;
  } catch (err) {
    console.error("session json export failed", err);
    toast("Session JSON export failed");
    return false;
  }
}

async function exportSessionMarkdown() {
  const session = sessionState.current || sessionState.lastEndedSession;
  if (!session) {
    toast("No active session");
    return false;
  }
  try {
    const payload = compactSessionForExport(normalizeLoadedSession(session));
    if (!payload || typeof payload !== "object") {
      toast("Session Markdown export failed");
      return false;
    }
    const md = buildSessionMarkdown(payload);
    const ok = await copyText(md);
    if (ok) {
      setExportMenuOpen(false);
      return true;
    }
    return false;
  } catch (err) {
    console.error("session markdown export failed", err);
    toast("Session Markdown export failed");
    return false;
  }
}

// --- Presets ---

// --- Export ---
async function copyMarkdown() {
  const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
  const envTag = `${originFrom(url) || "—"} • ${detectEnv(url)}`;
  const md = buildMarkdown({
    inspectedUrl: url,
    best: state.lastResult?.bestEntry || state.lastResult?.best,
    perFrame: state.lastResult?.perFrame,
    usedFrameIds: state.lastResult?.usedFrameIds,
    envTag,
  });
  const ok = await copyText(md);
  if (ok) flashInlineHint(els.copyMdHint);
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
    badge.textContent = v + " DH";
    const emptyVer = document.getElementById("emptyVersion");
    if (emptyVer) emptyVer.textContent = "v" + v;
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
    const isActive = profileState.active.includes(id);
    const label = document.createElement("label");
    label.className = `profilePill${isActive ? " active" : ""}`;
    if (p.description) label.title = p.description;
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = id;
    cb.checked = isActive;
    cb.addEventListener("change", () => {
      if (cb.checked) {
        if (!profileState.active.includes(id)) profileState.active.push(id);
      } else {
        profileState.active = profileState.active.filter(x => x !== id);
      }
      label.classList.toggle("active", cb.checked);
      saveActiveProfiles();
    });
    const span = document.createElement("span");
    span.textContent = p.label || id;
    label.appendChild(cb);
    label.appendChild(span);
    els.profileSelect.appendChild(label);
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
  if (els.alsoConsole) els.alsoConsole.checked = !!uiPrefs.alsoConsole;
  if (els.wcagLevel && uiPrefs.wcagLevel) els.wcagLevel.value = uiPrefs.wcagLevel;
  await loadProfiles();
}

// --- wire up ---

// Top-level tab clicks
document.querySelectorAll("#topTabBar [role='tab']").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.tab));
});

// Roving tabindex for top tabs
document.getElementById("topTabBar").addEventListener("keydown", (e) => {
  const tabs = [...document.querySelectorAll("#topTabBar [role='tab']")];
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
  showView(tabs[next].dataset.tab);
  tabs[next].focus();
});

// Snap subtab clicks
document.querySelectorAll("#snapSubTabBar [role='tab']").forEach(btn => {
  btn.addEventListener("click", () => {
    showView("snap", btn.dataset.action);
  });
});

// Roving tabindex for snap subtabs
document.getElementById("snapSubTabBar").addEventListener("keydown", (e) => {
  const tabs = [...document.querySelectorAll("#snapSubTabBar [role='tab']")];
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
  showView("snap", tabs[next].dataset.action);
  tabs[next].focus();
});


// Run button: execute currently selected mode
if (els.runCurrentMode) {
  els.runCurrentMode.addEventListener("click", () => _lockedPreset([state.activeMode || "run"]));
}

if (els.exportToggle && els.exportMenu) {
  els.exportToggle.addEventListener("click", () => {
    setExportMenuOpen(els.exportMenu.hidden);
  });
  els.exportToggle.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setExportMenuOpen(true);
      const first = exportMenuItems().find(item => !item.disabled);
      if (first) first.focus();
      return;
    }
    if (e.key === "Escape" && !els.exportMenu.hidden) {
      e.preventDefault();
      setExportMenuOpen(false, { restoreFocus: true });
    }
  });
  els.exportMenu.addEventListener("keydown", (e) => {
    const items = exportMenuItems().filter(item => !item.disabled);
    if (!items.length) return;
    const currentIdx = items.findIndex(item => item === document.activeElement);
    if (e.key === "Escape") {
      e.preventDefault();
      setExportMenuOpen(false, { restoreFocus: true });
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(currentIdx + 1 + items.length) % items.length].focus();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(currentIdx - 1 + items.length) % items.length].focus();
      return;
    }
    if (e.key === "Tab") setExportMenuOpen(false);
  });
  document.addEventListener("click", (e) => {
    const target = e.target;
    if (els.exportToggle.contains(target) || els.exportMenu.contains(target)) return;
    setExportMenuOpen(false);
  });
}


els.refreshFrames.addEventListener("click", refreshFrames);
els.target.addEventListener("change", () => {
  updateScopeUi();
});
if (els.pinFrame) {
  els.pinFrame.addEventListener("change", async () => {
    updateScopeUi();
    await setPinnedFrameIfNeeded();
  });
}
if (els.frameSelect) {
  els.frameSelect.addEventListener("change", async () => {
    if (!els.pinFrame?.checked) return;
    await setPinnedFrameIfNeeded();
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
  setExportMenuOpen(false);
  toast("Copied JSON");
});

els.downloadJson.addEventListener("click", () => {
  downloadText(`a11yflowaudit-${Date.now()}.json`, pretty(state.lastResult || {}), "application/json");
  setExportMenuOpen(false);
  toast("Downloaded JSON");
});

els.copyMd.addEventListener("click", async () => {
  await copyMarkdown();
  setExportMenuOpen(false);
});
if (els.exportSessionJsonMenu) {
  els.exportSessionJsonMenu.addEventListener("click", async () => {
    await exportSessionJson();
    setExportMenuOpen(false);
  });
}
if (els.exportSessionMdMenu) {
  els.exportSessionMdMenu.addEventListener("click", async () => {
    await exportSessionMarkdown();
    setExportMenuOpen(false);
  });
}
if (els.sessionStart) {
  els.sessionStart.addEventListener("click", () => {
    if (sessionState.current) {
      toast("Session already active");
      return;
    }
    startSession();
  });
}
if (els.sessionMark) els.sessionMark.addEventListener("click", () => captureStepOptionC());
if (els.sessionEnd) els.sessionEnd.addEventListener("click", () => endSession());

// Step label input handlers
if (els.flowLabelSave) els.flowLabelSave.addEventListener("click", saveStepLabel);
if (els.flowLabelSkip) els.flowLabelSkip.addEventListener("click", hideStepLabelInput);
if (els.flowLabelField) {
  els.flowLabelField.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveStepLabel();
    if (e.key === "Escape") hideStepLabelInput();
  });
}

// Timeline drill-down + delete step + inline label edit
{
  const ftBody = document.getElementById("flowTimelineBody");
  if (ftBody) {
    // Click: delete button or drill-down
    ftBody.addEventListener("click", (e) => {
      const deleteBtn = e.target.closest(".stepDeleteBtn");
      if (deleteBtn) {
        e.stopPropagation();
        const si = Number(deleteBtn.dataset.deleteStep);
        if (Number.isFinite(si)) deleteStep(si);
        return;
      }
      const tr = e.target.closest("tr.trow");
      if (!tr) return;
      const si = Number(tr.dataset.stepIndex);
      if (Number.isFinite(si)) renderStepDrillDown(si);
    });
    // Double-click: inline label edit on route cell (2nd column)
    ftBody.addEventListener("dblclick", (e) => {
      const td = e.target.closest("td");
      if (!td) return;
      const tr = td.closest("tr.trow");
      if (!tr) return;
      const cells = [...tr.children];
      if (cells.indexOf(td) !== 1) return;
      const stepIndex = Number(tr.dataset.stepIndex);
      if (!Number.isFinite(stepIndex)) return;
      const sess = sessionState.current || sessionState.lastEndedSession;
      const step = (sess?.steps || []).find(s => s.index === stepIndex);
      if (!step) return;
      e.preventDefault();
      const originalContent = td.innerHTML;
      const currentLabel = step.label || "";
      td.innerHTML = `<input class="stepLabelEdit" type="text" value="${escapeHtml(currentLabel)}" maxlength="80" placeholder="Add label..." />`;
      const input = td.querySelector("input");
      input.focus();
      input.select();
      const commitEdit = () => {
        const newLabel = (input.value || "").trim();
        step.label = newLabel || null;
        renderFlowTimeline();
        if (sessionState.current) {
          persistActiveSessionBestEffort(compactSessionForExport(sessionState.current));
        }
        if (newLabel) toast(`Label updated: ${newLabel}`);
      };
      input.addEventListener("blur", commitEdit, { once: true });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") { input.blur(); }
        if (ev.key === "Escape") {
          input.removeEventListener("blur", commitEdit);
          td.innerHTML = originalContent;
        }
      });
    });
  }
}

if (els.copyJsonRaw) {
  els.copyJsonRaw.addEventListener("click", async () => {
    await copyText(els.json.textContent || "");
    toast("Copied raw JSON");
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
  if (e.target && e.target.closest("button, a, input, select, textarea")) return;
  if (e.key !== "Enter" && e.key !== " ") return;
  const tr = e.target.closest("tr.trow");
  if (!tr) return;
  e.preventDefault();
  tr.click();
});

// --- DELEGATED_TABLE_CLICKS ---

if (els.allTableBody && !els.allTableBody.__bound) {
  els.allTableBody.__bound = true;
  els.allTableBody.__selected = null;
  els.allTableBody.addEventListener("click", async (e) => {
    try {
      const tr = e?.target?.closest ? e.target.closest("tr.trow") : null;
      if (!tr) return;

      const tableWrap = els.allTableBody.closest(".tableWrap");
      if (els.allTableBody.__selected) els.allTableBody.__selected.classList.remove("isSelected");
      tr.classList.add("isSelected");
      els.allTableBody.__selected = tr;
      if (tableWrap) tableWrap.classList.add("hasSelection");

      const idx = Number(tr.getAttribute("data-i"));
      if (VT.all) VT.all.selectedIdx = idx;
      const finding = Number.isFinite(idx) ? state.explorer[idx] : null;
      if (!finding) return;

      await highlightFinding(finding);
    } catch (err) {
      console.warn("Explorer table click failed", err);
      toast("Could not highlight element");
    }
  });
}

// Contrast table: click row → highlight element on page
if (els.contrastTbody && !els.contrastTbody.__bound) {
  els.contrastTbody.__bound = true;
  els.contrastTbody.__selected = null;
  els.contrastTbody.addEventListener("click", async (e) => {
    try {
      const tr = e?.target?.closest ? e.target.closest("tr.trow") : null;
      if (!tr) return;

      if (els.contrastTbody.__selected) els.contrastTbody.__selected.classList.remove("isSelected");
      tr.classList.add("isSelected");
      els.contrastTbody.__selected = tr;

      const idx = Number(tr.getAttribute("data-i"));
      if (VT.contrast) VT.contrast.selectedIdx = idx;
      const item = Number.isFinite(idx) && VT.contrast ? VT.contrast.data[idx] : null;
      if (!item || !item.path) return;

      await highlightFinding({ path: item.path, testId: item.testId, tag: item.tag, name: item.text });
    } catch (err) {
      console.warn("Contrast table click failed", err);
      toast("Could not highlight element");
    }
  });
}

// Tab walk table: click row → highlight element on page
if (els.tabTbody && !els.tabTbody.__bound) {
  els.tabTbody.__bound = true;
  els.tabTbody.__selected = null;
  els.tabTbody.addEventListener("click", async (e) => {
    try {
      const tr = e?.target?.closest ? e.target.closest("tr.trow") : null;
      if (!tr) return;

      if (els.tabTbody.__selected) els.tabTbody.__selected.classList.remove("isSelected");
      tr.classList.add("isSelected");
      els.tabTbody.__selected = tr;

      const idx = Number(tr.getAttribute("data-i"));
      if (VT.tab) VT.tab.selectedIdx = idx;
      const item = Number.isFinite(idx) && VT.tab ? VT.tab.data[idx] : null;
      if (!item) return;
      if (!item.path) { toast("This event has no locatable element"); return; }

      await highlightFinding({ path: item.path, name: item.name, role: item.role });
    } catch (err) {
      console.warn("Tab walk table click failed", err);
      toast("Could not highlight element");
    }
  });
}

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

if (els.alsoConsole) {
  els.alsoConsole.addEventListener("change", async () => {
    const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
    uiPrefs.alsoConsole = !!els.alsoConsole.checked;
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

els.q.addEventListener("input", scheduleExplorerRender);

// Search clear button
const searchClearBtn = document.getElementById("searchClear");
if (searchClearBtn) {
  searchClearBtn.addEventListener("click", () => {
    els.q.value = "";
    els.q.focus();
    scheduleExplorerRender();
  });
}

if (els.sevTabs) {
  els.sevTabs.addEventListener("click", (e) => {
    const tab = e.target.closest(".sevTab");
    if (!tab) return;
    const sev = tab.dataset.sev;

    // Handle contrast mode tabs (all/fail/pass)
    if (state.activeMode === "contrast") {
      state.contrastFilter = sev || "all";
      renderContrastSevTabs();
      updateContrastView();
      const refocus = els.sevTabs.querySelector(`.sevTab[data-sev="${sev}"]`);
      if (refocus) refocus.focus();
      return;
    }

    if (!sev) {
      // "All" tab: clear selection
      state.sevFilter = new Set();
    } else if (e.shiftKey) {
      // Shift+click: toggle severity in/out
      const next = new Set(state.sevFilter);
      if (next.has(sev)) next.delete(sev); else next.add(sev);
      state.sevFilter = next;
    } else {
      // Regular click: sole-select or toggle to All
      if (state.sevFilter.size === 1 && state.sevFilter.has(sev)) {
        state.sevFilter = new Set();
      } else {
        state.sevFilter = new Set([sev]);
      }
    }

    renderSevTabs(state.currentFindings);
    scheduleExplorerRender();
    const refocus = els.sevTabs.querySelector(`.sevTab[data-sev="${sev}"]`);
    if (refocus) refocus.focus();
  });
}

// Contrast search
if (els.contrastQ) {
  let __contrastT = null;
  els.contrastQ.addEventListener("input", () => {
    clearTimeout(__contrastT);
    __contrastT = setTimeout(updateContrastView, 120);
  });
}

// Tab walk search
if (els.tabWalkQ) {
  let __tabT = null;
  els.tabWalkQ.addEventListener("input", () => {
    clearTimeout(__tabT);
    __tabT = setTimeout(() => {
      renderTabWalk({ events: state.tabData });
    }, 120);
  });
}

// keyboard shortcuts (tab-aware)
window.addEventListener("keydown", (e) => {
  if (state.running) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target && (e.target.matches("input,select,textarea") || e.target.isContentEditable)) return;
  const key = (e.key || "").toLowerCase();

  // Top-level tab switching: 1/2/3
  if (key === "1") { showView("snap"); return; }
  if (key === "2") { showView("flow"); return; }
  if (key === "3") { showView("settings"); return; }

  if (state.topTab === "flow") {
    // s = mark step (if session active), e = end session
    if (key === "s" && sessionState.current && els.sessionMark && !els.sessionMark.disabled) {
      els.sessionMark.click();
      return;
    }
    if (key === "e" && sessionState.current && els.sessionEnd && !els.sessionEnd.disabled) {
      els.sessionEnd.click();
      return;
    }
    // r = start recording (if no session)
    if (key === "r" && !sessionState.current && els.sessionStart && !els.sessionStart.disabled) {
      els.sessionStart.click();
      return;
    }
  }
});


// --- Column visibility ---
const TABLE_COLS = {
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

function createColToggle(tableId, parentEl, afterEl) {
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
  if (afterEl) {
    afterEl.insertAdjacentElement('afterend', wrapper);
  } else {
    parentEl.appendChild(wrapper);
  }
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
      { tableId: 'allTable', selector: '#searchToolbar .toolbarActions' },
      { tableId: 'contrastTable', selector: '#contrastToolbar .toolbarActions' },
      { tableId: 'tabTable', selector: '#tabWalkToolbar .toolbarActions' },
    ];

    for (const p of placements) {
      const el = document.querySelector(p.selector);
      if (!el) continue;
      if (p.sibling) {
        createColToggle(p.tableId, el.parentElement, el);
      } else {
        createColToggle(p.tableId, el);
      }
    }
  });
}

function initSortableHeaders() {
  const tables = [
    {
      id: 'explorer',
      thead: document.querySelector('#allTable thead'),
      render: () => renderExplorer(state.currentFindings),
    },
    {
      id: 'contrast',
      thead: document.querySelector('#contrastTable thead'),
      render: () => updateContrastView(),
    },
    {
      id: 'tab',
      thead: document.querySelector('#tabTable thead'),
      render: () => renderTabWalk({ events: state.tabData }),
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
        <tr class="trow" data-i="${idx}" data-sev="${escapeHtml(f.severity)}">
          <td><span class="pill ${escapeHtml(f.severity)}">${escapeHtml(f.severity)}</span></td>
          <td>${escapeHtml(f.product ?? "")}</td>
          <td>${escapeHtml(f.type ?? "")}</td>
          <td>${escapeHtml(f.wcag ?? "")}</td>
          <td>${cellHtml(f.name, 50)}</td>
          <td>${escapeHtml(f.testId ?? "")}</td>
          <td>${cellHtml(f.path, 60)}</td>
          <td>${cellHtml(f.note, 50)}</td>
          <td class="fixCol">${cellHtml(f.fix, 50)} <button class="rowAct" type="button" data-i="${idx}" aria-label="Highlight finding ${idx + 1}">Highlight</button></td>
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
      rowRenderer: (f, idx) => {
        const pass = f.ratio >= f.required;
        return `
        <tr class="trow${pass ? ' contrastPass' : ''}" data-i="${idx}">
          <td>${escapeHtml(String(f.ratio ?? ""))}</td>
          <td>${escapeHtml(String(f.required ?? ""))}</td>
          <td>${f.largeText ? "yes" : "no"}</td>
          <td>${cellHtml(f.text, 50)}</td>
          <td>${escapeHtml(f.tag ?? "")}</td>
          <td>${escapeHtml(f.testId ?? "")}</td>
          <td>${cellHtml(f.path, 60)}</td>
          <td>${cellHtml(f.note, 50)}</td>
        </tr>
      `;
      },
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
      rowRenderer: (e, idx) => `
        <tr class="trow" data-i="${idx}">
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
chrome.devtools.network.onNavigated.addListener(async () => {
  state.findingsByMode = {};
  state.contrastFilter = "all";
  await refreshInspectedUrl();
  await refreshFrames();
  toast("Navigated — refreshed frames");

  // Auto-capture if enabled
  if (sessionState.current && els.autoCaptureNav?.checked) {
    const { url } = getCurrentScopeInfo();
    if (url && url !== sessionState.lastAutoNavUrl) {
      if (sessionState.autoCapturePending) clearTimeout(sessionState.autoCapturePending);
      const debounceMs = Number(els.autoCaptureDelay?.value) || 500;
      sessionState.autoCapturePending = setTimeout(async () => {
        sessionState.autoCapturePending = null;
        if (!sessionState.current) return;
        sessionState.lastAutoNavUrl = url;
        const autoLabel = await deriveAutoLabel(url);
        await captureStepOptionC(autoLabel, { isAutoCapture: true });
      }, debounceMs);
    }
  }
});

// JSON toggle
const _jsonToggle = document.getElementById('jsonToggle');
if (_jsonToggle) {
  _jsonToggle.addEventListener('click', () => {
    const expanded = _jsonToggle.getAttribute('aria-expanded') === 'true';
    _jsonToggle.setAttribute('aria-expanded', String(!expanded));
    els.json.classList.toggle('collapsed', expanded);
    els.json.hidden = expanded;
  });
}

// Accordion toggles
document.querySelectorAll('.accordionToggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    const body = btn.closest('.accordion')?.querySelector('.accordionBody');
    if (body) body.hidden = expanded;
    const chevron = btn.querySelector('.chevron');
    if (chevron) chevron.textContent = expanded ? '\u2228' : '\u2227';
  });
});

function syncCollapsedSections() {
  if (els.json) {
    els.json.hidden = els.json.classList.contains("collapsed");
  }
}

// initial
showView("snap", "run");
syncCollapsedSections();
renderSevTabs();
updateResultsVisibility(false);
initVirtualTables();
initSortableHeaders();
initColToggles();
updateScopeUi();
setVersionBadge();
loadUiPrefs();

(async () => {
  await refreshInspectedUrl();
  await refreshFrames();
})();

if (!hasRuntime()) {
  toast("Runtime API missing — try reopening DevTools after reloading extension");
}
