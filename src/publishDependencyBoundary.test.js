import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
const ALLOWED_LEGACY_IMPORTERS = new Set([
  "WordPressLiveRemediationControlV2.jsx",
  "batchRemediationRuntime.js",
]);

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

test("nessun nuovo consumer aggira la facade Publish", async () => {
  const importers = [];
  for (const relative of await sourceFiles(srcRoot)) {
    if (relative === "wordpressRemediationEngine.js" || relative === path.join("modules", "publish", "index.js")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (/from\s+["']\.\/wordpressRemediationEngine\.js["']/.test(source)) importers.push(relative);
  }
  assert.deepEqual(new Set(importers), ALLOWED_LEGACY_IMPORTERS);
});
