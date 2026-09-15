import test from "node:test";
import assert from "node:assert/strict";
import { loadProjectProblemSummary } from "./projectProblemSummary.js";

test("invalid project ids yield an empty problem summary", async () => {
  assert.deepEqual(await loadProjectProblemSummary({ clientId: 0 }), { active: 0, high: 0, verify: 0, resolved: 0, verifiedCorrections: 0 });
});
