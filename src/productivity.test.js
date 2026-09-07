import test from "node:test";
import assert from "node:assert/strict";
import { taskChange, undoTaskChange, savedViews } from "./productivity.js";
test("task undo restores edit/create/delete while preserving unrelated new work", () => {
  const before = [{ id: "a", title: "A" }, { id: "b", title: "B" }];
  const after = [{ id: "a", title: "Edited" }, { id: "c", title: "New" }];
  assert.deepEqual(undoTaskChange([...after, { id: "other-project" }], taskChange(before, after)), [...before, { id: "other-project" }]);
  assert.deepEqual(taskChange(before, before), []);
});
test("task undo fails closed after concurrent changes or duplicate IDs", () => {
  const changes = taskChange([{ id: "a", status: "old" }], [{ id: "a", status: "new" }]);
  assert.throws(() => undoTaskChange([{ id: "a", status: "external" }], changes));
  assert.throws(() => undoTaskChange([{ id: "a", status: "new" }, { id: "a", status: "new" }], changes));
});
test("restored views reject malformed data", () => {
  assert.deepEqual(savedViews({}), []);
  assert.equal(savedViews([null, { id: "a", name: "Work", filters: {} }]).length, 1);
});
