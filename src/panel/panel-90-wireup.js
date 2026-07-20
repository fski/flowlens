// --- wire up ---

// Top-level tab clicks
document.querySelectorAll("#topTabBar [role='tab']").forEach(btn => {
  btn.addEventListener("click", () => showView(btn.dataset.tab));
});

// Roving tabindex for top tabs
attachRovingTabindex(document.getElementById("topTabBar"), (tab) => showView(tab.dataset.tab));

// Snap subtab clicks
document.querySelectorAll("#snapSubTabBar [role='tab']").forEach(btn => {
  btn.addEventListener("click", () => {
    showView("snap", btn.dataset.action);
  });
});

// Roving tabindex for snap subtabs
attachRovingTabindex(document.getElementById("snapSubTabBar"), (tab) => showView("snap", tab.dataset.action));


// Run button: execute currently selected mode
if (els.runCurrentMode) {
  els.runCurrentMode.addEventListener("click", () => _lockedPreset([state.activeMode || "run"]));
}

// Retry button in error empty state: re-trigger run
const emptyRetryBtn = document.getElementById("emptyRetry");
if (emptyRetryBtn) {
  emptyRetryBtn.addEventListener("click", () => _lockedPreset([state.activeMode || "run"]));
}

// Guided start (two-speed entry, FastPass/Assessment pattern):
// Quick = one-shot checks; Deep = timed monitors + baseline audit.
const guidedQuickBtn = document.getElementById("guidedQuick");
if (guidedQuickBtn) {
  guidedQuickBtn.addEventListener("click", () => _lockedPreset(["run", "contrast"]));
}
const guidedDeepBtn = document.getElementById("guidedDeep");
if (guidedDeepBtn) {
  guidedDeepBtn.addEventListener("click", () => _lockedPreset(["watch", "observe", "run"]));
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
    const { url, envTag } = getCurrentScopeInfo();
    const _best = currentBestEntry();
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
    const { url, env, envTag } = getCurrentScopeInfo();
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
        envTag,
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
    const { url, env, envTag } = getCurrentScopeInfo();
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
        envTag,
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

// Flow view interactions: select a step (filmstrip tile or step-list row),
// delete a step, step ‹/› nav, and the unresolved-blockers filter. Selection
// state lives in sessionState.selectedStepIndex; renderFlow() re-derives DOM.
function selectFlowStep(index) {
  if (!Number.isFinite(index)) return;
  sessionState.selectedStepIndex = index;
  renderFlow();
}
function stepIndicesForNav() {
  const sess = sessionState.current || sessionState.lastEndedSession;
  return (sess?.steps || []).map(s => s.index);
}
{
  const onSelectClick = (e) => {
    const del = e.target.closest(".stepDeleteBtn");
    if (del) { e.stopPropagation(); const si = Number(del.dataset.deleteStep); if (Number.isFinite(si)) deleteStep(si); return; }
    const tile = e.target.closest("[data-step-index]");
    if (tile) selectFlowStep(Number(tile.dataset.stepIndex));
  };
  const onSelectKey = (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const tile = e.target.closest("[data-step-index]");
    if (!tile) return;
    e.preventDefault();
    selectFlowStep(Number(tile.dataset.stepIndex));
  };
  if (els.flowFilmstrip) { els.flowFilmstrip.addEventListener("click", onSelectClick); els.flowFilmstrip.addEventListener("keydown", onSelectKey); }
  if (els.flowStepList) { els.flowStepList.addEventListener("click", onSelectClick); els.flowStepList.addEventListener("keydown", onSelectKey); }

  // Prev/Next nav + finding-group expanders in the detail pane.
  if (els.flowStepDetail) {
    els.flowStepDetail.addEventListener("click", (e) => {
      const grp = e.target.closest("[data-fgroup]");
      if (grp) {
        const body = els.flowStepDetail.querySelector('[data-fgroup-body="' + grp.dataset.fgroup + '"]');
        if (body) {
          body.hidden = !body.hidden;
          grp.setAttribute("aria-expanded", String(!body.hidden));
          const chev = grp.querySelector(".fGroupChevron");
          if (chev) chev.textContent = body.hidden ? "▸" : "▾";
        }
        return;
      }
      const nav = e.target.closest("[data-step-nav]");
      if (!nav) return;
      const order = stepIndicesForNav();
      const cur = sessionState.selectedStepIndex;
      const pos = order.indexOf(cur);
      if (pos === -1) return;
      const next = nav.dataset.stepNav === "prev" ? pos - 1 : pos + 1;
      if (next >= 0 && next < order.length) selectFlowStep(order[next]);
    });
  }

  // Filter: only steps with unresolved blockers.
  if (els.flowUnresolvedOnly) {
    els.flowUnresolvedOnly.addEventListener("change", () => renderFlow());
  }

  // Collapse toggles for the filmstrip + lifecycle sections (default collapsed,
  // progressive disclosure). Pure DOM show/hide — the body content is always
  // rendered by renderFlow, the toggle only reveals it.
  document.querySelectorAll(".flowCollapseToggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const body = document.getElementById(btn.getAttribute("aria-controls"));
      const open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!open));
      if (body) body.hidden = open;
      const chev = btn.querySelector(".chevron");
      if (chev) chev.textContent = open ? "▸" : "▾";
    });
  });

  // Download a stored flow recording from the verdict header.
  if (els.flowVerdictHeader) {
    els.flowVerdictHeader.addEventListener("click", (e) => {
      if (!e.target.closest("[data-flow-download-video]")) return;
      const sess = sessionState.current || sessionState.lastEndedSession;
      if (sess?.id) downloadFlowVideo(sess.id);
    });
  }

  // Record video: getDisplayMedia (user picks the tab) → webm in the media
  // store. Toggle button; label reflects recording state.
  if (els.flowRecordVideo) {
    els.flowRecordVideo.addEventListener("click", async () => {
      if (flowRecorder.isRecording()) {
        const r = await flowRecorder.stop();
        setRecordVideoUi(false);
        if (r?.ok && r.blob) {
          const sid = (sessionState.current || sessionState.lastEndedSession)?.id || "flow";
          downloadBlobFile(r.blob, `flowlens-flow-${sid}.webm`);
          // stop() set session.hasVideo in-memory (only when the store write
          // succeeded); persist so the stored-video download control survives
          // a panel reload before the session ends.
          if (r.saved && sessionState.current) {
            persistActiveSessionBestEffort(compactSessionForExport(sessionState.current)).catch(() => {});
          }
          toast(r.saved ? "Video saved & downloaded" : "Video downloaded — saving to browser storage failed");
        } else {
          toast("Recording stopped");
        }
        renderFlow();
        return;
      }
      const sess = sessionState.current || sessionState.lastEndedSession;
      if (!sess?.id) { toast("Start a flow first"); return; }
      const r = await flowRecorder.start(sess.id);
      if (r?.ok) { setRecordVideoUi(true); toast("Recording — pick the tab to capture"); }
      else if (r?.reason === "cancelled") { /* user dismissed picker, no-op */ }
      else if (r?.reason === "blocked") {
        console.warn("getDisplayMedia blocked by permissions policy", r);
        toast("Recording blocked in the DevTools panel (display-capture policy)");
      } else {
        console.warn("getDisplayMedia failed", r);
        toast("Screen recording unavailable" + (r?.errorName ? ` — ${r.errorName}` : ""));
      }
    });
  }
}
function setRecordVideoUi(recording) {
  if (els.flowRecordVideo) els.flowRecordVideo.classList.toggle("isRecording", !!recording);
  if (els.flowRecordVideoLabel) els.flowRecordVideoLabel.textContent = recording ? "Stop recording" : "Record video";
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
  const wcagRef = wcagUnderstandingRef(finding.wcag);
  const wcagCell = wcagRef
    ? `<a class="wcagLink" href="${escapeHtml(wcagRef.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(finding.wcag)} — ${escapeHtml(wcagRef.title)}</a>`
    : escapeHtml(finding.wcag ?? '');
  const reviewBadge = classifyReviewStatus(finding) === 'needs_review'
    ? ' <span class="badge needsReview" title="Heuristic finding — verify manually">needs review</span>'
    : '';
  const fields = [
    ['Severity', `<span class="pill ${escapeHtml(sev)}">${escapeHtml(sev)}</span>${reviewBadge}`],
    ['WCAG', wcagCell],
    ['Name', escapeHtml(finding.name ?? '')],
    ['Type', escapeHtml(finding.type ?? '')],
    ['Path', escapeHtml(finding.path ?? ''), true],
    ['Fix', escapeHtml(finding.fix ?? ''), true],
  ];
  const isCrossFrame = isCrossFrameFinding(finding);
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
        const isCrossFrame = isCrossFrameFinding(f);
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

if (els.wcagLevel) {
  els.wcagLevel.addEventListener("change", async () => {
    await updateUiPrefs({ wcagLevel: els.wcagLevel.value });
  });
}

if (els.depthMax) {
  els.depthMax.addEventListener("change", async () => {
    await updateUiPrefs({ depthMax: Number(els.depthMax.value) || 3 });
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
    applyRecipe(recipeId, { applyProfiles: true });
    await updateUiPrefs({ recipeId });
    renderDiagnostics();
  });
}

if (els.alsoConsole) {
  els.alsoConsole.addEventListener("change", async () => {
    await updateUiPrefs({ alsoConsole: !!els.alsoConsole.checked });
  });
}

if (els.contrastShowSamples) {
  els.contrastShowSamples.addEventListener("click", () => {
    state.contrastSamplesExpanded = !state.contrastSamplesExpanded;
    updateContrastView();
  });
}

if (els.autoCaptureNav) {
  els.autoCaptureNav.addEventListener("change", async () => {
    await updateUiPrefs({ autoCaptureNav: !!els.autoCaptureNav.checked });
  });
}
if (els.autoCaptureDelay) {
  els.autoCaptureDelay.addEventListener("change", async () => {
    await updateUiPrefs({ autoCaptureDelay: Number(els.autoCaptureDelay.value) || 500 });
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
  await updateUiPrefs({ junitCiOptions: getJunitCiOptionsFromUi() });
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
      flashInlineHint(els.copyDiagHint, ok ? "Copied!" : "Copy failed");
    }
  });
}
if (els.copyDiagnosticsMdBtn) {
  els.copyDiagnosticsMdBtn.addEventListener("click", async () => {
    const payload = buildDiagnosticsPayload(gatherDiagnosticsOpts());
    const md = buildDiagnosticsMarkdown(payload);
    const ok = await copyText(md);
    if (els.copyDiagHint) {
      flashInlineHint(els.copyDiagHint, ok ? "Copied!" : "Copy failed");
    }
  });
}
if (els.copyCiJson) {
  els.copyCiJson.addEventListener("click", async () => {
    const report = buildCIReportFromState();
    if (!report) {
      if (els.copyDiagHint) {
        flashInlineHint(els.copyDiagHint, "CI exporter not available");
      }
      return;
    }
    const ok = await copyText(pretty(report));
    if (els.copyDiagHint) {
      flashInlineHint(els.copyDiagHint, ok ? "Copied CI JSON!" : "Copy failed");
    }
  });
}

// Explorer reactive filters (debounced). Routed through rerenderFindings so
// the integrity-pill group filter stays applied — rendering straight from
// state.currentFindings silently dropped it.
let __explorerT = null;
function scheduleExplorerRender() {
  clearTimeout(__explorerT);
  __explorerT = setTimeout(() => {
    rerenderFindings("explorer_filter");
  }, 120);
}

els.q.addEventListener("input", scheduleExplorerRender);

// Needs-review filter chip (axe-style violations / needs-review split)
if (els.reviewFilterChip) {
  els.reviewFilterChip.addEventListener("click", () => {
    state.reviewFilter = !state.reviewFilter;
    els.reviewFilterChip.setAttribute("aria-pressed", String(state.reviewFilter));
    els.reviewFilterChip.classList.toggle("isActive", state.reviewFilter);
    scheduleExplorerRender();
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
  allTable: ['sev', 'wcag', 'name', 'type'],
  contrastTable: ['ratio', 'apca', 'req', 'large', 'text', 'tag', 'testId', 'path', 'note'],
  tabTable: ['i', 'type', 'tabIndex', 'name', 'path', 'note'],
};

// Column visibility is keyed by column NAME, not index. Index-keyed prefs
// silently shifted meaning whenever a column was added (the APCA column made
// every saved contrast toggle target the wrong column); name keys survive
// layout changes and old numeric prefs fail validation and are dropped.
const colVisibility = {};
const colStyleEl = document.createElement('style');
colStyleEl.id = 'colToggleStyles';
document.head.appendChild(colStyleEl);

function applyColStyles() {
  const rules = [];
  for (const [tableId, cols] of Object.entries(colVisibility)) {
    for (const [name, visible] of Object.entries(cols)) {
      if (visible !== false) continue;
      const idx = (TABLE_COLS[tableId] || []).indexOf(name);
      if (idx === -1) continue;
      const n = idx + 1;
      rules.push(`#${tableId} th:nth-child(${n}), #${tableId} td:nth-child(${n}) { width: 0 !important; max-width: 0 !important; padding: 0 !important; border: none !important; overflow: hidden; font-size: 0; line-height: 0; visibility: hidden; }`);
    }
  }
  colStyleEl.textContent = rules.join('\n');
}

function isColVisible(tableId, colName) {
  return colVisibility[tableId]?.[colName] !== false;
}

function toggleColVisibility(tableId, colName) {
  if (!colVisibility[tableId]) colVisibility[tableId] = {};
  colVisibility[tableId][colName] = !isColVisible(tableId, colName) ? true : false;
  if (colVisibility[tableId][colName] === true) delete colVisibility[tableId][colName];
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

  cols.forEach((name) => {
    const label = document.createElement('label');
    label.className = 'colOption';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = isColVisible(tableId, name);
    cb.addEventListener('change', () => {
      toggleColVisibility(tableId, name);
      cb.checked = isColVisible(tableId, name);
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
      // Prefs must reference current column NAMES — this also drops legacy
      // index-keyed prefs from before the name migration.
      const valid = Object.entries(colPrefs).every(([tableId, cols]) => {
        const expected = TABLE_COLS[tableId];
        return expected && Object.keys(cols).every(name => expected.includes(name));
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
      render: () => rerenderFindings("sort"),
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
      colCount: 9,
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

// auto refresh on navigation
// Debounced auto-capture shared by the two nav sources (full navigation via
// devtools.network.onNavigated, and SPA route change pushed over the nav port).
// classifyNavForCapture + lastAutoNavUrl dedupe so a single navigation that
// fires both sources only captures once.
// Ring buffer of auto-capture decisions — "record flow did nothing" is
// undebuggable without knowing which nav events arrived and why each was
// dropped. Inspect via window.__flowlensNavLog in the panel console.
function logNavDecision(url, decision) {
  const log = (window.__flowlensNavLog = window.__flowlensNavLog || []);
  log.push({ at: new Date().toISOString(), url: String(url || "").slice(0, 200), decision });
  if (log.length > 25) log.shift();
  console.debug("[FlowLens] nav", decision, url);
}

function maybeAutoCapture(url, { fromAuditedFrame = false } = {}) {
  if (!sessionState.current) { logNavDecision(url, "no-session"); return; }
  if (!els.autoCaptureNav?.checked) { logNavDecision(url, "auto-off"); return; }
  // Navs from frames already in the audited set (targeted microfrontends)
  // bypass the site guard — the embedded app IS the audit target, and its
  // site routinely differs from the host page's.
  if (!fromAuditedFrame && isForeignAutoCaptureOrigin(url, sessionState.current)) {
    logNavDecision(url, "skip-foreign-site");
    // Fail loud EVERY time on the persistent Flow line (a once-per-session
    // toast was missable, and a silently skipped step reads as covered).
    sessionState.foreignSkips = (sessionState.foreignSkips || 0) + 1;
    setPersistentStatus("PARTIAL", "AUTO_SKIPPED", `${sessionState.foreignSkips} nav(s) on other sites not captured (privacy)`);
    if (!sessionState.foreignSkipNotified) {
      sessionState.foreignSkipNotified = true;
      toast("Auto-capture skips other sites (privacy) — use Mark step to capture them");
    }
    return;
  }
  if (!classifyNavForCapture(url, sessionState.lastAutoNavUrl)) { logNavDecision(url, "skip-not-a-step"); return; }
  logNavDecision(url, "capture-scheduled");
  if (sessionState.autoCapturePending) clearTimeout(sessionState.autoCapturePending);
  const debounceMs = Number(els.autoCaptureDelay?.value) || 500;
  sessionState.autoCapturePending = setTimeout(async () => {
    sessionState.autoCapturePending = null;
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

chrome.devtools.network.onNavigated.addListener(async () => {
  state.findingsByMode = {};
  state.hasRunMode = new Set();
  state.contrastFilter = "all";
  await refreshInspectedUrl();
  await refreshFrames();
  toast("Navigated — refreshed frames");
  maybeAutoCapture(getCurrentScopeInfo().url);
});

// SPA route changes (History API) don't reliably fire devtools.network.onNavigated,
// so the SW watches webNavigation.onHistoryStateUpdated for this tab and pushes
// the new URL over a dedicated port. Refresh the inspected URL first so scope
// info reflects the new route, then run the same debounced capture.
// MV3 reaps the SW at will and every reap disconnects this port — without the
// onDisconnect reconnect below, SPA auto-capture silently died for the rest of
// the panel's life while full-nav capture kept working.
(function connectNavPort() {
  if (!hasRuntime() || typeof __runtime.connect !== "function") return;
  let attempt = 0;
  function schedule() {
    const delay = Math.min(30000, 1000 * Math.pow(2, attempt++));
    setTimeout(open, delay);
  }
  function open() {
    let port;
    try {
      port = __runtime.connect({ name: "flowlens-nav" });
      port.postMessage({ tabId });
    } catch (e) {
      console.warn("nav port connect failed", e);
      schedule();
      return;
    }
    port.onMessage.addListener(async (m) => {
      if (!m) return;
      if (m.type === "FRAME_NAV") {
        attempt = 0;
        if (!sessionState.current || !els.autoCaptureNav?.checked) return;
        if (!isRelevantFrameNav(m.url, m.frameId, sessionState.current)) {
          logNavDecision(m.url, "skip-frame-not-audited");
          return;
        }
        logNavDecision(m.url, "frame-nav");
        maybeAutoCapture(m.url, { fromAuditedFrame: true });
        return;
      }
      if (m.type !== "SPA_NAV") return;
      attempt = 0; // live traffic proves the connection — reset backoff
      if (!sessionState.current || !els.autoCaptureNav?.checked) return;
      await refreshInspectedUrl();
      maybeAutoCapture(getCurrentScopeInfo().url);
    });
    port.onDisconnect.addListener(() => { schedule(); });
  }
  open();
})();

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
    // Deferred highlight: content rendered while collapsed is plain text
    if (!expanded && els.json && els.json.dataset.hl === "0") {
      renderJsonInto(els.json, els.json.textContent || "");
      els.json.dataset.hl = "1";
    }
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
