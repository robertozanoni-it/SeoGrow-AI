import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("./AuditWorkspace.css", import.meta.url), "utf8");

test("Audit SEO does not hide the card-first and guided enhancement hosts", () => {
  const firstRule = css.split("\n")[0];
  assert.match(firstRule, /audit-workspace-active/);
  assert.match(firstRule, /:not\(\.card-workspace-host\)/);
  assert.match(firstRule, /:not\(\.guided-page-wizard-host\)/);
  assert.match(firstRule, /:not\(\.guided-page-help-host\)/);
  assert.match(firstRule, /:not\(\.wizard-context-host\)/);
  assert.match(firstRule, /display:\s*none\s*!important/);
});
