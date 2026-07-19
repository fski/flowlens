// en301549-map.js — EN 301 549 V3.2.1 (2021-03) mapping to WCAG 2.1
// Versioned: bump EN_MAPPING_VERSION when this table changes.
// Local-only, no network. Used by panel.js post-processing.

const EN_MAPPING_VERSION = 1;

/**
 * Maps WCAG criterion → EN 301 549 clause(s).
 * EN 301 549 Section 9 mirrors WCAG 2.1 Level AA verbatim,
 * but some criteria map to multiple EN clauses (e.g., 11.x for software, 9.x for web).
 */
const WCAG_TO_EN301549 = {
  "1.1.1": ["9.1.1.1"],
  "1.2.1": ["9.1.2.1"],
  "1.2.2": ["9.1.2.2"],
  "1.2.3": ["9.1.2.3"],
  "1.2.4": ["9.1.2.4"],
  "1.2.5": ["9.1.2.5"],
  "1.3.1": ["9.1.3.1"],
  "1.3.2": ["9.1.3.2"],
  "1.3.3": ["9.1.3.3"],
  "1.3.4": ["9.1.3.4"],
  "1.3.5": ["9.1.3.5"],
  "1.4.1": ["9.1.4.1"],
  "1.4.2": ["9.1.4.2"],
  "1.4.3": ["9.1.4.3"],
  "1.4.4": ["9.1.4.4"],
  "1.4.5": ["9.1.4.5"],
  "1.4.6": ["9.1.4.6"],
  "1.4.10": ["9.1.4.10"],
  "1.4.11": ["9.1.4.11"],
  "1.4.12": ["9.1.4.12"],
  "1.4.13": ["9.1.4.13"],
  "2.1.1": ["9.2.1.1"],
  "2.1.2": ["9.2.1.2"],
  "2.1.4": ["9.2.1.4"],
  "2.2.1": ["9.2.2.1"],
  "2.2.2": ["9.2.2.2"],
  "2.3.1": ["9.2.3.1"],
  "2.4.1": ["9.2.4.1"],
  "2.4.2": ["9.2.4.2"],
  "2.4.3": ["9.2.4.3"],
  "2.4.4": ["9.2.4.4"],
  "2.4.5": ["9.2.4.5"],
  "2.4.6": ["9.2.4.6"],
  "2.4.7": ["9.2.4.7"],
  "2.4.11": [],               // WCAG 2.2 — not in EN 301 549 V3.2.1
  "2.5.1": ["9.2.5.1"],
  "2.5.2": ["9.2.5.2"],
  "2.5.3": ["9.2.5.3"],
  "2.5.4": ["9.2.5.4"],
  "2.5.5": ["9.2.5.5"],
  "2.5.8": [],                 // WCAG 2.2 — not yet in EN 301 549
  "3.1.1": ["9.3.1.1"],
  "3.1.2": ["9.3.1.2"],
  "3.2.1": ["9.3.2.1"],
  "3.2.2": ["9.3.2.2"],
  "3.2.3": ["9.3.2.3"],
  "3.2.4": ["9.3.2.4"],
  "3.2.6": [],                 // WCAG 2.2
  "3.3.1": ["9.3.3.1"],
  "3.3.2": ["9.3.3.2"],
  "3.3.3": ["9.3.3.3"],
  "3.3.4": ["9.3.3.4"],
  "3.3.7": [],                 // WCAG 2.2
  "4.1.1": ["9.4.1.1"],
  "4.1.2": ["9.4.1.2"],
  "4.1.3": ["9.4.1.3"],
};

/**
 * Reverse lookup: WCAG criterion → EN 301 549 clauses.
 * Returns empty array for unknown criteria or WCAG 2.2 criteria not yet mapped.
 */
function en301549ForWcag(wcagCriterion) {
  if (!wcagCriterion) return [];
  // Handle compound criteria like "1.3.1 / 3.3.2 / 4.1.2"
  const parts = String(wcagCriterion).split(/\s*\/\s*/).map(s => s.trim());
  const result = [];
  const seen = new Set();
  for (const part of parts) {
    for (const clause of (WCAG_TO_EN301549[part] || [])) {
      if (!seen.has(clause)) {
        seen.add(clause);
        result.push(clause);
      }
    }
  }
  return result;
}
