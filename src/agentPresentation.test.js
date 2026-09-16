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

test("AgentPage distingue analisi completata da problema chiuso", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");
  assert.match(source, /resolutionOutcome\?\.kind === "obsolete"\) return "Problema chiuso"/);
  assert.match(source, /run\?\.status === AgentStatus\.COMPLETED\) return "Analisi completata"/);
});
