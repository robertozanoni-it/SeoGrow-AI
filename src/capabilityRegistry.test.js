import test from "node:test";
import assert from "node:assert/strict";
import {
  SUITE_CAPABILITIES,
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

test("le capability Publish esistono ma non sono ancora invocabili dall'orchestratore", () => {
  const publish = capabilitiesForModule("publish");
  assert.ok(publish.some((entry) => entry.key === "publish:wordpress"));
  assert.ok(publish.every((entry) => entry.available === false));
  assert.equal(availableSuiteCapabilities().some((entry) => entry.moduleId === "publish"), false);
});

test("solo i moduli attivi alimentano le capability disponibili", () => {
  const available = availableSuiteCapabilities();
  assert.ok(available.some((entry) => entry.key === "audit:detect"));
  assert.ok(available.some((entry) => entry.key === "agent:orchestration"));
  assert.ok(available.every((entry) => entry.available));
  assert.deepEqual(
    capabilitiesForModule("audit", { availableOnly: true }).map((entry) => entry.capability),
    ["detect", "prioritize", "fix", "verify"],
  );
});
