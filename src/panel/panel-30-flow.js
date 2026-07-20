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
  const removedStep = steps[idx];
  steps.splice(idx, 1);
  const rawAppendix = sessionState.current.rawAppendix || {};
  for (let i = 0; i < steps.length; i++) {
    steps[i].index = i + 1;
    const prevStep = i > 0 ? steps[i - 1] : null;
    steps[i].diffs = buildStepDiffs(steps[i], prevStep, rawAppendix);
  }
  // Selection is positional (step.index): deleting an earlier step shifts every
  // later index down, so remap or the selection silently jumps to another step.
  const sel = sessionState.selectedStepIndex;
  if (sel != null) {
    if (sel === stepIndex) sessionState.selectedStepIndex = null;
    else if (sel > stepIndex) sessionState.selectedStepIndex = sel - 1;
  }
  // Best-effort: drop the deleted step's screenshot so it doesn't sit orphaned
  // in IndexedDB until the whole session is pruned.
  if (typeof flowMediaStore !== "undefined" && removedStep?.id) {
    flowMediaStore.deleteShot(sessionState.current.id, removedStep.id);
  }
  pruneSessionRawAppendix(sessionState.current);
  const compacted = compactSessionForExport(sessionState.current);
  const persisted = await persistActiveSessionBestEffort(compacted);
  renderSessionHud();
  if (persisted) toast(`Step deleted, ${steps.length} remaining`);
  else toast("Step deleted in memory — save failed, it may reappear after reload");
}

function updateSessionButtons() {
  const hasSession = !!sessionState.current;
  const hasExportableSession = !!(sessionState.current || sessionState.lastEndedSession);
  const hasArchivedSession = !sessionState.current && !!sessionState.lastEndedSession;
  const inFlight = !!sessionState.inFlight;
  const panelBusy = inFlight || state.running;
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
    // End must always be reachable while a session exists — NOT gated on
    // panelBusy. Otherwise a running/queued auto-capture keeps End disabled
    // and the flow feels impossible to finish. endSession() tolerates an
    // in-flight capture (the capture discards its result once the session is
    // gone via its session-id guard).
    els.sessionEnd.disabled = !hasSession;
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
  if (els.exportShotsMenu) {
    const sessShots = sessionState.current || sessionState.lastEndedSession;
    const hasShots = (sessShots?.steps || []).some(s => s?.hasShot);
    els.exportShotsMenu.hidden = !(hasExportableSession && hasShots);
  }
  // Reviewing an ended session: the hero Record CTA shrinks to a normal button.
  const flowRoot = typeof document !== "undefined" && document.getElementById ? document.getElementById("flowContent") : null;
  if (flowRoot && flowRoot.classList && flowRoot.classList.toggle) {
    flowRoot.classList.toggle("hasEnded", hasArchivedSession);
  }
  if (els.exportAnchor) els.exportAnchor.hidden = !((state.records.length > 0) || hasExportableSession);
  renderSessionHud();
}

// Storage keys derive from the SESSION's own scope, not the live inspected
// URL — mid-session cross-origin navigation (OAuth hop, hosted checkout) used
// to re-key the active session under the foreign origin, leaving a stale copy
// under the original key that got resurrected as a zombie "active" session.
function sessionScopeKeys(session, sessionId = null) {
  const scope = getCurrentScopeInfo();
  const origin = session?.inspectedOrigin || scope.origin || "";
  const env = session?.env || scope.env || "prod";
  return getSessionKeys(origin, env, sessionId);
}

async function persistActiveSessionBestEffort(session) {
  if (!session) return false;
  const keys = sessionScopeKeys(session);
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
    // Distinct sentinel: a concurrent End is already archiving this session —
    // callers must NOT treat this as a storage failure.
    return "in-flight";
  }
  _archiveInFlight.add(sessionId);
  try {
    const keys = sessionScopeKeys(session, session.id);
    const estimatedBytes = estimateJsonBytes(session);
    renderSaveStatus("saving");
    try {
      await storageSet({
        [keys.archive]: session,
        [sessionScopeKeys(session).active]: null
      });
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

async function listArchivedSessions() {
  if (!__storageLocal) return [];
  try {
    const all = await __storageLocal.get(null);
    const prefix = "session::archive::";
    const sessions = [];
    for (const [key, val] of Object.entries(all || {})) {
      if (key.startsWith(prefix) && val && typeof val === "object" && val.id) {
        sessions.push(val);
      }
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
          <tr><td>Blocking added</td><td>${a.blockingAdded}</td><td>${b.blockingAdded}</td><td>${delta(b.blockingAdded, a.blockingAdded)}</td></tr>
          <tr><td>Net blocking</td><td>${a.blocking}</td><td>${b.blocking}</td><td>${delta(b.blocking, a.blocking)}</td></tr>
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
  if (mode === "tabWalk") {
    out.events = capRows(out.events, 200);
    out.stops = capRows(out.stops, 200);
  }
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

/** Shared boilerplate: resolve raw, extract array, map items. */
function _sigEntries(snapshot, rawAppendix, arrayKey, mapFn) {
  const fk = snapshot?.best?.frameKey || UNKNOWN_FRAME_KEY;
  const items = (resolveSnapshotRaw(snapshot, rawAppendix) || {})[arrayKey];
  if (!Array.isArray(items)) return [];
  return items.map(item => mapFn(item, fk));
}

/** Signature entries for findings-based modes (run + observe). */
function findingSignatureEntries(prefix, snapshot, rawAppendix = null) {
  const isRun = prefix === "run";
  const fk = snapshot?.best?.frameKey || UNKNOWN_FRAME_KEY;
  const raw = resolveSnapshotRaw(snapshot, rawAppendix) || {};
  const findings = Array.isArray(raw.findings) ? raw.findings : [];
  const entries = [];
  for (const f of findings) {
    const testIdNorm = normalizeIdentityText(f?.testId, 60);
    const typeNorm = normalizeIdentityText(f?.type, 40);
    const wcagNorm = normalizeIdentityText(f?.wcag, 24);
    const severityNorm = normalizeIdentityText(f?.severity, 10);
    const noteNorm = normalizeIdentityText(f?.note, 80);
    const pathHash = pathHashForSig(f?.path);
    const weakPath = pathLooksWeak(f?.path);
    const signatureQuality = computeSignatureQuality(f);
    const roleNorm = isRun ? normalizeIdentityText(f?.role, 20) : null;
    const nameNorm = isRun ? normalizeIdentityText(f?.name, 80) : null;
    let weakSig = null;
    if (signatureQuality === "low") {
      const wp = [`${prefix}:weak`, fk, typeNorm || "type:none", wcagNorm || "wcag:none", severityNorm || "sev:none"];
      if (isRun) wp.push(roleNorm || "role:none", nameNorm || "name:none");
      wp.push(noteNorm || "note:none");
      weakSig = wp.join("|");
    }
    const sp = [prefix, fk, typeNorm, wcagNorm];
    if (isRun) sp.push(normalizeIdentityText(f?.level, 12), normalizeIdentityText(f?.confidence, 16), severityNorm, normalizeIdentityText(f?.product, 30));
    else sp.push(severityNorm);
    sp.push(`testid:${testIdNorm || "none"}`);
    if (isRun) sp.push(`role:${roleNorm || "none"}`);
    sp.push(`pathh:${pathHash}`);
    if (isRun) sp.push(nameNorm);
    sp.push(noteNorm);
    entries.push({
      sig: sp.join("|"), weakSig, signatureQuality,
      blocking: isRunFindingBlocking(f),
      wcag: f?.wcag || null,
      confidence: normalizeFindingConfidence(f?.confidence),
      level: f?.level || null,
      severity: normalizeWs(f?.severity, 12) || null,
      label: f?.type || `${prefix}_finding`,
    });
  }
  if (!isRun) {
    const snapshots = Array.isArray(raw.snapshots) ? raw.snapshots : [];
    const peak = snapshots.reduce((m, s) => Math.max(m, asNumber(s?.count, 0)), 0);
    let jumps = 0;
    for (let i = 1; i < snapshots.length; i++) {
      if (asNumber(snapshots[i]?.count, 0) > asNumber(snapshots[i - 1]?.count, 0)) jumps += 1;
    }
    entries.push({
      sig: ["observe", fk, "trend", `peak:${bucketNumber(peak, 5)}`, `jumps:${bucketNumber(jumps, 1)}`].join("|"),
      weakSig: null, signatureQuality: "high", blocking: false,
      wcag: null, confidence: "advisory", level: null, severity: "info", label: "trend",
    });
  }
  return entries;
}

/** Thin wrapper — also called directly for step-diff logic. */
function runSignatureEntries(snapshot, rawAppendix = null) {
  return findingSignatureEntries("run", snapshot, rawAppendix);
}

function contrastSignatureEntries(snapshot, rawAppendix = null) {
  return _sigEntries(snapshot, rawAppendix, "failures", (f, fk) => {
    const testIdNorm = normalizeIdentityText(f?.testId, 60);
    return {
      sig: ["contrast", fk, normalizeIdentityText(f?.wcag || "1.4.3", 24),
        `ratio:${bucketNumber(asNumber(f?.ratio, 0) * 10, 2)}`,
        `required:${bucketNumber(asNumber(f?.required, 0) * 10, 2)}`,
        normalizeIdentityText(f?.tag, 16), `testid:${testIdNorm || "none"}`,
        `pathh:${pathHashForSig(f?.path)}`, normalizeIdentityText(f?.text, 60)].join("|"),
      weakSig: null, signatureQuality: testIdNorm ? "high" : "medium",
      blocking: true, wcag: f?.wcag || "1.4.3", confidence: f?.confidence || "heuristic",
      level: null, severity: "high", label: "contrast_failure",
    };
  });
}

function tabWalkSignatureEntries(snapshot, rawAppendix = null) {
  return _sigEntries(snapshot, rawAppendix, "events", (e, fk) => {
    const type = normalizeWs(e?.type, 40);
    return {
      sig: ["tabwalk", fk, normalizeIdentityText(e?.type, 40), `pathh:${pathHashForSig(e?.path)}`,
        normalizeIdentityText(e?.name, 80), normalizeIdentityText(e?.note, 80),
        `tabi:${bucketNumber(asNumber(e?.tabIndex, 0), 1)}`].join("|"),
      weakSig: null, signatureQuality: pathLooksWeak(e?.path) ? "low" : "medium",
      blocking: TAB_BLOCKING_TYPES.has(type), wcag: null, confidence: "heuristic",
      level: null, severity: TAB_BLOCKING_TYPES.has(type) ? "medium" : "info",
      label: e?.type || "tabwalk_event",
    };
  });
}

function watchSignatureEntries(snapshot, rawAppendix = null) {
  const fk = snapshot?.best?.frameKey || UNKNOWN_FRAME_KEY;
  const raw = resolveSnapshotRaw(snapshot, rawAppendix) || {};
  const out = (Array.isArray(raw.verdicts) ? raw.verdicts : []).map(v => ({
    sig: ["watch", fk, normalizeWs(v?.metric, 32), `b:${bucketNumber(v?.budget, 1)}`, `v:${bucketNumber(v?.value, 1)}`].join("|"),
    weakSig: null, signatureQuality: "high", blocking: true, wcag: null,
    confidence: "heuristic", level: null, severity: "medium", label: v?.metric || "watch_verdict",
  }));
  const focusLossCount = asNumber(raw?.focusLossCount, 0);
  if (focusLossCount > 0) {
    out.push({
      sig: ["watch", fk, "focus_loss", `v:${bucketNumber(focusLossCount, 1)}`].join("|"),
      weakSig: null, signatureQuality: "high", blocking: true, wcag: null,
      confidence: "heuristic", level: null, severity: "high", label: "focus_loss",
    });
  }
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
  else if (snapshot.mode === "observe") entries = findingSignatureEntries("observe", snapshot, rawAppendix);

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

// Cross-step rollup: for every blocking signature, in how many steps it appears
// (occurrences increments once per step — bundle.blockingSet is a Set).
// Pure + deterministic; consumed by the session Markdown export and the Flow
// verdict's "systemic issues" line (IBM Equal Access multi-scan pattern).
function computeFlowBlockingRollup(steps, rawAppendix) {
  const flowMap = new Map();
  for (const step of (Array.isArray(steps) ? steps : [])) {
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
  return [...flowMap.values()].sort((a, b) =>
    (b.blockingWeight - a.blockingWeight)
    || (qualityWeight(b.signatureQuality) - qualityWeight(a.signatureQuality))
    || (b.occurrences - a.occurrences)
    || (a.firstSeenStep - b.firstSeenStep)
    || a.sig.localeCompare(b.sig)
  );
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
  // Prefer stable diff when both steps have stableSignatures (v4+).
  const hasStable = step?.stableSignatures?.run && prevStep?.stableSignatures?.run;
  if (hasStable) {
    const stableRunDiff = computeStableDiff(
      prevStep.stableSignatures.run.stableFindingSignatureSet,
      step.stableSignatures.run.stableFindingSignatureSet
    );
    // Also compute blocking counts from stable blockingSets
    const prevBlocking = new Set(prevStep.stableSignatures.run.blockingSet || []);
    const currBlocking = new Set(step.stableSignatures.run.blockingSet || []);
    const currSigs = new Set(step.stableSignatures.run.stableFindingSignatureSet || []);
    const prevSigs = new Set(prevStep.stableSignatures.run.stableFindingSignatureSet || []);
    let blockingAdded = 0, blockingFixed = 0;
    for (const sig of currBlocking) if (!prevSigs.has(sig)) blockingAdded++;
    for (const sig of prevBlocking) if (!currSigs.has(sig)) blockingFixed++;
    stableRunDiff.blockingAdded = blockingAdded;
    stableRunDiff.blockingFixed = blockingFixed;

    const runCounts = step.stableSignatures.run.severityCounts || {};
    const prevRunCounts = prevStep.stableSignatures.run.severityCounts || {};
    const countsDelta = computeCountsDelta(runCounts, prevRunCounts);
    stableRunDiff.countsDelta = countsDelta;
    stableRunDiff.text = summarizeDiff(stableRunDiff);

    // Active diff (if both have stable active)
    let activeDiff;
    if (step?.stableSignatures?.active && prevStep?.stableSignatures?.active) {
      activeDiff = computeStableDiff(
        prevStep.stableSignatures.active.stableFindingSignatureSet,
        step.stableSignatures.active.stableFindingSignatureSet
      );
      const activeCounts = step.stableSignatures.active.severityCounts || {};
      const prevActiveCounts = prevStep.stableSignatures.active.severityCounts || {};
      activeDiff.countsDelta = computeCountsDelta(activeCounts, prevActiveCounts);
      activeDiff.text = summarizeDiff(activeDiff);
    }

    // Consolidated = run + active combined
    const allCurrSigs = [
      ...(step.stableSignatures.run?.stableFindingSignatureSet || []),
      ...(step.stableSignatures.active?.stableFindingSignatureSet || []),
    ];
    const allPrevSigs = [
      ...(prevStep.stableSignatures.run?.stableFindingSignatureSet || []),
      ...(prevStep.stableSignatures.active?.stableFindingSignatureSet || []),
    ];
    const consolidated = computeStableDiff(allPrevSigs, allCurrSigs);
    // Recompute blocking deltas from merged blocking sets
    const allCurrBlocking = new Set([
      ...(step.stableSignatures.run?.blockingSet || []),
      ...(step.stableSignatures.active?.blockingSet || []),
    ]);
    const allPrevBlocking = new Set([
      ...(prevStep.stableSignatures.run?.blockingSet || []),
      ...(prevStep.stableSignatures.active?.blockingSet || []),
    ]);
    consolidated.blockingAdded = [...allCurrBlocking].filter(s => !allPrevBlocking.has(s)).length;
    consolidated.blockingFixed = [...allPrevBlocking].filter(s => !allCurrBlocking.has(s)).length;
    // Consolidated delta merges run+active counts — run-only here under-reported
    // active-mode severity shifts in the summary line.
    const mergedCurrCounts = sumSeverityCounts(step.stableSignatures.run?.severityCounts, step.stableSignatures.active?.severityCounts);
    const mergedPrevCounts = sumSeverityCounts(prevStep.stableSignatures.run?.severityCounts, prevStep.stableSignatures.active?.severityCounts);
    consolidated.countsDelta = computeCountsDelta(mergedCurrCounts, mergedPrevCounts);
    consolidated.text = summarizeDiff(consolidated);

    return {
      run: step?.snapshots?.run ? stableRunDiff : undefined,
      active: activeDiff,
      consolidated,
    };
  }

  // Legacy fallback (v3 sessions without stableSignatures)
  const runNext = buildModeSignatureBundle(step?.snapshots?.run, rawAppendix);
  const runPrev = buildModeSignatureBundle(prevStep?.snapshots?.run, rawAppendix);
  const activeNext = buildModeSignatureBundle(step?.snapshots?.active, rawAppendix);
  const activePrev = (prevStep?.snapshots?.active?.mode && prevStep?.snapshots?.active?.mode === step?.snapshots?.active?.mode)
    ? buildModeSignatureBundle(prevStep?.snapshots?.active, rawAppendix)
    : { set: new Set(), blockingSet: new Set(), metaBySig: new Map(), counts: {} };
  const consolidatedNext = mergeSignatureBundles([runNext, activeNext]);
  const consolidatedPrev = mergeSignatureBundles([runPrev, activePrev]);
  const result = {
    run: step?.snapshots?.run ? diffModeBundles(runPrev, runNext) : undefined,
    active: step?.snapshots?.active ? diffModeBundles(activePrev, activeNext) : undefined,
    consolidated: diffModeBundles(consolidatedPrev, consolidatedNext),
  };
  // First step = baseline, not regression: with no predecessor every blocking
  // finding diffed as "added", so a one-step flow could never PASS. The verdict
  // sums consolidated.blockingAdded, so zero the blocking deltas here (the
  // producer), not in the view.
  if (!prevStep) {
    for (const d of [result.run, result.active, result.consolidated]) {
      if (!d) continue;
      d.blockingAdded = 0;
      d.blockingFixed = 0;
      d.text = summarizeDiff(d);
    }
  }
  return result;
}

// Element-wise sum of two severityCounts maps (missing keys = 0).
function sumSeverityCounts(a = {}, b = {}) {
  const out = {};
  for (const src of [a || {}, b || {}]) {
    for (const [k, v] of Object.entries(src)) out[k] = (out[k] || 0) + asNumber(v, 0);
  }
  return out;
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
  if (s === "critical") return 4;
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

