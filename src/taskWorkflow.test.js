import test from "node:test";
import assert from "node:assert/strict";
import { consumeTaskWorkflowContext, taskWorkflowContext, taskWorkflowTarget, writeTaskWorkflowContext } from "./taskWorkflow.js";

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
