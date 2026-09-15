import test from "node:test";
import assert from "node:assert/strict";
import {
  SUITE_CAPABILITIES,
  agentAvailableSuiteCapabilities,
  availableSuiteCapabilities,
  capabilitiesForModule,
  capabilityKey,
  suiteCapability,
} from "./core/modules/capabilityRegistry.js";

test("le capability sono namespaced per modulo e univoche", () => {
  const keys = SUITE_CAPABILITIES.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(capabilityKey("audit", "verify"), "audit:verify");
  assert.equal(suiteCapability("audit:verify")?.moduleId, "audit");
  assert.equal(suiteCapability("rank:rankings")?.capability, "rankings");
});

test("Publish è disponibile nella Suite ma resta escluso dall'orchestratore", () => {
  const publish = capabilitiesForModule("publish");
  assert.ok(publish.some((entry) => entry.key === "publish:wordpress"));
  assert.ok(publish.every((entry) => entry.available === true));
  assert.ok(publish.every((entry) => entry.agentAvailable === false));
  assert.equal(availableSuiteCapabilities().some((entry) => entry.moduleId === "publish"), true);
  assert.equal(agentAvailableSuiteCapabilities().some((entry) => entry.moduleId === "publish"), false);
});

test("solo moduli esplicitamente agent-enabled alimentano le capability dell'orchestratore", () => {
  const available = availableSuiteCapabilities();
  const agentAvailable = agentAvailableSuiteCapabilities();
  assert.ok(available.some((entry) => entry.key === "audit:detect"));
  assert.ok(available.some((entry) => entry.key === "agent:orchestration"));
  assert.ok(agentAvailable.some((entry) => entry.key === "audit:detect"));
  assert.equal(agentAvailable.some((entry) => entry.key === "agent:orchestration"), false);
  assert.ok(agentAvailable.every((entry) => entry.agentAvailable));
  assert.deepEqual(
    capabilitiesForModule("audit", { availableOnly: true, agentOnly: true }).map((entry) => entry.capability),
    ["detect", "prioritize", "verify"],
  );
});
