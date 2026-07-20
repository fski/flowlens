// Single source of truth for the FlowLens extension version.
// Build reads this value and injects it into manifest.json and panel.js (via esbuild define).
// Bump this value when preparing a release.
const FLOWLENS_VERSION = "6.1.3";
