// --- Presets ---

// --- Export ---
async function copyMarkdown() {
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
  const ok = await copyText(md);
  if (ok) flashInlineHint(els.copyMdHint);
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
  const best = currentBestEntry();
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
      const best = currentBestEntry();
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
    const _reasons = typeof UNCOVERED_CRITERIA_REASONS !== "undefined" ? UNCOVERED_CRITERIA_REASONS : {};
    const items = ecs.criteriaMissing.slice(0, MAX_SHOWN);
    els.coverageMissingList.innerHTML = items.map(c => {
      const reason = _reasons[c] ? ` <span class="coverageReason">${escapeHtml(_reasons[c])}</span>` : "";
      return `<li>${escapeHtml(c)} ${escapeHtml(titleMap[c] || "")}${reason}</li>`;
    }).join("") + (ecs.criteriaMissing.length > MAX_SHOWN
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
  // Stable order: built-ins first, then custom profiles, alphabetical within
  // each group — object insertion order depends on load order and looks messy.
  const entries = Object.entries(profileState.profiles).sort(([idA, pA], [idB, pB]) => {
    const builtinA = idA in BUILTIN_PROFILES ? 0 : 1;
    const builtinB = idB in BUILTIN_PROFILES ? 0 : 1;
    if (builtinA !== builtinB) return builtinA - builtinB;
    return String(pA.label || idA).localeCompare(String(pB.label || idB));
  });
  for (const [id, p] of entries) {
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
  if (els.alsoConsole) els.alsoConsole.checked = !!uiPrefs.alsoConsole;
  if (els.wcagLevel && uiPrefs.wcagLevel) els.wcagLevel.value = uiPrefs.wcagLevel;
  // Recipe first, persisted per-field overrides after — otherwise a non-auto
  // recipe re-clobbers the user's saved depth/mode on every panel load.
  if (els.recipeSelect && uiPrefs.recipeId) {
    els.recipeSelect.value = uiPrefs.recipeId;
    applyRecipe(uiPrefs.recipeId);
  }
  if (els.depthMax && uiPrefs.depthMax) els.depthMax.value = String(uiPrefs.depthMax);
  // Auto-capture: default ON (HTML default) — undefined must not read as false,
  // but a deliberate OFF has to survive a panel reload.
  if (els.autoCaptureNav) els.autoCaptureNav.checked = uiPrefs.autoCaptureNav !== false;
  if (els.autoCaptureDelay && uiPrefs.autoCaptureDelay) els.autoCaptureDelay.value = String(uiPrefs.autoCaptureDelay);
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
  // Dedicated modes cover criteria that run()-rules don't (Contrast → 1.4.3, Tab Walk → 2.1.2)
  const _modeMap = typeof MODE_TO_WCAG !== "undefined" ? MODE_TO_WCAG : {};
  for (const mode of Object.keys(_modeMap)) {
    for (const c of _modeMap[mode]) {
      if (targetSet.has(c)) coveredSet.add(c);
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

function buildDiagnosticsMarkdown(payload) {
  const p = payload || {};
  const d = (v) => (v != null && v !== "") ? String(v) : "\u2014";
  const signals = Array.isArray(p.profileMatchSignals) && p.profileMatchSignals.length
    ? p.profileMatchSignals.join(", ") : "\u2014";
  const shadowLine = p.shadowCoverage
    ? `${p.shadowCoverage.scopesAudited}/${p.shadowCoverage.scopesFound} scopes` +
      (p.shadowCoverage.scopesCapped ? " (capped)" : "") +
      `, depth ${p.shadowCoverage.maxDepthObserved}` +
      (p.shadowCoverage.depthLimitReached ? " (limit reached)" : "")
    : "\u2014";
  return [
    "# FlowLens Diagnostics",
    "",
    "## Environment",
    `- Version: ${d(p.version)}`,
    `- Host: ${d(p.hostConfigId)}`,
    `- Data Versions: ${d(p.dataVersionsLine)}`,
    `- URL: ${d(p.url)}`,
    `- Environment Tag: ${d(p.env)}`,
    "",
    "## Frame",
    `- Best Frame ID: ${d(p.bestFrameId)}`,
    `- Frame Key: ${d(p.bestFrameKey)}`,
    `- Frame Scope: ${d(p.frameScope)}`,
    ...(p.frameGatingSelectorCount > 0 ? [`- Frame Gating: active (${p.frameGatingSelectorCount} selectors)`] : []),
    ...(p.excludedFrameCount > 0 ? [`- Excluded Frames: ${p.excludedFrameCount} excluded by host match rules`] : []),
    "",
    "## Profiles",
    `- Active Profile: ${d(p.activeProfileLabel)}`,
    `- Profile Confidence: ${d(p.profileConfidence)}`,
    `- Profile Signals: ${signals}`,
    `- Profile Suspect: ${p.profileSuspect ? "yes" : "no"}`,
    `- Root Selector: ${d(p.rootSelector)}`,
    `- Root Selector Match: ${p.rootSelector ? (p.rootSelectorNotFound ? "NOT FOUND" : "OK") : "\u2014"}`,
    ...(p.rootSelectorMatchedFrameIds?.length ? [`- Matched in Frame(s): ${p.rootSelectorMatchedFrameIds.join(", ")}`] : []),
    ...(p.reducedDiffConfidence ? ["- Diff Confidence: **reduced**"] : []),
    `- Depth Filter: ${p.depthMax || 3} (${p.depthMax === 1 ? "Fast" : p.depthMax === 2 ? "Balanced" : "Full"})`,
    ...(p.depthSuggestion ? [`- **Depth suggestion: ${p.depthSuggestion.suggestedDepth}** (profile ${p.depthSuggestion.profileId})`] : []),
    `- Recipe: ${p.recipeId || "auto"}`,
    ...(p.rulePack ? [`- Rule Pack: enabled=${p.rulePack.enabledCount}, disabled=${p.rulePack.disabledCount}`] : []),
    "",
    "## Depth 3 Engine",
    `- Enabled: ${p.depth3Engine?.enabled ? "yes" : "no"}`,
    `- Capture Mode: ${d(p.depth3Engine?.captureMode)}`,
    `- Capped: ${p.depth3Engine?.capped ? "yes" : "no"}`,
    "",
    ...(p.depth3Aggregates ? [
      "## Depth 3 Integrity (current run view)",
      `- Announcement Integrity: ${p.depth3Aggregates.announcementIntegrity} (${p.depth3Aggregates.counts?.announcements || 0} findings)`,
      `- Focus Stability: ${p.depth3Aggregates.focusStability} (${p.depth3Aggregates.counts?.focus || 0} findings)`,
      `- Chat Semantics: ${p.depth3Aggregates.chatSemantics} (${p.depth3Aggregates.counts?.semantics || 0} findings)`,
      `- Multi-Frame Integrity: ${p.depth3Aggregates.multiFrameIntegrity} (${p.depth3Aggregates.counts?.multiframe || 0} findings)`,
      "",
    ] : []),
    "## Shadow DOM",
    `- Shadow Coverage: ${shadowLine}`,
    "",
  ].join("\n");
}

/**
 * Enrich a regression signature into a CI-safe entry with only scalar fields.
 * Parses ruleId from signature format: mode|type|wcag|severity|hash.
 * Looks up depthLevel/group from RULE_TO_WCAG — no finding object fields copied.
 */
function enrichRegressionEntry(sig) {
  var entry = { signature: String(sig || "") };
  // Parse signature: mode|type|wcag|severity|hash
  var parts = entry.signature.split("|");
  if (parts.length >= 4) {
    var ruleId = parts[1] || "";
    var severity = parts[3] || "info";
    entry.ruleId = ruleId;
    entry.severity = severity;
    // Look up depthLevel and group from RULE_TO_WCAG
    var ruleMeta = (typeof RULE_TO_WCAG !== "undefined" && RULE_TO_WCAG) ? RULE_TO_WCAG[ruleId] : null;
    if (ruleMeta) {
      if (ruleMeta.depthLevel != null) entry.depthLevel = Number(ruleMeta.depthLevel);
      if (ruleMeta.group != null) entry.group = String(ruleMeta.group);
    }
  }
  return entry;
}

/**
 * Build a CI JSON report from current panel state.
 * Gathers inputs from state, session, profile, and findings.
 * Returns the output of buildCIReport — a contractVersion "1.0" object.
 */
function buildCIReportFromState() {
  if (typeof buildCIReport !== "function") return null;

  var version = (typeof __FLOWLENS_VERSION__ !== "undefined") ? __FLOWLENS_VERSION__ : "dev";
  var bestEntry = currentBestEntry();
  var rawFindings = Array.isArray(bestEntry?.result?.findings) ? bestEntry.result.findings : [];
  var filteredFindings = applyAllFindingFilters(rawFindings);

  // Severity counts from filtered findings
  var bySeverity = { high: 0, medium: 0, low: 0, info: 0 };
  for (var fi = 0; fi < filteredFindings.length; fi++) {
    var sev = (filteredFindings[fi]?.severity || "info").toLowerCase();
    if (sev in bySeverity) bySeverity[sev]++;
  }

  // Blocking count follows the panel's own classification (isRunFindingBlocking:
  // high blocks, medium only with strict confidence, advisory never) and the
  // SAME filtered scope as totalCount/bySeverity — the signature-set path both
  // over-counted heuristic mediums and ignored active depth/rule-pack filters.
  var blockingCount = filteredFindings.filter(isRunFindingBlocking).length;

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
      signatureQuality: rawFindings.length > 0 ? "available" : "none",
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

