#!/usr/bin/env node
/**
 * FlowLens build script.
 * Reads source from src/, injects version, writes runtime files to dist/.
 *
 * Usage:
 *   node scripts/build.mjs            — production build (minified, no sourcemaps)
 *   node scripts/build.mjs --dev      — dev build (unminified, external sourcemaps)
 */
import {
  mkdirSync, rmSync, readFileSync, writeFileSync,
  readdirSync, statSync, cpSync,
} from "node:fs";
import { join, extname } from "node:path";

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

// ── File map: source path → dist path ───────────────────────────────────────

function buildFileMap(version) {
  return [
    // JS entrypoints
    { src: "panel/panel.js",               dist: "panel.js",               type: "js" },
    { src: "sw/sw.js",                     dist: "sw.js",                  type: "js" },
    { src: "snippet/a11y-audit-snippet.js", dist: "a11y-audit-snippet.js", type: "js" },
    { src: "devtools/devtools.js",         dist: "devtools.js",            type: "js" },
    { src: "shared/en301549-map.js",       dist: "en301549-map.js",        type: "js" },

    // HTML
    { src: "panel/panel.html",    dist: "panel.html",    type: "html", version },
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

async function processJS(code) {
  if (isDev) return code;
  const esbuild = await loadEsbuild();
  if (!esbuild) return code;
  const result = await esbuild.transform(code, { minify: true, target: "es2022" });
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

function patchHTMLVersion(html, version) {
  return html.replace(
    /(<span[^>]*id="versionBadge"[^>]*data-version=")[^"]*("[^>]*>)[^<]*/,
    `$1${version}$2${version}`
  );
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

  // Clean and create dist
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  // ── Generate manifest.json ──
  const manifestTemplate = readFileSync(join(SRC, "manifest", "manifest.base.json"), "utf8");
  const manifest = manifestTemplate.replace("__VERSION__", version);
  writeFileSync(join(DIST, "manifest.json"), manifest);
  console.log(`  ${"manifest.json".padEnd(28)} (version: ${version})`);

  // ── Process files ──
  const fileMap = buildFileMap(version);
  let totalSrc = 0, totalDist = 0;

  for (const entry of fileMap) {
    const srcPath = join(SRC, entry.src);
    let raw = readFileSync(srcPath, "utf8");
    let output;

    if (entry.type === "js") {
      output = await processJS(raw);
    } else if (entry.type === "css") {
      output = await processCSS(raw);
    } else if (entry.type === "html") {
      if (entry.version) raw = patchHTMLVersion(raw, entry.version);
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
