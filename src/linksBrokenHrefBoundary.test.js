import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  decodeLinkEntities,
  matchBrokenLinkHref,
  singleAnchorHref,
  transformBrokenLinkAnchors,
} from "./modules/links/index.js";
import {
  decodeLinkEntities as legacyDecodeLinkEntities,
  matchBrokenLinkHref as legacyMatchBrokenLinkHref,
  singleAnchorHref as legacySingleAnchorHref,
  transformBrokenLinkAnchors as legacyTransformBrokenLinkAnchors,
} from "./modules/links/index.js";

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

test("Links owns broken-link href behavior while legacy exports remain identical", () => {
  assert.equal(decodeLinkEntities, legacyDecodeLinkEntities);
  assert.equal(matchBrokenLinkHref, legacyMatchBrokenLinkHref);
  assert.equal(singleAnchorHref, legacySingleAnchorHref);
  assert.equal(transformBrokenLinkAnchors, legacyTransformBrokenLinkAnchors);

  assert.equal(decodeLinkEntities("A &amp; B"), "A & B");
  assert.equal(singleAnchorHref('href="https://example.com/a" class="x"'), "https://example.com/a");
  assert.equal(singleAnchorHref('href="https://a.example" href="https://b.example"'), "");

  assert.deepEqual(
    matchBrokenLinkHref("https://example.com/a", "https://example.com/a"),
    { storedHref: "https://example.com/a", targetUrl: "https://example.com/a", kind: "exact" },
  );
  assert.equal(
    matchBrokenLinkHref(
      "https://www.google.com/url?url=https%3A%2F%2Fexample.com%2Fa",
      "https://example.com/a",
    )?.kind,
    "google-url-wrapper",
  );

  const transformed = transformBrokenLinkAnchors(
    '<p><a href="https://example.com/a">Link <strong>rotto</strong></a></p>',
    "https://example.com/a",
    true,
  );
  assert.equal(transformed.count, 1);
  assert.equal(transformed.anchors[0], "Link rotto");
  assert.equal(transformed.value, "<p></p>");
});

test("broken-link href implementation lives under Links and legacy shim stays thin", async () => {
  const facade = await readFile(new URL("./modules/links/index.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./modules/links/brokenLinkHref.js", import.meta.url), "utf8");
  await assert.rejects(readFile(new URL("./brokenLinkHref.js", import.meta.url), "utf8"), (error) => error?.code === "ENOENT");

  assert.match(facade, /from ["']\.\/brokenLinkHref\.js["']/);
  assert.match(owner, /function matchBrokenLinkHref/);
  assert.match(owner, /function transformBrokenLinkAnchors/);
});

test("nessun consumer di produzione importa lo shim brokenLinkHref", async () => {
  const files = [
    ...await sourceFiles(srcRoot, "src"),
    ...await sourceFiles(path.join(projectRoot, "server"), "server"),
  ];
  const importers = [];
  const pattern = /from\s+["'][^"']*brokenLinkHref\.js["']/;
  for (const relative of files) {
    if (relative === "src/brokenLinkHref.js" || relative.startsWith("src/modules/links/")) continue;
    const source = await readFile(path.join(projectRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(relative);
  }
  assert.deepEqual(importers.sort(), []);

  const fallback = await readFile(new URL("../server/metaDescriptionFallback.js", import.meta.url), "utf8");
  const evidenceHook = await readFile(new URL("../server/linkEvidenceHook.js", import.meta.url), "utf8");
  const remediation = await readFile(new URL("./brokenLinkRemediation.js", import.meta.url), "utf8");
  assert.match(fallback, /from ["']\.\.\/src\/modules\/links\/index\.js["']/);
  assert.match(evidenceHook, /from ["']\.\.\/src\/modules\/links\/index\.js["']/);
  assert.match(remediation, /from ["']\.\/modules\/links\/index\.js["']/);
});
