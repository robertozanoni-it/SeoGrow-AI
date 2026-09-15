import test from "node:test";
import assert from "node:assert/strict";
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
