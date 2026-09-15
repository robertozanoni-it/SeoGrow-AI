import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { metadataDuplicateGroups } from "./modules/audit/data.js";
import { metadataDuplicateGroups as legacyMetadataDuplicateGroups } from "./metadataDuplicateGroups.js";

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

test("Audit owns metadata duplicate grouping while legacy export remains identical", () => {
  assert.equal(metadataDuplicateGroups, legacyMetadataDuplicateGroups);

  const aliasPages = [
    {
      url: "https://example.com/page",
      title: "Example title",
      ok: true,
      status: 200,
      isHtml: true,
      canonicalCount: 1,
      canonical: "https://example.com/page/",
      wordpressDocumentId: 17,
    },
    {
      url: "https://example.com/page/",
      title: "example title",
      ok: true,
      status: 200,
      isHtml: true,
      canonicalCount: 1,
      canonical: "https://example.com/page/",
      wordpressDocumentId: 17,
    },
  ];
  const aliases = metadataDuplicateGroups(aliasPages, "title");
  assert.equal(aliases.aliases.length, 1);
  assert.equal(aliases.duplicates.length, 0);

  const duplicates = metadataDuplicateGroups([
    { url: "https://example.com/a", title: "Same title" },
    { url: "https://example.com/b", title: "same title" },
  ], "title");
  assert.equal(duplicates.duplicates.length, 1);
  assert.equal(duplicates.duplicates[0].length, 2);

  const conflicts = metadataDuplicateGroups([
    { url: "https://example.com/a", title: "First" },
    { url: "https://example.com/a", title: "Second" },
  ], "title");
  assert.deepEqual(conflicts.conflicts, ["https://example.com/a"]);
});

test("metadata duplicate implementation lives under Audit and the legacy shim stays thin", async () => {
  const dataApi = await readFile(new URL("./modules/audit/data.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./modules/audit/metadataDuplicateGroups.js", import.meta.url), "utf8");
  const shim = await readFile(new URL("./metadataDuplicateGroups.js", import.meta.url), "utf8");

  assert.match(dataApi, /from ["']\.\/metadataDuplicateGroups\.js["']/);
  assert.match(owner, /function metadataDuplicateGroups/);
  assert.doesNotMatch(shim, /function metadataDuplicateGroups/);
  assert.match(shim, /modules\/audit\/metadataDuplicateGroups\.js/);
});

test("nessun nuovo consumer di produzione importa lo shim metadataDuplicateGroups", async () => {
  const files = [
    ...await sourceFiles(srcRoot, "src"),
    ...await sourceFiles(path.join(projectRoot, "server"), "server"),
  ];
  const importers = [];
  const pattern = /from\s+["'][^"']*metadataDuplicateGroups\.js["']/;
  for (const relative of files) {
    if (relative === "src/metadataDuplicateGroups.js" || relative.startsWith("src/modules/audit/")) continue;
    const source = await readFile(path.join(projectRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(relative);
  }
  assert.deepEqual(importers.sort(), ["server/index.js"]);
});
