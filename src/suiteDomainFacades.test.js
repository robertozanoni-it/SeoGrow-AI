import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as rank from "./modules/rank/index.js";
import * as content from "./modules/content/index.js";
import * as links from "./modules/links/index.js";
import { moduleById } from "./core/modules/moduleRegistry.js";

const contentUi = await readFile(new URL("./modules/content/ui.js", import.meta.url), "utf8");

const assertFunctions = (api, names) => {
  for (const name of names) assert.equal(typeof api[name], "function", `${name} deve restare disponibile`);
};

test("Rank & Growth espone ranking e opportunità tramite un facade stabile", () => {
  assertFunctions(rank, [
    "queryChanges",
    "opportunityGroups",
    "opportunityQueries",
    "opportunityTask",
    "findExistingTask",
  ]);
  const manifest = moduleById("rank");
  assert.equal(manifest.status, "active");
  assert.deepEqual(manifest.pages, ["Posizionamenti", "Opportunità"]);
});

test("Content espone pianificazione editoriale senza spostare ancora i file legacy", () => {
  assertFunctions(content, ["contentPlan", "calendarDays", "planItems", "scheduleItem", "validDate"]);
  assert.match(contentUi, /default as EditorialCalendar/);
  const manifest = moduleById("content");
  assert.equal(manifest.status, "active");
  assert.deepEqual(manifest.pages, ["Piano editoriale"]);
});

test("Links espone matching e cleanup dei link rotti tramite il boundary del modulo", () => {
  assertFunctions(links, [
    "brokenExternalTarget",
    "normalizeBrokenLinkCleanupMode",
    "setBrokenLinkCleanupMode",
    "brokenLinkCleanupMode",
    "clearBrokenLinkCleanupMode",
    "consumeBrokenLinkCleanupMode",
    "removeExactAnchor",
    "prepareElementorBrokenExternalLink",
    "matchBrokenLinkHref",
    "transformBrokenLinkAnchors",
  ]);
  assert.equal(typeof links.BROKEN_LINK_CLEANUP_MODES, "object");
  const manifest = moduleById("links");
  assert.equal(manifest.status, "active");
  assert.deepEqual(manifest.pages, ["Link interni"]);
});
