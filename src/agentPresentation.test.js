import test from "node:test";
import assert from "node:assert/strict";
import { agentCostLabel, agentStatusLabel } from "./agentPresentation.js";

test("agent costs distinguish absent, zero, estimate and actual values", () => {
  assert.equal(agentCostLabel(), "non disponibile");
  assert.equal(agentCostLabel({ actualCost: null }), "non disponibile");
  assert.equal(agentCostLabel({ actualCost: 0, estimatedCost: 2 }), "0 (consuntivo)");
  assert.equal(agentCostLabel({ estimatedCost: 0.5 }), "0.5 (stima)");
  assert.equal(agentCostLabel({ actualCost: NaN, estimatedCost: -1 }), "non disponibile");
});

test("blocked runs do not assume insufficient data, and unknown states remain visible", () => {
  assert.equal(agentStatusLabel("BLOCKED"), "Esecuzione bloccata");
  assert.equal(agentStatusLabel("CACHED"), "Risultato riutilizzato");
  assert.equal(agentStatusLabel("NEW_STATE"), "NEW_STATE");
});
