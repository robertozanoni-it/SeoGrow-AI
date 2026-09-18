import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");

test("Link interni opens an existing equivalent task instead of creating a duplicate", () => {
  const start = app.indexOf("function InternalLinksPage(");
  const end = app.indexOf("\nfunction Logo()", start);
  const page = app.slice(start, end);
  assert.match(page, /findExistingTask\(tasks, values, clientId\)/);
  assert.match(page, /onOpenTask\?\.\(existing\.id\)/);
  assert.match(page, /createOrOpenTask\(\{ title:`Inserisci link interno/);
  assert.match(page, /createOrOpenTask\(\{ title:`Correggi link interrotto/);
  const render = app.slice(app.indexOf('if (page === "Link interni")'), app.indexOf('if (page === "Opportunità")'));
  assert.match(render, /tasks=\{selectedTasks\}/);
  assert.match(render, /clientId=\{selectedClient\}/);
  assert.match(render, /onOpenTask=/);
});
