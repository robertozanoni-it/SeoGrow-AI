import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateSeoSuggestion,
  assertPublishableSeoSuggestion,
  stripHtml,
} from "./modules/content/index.js";
import {
  validateSeoSuggestion as legacyValidateSeoSuggestion,
  assertPublishableSeoSuggestion as legacyAssertPublishableSeoSuggestion,
  stripHtml as legacyStripHtml,
} from "./editorialQuality.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.dirname(srcRoot);

async function sourceFiles(directory, prefix) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(path.join(directory, entry.name), relative));
    else if (/\.(?:js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) files.push(relative);
  }
  return files;
}

test("Content owns editorial quality while legacy exports remain identical", () => {
  assert.equal(validateSeoSuggestion, legacyValidateSeoSuggestion);
  assert.equal(assertPublishableSeoSuggestion, legacyAssertPublishableSeoSuggestion);
  assert.equal(stripHtml, legacyStripHtml);

  assert.equal(stripHtml("<p>Test <strong>SEO</strong></p>"), "Test SEO");

  const goodTitle = validateSeoSuggestion(
    "title",
    "Guida pratica allo yoga per iniziare con consapevolezza",
    {},
  );
  assert.equal(goodTitle.publishable, true);

  const shortTitle = validateSeoSuggestion("title", "Yoga", {});
  assert.equal(shortTitle.publishable, false);
  assert.ok(shortTitle.errors.some(error => /troppo corto/i.test(error)));

  assert.throws(
    () => assertPublishableSeoSuggestion("title", "Yoga", {}),
    error => error?.code === "EDITORIAL_REVIEW_REQUIRED" && error?.quality?.publishable === false,
  );
});

test("editorial quality implementation lives under Content and uses Content-owned safety", async () => {
  const facade = await readFile(new URL("./modules/content/index.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./modules/content/editorialQuality.js", import.meta.url), "utf8");
  const shim = await readFile(new URL("./editorialQuality.js", import.meta.url), "utf8");

  assert.match(facade, /from ["']\.\/editorialQuality\.js["']/);
  assert.match(owner, /from ["']\.\/contentSafety\.js["']/);
  assert.doesNotMatch(owner, /editorialContentSafety\.js/);
  assert.match(owner, /function validateSeoSuggestion/);
  assert.match(owner, /function assertPublishableSeoSuggestion/);
  assert.doesNotMatch(shim, /function validateSeoSuggestion/);
  assert.doesNotMatch(shim, /function assertPublishableSeoSuggestion/);
  assert.match(shim, /modules\/content\/editorialQuality\.js/);
});

test("nessun nuovo consumer di produzione importa lo shim editorialQuality", async () => {
  const files = [
    ...await sourceFiles(srcRoot, "src"),
    ...await sourceFiles(path.join(projectRoot, "server"), "server"),
  ];
  const importers = [];
  const pattern = /from\s+["'][^"']*editorialQuality\.js["']/;
  for (const relative of files) {
    if (relative === "src/editorialQuality.js" || relative.startsWith("src/modules/content/")) continue;
    const source = await readFile(path.join(projectRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(relative);
  }
  assert.deepEqual(importers.sort(), [
    "server/wordpressPatchV2Hook.js",
    "server/wordpressSeoAdapterV2Hook.js",
  ]);

  const fallback = await readFile(new URL("../server/metaDescriptionFallback.js", import.meta.url), "utf8");
  assert.match(fallback, /from ["']\.\.\/src\/modules\/content\/index\.js["']/);
});
