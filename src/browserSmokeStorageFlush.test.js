import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../scripts/browser-smoke.mjs", import.meta.url), "utf8");

test("browser QA flushes workspace writes before forcing a CDP reload", () => {
  const reload = source.match(/async function reload\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(reload, /flushWorkspace\(\)/);
  assert.ok(reload.indexOf("flushWorkspace()") < reload.indexOf('command("Page.reload"'), "flush must complete before Page.reload");
});
