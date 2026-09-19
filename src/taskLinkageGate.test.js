import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  createTaskDraft,
  normalizeStoredTasks,
  reconcileTasksWithCauses,
  sameTask,
  taskLinkSummary,
  taskOrigin,
} from "./experience/tasks/index.js";
import { tasksFromAnalysis } from "./experience/tasks/auditTasks.js";
import { reconcileAuditTasks } from "./auditTaskReconciliation.js";
import { taskChange, undoTaskChange } from "./productivity.js";

const linkedTask = (overrides = {}) => ({
  id: "task-1",
  title: "Correggi H1",
  client: "QA",
  sourceClientId: 1,
  priority: "Alta",
  due: "2026-09-25",
  status: "In corso",
  kind: "h1",
  sourceUrl: "https://example.com/pagina/",
  targetUrl: "",
  detail: "Un solo H1 richiesto",
  notes: "Nota utente da conservare",
  origin: "audit",
  automatic: true,
  taskLinks: { problemKey: "problem-1" },
  createdAt: "2026-09-17T12:00:00Z",
  ...overrides,
});

test("closing a linked problem completes the task without losing workflow fields and undo restores it", () => {
  const before = [linkedTask()];
  const result = reconcileTasksWithCauses(before, {
    problems: [{ key: "problem-1", problemState: "resolved" }],
    now: () => new Date("2026-09-17T15:00:00Z"),
  });
  assert.equal(result.changed, true);
  assert.equal(result.tasks[0].status, "Completato");
  assert.equal(result.tasks[0].priority, "Alta");
  assert.equal(result.tasks[0].due, "2026-09-25");
  assert.equal(result.tasks[0].notes, "Nota utente da conservare");
  assert.equal(result.tasks[0].causeReconciled, true);
  assert.match(result.tasks[0].completionReason, /^Causa SEO chiusa:/);
  const changes = taskChange(before, result.tasks);
  assert.deepEqual(undoTaskChange(result.tasks, changes), before);
});

test("a reappeared cause reopens only a task previously closed by cause reconciliation", () => {
  const closed = reconcileTasksWithCauses([linkedTask()], {
    problems: [{ key: "problem-1", problemState: "resolved" }],
    now: () => new Date("2026-09-17T15:00:00Z"),
  }).tasks;
  const reopened = reconcileTasksWithCauses(closed, {
    problems: [{ key: "problem-1", problemState: "reappeared" }],
    now: () => new Date("2026-09-18T08:00:00Z"),
  });
  assert.equal(reopened.tasks[0].status, "Da fare");
  assert.equal(reopened.tasks[0].causeReconciled, false);
  assert.equal(reopened.tasks[0].completedAt, "");

  const manuallyCompleted = linkedTask({ status: "Completato", completedAt: "2026-09-17T16:00:00Z", completionReason: "Chiuso dall'utente" });
  const untouched = reconcileTasksWithCauses([manuallyCompleted], {
    problems: [{ key: "problem-1", problemState: "reappeared" }],
  });
  assert.equal(untouched.changed, false);
  assert.equal(untouched.tasks[0].status, "Completato");
});

test("verified correction is sufficient to reconcile a linked task even if older audit evidence remains open", () => {
  const task = linkedTask({ taskLinks: { problemKey: "problem-1", correctionId: "correction-1" } });
  const result = reconcileTasksWithCauses([task], {
    problems: [{ key: "problem-1", problemState: "open" }],
    corrections: [{ id: "correction-1", status: "Verificato", writeConfirmed: true, completionGatePending: false }],
    now: () => new Date("2026-09-17T15:10:00Z"),
  });
  assert.equal(result.tasks[0].status, "Completato");
  assert.equal(result.tasks[0].causeResolution.type, "correction");
});

test("unverified correction alone does not close the task", () => {
  const task = linkedTask({ taskLinks: { correctionId: "correction-1" } });
  const result = reconcileTasksWithCauses([task], {
    corrections: [{ id: "correction-1", status: "Da verificare", writeConfirmed: true }],
  });
  assert.equal(result.changed, false);
  assert.equal(result.tasks[0].status, "In corso");
});

test("manual tasks without a linked cause are never completed by SEO reconciliation", () => {
  const manual = linkedTask({ id: "manual-1", origin: "manual", automatic: false, kind: "manual", taskLinks: {}, status: "Da fare" });
  const result = reconcileTasksWithCauses([manual], {
    problems: [{ key: "problem-1", problemState: "resolved" }],
    corrections: [{ id: "correction-1", status: "Verificato", writeConfirmed: true }],
  });
  assert.equal(result.changed, false);
  assert.equal(result.tasks[0].status, "Da fare");
  assert.equal(taskOrigin(result.tasks[0]), "manual");
  assert.equal(taskLinkSummary(result.tasks[0]).label, "Manuale");
});

test("tasks with the same canonical cause deduplicate even if title or kind changes", () => {
  const left = linkedTask({ title: "H1 mancante", kind: "h1" });
  const right = linkedTask({ id: "task-2", title: "Aggiungi intestazione principale", kind: "content" });
  assert.equal(sameTask(left, right), true);
});

test("task factory and persistence preserve origin and links", () => {
  const draft = createTaskDraft({
    title: "Ottimizza query",
    kind: "search",
    origin: "opportunity",
    automatic: true,
    taskLinks: { opportunityId: "seo-opportunity-query-yoga", opportunityKey: "query|yoga" },
  }, { client: { name: "QA" }, clientId: 1, now: () => new Date("2026-09-17T12:00:00Z"), idFactory: () => "opportunity-1" });
  const normalized = normalizeStoredTasks([draft]);
  assert.equal(normalized[0].origin, "opportunity");
  assert.equal(normalized[0].automatic, true);
  assert.equal(normalized[0].taskLinks.opportunityId, "seo-opportunity-query-yoga");
});

test("audit tasks are automatic and carry a stable problem link", () => {
  const analysis = {
    analyzedAt: "2026-09-17T12:00:00Z",
    url: "https://example.com/",
    issues: [{ type: "h1", label: "H1 mancante", severity: "alta", url: "https://example.com/pagina/", detail: "0 H1" }],
  };
  const [task] = tasksFromAnalysis(analysis, { id: 1, name: "QA", url: "https://example.com/" });
  assert.equal(task.origin, "audit");
  assert.equal(task.automatic, true);
  assert.ok(task.taskLinks.problemKey);
});

test("audit reconciliation backfills links but preserves correction link, notes and due date", () => {
  const previous = linkedTask({
    taskLinks: { problemKey: "problem-1", correctionId: "correction-1" },
    notes: "Non perdere",
    due: "2026-09-30",
  });
  const generated = linkedTask({ id: "fresh", taskLinks: { problemKey: "problem-1" }, notes: "", due: "Da pianificare" });
  const [next] = reconcileAuditTasks([previous], [generated], 1, "2026-09-18T10:00:00Z");
  assert.equal(next.id, previous.id);
  assert.equal(next.notes, "Non perdere");
  assert.equal(next.due, "2026-09-30");
  assert.equal(next.taskLinks.problemKey, "problem-1");
  assert.equal(next.taskLinks.correctionId, "correction-1");
});

test("Task UI exposes linkage while retaining status priority due and undo in the existing manager", async () => {
  const panel = await readFile(new URL("./TaskLinkagePanel.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  const entry = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
  assert.match(panel, /Gate riconciliazione attivo/);
  assert.match(panel, /Manuali/);
  assert.match(panel, /Automatici/);
  assert.match(panel, /Apri \{cause\.label\}/);
  assert.match(panel, /task\.priority/);
  assert.match(panel, /task\.due/);
  assert.match(app, /undoTaskChange/);
  assert.match(app, /status/);
  assert.match(app, /priority/);
  assert.match(app, /due/);
  assert.match(entry, /taskCauseReconciliation/);
  assert.match(entry, /TaskLinkagePanel/);
});


test("una task legacy analysis-* resta audit anche se una vecchia migrazione l'ha marcata manuale", () => {
  const legacy = linkedTask({
    id: "analysis-1-2026-09-05T10:00:00Z-0",
    kind: "h1",
    origin: "manual",
    automatic: false,
    taskLinks: {},
  });
  assert.equal(taskOrigin(legacy), "audit");
  const [normalized] = normalizeStoredTasks([legacy]);
  assert.equal(normalized.origin, "audit");
  assert.equal(normalized.automatic, true);
});
