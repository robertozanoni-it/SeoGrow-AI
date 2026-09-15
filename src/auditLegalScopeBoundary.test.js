import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isLegalPage, excludeLegalSeo } from "./modules/audit/data.js";
import {
  isLegalPage as legacyIsLegalPage,
  excludeLegalSeo as legacyExcludeLegalSeo,
} from "./modules/audit/data.js";

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

test("Audit owns legal-page SEO scope while legacy exports remain identical", () => {
  assert.equal(isLegalPage, legacyIsLegalPage);
  assert.equal(excludeLegalSeo, legacyExcludeLegalSeo);
  assert.equal(isLegalPage("https://example.com/privacy-policy/"), true);
  assert.equal(isLegalPage("https://example.com/terms-of-use.html"), true);
  assert.equal(isLegalPage("https://example.com/blog/privacy-policy-tips/"), false);
  assert.equal(isLegalPage("not-a-url"), false);

  const result = excludeLegalSeo({
    url: "https://example.com/",
    pages: [
      { url: "https://example.com/privacy-policy/" },
      { url: "https://example.com/services/" },
    ],
    issues: [
      { type: "title", sourceUrl: "https://example.com/privacy-policy/" },
      { type: "broken-link", sourceUrl: "https://example.com/services/", targetUrl: "https://example.com/privacy-policy/" },
    ],
    reviewItems: [
      { type: "canonical", sourceUrl: "https://example.com/terms-of-use/" },
    ],
    failures: [
      { url: "https://example.com/cookie-policy/" },
      { url: "https://example.com/services/" },
    ],
    brokenLinks: [
      { url: "https://example.com/missing-a", sources: ["https://example.com/privacy-policy/"] },
      { url: "https://example.com/missing-b", sources: ["https://example.com/services/"] },
    ],
    brokenExternalLinks: [
      { url: "https://external.example/missing", sources: [] },
    ],
  });

  assert.equal(result.legalOnly, false);
  assert.equal(result.legalScopeVersion, 4);
  assert.deepEqual(result.pages.map(page => page.url), ["https://example.com/services/"]);
  assert.equal(result.pagesChecked, 1);
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0].type, "broken-link");
  assert.equal(result.reviewItems.length, 0);
  assert.deepEqual(result.failures.map(failure => failure.url), ["https://example.com/services/"]);
  assert.deepEqual(result.brokenLinks.map(link => link.url), ["https://example.com/missing-b"]);
  assert.equal(result.brokenExternalLinks.length, 1);
  const legalUrls = new Set(result.legalPages.map(page => page.url));
  assert.equal(legalUrls.has("https://example.com/privacy-policy/"), true);
  assert.equal(legalUrls.has("https://example.com/terms-of-use/"), true);
  assert.equal(legalUrls.has("https://example.com/cookie-policy/"), true);
});

test("legal-page scope implementation lives under Audit and consumers use public APIs", async () => {
  const dataApi = await readFile(new URL("./modules/audit/data.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./modules/audit/legalPageScope.js", import.meta.url), "utf8");
  await assert.rejects(readFile(new URL("./legalPageScope.js", import.meta.url), "utf8"), (error) => error?.code === "ENOENT");
  const tasksScope = await readFile(new URL("./experience/tasks/taskScope.js", import.meta.url), "utf8");
  const autoFixPlan = await readFile(new URL("./autoFixPlan.js", import.meta.url), "utf8");

  assert.match(dataApi, /from ["']\.\/legalPageScope\.js["']/);
  assert.match(owner, /function isLegalPage/);
  assert.match(owner, /function excludeLegalSeo/);
  assert.match(tasksScope, /from ["']\.\.\/\.\.\/modules\/audit\/data\.js["']/);
  assert.doesNotMatch(tasksScope, /legalPageScope\.js/);
  assert.match(autoFixPlan, /from ["']\.\/modules\/audit\/data\.js["']/);
  assert.doesNotMatch(autoFixPlan, /legalPageScope\.js/);
});

test("nessun nuovo consumer di produzione importa lo shim legalPageScope", async () => {
  const files = [
    ...await sourceFiles(srcRoot, "src"),
    ...await sourceFiles(path.join(projectRoot, "server"), "server"),
  ];
  const importers = [];
  const pattern = /from\s+["'][^"']*legalPageScope\.js["']/;
  for (const relative of files) {
    if (relative === "src/legalPageScope.js" || relative.startsWith("src/modules/audit/")) continue;
    const source = await readFile(path.join(projectRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(relative);
  }
  assert.deepEqual(importers.sort(), []);
});
