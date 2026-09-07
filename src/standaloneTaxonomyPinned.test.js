import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const diagnostics = await readFile(new URL("../scripts/wordpress-taxonomy-diagnostics.mjs", import.meta.url), "utf8");
const sampler = await readFile(new URL("../scripts/wordpress-taxonomy-consistency-sampler.mjs", import.meta.url), "utf8");

for (const [name, source] of [["taxonomy diagnostics", diagnostics], ["taxonomy consistency sampler", sampler]]) {
  test(`${name} usa il transport pinned per il Connector autenticato`, () => {
    assert.match(source, /import \{ pinnedHttpsFetch \} from "\.\.\/server\/pinnedHttpsFetch\.js"/);
    assert.match(source, /pinnedHttpsFetch\(endpoint,/);
    assert.doesNotMatch(source, /fetch\(endpoint,\s*\{\s*headers:\s*\{\s*authorization:/s);
  });
}
