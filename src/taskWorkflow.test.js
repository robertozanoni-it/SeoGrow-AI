import test from "node:test";
import assert from "node:assert/strict";
import { TASK_CORRECTIONS_CONTEXT_KEY, consumeCorrectionsWorkflowContext, consumeTaskWorkflowContext, taskWorkflowContext, taskWorkflowTarget, writeCorrectionsWorkflowContext, writeTaskWorkflowContext } from "./taskWorkflow.js";

test("content and search tasks continue in the editorial workflow", () => {
  assert.equal(taskWorkflowTarget({ kind: "search", title: "Ottimizza query" }).page, "Piano editoriale");
  assert.equal(taskWorkflowTarget({ kind: "manual", title: "Scrivi articolo pilastro" }).page, "Piano editoriale");
});

test("technical tasks continue in corrections while generic tasks stay neutral", () => {
  assert.equal(taskWorkflowTarget({ kind: "broken-link" }).page, "Correzioni");
  assert.equal(taskWorkflowTarget({ title: "Correggi canonical" }).page, "Correzioni");
  assert.equal(taskWorkflowTarget({ title: "Telefonare al cliente" }), null);
});

test("workflow context preserves task provenance", () => {
  assert.deepEqual(taskWorkflowContext({ id: "t1", kind: "search", sourceUrl: "https://a.test/p", query: "seo" }), { taskId: "t1", sourceUrl: "https://a.test/p", targetUrl: "", query: "seo", title: "", kind: "search" });
});


test("workflow context can be handed off once between modules", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  writeTaskWorkflowContext(storage, { id: "t2", query: "seo locale", sourceUrl: "https://a.test/seo" });
  const context = consumeTaskWorkflowContext(storage);
  assert.equal(context.taskId, "t2");
  assert.equal(context.query, "seo locale");
  assert.equal(consumeTaskWorkflowContext(storage), null);
});


test("corrections handoff is isolated from editorial handoff", () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  writeCorrectionsWorkflowContext(storage, { id: "fix-1", title: "Correggi canonical", sourceUrl: "https://a.test/p" });
  assert.equal(consumeTaskWorkflowContext(storage), null);
  assert.equal(consumeCorrectionsWorkflowContext(storage).taskId, "fix-1");
});

test("corrections handoff can be consumed synchronously from the workspace adapter contract", () => {
  const data = new Map();
  const workspaceLike = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
  writeCorrectionsWorkflowContext(workspaceLike, { id: "sync-fix", title: "Correggi canonical sync", sourceUrl: "https://example.test/fix/" });
  const context = consumeCorrectionsWorkflowContext(workspaceLike);
  assert.equal(context.taskId, "sync-fix");
  assert.equal(context.sourceUrl, "https://example.test/fix/");
  assert.equal(workspaceLike.getItem(TASK_CORRECTIONS_CONTEXT_KEY), null);
});
