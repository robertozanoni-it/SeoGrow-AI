import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProjectIntegrationRegistry,
  integrationConnection,
  validateSingleProjectIntegrationConfig,
} from "./system/index.js";

const client = { id: 7, name: "Example", url: "https://example.com/" };

test("integration registry exposes exactly one record for every supported connection", () => {
  const registry = buildProjectIntegrationRegistry({
    client,
    wordpressProfile: { url: client.url, username: "editor" },
    wordpressSession: { url: client.url, username: "editor", applicationPassword: "runtime-only", verifiedAt: "2026-09-17T15:00:00Z" },
    openAiStatus: { configured: true, model: "gpt-5-mini" },
    dataForSeoStatus: { configured: true },
    googleStatus: { configured: true, connected: true },
    googleProperties: [{ url: "https://example.com/" }],
  });
  assert.equal(registry.connections.length, 4);
  assert.equal(new Set(registry.connections.map((item) => item.kind)).size, 4);
  assert.equal(validateSingleProjectIntegrationConfig(registry).ok, true);
  assert.equal(integrationConnection(registry, "wordpress").connected, true);
  assert.equal(integrationConnection(registry, "search-console").connected, true);
});

test("provider credentials are represented as shared runtime state, not duplicated project secrets", () => {
  const registry = buildProjectIntegrationRegistry({
    client,
    openAiStatus: { configured: true, apiKey: "must-not-surface" },
    dataForSeoStatus: { configured: true, password: "must-not-surface" },
  });
  const serialized = JSON.stringify(registry);
  assert.doesNotMatch(serialized, /must-not-surface/);
  assert.equal(integrationConnection(registry, "openai").scope, "shared-provider");
  assert.equal(integrationConnection(registry, "dataforseo").scope, "shared-provider");
});

test("WordPress profile can persist without the application password", () => {
  const registry = buildProjectIntegrationRegistry({
    client,
    wordpressProfile: { url: client.url, username: "editor" },
  });
  const wordpress = integrationConnection(registry, "wordpress");
  assert.equal(wordpress.configured, true);
  assert.equal(wordpress.connected, false);
  assert.doesNotMatch(JSON.stringify(registry), /applicationPassword/);
});

test("Search Console can be project-bound by matching property or imported dataset", () => {
  const byProperty = buildProjectIntegrationRegistry({ client, googleProperties: [{ url: "https://example.com/" }] });
  assert.equal(integrationConnection(byProperty, "search-console").connected, true);
  const byDataset = buildProjectIntegrationRegistry({ client, dataset: { importedAt: "2026-09-17T15:00:00Z" } });
  assert.equal(integrationConnection(byDataset, "search-console").connected, true);
});
