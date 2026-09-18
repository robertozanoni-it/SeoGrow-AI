import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = [
  "gdprSeoMigration.js",
  "masterQaHarness.js",
  "masterQaV2Checks.js",
];

test("runtime and QA consumers use the canonical workspace JSON reader", async () => {
  for (const file of files) {
    const source = await readFile(new URL(`./${file}`, import.meta.url), "utf8");
    assert.match(source, /readWorkspaceJson/);
    assert.doesNotMatch(source, /\bconst\s+readJson\s*=/);
  }
});

test("GDPR migration uses the canonical JSON writer for workspace payloads", async () => {
  const source = await readFile(new URL("./gdprSeoMigration.js", import.meta.url), "utf8");
  assert.match(source, /writeWorkspaceJson/);
  assert.doesNotMatch(source, /\bconst\s+writeJson\s*=/);
  assert.match(source, /localStorage\.setItem\(MIGRATION_KEY, "done"\)/);
});
