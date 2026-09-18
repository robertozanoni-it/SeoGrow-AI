import test from "node:test";
import assert from "node:assert/strict";
import { discoverCapabilityCandidates, mergeCapabilityBacklog } from "./capabilityEvolution.js";

test("Capability Evolution proposes only evidence-backed candidates and never auto-implements", () => {
  const rows = discoverCapabilityCandidates({
    repeatedManualActions: [{ id: "refresh", label: "Refresh manuale", owner: "rank", count: 4 }],
    recurringIncidents: [{ code: "API_TIMEOUT", owner: "integrations", occurrences: 5 }],
    performanceSignals: [{ id: "audit-time", label: "Audit", owner: "audit", regressionPct: 12 }],
  });
  assert.equal(rows.length, 3);
  assert.ok(rows.every((row) => row.autoImplement === false && row.state === "candidate"));
});

test("Capability backlog deduplicates recurring proposals", () => {
  const first = discoverCapabilityCandidates({ recurringIncidents: [{ code: "API_TIMEOUT", owner: "integrations", occurrences: 3 }] });
  const second = discoverCapabilityCandidates({ recurringIncidents: [{ code: "API_TIMEOUT", owner: "integrations", occurrences: 6 }] });
  assert.equal(mergeCapabilityBacklog(first, second).length, 1);
});
