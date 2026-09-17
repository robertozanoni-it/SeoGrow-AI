import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PROJECT_POLICY,
  USER_CONTROLLABLE_SETTINGS,
  SERVER_ONLY_CONFIGURATION,
  normalizeProjectPolicy,
  pathExcludedByProjectPolicy,
  projectFeatureEnabled,
  projectPolicyFromPreferences,
  projectWriteAllowed,
  writeProjectPolicy,
} from "./system/settings/projectPolicy.js";

const unsafeInput = {
  audit: { excludeLegalPages: false, excludedPaths: ["/thank-you/", " /private/ ", "/thank-you/"] },
  corrections: { requireApproval: false },
  writeSecurity: { writesEnabled: false, requirePreview: false, requireFreshPreflight: false, requireRollbackReceipt: false },
  retention: { auditRuns: 3, rankingRuns: 4, agentRuns: 5, geoSnapshots: 6 },
  featureFlags: { geoDiagnostics: false, batchAutoFix: false, editorialGeneration: false },
};

test("project policy keeps safety invariants non-weakenable", () => {
  const policy = normalizeProjectPolicy(unsafeInput);
  assert.equal(policy.audit.excludeLegalPages, true);
  assert.equal(policy.corrections.requireApproval, true);
  assert.equal(policy.writeSecurity.writesEnabled, false);
  assert.equal(policy.writeSecurity.requirePreview, true);
  assert.equal(policy.writeSecurity.requireFreshPreflight, true);
  assert.equal(policy.writeSecurity.requireRollbackReceipt, true);
  assert.deepEqual(policy.audit.excludedPaths, ["/thank-you/", "/private/"]);
});

test("project policy is isolated per client and preserves unrelated project settings", () => {
  const preferences = {
    name: "Admin",
    projectSettings: {
      1: { editorialSchedule: [{ id: "keep" }], report: { brand: "A" } },
      2: { objective: "Keep project two" },
    },
  };
  const next = writeProjectPolicy(preferences, 1, unsafeInput);
  assert.deepEqual(next.projectSettings[1].editorialSchedule, [{ id: "keep" }]);
  assert.deepEqual(next.projectSettings[1].report, { brand: "A" });
  assert.equal(next.projectSettings[2].objective, "Keep project two");
  assert.equal(projectPolicyFromPreferences(next, 1).writeSecurity.writesEnabled, false);
  assert.equal(projectPolicyFromPreferences(next, 2).writeSecurity.writesEnabled, DEFAULT_PROJECT_POLICY.writeSecurity.writesEnabled);
});

test("audit path exclusions match exact path and descendants without fuzzy text matching", () => {
  const policy = normalizeProjectPolicy({ audit: { excludedPaths: ["/thank-you/", "/area-riservata"] } });
  assert.equal(pathExcludedByProjectPolicy("https://example.com/thank-you/", policy), true);
  assert.equal(pathExcludedByProjectPolicy("https://example.com/thank-you/sub/", policy), true);
  assert.equal(pathExcludedByProjectPolicy("https://example.com/blog/thank-you-seo/", policy), false);
  assert.equal(pathExcludedByProjectPolicy("https://example.com/area-riservata/account/", policy), true);
});

test("write and feature gates follow the normalized project policy", () => {
  const policy = normalizeProjectPolicy(unsafeInput);
  assert.equal(projectWriteAllowed(policy), false);
  assert.equal(projectFeatureEnabled(policy, "geoDiagnostics"), false);
  assert.equal(projectFeatureEnabled(policy, "batchAutoFix"), false);
  assert.equal(projectFeatureEnabled(policy, "editorialGeneration"), false);
  assert.equal(projectFeatureEnabled(policy, "unknownFeature"), false);
});

test("user-controlled policy and server-only configuration stay explicitly separated", () => {
  assert.ok(USER_CONTROLLABLE_SETTINGS.includes("writeSecurity.writesEnabled"));
  assert.ok(USER_CONTROLLABLE_SETTINGS.includes("audit.excludedPaths"));
  assert.ok(USER_CONTROLLABLE_SETTINGS.includes("featureFlags.batchAutoFix"));
  assert.ok(SERVER_ONLY_CONFIGURATION.some((item) => /credentials|oauth/i.test(item)));
  assert.ok(SERVER_ONLY_CONFIGURATION.some((item) => /local api token/i.test(item)));
  assert.equal(SERVER_ONLY_CONFIGURATION.some((item) => /writesenabled|excludedpaths|featureflags/i.test(item)), false);
});
