import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  rankManifest,
  opportunityQueries,
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
  suggestPageForQuery,
  opportunityTask,
  findExistingTask,
} from "./modules/rank/index.js";
import {
  opportunityGroups as dataOpportunityGroups,
  queryChanges as dataQueryChanges,
  queryTaskDetail as dataQueryTaskDetail,
} from "./modules/rank/data.js";
import { opportunityQueries as legacyOpportunityQueries } from "./gscImport.js";
import {
  opportunityGroups as legacyOpportunityGroups,
  queryChanges as legacyQueryChanges,
  queryTaskDetail as legacyQueryTaskDetail,
} from "./platform.js";
import { suggestPageForQuery as legacySuggestPageForQuery } from "./seoHelpers.js";
import {
  opportunityTask as legacyOpportunityTask,
  findExistingTask as legacyFindExistingTask,
} from "./opportunityTasks.js";

test("Rank facade espone le capability dichiarate dal modulo", () => {
  assert.equal(rankManifest.id, "rank");
  assert.equal(rankManifest.status, "active");
  assert.equal(rankManifest.agentEnabled, true);
  assert.deepEqual(rankManifest.capabilities, ["rankings", "search-opportunities", "growth-signals"]);
});

test("Rank facade mantiene identiche le implementazioni legacy durante l'estrazione", () => {
  assert.equal(opportunityQueries, legacyOpportunityQueries);
  assert.equal(opportunityGroups, legacyOpportunityGroups);
  assert.equal(queryChanges, legacyQueryChanges);
  assert.equal(queryTaskDetail, legacyQueryTaskDetail);
  assert.equal(suggestPageForQuery, legacySuggestPageForQuery);
  assert.equal(opportunityTask, legacyOpportunityTask);
  assert.equal(findExistingTask, legacyFindExistingTask);
});

test("la pure Rank data API espone le stesse implementazioni analitiche", () => {
  assert.equal(dataOpportunityGroups, opportunityGroups);
  assert.equal(dataQueryChanges, queryChanges);
  assert.equal(dataQueryTaskDetail, queryTaskDetail);
});

test("la business logic dei task opportunità appartiene al modulo Rank, non allo shim legacy", async () => {
  const implementation = await readFile(new URL("./modules/rank/opportunityTasks.js", import.meta.url), "utf8");
  const legacyShim = await readFile(new URL("./opportunityTasks.js", import.meta.url), "utf8");

  assert.match(implementation, /export function opportunityTask/);
  assert.match(implementation, /export function findExistingTask/);
  assert.doesNotMatch(legacyShim, /function opportunityTask/);
  assert.doesNotMatch(legacyShim, /function findExistingTask/);
  assert.match(legacyShim, /from ["']\.\/modules\/rank\/opportunityTasks\.js["']/);
});

test("Rank possiede query changes, opportunity groups e task detail mentre platform resta compatibility entry point", async () => {
  const facade = await readFile(new URL("./modules/rank/index.js", import.meta.url), "utf8");
  const dataApi = await readFile(new URL("./modules/rank/data.js", import.meta.url), "utf8");
  const owner = await readFile(new URL("./modules/rank/opportunityAnalysis.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("./platform.js", import.meta.url), "utf8");

  assert.match(facade, /from ["']\.\/opportunityAnalysis\.js["']/);
  assert.match(dataApi, /from ["']\.\/opportunityAnalysis\.js["']/);
  assert.match(owner, /export function queryChanges/);
  assert.match(owner, /export function opportunityGroups/);
  assert.match(owner, /export function queryTaskDetail/);
  assert.doesNotMatch(platform, /export function queryChanges/);
  assert.doesNotMatch(platform, /export function opportunityGroups/);
  assert.doesNotMatch(platform, /export function queryTaskDetail/);
  assert.match(platform, /from ["']\.\/modules\/rank\/opportunityAnalysis\.js["']/);
});
