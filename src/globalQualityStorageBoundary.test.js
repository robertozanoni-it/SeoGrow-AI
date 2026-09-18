import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyLocalStorageOperations,
  summarizeLocalStorageOperations,
} from "../scripts/global-quality-audit-lib.mjs";

test("workspaceStorage aliased as localStorage is canonical, not a native bypass", () => {
  const result = classifyLocalStorageOperations(
    "src/example.js",
    'import { workspaceStorage as localStorage } from "./workspaceDatabase.js";\nlocalStorage.getItem("x");\nlocalStorage.setItem("x", "1");',
  );
  assert.equal(result.canonicalAlias.length, 2);
  assert.equal(result.nativeBoundary.length, 0);
  assert.equal(result.nativeBypass.length, 0);
});

test("workspaceDatabase is the only authorized native localStorage boundary", () => {
  const result = classifyLocalStorageOperations(
    "src/workspaceDatabase.js",
    'globalThis.localStorage.getItem("x"); globalThis.localStorage.setItem("x", "1");',
  );
  assert.equal(result.canonicalAlias.length, 0);
  assert.equal(result.nativeBoundary.length, 2);
  assert.equal(result.nativeBypass.length, 0);
});

test("raw localStorage outside workspaceDatabase is a release-blocking bypass", () => {
  const result = classifyLocalStorageOperations(
    "src/unsafeFeature.js",
    'localStorage.getItem("seogrow-x"); localStorage.removeItem("seogrow-x");',
  );
  assert.equal(result.nativeBypass.length, 2);
});

test("summary keeps canonical aliases separate from real bypasses", () => {
  const summary = summarizeLocalStorageOperations([
    {
      file: "src/App.jsx",
      source: 'import { workspaceStorage as localStorage } from "./workspaceDatabase.js"; localStorage.getItem("a");',
    },
    {
      file: "src/workspaceDatabase.js",
      source: 'globalThis.localStorage.getItem("a");',
    },
    {
      file: "src/unsafe.js",
      source: 'localStorage.setItem("a", "b");',
    },
  ]);
  assert.equal(summary.canonicalAlias.length, 1);
  assert.equal(summary.nativeBoundary.length, 1);
  assert.equal(summary.nativeBypass.length, 1);
});
