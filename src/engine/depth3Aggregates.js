// depth3Aggregates.js — Pure aggregate calculator for Depth 3 rule groups.
// No imports, no DOM. Consumed by panel.js diagnostics and CI exporter.

/**
 * Group slug → aggregate key mapping.
 * Keys match the `group` field on RULE_TO_WCAG entries.
 */
const DEPTH3_GROUP_MAP = {
  "depth3/announcements": "announcementIntegrity",
  "depth3/focus":         "focusStability",
  "depth3/semantics":     "chatSemantics",
  "depth3/multiframe":    "multiFrameIntegrity",
};

/**
 * Group slug → counts key mapping.
 */
const DEPTH3_COUNT_KEY = {
  "depth3/announcements": "announcements",
  "depth3/focus":         "focus",
  "depth3/semantics":     "semantics",
  "depth3/multiframe":    "multiframe",
};

/**
 * Build depth-3 aggregate status from findings and rule metadata.
 *
 * @param {Array} findings — array of finding objects (each has at least `.type`)
 * @param {Object} ruleMetaLookup — map of ruleType → { group?, ... } (e.g. RULE_TO_WCAG)
 * @returns {{ announcementIntegrity, focusStability, chatSemantics, multiFrameIntegrity, counts }}
 */
function buildDepth3Aggregates(findings, ruleMetaLookup) {
  const result = {
    announcementIntegrity: "ok",
    focusStability: "ok",
    chatSemantics: "ok",
    multiFrameIntegrity: "ok",
    counts: { announcements: 0, focus: 0, semantics: 0, multiframe: 0 },
  };

  if (!Array.isArray(findings) || !ruleMetaLookup || typeof ruleMetaLookup !== "object") {
    return result;
  }

  for (const f of findings) {
    const ruleType = f && f.type ? String(f.type) : null;
    if (!ruleType) continue;

    const meta = ruleMetaLookup[ruleType];
    if (!meta || !meta.group) continue;

    const aggKey = DEPTH3_GROUP_MAP[meta.group];
    const countKey = DEPTH3_COUNT_KEY[meta.group];
    if (!aggKey || !countKey) continue; // unknown group — silently ignore

    result[aggKey] = "degraded";
    result.counts[countKey]++;
  }

  return result;
}
