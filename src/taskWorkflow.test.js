import test from "node:test";
import assert from "node:assert/strict";
import { taskWorkflowContext, taskWorkflowTarget } from "./taskWorkflow.js";

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
