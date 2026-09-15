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

test("Google integration business logic belongs to System and legacy file is only a shim", async () => {
  const implementation = await readFile(new URL("./system/integrations/googleProperties.js", import.meta.url), "utf8");
  await assert.rejects(readFile(new URL("./googleProperties.js", import.meta.url), "utf8"), (error) => error?.code === "ENOENT");

  assert.match(implementation, /export function mergeGoogleStatus/);
  assert.match(implementation, /export function normalizeGoogleProperties/);
});

test("nessun nuovo consumer di produzione importa direttamente lo shim Google legacy", async () => {
  const importers = [];
  const pattern = /from\s+["']\.\/googleProperties\.js["']/;
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "googleProperties.js" || normalized.startsWith("system/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  assert.deepEqual(importers.sort(), []);
});
