// ciExporter.js — Pure CI JSON contract exporter for FlowLens.
// No imports, no DOM. Consumed by panel.js CI report generation.

/**
 * Forbidden keys that MUST NOT appear anywhere in CI report output.
 * These indicate DOM-derived, text, or URL data leakage.
 */
const CI_FORBIDDEN_KEYS = new Set([
  "selector", "html", "url", "text", "innerText",
  "cssPath", "ariaLabel", "message", "el",
]);

/**
 * Build a CI-safe JSON report from pre-computed inputs.
 *
 * @param {Object} input
 * @param {Object} input.tool — { name, version, hostId }
 * @param {Object} input.scope — { depthMax, profileId, profileConfidence, rulePackHash }
 * @param {Object} input.quality — { signatureQuality, diffConfidence }
 * @param {Object} input.summary — { blockingAdded, blockingFixed, blockingCurrent, totalCount, bySeverity }
 * @param {Object} input.regressions — { blockingAdded: [], blockingFixed: [] }
 * @param {Object|null} input.depth3Aggregates
 * @returns {Object} CI report with contractVersion "1.0"
 */
function buildCIReport(input) {
  const i = input || {};
  const tool = i.tool || {};
  const scope = i.scope || {};
  const quality = i.quality || {};
  const summary = i.summary || {};
  const regressions = i.regressions || {};
  const bySev = summary.bySeverity || {};

  return {
    contractVersion: "1.0",
    tool: {
      name: String(tool.name || "FlowLens"),
      version: String(tool.version || "unknown"),
      hostId: String(tool.hostId || "generic"),
    },
    scope: {
      depthMax: (scope.depthMax === 1 || scope.depthMax === 2 || scope.depthMax === 3) ? scope.depthMax : 3,
      profileId: scope.profileId ? String(scope.profileId) : null,
      profileConfidence: scope.profileConfidence ? String(scope.profileConfidence) : null,
      rulePackHash: scope.rulePackHash ? String(scope.rulePackHash) : null,
    },
    quality: {
      signatureQuality: String(quality.signatureQuality || "none"),
      diffConfidence: String(quality.diffConfidence || "none"),
    },
    summary: {
      blockingAdded: Number(summary.blockingAdded) || 0,
      blockingFixed: Number(summary.blockingFixed) || 0,
      blockingCurrent: Number(summary.blockingCurrent) || 0,
      totalCount: Number(summary.totalCount) || 0,
      bySeverity: {
        high: Number(bySev.high) || 0,
        medium: Number(bySev.medium) || 0,
        low: Number(bySev.low) || 0,
        info: Number(bySev.info) || 0,
      },
    },
    regressions: {
      blockingAdded: sanitizeRegressionEntries(regressions.blockingAdded),
      blockingFixed: sanitizeRegressionEntries(regressions.blockingFixed),
    },
    depth3Aggregates: sanitizeDepth3Aggregates(i.depth3Aggregates),
  };
}

/**
 * Whitelist depth3Aggregates fields — the only branch that used to pass its
 * input through by reference, letting arbitrary caller data (locators, raw
 * text) bypass the no-raw-text contract of the CI report.
 */
function sanitizeDepth3Aggregates(agg) {
  if (!agg || typeof agg !== "object") return null;
  var AXES = ["announcementIntegrity", "focusStability", "chatSemantics", "multiFrameIntegrity"];
  var COUNT_KEYS = ["announcements", "focus", "semantics", "multiframe"];
  var out = { counts: {} };
  for (var a = 0; a < AXES.length; a++) {
    if (typeof agg[AXES[a]] === "string") out[AXES[a]] = agg[AXES[a]].slice(0, 24);
  }
  for (var k = 0; k < COUNT_KEYS.length; k++) {
    var c = agg.counts ? Number(agg.counts[COUNT_KEYS[k]]) : 0;
    out.counts[COUNT_KEYS[k]] = Number.isFinite(c) ? c : 0;
  }
  return out;
}

/**
 * Sanitize regression entries to contain ONLY allowed scalar fields.
 * Strips any DOM-derived, text, or URL data.
 */
function sanitizeRegressionEntries(entries) {
  if (!Array.isArray(entries)) return [];
  var result = [];
  for (var idx = 0; idx < entries.length; idx++) {
    var e = entries[idx];
    if (!e || typeof e !== "object") continue;
    var clean = { signature: String(e.signature || "") };
    if (e.ruleId != null) clean.ruleId = String(e.ruleId);
    if (e.severity != null) clean.severity = String(e.severity);
    if (e.depthLevel != null) clean.depthLevel = Number(e.depthLevel);
    if (e.group != null) clean.group = String(e.group);
    result.push(clean);
  }
  return result;
}

/**
 * Structural validation of a CI report — traverses the entire object tree
 * checking for forbidden keys and suspicious string values.
 *
 * @param {Object} report — the CI report to validate
 * @returns {{ valid: boolean, violations: string[] }}
 */
function validateCIReport(report) {
  var violations = [];

  function walk(obj, path) {
    if (obj == null || typeof obj !== "object") return;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var fullPath = path ? path + "." + key : key;
      if (CI_FORBIDDEN_KEYS.has(key)) {
        violations.push("forbidden key: " + fullPath);
        continue;
      }
      var val = obj[key];
      if (typeof val === "string") {
        if (val.indexOf("<") !== -1) {
          violations.push("suspicious value (contains '<'): " + fullPath);
        }
        if (val.indexOf("http") !== -1) {
          violations.push("suspicious value (contains 'http'): " + fullPath);
        }
      } else if (val != null && typeof val === "object") {
        walk(val, fullPath);
      }
    }
  }

  walk(report, "");
  return { valid: violations.length === 0, violations: violations };
}
