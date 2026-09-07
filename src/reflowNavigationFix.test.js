import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("./reflowNavigationFix.css", import.meta.url), "utf8");
const appMain = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");

test("zoom reflow keeps the off-canvas navigation reachable through 760px", () => {
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /\.mobile-only\s*\{\s*display:\s*grid\s*!important/);
  assert.match(css, /\.sidebar\.open[\s\S]*transform:\s*translateX\(0\)\s*!important/);
  assert.match(css, /html body\[data-seogrow-ui-mode\] \.workspace[\s\S]*margin-left:\s*0\s*!important/);
});

test("reflow guard is loaded after the older responsive rules and menu remains keyboard-labelled", () => {
  assert.match(appMain, /responsiveIntegrity\.css';\nimport '\.\/reflowNavigationFix\.css'/);
  assert.match(app, /aria-label="Apri menu"/);
  assert.match(app, /aria-label="Chiudi menu"/);
  assert.match(app, /if \(event\.key === "Escape"\) setOpen\(false\)/);
});
