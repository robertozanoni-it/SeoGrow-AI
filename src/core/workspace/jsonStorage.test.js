import test from "node:test";
import assert from "node:assert/strict";
import { readWorkspaceJson, writeWorkspaceJson } from "./jsonStorage.js";

test("workspace json helpers normalize malformed and valid values", () => {
  const values = new Map();
  const storage = { getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value) };
  assert.deepEqual(readWorkspaceJson("missing", { ok:true }, storage), { ok:true });
  values.set("bad", "{");
  assert.deepEqual(readWorkspaceJson("bad", [], storage), []);
  writeWorkspaceJson("good", { value:3 }, storage);
  assert.deepEqual(readWorkspaceJson("good", null, storage), { value:3 });
});
