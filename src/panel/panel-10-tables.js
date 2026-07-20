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

      // One variable-height row (the expanded detail) lives inside uniform
      // virtualization: fold its cached height into the scroll offset and the
      // spacer that covers it, or total scroll height jumps whenever the
      // expansion leaves the rendered window.
      const dh = (this.expandedIdx != null && this.detailRenderer) ? (this.detailHeight || 0) : 0;
      let stAdj = st;
      if (dh) {
        const detailTop = (this.expandedIdx + 1) * rh;
        if (st > detailTop) stAdj = Math.max(detailTop, st - dh);
      }
      const start0 = Math.floor(stAdj / rh);
      const vis = Math.ceil(vh / rh) + 1;

      const start = Math.max(0, start0 - this.overscan);
      const end = Math.min(n, start0 + vis + this.overscan);

      let topPad = start * rh;
      let botPad = Math.max(0, (n - end) * rh);
      if (dh) {
        if (this.expandedIdx < start) topPad += dh;
        else if (this.expandedIdx >= end) botPad += dh;
      }

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
      // Cache the expanded detail row's height for the spacer math above
      const detailEl = this.tbodyEl.querySelector("tr.detailRow");
      if (detailEl) {
        const h = detailEl.getBoundingClientRect().height;
        if (h && Math.abs(h - (this.detailHeight || 0)) > 1) this.detailHeight = h;
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

// Serialized read-modify-write for the shared uiPrefs key. Five settings
// handlers used to each do storageGet→mutate→storageSet independently; two
// firing close together read the same stale object and the later write
// silently dropped the earlier field. All writers go through this queue.
let _uiPrefsWriteChain = Promise.resolve();
function updateUiPrefs(patch) {
  _uiPrefsWriteChain = _uiPrefsWriteChain
    .then(async () => {
      const { uiPrefs = {} } = await storageGet(["uiPrefs"]);
      await storageSet({ uiPrefs: { ...uiPrefs, ...patch } });
    })
    .catch((e) => { console.error("updateUiPrefs failed:", e); });
  return _uiPrefsWriteChain;
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

// --- JSON syntax highlighting (Raw JSON sheets) ---
// Escapes HTML first, then wraps tokens in spans. The textContent of the
// produced markup is byte-identical to the input, so copy actions can keep
// reading textContent. Pure + deterministic (no state, no time).
var JSON_HIGHLIGHT_MAX_CHARS = 300000;
var JSON_TOKEN_RE = /("(?:\\u[0-9a-fA-F]{4}|\\[^u]|[^\\"])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

function highlightJson(text) {
  var escaped = String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return escaped.replace(JSON_TOKEN_RE, function (match, str, colon) {
    var cls;
    if (str) {
      cls = colon ? "jt-key" : "jt-str";
      return '<span class="' + cls + '">' + str + "</span>" + (colon || "");
    }
    if (match === "true" || match === "false") cls = "jt-bool";
    else if (match === "null") cls = "jt-null";
    else cls = "jt-num";
    return '<span class="' + cls + '">' + match + "</span>";
  });
}

// Resolves a WCAG criterion number ("4.1.2") to its W3C Understanding page.
// Returns { url, title } or null. Link is only followed on explicit user
// click — FlowLens itself still makes zero network requests.
function wcagUnderstandingRef(criterion) {
  if (!criterion || typeof WCAG_CRITERIA === "undefined") return null;
  var entry = WCAG_CRITERIA.find(function (c) { return c.criterion === criterion; });
  if (!entry || !entry.title) return null;
  var slug = entry.title.toLowerCase()
    .replace(/[()]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return { url: "https://www.w3.org/WAI/WCAG22/Understanding/" + slug, title: entry.title };
}

// Renders JSON text into a <pre>, highlighted when small enough to stay
// responsive; oversized payloads fall back to plain text.
function renderJsonInto(el, text) {
  if (!el) return;
  if (typeof text !== "string") text = pretty(text);
  if (text.length > JSON_HIGHLIGHT_MAX_CHARS) {
    el.textContent = text;
    return;
  }
  el.innerHTML = highlightJson(text);
}

// Lazy variant for the Raw JSON sheet: while the sheet is collapsed only cheap
// textContent is written (highlighting a hidden 300k-char payload on every run
// is wasted work); the expand handler upgrades from the same textContent.
// Copy actions read textContent either way.
function renderRawJson(el, bodyEl, text) {
  if (!el) return;
  if (typeof text !== "string") text = pretty(text);
  if (bodyEl && bodyEl.hidden) {
    el.textContent = text;
    el.dataset.hl = "0";
    return;
  }
  renderJsonInto(el, text);
  el.dataset.hl = "1";
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
  const prefix = MODES[action]?.progressLabel || "Running";
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
  showProgress(action, MODES[action]?.duration || 2);
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
      els.runLabel.textContent = MODES[state.activeMode]?.busyLabel || "Running\u2026";
    }
  } else {
    // Fully restore CTA appearance after run completes
    applySnapCta(state.activeMode);
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
  // Match against the HOSTNAME only — a prod path like /latest or /developers
  // must not flip the env (records/sessions are bucketed by origin+env, so a
  // full-URL match scattered history across buckets as the user navigated).
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { host = (url || "").toLowerCase(); }
  if (/(^|\.)(localhost)$|^127\.0\.0\.1$/.test(host)) return "local";
  if (/(^|[.-])(staging|stage|preprod|preview|dev|test|qa)([.-]|$)/.test(host)) return "staging";
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
  return MODES[mode]?.label || String(mode || "run");
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

/**
 * Apply the idle CTA appearance for a mode from the MODES registry.
 * Shared by updateSnapCta (mode switches) and setRunButtonBusy(false)
 * (run completion) \u2014 these were two hand-maintained copies before.
 */
function applySnapCta(mode) {
  const cta = (MODES[mode] || MODES.run).cta;
  let label = cta.label;
  if (state.hasRunMode.has(mode)) label = cta.rerun || label;
  if (els.runLabel) els.runLabel.textContent = label;
  if (els.runCurrentMode) {
    els.runCurrentMode.className = "ctaBtn " + cta.cls;
  }
  if (els.snapHelper) els.snapHelper.textContent = cta.helper;
  if (els.runIcon) els.runIcon.src = state.hasRunMode.has(mode) ? "icons/Rerun Icon.svg" : "icons/Run Icon.svg";
}

function updateSnapCta(mode) {
  if (state.running) return;
  applySnapCta(mode);
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

  // Recompute the revealed section through the central section-view pipeline
  // on every switch. Sections are revealed here without going through
  // renderRecord, so without this the default-visible empty <div> (and a
  // stale virtual-table render from when the section was hidden) leak into
  // view.
  if (runLike && state.findingsByMode[mode]) {
    state.currentFindings = applyAllFindingFilters(state.findingsByMode[mode]);
    rerenderFindings("mode_switch");
  } else if (runLike) {
    renderSevTabs();
  }
  if (mode === "contrast") {
    renderContrastSevTabs();
    updateContrastView();
  }
  if (mode === "tabWalk") {
    renderTabWalk({ events: state.tabData });
  }
}

