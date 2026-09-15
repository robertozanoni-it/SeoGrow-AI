import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  clientForCard,
  selectCardClient,
} from "./experience/hub/index.js";
import {
  clientForCard as legacyClientForCard,
  selectCardClient as legacySelectCardClient,
} from "./experience/hub/index.js";

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

test("Hub owns client-card project selection while legacy exports remain identical", async () => {
  assert.equal(clientForCard, legacyClientForCard);
  assert.equal(selectCardClient, legacySelectCardClient);

  const clients = [
    { id: 4, name: "Quattro" },
    { id: "5", name: "Cinque" },
  ];
  assert.equal(clientForCard(clients, "4")?.name, "Quattro");
  assert.equal(clientForCard(clients, 5)?.name, "Cinque");
  assert.equal(clientForCard(clients, ""), null);
  assert.equal(clientForCard(null, 4), null);

  const facade = await readFile(new URL("./experience/hub/index.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./experience/hub/clientCardNavigation.js", import.meta.url), "utf8");
  await assert.rejects(readFile(new URL("./clientCardNavigation.js", import.meta.url), "utf8"), (error) => error?.code === "ENOENT");

  assert.match(facade, /from ["']\.\/clientCardNavigation\.js["']/);
  assert.match(owner, /function clientForCard/);
  assert.match(owner, /function selectCardClient/);
  assert.match(owner, /seogrow-selected-client-v1/);
});

test("nessun nuovo consumer di produzione importa lo shim clientCardNavigation", async () => {
  const importers = [];
  const pattern = /from\s+["'][^"']*clientCardNavigation\.js["']/;
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "clientCardNavigation.js" || normalized.startsWith("experience/hub/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  assert.deepEqual(importers.sort(), []);
});
