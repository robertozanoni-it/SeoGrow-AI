import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEditorialPlanRows,
  patchEditorialPlanState,
  editorialPlanEvidence,
} from "./modules/content/index.js";

const dataset = {
  queries: [{ dimension: "yoga cinisello", clicks: 4, impressions: 140, ctr: 2.8, position: 11.2 }],
  pages: [{ dimension: "https://example.com/yoga/" }],
  queryPages: [{ dimension: "yoga cinisello", pages: ["https://example.com/yoga/"] }],
};

const topicalMap = {
  ideas: [
    { keyword: "yoga cinisello", coreKeyword: "yoga", intent: "commerciale", searchVolume: 120, covered: false },
    { keyword: "benefici yoga", coreKeyword: "yoga", intent: "informazionale", searchVolume: 80, covered: false },
  ],
};

test("editorial rows expose topic, keyword, intent, cluster, status, brief and planned date", () => {
  const rows = buildEditorialPlanRows({
    dataset,
    topicalMap,
    schedule: [{ id: "update-yoga cinisello", title: "yoga cinisello", date: "2026-10-10" }],
  });
  const row = rows.find((item) => item.topic === "yoga cinisello");
  assert.ok(row);
  assert.equal(row.keyword, "yoga cinisello");
  assert.equal(row.intent, "commerciale");
  assert.equal(row.cluster, "yoga");
  assert.equal(row.status, "Pianificato");
  assert.equal(row.date, "2026-10-10");
  assert.ok(row.brief.includes("Obiettivo:"));
});

test("intent and cluster remain empty when no Topical Map evidence exists", () => {
  const rows = buildEditorialPlanRows({ dataset });
  const row = rows.find((item) => item.topic === "yoga cinisello");
  assert.ok(row);
  assert.equal(row.intent, "");
  assert.equal(row.cluster, "");
  assert.deepEqual(editorialPlanEvidence(row), {
    hasKeyword: true,
    hasIntent: false,
    hasCluster: false,
    hasRanking: false,
    hasOpportunity: false,
  });
});

test("ranking and opportunity links require an exact normalized keyword match", () => {
  const rows = buildEditorialPlanRows({
    dataset,
    topicalMap,
    rankingRows: [
      { keyword: "yoga cinisello", position: 9, delta: 2, url: "https://example.com/yoga/", checkedAt: "2026-09-17T10:00:00Z" },
      { keyword: "yoga milano", position: 4, delta: 1 },
    ],
    opportunities: [
      { id: "opp-yoga", dedupeKey: "query|yoga-cinisello", priority: "Alta", impact: "Alto", effort: "Medio", action: { task: { query: "yoga cinisello" } } },
      { id: "opp-other", dedupeKey: "query|yoga-milano", priority: "Alta", action: { task: { query: "yoga milano" } } },
    ],
  });
  const row = rows.find((item) => item.topic === "yoga cinisello");
  assert.equal(row.ranking.keyword, "yoga cinisello");
  assert.equal(row.ranking.position, 9);
  assert.equal(row.opportunity.id, "opp-yoga");
});

test("persisted editorial status and brief override derived defaults", () => {
  const state = patchEditorialPlanState({}, "update-yoga cinisello", { status: "In lavorazione", brief: "Brief personalizzato" });
  const rows = buildEditorialPlanRows({ dataset, state });
  const row = rows.find((item) => item.id === "update-yoga cinisello");
  assert.equal(row.status, "In lavorazione");
  assert.equal(row.brief, "Brief personalizzato");
});

test("draft state marks the matching plan row as ready without affecting unrelated topics", () => {
  const rows = buildEditorialPlanRows({
    dataset,
    topicalMap,
    draft: { topic: "benefici yoga", content: "Bozza completa" },
  });
  assert.equal(rows.find((item) => item.topic === "benefici yoga")?.status, "Bozza pronta");
  assert.notEqual(rows.find((item) => item.topic === "yoga cinisello")?.status, "Bozza pronta");
});
