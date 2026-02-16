#!/usr/bin/env node
/**
 * FlowLens extension build script.
 * Copies only runtime files to dist/ and minifies JS/CSS.
 *
 * Usage:
 *   npm run build          — build to dist/
 *   npm run build:clean    — clean dist/ first, then build
 */
import { mkdirSync, cpSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from "node:fs";
import { join, extname } from "node:path";

const SRC = import.meta.dirname;
const DIST = join(SRC, "dist");

// Only these files/dirs are needed at runtime
const RUNTIME_FILES = [
  "manifest.json",
  "devtools.html",
  "devtools.js",
  "panel.html",
  "panel.css",
  "panel.js",
  "sw.js",
  "a11y-audit-snippet.js",
];

const RUNTIME_DIRS = [
  "icons",
];

// Icons to exclude (unused at runtime)
const ICON_EXCLUDE = new Set([
  "flowlens-wordmark-dark.svg",
  "flowlens-wordmark-light.svg",
]);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadEsbuild() {
  try {
    return await import("esbuild");
  } catch {
    console.warn("⚠ esbuild not installed — copying files without minification");
    console.warn("  Run: npm install");
    return null;
  }
}

async function minifyJS(code) {
  const esbuild = await loadEsbuild();
  if (!esbuild) return code;
  const result = await esbuild.transform(code, {
    minify: true,
    target: "es2022",
  });
  return result.code;
}

async function minifyCSS(code) {
  const esbuild = await loadEsbuild();
  if (!esbuild) return code;
  const result = await esbuild.transform(code, {
    loader: "css",
    minify: true,
  });
  return result.code;
}

function minifyHTML(html) {
  // Lightweight HTML minification — collapse whitespace between tags, trim lines
  return html
    .replace(/<!--[\s\S]*?-->/g, "")           // strip comments
    .replace(/>\s+</g, "> <")                   // collapse inter-tag whitespace
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean)
    .join("\n");
}

function copyDirFiltered(srcDir, destDir, exclude = new Set()) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    if (exclude.has(entry)) continue;
    const s = join(srcDir, entry);
    const d = join(destDir, entry);
    if (statSync(s).isDirectory()) {
      copyDirFiltered(s, d, exclude);
    } else {
      cpSync(s, d);
    }
  }
}

function formatSize(bytes) {
  return bytes < 1024 ? `${bytes}B` : `${(bytes / 1024).toFixed(1)}K`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const t0 = performance.now();

  // Clean and create dist
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });

  let totalSrc = 0;
  let totalDist = 0;

  // Process individual files
  for (const file of RUNTIME_FILES) {
    const src = join(SRC, file);
    const dest = join(DIST, file);
    const raw = readFileSync(src, "utf8");
    const ext = extname(file);
    let output;

    if (ext === ".js") {
      output = await minifyJS(raw);
    } else if (ext === ".css") {
      output = await minifyCSS(raw);
    } else if (ext === ".html") {
      output = minifyHTML(raw);
    } else {
      output = raw;
    }

    writeFileSync(dest, output);
    const srcSize = Buffer.byteLength(raw);
    const destSize = Buffer.byteLength(output);
    totalSrc += srcSize;
    totalDist += destSize;
    const pct = srcSize > 0 ? Math.round((1 - destSize / srcSize) * 100) : 0;
    console.log(`  ${file.padEnd(28)} ${formatSize(srcSize).padStart(8)} → ${formatSize(destSize).padStart(8)}  (${pct > 0 ? "-" + pct + "%" : "same"})`);
  }

  // Copy runtime directories
  for (const dir of RUNTIME_DIRS) {
    const srcDir = join(SRC, dir);
    const destDir = join(DIST, dir);
    copyDirFiltered(srcDir, destDir, ICON_EXCLUDE);
    // Calculate dir sizes
    let dirSrc = 0, dirDist = 0;
    for (const f of readdirSync(srcDir)) {
      const s = join(srcDir, f);
      if (statSync(s).isFile()) dirSrc += statSync(s).size;
    }
    for (const f of readdirSync(destDir)) {
      const s = join(destDir, f);
      if (statSync(s).isFile()) dirDist += statSync(s).size;
    }
    totalSrc += dirSrc;
    totalDist += dirDist;
    const pct = dirSrc > 0 ? Math.round((1 - dirDist / dirSrc) * 100) : 0;
    console.log(`  ${(dir + "/").padEnd(28)} ${formatSize(dirSrc).padStart(8)} → ${formatSize(dirDist).padStart(8)}  (${pct > 0 ? "-" + pct + "%" : "same"})`);
  }

  const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
  const totalPct = Math.round((1 - totalDist / totalSrc) * 100);
  console.log(`\n  Total:${" ".repeat(21)} ${formatSize(totalSrc).padStart(8)} → ${formatSize(totalDist).padStart(8)}  (-${totalPct}%)`);
  console.log(`  Built in ${elapsed}s → dist/`);
}

main().catch(err => { console.error(err); process.exit(1); });
