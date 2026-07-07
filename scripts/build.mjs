#!/usr/bin/env node
/**
 * FlowLens build script.
 * Reads source from src/, injects version, writes runtime files to dist/.
 *
 * Usage:
 *   node scripts/build.mjs            — production build (minified, no sourcemaps)
 *   node scripts/build.mjs --dev      — dev build (unminified, external sourcemaps)
 *
 * Environment:
 *   HOST_CONFIG=./path/to/config.json  — custom host config (JSON by default)
 *   HOST_CONFIG_ALLOW_JS=1             — allow JS config files (requires explicit opt-in)
 */
import {
  mkdirSync, rmSync, readFileSync, writeFileSync,
  readdirSync, statSync, cpSync, existsSync,
} from "node:fs";
import { join, extname, resolve } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const DIST = join(ROOT, "dist");

const isDev = process.argv.includes("--dev");

// ── Version extraction ──────────────────────────────────────────────────────

function readVersion() {
  const versionFile = join(SRC, "shared", "version.js");
  const content = readFileSync(versionFile, "utf8");
  const match = content.match(/FLOWLENS_VERSION\s*=\s*"([^"]+)"/);
  if (!match) {
    console.error("ERROR: Could not extract FLOWLENS_VERSION from src/shared/version.js");
    process.exit(1);
  }
  return match[1];
}

// ── Shared limits extraction ────────────────────────────────────────────────

function readLimits() {
  const limitsFile = join(SRC, "shared", "limits.js");
  const content = readFileSync(limitsFile, "utf8");
  const arrMatch = content.match(/MAX_MATCH_ARRAY\s*=\s*(\d+)/);
  const strMatch = content.match(/MAX_MATCH_STRING\s*=\s*(\d+)/);
  if (!arrMatch || !strMatch) {
    console.error("ERROR: Could not extract limits from src/shared/limits.js");
    process.exit(1);
  }
  return { maxArray: Number(arrMatch[1]), maxString: Number(strMatch[1]) };
}

// ── HostConfig loading + validation ─────────────────────────────────────────
// HostConfig MUST NOT affect: stable signature generation, diff logic,
// FrameKey derivation, or highlight logic. It only influences:
// targeting (frame selection), profile defaults, UI labels, and DOM scoping.

const HOSTCONFIG_ALLOWED_TOP = new Set(["id", "label", "defaultProfiles", "rootSelector", "match", "ui"]);
const HOSTCONFIG_ALLOWED_MATCH = new Set(["domSelectorsAny", "urlIncludesAny", "urlExcludesAny"]);
const HOSTCONFIG_ALLOWED_UI = new Set(["badgeText", "diagnosticsHint"]);
const { maxArray: HOSTCONFIG_MAX_ARRAY, maxString: HOSTCONFIG_MAX_STRING } = readLimits();

function validateHostConfig(config, configPath) {
  const errors = [];
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    errors.push("HostConfig must be a plain object");
    return errors;
  }

  // Required keys
  if (typeof config.id !== "string" || !config.id) {
    errors.push("'id' is required and must be a non-empty string");
  }

  // Reject unexpected top-level keys
  for (const key of Object.keys(config)) {
    if (!HOSTCONFIG_ALLOWED_TOP.has(key)) {
      errors.push(`Unexpected top-level key: '${key}'`);
    }
  }

  // Validate match
  if (config.match != null) {
    if (typeof config.match !== "object" || Array.isArray(config.match)) {
      errors.push("'match' must be a plain object");
    } else {
      for (const key of Object.keys(config.match)) {
        if (!HOSTCONFIG_ALLOWED_MATCH.has(key)) {
          errors.push(`Unexpected match key: '${key}'`);
        }
      }
      for (const field of ["domSelectorsAny", "urlIncludesAny", "urlExcludesAny"]) {
        const arr = config.match[field];
        if (arr != null) {
          if (!Array.isArray(arr)) {
            errors.push(`match.${field} must be an array`);
          } else {
            if (arr.length > HOSTCONFIG_MAX_ARRAY) {
              errors.push(`match.${field} exceeds max ${HOSTCONFIG_MAX_ARRAY} items (got ${arr.length})`);
            }
            for (let i = 0; i < arr.length; i++) {
              if (typeof arr[i] !== "string") {
                errors.push(`match.${field}[${i}] must be a string`);
              } else if (arr[i].length > HOSTCONFIG_MAX_STRING) {
                errors.push(`match.${field}[${i}] exceeds max ${HOSTCONFIG_MAX_STRING} chars`);
              }
            }
          }
        }
      }
    }
  }

  // Validate ui
  if (config.ui != null) {
    if (typeof config.ui !== "object" || Array.isArray(config.ui)) {
      errors.push("'ui' must be a plain object");
    } else {
      for (const key of Object.keys(config.ui)) {
        if (!HOSTCONFIG_ALLOWED_UI.has(key)) {
          errors.push(`Unexpected ui key: '${key}'`);
        }
      }
      if (config.ui.badgeText != null && typeof config.ui.badgeText !== "string") {
        errors.push("ui.badgeText must be a string or null");
      }
      if (config.ui.diagnosticsHint != null && typeof config.ui.diagnosticsHint !== "string") {
        errors.push("ui.diagnosticsHint must be a string or null");
      }
    }
  }

  // Validate defaultProfiles
  if (config.defaultProfiles != null) {
    if (!Array.isArray(config.defaultProfiles)) {
      errors.push("'defaultProfiles' must be an array");
    } else {
      if (config.defaultProfiles.length > HOSTCONFIG_MAX_ARRAY) {
        errors.push(`defaultProfiles exceeds max ${HOSTCONFIG_MAX_ARRAY} items`);
      }
      for (let i = 0; i < config.defaultProfiles.length; i++) {
        if (typeof config.defaultProfiles[i] !== "string") {
          errors.push(`defaultProfiles[${i}] must be a string`);
        }
      }
    }
  }

  // Validate rootSelector
  if (config.rootSelector != null && typeof config.rootSelector !== "string") {
    errors.push("'rootSelector' must be a string or null");
  }

  // Validate label
  if (config.label != null && typeof config.label !== "string") {
    errors.push("'label' must be a string or null");
  }

  return errors;
}

function normalizeHostConfig(config) {
  const out = {
    id: config.id,
    label: config.label ?? null,
    defaultProfiles: [...new Set(config.defaultProfiles || [])],
    rootSelector: config.rootSelector ?? null,
    match: {
      domSelectorsAny: [...new Set(config.match?.domSelectorsAny || [])],
      urlIncludesAny: [...new Set(config.match?.urlIncludesAny || [])],
      urlExcludesAny: [...new Set(config.match?.urlExcludesAny || [])],
    },
    ui: {
      badgeText: config.ui?.badgeText ?? null,
      diagnosticsHint: config.ui?.diagnosticsHint ?? null,
    },
  };
  return out;
}

async function readHostConfig() {
  const envPath = process.env.HOST_CONFIG;
  const allowJS = process.env.HOST_CONFIG_ALLOW_JS === "1";

  if (!envPath) {
    // Default config
    const defaultPath = join(SRC, "host", "default.config.json");
    const raw = readFileSync(defaultPath, "utf8");
    return { config: JSON.parse(raw), path: defaultPath };
  }

  const configPath = resolve(envPath);
  if (!existsSync(configPath)) {
    console.error(`ERROR: HOST_CONFIG path does not exist: ${configPath}`);
    process.exit(1);
  }

  const ext = extname(configPath).toLowerCase();
  if (ext === ".json") {
    const raw = readFileSync(configPath, "utf8");
    return { config: JSON.parse(raw), path: configPath };
  }

  if ((ext === ".js" || ext === ".mjs") && allowJS) {
    const mod = await import(`file://${configPath}`);
    return { config: mod.default, path: configPath };
  }

  if (ext === ".js" || ext === ".mjs") {
    console.error(`ERROR: JS config files require HOST_CONFIG_ALLOW_JS=1 (got: ${configPath})`);
    process.exit(1);
  }

  console.error(`ERROR: Unsupported config file extension: ${ext} (use .json or .js)`);
  process.exit(1);
}

// ── File map: source path → dist path ───────────────────────────────────────

function buildFileMap() {
  return [
    // JS entrypoints
    { src: "panel/panel.js",               dist: "panel.js",               type: "js" },
    { src: "panel/signature-engine.js",    dist: "signature-engine.js",    type: "js" },
    { src: "panel/exporters.js",           dist: "exporters.js",           type: "js" },
    { src: "sw/sw.js",                     dist: "sw.js",                  type: "js" },
    { src: "snippet/a11y-audit-snippet.js", dist: "a11y-audit-snippet.js", type: "js" },
    { src: "vendor/accname.js",            dist: "accname.js",             type: "js" },
    { src: "devtools/devtools.js",         dist: "devtools.js",            type: "js" },
    { src: "shared/en301549-map.js",       dist: "en301549-map.js",        type: "js" },
    { src: "shared/flow-profiles.js",      dist: "flow-profiles.js",       type: "js" },
    { src: "shared/wcag-coverage.js",      dist: "wcag-coverage.js",       type: "js" },
    { src: "shared/limits.js",             dist: "limits.js",              type: "js" },
    { src: "engine/stateTransitionEngine.js", dist: "stateTransitionEngine.js", type: "js" },
    { src: "engine/depth3Aggregates.js", dist: "depth3Aggregates.js", type: "js" },
    { src: "engine/ciExporter.js", dist: "ciExporter.js", type: "js" },

    // HTML
    { src: "panel/panel.html",    dist: "panel.html",    type: "html" },
    { src: "devtools/devtools.html", dist: "devtools.html", type: "html" },

    // CSS
    { src: "panel/panel.css",     dist: "panel.css",     type: "css" },
  ];
}

// ── Asset directories to copy ───────────────────────────────────────────────

const ASSET_DIRS = [
  { src: "assets/icons", dist: "icons" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

let _esbuild = null;
async function loadEsbuild() {
  if (_esbuild !== undefined && _esbuild !== null) return _esbuild;
  try {
    _esbuild = await import("esbuild");
    return _esbuild;
  } catch {
    console.warn("  ⚠ esbuild not installed — copying without minification");
    _esbuild = null;
    return null;
  }
}

async function processJS(code, { define } = {}) {
  if (isDev && !define) return code;
  const esbuild = await loadEsbuild();
  if (!esbuild) return code;
  const opts = { target: "es2022" };
  if (!isDev) opts.minify = true;
  if (define) opts.define = define;
  const result = await esbuild.transform(code, opts);
  return result.code;
}

async function processCSS(code) {
  if (isDev) return code;
  const esbuild = await loadEsbuild();
  if (!esbuild) return code;
  const result = await esbuild.transform(code, { loader: "css", minify: true });
  return result.code;
}

function processHTML(html) {
  if (isDev) return html;
  return html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/>\s+</g, "> <")
    .split("\n").map(l => l.trim()).filter(Boolean).join("\n");
}

function copyDirRecursive(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const s = join(srcDir, entry);
    const d = join(destDir, entry);
    if (statSync(s).isDirectory()) {
      copyDirRecursive(s, d);
    } else {
      cpSync(s, d);
    }
  }
}

function formatSize(bytes) {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}K`;
}

function dirSize(dir) {
  let total = 0;
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) total += dirSize(p);
    else total += statSync(p).size;
  }
  return total;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = performance.now();
  const version = readVersion();
  console.log(`  FlowLens v${version}  (${isDev ? "dev" : "prod"} build)\n`);

  // ── Load and validate HostConfig ──
  const { config: rawHostConfig, path: configPath } = await readHostConfig();
  const configErrors = validateHostConfig(rawHostConfig, configPath);
  if (configErrors.length) {
    console.error(`  HostConfig validation FAILED (${configPath}):`);
    for (const e of configErrors) console.error(`    - ${e}`);
    process.exit(1);
  }
  const hostConfig = normalizeHostConfig(rawHostConfig);
  console.log(`  Host: ${hostConfig.id}`);
  console.log(`  HostConfig validated: OK\n`);

  const hostConfigJSON = JSON.stringify(hostConfig);

  // Clean and create dist
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // ── Generate manifest.json ──
  const manifestTemplate = readFileSync(join(SRC, "manifest", "manifest.base.json"), "utf8");
  const manifest = manifestTemplate.replace("__VERSION__", version);
  writeFileSync(join(DIST, "manifest.json"), manifest);
  console.log(`  ${"manifest.json".padEnd(28)} (version: ${version})`);

  // ── Process files ──
  const fileMap = buildFileMap();
  let totalSrc = 0, totalDist = 0;

  for (const entry of fileMap) {
    const srcPath = join(SRC, entry.src);
    let raw = readFileSync(srcPath, "utf8");
    let output;

    if (entry.type === "js") {
      const jsOpts = {};
      if (entry.dist === "panel.js") {
        jsOpts.define = {
          "__FLOWLENS_VERSION__": JSON.stringify(version),
          "__HOST_CONFIG__": hostConfigJSON,
        };
      }
      output = await processJS(raw, jsOpts);
    } else if (entry.type === "css") {
      output = await processCSS(raw);
    } else if (entry.type === "html") {
      output = processHTML(raw);
    } else {
      output = raw;
    }

    writeFileSync(join(DIST, entry.dist), output);
    const srcSize = Buffer.byteLength(raw);
    const distSize = Buffer.byteLength(output);
    totalSrc += srcSize;
    totalDist += distSize;
    const pct = srcSize > 0 ? Math.round((1 - distSize / srcSize) * 100) : 0;
    console.log(`  ${entry.dist.padEnd(28)} ${formatSize(srcSize).padStart(8)} → ${formatSize(distSize).padStart(8)}  (${pct > 0 ? "-" + pct + "%" : "same"})`);
  }

  // ── Copy asset directories ──
  for (const dir of ASSET_DIRS) {
    const srcDir = join(SRC, dir.src);
    const destDir = join(DIST, dir.dist);
    copyDirRecursive(srcDir, destDir);
    const srcSize = dirSize(srcDir);
    const destSize = dirSize(destDir);
    totalSrc += srcSize;
    totalDist += destSize;
    console.log(`  ${(dir.dist + "/").padEnd(28)} ${formatSize(srcSize).padStart(8)} → ${formatSize(destSize).padStart(8)}  (copy)`);
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  const totalPct = totalSrc > 0 ? Math.round((1 - totalDist / totalSrc) * 100) : 0;
  console.log(`\n  Total:${" ".repeat(21)} ${formatSize(totalSrc).padStart(8)} → ${formatSize(totalDist).padStart(8)}  (-${totalPct}%)`);
  console.log(`  Built in ${elapsed}s → dist/`);
}

main().catch(err => { console.error(err); process.exit(1); });
