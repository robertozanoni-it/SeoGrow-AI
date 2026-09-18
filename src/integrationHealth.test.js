import test from "node:test";
import assert from "node:assert/strict";
import { buildIntegrationHealth, INTEGRATION_HEALTH, integrationHealth } from "./system/integrations/integrationHealth.js";

const now = Date.parse("2026-09-18T12:00:00Z");
const daysAgo = (days) => new Date(now - days * 86_400_000).toISOString();

test("integration health distinguishes healthy stale degraded unavailable and unconfigured", () => {
  assert.equal(integrationHealth({ configured: true, connected: true, testedAt: daysAgo(1) }, { now }).state, INTEGRATION_HEALTH.HEALTHY);
  assert.equal(integrationHealth({ configured: true, connected: true, testedAt: daysAgo(8) }, { now }).state, INTEGRATION_HEALTH.STALE);
  assert.equal(integrationHealth({ configured: true, connected: true, testedAt: daysAgo(1), error: "timeout" }, { now }).state, INTEGRATION_HEALTH.DEGRADED);
  assert.equal(integrationHealth({ configured: true, connected: false }, { now }).state, INTEGRATION_HEALTH.UNAVAILABLE);
  assert.equal(integrationHealth({ configured: false, connected: false }, { now }).state, INTEGRATION_HEALTH.UNCONFIGURED);
});

test("one failing provider does not mark unrelated integrations unhealthy", () => {
  const health = buildIntegrationHealth({ connections: [
    { kind: "openai", label: "OpenAI", configured: true, connected: true, testedAt: daysAgo(1) },
    { kind: "dataforseo", label: "DataForSEO", configured: true, connected: true, testedAt: daysAgo(1), error: "provider unavailable" },
  ] }, { now });
  assert.equal(health.connections[0].health.state, INTEGRATION_HEALTH.HEALTHY);
  assert.equal(health.connections[1].health.state, INTEGRATION_HEALTH.DEGRADED);
  assert.equal(health.healthy, 1);
  assert.equal(health.attention, 1);
  assert.deepEqual(health.actions, [{ kind: "dataforseo", label: "DataForSEO", action: "verify", state: INTEGRATION_HEALTH.DEGRADED }]);
});
