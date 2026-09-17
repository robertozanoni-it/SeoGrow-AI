import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const settings = await readFile(new URL("./SettingsWorkspaceLayer.jsx", import.meta.url), "utf8");
const api = await readFile(new URL("./api.js", import.meta.url), "utf8");
const retention = await readFile(new URL("./projectRetention.js", import.meta.url), "utf8");
const draftApproval = await readFile(new URL("./WordPressDraftApprovalInvariant.js", import.meta.url), "utf8");
const batchGuard = await readFile(new URL("./BatchFeatureFlagGuard.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
const serverIndex = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const providerEnv = await readFile(new URL("../server/providerEnv.js", import.meta.url), "utf8");
const localSecurity = await readFile(new URL("../server/localSecurity.js", import.meta.url), "utf8");
const openAiBudget = await readFile(new URL("../server/openAiBudget.js", import.meta.url), "utf8");

test("Settings exposes project policies instead of hidden controls", () => {
  for (const label of ["Esclusioni Audit", "Policy correzioni", "Sicurezza write", "Retention e log", "Feature flag progetto"]) assert.match(settings, new RegExp(label));
  assert.match(settings, /Path aggiuntivi da escludere/);
  assert.match(settings, /Abilita scritture WordPress per questo progetto/);
  assert.match(settings, /Diagnostica OpenAI in GEO AI/);
  assert.match(settings, /Batch AutoFix/);
  assert.match(settings, /Generazione editoriale/);
  assert.match(settings, /API key, OAuth secret e token non vengono salvati/);
});

test("write kill-switch blocks apply/create paths but keeps preview and rollback available", () => {
  for (const path of ["/api/wordpress/draft", "/api/wordpress/live-apply", "/api/wordpress/taxonomy-apply", "/api/wordpress/elementor-shared-link-apply"]) assert.match(api, new RegExp(path.replaceAll("/", "\\/")));
  const writeSet = api.match(/export const isWordPressWriteRequest[\s\S]*?\]\)\.has\(String\(path \|\| ""\)\);/)?.[0] || "";
  assert.ok(writeSet);
  assert.doesNotMatch(writeSet, /rollback/i);
  assert.doesNotMatch(writeSet, /preview/i);
  assert.match(api, /PROJECT_WRITES_DISABLED/);
});

test("feature flags are enforced where actions occur", () => {
  assert.match(api, /geoDiagnostics/);
  assert.match(api, /editorialGeneration/);
  assert.match(api, /PROJECT_FEATURE_DISABLED/);
  assert.match(batchGuard, /batchAutoFix/);
  assert.match(batchGuard, /Batch AutoFix è disattivato/);
  assert.match(batchGuard, /preventDefault/);
});

test("retention trims only non-authoritative histories", () => {
  for (const key of ["analyses", "pageAuditHistory", "rankings", "agentRuns", "geoData"]) assert.match(retention, new RegExp(`WORKSPACE_KEYS\\.${key}`));
  assert.doesNotMatch(retention, /remediation|correction|TASKS_KEY|WORKSPACE_KEYS\.tasks/i);
});

test("mandatory approval remains enforced without rewriting the legacy preference", () => {
  assert.match(draftApproval, /Invia come bozza/i);
  assert.match(draftApproval, /confirmAction/);
  assert.match(draftApproval, /preventDefault/);
  assert.match(draftApproval, /approveWordPress !== true/);
  assert.match(main, /WordPressDraftApprovalInvariant/);
  assert.match(main, /BatchFeatureFlagGuard/);
  assert.match(main, /projectRetention/);
  assert.match(main, /SettingsWorkspaceLayer/);
});

test("user project policy is not hidden in production server environment variables", () => {
  const productionServer = [serverIndex, providerEnv, localSecurity, openAiBudget].join("\n");
  for (const policyName of ["writesEnabled", "excludedPaths", "batchAutoFix", "geoDiagnostics", "editorialGeneration", "auditRuns", "rankingRuns", "agentRuns", "geoSnapshots"]) {
    assert.doesNotMatch(productionServer, new RegExp(`process\\.env\\.[A-Z0-9_]*${policyName}`, "i"), `${policyName} must remain a project preference, not an env-only switch`);
  }
});
