import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { downloadCsv } from "./core/export/index.js";
import { downloadCsv as legacyDownloadCsv } from "./platform.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

async function sourceFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path.join(directory, entry.name), relative));
    else if (/\.(?:js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) files.push(relative);
  }
  return files;
}

test("Core owns CSV download while platform compatibility stays identical", () => {
  assert.equal(downloadCsv, legacyDownloadCsv);
  assert.equal(downloadCsv([], "empty.csv"), undefined);
});

test("Core CSV export preserves spreadsheet-injection and browser-download safeguards", async () => {
  const owner = await readFile(new URL("./core/export/csv.js", import.meta.url), "utf8");
  const api = await readFile(new URL("./core/export/index.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("./platform.js", import.meta.url), "utf8");

  assert.match(api, /from ["']\.\/csv\.js["']/);
  assert.match(owner, /\^\[=\+\\-@\]/);
  assert.match(owner, /\\uFEFF/);
  assert.match(owner, /document\.createElement\(["']a["']\)/);
  assert.match(owner, /URL\.revokeObjectURL/);
  assert.doesNotMatch(platform, /export function downloadCsv/);
  assert.match(platform, /core\/export\/index\.js/);
});

test("platform is a compatibility aggregator without owned function implementations", async () => {
  const platform = await readFile(new URL("./platform.js", import.meta.url), "utf8");
  assert.doesNotMatch(platform, /\b(?:export\s+)?function\s+/);
  assert.doesNotMatch(platform, /\bconst\s+\w+\s*=\s*\([^)]*\)\s*=>/);
});

test("nessun nuovo consumer di produzione importa downloadCsv da platform", async () => {
  const importers = [];
  const pattern = /import\s*\{[\s\S]*?\bdownloadCsv\b[\s\S]*?\}\s*from\s*["'][^"']*\/platform(?:\.js)?["']/;
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "platform.js" || normalized.startsWith("core/export/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  assert.deepEqual(importers.sort(), ["App.jsx", "GeoPage.jsx"]);
});
