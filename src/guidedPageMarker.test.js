import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("il marker pagina globale viene applicato prima del paint e cleanup vecchi non cancellano quello nuovo", async () => {
  const source = await readFile(new URL("./GuidedUxLayer.jsx", import.meta.url), "utf8");
  assert.match(source, /useLayoutEffect\(\(\) => \{/);
  assert.match(source, /const slug = pageSlug\(page\)/);
  assert.match(source, /dataset\.seogrowPage === slug/);
  assert.match(source, /dataset\.seogrowUiMode === mode/);
});
