import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("QA dimostra i reload con un nuovo timeOrigin invece di proprietà window transitorie", async () => {
  const browser = await readFile(new URL("../scripts/browser-smoke.mjs", import.meta.url), "utf8");
  const fields = await readFile(new URL("../scripts/qa-remaining-fields.mjs", import.meta.url), "utf8");
  assert.match(browser, /performance\.timeOrigin !==/);
  assert.doesNotMatch(browser, /__qaOldDocument/);
  assert.match(fields, /beforeRestoreTimeOrigin/);
  assert.match(fields, /performance\.timeOrigin !==/);
  assert.doesNotMatch(fields, /__qaBeforeRestore/);
});
