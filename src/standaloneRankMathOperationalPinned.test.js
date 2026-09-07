import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

for (const [name, count] of [["doctor", 2], ["doctor-convergence", 2], ["general-e2e", 1]]) {
  test(`Rank Math ${name}: authenticated REST stays pinned, local/public reads stay separate`, async () => {
    const source = await readFile(new URL(`../scripts/wordpress-rankmath-${name}.mjs`, import.meta.url), "utf8");
    assert.match(source, /import \{ pinnedHttpsFetch \} from "\.\.\/server\/pinnedHttpsFetch\.js"/);
    assert.equal([...source.matchAll(/await pinnedHttpsFetch\(endpoint,/g)].length, count);
    assert.doesNotMatch(source, /\bfetch\(endpoint,/);
    assert.match(source, /fetch\(`\$\{appUrl\}\/api\/wordpress\/inspect-taxonomy/);
    assert.match(source, /fetch\(target,/);
  });
}

test("Rank Math global: authenticated inventory selects pinned transport only", async () => {
  const source = await readFile(new URL("../scripts/wordpress-rankmath-global.mjs", import.meta.url), "utf8");
  assert.match(source, /await \(authenticated \? pinnedHttpsFetch : fetch\)\(url,/);
  assert.doesNotMatch(source, /await fetch\(url,/);
  assert.match(source, /fetchPublic\(url, siteOrigin, transport = fetch\)/);
  assert.match(source, /authenticated \? \{authorization:auth\} : \{\}/);
});
