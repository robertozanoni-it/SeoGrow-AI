import test from "node:test";
import assert from "node:assert/strict";
import { createTaskDraft } from "./taskFactory.js";

test("task factory produces project-scoped normalized tasks", () => {
  const task = createTaskDraft({ title:"  GEO gap  ", priority:"Urgente", targetUrl:"https://example.com/a", query:"q" }, { client:{name:"Demo"}, clientId:7, now:()=>new Date("2026-09-15T12:00:00Z"), idFactory:()=>"t1" });
  assert.equal(task.id, "t1");
  assert.equal(task.title, "GEO gap");
  assert.equal(task.priority, "Media");
  assert.equal(task.sourceClientId, 7);
  assert.equal(task.client, "Demo");
  assert.equal(task.linkLabel, "Apri risorsa");
  assert.equal(task.createdAt, "2026-09-15T12:00:00.000Z");
});

test("task factory refuses unscoped tasks", () => {
  assert.throws(() => createTaskDraft({ title:"x" }, { clientId:null }), /Cliente task/);
  assert.throws(() => createTaskDraft({}, { clientId:1 }), /titolo/);
});
