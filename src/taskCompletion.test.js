import test from "node:test";
import assert from "node:assert/strict";
import { completeTaskById } from "./taskCompletion.js";

test("verified workflow closes only the originating task", () => {
  const input = [{ id:"a", status:"Da fare" }, { id:"b", status:"In corso" }];
  const result = completeTaskById(input, "b", "Bozza WordPress creata", { completedAt:"2026-09-15T18:00:00Z", url:"https://example.com/edit" });
  assert.equal(result.changed, true);
  assert.equal(result.tasks[0].status, "Da fare");
  assert.equal(result.tasks[1].status, "Completato");
  assert.equal(result.tasks[1].workflowUrl, "https://example.com/edit");
});

test("completion is idempotent and ignores missing task ids", () => {
  const input = [{ id:"a", status:"Completato", completedAt:"x" }];
  assert.equal(completeTaskById(input, "a", "again").changed, false);
  assert.equal(completeTaskById(input, "missing", "none").tasks, input);
});
