import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspace = await readFile(new URL("./IntegrationsWorkspaceLayer.jsx", import.meta.url), "utf8");
const appMain = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
const registry = await readFile(new URL("./system/integrations/projectIntegrationRegistry.js", import.meta.url), "utf8");
const wpSession = await readFile(new URL("./system/integrations/wordpressSession.js", import.meta.url), "utf8");

test("Integrations workspace verifies the four canonical connection types", () => {
  for (const endpoint of ["/api/openai/status", "/api/dataforseo/status", "/api/google/status", "/api/google/properties", "/api/wordpress/test"]) assert.match(workspace, new RegExp(endpoint.replaceAll("/", "\\/")));
  assert.match(registry, /wordpress/);
  assert.match(registry, /openai/);
  assert.match(registry, /dataforseo/);
  assert.match(registry, /search-console/);
});

test("connection state is centralized and the workspace is mounted once", () => {
  assert.match(workspace, /buildProjectIntegrationRegistry/);
  assert.match(workspace, /validateSingleProjectIntegrationConfig/);
  assert.match(appMain, /<IntegrationsWorkspaceLayer \/>/);
  assert.equal((appMain.match(/<IntegrationsWorkspaceLayer \/>/g) || []).length, 1);
});

test("WordPress secrets remain transient and are not stored in the registry", () => {
  assert.match(wpSession, /const sessions = new Map\(\)/);
  assert.match(wpSession, /applicationPassword/);
  assert.doesNotMatch(registry, /applicationPassword\s*:/);
  assert.match(workspace, /getWordPressSession/);
});

test("project registry explains shared providers versus project bindings", () => {
  assert.match(registry, /scope: "shared-provider"/);
  assert.match(registry, /scope: "project"/);
  assert.match(workspace, /Provider runtime condiviso/);
  assert.match(workspace, /Configurazione progetto/);
});
