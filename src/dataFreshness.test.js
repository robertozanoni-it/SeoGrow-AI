import test from "node:test";
import assert from "node:assert/strict";
import { FRESHNESS_STATE, buildProjectFreshness, classifyFreshness } from "./dataFreshness.js";

const now = Date.parse("2026-09-18T12:00:00Z");
const daysAgo = (days) => new Date(now - days * 86_400_000).toISOString();

test("freshness classifier is deterministic across fresh aging stale and unavailable data", () => {
  assert.equal(classifyFreshness(daysAgo(2), { staleAfterDays: 10, now }).state, FRESHNESS_STATE.FRESH);
  assert.equal(classifyFreshness(daysAgo(7), { staleAfterDays: 10, now }).state, FRESHNESS_STATE.AGING);
  assert.equal(classifyFreshness(daysAgo(11), { staleAfterDays: 10, now }).state, FRESHNESS_STATE.STALE);
  assert.equal(classifyFreshness("", { staleAfterDays: 10, now }).state, FRESHNESS_STATE.UNAVAILABLE);
});

test("mixed project freshness yields one owner-module refresh action per stale or missing source", () => {
  const result = buildProjectFreshness({
    now,
    policy: { freshnessDays: 7 },
    analysis: { analyzedAt: daysAgo(2) },
    dataset: { importedAt: daysAgo(20) },
    rankings: [{ checkedAt: daysAgo(16) }],
    geo: null,
  });
  assert.equal(result.sources.find((item) => item.id === "audit").state, FRESHNESS_STATE.FRESH);
  assert.deepEqual(result.refreshActions.map((item) => [item.source, item.page]), [
    ["gsc", "Integrazioni"],
    ["rankings", "Posizionamenti"],
    ["geo", "GEO AI"],
  ]);
  assert.equal(result.healthy, false);
});
