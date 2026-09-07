import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = (name) => readFile(new URL(`../scripts/${name}`, import.meta.url), "utf8");
const scripts = await Promise.all([
  load("wordpress-rankmath-cache-coherence-preflight.mjs"),
  load("wordpress-rankmath-public-cache-purge-preflight.mjs"),
]);

test("i preflight Rank Math autenticati usano il trasporto HTTPS pinned", () => {
  for (const source of scripts) {
    assert.match(source, /import \{ pinnedHttpsFetch \} from "\.\.\/server\/pinnedHttpsFetch\.js"/);
    assert.match(source, /await pinnedHttpsFetch\(endpoint,/);
    assert.doesNotMatch(source, /await fetch\(endpoint,/);
  }
});
