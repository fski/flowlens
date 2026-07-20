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
  wcagLevel: document.getElementById("wcagLevel"),
  targetingSummary: document.getElementById("targetingSummary"),

  exportAnchor: document.getElementById("exportAnchor"),
  exportToggle: document.getElementById("exportToggle"),
  exportMenu: document.getElementById("exportMenu"),
  copyJson: document.getElementById("copyJson"),
  downloadJson: document.getElementById("downloadJson"),
  downloadMd: document.getElementById("downloadMd"),
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

  // Flow view (rework)
  flowPlaceholder: document.getElementById("flowPlaceholder"),
  flowResults: document.getElementById("flowResults"),
  flowVerdictHeader: document.getElementById("flowVerdictHeader"),
  flowCaptureOverlay: document.getElementById("flowCaptureOverlay"),
  snapStatusLine: document.getElementById("snapStatusLine"),
  contrastTableWrap: document.getElementById("contrastTableWrap"),
  contrastShowSamples: document.getElementById("contrastShowSamples"),
  flowFilmstrip: document.getElementById("flowFilmstrip"),
  flowLifecycle: document.getElementById("flowLifecycle"),
  flowStepList: document.getElementById("flowStepList"),
  flowStepDetail: document.getElementById("flowStepDetail"),
  flowUnresolvedOnly: document.getElementById("flowUnresolvedOnly"),
  flowFilmstripCount: document.getElementById("flowFilmstripCount"),
  flowLifecycleCount: document.getElementById("flowLifecycleCount"),
  flowRecordVideo: document.getElementById("flowRecordVideo"),
  flowRecordVideoLabel: document.getElementById("flowRecordVideoLabel"),

  runCurrentMode: document.getElementById("runCurrentMode"),

  json: document.getElementById("json"),
  inspectedUrl: document.getElementById("inspectedUrl"),
  envBadge: document.getElementById("envBadge"),
  usedFrames: document.getElementById("usedFrames"),
  diff: document.getElementById("diff"),

  sevTabs: document.getElementById("sevTabs"),
  emptyState: document.getElementById("emptyState"),
  resultsZone: document.getElementById("resultsZone"),
  shadowCoverageRow: document.getElementById("shadowCoverageRow"),

  // explorer
  q: document.getElementById("q"),
  findingsCount: document.getElementById("findingsCount"),
  reviewFilterChip: document.getElementById("reviewFilterChip"),
  watchAnnouncements: document.getElementById("watchAnnouncements"),
  watchAnnList: document.getElementById("watchAnnList"),
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
  diagVersion: document.getElementById("diagVersion"),
  diagSchema: document.getElementById("diagSchema"),
  diagSignature: document.getElementById("diagSignature"),
  diagFrameKey: document.getElementById("diagFrameKey"),
  diagEnMapping: document.getElementById("diagEnMapping"),
  diagDataVersions: document.getElementById("diagDataVersions"),
  diagUrl: document.getElementById("diagUrl"),
  diagEnv: document.getElementById("diagEnv"),
  diagFrameScope: document.getElementById("diagFrameScope"),
  diagBestFrameId: document.getElementById("diagBestFrameId"),
  diagBestFrameKey: document.getElementById("diagBestFrameKey"),
  // These three were read by renderDiagnostics but missing from els → the rows
  // never populated (silent dead branches). Registered so they render.
  diagFrameGating: document.getElementById("diagFrameGating"),
  diagExcludedFrames: document.getElementById("diagExcludedFrames"),
  diagDepth3Engine: document.getElementById("diagDepth3Engine"),
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
// Severity → summaryScore weight. Feeds step summaryScore in signatures/CI
// diffing — changing a weight changes scores in exported reports.
const SEV_SCORE = { critical: 8, high: 5, medium: 3, low: 1, info: 0 };
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
  reviewFilter: false, // true = show only needs-review findings
  findingsByMode: {},
  contrastFilter: "all",
  contrastSamplesExpanded: false,
  hasRunMode: new Set(),
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

// \u2550\u2550\u2550 MODE REGISTRY \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
// Single source of truth for per-mode metadata. Anything keyed by audit mode
// (labels, colors, durations, progress/busy texts, CTA config) lives HERE \u2014
// the previous per-file lookup tables (MODE_LABELS, MODE_COLORS, DURATIONS,
// PROGRESS_LABELS, SNAP_CTA, SNAP_CTA_RERUN, inline busyLabels) drifted
// independently and adding a mode meant finding six of them.
const MODES = {
  run: {
    label: "Audit", color: "var(--orange)", duration: 2,
    progressLabel: "Scanning\u2026", busyLabel: "Running\u2026",
    cta: { label: "Run Audit", rerun: "Rerun Audit", cls: "ctaBtn--amber", helper: "Perform a strict WCAG Audit" },
  },
  contrast: {
    label: "Contrast", color: "#54B8A6", duration: 3,
    progressLabel: "Checking contrast\u2026", busyLabel: "Checking\u2026",
    cta: { label: "Check Contrast", rerun: "Recheck Contrast", cls: "ctaBtn--cyan", helper: "Check contrast on up to 250 text nodes" },
  },
  tabWalk: {
    label: "Tab\u00A0Walk", color: "#7BB85E", duration: 5,
    progressLabel: "Walking focusables\u2026", busyLabel: "Walking\u2026",
    cta: { label: "Run Tab\u00A0Walk", rerun: "Rerun Tab\u00A0Walk", cls: "ctaBtn--lime", helper: "Walk 80 focusable elements" },
  },
  observe: {
    label: "Observe", color: "#5AADDB", duration: 12,
    progressLabel: "Observing\u2026", busyLabel: "Observing\u2026",
    cta: { label: "Start Observe", rerun: "Restart Observe", cls: "ctaBtn--teal", helper: "Re-run WCAG check every ~1s for 12s" },
  },
  watch: {
    label: "Watch", color: "#8B8EDB", duration: 40,
    progressLabel: "Monitoring\u2026", busyLabel: "Watching\u2026",
    cta: { label: "Start Watch", rerun: "Restart Watch", cls: "ctaBtn--mint", helper: "Monitor loaders and focus bar for 40s" },
  },
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
  selectedStepIndex: null,
  autoCapturePending: null,
  lastAutoNavUrl: null,
  queuedCapture: null,
  foreignSkipNotified: false,
  foreignSkips: 0,
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
    label: "Chat Widget",
    description: "Embedded chat widget — embedded scope, balanced depth, observe mode",
    frameScope: "embedded",
    depthMax: 2,
    activeMode: "observe",
    profileAllowlist: ["chat"],
  },
  helpcenter: {
    label: "Help Center",
    description: "Help center + bot — embedded scope, full depth, observe mode",
    frameScope: "embedded",
    depthMax: 3,
    activeMode: "observe",
    profileAllowlist: ["helpcenter"],
  },
  hybrid: {
    label: "Hybrid",
    description: "Multi-frame portal — all frames, full depth, observe mode",
    frameScope: "all",
    depthMax: 3,
    activeMode: "observe",
    profileAllowlist: null,
  },
  wizard: {
    label: "Wizard / Form",
    description: "Step-based flow (wizard, checkout, onboarding) — host scope, balanced depth, run mode",
    frameScope: "host",
    depthMax: 2,
    activeMode: "run",
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
    f => f.ratio ?? 0, f => f.apcaLc ?? 0, f => f.required ?? 0, f => f.largeText ? 1 : 0,
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

