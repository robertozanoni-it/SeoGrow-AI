import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../scripts/browser-smoke.mjs", import.meta.url), "utf8");

test("browser QA gives debounced workspace writes time to settle before forced reload", () => {
  const reload = source.match(/async function reload\(\) \{[\s\S]*?\n\}/)?.[0] || "";
  assert.match(reload, /await sleep\(350\)/);
  assert.doesNotMatch(reload, /flushWorkspace\(\)/);
  assert.ok(reload.indexOf("sleep(350)") < reload.indexOf('command("Page.reload"'), "settle delay must complete before Page.reload");
});
