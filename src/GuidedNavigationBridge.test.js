import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bridge = await readFile(new URL("./GuidedNavigationBridge.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("guided navigation bridges visible buttons to the canonical App nav state", () => {
  assert.match(bridge, /\.guided-nav button/);
  assert.match(bridge, /\.sidebar > nav:not\(\.guided-nav\) button/);
  assert.match(bridge, /native\.click\(\)/);
  assert.match(bridge, /document\.addEventListener\("click", bridgeGuidedNavigationClick, true\)/);
});

test("mode toggle is excluded and bridge installs before React mounts", () => {
  assert.match(bridge, /guided-mode-toggle/);
  const installed = main.indexOf("import './GuidedNavigationBridge';");
  const react = main.indexOf("import React from 'react';");
  assert.ok(installed >= 0 && installed < react);
});
