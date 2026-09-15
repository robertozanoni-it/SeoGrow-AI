import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  rankManifest,
  opportunityQueries,
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
  datasetKey,
  addDatasetToHistory,
  compareDatasets,
  suggestPageForQuery,
  opportunityTask,
  findExistingTask,
} from "./modules/rank/index.js";
import {
  opportunityQueries as dataOpportunityQueries,
  opportunityGroups as dataOpportunityGroups,
  queryChanges as dataQueryChanges,
  queryTaskDetail as dataQueryTaskDetail,
  datasetKey as dataDatasetKey,
  addDatasetToHistory as dataAddDatasetToHistory,
  compareDatasets as dataCompareDatasets,
} from "./modules/rank/data.js";
import { opportunityQueries as legacyOpportunityQueries } from "./gscImport.js";
import {
  opportunityGroups as legacyOpportunityGroups,
  queryChanges as legacyQueryChanges,
  queryTaskDetail as legacyQueryTaskDetail,
  datasetKey as legacyDatasetKey,
  addDatasetToHistory as legacyAddDatasetToHistory,
  compareDatasets as legacyCompareDatasets,
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
  assert.equal(datasetKey, legacyDatasetKey);
  assert.equal(addDatasetToHistory, legacyAddDatasetToHistory);
  assert.equal(compareDatasets, legacyCompareDatasets);
  assert.equal(suggestPageForQuery, legacySuggestPageForQuery);
  assert.equal(opportunityTask, legacyOpportunityTask);
  assert.equal(findExistingTask, legacyFindExistingTask);
});

test("la pure Rank data API espone le stesse implementazioni analitiche e di history", () => {
  assert.equal(dataOpportunityQueries, opportunityQueries);
  assert.equal(dataOpportunityGroups, opportunityGroups);
  assert.equal(dataQueryChanges, queryChanges);
  assert.equal(dataQueryTaskDetail, queryTaskDetail);
  assert.equal(dataDatasetKey, datasetKey);
  assert.equal(dataAddDatasetToHistory, addDatasetToHistory);
  assert.equal(dataCompareDatasets, compareDatasets);
});

test("Rank opportunity queries preserva filtri, ordinamento e limite", () => {
  const dataset = {
    queries: [
      { dimension: "top3 basso ctr", impressions: 100, position: 2, ctr: 1 },
      { dimension: "opportunità", impressions: 300, position: 8, ctr: 3 },
      { dimension: "fuori range", impressions: 500, position: 35, ctr: 1 },
      { dimension: "top3 sano", impressions: 400, position: 2, ctr: 4 },
    ],
  };
  assert.deepEqual(
    opportunityQueries(dataset, 2).map((row) => row.dimension),
    ["opportunità", "top3 basso ctr"],
  );
  assert.deepEqual(opportunityQueries(null), []);
});

test("Rank dataset history preserva deduplica, ordinamento e comparabilità dei periodi", () => {
  const jan = {
    property: { host: "example.it" },
    dateFrom: "2026-01-01",
    dateTo: "2026-01-31",
    importedAt: "2026-02-01T00:00:00Z",
    totals: { clicks: 10, impressions: 100, ctr: 10, position: 8 },
    queries: [{ dimension: "seo", clicks: 10, impressions: 100, ctr: 10, position: 8 }],
  };
  const feb = {
    ...jan,
    dateFrom: "2026-02-01",
    dateTo: "2026-02-28",
    importedAt: "2026-03-01T00:00:00Z",
    totals: { clicks: 12, impressions: 120, ctr: 10, position: 7 },
  };
  const history = addDatasetToHistory({ 1: [jan] }, 1, feb);
  assert.equal(history[1][0], feb);
  assert.equal(history[1].length, 2);
  assert.notEqual(datasetKey(jan), datasetKey(feb));
  assert.equal(compareDatasets(feb, jan)?.clicks, 20);

  const duplicate = addDatasetToHistory(history, 1, { ...feb });
  assert.equal(duplicate[1].length, 2);
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

test("Rank possiede opportunity queries, opportunity analysis e dataset history", async () => {
  const facade = await readFile(new URL("./modules/rank/index.js", import.meta.url), "utf8");
  const dataApi = await readFile(new URL("./modules/rank/data.js", import.meta.url), "utf8");
  const queriesOwner = await readFile(new URL("./modules/rank/opportunityQueries.js", import.meta.url), "utf8");
  const analysisOwner = await readFile(new URL("./modules/rank/opportunityAnalysis.js", import.meta.url), "utf8");
  const historyOwner = await readFile(new URL("./modules/rank/datasetHistory.js", import.meta.url), "utf8");
  const gscImport = await readFile(new URL("./gscImport.js", import.meta.url), "utf8");
  const platform = await readFile(new URL("./platform.js", import.meta.url), "utf8");

  assert.match(facade, /from ["']\.\/opportunityQueries\.js["']/);
  assert.match(facade, /from ["']\.\/opportunityAnalysis\.js["']/);
  assert.match(facade, /from ["']\.\/datasetHistory\.js["']/);
  assert.match(dataApi, /from ["']\.\/opportunityQueries\.js["']/);
  assert.match(dataApi, /from ["']\.\/opportunityAnalysis\.js["']/);
  assert.match(dataApi, /from ["']\.\/datasetHistory\.js["']/);
  assert.match(queriesOwner, /export function opportunityQueries/);
  assert.doesNotMatch(gscImport, /export function opportunityQueries/);
  assert.match(gscImport, /modules\/rank\/opportunityQueries\.js/);
  assert.match(analysisOwner, /export function queryChanges/);
  assert.match(analysisOwner, /export function opportunityGroups/);
  assert.match(analysisOwner, /export function queryTaskDetail/);
  assert.match(historyOwner, /export function datasetKey/);
  assert.match(historyOwner, /export function addDatasetToHistory/);
  assert.match(historyOwner, /export function compareDatasets/);
  assert.doesNotMatch(platform, /export function queryChanges/);
  assert.doesNotMatch(platform, /export function opportunityGroups/);
  assert.doesNotMatch(platform, /export function queryTaskDetail/);
  assert.doesNotMatch(platform, /export function datasetKey/);
  assert.doesNotMatch(platform, /export function addDatasetToHistory/);
  assert.doesNotMatch(platform, /export function compareDatasets/);
  assert.match(platform, /from ["']\.\/modules\/rank\/opportunityAnalysis\.js["']/);
  assert.match(platform, /from ["']\.\/modules\/rank\/datasetHistory\.js["']/);
});
