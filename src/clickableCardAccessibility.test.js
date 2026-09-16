import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("card cliente cliccabile è raggiungibile e attivabile da tastiera", async () => {
  const source = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(source, /reference-client-card client-card[^>]+role="button"[^>]+tabIndex=\{0\}/);
  assert.match(source, /aria-label=\{`Apri progetto \$\{c\.name\}`\}/);
  assert.match(source, /onKeyDown=\{\(event\) => \{ if \(event\.target === event\.currentTarget\) openClient/);
});

test("card problema cliccabile è raggiungibile e attivabile da tastiera", async () => {
  const source = await readFile(new URL("./ProblemsWorkspace.jsx", import.meta.url), "utf8");
  assert.match(source, /data-problem-navigation="direct"[^>]+role="button"[^>]+tabIndex=\{batchBusy \? -1 : 0\}/);
  assert.match(source, /aria-label=\{`Apri problema \$\{problem\.title\}`\}/);
  assert.match(source, /\["Enter", " "\]\.includes\(event\.key\)/);
});
