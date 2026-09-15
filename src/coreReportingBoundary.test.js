import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  reportSections,
  reportTemplate,
} from "./core/reporting/index.js";
import {
  reportSections as legacyReportSections,
  reportTemplate as legacyReportTemplate,
} from "./projectPlanning.js";

const srcRoot = path.dirname(fileURLToPath(import.meta.url));

async function sourceFiles(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(path.join(directory, entry.name), relative));
    else if (/\.(?:js|jsx)$/.test(entry.name) && !/\.test\.js$/.test(entry.name)) files.push(relative);
  }
  return files;
}

test("Core owns shared report templates while compatibility exports stay identical", () => {
  assert.equal(reportSections, legacyReportSections);
  assert.equal(reportTemplate, legacyReportTemplate);

  const defaults = reportTemplate();
  assert.equal(defaults.title, "Report SEO");
  assert.equal(defaults.color, "#16a05d");
  assert.deepEqual(defaults.sections, {
    overview: true,
    tasks: true,
    issues: true,
    geo: true,
    queries: true,
    rankings: true,
    editorial: true,
    links: true,
  });

  const allDisabled = reportTemplate({
    sections: { overview: false, tasks: false, issues: false, geo: false, queries: false, rankings: false, editorial: false, links: false },
  });
  assert.equal(allDisabled.sections.tasks, true);
  assert.equal(Object.values(allDisabled.sections).filter(Boolean).length, 1);

  const normalized = reportTemplate({
    brand: "b".repeat(120),
    title: "t".repeat(120),
    intro: "i".repeat(2100),
    color: "red",
  });
  assert.equal(normalized.brand.length, 100);
  assert.equal(normalized.title.length, 100);
  assert.equal(normalized.intro.length, 2000);
  assert.equal(normalized.color, "#16a05d");
  assert.equal(reportTemplate({ color: "#12abEF" }).color, "#12abEF");
});

test("report template implementation lives under Core reporting", async () => {
  const api = await readFile(new URL("./core/reporting/index.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./core/reporting/reportTemplate.js", import.meta.url), "utf8");
  const compatibility = await readFile(new URL("./projectPlanning.js", import.meta.url), "utf8");

  assert.match(api, /from ["']\.\/reportTemplate\.js["']/);
  assert.match(owner, /export const reportSections/);
  assert.match(owner, /export function reportTemplate/);
  assert.doesNotMatch(compatibility, /export const reportSections/);
  assert.doesNotMatch(compatibility, /function reportTemplate/);
  assert.match(compatibility, /from ["']\.\/core\/reporting\/index\.js["']/);
});

test("legacy report-template consumers are frozen while imports migrate", async () => {
  const importers = [];
  const pattern = /import\s*\{[^}]*\b(?:reportSections|reportTemplate)\b[^}]*\}\s*from\s*["'][^"']*projectPlanning\.js["']/s;
  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "projectPlanning.js" || normalized.startsWith("core/reporting/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    if (pattern.test(source)) importers.push(normalized);
  }
  assert.deepEqual(importers.sort(), ["ProjectCenter.jsx", "seoHelpers.js"]);
});
