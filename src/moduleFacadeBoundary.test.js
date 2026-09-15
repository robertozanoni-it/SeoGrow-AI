import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GeoPage } from "./modules/geo/index.js";
import { AgentPage, agentModuleTools } from "./intelligence/agent/index.js";

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

const directImporters = async (target) => {
  const importers = [];
  const pattern = new RegExp(`from\\s+["']\\.\\/${target}(?:\\.jsx)?["']`);
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === `${target}.jsx`) continue;
    if (normalized === `modules/geo/index.js` || normalized === `intelligence/agent/index.js`) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  return importers;
};

test("GEO e Agent espongono facade pubbliche utilizzabili", () => {
  assert.equal(typeof GeoPage, "function");
  assert.equal(typeof AgentPage, "function");
  assert.ok(Array.isArray(agentModuleTools()));
});

test("nessun nuovo consumer aggira la facade GEO", async () => {
  assert.deepEqual(await directImporters("GeoPage"), ["App.jsx"]);
});

test("nessun nuovo consumer aggira la facade Agent", async () => {
  assert.deepEqual(await directImporters("AgentPage"), ["App.jsx"]);
});
