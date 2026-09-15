import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sameTask,
  archiveDuplicateTasks,
  isLegalSeoTask,
  archiveLegalSeoTasks,
  missingCanonicalTask,
  activeClientTasks,
  completeVerifiedCanonicals,
} from "./experience/tasks/index.js";
import {
  sameTask as legacySameTask,
  archiveDuplicateTasks as legacyArchiveDuplicateTasks,
} from "./taskDuplicates.js";
import {
  isLegalSeoTask as legacyIsLegalSeoTask,
  archiveLegalSeoTasks as legacyArchiveLegalSeoTasks,
} from "./taskScope.js";
import {
  missingCanonicalTask as legacyMissingCanonicalTask,
  activeClientTasks as legacyActiveClientTasks,
  completeVerifiedCanonicals as legacyCompleteVerifiedCanonicals,
} from "./taskReview.js";

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

async function legacyImporters(fileName) {
  const importers = [];
  const pattern = new RegExp(`from\\s+["'][^"']*${fileName.replace(".", "\\.")}["']`);
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === fileName || normalized.startsWith("experience/tasks/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  return importers.sort();
}

test("Tasks owns task business logic while legacy exports remain identical", async () => {
  assert.equal(sameTask, legacySameTask);
  assert.equal(archiveDuplicateTasks, legacyArchiveDuplicateTasks);
  assert.equal(isLegalSeoTask, legacyIsLegalSeoTask);
  assert.equal(archiveLegalSeoTasks, legacyArchiveLegalSeoTasks);
  assert.equal(missingCanonicalTask, legacyMissingCanonicalTask);
  assert.equal(activeClientTasks, legacyActiveClientTasks);
  assert.equal(completeVerifiedCanonicals, legacyCompleteVerifiedCanonicals);

  assert.equal(sameTask(
    { kind: "search", query: "SEO Audit" },
    { kind: "search", query: "seo audit" },
  ), true);

  const tasks = [
    { id: "keep", sourceClientId: 4, kind: "search", query: "seo audit", title: "A", status: "In corso" },
    { id: "duplicate", sourceClientId: 4, kind: "search", query: "SEO Audit", title: "B", status: "Da fare" },
  ];
  const deduped = archiveDuplicateTasks(tasks, 4);
  assert.equal(deduped[0], tasks[0]);
  assert.equal(deduped[1].stale, true);
  assert.equal(deduped[1].duplicateOf, "keep");

  const active = activeClientTasks([
    { sourceClientId: 4, status: "Da fare", stale: false },
    { sourceClientId: 4, status: "Completato", stale: false },
    { sourceClientId: 5, status: "Da fare", stale: false },
  ], 4);
  assert.equal(active.length, 1);
  assert.equal(missingCanonicalTask({ kind: "canonical", title: "Canonical non rilevata" }), true);

  const facade = await readFile(new URL("./experience/tasks/index.js", import.meta.url), "utf8");
  const duplicateOwner = await readFile(new URL("./experience/tasks/taskDuplicates.js", import.meta.url), "utf8");
  const scopeOwner = await readFile(new URL("./experience/tasks/taskScope.js", import.meta.url), "utf8");
  const reviewOwner = await readFile(new URL("./experience/tasks/taskReview.js", import.meta.url), "utf8");
  const duplicateShim = await readFile(new URL("./taskDuplicates.js", import.meta.url), "utf8");
  const scopeShim = await readFile(new URL("./taskScope.js", import.meta.url), "utf8");
  const reviewShim = await readFile(new URL("./taskReview.js", import.meta.url), "utf8");

  assert.match(facade, /from ["']\.\/taskDuplicates\.js["']/);
  assert.match(facade, /from ["']\.\/taskScope\.js["']/);
  assert.match(facade, /from ["']\.\/taskReview\.js["']/);
  assert.match(duplicateOwner, /function archiveDuplicateTasks/);
  assert.match(scopeOwner, /function archiveLegalSeoTasks/);
  assert.match(reviewOwner, /function completeVerifiedCanonicals/);
  assert.doesNotMatch(duplicateShim, /function archiveDuplicateTasks/);
  assert.doesNotMatch(scopeShim, /function archiveLegalSeoTasks/);
  assert.doesNotMatch(reviewShim, /function completeVerifiedCanonicals/);
  assert.match(duplicateShim, /experience\/tasks\/taskDuplicates\.js/);
  assert.match(scopeShim, /experience\/tasks\/taskScope\.js/);
  assert.match(reviewShim, /experience\/tasks\/taskReview\.js/);
});

test("nessun nuovo consumer di produzione importa direttamente gli shim Tasks", async () => {
  assert.deepEqual(await legacyImporters("taskDuplicates.js"), [
    "TaskCleanup.jsx",
    "modules/rank/opportunityTasks.js",
  ]);
  assert.deepEqual(await legacyImporters("taskScope.js"), [
    "auditTaskReconciliation.js",
    "platform.js",
  ]);
  assert.deepEqual(await legacyImporters("taskReview.js"), [
    "TaskCleanup.jsx",
  ]);
});
