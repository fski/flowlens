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
  downloadMd: document.getElementById("downloadMd"),
  downloadHtmlReport: document.getElementById("downloadHtmlReport"),
  saveBaselineMenu: document.getElementById("saveBaselineMenu"),
  loadBaselineMenu: document.getElementById("loadBaselineMenu"),
  baselineFileInput: document.getElementById("baselineFileInput"),
  baselineBanner: document.getElementById("baselineBanner"),
  copyMd: document.getElementById("copyMd"),
  sessionExportMenuLabel: document.getElementById("sessionExportMenuLabel"),
  exportSessionJsonMenu: document.getElementById("exportSessionJsonMenu"),
  exportSessionMdMenu: document.getElementById("exportSessionMdMenu"),
  exportDiffReportMenu: document.getElementById("exportDiffReportMenu"),
  downloadJunitXml: document.getElementById("downloadJunitXml"),
  exportSessionJunitMenu: document.getElementById("exportSessionJunitMenu"),
  ciFailOnBlocking: document.getElementById("ciFailOnBlocking"),
  ciTreatNeedsReview: document.getElementById("ciTreatNeedsReview"),
  ciMaxFailures: document.getElementById("ciMaxFailures"),
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
  shadowCoverageRow: document.getElementById("shadowCoverageRow"),

  // explorer
  q: document.getElementById("q"),
  findingsCount: document.getElementById("findingsCount"),
  allTableBody: document.querySelector("#allTable tbody"),
  groupByComponent: document.getElementById("groupByComponent"),

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
  showTabPathBtn: document.getElementById("showTabPathBtn"),
  clearTabPathBtn: document.getElementById("clearTabPathBtn"),
  assistBar: document.getElementById("assistBar"),
  structureSection: document.getElementById("structureSection"),
  structureScanBtn: document.getElementById("structureScanBtn"),
  structureSummary: document.getElementById("structureSummary"),
  structureHeadingsList: document.getElementById("structureHeadingsList"),
  structureLandmarksList: document.getElementById("structureLandmarksList"),
  structureShowHeadings: document.getElementById("structureShowHeadings"),
  structureClearHeadings: document.getElementById("structureClearHeadings"),
  structureShowLandmarks: document.getElementById("structureShowLandmarks"),
  structureClearLandmarks: document.getElementById("structureClearLandmarks"),
  guidedSection: document.getElementById("guidedSection"),
  guidedStartImages: document.getElementById("guidedStartImages"),
  guidedStartControls: document.getElementById("guidedStartControls"),
  guidedCancel: document.getElementById("guidedCancel"),
  guidedWizard: document.getElementById("guidedWizard"),
  guidedStatus: document.getElementById("guidedStatus"),
  guidedCandidate: document.getElementById("guidedCandidate"),
  guidedQuestion: document.getElementById("guidedQuestion"),
  guidedAnswers: document.getElementById("guidedAnswers"),
  scoreChip: document.getElementById("scoreChip"),
  manualChecksSection: document.getElementById("manualChecksSection"),
  manualChecksList: document.getElementById("manualChecksList"),
  pastRunsToggle: document.getElementById("pastRunsToggle"),
  pastRunsBody: document.getElementById("pastRunsBody"),
  pastRunsList: document.getElementById("pastRunsList"),
  pastRunsCount: document.getElementById("pastRunsCount"),
  pastRunsActions: document.getElementById("pastRunsActions"),
  deleteAllRuns: document.getElementById("deleteAllRuns"),
  rawJsonToggle: document.getElementById("rawJsonToggle"),
  rawJsonBody: document.getElementById("rawJsonBody"),
  sheetCopyRaw: document.getElementById("sheetCopyRaw"),

  // about / diagnostics
  aboutContent: document.getElementById("aboutContent"),
  diagVersion: document.getElementById("diagVersion"),
  diagSchema: document.getElementById("diagSchema"),
  diagSignature: document.getElementById("diagSignature"),
  diagFrameKey: document.getElementById("diagFrameKey"),
  diagEnMapping: document.getElementById("diagEnMapping"),
  diagDataVersions: document.getElementById("diagDataVersions"),
  diagFrameGating: document.getElementById("diagFrameGating"),
  diagExcludedFrames: document.getElementById("diagExcludedFrames"),
  diagUrl: document.getElementById("diagUrl"),
  diagEnv: document.getElementById("diagEnv"),
  diagFrameScope: document.getElementById("diagFrameScope"),
  diagBestFrameId: document.getElementById("diagBestFrameId"),
  diagBestFrameKey: document.getElementById("diagBestFrameKey"),
  diagScope: document.getElementById("diagScope"),
  diagShadowCoverage: document.getElementById("diagShadowCoverage"),
  diagActiveProfile: document.getElementById("diagActiveProfile"),
  diagProfileConfidence: document.getElementById("diagProfileConfidence"),
  diagProfileSignals: document.getElementById("diagProfileSignals"),
  diagRootSelector: document.getElementById("diagRootSelector"),
  diagRootSelectorMatch: document.getElementById("diagRootSelectorMatch"),
  diagDepthMax: document.getElementById("diagDepthMax"),
  diagRecipe: document.getElementById("diagRecipe"),
  depthMax: document.getElementById("depthMax"),
  recipeSelect: document.getElementById("recipeSelect"),
  copyDiagnostics: document.getElementById("copyDiagnostics"),
  copyDiagnosticsMdBtn: document.getElementById("copyDiagnosticsMdBtn"),
  copyCiJson: document.getElementById("copyCiJson"),
  copyDiagHint: document.getElementById("copyDiagHint"),
  integrityOverview: document.getElementById("integrityOverview"),
  pillAnnouncementsCount: document.getElementById("pillAnnouncementsCount"),
  pillFocusCount: document.getElementById("pillFocusCount"),
  pillSemanticsCount: document.getElementById("pillSemanticsCount"),
  pillMultiframeCount: document.getElementById("pillMultiframeCount"),
  coverageLine: document.getElementById("coverageLine"),
  coverageMissingList: document.getElementById("coverageMissingList"),

  // save status HUD
  saveStatusHud: document.getElementById("saveStatusHud"),
  saveStatusDot: document.getElementById("saveStatusDot"),
  saveStatusText: document.getElementById("saveStatusText"),

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
  explorerEmpty: document.getElementById("explorerEmpty"),
  contrastEmpty: document.getElementById("contrastEmpty"),
  tabWalkEmpty: document.getElementById("tabWalkEmpty"),
  watchEmpty: document.getElementById("watchEmpty"),
};

const ORDER = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
const SEV_LIST = ["critical", "high", "medium", "low", "info"];
let activeGroupFilter = null;

// ═══ PERF COUNTERS (safe in prod; display gated by localStorage flag) ═══
var __flPerf = (window.__flPerf = window.__flPerf || {
  rerenderFindingsCount: 0,
  rerenderFindingsMsTotal: 0,
  lastRerenderFindingsMs: 0,
  lastRenderedRows: 0,
  lastFilterReason: null,
  scheduledRerenderCount: 0,
});

// ═══ RERENDER BATCHING ═══
var _rerenderScheduled = false;
var _rerenderReason = null;

// ═══ TOAST DEDUP ═══
var _lastToastKey = null;
var _lastToastTime = 0;
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
  _activeHighlightCtx: null,
  _toastTimer: null,
  running: false,
  _progressInterval: null,
  _progressStartedAt: 0,
  contrastData: [],
  contrastSamples: [],
  tabData: [],
  activeMode: "run",
  sevFilter: new Set(),
  groupByComponent: false,
  findingsByMode: {},
  contrastFilter: "all",
  hasRunMode: new Set(),
  topTab: "snap",
  pinnedFrameId: null,
  lastDiffSummary: "—",
  lastUsedFramesSummary: "—",
  lastPersistentStatus: { status: "IDLE", reason: "-", detail: "" },
  lastSelectionReason: "—",
  hasPersistentStatus: false,
  pageStructure: null,
};

/**
 * @typedef {"strict"|"heuristic"|"advisory"} Confidence
 * @typedef {"run"|"contrast"|"tabWalk"|"watch"|"observe"} Mode
 * @typedef {string} FrameKey
 */

const DEBUG_SESSION = false;
const MAX_STEPS = 100;
const MAX_RAW_APPENDIX_ENTRIES = MAX_STEPS * 2;
const RAW_SOFT_COMPACT_KEEP_RECENT = 30;
const MAX_SESSION_BYTES_ESTIMATE = 4_500_000;
// A11y outline (screen-reader view) — stored per step in compact form.
const MAX_A11Y_OUTLINE_STORED_NODES = 400;
const A11Y_OUTLINE_KEEP_RECENT = 10;
const MAX_A11Y_OUTLINE_DIFF_SHOWN = 25;
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

function deepFreeze(obj) {
  if (obj == null || typeof obj !== "object") return obj;
  Object.freeze(obj);
  for (const v of Object.values(obj)) {
    if (v != null && typeof v === "object" && !Object.isFrozen(v)) deepFreeze(v);
  }
  return obj;
}

// HostConfig: injected at build time via __HOST_CONFIG__ define.
// MUST NOT affect: stable signatures, diff logic, FrameKey, highlights.
// Only affects: targeting, profile defaults, UI labels, DOM scoping.
const hostConfig = typeof __HOST_CONFIG__ !== "undefined" ? __HOST_CONFIG__ : {
  id: "generic", defaultProfiles: [], rootSelector: null,
  match: { domSelectorsAny: [], urlIncludesAny: [], urlExcludesAny: [] },
  ui: {},
};
deepFreeze(hostConfig);

// --- Profile Registry ---
// Each profile defines detection heuristics for a UI composition type.
// Host-specific selectors belong in HostConfig, not in profile definitions.
const BUILTIN_PROFILES = {
  helpcenter: {
    label: "Help Center",
    description: "Targets help center iframes — adds tree, article and bot-specific WCAG checks",
    frame: {
      urlIncludes: [],
      domSelectors: [
        "[role='navigation'][aria-label]",
        "main article",
        "[role='main'] article",
      ],
    },
    modeHints: {
      "helpcenter-bot": {
        roles: [],
        testIds: [],
        url: null,
      },
      "helpcenter-tree": {
        roles: ["[role='tree']", "[role='treeitem']"],
        testIds: [],
        url: null,
      },
    },
  },
  chat: {
    label: "Chat",
    description: "Targets chat widgets — adds role=log, message boundary and input label checks",
    frame: {
      urlIncludes: [],
      domSelectors: ["[role='log']", "[role='feed']", "textarea"],
    },
    modeHints: {
      chat: {
        roles: ["[role='log']"],
        testIds: [],
        url: null,
      },
    },
  },
};

// Active profile state: { profiles: { [id]: profileObj }, active: string[] }
const profileState = {
  profiles: { ...BUILTIN_PROFILES },
  active: Array.isArray(hostConfig.defaultProfiles) && hostConfig.defaultProfiles.length > 0
    ? [...hostConfig.defaultProfiles]
    : [],
};

// --- Recipes: pre-configured capture strategies ---
const RECIPES = {
  auto: {
    label: "Auto",
    description: "Profile detection as default — no overrides",
    frameScope: null,
    depthMax: null,
    activeMode: null,
    profileAllowlist: null,
  },
  chat_widget: {
    label: "Embedded widget (chat-like)",
    description: "Embedded live widget — embedded scope, balanced depth, observe mode",
    frameScope: "embedded",
    depthMax: 2,
    activeMode: "observe",
    profileAllowlist: ["chat"],
  },
  helpcenter: {
    label: "Content portal (help/docs)",
    description: "Content portal with embedded widgets — embedded scope, full depth, observe mode",
    frameScope: "embedded",
    depthMax: 3,
    activeMode: "observe",
    profileAllowlist: ["helpcenter"],
  },
  hybrid: {
    label: "Hybrid (portal + widget)",
    description: "Multi-frame page — all frames, full depth, observe mode",
    frameScope: "all",
    depthMax: 3,
    activeMode: "observe",
    profileAllowlist: null,
  },
};
let activeRecipeId = "auto";
let activeRulePack = null; // { enabledRuleIds?: string[], disabledRuleIds?: string[] } or null

// --- Column sorting ---
const sortState = {
  explorer: { col: 0, dir: 'desc' },
  contrast: { col: null, dir: 'asc' },
  tab: { col: null, dir: 'asc' },
};

const SORT_KEYS = {
  explorer: [
    f => ORDER[f.severity] ?? -1, f => f.wcag ?? '', f => f.name ?? '', f => f.type ?? '',
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
  constructor({ wrapEl, tbodyEl, colCount, rowRenderer, detailRenderer, estimateRowHeight = 32, overscan = 10 }) {
    this.wrapEl = wrapEl;
    this.tbodyEl = tbodyEl;
    this.colCount = colCount;
    this.rowRenderer = rowRenderer;
    this.detailRenderer = detailRenderer || null;
    this.estimateRowHeight = estimateRowHeight;
    this.overscan = overscan;

    this.data = [];
    this.rowHeight = estimateRowHeight;
    this.selectedIdx = null;
    this.expandedIdx = null;

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
    this.expandedIdx = null;
    this.wrapEl.scrollTop = 0;
    this._render(true);
  }

  toggleExpanded(idx) {
    this.expandedIdx = this.expandedIdx === idx ? null : idx;
    this.selectedIdx = this.expandedIdx;
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
      for (let i = start; i < end; i++) {
        rows.push(this.rowRenderer(this.data[i], i));
        // Render detail row for expanded item
        if (i === this.expandedIdx && this.detailRenderer) {
          rows.push(this.detailRenderer(this.data[i], this.colCount));
        }
      }
      rows.push(`<tr class="vt-spacer" aria-hidden="true"><td colspan="${this.colCount}" style="height:${botPad}px"></td></tr>`);

      this.tbodyEl.innerHTML = rows.join("");

      // Re-apply selection highlight after render
      if (this.selectedIdx != null) {
        const sel = this.tbodyEl.querySelector(`tr[data-i="${this.selectedIdx}"]`);
        if (sel) sel.classList.add("isSelected");
      }

      // Measure row height from first real row if possible
      const firstRow = this.tbodyEl.querySelector("tr.trow");
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
    try {
      localStorage.setItem(__lsPrefix + k, JSON.stringify(v));
    } catch (e) {
      console.error(`storageSet: localStorage.setItem failed for key "${k}":`, e);
      throw e;
    }
  }
}
async function storageRemove(keys) {
  const ks = Array.isArray(keys) ? keys : [keys];
  if (__storageLocal) return await __storageLocal.remove(ks);
  for (const k of ks) localStorage.removeItem(__lsPrefix + k);
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

function toast(message, action) {
  if (!els.toast) return;
  // Dedup identical toasts within 700ms
  var toastKey = (action ? "action:" : "") + message;
  var now = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
  if (toastKey === _lastToastKey && (now - _lastToastTime) < 700) return;
  _lastToastKey = toastKey;
  _lastToastTime = now;
  els.toast.textContent = "";
  els.toast.appendChild(document.createTextNode(message));
  if (action?.label && typeof action.fn === "function") {
    const btn = document.createElement("button");
    btn.className = "toastAction";
    btn.textContent = action.label;
    btn.addEventListener("click", () => { els.toast.classList.remove("show"); action.fn(); }, { once: true });
    els.toast.appendChild(btn);
  }
  els.toast.classList.add("show");
  clearTimeout(state._toastTimer);
  state._toastTimer = setTimeout(() => els.toast.classList.remove("show"), action ? 4000 : 2500);
}

function renderSaveStatus(status, detail) {
  if (!els.saveStatusHud) return;
  els.saveStatusHud.hidden = false;
  els.saveStatusHud.dataset.status = status;
  const labels = { saved: "Saved", saving: "Saving\u2026", error: "Not saved" };
  const text = labels[status] || "Saved";
  els.saveStatusText.textContent = detail ? `${text} \u2014 ${detail}` : text;
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
  // Seed the inline CTA timer + progress bar for observe
  if (isObserve && els.runTimer) els.runTimer.textContent = `${durationSec}s`;
  if (isObserve && els.runCurrentMode) {
    els.runCurrentMode.style.setProperty("--cta-progress", "0%");
  }
  clearInterval(state._progressInterval);
  state._progressInterval = setInterval(() => {
    const elapsed = Math.max(0, (performance.now() - state._progressStartedAt) / 1000);
    remaining--;
    const pct = durationSec > 0 ? ((durationSec - Math.max(remaining, 0)) / durationSec) * 100 : 100;
    if (!isObserve && time) time.textContent = `${elapsed.toFixed(1)}s`;
    // Update inline CTA timer + progress bar for observe
    if (isObserve && els.runTimer) {
      els.runTimer.textContent = remaining > 0 ? `${Math.max(remaining, 0)}s` : "\u2026";
    }
    if (isObserve && els.runCurrentMode) {
      els.runCurrentMode.style.setProperty("--cta-progress", `${Math.min(pct, 100)}%`);
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
  if (els.runCurrentMode) els.runCurrentMode.style.removeProperty("--cta-progress");
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
    els.runIcon.hidden = !!busy;
  }
  if (els.runTimer) {
    els.runTimer.hidden = !(busy && isObserve);
    if (!busy) els.runTimer.textContent = "";
  }
  if (busy) {
    if (els.runLabel) {
      const busyLabels = { run: "Running\u2026", contrast: "Checking\u2026", tabWalk: "Walking\u2026", observe: "Observing\u2026", watch: "Watching\u2026" };
      els.runLabel.textContent = busyLabels[state.activeMode] || "Running\u2026";
    }
  } else {
    // Fully restore CTA appearance after run completes
    const cta = SNAP_CTA[state.activeMode] || SNAP_CTA.run;
    let label = cta.label;
    if (state.hasRunMode.has(state.activeMode)) label = SNAP_CTA_RERUN[state.activeMode] || label;
    if (els.runLabel) els.runLabel.textContent = label;
    els.runCurrentMode.className = "ctaBtn " + cta.cls;
    if (els.snapHelper) els.snapHelper.textContent = cta.helper;
    if (els.runIcon) els.runIcon.src = state.hasRunMode.has(state.activeMode) ? "icons/Rerun Icon.svg" : "icons/Run Icon.svg";
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
  run:      { label: "Run Audit",      cls: "ctaBtn--amber", helper: "One-shot WCAG audit of the current page" },
  contrast: { label: "Check Contrast", cls: "ctaBtn--cyan",  helper: "Check color contrast of up to 250 text nodes" },
  tabWalk:  { label: "Run Tab\u00A0Walk",   cls: "ctaBtn--lime",  helper: "Simulate Tab-key navigation through up to 80 elements" },
  observe:  { label: "Start Observe",  cls: "ctaBtn--teal",  helper: "Re-run the audit every ~1s for 12s to catch unstable UI" },
  watch:    { label: "Start Watch",    cls: "ctaBtn--mint",   helper: "Monitor live updates, loaders and focus loss for 40s" },
};

// Teaching copy for the main empty state, per snap mode.
const MODE_EMPTY_COPY = {
  run:      { text: "Run an audit to see results", hint: "Audit checks the page against WCAG success criteria and lists issues with fix suggestions" },
  observe:  { text: "Start Observe to see results", hint: "Observe re-runs the audit every second for 12 seconds \u2014 use it on pages that change as you interact" },
  watch:    { text: "Start Watch to see results", hint: "Watch monitors the page for 40 seconds and reports loading spinners, silent updates and focus loss" },
  tabWalk:  { text: "Run a Tab Walk to see results", hint: "Tab Walk presses Tab for you and records focus order, keyboard traps and skipped elements" },
  contrast: { text: "Run a Contrast check to see results", hint: "Contrast scans visible text and checks its color contrast against WCAG thresholds" },
};

function updateEmptyStateCopy(mode) {
  if (!els.emptyState || els.emptyState.hidden) return;
  if (els.emptyState.classList.contains("emptyState--error")) return;
  const copy = MODE_EMPTY_COPY[mode] || MODE_EMPTY_COPY.run;
  const txt = document.getElementById("emptyText");
  const hint = document.getElementById("emptyHint");
  if (txt) txt.textContent = copy.text;
  if (hint) hint.textContent = copy.hint;
}

const SNAP_CTA_RERUN = {
  run:      "Re-run Audit",
  contrast: "Re-check Contrast",
  tabWalk:  "Re-run Tab\u00A0Walk",
  observe:  "Re-start Observe",
  watch:    "Re-start Watch",
};

function updateSnapCta(mode) {
  if (state.running) return;
  const cta = SNAP_CTA[mode] || SNAP_CTA.run;
  let label = cta.label;
  if (state.hasRunMode.has(mode)) label = SNAP_CTA_RERUN[mode] || label;
  if (els.runLabel) els.runLabel.textContent = label;
  if (els.runCurrentMode) {
    els.runCurrentMode.className = "ctaBtn " + cta.cls;
  }
  if (els.snapHelper) els.snapHelper.textContent = cta.helper;
  if (els.runIcon) els.runIcon.src = state.hasRunMode.has(mode) ? "icons/Rerun Icon.svg" : "icons/Run Icon.svg";
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
    const filtered = applyAllFindingFilters(state.findingsByMode[mode]);
    state.currentFindings = filtered;
    renderSevTabs(filtered);
    renderExplorer(filtered);
  } else if (runLike) {
    renderSevTabs();
  }

  // Render contrast-specific tabs when switching to contrast
  if (mode === "contrast") {
    renderContrastSevTabs();
  }

  updateEmptyStateCopy(mode);
}

// ═══ VIEW ROUTING ═══
function showView(tab, sub) {
  // Update top-level tab
  if (tab) state.topTab = tab;
  const panels = { snap: els.snapContent, flow: els.flowContent, settings: els.settingsContent, about: els.aboutContent };
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

  // Auto-render about/diagnostics when switching to About
  if (state.topTab === "about") {
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
  // Count passes directly (matching updateContrastView's pass filter) instead
  // of total - fail: persisted records cap samples harder than failures, so
  // the subtraction can go negative after a reload.
  const pass = state.contrastSamples.filter(s => s.ratio >= s.required).length;
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
    // a11y outline is optional (older sessions never carried one) — normalize
    // anything malformed to null so all readers can rely on the shape.
    if (!step.a11yOutline || typeof step.a11yOutline !== "object" || !Array.isArray(step.a11yOutline.nodes)) {
      step.a11yOutline = null;
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
    <div class="flowCounter"><span class="flowCounterValue${blocking > 0 ? " flowCounterValue--red" : ""}">${blocking > 0 ? "+" : ""}${blocking}</span><span class="flowCounterLabel" title="High/medium severity issues that should block release">Must-fix</span></div>
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
  const hash = `${steps.length},${totalBlockingAdded},${blockingSteps.join(";")}`;
  if (hash === _verdictHash) return;
  _verdictHash = hash;
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
  if (hasSuspect || hasDegraded) {
    const reasons = [];
    if (hasDegraded) reasons.push("degraded signatures");
    if (hasRootMissing) reasons.push("root selector not found");
    else if (hasSuspect) reasons.push("low profile confidence");
    const tooltip = reasons.length ? reasons.join("; ") : "reduced confidence";
    diffConfNote = ` <span class="diffConfidenceReduced" title="${escapeHtml(tooltip)}">Diff confidence: reduced</span>`;
  }
  el.className = `flowVerdict ${wrapCls}`;
  el.innerHTML = `<span class="flowVerdictBadge ${badgeCls}">${badge}</span><span class="flowVerdictText">${escapeHtml(summary)}</span>${diffConfNote}`;
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

  // Screen-reader view (a11y outline) — guarded: older persisted sessions have
  // no a11yOutline, and it may have been pruned by the size guard.
  const currOutline = (step?.a11yOutline && Array.isArray(step.a11yOutline.nodes)) ? step.a11yOutline : null;
  const prevOutline = (prevStep?.a11yOutline && Array.isArray(prevStep.a11yOutline.nodes)) ? prevStep.a11yOutline : null;
  const outlineDiff = (currOutline && prevOutline)
    ? diffA11yOutlines(prevOutline.nodes, currOutline.nodes)
    : null;

  return { step, added, fixed, persisting, diff: step.diffs?.consolidated || {}, outline: currOutline, outlineDiff };
}

// ---- Screen reader view (a11y outline) drill-down rendering ----

/** One "+ role name" / "− role name" diff line. All page-derived text escaped. */
function a11yOutlineDiffLineHtml(entry, sign) {
  const role = escapeHtml(String(entry?.r || ""));
  const name = escapeHtml(txt(entry?.n || "", 60));
  const count = asNumber(entry?.count, 1);
  const countBadge = count > 1 ? `<span class="srOutlineCount">×${count}</span>` : "";
  return `<li class="srOutlineDiffItem"><span class="srOutlineSign ${sign === "+" ? "srOutlineSignAdd" : "srOutlineSignRemove"}">${sign === "+" ? "+" : "−"}</span>` +
    `<span class="srOutlineRole">${role}</span>` +
    `<span class="srOutlineName">${name || '<span class="structureEmpty">(no name)</span>'}</span>${countBadge}</li>`;
}

/** One node of the full outline listing — headings indented by level. */
function a11yOutlineNodeItemHtml(node) {
  const role = String(node?.r || "");
  const level = asNumber(node?.l, 0);
  const indent = role === "heading" && level > 1 ? (level - 1) * 14 : 0;
  const badge = role === "heading" && level >= 1 ? `h${level}` : role;
  const name = escapeHtml(txt(node?.n || "", 60));
  return `<li class="srOutlineItem" style="padding-left:${indent}px">` +
    `<span class="srOutlineRole">${escapeHtml(badge)}</span>` +
    `<span class="srOutlineName">${name || '<span class="structureEmpty">(no name)</span>'}</span></li>`;
}

/**
 * "Screen reader view changes" drill-down block: outline diff versus the
 * previous step (only when both steps carry an outline) plus a per-step
 * "View outline" toggle (<details> — keyboard accessible by default).
 * Returns "" when the step has no outline data (old sessions, pruned steps,
 * outline fetch failures) — no behavior change for sessions without outlines.
 */
function a11yOutlineSectionHtml(outline, outlineDiff) {
  if (!outline && !outlineDiff) return "";
  const parts = [];
  if (outlineDiff) {
    const renderDiffList = (entries, totalCount, sign) => {
      const list = Array.isArray(entries) ? entries : [];
      if (!totalCount) return "";
      const shown = list.slice(0, MAX_A11Y_OUTLINE_DIFF_SHOWN);
      const shownCount = shown.reduce((n, e) => n + asNumber(e?.count, 1), 0);
      const more = Math.max(0, totalCount - shownCount);
      return `<ul class="srOutlineDiffList">${shown.map(e => a11yOutlineDiffLineHtml(e, sign)).join("")}` +
        `${more > 0 ? `<li class="srOutlineDiffItem srOutlineMore">…and ${more} more</li>` : ""}</ul>`;
    };
    const addedHtml = renderDiffList(outlineDiff.added, asNumber(outlineDiff.addedCount, 0), "+");
    const removedHtml = renderDiffList(outlineDiff.removed, asNumber(outlineDiff.removedCount, 0), "-");
    const changesHtml = (addedHtml || removedHtml)
      ? `${addedHtml}${removedHtml}`
      : '<span style="color:var(--tx3);font-size:12px;">No changes</span>';
    parts.push(
      `<div class="stepDetailSection srOutlineSection">` +
      `<div class="stepDetailSectionTitle">Screen reader view changes (+${asNumber(outlineDiff.addedCount, 0)} / −${asNumber(outlineDiff.removedCount, 0)})</div>` +
      changesHtml +
      `</div>`
    );
  }
  if (outline && Array.isArray(outline.nodes) && outline.nodes.length) {
    parts.push(
      `<details class="srOutlineDetails"><summary class="srOutlineSummary">View outline (${asNumber(outline.count, outline.nodes.length)} nodes)</summary>` +
      `<ul class="srOutlineList">${outline.nodes.slice(0, MAX_A11Y_OUTLINE_STORED_NODES).map(a11yOutlineNodeItemHtml).join("")}</ul></details>`
    );
  }
  return parts.join("");
}

function renderStepDrillDown(stepIndex) {
  const tbody = document.querySelector("#flowTimelineTable tbody");
  if (!tbody) return;

  // --- Batch DOM reads ---
  const existing = tbody.querySelector(".stepDetailRow");
  const expandedRows = tbody.querySelectorAll("tr.isExpanded");
  let targetRow = null;
  for (const r of tbody.querySelectorAll("tr.trow")) {
    if (Number(r.dataset.stepIndex) === stepIndex) { targetRow = r; break; }
  }

  // --- Batch DOM writes ---
  if (existing) existing.remove();
  expandedRows.forEach(r => r.classList.remove("isExpanded"));

  // Toggle: if same step, just collapse
  if (sessionState.expandedStepIndex === stepIndex) {
    sessionState.expandedStepIndex = null;
    return;
  }

  sessionState.expandedStepIndex = stepIndex;
  const data = buildStepDrillDownData(stepIndex);
  if (!data) return;
  if (!targetRow) return;
  targetRow.classList.add("isExpanded");

  const s = data.step;
  const d = data.diff;

  // Collect all findings for highlight click handler
  const _drillFindings = [];
  const renderFindingList = (findings, max = 30) => {
    if (!findings.length) return '<span style="color:var(--tx3);font-size:12px;">None</span>';
    const startIdx = _drillFindings.length;
    const sliced = findings.slice(0, max);
    _drillFindings.push(...sliced);
    return `<ul class="stepFindingList">${sliced.map((f, i) => {
      const sev = escapeHtml(f.severity || "info");
      const type = escapeHtml(f.type || f.product || "");
      const note = escapeHtml(txt(f.note || f.name || "", 100));
      return `<li class="stepFindingItem"><span class="stepFindingSev ${sev}">${sev}</span><span class="stepFindingType">${type}</span><span class="stepFindingNote">${note}</span><button class="rowAct stepHighlight" type="button" data-drill-i="${startIdx + i}" aria-label="Highlight">Highlight</button></li>`;
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
      ${(() => { const _cov = s.snapshots?.run?.best?.shadowCoverage; const _fmt = formatShadowCoverage(_cov); if (!_fmt.text) return ""; const _b = _fmt.badges.map(b => `<span class="shadowCoverageBadge shadowCoverageBadge--${escapeHtml(b.kind)}">${escapeHtml(b.label)}</span>`).join(" "); return `<dt>Shadow</dt><dd>${escapeHtml(_fmt.text)} ${_b}</dd>`; })()}
    </dl>
    <div class="stepDetailSection">
      <div class="stepDetailSectionTitle">Added (${data.added.length})</div>
      ${renderFindingList(data.added)}
    </div>
    <div class="stepDetailSection">
      <div class="stepDetailSectionTitle">Fixed (${data.fixed.length})</div>
      ${renderFindingList(data.fixed)}
    </div>
    ${a11yOutlineSectionHtml(data.outline, data.outlineDiff)}
  `;

  const detailRow = document.createElement("tr");
  detailRow.className = "stepDetailRow";
  detailRow.innerHTML = `<td colspan="7"><div class="stepDetail">${detailHtml}</div></td>`;
  targetRow.after(detailRow);

  // Delegate highlight clicks on drill-down findings
  detailRow.addEventListener("click", async (e) => {
    const btn = e.target.closest(".stepHighlight");
    if (!btn) return;
    e.stopPropagation();
    const fi = Number(btn.dataset.drillI);
    const finding = Number.isFinite(fi) ? _drillFindings[fi] : null;
    if (finding) await highlightFinding(finding, state._activeHighlightCtx);
  });
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
  // Onboarding hint: only while idle with nothing recorded yet
  const flowIdleHint = document.getElementById("flowIdleHint");
  if (flowIdleHint) flowIdleHint.hidden = hasSession || !!sessionState.lastEndedSession;
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
  if (els.exportSessionJunitMenu) {
    els.exportSessionJunitMenu.hidden = !hasExportableSession;
    const desc = els.exportSessionJunitMenu.querySelector(".dd");
    if (desc) desc.textContent = hasSession ? "Active session" : "Last ended session";
  }
  if (els.exportDiffReportMenu) {
    const sess = sessionState.current || sessionState.lastEndedSession;
    const hasMultiStep = (sess?.steps?.length || 0) >= 2;
    els.exportDiffReportMenu.hidden = !(hasExportableSession && hasMultiStep);
  }
  if (els.exportAnchor) els.exportAnchor.hidden = !((state.records.length > 0) || hasExportableSession);
  renderSessionHud();
}

async function persistActiveSessionBestEffort(session) {
  if (!session) return false;
  const { origin, env } = getCurrentScopeInfo();
  const keys = getSessionKeys(origin || session.inspectedOrigin || "", env || "prod");
  const estimatedBytes = estimateJsonBytes(session);
  renderSaveStatus("saving");
  try {
    await storageSet({ [keys.active]: session });
    sessionState.lastPersistReasonCode = "-";
    debugSession("persist_active_ok", { estimatedBytes });
    renderSaveStatus("saved");
    return true;
  } catch (err) {
    const reason = classifyPersistReason(err);
    console.warn("persist active session failed", { reason, err });
    // Only retry for transient errors — quota errors won't resolve on retry
    if (reason === "TRANSIENT") {
      try {
        await storageSet({ [keys.active]: session });
        sessionState.lastPersistReasonCode = "-";
        renderSaveStatus("saved");
        return true;
      } catch (retryErr) {
        const retryReason = classifyPersistReason(retryErr);
        toast("Session save failed \u2014 data may be lost if DevTools closes");
        sessionState.lastPersistReasonCode = retryReason;
        debugSession("persist_active_fail", { estimatedBytes, error: String(retryErr?.message || retryErr) });
        renderSaveStatus("error", retryReason === "QUOTA_EXCEEDED" ? "quota" : "error");
        return false;
      }
    }
    toast("Session save failed \u2014 storage quota exceeded");
    sessionState.lastPersistReasonCode = reason;
    debugSession("persist_active_fail", { estimatedBytes, error: String(err?.message || err) });
    renderSaveStatus("error", "quota");
    return false;
  }
}

const _archiveInFlight = new Set(); // prevent duplicate archive writes per sessionId
async function archiveSessionBestEffort(session) {
  if (!session) return false;
  const sessionId = session.id || "";
  if (_archiveInFlight.has(sessionId)) {
    debugSession("archive_skipped_inflight", { sessionId });
    return false;
  }
  _archiveInFlight.add(sessionId);
  try {
    const { origin, env } = getCurrentScopeInfo();
    const keys = getSessionKeys(origin || session.inspectedOrigin || "", env || "prod", session.id);
    const estimatedBytes = estimateJsonBytes(session);
    renderSaveStatus("saving");
    try {
      await storageSet({
        [keys.archive]: session,
        [getSessionKeys(origin || session.inspectedOrigin || "", env || "prod").active]: null
      });
      await updateArchiveIndex({ key: keys.archive, id: String(session.id), startedAt: session.startedAt || "" });
      sessionState.lastArchiveId = session.id;
      debugSession("archive_ok", { estimatedBytes });
      renderSaveStatus("saved");
      return true;
    } catch (err) {
      const reason = classifyPersistReason(err);
      console.warn("archive session failed", { reason, err });
      toast(`Session archive failed \u2014 ${reason === "QUOTA_EXCEEDED" ? "quota exceeded" : "storage error"}`);
      debugSession("archive_fail", { estimatedBytes, error: String(err?.message || err) });
      renderSaveStatus("error", reason === "QUOTA_EXCEEDED" ? "quota" : "error");
      return false;
    }
  } finally {
    _archiveInFlight.delete(sessionId);
  }
}

// ---- Session comparison ----

// Archives are tracked in an index key so listing them costs a few targeted
// reads instead of deserializing the entire store, and so old archives can be
// pruned (chrome.storage.local has a ~10MB quota; archives used to accumulate
// forever).
const ARCHIVE_INDEX_KEY = "session::archiveIndex";
const MAX_ARCHIVED_SESSIONS = 10;

async function loadArchiveIndex() {
  try {
    const got = await storageGet([ARCHIVE_INDEX_KEY]);
    const idx = got?.[ARCHIVE_INDEX_KEY];
    if (Array.isArray(idx)) return idx.filter(e => e && typeof e.key === "string");
  } catch (err) {
    console.warn("loadArchiveIndex failed", err);
  }
  return null;
}

/** One-time migration: full-store scan to discover pre-index archives. */
async function rebuildArchiveIndex() {
  const prefix = "session::archive::";
  const entries = [];
  try {
    if (__storageLocal) {
      const all = await __storageLocal.get(null);
      for (const [key, val] of Object.entries(all || {})) {
        if (key.startsWith(prefix) && val && typeof val === "object" && val.id) {
          entries.push({ key, id: String(val.id), startedAt: val.startedAt || "" });
        }
      }
    } else {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || "";
        if (!k.startsWith(__lsPrefix + prefix)) continue;
        const key = k.slice(__lsPrefix.length);
        try {
          const val = JSON.parse(localStorage.getItem(k));
          if (val && typeof val === "object" && val.id) {
            entries.push({ key, id: String(val.id), startedAt: val.startedAt || "" });
          }
        } catch { /* corrupted entry */ }
      }
    }
    entries.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
    await storageSet({ [ARCHIVE_INDEX_KEY]: entries });
  } catch (err) {
    console.warn("rebuildArchiveIndex failed", err);
  }
  return entries;
}

/** Register an archive in the index and prune beyond MAX_ARCHIVED_SESSIONS. */
async function updateArchiveIndex(newEntry) {
  try {
    let index = await loadArchiveIndex();
    if (index === null) index = await rebuildArchiveIndex();
    index = [newEntry, ...index.filter(e => e.key !== newEntry.key)];
    index.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
    const drop = index.slice(MAX_ARCHIVED_SESSIONS);
    index = index.slice(0, MAX_ARCHIVED_SESSIONS);
    if (drop.length) await storageRemove(drop.map(e => e.key));
    await storageSet({ [ARCHIVE_INDEX_KEY]: index });
  } catch (err) {
    console.warn("updateArchiveIndex failed", err);
  }
}

async function listArchivedSessions() {
  try {
    let index = await loadArchiveIndex();
    if (index === null) index = await rebuildArchiveIndex();
    const got = index.length ? await storageGet(index.map(e => e.key)) : {};
    const sessions = [];
    for (const e of index) {
      const val = got?.[e.key];
      if (val && typeof val === "object" && val.id) sessions.push(val);
    }
    // Also include current/lastEnded if available
    if (sessionState.lastEndedSession?.id) {
      const exists = sessions.some(s => s.id === sessionState.lastEndedSession.id);
      if (!exists) sessions.push(sessionState.lastEndedSession);
    }
    sessions.sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));
    return sessions;
  } catch (err) {
    console.warn("listArchivedSessions failed", err);
    return [];
  }
}

function _sessionSummaryStats(sess) {
  const steps = Array.isArray(sess?.steps) ? sess.steps : [];
  let added = 0, fixed = 0, persisting = 0, blockingAdded = 0, blockingFixed = 0;
  for (const s of steps) {
    const d = s.diffs?.consolidated || {};
    added += d.added || 0;
    fixed += d.fixed || 0;
    persisting += d.persisting || 0;
    blockingAdded += d.blockingAdded || 0;
    blockingFixed += d.blockingFixed || 0;
  }
  return { steps: steps.length, added, fixed, persisting, blockingAdded, blockingFixed, blocking: blockingAdded - blockingFixed };
}

function _sessionOptionLabel(sess) {
  const date = sess.startedAt ? new Date(sess.startedAt).toLocaleString() : "?";
  const steps = Array.isArray(sess.steps) ? sess.steps.length : 0;
  return `${date} (${steps} steps)`;
}

async function populateCompareSelects() {
  const selectA = document.getElementById("compareSelectA");
  const selectB = document.getElementById("compareSelectB");
  const section = document.getElementById("flowCompare");
  if (!selectA || !selectB || !section) return;
  const sessions = await listArchivedSessions();
  if (sessions.length < 2) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const options = sessions.map(s => `<option value="${escapeHtml(s.id)}">${escapeHtml(_sessionOptionLabel(s))}</option>`).join("");
  selectA.innerHTML = options;
  selectB.innerHTML = options;
  // Default: A = oldest, B = newest
  if (sessions.length >= 2) {
    selectA.value = sessions[sessions.length - 1].id;
    selectB.value = sessions[0].id;
  }
}

function runSessionComparison() {
  const selectA = document.getElementById("compareSelectA");
  const selectB = document.getElementById("compareSelectB");
  const resultEl = document.getElementById("compareResult");
  if (!selectA || !selectB || !resultEl) return;
  listArchivedSessions().then(sessions => {
    const sessA = sessions.find(s => s.id === selectA.value);
    const sessB = sessions.find(s => s.id === selectB.value);
    if (!sessA || !sessB) { toast("Select two sessions"); return; }
    if (sessA.id === sessB.id) { toast("Select two different sessions"); return; }
    const a = _sessionSummaryStats(sessA);
    const b = _sessionSummaryStats(sessB);
    const delta = (valB, valA, lowerIsBetter = true) => {
      const d = valB - valA;
      if (d === 0) return `<span class="compareDelta--same">—</span>`;
      const better = lowerIsBetter ? d < 0 : d > 0;
      const cls = better ? "compareDelta--better" : "compareDelta--worse";
      return `<span class="${cls}">${d > 0 ? "+" : ""}${d}</span>`;
    };
    // Shadow coverage warning between sessions
    const stepsA = Array.isArray(sessA.steps) ? sessA.steps : [];
    const stepsB = Array.isArray(sessB.steps) ? sessB.steps : [];
    const lastSnapA = stepsA.length ? stepsA[stepsA.length - 1]?.snapshots?.run?.best : null;
    const lastSnapB = stepsB.length ? stepsB[stepsB.length - 1]?.snapshots?.run?.best : null;
    const covWarning = checkShadowCoverageChange(lastSnapA, lastSnapB);
    const covBannerHtml = covWarning
      ? `<div class="shadowCoverageWarningBanner">${escapeHtml(formatShadowCoverageWarning(covWarning))}</div>`
      : "";
    resultEl.innerHTML = `${covBannerHtml}
      <table class="compareTable">
        <thead><tr><th>Metric</th><th>A</th><th>B</th><th>Delta</th></tr></thead>
        <tbody>
          <tr><td>Steps</td><td>${a.steps}</td><td>${b.steps}</td><td>${delta(b.steps, a.steps, false)}</td></tr>
          <tr><td>New issues</td><td>${a.added}</td><td>${b.added}</td><td>${delta(b.added, a.added)}</td></tr>
          <tr><td>Fixed</td><td>${a.fixed}</td><td>${b.fixed}</td><td>${delta(b.fixed, a.fixed, false)}</td></tr>
          <tr><td>Persisting</td><td>${a.persisting}</td><td>${b.persisting}</td><td>${delta(b.persisting, a.persisting)}</td></tr>
          <tr><td>Must-fix added</td><td>${a.blockingAdded}</td><td>${b.blockingAdded}</td><td>${delta(b.blockingAdded, a.blockingAdded)}</td></tr>
          <tr><td>Net must-fix</td><td>${a.blocking}</td><td>${b.blocking}</td><td>${delta(b.blocking, a.blocking)}</td></tr>
          <tr><td>Verdict</td><td>${a.blockingAdded === 0 ? "PASS" : "FAIL"}</td><td>${b.blockingAdded === 0 ? "PASS" : "FAIL"}</td><td>${a.blockingAdded === 0 && b.blockingAdded > 0 ? '<span class="compareDelta--worse">Regressed</span>' : b.blockingAdded === 0 && a.blockingAdded > 0 ? '<span class="compareDelta--better">Improved</span>' : '<span class="compareDelta--same">—</span>'}</td></tr>
        </tbody>
      </table>
    `;
    resultEl.hidden = false;
  });
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

function _showSessionResumePrompt(origin, env) {
  const sess = sessionState.current;
  if (!sess) return;
  const steps = Array.isArray(sess.steps) ? sess.steps.length : 0;
  const started = sess.startedAt ? new Date(sess.startedAt).toLocaleString() : "unknown";
  const banner = document.createElement("div");
  banner.className = "sessionResumeBanner";
  banner.setAttribute("role", "alert");
  banner.innerHTML = `
    <span class="sessionResumeText">Previous session found (${steps} step${steps !== 1 ? "s" : ""}, started ${escapeHtml(started)})</span>
    <button class="btn btn--sm sessionResumeBtn" type="button" data-action="resume">Resume</button>
    <button class="btn btn--sm btn--outline sessionResumeBtn" type="button" data-action="discard">Discard</button>
  `;
  banner.addEventListener("click", async (e) => {
    const action = e.target.closest("[data-action]")?.dataset?.action;
    if (!action) return;
    banner.remove();
    if (action === "discard") {
      const keys = getSessionKeys(origin || "", env || "");
      try { await storageSet({ [keys.active]: null }); } catch {}
      sessionState.current = null;
      sessionState.lastMarkStep = null;
      updateSessionButtons();
      toast("Orphaned session discarded");
    } else {
      toast("Session resumed");
    }
  });
  const target = document.getElementById("flowSessionInfo");
  if (target) target.before(banner);
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
      frameKeyStable: best.frameKeyStable || null,
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
      frameKeyStable: f?.frameKeyStable || null,
      ok: !!f?.ok,
      normalized: normalizedNoRaw,
      error: f?.error || null,
      reason: f?.reason || null,
    };
  }) : [];

  return { mode, capturedAt, best: bestOut, perFrame, targeting: targeting || null };
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

/**
 * Drop a11y outlines from steps older than the last `keepRecent` (size guard —
 * called when the estimated session size exceeds MAX_SESSION_BYTES_ESTIMATE).
 * Diff/signature data is untouched; the drill-down simply hides the
 * "Screen reader view changes" block for pruned steps.
 * @returns {number} how many step outlines were removed
 */
function pruneSessionA11yOutlines(session, keepRecent = A11Y_OUTLINE_KEEP_RECENT) {
  if (!session || !Array.isArray(session.steps)) return 0;
  const cut = Math.max(0, session.steps.length - keepRecent);
  let removed = 0;
  for (let i = 0; i < cut; i++) {
    const step = session.steps[i];
    if (step && typeof step === "object" && step.a11yOutline) {
      step.a11yOutline = null;
      removed += 1;
    }
  }
  return removed;
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

// --- Upgrade: Overlay allowed modes ---

const OVERLAY_ALLOWED_MODES = new Set(["run"]);

function buildDeterminismMeta(session) {
  const out = {
    schemaVersion: asNumber(session?.schemaVersion, 3),
    signatureVersion: asNumber(session?.signatureVersion, 2),
    frameKeyVersion: asNumber(session?.frameKeyVersion, 1),
    enMappingVersion: asNumber(session?.enMappingVersion, 1),
    totalSteps: Array.isArray(session?.steps) ? session.steps.length : 0,
    perStepFrameKeys: [],
    shadowCoverageSummary: [],
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
    // Per-step shadow coverage summary
    const cov = step?.snapshots?.run?.best?.shadowCoverage;
    out.shadowCoverageSummary.push(cov ? {
      scopesAudited: cov.scopesAudited,
      scopesCapped: cov.scopesCapped,
      depthLimitReached: cov.depthLimitReached,
    } : null);
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
  // Promote per-step shadowCoverage to step level for export consumers
  for (const step of clone.steps || []) {
    const cov = step?.snapshots?.run?.best?.shadowCoverage || null;
    step.shadowCoverage = cov || null;
  }
  // Compute shadow coverage change warnings between consecutive steps
  clone.shadowCoverageWarnings = computeSessionShadowWarnings(clone.steps || []);
  clone.determinismMeta = buildDeterminismMeta(clone);
  // WCAG coverage: engine once + per-step observed
  clone.engineCoverage = engineCoverageSummary();
  // Run config summary for CI/export consumers
  const lastStep = (clone.steps || []).slice(-1)[0];
  clone.runConfigSummary = {
    recipeId: lastStep?.recipeId || "auto",
    depthMax: lastStep?.depthMax || 3,
    profileLabel: lastStep?.profileLabel || null,
    profileConfidence: lastStep?.profileConfidence || null,
    profileMatchSignals: lastStep?.profileMatchSignals || [],
    frameScope: clone.settings?.scopeAtCapture || clone.settings?.targetModeAtCapture || "primary",
    rulePack: lastStep?.rulePack || null,
    reducedDiffConfidence: (clone.steps || []).some(s => s.profileSuspect === true) ||
      (clone.steps || []).some(s => s.stableSignatures?.run?.stepQuality?.degraded === true),
  };
  for (const step of clone.steps || []) {
    const findings = step?.snapshots?.run?.best?.result?.findings
      || step?.snapshots?.run?.best?.findings || [];
    step.observedCoverage = runCoverageObserved(Array.isArray(findings) ? findings : []);
  }
  return clone;
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

/** Shared row renderers — used by both VirtualTable and fallback paths. */
function explorerRowHtml(f, idx) {
  const sev = f.severity || 'info';
  const isCrossFrame = !f.el && (typeof RULE_TO_WCAG !== "undefined") && RULE_TO_WCAG[f.type]?.group === "depth3/multiframe";
  const crossBadge = isCrossFrame ? ' <span class="badge crossFrame">Cross-frame</span>' : '';
  const groupCount = Number(f._groupCount) || 0;
  const groupBadge = groupCount > 1
    ? ` <span class="badge groupCount" title="${groupCount} instances of this component">&times;${groupCount}</span>`
    : '';
  return `<tr class="trow" tabindex="0" data-i="${idx}" data-sev="${escapeHtml(sev)}"${isCrossFrame ? ' data-crossframe="1"' : ''}><td><span class="pill ${escapeHtml(sev)}">${escapeHtml(sev)}</span></td><td>${escapeHtml(f.wcag ?? "")}</td><td>${cellHtml(f.name, 50)}${crossBadge}${groupBadge}</td><td>${cellHtml(f.type ?? "", 30)}</td></tr>`;
}
function contrastRowHtml(f, idx) {
  const pass = f.ratio >= f.required;
  return `<tr class="trow${pass ? ' contrastPass' : ''}" tabindex="0" data-i="${idx}"><td>${escapeHtml(String(f.ratio ?? ""))}</td><td>${escapeHtml(String(f.required ?? ""))}</td><td>${f.largeText ? "yes" : "no"}</td><td>${cellHtml(f.text, 50)}</td><td>${escapeHtml(f.tag ?? "")}</td><td>${escapeHtml(f.testId ?? "")}</td><td>${cellHtml(f.path, 60)}</td><td>${cellHtml(f.note, 50)}</td></tr>`;
}
function tabRowHtml(e, idx) {
  return `<tr class="trow" tabindex="0" data-i="${idx}"><td>${escapeHtml(String(e.i ?? ""))}</td><td>${escapeHtml(String(e.type ?? ""))}</td><td>${escapeHtml(String(e.tabIndex ?? ""))}</td><td>${cellHtml(e.name, 50)}</td><td>${cellHtml(e.path, 60)}</td><td>${cellHtml(e.note, 50)}</td></tr>`;
}

function txt(s, n = 140) {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function actionIsWatch(resultObj) {
  // watch() summary in snippet stores e.g. bursts/silentMs/totalLoadingMs/focusLossCount
  return !!(resultObj && ("silentMs" in resultObj || "bursts" in resultObj) && ("focusLossCount" in resultObj));
}

/**
 * Render shadow coverage receipt into a container element.
 * @param {HTMLElement|null} containerEl
 * @param {object|null|undefined} shadowCoverage
 */
function renderShadowCoverage(containerEl, shadowCoverage) {
  if (!containerEl) return;
  const fmt = formatShadowCoverage(shadowCoverage);
  if (!fmt.text) {
    containerEl.hidden = true;
    containerEl.innerHTML = "";
    return;
  }
  const badgeHtml = fmt.badges.map(b =>
    `<span class="shadowCoverageBadge shadowCoverageBadge--${escapeHtml(b.kind)}">${escapeHtml(b.label)}</span>`
  ).join("");
  containerEl.innerHTML = `<span>${escapeHtml(fmt.text)}</span>${badgeHtml}`;
  containerEl.hidden = false;
}

function renderRunSummary(r, rec = null) {
  if (!r) {
    renderSevTabs();
    renderShadowCoverage(els.shadowCoverageRow, null);
    return;
  }
  const findings = Array.isArray(r?.findings) ? r.findings : [];
  renderSevTabs(findings);
  renderShadowCoverage(els.shadowCoverageRow, r?.shadowCoverage || null);
}

// ═══ PAGE STRUCTURE (Snap tab) ═══

function structureHeadingItemHtml(h) {
  const level = Math.min(Math.max(Number(h?.level) || 1, 1), 6);
  const hasSkip = Array.isArray(h?.issues) && h.issues.includes("level_skip");
  const issue = hasSkip
    ? '<span class="structureIssue" title="Heading level jumps more than one level from the previous heading (WCAG 1.3.1)">level skip</span>'
    : "";
  const text = txt(h?.text || "", 80);
  return `<li style="padding-left:${(level - 1) * 14}px" title="${escapeHtml(h?.path || "")}">` +
    `<span class="structureTag">H${level}</span>` +
    `${text ? escapeHtml(text) : '<span class="structureEmpty">(empty)</span>'}${issue}</li>`;
}

function structureLandmarkItemHtml(l) {
  const hasDup = Array.isArray(l?.issues) && l.issues.includes("duplicate_unlabeled");
  const issue = hasDup
    ? '<span class="structureIssue" title="Same landmark role appears more than once without a distinct label (WCAG 1.3.1)">duplicate</span>'
    : "";
  const label = l?.label
    ? escapeHtml(txt(l.label, 80))
    : '<span class="structureEmpty">(no label)</span>';
  return `<li title="${escapeHtml(l?.path || "")}">` +
    `<span class="structureTag">${escapeHtml(String(l?.role || ""))}</span>${label}${issue}</li>`;
}

function renderPageStructure(structure) {
  const s = structure || {};
  const headings = Array.isArray(s.headings) ? s.headings : [];
  const landmarks = Array.isArray(s.landmarks) ? s.landmarks : [];
  if (els.structureHeadingsList) {
    els.structureHeadingsList.innerHTML = headings.length
      ? headings.map(structureHeadingItemHtml).join("")
      : '<li class="structureEmpty">No headings found</li>';
  }
  if (els.structureLandmarksList) {
    els.structureLandmarksList.innerHTML = landmarks.length
      ? landmarks.map(structureLandmarkItemHtml).join("")
      : '<li class="structureEmpty">No landmarks found</li>';
  }
  if (els.structureSummary) {
    const sum = s.summary || {};
    const capped = sum.headingsCapped || sum.landmarksCapped ? " • capped" : "";
    els.structureSummary.textContent =
      `H1: ${Number(sum.h1Count) || 0} • Headings: ${Number(sum.headingCount) || 0}` +
      ` • Landmarks: ${Number(sum.landmarkCount) || 0} • Issues: ${Number(sum.issues) || 0}${capped}`;
  }
}

// ═══ GUIDED CHECKS (Snap tab wizard) ═══
// Wizard-style semi-automated tests for undecidable rules (IGT-lite pattern).
// Candidates come from the snippet (GET_GUIDED_CANDIDATES); each answer is
// turned into a finding via buildGuidedFinding (signature-engine.js) and the
// collected findings are merged into the run explorer view at the end.

// Question + answer sets per guided kind ("Skip" is always appended).
const GUIDED_CHECK_QUESTIONS = {
  images: "Does this description convey the image's purpose?",
  controls: "Out of context, does this label tell the user what will happen?",
};
const GUIDED_CHECK_ANSWERS = {
  images: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    { value: "decorative", label: "It's decorative" },
  ],
  controls: [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
};

// Wizard state — in memory only; re-runnable; nothing persisted beyond the
// findings merged into the run explorer view.
const guidedState = { active: false, kind: null, candidates: [], index: 0, findings: [] };

function setGuidedStartersDisabled(disabled) {
  if (els.guidedStartImages) els.guidedStartImages.disabled = !!disabled;
  if (els.guidedStartControls) els.guidedStartControls.disabled = !!disabled;
}

/** Reset wizard state + UI. Safe to call at any time; makes the wizard re-runnable. */
function resetGuidedWizard() {
  guidedState.active = false;
  guidedState.kind = null;
  guidedState.candidates = [];
  guidedState.index = 0;
  guidedState.findings = [];
  if (els.guidedWizard) els.guidedWizard.hidden = true;
  if (els.guidedCancel) els.guidedCancel.hidden = true;
  if (els.guidedStatus) els.guidedStatus.textContent = "";
  if (els.guidedCandidate) els.guidedCandidate.textContent = "";
  if (els.guidedQuestion) els.guidedQuestion.textContent = "";
  if (els.guidedAnswers) els.guidedAnswers.textContent = "";
  setGuidedStartersDisabled(false);
}

/** Real <button type="button"> answers (keyboard accessible); no inline handlers. */
function renderGuidedAnswerButtons() {
  if (!els.guidedAnswers) return;
  els.guidedAnswers.textContent = "";
  const answers = (GUIDED_CHECK_ANSWERS[guidedState.kind] || []).concat([{ value: "skip", label: "Skip" }]);
  for (const a of answers) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn xs";
    btn.dataset.guidedAnswer = a.value;
    btn.textContent = a.label;
    els.guidedAnswers.appendChild(btn);
  }
}

/** Render the current candidate. Page-derived strings only via textContent. */
function renderGuidedStep() {
  if (!guidedState.active) return;
  const total = guidedState.candidates.length;
  const c = guidedState.candidates[guidedState.index] || {};
  if (els.guidedStatus) els.guidedStatus.textContent = `Candidate ${guidedState.index + 1} of ${total}`;
  if (els.guidedQuestion) els.guidedQuestion.textContent = GUIDED_CHECK_QUESTIONS[guidedState.kind] || "";
  if (els.guidedCandidate) {
    els.guidedCandidate.textContent = "";
    const nameEl = document.createElement("div");
    nameEl.className = "guidedName";
    nameEl.textContent = c.name ? `Name: “${txt(c.name, 120)}”` : "Name: (empty)";
    const pathEl = document.createElement("div");
    pathEl.className = "guidedPath";
    pathEl.textContent = txt(c.path || "", 160);
    els.guidedCandidate.appendChild(nameEl);
    els.guidedCandidate.appendChild(pathEl);
  }
}

function buildGuidedHighlightPayload(candidate) {
  const c = candidate || {};
  return {
    path: c.path || null,
    name: c.name || null,
    tag: (c.extra && c.extra.tag) || null,
    role: (c.extra && c.extra.role) || null,
  };
}

/** Show the current candidate in the panel and highlight it on the page. */
async function showGuidedCandidate() {
  renderGuidedStep();
  const c = guidedState.candidates[guidedState.index];
  if (c && c.path) {
    try {
      await highlightFinding(buildGuidedHighlightPayload(c), state._activeHighlightCtx);
    } catch { /* highlight is best-effort during guided checks */ }
  }
}

/** Fetch candidates for a kind ("images" | "controls") and start the wizard. */
async function startGuidedWizard(kind) {
  if (guidedState.active || state.running) return;
  let res;
  try {
    res = await send({ type: "GET_GUIDED_CANDIDATES", frameId: state.bestFrameId ?? 0, kind });
  } catch {
    toast("Guided check failed (runtime unavailable)");
    return;
  }
  if (!res?.ok || !Array.isArray(res.candidates)) {
    toast(`Guided check failed (${res?.error || "unknown"})`);
    return;
  }
  if (!res.candidates.length) {
    toast(kind === "images" ? "No visible images found" : "No short/generic control labels found");
    return;
  }
  resetGuidedWizard();
  guidedState.active = true;
  guidedState.kind = kind;
  guidedState.candidates = res.candidates;
  if (els.guidedSection) els.guidedSection.open = true;
  if (els.guidedWizard) els.guidedWizard.hidden = false;
  if (els.guidedCancel) els.guidedCancel.hidden = false;
  setGuidedStartersDisabled(true);
  renderGuidedAnswerButtons();
  if (res.truncated) toast(`Reviewing the first ${res.candidates.length} candidates (list capped)`);
  await showGuidedCandidate();
}

/** Record one answer ("skip" records nothing) and advance the wizard. */
async function answerGuidedCandidate(answer) {
  if (!guidedState.active) return;
  const candidate = guidedState.candidates[guidedState.index];
  if (candidate && answer && answer !== "skip") {
    const finding = buildGuidedFinding(guidedState.kind, answer, candidate);
    if (finding) guidedState.findings.push(finding);
  }
  guidedState.index += 1;
  if (guidedState.index >= guidedState.candidates.length) {
    finishGuidedWizard();
  } else {
    await showGuidedCandidate();
  }
}

/** Merge collected findings into the run explorer view and reset the wizard. */
function finishGuidedWizard() {
  const findings = applyFixSuggestions(guidedState.findings.slice());
  resetGuidedWizard();
  if (findings.length) {
    mergeGuidedFindings(findings);
    toast(`Guided check done — ${findings.length} finding${findings.length === 1 ? "" : "s"} added`);
  } else {
    toast("Guided check done — no findings");
  }
}

/**
 * Append guided findings to the current run view (state.findingsByMode.run,
 * created if absent) and rerender via the existing pipeline so severity tabs,
 * counts and the explorer include them. In-memory only.
 */
function mergeGuidedFindings(findings) {
  if (!Array.isArray(findings) || !findings.length) return;
  const existing = Array.isArray(state.findingsByMode.run) ? state.findingsByMode.run : [];
  state.findingsByMode.run = existing.concat(findings);
  state.currentFindings = applyAllFindingFilters(state.findingsByMode.run);
  state.hasRunMode.add("run");
  setPressed("run");
  updateResultsVisibility(true);
  showMode("run");
  rerenderFindings("guided_checks");
}

// ═══ WEIGHTED SCORE CHIP + MANUAL CHECKS ═══

/**
 * Render the weighted score chip next to the persistent status line.
 * Uses computeWeightedScore() (signature-engine.js) — see the formula
 * comment there. Pass null/undefined to hide the chip.
 */
function renderScoreChip(findings) {
  if (!els.scoreChip) return;
  if (!Array.isArray(findings)) {
    els.scoreChip.hidden = true;
    return;
  }
  const { score, weights } = computeWeightedScore(findings);
  els.scoreChip.textContent = `Score ${score}`;
  els.scoreChip.title =
    `Weighted accessibility score (0-100). Severity weights: high=${weights.high}, ` +
    `medium=${weights.medium}, low=${weights.low}, info=${weights.info}. ` +
    "score = round(100 * (1 - min(1, weightedSum / (10 + weightedSum)))) — a smooth impact curve. " +
    "Automation covers only part of WCAG; see the manual checks list.";
  els.scoreChip.dataset.band = score >= 90 ? "good" : score >= 50 ? "mid" : "poor";
  els.scoreChip.hidden = false;
}

// Manual checklist checkbox state — in memory only, per DevTools session.
const manualCheckState = new Set();

function renderManualChecklist() {
  if (!els.manualChecksList) return;
  const items = buildManualChecklist(state.activeMode || "run");
  els.manualChecksList.innerHTML = items.map(item => {
    const id = escapeHtml(String(item.id));
    const checked = manualCheckState.has(String(item.id)) ? " checked" : "";
    return `<li><label class="manualCheckLabel">` +
      `<input type="checkbox" class="manualCheckBox" data-check-id="${id}"${checked} /> ` +
      `<span>${escapeHtml(item.label)}</span> ` +
      `<span class="manualChecksWcag">${escapeHtml(item.wcag)}</span></label></li>`;
  }).join("");
}


function applyExplorerFilters(findings) {
  const q = (els.q.value || "").trim().toLowerCase();
  const sevSet = state.sevFilter;

  let list = Array.isArray(findings) ? findings : [];
  if (sevSet.size > 0) list = list.filter(f => sevSet.has(f.severity));

  if (q) {
    list = list.filter(f => {
      if (f._searchBlob === undefined) {
        f._searchBlob = [f.type, f.name, f.testId, f.wcag, f.path, f.note, f.product]
          .filter(Boolean).join(" ").toLowerCase();
      }
      return f._searchBlob.includes(q);
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
  const hasData = state.contrastData.length > 0 || state.contrastSamples.length > 0;
  const q = (els.contrastQ?.value || "").trim().toLowerCase();
  if (q) {
    data = data.filter(f => {
      if (f._searchBlob === undefined) {
        f._searchBlob = [f.text, f.tag, f.testId, f.path, f.note, String(f.ratio ?? "")]
          .filter(Boolean).join(" ").toLowerCase();
      }
      return f._searchBlob.includes(q);
    });
  }
  const sorted = applySortState(data, 'contrast');
  if (!VT.contrast) initVirtualTables();
  if (VT.contrast) {
    VT.contrast.setData(sorted);
  }
  // Empty state based on actual rendered rows — defer one frame to avoid flicker
  if (els.contrastEmpty) {
    requestAnimationFrame(() => {
      const visibleRows = VT.contrast ? VT.contrast.data.length : sorted.length;
      if (!hasData) {
        els.contrastEmpty.textContent = "Run a Contrast check to see results";
        els.contrastEmpty.hidden = false;
      } else if (visibleRows === 0) {
        els.contrastEmpty.textContent = "No results match your search";
        els.contrastEmpty.hidden = false;
      } else {
        els.contrastEmpty.hidden = true;
      }
    });
  }
  if (VT.contrast) return;
  const tbody = els.contrastTbody;
  if (!tbody) return;
  tbody.innerHTML = sorted.slice(0, 200).map(contrastRowHtml).join("");
}


function renderTabWalk(res) {
  const raw = Array.isArray(res?.events) ? res.events : [];
  state.tabData = raw;
  let filtered = raw;
  const q = (els.tabWalkQ?.value || "").trim().toLowerCase();
  if (q) {
    filtered = filtered.filter(e => {
      if (e._searchBlob === undefined) {
        e._searchBlob = [e.type, e.name, e.path, e.note, String(e.tabIndex ?? "")]
          .filter(Boolean).join(" ").toLowerCase();
      }
      return e._searchBlob.includes(q);
    });
  }
  const events = applySortState(filtered, 'tab');
  if (!VT.tab) initVirtualTables();
  if (VT.tab) {
    VT.tab.setData(events);
  }
  // Empty state based on actual rendered rows — defer one frame to avoid flicker
  if (els.tabWalkEmpty) {
    requestAnimationFrame(() => {
      const visibleRows = VT.tab ? VT.tab.data.length : events.length;
      if (raw.length === 0) {
        els.tabWalkEmpty.textContent = "Run a Tab Walk to see results";
        els.tabWalkEmpty.hidden = false;
      } else if (visibleRows === 0) {
        els.tabWalkEmpty.textContent = "No results match your search";
        els.tabWalkEmpty.hidden = false;
      } else {
        els.tabWalkEmpty.hidden = true;
      }
    });
  }
  if (VT.tab) return;
  // fallback (should not happen)
  const tbody = els.tabTbody;
  if (!tbody) return;
  tbody.innerHTML = events.slice(0, 200).map(tabRowHtml).join("");
}

function renderWatch(res) {
  if (!res) return;
  const watchEvents = Array.isArray(res.events) ? res.events : [];
  const hasContent = watchEvents.length > 0 || res.bursts != null || res.silentMs != null;
  if (els.watchEmpty) els.watchEmpty.hidden = hasContent;
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
        return `<span class="watchVerdict ${over ? "watchVerdict--fail" : "watchVerdict--pass"}">${escapeHtml(v.metric)}: ${escapeHtml(String(v.value))}${over ? " \u26A0" : " \u2713"}</span>`;
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

// Fix suggestions — applied panel-side to keep the injected audit snippet small
const FIX_SUGGESTIONS = {
  IMG_MISSING_ALT: 'Add alt="description" to the <img> tag. Use alt="" only if purely decorative.',
  IMG_EMPTY_ALT: 'If decorative, alt="" is correct. If meaningful, add a descriptive alt text.',
  NO_ACCESSIBLE_NAME: f => `Add aria-label or visible text to this ${f.role || f.tag?.toLowerCase() || 'element'}.`,
  FORM_CONTROL_NO_LABEL: 'Add a visible <label for="id"> or use aria-label.',
  HEADING_LEVEL_SKIP: f => `Insert an h${(f.extra?.from || 1) + 1} before this h${f.extra?.to || '?'} to fix hierarchy.`,
  NO_H1: 'Add an <h1> element describing the primary content.',
  MULTIPLE_H1: 'Use only one <h1> per page. Demote extras to <h2> or lower.',
  NO_MAIN_LANDMARK: 'Wrap primary content in a <main> element.',
  REGION_NO_NAME: 'Add aria-label or aria-labelledby to the region.',
  BROKEN_ARIA_REFERENCE: f => `Ensure id="${f.extra?.id}" exists in DOM, or remove ${f.extra?.attr}.`,
  ARIA_LABELLEDBY_POINTS_TO_ARIA_HIDDEN: 'Remove aria-hidden from referenced label element.',
  POSITIVE_TABINDEX: 'Remove positive tabindex. Use tabindex="0" or restructure DOM order.',
  CHAT_LOG_NO_ARIA_LIVE_SOFT: 'Add aria-live="polite" to the role="log" container.',
  DISABLED_INPUT_NO_EXPLANATION: 'Add aria-describedby explaining why disabled, or add a title.',
  LOADER_WITHOUT_ANNOUNCEMENT_HOOK: 'Add aria-live="polite" region, update text on load start/end.',
  DUPLICATE_ID: f => {
    const base = `Make id="${f.extra?.id}" unique. When multiple apps share the page, add a scope prefix.`;
    return f.extra?.ariaReferenced ? `${base} Referenced by ARIA — duplicates break name resolution.` : base;
  },
  FOCUS_VISIBLE_SUPPRESSED: 'Add visible :focus-visible style (outline or box-shadow).',
  NO_SKIP_NAV: 'Add a skip link: <a href="#main" class="skip-link">Skip to main content</a>.',
  MISSING_AUTOCOMPLETE: 'Add appropriate autocomplete attribute (e.g., autocomplete="email").',
  CLICK_WITHOUT_KEYBOARD: f => `Ensure this ${f.tag?.toLowerCase() || 'element'} is keyboard reachable (Enter/Space).`,
  ARIA_HIDDEN_FOCUSABLE: 'Add tabindex="-1" to focusable elements inside aria-hidden.',
  ARIA_REQUIRED_ATTR_MISSING: f => `Add ${f.extra?.attr}="..." to role="${f.extra?.role}" as required by ARIA.`,
  TOUCH_TARGET_TOO_SMALL: 'Verify hit-area is at least 24x24px (WCAG 2.5.8).',
  TABLE_NO_HEADERS: 'Add <th scope="col"> for column headers, <th scope="row"> for row headers.',
  LABEL_NOT_IN_NAME: 'Ensure aria-label includes the visible text.',
  MISSING_LANG: 'Add lang="en" (or appropriate code) to <html>.',
  VIEWPORT_ZOOM_DISABLED: 'Remove user-scalable=no and maximum-scale=1 from viewport meta.',
  SHELL_OR_MINIMAL_UI: null,
  SHADOW_DOM_DETECTED: 'Inspect shadow DOM content manually in DevTools.',
  COMPETING_ASSERTIVE_LIVE: 'Consolidate aria-live="assertive" into one shared announcer.',
  DUPLICATE_MAIN_LANDMARK: 'Only one <main> should exist. Others use <section> or role="region".',
  DUPLICATE_NAV_NO_LABEL: 'Add unique aria-label to each <nav>.',
  DUPLICATE_BANNER: 'Only one top-level <header>. Scope extras inside <article>/<section>.',
  DUPLICATE_CONTENTINFO: 'Only one top-level <footer>. Scope extras inside <article>/<section>.',
  HEADING_HIERARCHY_FRAGMENTED: 'Shared heading hierarchy: the host page provides the H1, embedded apps start at H2+.',
  COMPETING_SKIP_NAV: 'Use one skip link from the host page. Remove skip links from embedded apps.',
  SHADOW_DOM_FOCUS_ISSUE: 'Add delegatesFocus:true to shadow root, or set tabindex on focusable elements.',
  IFRAME_MISSING_TITLE: 'Add title="Description" to the <iframe>.',
  IFRAME_CROSS_ORIGIN: 'Verify parent page has a title attribute on this iframe.',
  DRAGGABLE_NO_ALTERNATIVE: 'Provide button-based alternative alongside drag interaction.',
  CONSISTENT_HELP_CHECK: 'Ensure help/contact links appear in same relative order on every page.',
  FOCUS_MAY_BE_OBSCURED: 'Use scroll-padding-top/bottom to offset focused elements past sticky headers.',
  REDUNDANT_ENTRY: 'Add autocomplete attributes or pre-fill values from prior entries.',
  HC_TREE_ITEM_NO_NAME: 'Add aria-label or visible text to each role="treeitem".',
  HC_TREE_NO_ARIA_EXPANDED: 'Add aria-expanded to treeitem elements that own child groups.',
  CHAT_MESSAGE_NO_ROLE: 'Add role="listitem" or semantic element to children of role="log".',
  CHAT_INPUT_NO_LABEL: 'Add visible <label> or aria-label to chat input.',
  CHAT_TIMESTAMP_INACCESSIBLE: 'Remove aria-hidden from timestamp, or provide info in sr-only element.',
  HC_ARTICLE_NO_HEADING: 'Add an <h2>/<h3> heading inside the article.',
  LIVE_REGION_HIDDEN: 'aria-live with display:none never announces. Use clip-rect for visual hiding.',
  COMBOBOX_NO_LISTBOX: 'Add aria-owns/controls pointing to role="listbox" element.',
  TARGET_SIZE_AAA: 'Increase target size to at least 44x44px (AAA).',
  NESTED_INTERACTIVE: 'Remove nested interactive, or replace outer with non-interactive wrapper.',
  DOCUMENT_TITLE_MISSING: 'Add <title>Page Title</title> inside <head>.',
  ARIA_VALID_ATTR: f => `"${f.extra?.attr}" is not a valid ARIA attribute.${f.extra?.suggestion ? ` Did you mean "${f.extra.suggestion}"?` : ''}`,
  ARIA_VALID_ROLE: f => `role="${f.extra?.role}" is not a valid WAI-ARIA role.`,
  ARIA_REQUIRED_CHILDREN: f => `role="${f.extra?.role}" requires child with role="${f.extra?.expected}".`,
  ARIA_REQUIRED_PARENT: f => `role="${f.extra?.role}" must be inside role="${f.extra?.expected}".`,
  META_REFRESH: 'Remove <meta http-equiv="refresh">. Use server-side redirects.',
  NO_AUTOPLAY_AUDIO: 'Add muted attribute, or ensure audio < 3s, or provide pause control.',
  HTML_LANG_VALID: f => `lang="${f.extra?.lang}" is not a valid BCP 47 tag.`,
  SCROLLABLE_NOT_FOCUSABLE: 'Add tabindex="0" and aria-label to scrollable container.',
  LINK_SUSPICIOUS_TEXT: f => `Link text "${f.extra?.text}" is not descriptive. Use destination-describing text.`,
  EMPTY_HEADING: 'Add text content to the heading.',
  EMPTY_TABLE_HEADER: 'Add text content to the <th>, or use aria-label.',
  DIALOG_NO_ACCESSIBLE_NAME: 'Add aria-label or aria-labelledby to the dialog.',
  ARIA_ALLOWED_ATTR: f => `"${f.extra?.attr}" not allowed on role="${f.extra?.role}". Remove it.`,
  ARIA_HIDDEN_ON_BODY: 'Remove aria-hidden from <body>/<html>. Hides entire page from AT.',
  MARQUEE_ELEMENT: 'Replace <marquee> with CSS animation or static alternative.',
  INPUT_IMAGE_ALT: 'Add alt="description" to <input type="image">.',
  AREA_ALT_MISSING: 'Add alt="description" to the <area> element.',
  OBJECT_NO_ALT: 'Add text alternative inside <object> or use aria-label.',
  FIELDSET_NO_LEGEND: 'Add <legend> as first child of <fieldset>.',
  SVG_IMG_NO_ALT: 'Add aria-label to <svg>, or include a <title> child.',
  VIDEO_NO_CAPTIONS: 'Add <track kind="captions"> inside <video>.',
  LIST_STRUCTURE: f => `Move <${f.extra?.tag}> inside <ul>, <ol>, or <menu>.`,
  DL_STRUCTURE: f => `Move <${f.extra?.tag}> inside a <dl>.`,
  ACCESSKEY_DUPLICATE: f => `accesskey="${f.extra?.key}" used on ${f.extra?.count} elements. Must be unique.`,
  FORM_FIELD_MULTIPLE_LABELS: 'Remove extra <label> elements. One label per input.',
  AUTOCOMPLETE_VALID: f => `autocomplete="${f.extra?.value}" is not valid. Use "name", "email", etc.`,
  TH_MISSING_SCOPE: 'Add scope="col" or scope="row" to <th> elements.',
  VIDEO_AUTOPLAY: 'Add muted to <video autoplay>, or provide pause control.',
  BLINK_ELEMENT: 'Remove <blink>. Use CSS animation with prefers-reduced-motion.',
  SERVER_IMAGE_MAP: 'Replace server-side image map with client-side <map>/<area>.',
  SCOPE_ATTR_VALID: f => `scope="${f.extra?.value}" is not valid. Use col/row/colgroup/rowgroup.`,
  TD_HEADERS_INVALID: f => `headers references id="${f.extra?.id}" which does not exist.`,
  TABLE_DUPLICATE_NAME: 'Caption and aria-label are identical. Remove one.',
  AUDIO_NO_TRANSCRIPT: 'Provide text transcript for audio content.',
  ARIA_VALID_ATTR_VALUE: f => `"${f.extra?.value}" is not valid for ${f.extra?.attr}. ${f.extra?.expected || ''}`,
  IDENTICAL_LINKS_SAME_TEXT: f => `${f.extra?.count} links use "${f.extra?.text}" for different URLs. Differentiate text.`,
  P_AS_HEADING: 'Use <h2>–<h6> instead of styling <p>/<div> as heading.',
  CHAT_SEND_NO_LABEL: 'Add aria-label="Send message" to send button.',
  CHAT_AVATAR_NO_ALT: 'Add alt to avatar images (or alt="" if decorative).',
  CHAT_NO_ARIA_RELEVANT: 'Add aria-relevant="additions" to role="log".',
  CHAT_TYPING_NO_ANNOUNCEMENT: 'Wrap typing indicator in aria-live="polite" region.',
  HC_SEARCH_NO_LABEL: 'Add visible <label> or aria-label to search input.',
  HC_BREADCRUMB_NO_LABEL: 'Add aria-label="Breadcrumb" to <nav>.',
  HC_ACCORDION_NO_STATE: 'Add aria-expanded to accordion trigger button.',
  GUIDED_IMG_NAME_POOR: 'Rewrite alt/aria-label so it conveys the image purpose, not its appearance or filename.',
  GUIDED_IMG_DECORATIVE_NAMED: 'Decorative image: set alt="" (or role="presentation") and remove aria-label/title.',
  GUIDED_CONTROL_LABEL_VAGUE: f => `Label "${txt(f.name || '', 40)}" is vague out of context. Use text that describes the action or destination.`,
};

function applyFixSuggestions(findings) {
  if (!Array.isArray(findings)) return findings;
  for (const f of findings) {
    if (f.fix) continue;
    const s = FIX_SUGGESTIONS[f.type];
    if (s) f.fix = typeof s === "function" ? s(f) : s;
  }
  return findings;
}

function applyRecipe(recipeId) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return;
  activeRecipeId = recipeId;
  if (recipeId === "auto") return; // auto = no overrides
  if (recipe.frameScope && els.target) els.target.value = recipe.frameScope;
  if (recipe.depthMax && els.depthMax) els.depthMax.value = String(recipe.depthMax);
  if (recipe.activeMode) state.activeMode = recipe.activeMode;
}

function getActiveRecipeId() {
  return activeRecipeId || "auto";
}

function getActiveDepthMax() {
  const v = Number(els.depthMax?.value);
  return (v === 1 || v === 2 || v === 3) ? v : 3;
}

function filterFindingsByDepth(findings, depthMax) {
  if (!Array.isArray(findings)) return [];
  if (depthMax >= 3 || !depthMax) return findings;
  const ruleMap = typeof RULE_TO_WCAG !== "undefined" ? RULE_TO_WCAG : {};
  return findings.filter(f => {
    const meta = ruleMap[f.type];
    if (!meta) return true; // unknown rules pass through
    return (meta.depthLevel || 1) <= depthMax;
  });
}

function filterFindingsByRulePack(findings, rulePack) {
  if (!Array.isArray(findings) || !rulePack) return findings || [];
  const { enabledRuleIds, disabledRuleIds } = rulePack;
  const hasEnabled = Array.isArray(enabledRuleIds) && enabledRuleIds.length > 0;
  const hasDisabled = Array.isArray(disabledRuleIds) && disabledRuleIds.length > 0;
  if (!hasEnabled && !hasDisabled) return findings;
  const enabledSet = hasEnabled ? new Set(enabledRuleIds) : null;
  const disabledSet = hasDisabled ? new Set(disabledRuleIds) : null;
  return findings.filter(f => {
    if (enabledSet && !enabledSet.has(f.type)) return false;
    if (disabledSet && disabledSet.has(f.type)) return false;
    return true;
  });
}

function getActiveRulePack() {
  return activeRulePack;
}

function applyAllFindingFilters(findings) {
  let result = filterFindingsByDepth(findings, getActiveDepthMax());
  result = filterFindingsByRulePack(result, getActiveRulePack());
  return result;
}

/**
 * Filter findings by depth3 group. UI-only — not part of applyAllFindingFilters
 * so CI JSON export and diagnostics are unaffected.
 */
function filterFindingsByGroup(findings, groupFilter) {
  if (!groupFilter) return findings;
  if (!Array.isArray(findings)) return [];
  var ruleMap = (typeof RULE_TO_WCAG !== "undefined") ? RULE_TO_WCAG : {};
  return findings.filter(function(f) {
    var meta = ruleMap[f.type];
    return meta && meta.group === groupFilter;
  });
}

/**
 * Update the integrity overview pills with aggregate status and counts.
 */
function updateIntegrityOverview(aggregates) {
  if (!els.integrityOverview) return;
  if (!aggregates) { els.integrityOverview.hidden = true; return; }
  els.integrityOverview.hidden = false;

  var groups = [
    { group: "depth3/announcements", status: aggregates.announcementIntegrity, count: aggregates.counts ? aggregates.counts.announcements || 0 : 0, countEl: els.pillAnnouncementsCount },
    { group: "depth3/focus", status: aggregates.focusStability, count: aggregates.counts ? aggregates.counts.focus || 0 : 0, countEl: els.pillFocusCount },
    { group: "depth3/semantics", status: aggregates.chatSemantics, count: aggregates.counts ? aggregates.counts.semantics || 0 : 0, countEl: els.pillSemanticsCount },
    { group: "depth3/multiframe", status: aggregates.multiFrameIntegrity, count: aggregates.counts ? aggregates.counts.multiframe || 0 : 0, countEl: els.pillMultiframeCount },
  ];

  for (var gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    var btn = els.integrityOverview.querySelector('.integrityPill[data-group="' + g.group + '"]');
    if (!btn) continue;
    btn.classList.remove("ok", "degraded");
    btn.classList.add(g.status);
    if (g.countEl) g.countEl.textContent = "(" + g.count + ")";
  }
}

/**
 * Normalize finding fields at render boundary to prevent junk rendering.
 */
function normalizeFindingForRender(f) {
  if (!f || typeof f !== "object") return { type: "UNKNOWN_RULE", severity: "info" };
  var type = typeof f.type === "string" ? f.type : "UNKNOWN_RULE";
  var sev = typeof f.severity === "string" ? f.severity.toLowerCase() : "info";
  var safeSev = (sev === "critical" || sev === "high" || sev === "medium" || sev === "low" || sev === "info") ? sev : "info";
  if (type === f.type && safeSev === f.severity) return f;
  return Object.assign({}, f, { type: type, severity: safeSev });
}

/**
 * Re-render findings list with current group filter applied.
 * Aggregates are computed from base (pre-group-filter) so pills show true totals.
 */
function rerenderFindings(reason) {
  var t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
  var base = state.currentFindings || [];
  var groupFiltered = filterFindingsByGroup(base, activeGroupFilter);
  var normalized = groupFiltered.map(normalizeFindingForRender);
  renderSevTabs(normalized);
  renderExplorer(normalized);
  var d3 = (typeof buildDepth3Aggregates === "function")
    ? buildDepth3Aggregates(base, RULE_TO_WCAG) : null;
  updateIntegrityOverview(d3);
  // Perf tracking
  var dt = t0 ? ((typeof performance !== "undefined" && performance.now) ? performance.now() : 0) - t0 : 0;
  __flPerf.rerenderFindingsCount++;
  __flPerf.rerenderFindingsMsTotal += dt;
  __flPerf.lastRerenderFindingsMs = dt;
  __flPerf.lastRenderedRows = state.explorer ? state.explorer.length : 0;
  __flPerf.lastFilterReason = reason || null;
}

/**
 * Schedule a batched rerender via queueMicrotask to eliminate micro-spam.
 * Multiple calls in the same tick collapse into one rerender.
 */
function scheduleRerenderFindings(reason) {
  __flPerf.scheduledRerenderCount++;
  _rerenderReason = reason || _rerenderReason || "unspecified";
  if (_rerenderScheduled) return;
  _rerenderScheduled = true;
  queueMicrotask(function() {
    _rerenderScheduled = false;
    var r = _rerenderReason;
    _rerenderReason = null;
    rerenderFindings(r);
  });
}

function renderExplorer(findings) {
  const all = Array.isArray(findings) ? findings : [];
  let filtered = applySortState(applyExplorerFilters(findings), 'explorer');
  if (state.groupByComponent) {
    // One row per component (type + normalized selector pattern), keeping the
    // finding shape so row expand / highlight reuse the sample finding.
    filtered = groupFindingsByComponent(filtered).map(g => Object.assign({}, g.sample, {
      severity: g.severity,
      _groupCount: g.count,
      _groupKey: g.componentKey,
    }));
  }
  state.explorer = filtered;

  // Update findings count
  if (els.findingsCount) {
    const total = all.length;
    const shown = filtered.length;
    els.findingsCount.textContent = shown === total ? `${total} findings` : `${shown} of ${total}`;
  }

  if (!VT.all) initVirtualTables();
  if (VT.all) {
    VT.all.setData(filtered);
  } else {
    // fallback
    els.allTableBody.innerHTML = filtered.slice(0, 200).map(explorerRowHtml).join("");
  }

  // Empty state based on actual rendered rows — defer one frame to avoid flicker
  if (els.explorerEmpty) {
    requestAnimationFrame(() => {
      const visibleRowsCount = VT.all ? VT.all.data.length : filtered.length;
      els.explorerEmpty.hidden = visibleRowsCount > 0 || all.length === 0;
    });
  }
}


function refreshInspectedUrl(retries = 3) {
  return new Promise((resolve, reject) => {
  chrome.devtools.inspectedWindow.eval("location.href", async (res, err) => {
    try {
    if (err && retries > 0) {
      setTimeout(() => refreshInspectedUrl(retries - 1).then(resolve).catch(reject), 300);
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
    // Detect orphaned session and prompt for resume/discard
    if (sessionState.current && sessionState.current.startedAt && !sessionState.current.endedAt) {
      const ageMs = Date.now() - new Date(sessionState.current.startedAt).getTime();
      if (ageMs > 60 * 60 * 1000) {
        _showSessionResumePrompt(origin, env);
      }
    }
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
    renderPastRuns();
    populateCompareSelects();

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
    } catch (e) {
      console.error("refreshInspectedUrl: callback error", e);
      resolve(); // resolve anyway to avoid stalling; best-effort initialization
    }
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
  const urlIncludeSet = new Set();
  const domSelectorSet = new Set();
  const urlExcludeSet = new Set();
  for (const id of active) {
    const p = profileState.profiles[id];
    if (!p?.frame) continue;
    if (p.frame.urlIncludes) for (const u of p.frame.urlIncludes) urlIncludeSet.add(u);
    if (p.frame.domSelectors) for (const s of p.frame.domSelectors) domSelectorSet.add(s);
  }
  // Merge host config match selectors
  if (hostConfig?.match) {
    if (Array.isArray(hostConfig.match.domSelectorsAny)) for (const s of hostConfig.match.domSelectorsAny) domSelectorSet.add(s);
    if (Array.isArray(hostConfig.match.urlIncludesAny)) for (const u of hostConfig.match.urlIncludesAny) urlIncludeSet.add(u);
    if (Array.isArray(hostConfig.match.urlExcludesAny)) for (const u of hostConfig.match.urlExcludesAny) urlExcludeSet.add(u);
  }
  const MAX_SELECTORS = (typeof MAX_MATCH_ARRAY !== "undefined" ? MAX_MATCH_ARRAY : 80);
  const urlIncludes = [...urlIncludeSet].slice(0, MAX_SELECTORS);
  const domSelectorsAny = [...domSelectorSet].slice(0, MAX_SELECTORS);
  const urlExcludesAny = [...urlExcludeSet].slice(0, MAX_SELECTORS);
  if (!urlIncludes.length && !domSelectorsAny.length && !urlExcludesAny.length) return null;
  return { urlIncludes, domSelectorsAny, urlExcludesAny };
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

/**
 * Build rootSelector from active profiles or HostConfig fallback.
 * Returns the first non-empty rootSelector, or null.
 * Does NOT apply when manual override is active.
 */
function buildProfileRootSelector() {
  for (const id of profileState.active) {
    const p = profileState.profiles[id];
    if (p?.rootSelector && typeof p.rootSelector === "string") return p.rootSelector;
  }
  return hostConfig?.rootSelector || null;
}

/**
 * Profiles v2 — deterministic profile match scoring.
 *
 * Computes a match score for a single profile against frame probe data
 * and page URL. Returns { profileId, label, matchScore, matchSignals, confidence }.
 */
function computeProfileMatch(profileId, profile, probeData, frameUrl) {
  const signals = [];
  let score = 0;

  // +3 for urlIncludes match
  const urlIncludes = Array.isArray(profile?.frame?.urlIncludes) ? profile.frame.urlIncludes : [];
  const urlLower = (frameUrl || "").toLowerCase();
  for (const inc of urlIncludes) {
    if (inc && urlLower.includes(String(inc).toLowerCase())) {
      score += 3;
      signals.push(`url:${String(inc).slice(0, 40)}`);
      break; // only +3 once
    }
  }

  // +2 per domSelectorsAny hit (cap at 4 hits = max +8)
  const domSelectors = Array.isArray(profile?.frame?.domSelectors) ? profile.frame.domSelectors : [];
  const markerHits = (probeData && typeof probeData === "object" && probeData.markerHits) ? probeData.markerHits : {};
  let domHits = 0;
  for (const sel of domSelectors) {
    if (markerHits[sel] === true && domHits < 4) {
      domHits++;
      score += 2;
      signals.push(`dom:${String(sel).slice(0, 40)}`);
    }
  }

  // +2 if hasChat/hasHelpRoot matches profile intent
  const frameScope = profile?.frameScope || "primary";
  if (probeData) {
    if (frameScope === "embedded" && probeData.hasChat) {
      score += 2;
      signals.push("intent:hasChat");
    } else if (frameScope === "primary" && probeData.hasHelpRoot) {
      score += 2;
      signals.push("intent:hasHelpRoot");
    } else if (probeData.hasArticle && (frameScope === "primary" || frameScope === "all")) {
      score += 2;
      signals.push("intent:hasArticle");
    }
  }

  // +1 for frameScope alignment
  const bestFrameId = probeData?.frameId;
  if (bestFrameId != null) {
    const isTopFrame = bestFrameId === 0;
    if ((frameScope === "primary" || frameScope === "host") && isTopFrame) {
      score += 1;
      signals.push("scope:aligned");
    } else if (frameScope === "embedded" && !isTopFrame) {
      score += 1;
      signals.push("scope:aligned");
    } else if (frameScope === "all") {
      score += 1;
      signals.push("scope:all");
    }
  }

  // Confidence
  const confidence = score >= 6 ? "high" : score >= 3 ? "medium" : "low";

  return {
    profileId: String(profileId),
    label: profile?.label || String(profileId),
    matchScore: score,
    matchSignals: signals,
    confidence,
  };
}

/**
 * Select the best profile match from all available profiles.
 * Deterministic tie resolution: alphabetical profileId.
 */
function selectBestProfileMatch(probeData, frameUrl, isManualOverride) {
  // Manual override bypasses profile scoring entirely.
  if (isManualOverride) {
    const activeId = profileState.active[0] || null;
    return {
      profileId: activeId,
      label: activeId ? (profileState.profiles[activeId]?.label || activeId) : null,
      matchScore: 0,
      matchSignals: ["manual_override"],
      confidence: "manual",
    };
  }

  const allProfiles = profileState.profiles || {};
  const candidates = [];
  for (const [id, profile] of Object.entries(allProfiles)) {
    const match = computeProfileMatch(id, profile, probeData, frameUrl);
    candidates.push(match);
  }

  if (!candidates.length) return null;

  // Sort: highest score first, then alphabetical profileId for tie resolution.
  candidates.sort((a, b) => {
    if (b.matchScore !== a.matchScore) return b.matchScore - a.matchScore;
    return a.profileId.localeCompare(b.profileId);
  });

  return candidates[0].matchScore > 0 ? candidates[0] : null;
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

let _highlightInFlight = false;
async function highlightFinding(finding, highlightCtx) {
  if (!finding) return;
  if (_highlightInFlight) return; // concurrency guard — ignore overlapping attempts
  _highlightInFlight = true;
  try {
    return await _highlightFindingInner(finding, highlightCtx);
  } finally {
    _highlightInFlight = false;
  }
}
async function _highlightFindingInner(finding, highlightCtx) {
  const payload = {
    path: finding.path ?? null,
    testId: finding.testId ?? null,
    tag: finding.tag ?? null,
    name: finding.name ?? null,
    role: finding.role ?? null,
    html: finding.html ?? null,
  };
  const bestFrameId = highlightCtx?.bestFrameId ?? state.bestFrameId ?? 0;
  const usedFrameIds = highlightCtx?.usedFrameIds ?? [];

  // Try best frame first
  let res;
  try {
    res = await send({ type: "HIGHLIGHT", frameId: bestFrameId, finding: payload });
  } catch {
    res = { ok: false, found: false, strategy: "none", reason: "FRAME_INACCESSIBLE", frameIdUsed: bestFrameId };
  }

  // Retry across other used frames if not found
  if (res?.found === false && usedFrameIds.length > 0) {
    const retryIds = usedFrameIds.filter(id => id !== bestFrameId).slice(0, 3);
    for (const fid of retryIds) {
      try {
        const retry = await send({ type: "HIGHLIGHT", frameId: fid, finding: payload });
        if (retry?.found) { res = retry; break; }
      } catch { /* skip inaccessible frame */ }
    }
  }

  // Show toast with strategy + frameIdUsed info
  const frameUsed = res?.frameIdUsed != null ? ` in frame ${res.frameIdUsed}` : "";
  if (res?.found) {
    const via = res.strategy && res.strategy !== "none" ? ` via ${res.strategy.toUpperCase()}` : "";
    const tag = res.matched?.tag ? `: <${res.matched.tag}>` : "";
    toast(`Highlighted${via}${tag}${frameUsed}`);
  } else {
    const reason = res?.reason === "FRAME_INACCESSIBLE" ? "frame inaccessible" : "element not found";
    toast(`Not found (${reason})`, {
      label: usedFrameIds.length > 1 ? "Try other frames" : undefined,
      fn: usedFrameIds.length > 1 ? () => highlightFinding(finding, { bestFrameId: usedFrameIds[1], usedFrameIds }) : undefined,
    });
  }
  return res;
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
    const rootSelector = target?.manual ? null : buildProfileRootSelector();
    r = await send({
      type: "RUN_AUDIT",
      action,
      target,
      match,
      modeHints: buildModeHints(),
      appMarkers: buildAppMarkers(),
      rootSelector,
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
    if (!state.records.length) showErrorEmptyState(`${action} failed — connection error`);
    return false;
  }

  state.lastResult = r;
  state._lastCapturedAt = nowIso();
  // Inject fix suggestions into raw payload so Raw JSON / export includes them
  if (r?.bestEntry?.result?.findings) {
    r.bestEntry.result.findings = applyFixSuggestions(r.bestEntry.result.findings);
  }
  els.json.textContent = pretty(r);
  if (!r?.ok) {
    const noScope = r?.reason === "NO_SCOPE_MATCH" || r?.error === "NO_SCOPE_MATCH";
    const manualMissing = r?.reason === "MANUAL_FRAMES_MISSING" || r?.error === "MANUAL_FRAMES_MISSING";
    if (manualMissing) {
      setRunTelemetry({ usedFrames: "\u2014", diff: "(pinned frame not available)" });
      setPersistentStatus("FAILED", "MANUAL_FRAMES_MISSING", "Pinned frame not available");
      console.warn("RUN_AUDIT: pinned frame missing", r);
      toast("Pinned frame not available. Clear pin to continue.", {
        label: "Clear Pin",
        fn: () => { if (els.pinFrame) { els.pinFrame.checked = false; state.pinnedFrameId = null; } },
      });
      return false;
    }
    const notAuditable = r?.reason === "NO_AUDITABLE_FRAMES" || r?.error === "NO_AUDITABLE_FRAMES";
    const failMsg = noScope ? "No frame matches selected scope"
      : notAuditable ? "This page cannot be audited (script injection blocked)"
      : `${action} failed`;
    setRunTelemetry({ usedFrames: "\u2014", diff: `(${failMsg})` });
    setPersistentStatus("FAILED", noScope ? "NO_SCOPE_MATCH" : notAuditable ? "NOT_AUDITABLE" : "BACKEND", failMsg);
    console.error("RUN_AUDIT backend failure", r);
    toast(failMsg);
    if (!state.records.length) showErrorEmptyState(failMsg);
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
    _highlightContext: {
      bestFrameId: r?.bestEntry?.frameId ?? 0,
      usedFrameIds: r?.usedFrameIds || [],
    },
  };
  // newest first
  state.records = [rec, ...state.records.filter(x => String(x.id) !== String(rec.id))];
  state.byId[String(rec.id)] = rec;
  renderRecord(rec);
  renderPastRuns();
  const persisted = await persistRecords(scopeKey);
  if (!persisted) {
    console.warn("Record rendered but history persistence failed");
  }

  setRunTelemetry({ usedFrames: (r?.usedFrameIds || []).join(", ") || "—" });

  const bestEntry = rec.best || null;
  // Per-record highlight context — no global leakage
  state.bestFrameId = bestEntry?.frameId ?? 0;
  state._activeHighlightCtx = rec._highlightContext || null;

  const bestResult = bestEntry?.result || null;
  const allFindings = Array.isArray(bestResult?.findings) ? bestResult.findings : [];
  const findings = applyAllFindingFilters(allFindings);

  // Baseline comparison banner (audit runs only; hidden when no baseline loaded)
  if (action === "run") {
    updateBaselineBanner(findings).catch(e => console.warn("Baseline banner failed", e));
  } else if (els.baselineBanner) {
    els.baselineBanner.hidden = true;
  }

  // History/diff uses unfiltered findings for consistency across depth/rulePack changes
  const key = `snap::${originFrom(url)}::${detectEnv(url)}::${bestEntry?.frameUrl || ""}`;
  const prev = await loadHistorySnapshot(key);
  const snapshot = {
    at: new Date().toISOString(),
    envTag,
    counts: countBySeverity(allFindings),
    findingHashes: allFindings.map(hashFinding),
  };
  if (allFindings.length) {
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
  // Weighted score chip — findings-based modes only (run/observe)
  renderScoreChip(action === "run" || action === "observe" ? allFindings : null);
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
    schemaVersion: 4,
    signatureVersion: 2,
    stableSignatureVersion: STABLE_SIGNATURE_VERSION,
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
  populateCompareSelects();

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
      : `FAIL — ${totalBlockingAdded} must-fix issues in steps ${blockingSteps.join(", ")}`;
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

  // R6: Set inFlight immediately after the guard to minimise race window.
  sessionState.inFlight = true;
  // R1: Capture session identity before any async work so we can detect if
  // the session was ended/replaced while we were awaiting.
  const _captureSessionId = sessionState.current.id;
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
      const rootSelector = target?.manual ? null : buildProfileRootSelector();
      r = await send({
        type: "CAPTURE_STEP",
        activeMode,
        target,
        match,
        modeHints: buildModeHints(),
        appMarkers: buildAppMarkers(),
        rootSelector,
        alsoConsole: !!els.alsoConsole.checked,
        wcagLevel: els.wcagLevel?.value || "2.1-AA",
      });
    } catch (err) {
      console.error("CAPTURE_STEP transport failure", err);
      setLastMarkStatus("FAILED", "baseline:transport");
      updateSessionButtons();
      toast("Step capture failed", { label: "Retry", fn: () => captureStepOptionC(label, { isAutoCapture }) });
      return false;
    }

    if (!r?.ok || !r?.run?.ok) {
      console.error("CAPTURE_STEP failure", r);
      const noScope = r?.run?.error === "NO_SCOPE_MATCH" || r?.run?.reason === "NO_SCOPE_MATCH";
      const manualMissing = r?.run?.error === "MANUAL_FRAMES_MISSING" || r?.run?.reason === "MANUAL_FRAMES_MISSING";
      if (manualMissing) {
        setLastMarkStatus("FAILED", "baseline:manual_frames_missing");
        updateSessionButtons();
        toast("Pinned frame not available. Clear pin to continue.", {
          label: "Clear Pin",
          fn: () => { if (els.pinFrame) { els.pinFrame.checked = false; state.pinnedFrameId = null; } },
        });
        return false;
      }
      setLastMarkStatus("FAILED", noScope ? "baseline:no_scope_match" : "baseline:ok:false");
      updateSessionButtons();
      toast(noScope ? "Step capture failed: no frame matches selected scope" : "Step capture failed");
      return false;
    }

    // R1: Verify session wasn't ended/replaced during the await.
    if (!sessionState.current || sessionState.current.id !== _captureSessionId) {
      console.warn("captureStepOptionC: session changed during capture — discarding result");
      toast("Session was ended during capture");
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

    // A11y outline snapshot ("screen reader view") — best-effort; failure to
    // fetch the outline must never fail the step capture.
    let a11yOutline = null;
    try {
      const outlineFrameId = r?.run?.bestEntry?.frameId ?? state.bestFrameId ?? 0;
      const outlineRes = await send({ type: "GET_A11Y_OUTLINE", frameId: outlineFrameId });
      if (outlineRes?.ok && outlineRes.outline && Array.isArray(outlineRes.outline.nodes)) {
        const compactNodes = outlineRes.outline.nodes
          .slice(0, MAX_A11Y_OUTLINE_STORED_NODES)
          .filter(n => n && typeof n === "object")
          .map(n => ({
            r: String(n.role || "").slice(0, 40),
            n: txt(n.name || "", 60),
            l: asNumber(n.level, 0) || 0,
            h: String(n.pathHash || "").slice(0, 8),
          }));
        a11yOutline = { nodes: compactNodes, count: compactNodes.length };
      }
    } catch (err) {
      console.warn("GET_A11Y_OUTLINE failed — step captured without outline", err);
      a11yOutline = null;
    }

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
      a11yOutline,
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
    const stableRun = computeStableSignatureSet(step.snapshots?.run, sessionState.current.rawAppendix || {});
    const stableActive = step.snapshots?.active
      ? computeStableSignatureSet(step.snapshots.active, sessionState.current.rawAppendix || {})
      : null;
    // Parallel validation (shadow mode) — must run BEFORE step.stableSignatures
    // is assigned so its internal buildStepDiffs exercises the legacy path.
    if (prevStep?.stableSignatures?.run) {
      validateDiffParity(step, prevStep, sessionState.current.rawAppendix || {}, stableRun, prevStep.stableSignatures.run);
    }
    step.stableSignatures = {
      run: stableRun,
      active: stableActive,
    };
    // Diffs computed AFTER stableSignatures so buildStepDiffs takes the stable
    // path — the same path deleteStep's recomputation uses. Previously the
    // capture-time diff used the legacy path, so deleting any step silently
    // changed the diff numbers of all remaining steps.
    step.diffs = buildStepDiffs(step, prevStep, sessionState.current.rawAppendix || {});

    // Profiles v2 — deterministic profile match scoring
    const bestFrameProbe = r?.run?.bestFrameProbe || null;
    const isManual = !!baseTargeting.manual;
    const profileMatch = selectBestProfileMatch(bestFrameProbe, url, isManual);
    step.profileLabel = profileMatch?.label || null;
    step.profileConfidence = profileMatch?.confidence || null;
    step.profileMatchSignals = Array.isArray(profileMatch?.matchSignals) ? [...profileMatch.matchSignals].sort().slice(0, 5) : [];
    step.profileSuspect = profileMatch?.confidence === "low" || false;

    // RootSelector contract: track selector and match status
    const effectiveRootSelector = isManual ? null : buildProfileRootSelector();
    step.rootSelector = effectiveRootSelector || null;
    const runRootNotFound = r?.run?.bestEntry?.rootSelectorNotFound === true;
    const activeRootNotFound = r?.active?.bestEntry?.rootSelectorNotFound === true;
    step.rootSelectorNotFound = !!(effectiveRootSelector && (runRootNotFound || activeRootNotFound));
    step.rootSelectorMatchedFrameIds = Array.isArray(r?.run?.rootSelectorMatchedFrameIds)
      ? [...r.run.rootSelectorMatchedFrameIds] : [];
    step.depthMax = getActiveDepthMax();
    step.recipeId = getActiveRecipeId();
    step.rulePack = getActiveRulePack() || null;
    step.excludedFrameCount = r?.run?.excludedFrameCount || 0;
    step.transitionStates = r?.active?.transitionStateSummaries || r?.run?.transitionStateSummaries || null;
    if (step.rootSelectorNotFound) {
      step.profileSuspect = true;
      if (!step.profileMatchSignals.includes("rootSelector_not_found")) {
        step.profileMatchSignals = [...step.profileMatchSignals, "rootSelector_not_found"].sort().slice(0, 6);
      }
    }

    sessionState.current.steps.push(step);
    // Prune only after the new step is attached, so newly written raw refs are discoverable.
    pruneSessionRawAppendix(sessionState.current);
    updateSessionFramesIndex(sessionState.current, step);

    let compacted = compactSessionForExport(sessionState.current);
    let estimatedBytes = estimateJsonBytes(compacted);
    if (estimatedBytes > MAX_SESSION_BYTES_ESTIMATE) {
      // Session too big — drop a11y outlines from older steps (keep last 10)
      // before warning; step diffs and signatures are unaffected.
      const droppedOutlines = pruneSessionA11yOutlines(sessionState.current);
      if (droppedOutlines > 0) {
        compacted = compactSessionForExport(sessionState.current);
        estimatedBytes = estimateJsonBytes(compacted);
      }
    }
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
    // Drain queued capture (R8: wrapped in try-catch to prevent silent failures)
    const queued = sessionState.queuedCapture;
    sessionState.queuedCapture = null;
    if (queued && sessionState.current) {
      try {
        const qLabel = queued.isAutoCapture
          ? await deriveAutoLabel(getCurrentScopeInfo().url || "")
          : null;
        setTimeout(() => captureStepOptionC(qLabel, { isAutoCapture: queued.isAutoCapture }).catch(e => {
          console.error("Queued capture failed:", e);
          toast("Queued step capture failed", { label: "Retry", fn: () => captureStepOptionC(qLabel, { isAutoCapture: queued.isAutoCapture }) });
        }), 0);
      } catch (e) {
        console.error("Queued capture drain error:", e);
      }
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

// --- Baseline comparison (module-level, persisted per origin) ---
const MAX_BASELINE_FILE_BYTES = 5 * 1024 * 1024;
let loadedBaseline = null;
let loadedBaselineOrigin = null;

function baselineStorageKey(origin) {
  return `baseline::${origin || ""}`;
}

async function loadBaselineForOrigin(origin) {
  try {
    const key = baselineStorageKey(origin);
    const data = await storageGet([key]);
    const stored = data?.[key];
    return (stored && typeof stored === "object" && Array.isArray(stored.issues)) ? stored : null;
  } catch (e) {
    console.warn("Baseline load from storage failed", e);
    return null;
  }
}

async function setLoadedBaseline(baseline, origin) {
  loadedBaseline = baseline;
  loadedBaselineOrigin = origin || "";
  try {
    await storageSet({ [baselineStorageKey(origin)]: baseline });
  } catch (e) {
    console.warn("Baseline persistence failed (kept in memory)", e);
  }
}

function currentBaselineFrameKeyStable() {
  const bestEntry = state.lastResult?.bestEntry || state.lastResult?.best || null;
  return bestEntry?.frameKeyStable || bestEntry?.frameKey || "fk::unknown";
}

/**
 * Compare `findings` against the loaded baseline for the current origin and
 * render the compact "vs baseline" banner in the results zone.
 * Hidden when no baseline is loaded/stored for this origin.
 */
async function updateBaselineBanner(findings) {
  const el = els.baselineBanner;
  if (!el) return;
  try {
    const { origin } = getCurrentScopeInfo();
    if (!loadedBaseline || loadedBaselineOrigin !== (origin || "")) {
      loadedBaseline = await loadBaselineForOrigin(origin);
      loadedBaselineOrigin = origin || "";
    }
    if (!loadedBaseline || !Array.isArray(loadedBaseline.issues)) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    const cmp = compareAgainstBaseline(
      loadedBaseline,
      Array.isArray(findings) ? findings : [],
      currentBaselineFrameKeyStable(),
      "run"
    );
    // textContent assignment — page-derived strings can never become markup here.
    el.textContent = `vs baseline: +${cmp.newIssues.length} new, −${cmp.resolvedIssues.length} resolved`;
    el.hidden = false;
  } catch (e) {
    console.warn("Baseline banner update failed", e);
    el.hidden = true;
  }
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
  const _best = state.lastResult?.bestEntry || state.lastResult?.best;
  const md = buildMarkdown({
    inspectedUrl: url,
    best: _best,
    perFrame: state.lastResult?.perFrame,
    usedFrameIds: state.lastResult?.usedFrameIds,
    envTag,
    shadowCoverage: _best?.result?.shadowCoverage || _best?.shadowCoverage || null,
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
    const v = (typeof __FLOWLENS_VERSION__ !== "undefined")
      ? __FLOWLENS_VERSION__
      : (__runtime && __runtime.getManifest) ? __runtime.getManifest().version : "dev";
    badge.dataset.version = v;
    badge.textContent = hostConfig?.ui?.badgeText ? v + " " + hostConfig.ui.badgeText : v;
    const emptyVer = document.getElementById("emptyVersion");
    if (emptyVer) emptyVer.textContent = "v" + v;
  } catch {}
}

function gatherDiagnosticsOpts() {
  const url = els.inspectedUrl?.dataset?.full || els.inspectedUrl?.textContent || "";
  const env = detectEnv(url);
  const version = (typeof __FLOWLENS_VERSION__ !== "undefined") ? __FLOWLENS_VERSION__ : "dev";
  const best = state.lastResult?.bestEntry || state.lastResult?.best || null;
  const bestResult = best?.result || best || {};
  return {
    version,
    dataVersions: {
      schemaVersion: 4,
      signatureVersion: asNumber(bestResult.signatureVersion, 2),
      frameKeyVersion: asNumber(bestResult.frameKeyVersion, 1),
      enMappingVersion: asNumber(bestResult.enMappingVersion, 1),
    },
    url: originFrom(url) || url,
    env,
    bestFrameId: state.bestFrameId ?? null,
    bestFrameKey: best?.frameKey || null,
    frameScope: getScopeValue(),
    scope: bestResult.scope || { type: "document", rootSelector: null },
    shadowCoverage: bestResult.shadowCoverage || null,
    activeProfileId: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      if (lastStep?.profileLabel) return lastStep.profileLabel;
      return profileState.active[0] || null;
    })(),
    activeProfileLabel: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      if (lastStep?.profileLabel) return lastStep.profileLabel;
      return profileState.active[0]
        ? (profileState.profiles[profileState.active[0]]?.label || null) : null;
    })(),
    profileConfidence: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      return lastStep?.profileConfidence || null;
    })(),
    profileMatchSignals: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      if (lastStep?.profileMatchSignals?.length) return [...lastStep.profileMatchSignals].sort().slice(0, 5);
      const id = profileState.active[0];
      if (!id) return [];
      const sels = profileState.profiles[id]?.frame?.domSelectors || [];
      return [...sels].sort().slice(0, 3);
    })(),
    profileSuspect: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      return lastStep?.profileSuspect === true;
    })(),
    rootSelector: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      return lastStep?.rootSelector || null;
    })(),
    rootSelectorNotFound: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      return lastStep?.rootSelectorNotFound === true;
    })(),
    rootSelectorMatchedFrameIds: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      return Array.isArray(lastStep?.rootSelectorMatchedFrameIds) ? [...lastStep.rootSelectorMatchedFrameIds] : [];
    })(),
    reducedDiffConfidence: (() => {
      const steps = sessionState.current?.steps || [];
      return steps.some(s => s.profileSuspect === true) ||
             steps.some(s => s.stableSignatures?.run?.stepQuality?.degraded === true);
    })(),
    depthMax: getActiveDepthMax(),
    recipeId: getActiveRecipeId(),
    rulePack: getActiveRulePack(),
    hostConfigId: hostConfig?.id || "generic",
    frameGatingSelectorCount: hostConfig?.match?.domSelectorsAny?.length || 0,
    excludedFrameCount: (() => {
      const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
      return lastStep?.excludedFrameCount || 0;
    })(),
    findings: (() => {
      const best = state.lastResult?.bestEntry || state.lastResult?.best || null;
      return Array.isArray(best?.result?.findings) ? best.result.findings : [];
    })(),
  };
}

function renderDiagnostics() {
  const o = gatherDiagnosticsOpts();
  const payload = buildDiagnosticsPayload(o);
  if (els.diagVersion) els.diagVersion.textContent = payload.version;
  if (els.diagSchema) els.diagSchema.textContent = String(payload.dataVersions.schemaVersion);
  if (els.diagSignature) els.diagSignature.textContent = String(payload.dataVersions.signatureVersion);
  if (els.diagFrameKey) els.diagFrameKey.textContent = String(payload.dataVersions.frameKeyVersion);
  if (els.diagEnMapping) els.diagEnMapping.textContent = String(payload.dataVersions.enMappingVersion);
  if (els.diagDataVersions) els.diagDataVersions.textContent = payload.dataVersionsLine;
  if (els.diagUrl) els.diagUrl.textContent = payload.url || "\u2014";
  if (els.diagEnv) els.diagEnv.textContent = payload.env || "\u2014";
  if (els.diagFrameScope) els.diagFrameScope.textContent = payload.frameScope;
  if (els.diagBestFrameId) els.diagBestFrameId.textContent = payload.bestFrameId != null ? String(payload.bestFrameId) : "\u2014";
  if (els.diagBestFrameKey) els.diagBestFrameKey.textContent = payload.bestFrameKey || "\u2014";
  if (els.diagFrameGating) {
    els.diagFrameGating.textContent = payload.frameGatingSelectorCount > 0
      ? `active (${payload.frameGatingSelectorCount} selectors)` : "\u2014";
  }
  if (els.diagExcludedFrames) {
    els.diagExcludedFrames.textContent = payload.excludedFrameCount > 0
      ? `${payload.excludedFrameCount} excluded by host match rules` : "\u2014";
  }
  if (els.diagScope) {
    const s = payload.scope;
    els.diagScope.textContent = s.rootSelector ? `${s.type} (${s.rootSelector})` : s.type;
  }
  if (els.diagShadowCoverage) {
    const cov = payload.shadowCoverage;
    if (cov) {
      const fmt = formatShadowCoverage(cov);
      els.diagShadowCoverage.textContent = fmt.text || "\u2014";
    } else {
      els.diagShadowCoverage.textContent = "\u2014";
    }
  }
  if (els.diagActiveProfile) {
    els.diagActiveProfile.textContent = payload.activeProfileLabel || "\u2014";
  }
  if (els.diagProfileConfidence) {
    const conf = payload.profileConfidence;
    els.diagProfileConfidence.textContent = conf || "\u2014";
    els.diagProfileConfidence.className = "";
    if (conf === "high") els.diagProfileConfidence.classList.add("confidence-high");
    else if (conf === "medium") els.diagProfileConfidence.classList.add("confidence-medium");
    else if (conf === "low") els.diagProfileConfidence.classList.add("confidence-low");
    else if (conf === "manual") els.diagProfileConfidence.classList.add("confidence-manual");
  }
  if (els.diagProfileSignals) {
    els.diagProfileSignals.textContent = payload.profileMatchSignals.length
      ? payload.profileMatchSignals.join(", ") : "\u2014";
  }
  // Depth filter diagnostics
  if (els.diagDepthMax) {
    const dm = payload.depthMax || 3;
    const label = dm === 1 ? "1 (Fast)" : dm === 2 ? "2 (Balanced)" : "3 (Full)";
    els.diagDepthMax.textContent = label;
  }
  if (els.diagRecipe) {
    const rid = payload.recipeId || "auto";
    const recipe = RECIPES[rid];
    els.diagRecipe.textContent = recipe ? `${recipe.label} (${rid})` : rid;
  }
  // Depth 3 engine diagnostics
  if (els.diagDepth3Engine) {
    const d3 = payload.depth3Engine || {};
    els.diagDepth3Engine.textContent = d3.enabled
      ? `enabled (${d3.captureMode || "auto"})${d3.capped ? " — capped" : ""}`
      : "disabled";
  }
  // RootSelector diagnostics
  if (els.diagRootSelector) {
    const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
    const rs = lastStep?.rootSelector || null;
    els.diagRootSelector.textContent = rs || "not set";
  }
  if (els.diagRootSelectorMatch) {
    const lastStep = (sessionState.current?.steps || []).slice(-1)[0];
    const rs = lastStep?.rootSelector || null;
    if (!rs) {
      els.diagRootSelectorMatch.textContent = "\u2014";
      els.diagRootSelectorMatch.className = "";
    } else if (lastStep?.rootSelectorNotFound) {
      const frameIds = lastStep.rootSelectorMatchedFrameIds || [];
      els.diagRootSelectorMatch.textContent = "NOT FOUND — Selector did not match any element in the audited frame(s)";
      els.diagRootSelectorMatch.className = "confidence-low";
    } else {
      const frameIds = lastStep.rootSelectorMatchedFrameIds || [];
      const frameText = frameIds.length ? ` in frame(s): ${frameIds.join(", ")}` : "";
      els.diagRootSelectorMatch.textContent = `OK${frameText}`;
      els.diagRootSelectorMatch.className = "confidence-high";
    }
  }
  // Render WCAG coverage section
  const ecs = engineCoverageSummary();
  if (els.coverageLine) {
    els.coverageLine.textContent = `WCAG ${ecs.target.version} ${ecs.target.level} coverage: ${ecs.coveredCount}/${ecs.totalCount} criteria (engine)`;
  }
  if (els.coverageMissingList) {
    const MAX_SHOWN = 20;
    const _crit = typeof WCAG_CRITERIA !== "undefined" ? WCAG_CRITERIA : [];
    const titleMap = {};
    for (const c of _crit) titleMap[c.criterion] = c.title;
    const items = ecs.criteriaMissing.slice(0, MAX_SHOWN);
    els.coverageMissingList.innerHTML = items.map(c =>
      `<li>${escapeHtml(c)} ${escapeHtml(titleMap[c] || "")}</li>`
    ).join("") + (ecs.criteriaMissing.length > MAX_SHOWN
      ? `<li class="coverageMore">+${ecs.criteriaMissing.length - MAX_SHOWN} more</li>`
      : "");
  }
  // Perf diagnostics (gated by localStorage flag)
  var diagPerfLabel = document.getElementById("diagPerfLabel");
  var diagPerfText = document.getElementById("diagPerfText");
  if (diagPerfLabel && diagPerfText) {
    var showPerf = localStorage.getItem("flowlens:debugPerf") === "1";
    diagPerfLabel.style.display = showPerf ? "" : "none";
    diagPerfText.style.display = showPerf ? "" : "none";
    if (showPerf) {
      diagPerfText.textContent = "Rerenders: " + __flPerf.rerenderFindingsCount
        + " | Last: " + __flPerf.lastRerenderFindingsMs.toFixed(1) + " ms"
        + " | Rows: " + __flPerf.lastRenderedRows;
    }
  }
}

async function loadProfiles() {
  const { customProfiles = {}, activeProfiles } = await storageGet(["customProfiles", "activeProfiles"]);
  // Merge profiles: generics (lowest) → builtins → custom (highest priority)
  const generics = (typeof GENERIC_PROFILES !== "undefined") ? GENERIC_PROFILES : {};
  profileState.profiles = { ...generics, ...BUILTIN_PROFILES, ...customProfiles };
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
  if (els.depthMax && uiPrefs.depthMax) els.depthMax.value = String(uiPrefs.depthMax);
  if (els.recipeSelect && uiPrefs.recipeId) {
    els.recipeSelect.value = uiPrefs.recipeId;
    applyRecipe(uiPrefs.recipeId);
  }
  const ciOpts = uiPrefs.junitCiOptions || {};
  if (els.ciFailOnBlocking) els.ciFailOnBlocking.checked = ciOpts.failOnBlocking !== false;
  if (els.ciTreatNeedsReview) els.ciTreatNeedsReview.checked = !!ciOpts.treatNeedsReviewAsFailure;
  if (els.ciMaxFailures) els.ciMaxFailures.value = String(ciOpts.maxFailuresAllowed || 0);
  await loadProfiles();
}

/**
 * Build a deterministic, PII-free diagnostics payload for clipboard export.
 * Pure function — no DOM, no network, no side effects.
 * @param {object} opts
 * @param {string} opts.version - FlowLens version string
 * @param {object} opts.dataVersions - { schemaVersion, signatureVersion, frameKeyVersion, enMappingVersion }
 * @param {string} opts.url - inspected URL (origin only for safety)
 * @param {string} opts.env - environment tag
 * @param {number|null} opts.bestFrameId - runtime frame ID
 * @param {string|null} opts.bestFrameKey - deterministic frame key
 * @param {string} opts.frameScope - frame scope mode (primary/host/embedded/all)
 * @param {object|null} opts.scope - { type, rootSelector }
 * @param {object|null} opts.shadowCoverage - shadow coverage object
 * @returns {object}
 */
/**
 * Format data versions into a compact summary line.
 * Pure function — deterministic, no side effects.
 * @param {{ schemaVersion: number, signatureVersion: number, frameKeyVersion: number, enMappingVersion: number }} dv
 * @returns {string}
 */
function formatDataVersionsLine(dv) {
  const d = dv || {};
  return `schema v${asNumber(d.schemaVersion, 0)} \u2022 sig v${asNumber(d.signatureVersion, 0)} \u2022 frameKey v${asNumber(d.frameKeyVersion, 0)} \u2022 EN map v${asNumber(d.enMappingVersion, 0)}`;
}

// ── WCAG Coverage Summary ───────────────────────────────────────────────────

/**
 * Engine coverage summary — based on RULE_TO_WCAG presence (static, page-independent).
 * Returns which target criteria have at least one rule mapping.
 * Pure, deterministic.
 */
function engineCoverageSummary(opts) {
  const _criteria = typeof WCAG_CRITERIA !== "undefined" ? WCAG_CRITERIA : [];
  const _ruleMap = typeof RULE_TO_WCAG !== "undefined" ? RULE_TO_WCAG : {};
  const _target = typeof WCAG_TARGET !== "undefined" ? WCAG_TARGET : { version: "2.2", level: "AA" };
  const _version = typeof WCAG_COVERAGE_VERSION !== "undefined" ? WCAG_COVERAGE_VERSION : 0;
  const targetVersion = (opts && opts.targetVersion) || _target.version;
  const targetLevel = (opts && opts.targetLevel) || _target.level;
  const targetSet = new Set();
  const levelIncluded = targetLevel === "AA" ? new Set(["A", "AA"]) : new Set(["A"]);
  for (const c of _criteria) {
    if (c.isInTarget && levelIncluded.has(c.level)) targetSet.add(c.criterion);
  }
  // Collect unique criteria covered by at least one rule
  const coveredSet = new Set();
  for (const key of Object.keys(_ruleMap)) {
    const mapping = _ruleMap[key];
    if (mapping && mapping.criterion && targetSet.has(mapping.criterion)) {
      coveredSet.add(mapping.criterion);
    }
    // Handle compound mappings (also field)
    if (mapping && Array.isArray(mapping.also)) {
      for (const c of mapping.also) {
        if (targetSet.has(c)) coveredSet.add(c);
      }
    }
  }
  const criteriaCovered = [...coveredSet].sort();
  const allTarget = [...targetSet].sort();
  const criteriaMissing = allTarget.filter(c => !coveredSet.has(c));
  return {
    target: { version: targetVersion, level: targetLevel },
    coverageVersion: _version,
    criteriaCovered,
    criteriaMissing,
    coveredCount: criteriaCovered.length,
    totalCount: allTarget.length,
  };
}

/**
 * Parse a wcag value string into an array of valid criterion tokens (X.X.X format).
 * Handles mixed separators (/, comma, space), normalizes whitespace,
 * deduplicates, and ignores invalid tokens.
 * Pure, deterministic.
 * @param {*} value - wcag string like "2.4.4", "2.4.4 / 4.1.2", "2.4.4,4.1.2", "2.4.4 4.1.2"
 * @returns {string[]} sorted, deduplicated array of valid criterion tokens
 */
function parseWcagCriteria(value) {
  if (!value) return [];
  const raw = String(value);
  // Split on /, comma, or whitespace (handles all mixed separators)
  const tokens = raw.split(/[\/,\s]+/).map(s => s.trim()).filter(Boolean);
  // Only keep tokens matching X.X.X or X.X.XX numeric criterion format
  const CRITERION_RE = /^\d+\.\d+\.\d+$/;
  const seen = new Set();
  const result = [];
  for (const t of tokens) {
    if (CRITERION_RE.test(t) && !seen.has(t)) {
      seen.add(t);
      result.push(t);
    }
  }
  return result.sort();
}

/**
 * Observed coverage — based on findings present in a specific run.
 * A criterion counts as "observed" if at least one finding references it.
 * Pure, deterministic.
 */
function runCoverageObserved(findings, opts) {
  const _criteria = typeof WCAG_CRITERIA !== "undefined" ? WCAG_CRITERIA : [];
  const _target = typeof WCAG_TARGET !== "undefined" ? WCAG_TARGET : { version: "2.2", level: "AA" };
  const _version = typeof WCAG_COVERAGE_VERSION !== "undefined" ? WCAG_COVERAGE_VERSION : 0;
  const targetVersion = (opts && opts.targetVersion) || _target.version;
  const targetLevel = (opts && opts.targetLevel) || _target.level;
  const targetSet = new Set();
  const levelIncluded = targetLevel === "AA" ? new Set(["A", "AA"]) : new Set(["A"]);
  for (const c of _criteria) {
    if (c.isInTarget && levelIncluded.has(c.level)) targetSet.add(c.criterion);
  }
  // Collect unique criteria from findings' wcag fields
  const observedSet = new Set();
  const items = Array.isArray(findings) ? findings : [];
  for (const f of items) {
    if (!f || !f.wcag) continue;
    const parsed = parseWcagCriteria(f.wcag);
    for (const p of parsed) {
      if (targetSet.has(p)) observedSet.add(p);
    }
  }
  const criteriaCovered = [...observedSet].sort();
  const allTarget = [...targetSet].sort();
  const criteriaMissing = allTarget.filter(c => !observedSet.has(c));
  return {
    target: { version: targetVersion, level: targetLevel },
    coverageVersion: _version,
    criteriaCovered,
    criteriaMissing,
    coveredCount: criteriaCovered.length,
    totalCount: allTarget.length,
  };
}

function buildDiagnosticsPayload(opts) {
  const o = opts || {};
  const dv = o.dataVersions || {};
  return {
    version: String(o.version || "unknown"),
    dataVersions: {
      schemaVersion: asNumber(dv.schemaVersion, 0),
      signatureVersion: asNumber(dv.signatureVersion, 0),
      frameKeyVersion: asNumber(dv.frameKeyVersion, 0),
      enMappingVersion: asNumber(dv.enMappingVersion, 0),
    },
    url: String(o.url || ""),
    env: String(o.env || ""),
    bestFrameId: o.bestFrameId != null ? Number(o.bestFrameId) : null,
    bestFrameKey: o.bestFrameKey ? String(o.bestFrameKey) : null,
    frameScope: String(o.frameScope || "primary"),
    scope: o.scope && typeof o.scope === "object"
      ? { type: String(o.scope.type || "document"), rootSelector: o.scope.rootSelector || null }
      : { type: "document", rootSelector: null },
    shadowCoverage: o.shadowCoverage && typeof o.shadowCoverage === "object"
      ? {
          scopesFound: Number(o.shadowCoverage.scopesFound) || 0,
          scopesAudited: Number(o.shadowCoverage.scopesAudited) || 0,
          scopesCapped: !!o.shadowCoverage.scopesCapped,
          maxDepthObserved: Number(o.shadowCoverage.maxDepthObserved) || 0,
          depthLimitReached: !!o.shadowCoverage.depthLimitReached,
        }
      : null,
    activeProfileId: o.activeProfileId ? String(o.activeProfileId) : null,
    activeProfileLabel: o.activeProfileLabel ? String(o.activeProfileLabel) : null,
    profileConfidence: o.profileConfidence ? String(o.profileConfidence) : null,
    profileMatchSignals: Array.isArray(o.profileMatchSignals)
      ? [...o.profileMatchSignals].map(String).sort().slice(0, 5) : [],
    profileSuspect: !!o.profileSuspect,
    rootSelector: o.rootSelector ? String(o.rootSelector) : null,
    rootSelectorNotFound: !!o.rootSelectorNotFound,
    rootSelectorMatchedFrameIds: Array.isArray(o.rootSelectorMatchedFrameIds)
      ? [...o.rootSelectorMatchedFrameIds] : [],
    reducedDiffConfidence: !!o.reducedDiffConfidence,
    depthMax: (o.depthMax === 1 || o.depthMax === 2 || o.depthMax === 3) ? o.depthMax : 3,
    recipeId: o.recipeId ? String(o.recipeId) : "auto",
    rulePack: o.rulePack && (o.rulePack.enabledRuleIds?.length || o.rulePack.disabledRuleIds?.length)
      ? {
          enabledCount: o.rulePack.enabledRuleIds?.length || 0,
          disabledCount: o.rulePack.disabledRuleIds?.length || 0,
        }
      : null,
    dataVersionsLine: formatDataVersionsLine(dv),
    hostConfigId: o.hostConfigId ? String(o.hostConfigId) : "generic",
    frameGatingSelectorCount: Number(o.frameGatingSelectorCount) || 0,
    excludedFrameCount: Number(o.excludedFrameCount) || 0,
    depth3Engine: {
      enabled: true,
      captureMode: o.depth3CaptureMode || "auto",
      capped: !!o.depth3Capped,
    },
    buildInfo: { mv3: true },
    depth3Aggregates: (() => {
      if (typeof buildDepth3Aggregates !== "function") return null;
      const visibleFindings = Array.isArray(o.findings) ? applyAllFindingFilters(o.findings) : [];
      return buildDepth3Aggregates(visibleFindings, RULE_TO_WCAG);
    })(),
    depthSuggestion: (() => {
      const pid = o.activeProfileId;
      const profile = pid
        ? (profileState?.profiles?.[pid] || (typeof GENERIC_PROFILES !== "undefined" ? GENERIC_PROFILES[pid] : null))
        : null;
      const rec = profile?.recommended;
      if (!rec || rec.depthMax == null) return null;
      const currentDepth = o.depthMax || 3;
      if (rec.depthMax > currentDepth) {
        return { suggestedDepth: rec.depthMax, profileId: pid, reason: "profile_recommendation" };
      }
      return null;
    })(),
  };
}

/**
 * Build a CI JSON report from current panel state.
 * Gathers inputs from state, session, profile, and findings.
 * Returns the output of buildCIReport — a contractVersion "1.0" object.
 */
function buildCIReportFromState() {
  if (typeof buildCIReport !== "function") return null;

  var version = (typeof __FLOWLENS_VERSION__ !== "undefined") ? __FLOWLENS_VERSION__ : "dev";
  var bestEntry = state.lastResult?.bestEntry || state.lastResult?.best || null;
  var rawFindings = Array.isArray(bestEntry?.result?.findings) ? bestEntry.result.findings : [];
  var filteredFindings = applyAllFindingFilters(rawFindings);

  // Severity counts from filtered findings
  var bySeverity = { high: 0, medium: 0, low: 0, info: 0 };
  for (var fi = 0; fi < filteredFindings.length; fi++) {
    var sev = (filteredFindings[fi]?.severity || "info").toLowerCase();
    if (sev in bySeverity) bySeverity[sev]++;
  }

  // Blocking count from stable signatures. computeStableSignatureSet expects
  // a step snapshot ({ mode, best: { normalized: { raw } } }), not the raw
  // RUN_AUDIT response — wrap the best entry accordingly.
  var sigSet = { stableFindingSignatureSet: [], blockingSet: [] };
  if (bestEntry && bestEntry.ok === true && bestEntry.result) {
    sigSet = computeStableSignatureSet({
      mode: state.lastResult?.action || "run",
      best: {
        frameKey: bestEntry.frameKey || null,
        frameKeyStable: bestEntry.frameKeyStable || null,
        normalized: { raw: bestEntry.result },
      },
    });
  }
  var blockingCount = sigSet.blockingSet?.length || 0;

  // Regressions from session diff (if available)
  var regressions = { blockingAdded: [], blockingFixed: [] };
  var session = sessionState.current;
  if (session?.steps?.length >= 2) {
    var steps = session.steps;
    var prevStep = steps[steps.length - 2];
    var currStep = steps[steps.length - 1];
    var prevBlocking = new Set(prevStep?.stableSignatures?.run?.blockingSet || []);
    var currBlocking = new Set(currStep?.stableSignatures?.run?.blockingSet || []);

    for (var sig of currBlocking) {
      if (!prevBlocking.has(sig)) {
        regressions.blockingAdded.push(enrichRegressionEntry(sig));
      }
    }
    for (var sig2 of prevBlocking) {
      if (!currBlocking.has(sig2)) {
        regressions.blockingFixed.push({ signature: String(sig2) });
      }
    }
  }

  // Depth3 aggregates
  var d3aggs = (typeof buildDepth3Aggregates === "function")
    ? buildDepth3Aggregates(filteredFindings, RULE_TO_WCAG) : null;

  // Profile info
  var activeProfileId = profileState.active[0] || null;
  var profileObj = activeProfileId
    ? (profileState.profiles?.[activeProfileId] || (typeof GENERIC_PROFILES !== "undefined" ? GENERIC_PROFILES[activeProfileId] : null))
    : null;

  // Diff confidence
  var reducedDiff = (session?.steps || []).some(function(s) {
    return s.profileSuspect === true || s.stableSignatures?.run?.stepQuality?.degraded === true;
  });

  return buildCIReport({
    tool: { name: "FlowLens", version: version, hostId: hostConfig?.id || "generic" },
    scope: {
      depthMax: getActiveDepthMax(),
      profileId: activeProfileId,
      profileConfidence: (() => {
        var lastStep = (session?.steps || []).slice(-1)[0];
        return lastStep?.profileConfidence || null;
      })(),
      rulePackHash: null,
    },
    quality: {
      signatureQuality: sigSet.stableFindingSignatureSet?.length > 0 ? "available" : "none",
      diffConfidence: reducedDiff ? "reduced" : "normal",
    },
    summary: {
      blockingAdded: regressions.blockingAdded.length,
      blockingFixed: regressions.blockingFixed.length,
      blockingCurrent: blockingCount,
      totalCount: filteredFindings.length,
      bySeverity: bySeverity,
    },
    regressions: regressions,
    depth3Aggregates: d3aggs,
  });
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

// Retry button in error empty state: re-trigger run
const emptyRetryBtn = document.getElementById("emptyRetry");
if (emptyRetryBtn) {
  emptyRetryBtn.addEventListener("click", () => _lockedPreset([state.activeMode || "run"]));
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
  await copyText(pretty(enrichRunJsonExport(state.lastResult)));
  setExportMenuOpen(false);
  toast("Copied JSON");
});

els.downloadJson.addEventListener("click", () => {
  downloadText(`a11yflowaudit-${Date.now()}.json`, pretty(enrichRunJsonExport(state.lastResult)), "application/json");
  setExportMenuOpen(false);
  toast("Downloaded JSON");
});

if (els.downloadMd) {
  els.downloadMd.addEventListener("click", () => {
    const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
    const envTag = `${originFrom(url) || "\u2014"} \u2022 ${detectEnv(url)}`;
    const _best = state.lastResult?.bestEntry || state.lastResult?.best;
    const md = buildMarkdown({
      inspectedUrl: url,
      best: _best,
      perFrame: state.lastResult?.perFrame,
      usedFrameIds: state.lastResult?.usedFrameIds,
      envTag,
      shadowCoverage: _best?.result?.shadowCoverage || _best?.shadowCoverage || null,
    });
    downloadText(`a11yflowaudit-${Date.now()}.md`, md, "text/markdown");
    setExportMenuOpen(false);
    toast("Downloaded MD");
  });
}

if (els.downloadHtmlReport) {
  els.downloadHtmlReport.addEventListener("click", () => {
    const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
    const bestEntry = state.lastResult?.bestEntry || state.lastResult?.best || null;
    const allFindings = Array.isArray(bestEntry?.result?.findings) ? bestEntry.result.findings : [];
    const findings = applyFixSuggestions(applyAllFindingFilters(allFindings));
    const session = sessionState.current || sessionState.lastEndedSession || null;
    const sessionSummary = (session && Array.isArray(session.steps) && session.steps.length)
      ? {
        id: session.id || "",
        steps: session.steps.map((s, i, arr) => {
          const out = {
            index: s?.index ?? 0,
            label: s?.label || "",
            route: s?.routeHint || s?.url || "",
            added: s?.diffs?.consolidated?.added ?? 0,
            fixed: s?.diffs?.consolidated?.fixed ?? 0,
            persisting: s?.diffs?.consolidated?.persisting ?? 0,
            blockingAdded: s?.diffs?.consolidated?.blockingAdded ?? 0,
          };
          // Screen-reader outline diff counts (guarded — outlines are optional)
          const prev = i > 0 ? arr[i - 1] : null;
          if (s?.a11yOutline?.nodes && prev?.a11yOutline?.nodes) {
            const od = diffA11yOutlines(prev.a11yOutline.nodes, s.a11yOutline.nodes);
            out.srAdded = od.addedCount;
            out.srRemoved = od.removedCount;
          }
          return out;
        }),
      }
      : null;
    const html = buildHtmlReport({
      title: "FlowLens Accessibility Report",
      generatedAt: new Date().toISOString(),
      url,
      mode: state.lastResult?.mode || state.activeMode || "run",
      findings,
      severityCounts: countBySeverity(findings),
      score: computeWeightedScore(findings).score,
      manualChecklist: buildManualChecklist(state.lastResult?.mode || state.activeMode || "run"),
      sessionSummary,
    });
    downloadText(`a11yflowaudit-report-${Date.now()}.html`, html, "text/html");
    setExportMenuOpen(false);
    toast("Downloaded HTML report");
  });
}

if (els.saveBaselineMenu) {
  els.saveBaselineMenu.addEventListener("click", () => {
    const bestEntry = state.lastResult?.bestEntry || state.lastResult?.best || null;
    const allFindings = Array.isArray(bestEntry?.result?.findings) ? bestEntry.result.findings : [];
    const findings = applyAllFindingFilters(allFindings);
    if (!findings.length) {
      setExportMenuOpen(false);
      toast("No findings to baseline — run an audit first");
      return;
    }
    const { origin } = getCurrentScopeInfo();
    const baseline = buildBaselineFromFindings(findings, {
      at: new Date().toISOString(),
      origin,
      frameKeyStable: currentBaselineFrameKeyStable(),
      mode: "run",
    });
    downloadText(`a11yflowaudit-baseline-${Date.now()}.json`, JSON.stringify(baseline, null, 2), "application/json");
    setExportMenuOpen(false);
    toast("Baseline saved");
  });
}

if (els.loadBaselineMenu && els.baselineFileInput) {
  els.loadBaselineMenu.addEventListener("click", () => {
    setExportMenuOpen(false);
    els.baselineFileInput.click();
  });
  els.baselineFileInput.addEventListener("change", () => {
    const file = els.baselineFileInput.files && els.baselineFileInput.files[0];
    els.baselineFileInput.value = "";
    if (!file) return;
    if (file.size > MAX_BASELINE_FILE_BYTES) {
      toast("Baseline file too large (max 5MB)");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => toast("Could not read baseline file");
    reader.onload = async () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        const check = validateBaselinePayload(parsed);
        if (!check.ok) {
          toast(`Invalid baseline file (${check.reason})`);
          return;
        }
        const { origin } = getCurrentScopeInfo();
        await setLoadedBaseline(parsed, origin);
        toast(`Baseline loaded (${parsed.issues.length} issues)`);
        if (state.hasRunMode.has("run")) {
          await updateBaselineBanner(state.currentFindings || []);
        }
      } catch (e) {
        console.warn("Baseline import failed", e);
        toast("Invalid baseline file (parse error)");
      }
    };
    reader.readAsText(file);
  });
}

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
if (els.exportDiffReportMenu) {
  els.exportDiffReportMenu.addEventListener("click", () => {
    const session = sessionState.current || sessionState.lastEndedSession;
    if (!session) { toast("No session available"); return; }
    const payload = compactSessionForExport(normalizeLoadedSession(session));
    const report = buildMachineReadableDiffReport(payload);
    if (!report) { toast("Diff report requires at least 2 steps"); return; }
    const version = (typeof __FLOWLENS_VERSION__ !== "undefined") ? __FLOWLENS_VERSION__ : "dev";
    const env = detectEnv(els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "");
    downloadText(`flowlens-${version}-${env}-diff-report.json`, JSON.stringify(report, null, 2), "application/json");
    setExportMenuOpen(false);
    toast("Downloaded diff report JSON");
  });
}
if (els.downloadJunitXml) {
  els.downloadJunitXml.addEventListener("click", () => {
    const raw = state.lastResult || {};
    const bestEntry = raw.bestEntry || raw.best || null;
    const allFindings = Array.isArray(bestEntry?.result?.findings) ? bestEntry.result.findings : [];
    const findings = applyAllFindingFilters(allFindings);
    const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
    const env = detectEnv(url);
    const fk = bestEntry?.frameKey || "";
    const capturedAt = state._lastCapturedAt || "";
    const version = (typeof __FLOWLENS_VERSION__ !== "undefined") ? __FLOWLENS_VERSION__ : "dev";
    const wcagLevel = els.wcagLevel ? els.wcagLevel.value : "";
    const ciOptions = getJunitCiOptionsFromUi();
    const xml = buildJunitXmlForRun({
      findings,
      ctx: { frameKey: fk },
      meta: {
        extensionVersion: version,
        schemaVersion: sessionState.current?.schemaVersion || 3,
        signatureVersion: sessionState.current?.signatureVersion || 2,
        frameKeyVersion: sessionState.current?.frameKeyVersion || 1,
        enMappingVersion: typeof EN_MAPPING_VERSION !== "undefined" ? EN_MAPPING_VERSION : 0,
        url,
        envTag: `${originFrom(url) || "\u2014"} \u2022 ${env}`,
        wcagLevel,
        capturedAt,
      },
      ciOptions,
    });
    const mode = state.lastResult?.mode || "run";
    const ciSuffix = isNonDefaultJunitCiOptions(ciOptions) ? ".ci-strict" : "";
    downloadText(`flowlens-${version}-${env}-${mode}${ciSuffix}.junit.xml`, xml, "application/xml");
    setExportMenuOpen(false);
    toast("Downloaded JUnit XML");
  });
}
if (els.exportSessionJunitMenu) {
  els.exportSessionJunitMenu.addEventListener("click", () => {
    const session = sessionState.current || sessionState.lastEndedSession;
    if (!session) { toast("No session available"); return; }
    const payload = compactSessionForExport(normalizeLoadedSession(session));
    if (!payload) { toast("Session JUnit export failed"); return; }
    const url = els.inspectedUrl.dataset.full || els.inspectedUrl.textContent || "";
    const env = detectEnv(url);
    const version = (typeof __FLOWLENS_VERSION__ !== "undefined") ? __FLOWLENS_VERSION__ : "dev";
    const wcagLevel = els.wcagLevel ? els.wcagLevel.value : "";
    const ciOptions = getJunitCiOptionsFromUi();
    const xml = buildJunitXmlForSession({
      session: payload,
      rawAppendix: payload.rawAppendix || {},
      meta: {
        extensionVersion: version,
        schemaVersion: payload.schemaVersion || 3,
        signatureVersion: payload.signatureVersion || 2,
        frameKeyVersion: payload.frameKeyVersion || 1,
        enMappingVersion: typeof EN_MAPPING_VERSION !== "undefined" ? EN_MAPPING_VERSION : 0,
        url,
        envTag: `${originFrom(url) || "\u2014"} \u2022 ${env}`,
        wcagLevel,
      },
      ciOptions,
    });
    const ciSuffix = isNonDefaultJunitCiOptions(ciOptions) ? ".ci-strict" : "";
    downloadText(`flowlens-${version}-${env}-session-${payload.id || "unknown"}${ciSuffix}.junit.xml`, xml, "application/xml");
    setExportMenuOpen(false);
    toast("Session JUnit XML exported");
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

if (els.sheetCopyRaw) {
  els.sheetCopyRaw.addEventListener("click", async () => {
    await copyText(els.json.textContent || "");
    setExportMenuOpen(false);
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

/** Build detail row HTML for a finding */
function buildDetailRow(finding, colCount) {
  const sev = finding.severity || 'info';
  const fields = [
    ['Severity', `<span class="pill ${escapeHtml(sev)}">${escapeHtml(sev)}</span>`],
    ['WCAG', escapeHtml(finding.wcag ?? '')],
    ['Name', escapeHtml(finding.name ?? '')],
    ['Type', escapeHtml(finding.type ?? '')],
    ['Path', escapeHtml(finding.path ?? ''), true],
    ['Fix', escapeHtml(finding.fix ?? ''), true],
  ];
  const isCrossFrame = !finding.el && (typeof RULE_TO_WCAG !== "undefined") && RULE_TO_WCAG[finding.type]?.group === "depth3/multiframe";
  if (isCrossFrame) {
    fields.push(['Scope', '<span class="badge crossFrame">Cross-frame</span> This finding spans multiple frames and cannot be highlighted individually']);
  }
  const html = fields
    .filter(([, v]) => v)
    .map(([k, v, mono]) =>
      `<span class="detailLabel">${escapeHtml(k)}</span><span class="detailValue${mono ? ' detailMono' : ''}">${v}</span>`
    ).join('');
  return `<tr class="detailRow" style="--row-sev:var(--sev-${escapeHtml(sev)})"><td colspan="${colCount}"><div class="detailInner">${html}<div class="detailActions"><button class="btn xs detailCopy" type="button">Copy</button></div></div></td></tr>`;
}

if (els.allTableBody && !els.allTableBody.__bound) {
  els.allTableBody.__bound = true;
  els.allTableBody.addEventListener("click", async (e) => {
    try {
      // Copy button inside detail row
      if (e.target.closest(".detailCopy")) {
        const idx = VT.all ? VT.all.expandedIdx : null;
        const f = Number.isFinite(idx) ? state.explorer[idx] : null;
        if (f) {
          const text = Object.entries(f).filter(([k, v]) => v && !k.startsWith('_')).map(([k, v]) => `${k}: ${v}`).join('\n');
          await copyText(text);
          toast("Copied to clipboard");
        }
        return;
      }

      // Row click — toggle expand + auto-highlight on expand
      const tr = e.target.closest("tr.trow");
      if (!tr) return;
      const idx = Number(tr.getAttribute("data-i"));
      const f = Number.isFinite(idx) ? state.explorer[idx] : null;
      if (!f || !VT.all) return;

      VT.all.toggleExpanded(idx);
      if (VT.all.expandedIdx === idx) {
        const isCrossFrame = !f.el && (typeof RULE_TO_WCAG !== "undefined") && RULE_TO_WCAG[f.type]?.group === "depth3/multiframe";
        if (isCrossFrame) {
          toast("Cross-frame finding — cannot highlight across frame boundaries");
        } else {
          await highlightFinding(f, state._activeHighlightCtx);
        }
      }
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
      if (!item) return;

      await highlightFinding({ path: item.path, testId: item.testId, tag: item.tag, name: item.text }, state._activeHighlightCtx);
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

      await highlightFinding({ path: item.path, name: item.name, role: item.role }, state._activeHighlightCtx);
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

if (els.depthMax) {
  els.depthMax.addEventListener("change", async () => {
    const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
    uiPrefs.depthMax = Number(els.depthMax.value) || 3;
    await storageSet({ uiPrefs });
    // Re-render current findings with new depth filter
    const currentRec = state.currentId ? state.byId[state.currentId] : state.records?.[0];
    const mode = currentRec?.action || "run";
    const cached = state.findingsByMode[mode];
    if (cached) {
      const filtered = applyAllFindingFilters(cached);
      state.currentFindings = filtered;
      scheduleRerenderFindings("depth_filter");
    }
    renderDiagnostics();
  });
}

if (els.recipeSelect) {
  els.recipeSelect.addEventListener("change", async () => {
    const recipeId = els.recipeSelect.value || "auto";
    applyRecipe(recipeId);
    const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
    uiPrefs.recipeId = recipeId;
    await storageSet({ uiPrefs });
    renderDiagnostics();
  });
}

if (els.alsoConsole) {
  els.alsoConsole.addEventListener("change", async () => {
    const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
    uiPrefs.alsoConsole = !!els.alsoConsole.checked;
    await storageSet({ uiPrefs });
  });
}

// --- JUnit CI options persistence ---
function getJunitCiOptionsFromUi() {
  return {
    failOnBlocking: els.ciFailOnBlocking ? els.ciFailOnBlocking.checked : true,
    treatNeedsReviewAsFailure: els.ciTreatNeedsReview ? !!els.ciTreatNeedsReview.checked : false,
    maxFailuresAllowed: els.ciMaxFailures ? Math.max(0, parseInt(els.ciMaxFailures.value, 10) || 0) : 0,
  };
}
async function saveJunitCiOptions() {
  const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
  uiPrefs.junitCiOptions = getJunitCiOptionsFromUi();
  await storageSet({ uiPrefs });
}
if (els.ciFailOnBlocking) els.ciFailOnBlocking.addEventListener("change", saveJunitCiOptions);
if (els.ciTreatNeedsReview) els.ciTreatNeedsReview.addEventListener("change", saveJunitCiOptions);
if (els.ciMaxFailures) els.ciMaxFailures.addEventListener("change", saveJunitCiOptions);

// Copy diagnostics
if (els.copyDiagnostics) {
  els.copyDiagnostics.addEventListener("click", async () => {
    const payload = buildDiagnosticsPayload(gatherDiagnosticsOpts());
    const ok = await copyText(pretty(payload));
    if (els.copyDiagHint) {
      els.copyDiagHint.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => { els.copyDiagHint.textContent = ""; }, 2000);
    }
  });
}
if (els.copyDiagnosticsMdBtn) {
  els.copyDiagnosticsMdBtn.addEventListener("click", async () => {
    const payload = buildDiagnosticsPayload(gatherDiagnosticsOpts());
    const md = buildDiagnosticsMarkdown(payload);
    const ok = await copyText(md);
    if (els.copyDiagHint) {
      els.copyDiagHint.textContent = ok ? "Copied!" : "Copy failed";
      setTimeout(() => { els.copyDiagHint.textContent = ""; }, 2000);
    }
  });
}
if (els.copyCiJson) {
  els.copyCiJson.addEventListener("click", async () => {
    const report = buildCIReportFromState();
    if (!report) {
      if (els.copyDiagHint) {
        els.copyDiagHint.textContent = "CI exporter not available";
        setTimeout(() => { els.copyDiagHint.textContent = ""; }, 2000);
      }
      return;
    }
    const ok = await copyText(pretty(report));
    if (els.copyDiagHint) {
      els.copyDiagHint.textContent = ok ? "Copied CI JSON!" : "Copy failed";
      setTimeout(() => { els.copyDiagHint.textContent = ""; }, 2000);
    }
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

// Group-by-component toggle (default OFF — flat findings list unchanged)
if (els.groupByComponent) {
  els.groupByComponent.addEventListener("change", () => {
    state.groupByComponent = !!els.groupByComponent.checked;
    renderExplorer(state.currentFindings);
  });
}

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

  // Roving arrow-key navigation, delegated because the tab list is
  // re-rendered via innerHTML on every filter change.
  els.sevTabs.addEventListener("keydown", (e) => {
    const tabs = [...els.sevTabs.querySelectorAll(".sevTab")];
    if (!tabs.length) return;
    const idx = tabs.indexOf(e.target.closest(".sevTab"));
    if (idx < 0) return;
    let next = idx;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    tabs[next].click(); // click handler re-renders and restores focus
  });
}

// Integrity overview pill click — group filter toggle (attached exactly once)
var _integrityPillsBound = false;
function initIntegrityOverviewOnce() {
  if (_integrityPillsBound) return;
  _integrityPillsBound = true;
  document.querySelectorAll(".integrityPill").forEach(btn => {
    btn.addEventListener("click", () => {
      const group = btn.getAttribute("data-group");
      activeGroupFilter = (activeGroupFilter === group) ? null : group;
      document.querySelectorAll(".integrityPill").forEach(b => b.classList.remove("active"));
      if (activeGroupFilter) btn.classList.add("active");
      scheduleRerenderFindings("pill_filter");
    });
  });
}
initIntegrityOverviewOnce();

// Contrast search clear button
const contrastClearBtn = document.getElementById("contrastSearchClear");
if (contrastClearBtn && els.contrastQ) {
  contrastClearBtn.addEventListener("click", () => {
    els.contrastQ.value = "";
    els.contrastQ.focus();
    updateContrastView();
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

// Tab path overlay — draw numbered tab stops + connecting path on the inspected page
if (els.showTabPathBtn) {
  els.showTabPathBtn.addEventListener("click", async () => {
    if (!state.hasRunMode.has("tabWalk")) {
      toast("Run a Tab Walk first");
      return;
    }
    // Only the fields showTabPath consumes cross the message boundary
    const events = (Array.isArray(state.tabData) ? state.tabData : [])
      .slice(0, 200)
      .map(e => ({
        i: Number.isInteger(e?.i) ? e.i : null,
        type: typeof e?.type === "string" ? e.type : "",
        path: typeof e?.path === "string" ? e.path : null,
      }));
    try {
      const res = await send({ type: "SHOW_TAB_PATH", frameId: state.bestFrameId ?? 0, events });
      if (res?.ok) {
        const flagged = res.blocked ? `, ${res.blocked} flagged` : "";
        toast(`Tab path shown: ${res.rendered ?? 0} stops${flagged}`);
      } else {
        toast(`Could not show tab path (${res?.error || "unknown"})`);
      }
    } catch {
      toast("Could not show tab path (runtime unavailable)");
    }
  });
}

if (els.clearTabPathBtn) {
  els.clearTabPathBtn.addEventListener("click", async () => {
    try {
      const res = await send({ type: "SHOW_TAB_PATH", frameId: state.bestFrameId ?? 0, clear: true });
      toast(res?.ok ? "Overlay cleared" : `Could not clear overlay (${res?.error || "unknown"})`);
    } catch {
      toast("Could not clear overlay (runtime unavailable)");
    }
  });
}

// Assist toolbox — WCAG stress-test toggles + vision simulators applied to the
// inspected page. Only one assist is active at a time; Clear (or re-clicking
// the active toggle) removes it. Everything happens via APPLY_ASSIST messages.
if (els.assistBar) {
  const assistButtons = Array.from(els.assistBar.querySelectorAll("button[data-assist]"));
  const setAssistPressed = (activeKind) => {
    for (const b of assistButtons) {
      if (b.dataset.assist === "clear") continue;
      b.setAttribute("aria-pressed", String(b.dataset.assist === activeKind));
    }
  };
  els.assistBar.addEventListener("click", async (e) => {
    const btn = e.target.closest ? e.target.closest("button[data-assist]") : null;
    if (!btn || !els.assistBar.contains(btn)) return;
    const requested = btn.dataset.assist;
    const isActive = btn.getAttribute("aria-pressed") === "true";
    // Re-clicking the active toggle turns it off (same as Clear)
    const kind = (requested === "clear" || isActive) ? "clear" : requested;
    try {
      const res = await send({ type: "APPLY_ASSIST", frameId: state.bestFrameId ?? 0, kind });
      if (res?.ok) {
        setAssistPressed(kind === "clear" ? null : kind);
        toast(kind === "clear" ? "Assist cleared" : `Assist on: ${btn.textContent.trim()}`);
      } else {
        toast(`Assist failed (${res?.error || "unknown"})`);
      }
    } catch {
      toast("Assist failed (runtime unavailable)");
    }
  });
}

// Page structure — scan headings + landmarks of the inspected page and
// render them as indented outline / labeled landmark lists.
if (els.structureScanBtn) {
  els.structureScanBtn.addEventListener("click", async () => {
    try {
      const res = await send({ type: "GET_PAGE_STRUCTURE", frameId: state.bestFrameId ?? 0 });
      if (res?.ok && res.structure) {
        state.pageStructure = res.structure;
        renderPageStructure(res.structure);
        const sum = res.structure.summary || {};
        toast(`Structure: ${sum.headingCount ?? 0} headings, ${sum.landmarkCount ?? 0} landmarks`);
      } else {
        toast(`Could not scan structure (${res?.error || "unknown"})`);
      }
    } catch {
      toast("Could not scan structure (runtime unavailable)");
    }
  });
}

// Page structure overlay — labeled outline boxes on the inspected page
// (kind "clear" removes the overlay; mirrors the assist/tab-path pattern).
const sendShowStructure = async (kind) => {
  try {
    const res = await send({ type: "SHOW_STRUCTURE", frameId: state.bestFrameId ?? 0, kind });
    if (res?.ok) {
      toast(kind === "clear"
        ? "Structure overlay cleared"
        : `Structure shown: ${res.rendered ?? 0} ${kind}`);
    } else {
      toast(`Could not show structure (${res?.error || "unknown"})`);
    }
  } catch {
    toast("Could not show structure (runtime unavailable)");
  }
};
if (els.structureShowHeadings) {
  els.structureShowHeadings.addEventListener("click", () => sendShowStructure("headings"));
}
if (els.structureShowLandmarks) {
  els.structureShowLandmarks.addEventListener("click", () => sendShowStructure("landmarks"));
}
if (els.structureClearHeadings) {
  els.structureClearHeadings.addEventListener("click", () => sendShowStructure("clear"));
}
if (els.structureClearLandmarks) {
  els.structureClearLandmarks.addEventListener("click", () => sendShowStructure("clear"));
}

// Guided checks — wizard-style semi-automated tests. Starter buttons fetch
// candidates via GET_GUIDED_CANDIDATES; answers are delegated on the answer
// group (real <button>s rendered by renderGuidedAnswerButtons).
if (els.guidedStartImages) {
  els.guidedStartImages.addEventListener("click", () => { startGuidedWizard("images"); });
}
if (els.guidedStartControls) {
  els.guidedStartControls.addEventListener("click", () => { startGuidedWizard("controls"); });
}
if (els.guidedCancel) {
  els.guidedCancel.addEventListener("click", () => {
    if (!guidedState.active) return;
    resetGuidedWizard();
    toast("Guided check cancelled");
  });
}
if (els.guidedAnswers) {
  els.guidedAnswers.addEventListener("click", (e) => {
    const btn = e.target.closest ? e.target.closest("button[data-guided-answer]") : null;
    if (!btn || !els.guidedAnswers.contains(btn)) return;
    answerGuidedCandidate(btn.dataset.guidedAnswer);
  });
}

// Manual checks — purely informational; checkbox state lives in memory only.
renderManualChecklist();
if (els.manualChecksList) {
  els.manualChecksList.addEventListener("change", (e) => {
    const cb = e.target;
    const id = cb?.dataset?.checkId;
    if (!id) return;
    if (cb.checked) manualCheckState.add(id);
    else manualCheckState.delete(id);
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
  if (key === "4") { showView("about"); return; }

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
  allTable: ['sev', 'wcag', 'name', 'type'],
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
        rules.push(`#${tableId} th:nth-child(${n}), #${tableId} td:nth-child(${n}) { width: 0 !important; max-width: 0 !important; padding: 0 !important; border: none !important; overflow: hidden; font-size: 0; line-height: 0; visibility: hidden; }`);
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

// Default hidden columns for each table (indices that are hidden unless user toggled)
const DEFAULT_COL_HIDDEN = {};

function initColToggles() {
  // Load saved prefs then set up toggles
  storageGet(['colPrefs']).then(({ colPrefs }) => {
    let useSaved = false;
    if (colPrefs && Object.keys(colPrefs).length > 0) {
      // Validate saved prefs against current column counts to avoid stale indices
      const valid = Object.entries(colPrefs).every(([tableId, cols]) => {
        const expected = TABLE_COLS[tableId];
        return expected && Object.keys(cols).every(i => Number(i) < expected.length);
      });
      if (valid) { Object.assign(colVisibility, colPrefs); useSaved = true; }
    }
    if (!useSaved) {
      // Apply smart defaults — hide low-priority columns
      Object.assign(colVisibility, JSON.parse(JSON.stringify(DEFAULT_COL_HIDDEN)));
    }
    applyColStyles();

    const placements = [
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
    // Apply default sort indicator if sortState is pre-configured
    const s = sortState[t.id];
    if (s && s.col != null && ths[s.col]) {
      ths[s.col].setAttribute('data-sort-dir', s.dir);
      ths[s.col].setAttribute('aria-sort', s.dir === 'asc' ? 'ascending' : 'descending');
    }
  }
}

function initVirtualTables() {
  // All findings (potentially very large)
  const allWrap = document.querySelector("#allTable")?.closest?.(".tableWrap");
  if (allWrap && els.allTableBody && !VT.all) {
    VT.all = new VirtualTable({
      wrapEl: allWrap,
      tbodyEl: els.allTableBody,
      colCount: 4,
      rowRenderer: explorerRowHtml,
      detailRenderer: buildDetailRow,
      estimateRowHeight: 24,
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
      rowRenderer: contrastRowHtml,
      estimateRowHeight: 24,
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
      rowRenderer: tabRowHtml,
      estimateRowHeight: 24,
      overscan: 10,
    });
  }
}


// Horizontal scroll shadow indicator for .tableWrap
function initScrollShadows() {
  const wraps = document.querySelectorAll('.tableWrap');
  for (const wrap of wraps) {
    const update = () => {
      const hasOverflow = wrap.scrollWidth > wrap.clientWidth;
      const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 1;
      wrap.classList.toggle('scrollRight', hasOverflow && !atEnd);
    };
    wrap.addEventListener('scroll', update, { passive: true });
    new ResizeObserver(update).observe(wrap);
    update();
  }
}
initScrollShadows();

// Bottom sheets offset for toast positioning
(function initBottomSheetsOffset() {
  const sheets = document.getElementById("bottomSheets");
  if (!sheets) return;
  const update = () => {
    document.documentElement.style.setProperty("--bottomSheetsOffset", sheets.offsetHeight + "px");
  };
  new ResizeObserver(update).observe(sheets);
  update();
})();

// Sub-tab bar overflow fade indicators
(function initSubTabOverflow() {
  const wrap = document.getElementById("subTabBarWrap");
  const nav = document.getElementById("snapSubTabBar");
  if (!wrap || !nav) return;
  const update = () => {
    const hasOverflow = nav.scrollWidth > nav.clientWidth;
    wrap.classList.toggle("canScrollRight", hasOverflow && nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
    wrap.classList.toggle("canScrollLeft", hasOverflow && nav.scrollLeft > 1);
  };
  nav.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(nav);
  update();
})();

// Auto-capture if enabled (R4: guarded against timer stacking and inFlight races)
function scheduleAutoCaptureAfterNav() {
  if (!(sessionState.current && els.autoCaptureNav?.checked)) return;
  const { url } = getCurrentScopeInfo();
  if (!url || url === sessionState.lastAutoNavUrl) return;
  if (sessionState.autoCapturePending) clearTimeout(sessionState.autoCapturePending);
  const debounceMs = Number(els.autoCaptureDelay?.value) || 500;
  sessionState.autoCapturePending = setTimeout(async () => {
    sessionState.autoCapturePending = null;
    // Skip if session ended, or capture already in flight (will be queued by captureStepOptionC)
    if (!sessionState.current) return;
    sessionState.lastAutoNavUrl = url;
    try {
      const autoLabel = await deriveAutoLabel(url);
      await captureStepOptionC(autoLabel, { isAutoCapture: true });
    } catch (e) {
      console.error("Auto-capture failed:", e);
      toast("Auto-capture failed");
    }
  }, debounceMs);
}

async function handleNavigationEvent({ spa = false } = {}) {
  if (!spa) {
    state.findingsByMode = {};
    state.hasRunMode = new Set();
    state.contrastFilter = "all";
  }
  try {
    await refreshInspectedUrl();
    if (!spa) {
      await refreshFrames();
      toast("Navigated — refreshed frames");
    }
  } catch (e) {
    console.warn("Navigation refresh failed", e);
  }
  scheduleAutoCaptureAfterNav();
}

// auto refresh on full navigation
chrome.devtools.network.onNavigated.addListener(() => { handleNavigationEvent({ spa: false }); });

// SPA route changes (History API / hash) — broadcast by the service worker,
// the only extension context with webNavigation access. Without this,
// auto-capture never fires on single-page apps.
if (__runtime?.onMessage?.addListener) {
  __runtime.onMessage.addListener((msg, sender) => {
    if (!msg || msg.type !== "SPA_NAV_EVENT") return;
    if (sender?.id && sender.id !== chrome.runtime.id) return;
    let tabId = null;
    try { tabId = chrome.devtools?.inspectedWindow?.tabId; } catch { /* devtools gone */ }
    if (tabId == null || Number(msg.tabId) !== Number(tabId)) return;
    handleNavigationEvent({ spa: true });
  });
}

// Bottom sheet toggles
if (els.pastRunsToggle) {
  els.pastRunsToggle.addEventListener("click", () => {
    const expanded = els.pastRunsToggle.getAttribute("aria-expanded") === "true";
    els.pastRunsToggle.setAttribute("aria-expanded", String(!expanded));
    if (els.pastRunsBody) els.pastRunsBody.hidden = expanded;
    if (!expanded) renderPastRuns();
  });
}

if (els.rawJsonToggle) {
  els.rawJsonToggle.addEventListener("click", () => {
    const expanded = els.rawJsonToggle.getAttribute("aria-expanded") === "true";
    els.rawJsonToggle.setAttribute("aria-expanded", String(!expanded));
    if (els.rawJsonBody) els.rawJsonBody.hidden = expanded;
  });
}

if (els.deleteAllRuns) {
  els.deleteAllRuns.addEventListener("click", deleteAllRunsAction);
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
  // Raw JSON body visibility synced via sheetHeader toggle
  if (els.rawJsonBody) {
    els.rawJsonBody.hidden = els.rawJsonToggle?.getAttribute("aria-expanded") !== "true";
  }
}

// initial
showView("snap", "run");
syncCollapsedSections();
renderSevTabs();
updateResultsVisibility(false);
initVirtualTables();
initSortableHeaders();
// Session comparison
const _compareBtn = document.getElementById("compareRunBtn");
if (_compareBtn) _compareBtn.addEventListener("click", runSessionComparison);
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
