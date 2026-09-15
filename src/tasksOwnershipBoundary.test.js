import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  sameTask,
  archiveDuplicateTasks,
  normalizeStoredTasks,
  tasksFromAnalysis,
} from "./experience/tasks/index.js";
import {
  normalizeStoredTasks as platformNormalizeStoredTasks,
  tasksFromAnalysis as platformTasksFromAnalysis,
} from "./platform.js";

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
    if (normalized.startsWith("experience/tasks/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  return importers.sort();
}

test("Tasks owns task business logic and public compatibility routes stay equivalent", async () => {
  assert.equal(normalizeStoredTasks, platformNormalizeStoredTasks);
  assert.equal(tasksFromAnalysis, platformTasksFromAnalysis);

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

  const normalized = normalizeStoredTasks([{ id: " t1 ", title: " Task ", priority: "Urgente" }]);
  assert.equal(normalized[0].id, "t1");
  assert.equal(normalized[0].priority, "Media");
  assert.equal(normalized[0].status, "Da fare");

  const generated = tasksFromAnalysis(
    { analyzedAt: "2026-09-15T00:00:00.000Z", issues: [{ label: "Title mancante", severity: "alta", type: "title", url: "https://example.com/" }] },
    { id: 4, name: "Cliente", url: "https://example.com/" },
  );
  assert.equal(generated.length, 1);
  assert.equal(generated[0].priority, "Alta");
  assert.equal(generated[0].sourceClientId, 4);

  const facade = await readFile(new URL("./experience/tasks/index.js", import.meta.url), "utf8");
  const duplicateOwner = await readFile(new URL("./experience/tasks/taskDuplicates.js", import.meta.url), "utf8");
  const scopeOwner = await readFile(new URL("./experience/tasks/taskScope.js", import.meta.url), "utf8");
  const reviewOwner = await readFile(new URL("./experience/tasks/taskReview.js", import.meta.url), "utf8");
  const persistenceOwner = await readFile(new URL("./experience/tasks/taskPersistence.js", import.meta.url), "utf8");
  const auditOwner = await readFile(new URL("./experience/tasks/auditTasks.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("./platform.js", import.meta.url), "utf8");

  assert.match(facade, /from ["']\.\/taskDuplicates\.js["']/);
  assert.match(facade, /from ["']\.\/taskScope\.js["']/);
  assert.match(facade, /from ["']\.\/taskReview\.js["']/);
  assert.match(facade, /from ["']\.\/taskPersistence\.js["']/);
  assert.match(facade, /from ["']\.\/auditTasks\.js["']/);
  assert.match(duplicateOwner, /function archiveDuplicateTasks/);
  assert.match(scopeOwner, /function archiveLegalSeoTasks/);
  assert.match(reviewOwner, /function completeVerifiedCanonicals/);
  assert.match(persistenceOwner, /function normalizeStoredTasks/);
  assert.match(auditOwner, /function tasksFromAnalysis/);
  assert.doesNotMatch(platform, /function normalizeStoredTasks/);
  assert.doesNotMatch(platform, /function tasksFromAnalysis/);
  assert.match(platform, /experience\/tasks\/taskPersistence\.js/);
  assert.match(platform, /experience\/tasks\/auditTasks\.js/);

  for (const legacyFile of ["taskDuplicates.js", "taskScope.js", "taskReview.js"]) {
    await assert.rejects(
      readFile(new URL(`./${legacyFile}`, import.meta.url), "utf8"),
      (error) => error?.code === "ENOENT",
    );
  }
});

test("nessun consumer di produzione importa gli shim Tasks rimossi", async () => {
  assert.deepEqual(await legacyImporters("taskDuplicates.js"), []);
  assert.deepEqual(await legacyImporters("taskScope.js"), []);
  assert.deepEqual(await legacyImporters("taskReview.js"), []);
});
