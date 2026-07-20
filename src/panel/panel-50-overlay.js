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
  const _secs = session.engineCoverage || engineCoverageSummary();
  lines.push(`Coverage (engine): ${_secs.coveredCount}/${_secs.totalCount} WCAG ${_secs.target.version} ${_secs.target.level} criteria`);
  lines.push("");

  const topBlocking = computeFlowBlockingRollup(steps, rawAppendix).slice(0, 24);
  lines.push("Flow summary (blocking signatures):");
  if (!topBlocking.length) {
    lines.push("- none");
  } else {
    lines.push("| Blocking | Occurrences | First | Last | Quality | Label | WCAG | Level | Confidence | Signature |");
    lines.push("| --- | ---: | ---: | ---: | --- | --- | --- | --- | --- | --- |");
    for (const x of topBlocking) {
      const quality = x.signatureQuality || "medium";
      const qualityLabel = quality === "low" ? "low (may be unstable)" : quality;
      lines.push(`| ${x.blockingWeight} | ${x.occurrences} | ${x.firstSeenStep} | ${x.lastSeenStep} | ${qualityLabel} | ${mdCell(txt(x.label || "issue", 26))} | ${mdCell(x.wcag || "—")} | ${mdCell(x.level || "—")} | ${mdCell(x.confidence || "—")} | \`${mdCell(txt(x.sig, 90))}\` |`);
    }
  }
  lines.push("");

  const _covWarnings = computeSessionShadowWarnings(steps);
  if (_covWarnings.length) {
    lines.push("\u26A0 Shadow DOM coverage changed between snapshots. Diffs may be incomplete.");
    for (const cw of _covWarnings) {
      const f = cw.warning.from || {};
      const t = cw.warning.to || {};
      lines.push(`- Step ${cw.fromStepIndex} \u2192 Step ${cw.toStepIndex}: audited ${Number(f.scopesAudited) || 0} \u2192 ${Number(t.scopesAudited) || 0}, capped ${!!f.scopesCapped} \u2192 ${!!t.scopesCapped}, depthLimit ${!!f.depthLimitReached} \u2192 ${!!t.depthLimitReached}`);
    }
    lines.push("");
  }

  lines.push("Per-step:");
  for (const step of steps) {
    const routeHint = txt(step?.routeHint || "(unknown)", 120);
    lines.push(`### Step ${step.index} — ${routeHint}`);
    if (step.label) lines.push(`- Label: ${txt(step.label, 120)}`);
    lines.push(`- At: ${step.at || "—"}`);
    lines.push(`- URL: ${shortUrlForMarkdown(step.url || "—")} (\`${txt(step.url || "—", 180)}\`)`);
    lines.push(`- Modes: ${modeLabel("run")}${step.snapshots?.active ? ` + ${modeLabel(step.snapshots.active.mode)}` : ""}`);
    const _stepCov = formatShadowCoverageLine(step?.snapshots?.run?.best?.shadowCoverage);
    if (_stepCov) {
      const _isCappedOrLimited = step?.snapshots?.run?.best?.shadowCoverage?.scopesCapped || step?.snapshots?.run?.best?.shadowCoverage?.depthLimitReached;
      lines.push(`- ${_stepCov}`);
      if (_isCappedOrLimited) lines.push(`- Coverage limited; diffs may be incomplete.`);
    }
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

function buildMarkdown({ inspectedUrl, best, perFrame, usedFrameIds, envTag, shadowCoverage }) {
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
  const _covLine = formatShadowCoverageLine(shadowCoverage || r?.shadowCoverage || null);
  if (_covLine) lines.push(_covLine);
  const _ecs = engineCoverageSummary();
  lines.push(`Coverage (engine): ${_ecs.coveredCount}/${_ecs.totalCount} WCAG ${_ecs.target.version} ${_ecs.target.level} criteria`);
  const _ocs = runCoverageObserved(findings);
  lines.push(`Coverage (observed): ${_ocs.coveredCount}/${_ocs.totalCount}`);
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

/** Shared row renderers — used by both VirtualTable and fallback paths. */
function explorerRowHtml(f, idx) {
  const sev = f.severity || 'info';
  const isCrossFrame = !f.el && (typeof RULE_TO_WCAG !== "undefined") && RULE_TO_WCAG[f.type]?.group === "depth3/multiframe";
  const crossBadge = isCrossFrame ? ' <span class="badge crossFrame">Cross-frame</span>' : '';
  return `<tr class="trow" data-i="${idx}" data-sev="${escapeHtml(sev)}"${isCrossFrame ? ' data-crossframe="1"' : ''}><td><span class="pill ${escapeHtml(sev)}">${escapeHtml(sev)}</span></td><td>${escapeHtml(f.wcag ?? "")}</td><td>${cellHtml(f.name, 50)}${crossBadge}</td><td>${cellHtml(f.type ?? "", 30)}</td></tr>`;
}
function contrastRowHtml(f, idx) {
  const pass = f.ratio >= f.required;
  return `<tr class="trow${pass ? ' contrastPass' : ''}" data-i="${idx}"><td>${escapeHtml(String(f.ratio ?? ""))}</td><td>${escapeHtml(String(f.apcaLc ?? "\u2013"))}</td><td>${escapeHtml(String(f.required ?? ""))}</td><td>${f.largeText ? "yes" : "no"}</td><td>${cellHtml(f.text, 50)}</td><td>${escapeHtml(f.tag ?? "")}</td><td>${escapeHtml(f.testId ?? "")}</td><td>${cellHtml(f.path, 60)}</td><td>${cellHtml(f.note, 50)}</td></tr>`;
}
function tabRowHtml(e, idx) {
  return `<tr class="trow${e._issue ? ' tabIssue' : ''}" data-i="${idx}"><td>${escapeHtml(String(e.i ?? ""))}</td><td>${escapeHtml(String(e.type ?? ""))}</td><td>${escapeHtml(String(e.tabIndex ?? ""))}</td><td>${cellHtml(e.name, 50)}</td><td>${cellHtml(e.path, 60)}</td><td>${cellHtml(e.note, 50)}</td></tr>`;
}

function txt(s, n = 140) {
  return (s || "").replace(/\s+/g, " ").trim().slice(0, n);
}

// GFM table cell escape: unescaped '|' splits columns even inside code spans.
// Stable signatures are pipe-joined, so every cell they land in must escape.
function mdCell(s) {
  return String(s ?? "").replace(/\|/g, "\\|");
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


function applyExplorerFilters(findings) {
  const q = (els.q.value || "").trim().toLowerCase();
  const sevSet = state.sevFilter;

  let list = Array.isArray(findings) ? findings : [];
  if (sevSet.size > 0) list = list.filter(f => sevSet.has(f.severity));
  if (state.reviewFilter) list = list.filter(f => classifyReviewStatus(f) === "needs_review");

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

// ═══ SECTION VIEW CORE ═══════════════════════════════════════════════════
// Single choke point for the three results tables (explorer / contrast /
// tab walk). Every render computes the visible rows AND the empty-state
// message from the SAME data in the same synchronous pass, then applies both
// in one place. Nothing else may call VT.setData or touch a section's empty
// <div> — letting the two diverge is exactly the bug class this kills
// ("Run a check to see results" sitting on top of a populated table, or
// "No results match your search" after a plain run).

/**
 * Pure empty-state decision for a results section.
 * @param {"explorer"|"contrast"|"tabWalk"} section
 * @param {{ran:boolean,total:number,shown:number,filters:string[],contrastFilter?:string}} ctx
 *   ran     — this mode has produced a result in this session (or a restored record)
 *   total   — rows before any user filter
 *   shown   — rows actually rendered
 *   filters — human-readable names of filters that are cutting rows
 * @returns {string|null} message to show, or null when rows are visible
 */
function sectionEmptyText(section, ctx) {
  const filters = ctx.filters || [];
  if (!ctx.ran) {
    if (section === "contrast") return "Run a Contrast check to see results";
    if (section === "tabWalk") return "Run a Tab Walk to see results";
    return "Run an Audit to see results";
  }
  if (ctx.total === 0) {
    if (section === "contrast") return "Check finished — no measurable text found";
    if (section === "tabWalk") return "No focusable elements were walked";
    return "No issues found — this scan came back clean";
  }
  if (ctx.shown === 0) {
    if (section === "contrast" && !filters.length) {
      if (ctx.contrastFilter === "fail") return "No failures — all sampled text passes";
      if (ctx.contrastFilter === "pass") return "No passing samples in this check";
    }
    const label = filters.length ? filters.join(" + ") : "active filters";
    return `All ${ctx.total} rows hidden by ${label}`;
  }
  return null;
}

const SECTION_VIEWS = {
  explorer: { vt: "all", tbody: () => els.allTableBody, empty: () => els.explorerEmpty, rowHtml: (f, i) => explorerRowHtml(f, i) },
  contrast: { vt: "contrast", tbody: () => els.contrastTbody, empty: () => els.contrastEmpty, rowHtml: (f, i) => contrastRowHtml(f, i) },
  tabWalk: { vt: "tab", tbody: () => els.tabTbody, empty: () => els.tabWalkEmpty, rowHtml: (e, i) => tabRowHtml(e, i) },
};

function applySectionView(section, rows, emptyText) {
  const cfg = SECTION_VIEWS[section];
  // initVirtualTables lives in the wireup part — absent under the test harness
  if (!VT[cfg.vt] && typeof initVirtualTables === "function") initVirtualTables();
  const vt = VT[cfg.vt];
  if (vt) {
    vt.setData(rows);
  } else if (cfg.tbody()) {
    cfg.tbody().innerHTML = rows.slice(0, 200).map(cfg.rowHtml).join("");
  }
  const emptyEl = cfg.empty();
  if (emptyEl) {
    if (emptyText) {
      emptyEl.textContent = emptyText;
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
    }
  }
}

// ═══ PER-STEP SCREENSHOT ══════════════════════════════════════════════════
// Decide whether a viewport screenshot is worth attempting for a step. Skips
// schemes captureVisibleTab can't grab so we don't fire a doomed capture.
function shouldCaptureShot(scopeInfo) {
  var url = scopeInfo && scopeInfo.url;
  if (!url || typeof url !== "string") return false;
  return /^https?:\/\//i.test(url);
}

/**
 * Best-effort per-step screenshot. Never throws into the audit path: on any
 * failure the step still records and the filmstrip shows a placeholder tile.
 * Overlay hygiene is handled SW-side (clears __flowlens_annotations__ before
 * captureVisibleTab) so FlowLens's own badges don't pollute the shot.
 */
async function captureStepShot(sessionId, stepIndex, scopeInfo, at) {
  try {
    if (!shouldCaptureShot(scopeInfo)) return;
    const r = await send({ type: "CAPTURE_SHOT" });
    if (!r || !r.ok || !r.dataUrl) {
      markShotError(sessionId, stepIndex);
      return;
    }
    const blob = await (await fetch(r.dataUrl)).blob();
    const put = await flowMediaStore.putShot(sessionId, stepIndex, blob, { at: at || 0 });
    if (put && put.ok) markShotDone(sessionId, stepIndex);
    else markShotError(sessionId, stepIndex);
  } catch (e) {
    markShotError(sessionId, stepIndex);
  }
}

function _findStep(sessionId, stepIndex) {
  const sess = sessionState.current || sessionState.lastEndedSession;
  if (!sess || sess.id !== sessionId) return null;
  return (sess.steps || []).find(s => s.index === stepIndex) || null;
}
function markShotDone(sessionId, stepIndex) {
  const step = _findStep(sessionId, stepIndex);
  if (step) { step.hasShot = true; step.shotError = false; }
}
function markShotError(sessionId, stepIndex) {
  const step = _findStep(sessionId, stepIndex);
  if (step) { step.shotError = true; }
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
  const filters = [];
  if (q) filters.push("search");
  applySectionView("contrast", sorted, sectionEmptyText("contrast", {
    ran: state.hasRunMode.has("contrast") || hasData,
    total: Math.max(state.contrastData.length, state.contrastSamples.length),
    shown: sorted.length,
    filters,
    contrastFilter: state.contrastFilter,
  }));
}


/**
 * Merge walked stops with anomaly events into one row per walked element.
 * Older records have no `stops` — fall back to events alone. Rows already
 * merged (re-render path passes state.tabData back in) pass through as-is.
 */
function buildTabWalkRows(res) {
  const events = Array.isArray(res?.events) ? res.events : [];
  const stops = Array.isArray(res?.stops) ? res.stops : [];
  if (!stops.length) return events;
  const byIdx = new Map();
  for (const e of events) {
    if (!e || e.i == null || e.i < 0) continue;
    if (!byIdx.has(e.i)) byIdx.set(e.i, []);
    byIdx.get(e.i).push(e);
  }
  const rows = stops.map(s => {
    const evs = byIdx.get(s.i) || [];
    return {
      i: s.i,
      type: evs.length ? evs[0].type : (s.tag || ""),
      tabIndex: s.tabIndex,
      name: s.name,
      path: s.path,
      note: evs.length ? evs.map(e => e.note).filter(Boolean).join(" | ") : "",
      _issue: evs.length > 0,
    };
  });
  // Page-level events not tied to a walked index (dialog/container checks, i = -1)
  for (const e of events) {
    if (!e || e.i == null || e.i < 0) rows.push({ ...e, _issue: true });
  }
  return rows;
}

function renderTabWalk(res) {
  const raw = buildTabWalkRows(res);
  state.tabData = raw;
  const walkRan = raw.length > 0 || !!(res && ("walked" in res || "totalFocusables" in res));
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
  applySectionView("tabWalk", events, sectionEmptyText("tabWalk", {
    ran: state.hasRunMode.has("tabWalk") || walkRan,
    total: raw.length,
    shown: events.length,
    filters: q ? ["search"] : [],
  }));
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
  // "What a screen reader heard" — chronological announcement timeline.
  // The #1 conversational-UI failure is a bot reply that announces nothing;
  // this makes silence visible instead of burying it in counters.
  if (els.watchAnnouncements && els.watchAnnList) {
    const anns = Array.isArray(res.announcements) ? res.announcements : [];
    const hadLoading = (res.totalLoadingMs ?? 0) > 0 || (res.bursts ?? 0) > 0;
    if (!anns.length && !hadLoading) {
      els.watchAnnouncements.hidden = true;
    } else {
      els.watchAnnouncements.hidden = false;
      const items = anns.map(a => {
        const t = `+${((a.t ?? 0) / 1000).toFixed(1)}s`;
        const mode = a.ariaLive || a.role || "live";
        const empty = !a.text || a.text === "(empty)";
        const body = empty
          ? "<em>empty announcement — the screen reader says nothing</em>"
          : `“${escapeHtml(txt(a.text, 120))}”`;
        return `<li class="watchAnnItem${empty ? " watchAnnItem--empty" : ""}"><span class="watchAnnT mono">${escapeHtml(t)}</span><span class="watchAnnMode">[${escapeHtml(mode)}]</span> ${body}</li>`;
      });
      if (!anns.length && hadLoading) {
        items.push('<li class="watchAnnItem watchAnnItem--empty"><em>Loading activity produced no announcements — screen reader users heard nothing.</em></li>');
      }
      els.watchAnnList.innerHTML = items.join("");
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
  ACCESSKEY_CHAR_SHORTCUT: 'Provide a way to remap or disable the shortcut, or require a modifier key.',
  SELECT_AUTO_SUBMIT: 'Trigger navigation from an explicit button, not the change event.',
  PASTE_BLOCKED_INPUT: 'Allow paste and autocomplete="current-password" so password managers work.',
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
  HEADING_HIERARCHY_FRAGMENTED: 'Shared heading hierarchy: host provides H1, embedded apps start at H2+.',
  COMPETING_SKIP_NAV: 'Use one skip link from host page. Remove skip links from embedded apps.',
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
};

function applyFixSuggestions(findings) {
  if (!Array.isArray(findings)) return findings;
  for (const f of findings) {
    // EN 301 549 clause post-processing (the snippet ships en301549Clauses: null)
    if (f.en301549Clauses == null && f.wcag && typeof en301549ForWcag === "function") {
      const clauses = en301549ForWcag(f.wcag);
      if (Array.isArray(clauses) && clauses.length) f.en301549Clauses = clauses;
    }
    if (f.fix) continue;
    const s = FIX_SUGGESTIONS[f.type];
    if (s) f.fix = typeof s === "function" ? s(f) : s;
  }
  return findings;
}

function applyRecipe(recipeId, opts) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return;
  activeRecipeId = recipeId;
  if (recipeId === "auto") return; // auto = no overrides
  if (recipe.frameScope && els.target) els.target.value = recipe.frameScope;
  if (recipe.depthMax && els.depthMax) els.depthMax.value = String(recipe.depthMax);
  if (recipe.activeMode) state.activeMode = recipe.activeMode;
  // Profile allowlist: activates exactly the recipe's profiles — but only on
  // explicit recipe selection, never on startup restore (which must not
  // clobber the user's manual profile choices).
  if (opts && opts.applyProfiles && Array.isArray(recipe.profileAllowlist)) {
    profileState.active = recipe.profileAllowlist.filter(id => id in profileState.profiles);
    if (typeof renderProfileSelect === "function") renderProfileSelect();
    if (typeof saveActiveProfiles === "function") saveActiveProfiles();
  }
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

  var groups = [
    { group: "depth3/announcements", status: aggregates.announcementIntegrity, count: aggregates.counts ? aggregates.counts.announcements || 0 : 0, countEl: els.pillAnnouncementsCount },
    { group: "depth3/focus", status: aggregates.focusStability, count: aggregates.counts ? aggregates.counts.focus || 0 : 0, countEl: els.pillFocusCount },
    { group: "depth3/semantics", status: aggregates.chatSemantics, count: aggregates.counts ? aggregates.counts.semantics || 0 : 0, countEl: els.pillSemanticsCount },
    { group: "depth3/multiframe", status: aggregates.multiFrameIntegrity, count: aggregates.counts ? aggregates.counts.multiframe || 0 : 0, countEl: els.pillMultiframeCount },
  ];

  // Zero-count pills are noise — show only groups that found something,
  // and hide the whole bar when every group is clean.
  var anyVisible = false;
  for (var gi = 0; gi < groups.length; gi++) {
    var g = groups[gi];
    var btn = els.integrityOverview.querySelector('.integrityPill[data-group="' + g.group + '"]');
    if (!btn) continue;
    btn.classList.remove("ok", "degraded");
    btn.classList.add(g.status);
    if (g.countEl) g.countEl.textContent = "(" + g.count + ")";
    btn.hidden = !g.count;
    if (g.count) anyVisible = true;
  }
  els.integrityOverview.hidden = !anyVisible;
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
  const filtered = applySortState(applyExplorerFilters(findings), 'explorer');
  state.explorer = filtered;

  // Update findings count (with the axe-style violations / needs-review split).
  // Counts use the same hashFinding dedup as the visible rows — otherwise
  // duplicate findings make the numbers contradict what is rendered.
  if (els.findingsCount) {
    const seenCount = new Set();
    const uniqueAll = all.filter(f => {
      const h = hashFinding(f);
      if (seenCount.has(h)) return false;
      seenCount.add(h);
      return true;
    });
    const total = uniqueAll.length;
    const shown = filtered.length;
    const review = uniqueAll.filter(f => classifyReviewStatus(f) === "needs_review").length;
    const base = shown === total ? `${total} findings` : `${shown} of ${total}`;
    els.findingsCount.textContent = review > 0 ? `${base} · ${review} need review` : base;
  }

  // Honest filter accounting across every layer that can cut rows: the raw
  // record → depth/rule-pack → integrity pill → severity/review/search.
  // The empty message names what is actually hiding rows instead of a
  // catch-all "no results match your search".
  const mode = state.activeMode === "observe" ? "observe" : "run";
  const rawFindings = Array.isArray(state.findingsByMode[mode]) ? state.findingsByMode[mode] : null;
  const rawTotal = rawFindings ? rawFindings.length : all.length;
  const filters = [];
  if (rawFindings && (state.currentFindings || []).length < rawFindings.length) filters.push("depth/rule-pack setting");
  if (activeGroupFilter) filters.push("integrity pill");
  if (state.sevFilter.size > 0) filters.push("severity tab");
  if (state.reviewFilter) filters.push("needs-review chip");
  if ((els.q?.value || "").trim()) filters.push("search");

  applySectionView("explorer", filtered, sectionEmptyText("explorer", {
    ran: state.hasRunMode.has("run") || state.hasRunMode.has("observe"),
    total: rawTotal,
    shown: filtered.length,
    filters,
  }));
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
    els.envBadge.textContent = detected;
    els.envBadge.title = detected;
    els.envBadge.dataset.full = detected;

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
    pathDeep: finding.pathDeep ?? finding.targetRef?.pathDeep ?? null,
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
  if (res?.found === false && res?.reason !== "AUDIT_IN_PROGRESS" && usedFrameIds.length > 0) {
    const retryIds = usedFrameIds.filter(id => id !== bestFrameId).slice(0, 3);
    for (const fid of retryIds) {
      try {
        const retry = await send({ type: "HIGHLIGHT", frameId: fid, finding: payload });
        if (retry?.found) { res = retry; break; }
      } catch { /* skip inaccessible frame */ }
    }
  }

  // No frame context (e.g. a restored past run) — discover frames and retry
  // the embedded ones so highlight still works for iframe findings.
  if (res?.found === false && res?.reason !== "AUDIT_IN_PROGRESS" && usedFrameIds.length === 0) {
    try {
      const lf = await send({ type: "LIST_FRAMES" });
      const frameIds = (Array.isArray(lf?.frames) ? lf.frames : [])
        .map(f => Number(f.frameId))
        .filter(id => Number.isFinite(id) && id !== bestFrameId)
        .slice(0, 3);
      for (const fid of frameIds) {
        try {
          const retry = await send({ type: "HIGHLIGHT", frameId: fid, finding: payload });
          if (retry?.found) { res = retry; break; }
        } catch { /* skip inaccessible frame */ }
      }
    } catch { /* frame discovery unavailable — keep original result */ }
  }

  // Show toast with strategy + frameIdUsed info
  const frameUsed = res?.frameIdUsed != null ? ` in frame ${res.frameIdUsed}` : "";
  if (res?.found) {
    const approx = res.strategy === "path-parent" || res.strategy === "path-loose" || res.strategy === "heuristic" || res.strategy === "html";
    const via = res.strategy && res.strategy !== "none" ? ` via ${res.strategy.toUpperCase()}` : "";
    const tag = res.matched?.tag ? `: <${res.matched.tag}>` : "";
    toast(approx ? `Highlighted closest match${via}${tag}${frameUsed}` : `Highlighted${via}${tag}${frameUsed}`);
  } else {
    const reason = res?.reason === "FRAME_INACCESSIBLE" ? "frame inaccessible"
      : res?.reason === "AUDIT_IN_PROGRESS" ? "audit in progress — highlight after it finishes"
      : "element not found — re-run the audit if the page changed";
    // Manual retry advances to the first frame that has NOT been tried yet
    // (auto loop covered bestFrameId + up to 3 others).
    const autoTried = new Set([bestFrameId, ...usedFrameIds.filter(id => id !== bestFrameId).slice(0, 3)]);
    const nextUntried = usedFrameIds.find(id => !autoTried.has(id));
    toast(`Not found (${reason})`, {
      label: nextUntried != null ? "Try other frames" : undefined,
      fn: nextUntried != null ? () => highlightFinding(finding, { bestFrameId: nextUntried, usedFrameIds: usedFrameIds.filter(id => !autoTried.has(id)) }) : undefined,
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

function buildMachineReadableDiffReport(session) {
  const steps = Array.isArray(session?.steps) ? session.steps : [];
  if (steps.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1];
    const curr = steps[i];
    const prevSigs = prev?.stableSignatures?.run || {};
    const currSigs = curr?.stableSignatures?.run || {};
    const prevBlocking = new Set(Array.isArray(prevSigs.blockingSet) ? prevSigs.blockingSet : []);
    const currBlocking = new Set(Array.isArray(currSigs.blockingSet) ? currSigs.blockingSet : []);
    const blockingAdded = [...currBlocking].filter(s => !prevBlocking.has(s));
    const blockingFixed = [...prevBlocking].filter(s => !currBlocking.has(s));
    const prevCounts = prevSigs.severityCounts || { high: 0, medium: 0, low: 0, info: 0 };
    const currCounts = currSigs.severityCounts || { high: 0, medium: 0, low: 0, info: 0 };
    diffs.push({
      stepPair: [i - 1, i],
      labels: [prev.label || `step-${i - 1}`, curr.label || `step-${i}`],
      blockingAdded,
      blockingFixed,
      countsBySeverity: {
        prev: { ...prevCounts },
        curr: { ...currCounts },
        delta: {
          high: (currCounts.high || 0) - (prevCounts.high || 0),
          medium: (currCounts.medium || 0) - (prevCounts.medium || 0),
          low: (currCounts.low || 0) - (prevCounts.low || 0),
          info: (currCounts.info || 0) - (prevCounts.info || 0),
        },
      },
      degraded: !!(currSigs.stepQuality?.degraded),
    });
  }
  return {
    version: 1,
    sessionId: session?.id || null,
    stepsCount: steps.length,
    runConfigSummary: session?.runConfigSummary || null,
    confidence: {
      reducedDiffConfidence: steps.some(s => s.profileSuspect === true) ||
        steps.some(s => s.stableSignatures?.run?.stepQuality?.degraded === true),
      profileSuspect: steps.some(s => s.profileSuspect === true),
      rootSelectorNotFound: steps.some(s => s.rootSelectorNotFound === true),
    },
    diffs,
  };
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
    renderRawJson(els.json, els.rawJsonBody, pretty(failed));
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
  renderRawJson(els.json, els.rawJsonBody, pretty(r));
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
    const notScriptable = r?.reason === "PAGE_NOT_SCRIPTABLE" || r?.error === "PAGE_NOT_SCRIPTABLE";
    const failMsg = notScriptable
      ? "This page can't be audited (browser-restricted URL)"
      : noScope ? "No frame matches selected scope" : `${action} failed`;
    setRunTelemetry({ usedFrames: "\u2014", diff: notScriptable ? "(page not scriptable)" : noScope ? "(no frame matches selected scope)" : "(run failed)" });
    setPersistentStatus("FAILED", notScriptable ? "PAGE_NOT_SCRIPTABLE" : noScope ? "NO_SCOPE_MATCH" : "BACKEND", failMsg);
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
  // Set endedAt BEFORE building the exportable snapshot — otherwise the
  // "last ended session" export claims in-progress with a growing duration.
  const previousEndedAt = sessionState.current.endedAt || null;
  sessionState.current.endedAt = nowIso();
  const exportableEndedSession = compactSessionForExport(normalizeLoadedSession(sessionState.current));
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

    // Stable signatures (shadow mode) — compute alongside legacy diff
    const stableRun = computeStableSignatureSet(step.snapshots?.run, sessionState.current.rawAppendix || {});
    const stableActive = step.snapshots?.active
      ? computeStableSignatureSet(step.snapshots.active, sessionState.current.rawAppendix || {})
      : null;
    step.stableSignatures = {
      run: stableRun,
      active: stableActive,
    };
    // Signature → finding metadata for the per-step diff + lifecycle swimlane.
    step.findingIndex = buildStepFindingIndex(step.snapshots?.run, sessionState.current.rawAppendix || {});
    // Parallel validation (shadow mode) — log mismatches, never break production
    if (prevStep?.stableSignatures?.run) {
      validateDiffParity(step, prevStep, sessionState.current.rawAppendix || {}, stableRun, prevStep.stableSignatures.run);
    }

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
    // the step. Re-renders the filmstrip when the shot lands.
    captureStepShot(sessionState.current.id, step.index, { url }, capturedAt)
      .then(() => { if (typeof renderFlow === "function" && state.topTab === "flow") renderFlow(); })
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

