// ═══ CAPTURE / SESSION LIFECYCLE ═══════════════════════════════════════════
// startSession / endSession / captureStepOptionC — the session state machine.
// Highest-churn code of the 2026-07 rounds, isolated as its own part (R6) so
// the capture path reads in one pass. Concatenated by build; harness-loaded.

async function startSession() {
  if (sessionState.current) {
    toast("Session already active");
    return false;
  }
  const { url, origin, env, envTag } = getCurrentScopeInfo();
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
    env,
    envTag,
    settings: buildSessionSettings(),
    frames: { frameKeys: [], frameKeyToLastFrameId: {} },
    rawAppendix: {},
    steps: [],
  };
  sessionState.lastMarkStep = null;
  sessionState.nav = freshNavState();
  await persistActiveSessionBestEffort(sessionState.current);
  updateSessionButtons();
  setPersistentStatus("OK", "SESSION_STARTED", "Session active");
  toast("Session started");
  // Baseline step: capture the page you started on. Without it a click-driven
  // flow (modals, in-place wizards — no URL change) produced ZERO steps and
  // the whole recorder looked dead; nav flows also lacked their start state.
  if (els.autoCaptureNav?.checked) {
    sessionState.nav.lastAutoNavUrl = url;
    // Baseline counts as a top-level nav event: embedded frames committing
    // while the starting page settles belong to it, not to new steps.
    sessionState.nav.lastTopNavAt = Date.now();
    captureStepOptionC(null, { isAutoCapture: true }).catch(() => {});
  }
  return true;
}

async function endSession() {
  if (!sessionState.current) {
    toast("No active session");
    return false;
  }
  hideStepLabelInput();
  // Set endedAt BEFORE building the exportable snapshot — otherwise the
  // "last ended session" export claims in-progress with a growing duration.
  const previousEndedAt = sessionState.current.endedAt || null;
  sessionState.current.endedAt = nowIso();
  // Finalize any in-progress flow video before the session is archived, so the
  // webm is stored and session.hasVideo is set on the exported snapshot.
  if (flowRecorder.isRecording()) { try { await flowRecorder.stop(); } catch (_) {} }
  const exportableEndedSession = compactSessionForExport(normalizeLoadedSession(sessionState.current));
  const archived = await archiveSessionBestEffort(compactSessionForExport(sessionState.current));
  if (archived === "in-flight") {
    // A concurrent End (double-click / hotkey repeat) is already archiving this
    // session — let it finish; don't undo its endedAt or scare the user.
    return false;
  }
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
  sessionState.nav = freshNavState();
  sessionState.queuedCapture = null;
  // An in-flight capture will discard its own result (session-id guard); drop
  // the busy flag now so End takes effect immediately and the view is clean.
  sessionState.inFlight = false;
  sessionState.selectedStepIndex = null;
  updateSessionButtons();
  setPersistentStatus("OK", "SESSION_ENDED", "Session archived");
  // Refresh the Flow view to the ended state — the HUD ticker stops once
  // current is null, so without this the results area stays frozen on the
  // active session's last frame and End looks like it did nothing.
  renderSessionHud();
  populateCompareSelects();

  // Bound media disk: keep screenshots/video only for the most recent sessions.
  try {
    const archived = await listArchivedSessions();
    const keep = archived.slice(0, 5).map(s => s.id);
    if (sessionState.lastEndedSession?.id) keep.push(sessionState.lastEndedSession.id);
    if (typeof flowMediaStore !== "undefined") await flowMediaStore.pruneToSessions(keep);
  } catch (_) { /* prune is best-effort */ }

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

  // R6: Set inFlight immediately after the guard to minimise race window.
  sessionState.inFlight = true;
  sessionState.inFlightSince = Date.now(); // capture watchdog anchor
  // Capture epoch: the watchdog bumps it when it declares this capture dead.
  // A zombie capture whose stuck await later resolves must neither append a
  // step nor release state that now belongs to a NEWER capture.
  const _captureEpoch = sessionState.captureEpoch || 0;
  const _epochAlive = () => (sessionState.captureEpoch || 0) === _captureEpoch;
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

    // R1: Verify session wasn't ended/replaced during the await, and that
    // the watchdog didn't declare this capture dead in the meantime.
    if (!sessionState.current || sessionState.current.id !== _captureSessionId || !_epochAlive()) {
      console.warn("captureStepOptionC: session changed or capture invalidated during capture — discarding result");
      if (_epochAlive()) toast("Session was ended during capture");
      return false;
    }

    // Enrich findings (fix suggestions + EN 301 549 clauses) before snapshotting —
    // the same normalization the RUN_AUDIT path applies; without it flow-captured
    // findings kept en301549Clauses: null forever.
    if (r?.run?.bestEntry?.result?.findings) {
      r.run.bestEntry.result.findings = applyFixSuggestions(r.run.bestEntry.result.findings);
    }
    if (r?.active?.bestEntry?.result?.findings) {
      r.active.bestEntry.result.findings = applyFixSuggestions(r.active.bestEntry.result.findings);
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
    // R1 (second check): deriveStepRouteHint can await a DevTools eval
    // round-trip (title fallback), so End/Start can interleave here exactly
    // like during CAPTURE_STEP — without this, the step below would crash on
    // null or land in the wrong session.
    if (!sessionState.current || sessionState.current.id !== _captureSessionId || !_epochAlive()) {
      console.warn("captureStepOptionC: session changed or capture invalidated during route-hint derivation — discarding result");
      if (_epochAlive()) toast("Session was ended during capture");
      return false;
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
    // Stable signatures BEFORE buildStepDiffs so capture takes the same
    // (stable) diff branch as deleteStep's recompute — with the old order the
    // two paths diffed with different engines.
    const stableRun = computeStableSignatureSet(step.snapshots?.run, sessionState.current.rawAppendix || {});
    const stableActive = step.snapshots?.active
      ? computeStableSignatureSet(step.snapshots.active, sessionState.current.rawAppendix || {})
      : null;
    step.stableSignatures = {
      run: stableRun,
      active: stableActive,
    };
    // Signature → finding metadata for the per-step diff + lifecycle swimlane.
    step.findingIndex = buildFindingIndexForStep(step.snapshots, sessionState.current.rawAppendix || {});
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

    // Best-effort per-step screenshot — fire-and-forget, never blocks or fails
    // the step. The step audit is persisted BEFORE the shot resolves, so on
    // success re-persist so the hasShot marker survives a reload, then
    // re-render the filmstrip.
    const _shotSessionId = sessionState.current.id;
    // Embedded-scope (or all-subframe manual pin) sessions crop the shot to
    // the audited iframe — a full-page screenshot of a widget audit both
    // confuses and leaks the host page around it.
    const _allSubframes = usedFrameIds.length > 0 && usedFrameIds.every((id) => id !== 0);
    const _cropFrameUrl = (baseTargeting.scope === "embedded" || (baseTargeting.manual && _allSubframes))
      ? (r?.run?.bestEntry?.frameUrl || null)
      : null;
    captureStepShot(_shotSessionId, step, { url, cropFrameUrl: _cropFrameUrl }, capturedAt)
      .then((landed) => {
        if (landed && sessionState.current && sessionState.current.id === _shotSessionId) {
          persistActiveSessionBestEffort(compactSessionForExport(sessionState.current)).catch(() => {});
        }
        if (typeof renderFlow === "function" && state.topTab === "flow") renderFlow();
      })
      .catch(() => {});

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
    return true;
  } finally {
    if (!_epochAlive()) {
      // The watchdog invalidated this capture and a newer one may own
      // inFlight/timers/queue now — a zombie must not touch any of it.
      console.warn("captureStepOptionC: zombie capture finished after watchdog reset — state untouched");
    } else {
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
}
