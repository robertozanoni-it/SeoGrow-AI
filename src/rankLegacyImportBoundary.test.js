import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

const directImporters = async (symbol, legacyModule) => {
  const importers = [];
  const pattern = new RegExp(
    `import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from\\s*["'][^"']*\\/${legacyModule}(?:\\.js)?["']`,
    "s",
  );
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "modules/rank/index.js") continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  return importers.sort();
};

test("nessun nuovo consumer di produzione aggira il boundary Rank", async () => {
  assert.deepEqual(
    await directImporters("opportunityGroups", "platform"),
    ["App.jsx", "CardWorkspaceLayer.jsx", "GuidedUxLayer.jsx"],
  );
  assert.deepEqual(await directImporters("queryChanges", "platform"), ["App.jsx"]);
  assert.deepEqual(await directImporters("queryTaskDetail", "platform"), ["App.jsx"]);
  assert.deepEqual(await directImporters("opportunityQueries", "gscImport"), ["App.jsx"]);
  assert.deepEqual(
    await directImporters("suggestPageForQuery", "seoHelpers"),
    ["App.jsx", "opportunityTasks.js"],
  );
  assert.deepEqual(await directImporters("opportunityTask", "opportunityTasks"), ["App.jsx"]);
  assert.deepEqual(await directImporters("findExistingTask", "opportunityTasks"), ["App.jsx"]);
});
