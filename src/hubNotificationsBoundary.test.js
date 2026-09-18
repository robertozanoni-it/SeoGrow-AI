import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildNotifications } from "./experience/hub/index.js";
import { buildNotifications as legacyBuildNotifications } from "./platform.js";

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

test("Hub owns overview notifications while platform compatibility stays identical", () => {
  assert.equal(buildNotifications, legacyBuildNotifications);

  const previousDataset = {
    dateFrom: "2026-01-01",
    dateTo: "2026-01-28",
    totals: { clicks: 100, impressions: 100, ctr: 10, position: 8 },
  };
  const dataset = {
    dateFrom: "2026-02-01",
    dateTo: "2026-02-28",
    totals: { clicks: 80, impressions: 130, ctr: 8, position: 7 },
  };
  const notifications = buildNotifications({
    tasks: [{ status: "Da fare", due: "2000-01-01" }],
    dataset,
    previousDataset,
    analysis: { newIssues: [{ id: 1 }, { id: 2 }], resolvedIssues: [{ id: 3 }] },
  });

  assert.deepEqual(notifications.map((item) => item.title), [
    "1 task scadute",
    "Clic organici in calo del 20.0%",
    "Impressioni organiche in crescita del 30.0%",
    "2 nuovi problemi tecnici",
    "1 problemi risolti",
  ]);
  assert.equal(notifications.find((item) => item.title.includes("Clic organici"))?.page, "Opportunità");
  assert.ok(notifications.find((item) => item.title.includes("Clic organici"))?.taskDraft);
  assert.equal(notifications.find((item) => item.title.includes("nuovi problemi"))?.page, "Problemi");

});

test("Hub notification ownership uses the pure Rank data boundary", async () => {
  const facade = await readFile(new URL("./experience/hub/index.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./experience/hub/notifications.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("./platform.js", import.meta.url), "utf8");

  assert.match(facade, /from ["']\.\/notifications\.js["']/);
  assert.match(owner, /export function buildNotifications/);
  assert.match(owner, /\.\.\/\.\.\/modules\/rank\/data\.js/);
  assert.doesNotMatch(owner, /platform\.js/);
  assert.doesNotMatch(platform, /export function buildNotifications/);
  assert.match(platform, /experience\/hub\/notifications\.js/);
});

test("nessun nuovo consumer di produzione importa buildNotifications da platform", async () => {
  const importers = [];
  const pattern = /import\s*\{[\s\S]*?\bbuildNotifications\b[\s\S]*?\}\s*from\s*["'][^"']*\/platform(?:\.js)?["']/;
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "platform.js" || normalized.startsWith("experience/hub/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  assert.deepEqual(importers.sort(), ["App.jsx"]);
});
