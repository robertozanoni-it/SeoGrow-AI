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

test("WordPress transient credentials belong to System and legacy file is only a shim", async () => {
  const implementation = await readFile(new URL("./system/integrations/wordpressSession.js", import.meta.url), "utf8");
  const legacyShim = await readFile(new URL("./wordpressSession.js", import.meta.url), "utf8");

  assert.match(implementation, /const sessions = new Map\(\)/);
  assert.match(implementation, /30 \* 60_000/);
  assert.doesNotMatch(implementation, /localStorage|workspaceStorage|WORKSPACE_KEYS|indexedDB/i);
  assert.doesNotMatch(legacyShim, /new Map\(\)/);
  assert.match(legacyShim, /from ["']\.\/system\/integrations\/wordpressSession\.js["']/);
});

test("nessun nuovo consumer production importa direttamente lo shim WordPress session", async () => {
  const importers = [];
  const pattern = /from\s+["']\.\/wordpressSession(?:\.js)?["']/;
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "wordpressSession.js" || normalized.startsWith("system/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  assert.deepEqual(importers.sort(), ["App.jsx", "BatchRemediationPanel.jsx", "WordPressConnectionControl.jsx"]);
});
