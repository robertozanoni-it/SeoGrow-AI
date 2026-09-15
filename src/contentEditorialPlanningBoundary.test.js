import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validDate,
  calendarDays,
  planItems,
  scheduleItem,
} from "./modules/content/index.js";
import {
  validDate as legacyValidDate,
  calendarDays as legacyCalendarDays,
  planItems as legacyPlanItems,
  scheduleItem as legacyScheduleItem,
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

test("Content owns editorial calendar planning while compatibility exports remain identical", () => {
  assert.equal(validDate, legacyValidDate);
  assert.equal(calendarDays, legacyCalendarDays);
  assert.equal(planItems, legacyPlanItems);
  assert.equal(scheduleItem, legacyScheduleItem);

  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("2026-02-29"), false);
  assert.equal(calendarDays("2024-02").length, 29);
  assert.deepEqual(calendarDays("2026-13"), []);

  const planned = [{ id: "a", title: "Articolo A", type: "Articolo", url: "/a" }];
  const saved = [{ id: "a", title: "Articolo A", type: "Articolo", url: "/a", date: "2026-09-20" }];
  assert.equal(planItems(planned, saved)[0].date, "2026-09-20");
  assert.equal(scheduleItem(saved, planned[0], "2026-09-21")[0].date, "2026-09-21");
  assert.throws(() => scheduleItem(saved, planned[0], "2026-02-30"), /Data non valida/);
});

test("editorial planning implementation lives under Content while report helpers stay separate", async () => {
  const facade = await readFile(new URL("./modules/content/index.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./modules/content/editorialPlanning.js", import.meta.url), "utf8");
  const compatibility = await readFile(new URL("./projectPlanning.js", import.meta.url), "utf8");

  assert.match(facade, /from ["']\.\/editorialPlanning\.js["']/);
  assert.match(owner, /function validDate/);
  assert.match(owner, /function calendarDays/);
  assert.match(owner, /function planItems/);
  assert.match(owner, /function scheduleItem/);
  assert.doesNotMatch(compatibility, /function validDate/);
  assert.doesNotMatch(compatibility, /function calendarDays/);
  assert.doesNotMatch(compatibility, /function planItems/);
  assert.doesNotMatch(compatibility, /function scheduleItem/);
  assert.match(compatibility, /modules\/content\/editorialPlanning\.js/);
  assert.match(compatibility, /function reportTemplate/);
});

test("nessun consumer di produzione importa planning helper da projectPlanning", async () => {
  const importers = [];
  const planningNames = /\b(?:validDate|calendarDays|planItems|scheduleItem)\b/;
  const importPattern = /import\s*\{([\s\S]*?)\}\s*from\s*["'][^"']*projectPlanning\.js["']/g;

  for (const relative of await sourceFiles(srcRoot)) {
    const normalized = relative.split(path.sep).join("/");
    if (normalized === "projectPlanning.js" || normalized.startsWith("modules/content/")) continue;
    const source = await readFile(path.join(srcRoot, relative), "utf8");
    let match;
    while ((match = importPattern.exec(source))) {
      if (planningNames.test(match[1])) importers.push(normalized);
    }
  }

  assert.deepEqual(importers.sort(), []);
});
