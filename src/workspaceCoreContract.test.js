import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";

const restoreSource = await readFile(new URL("./workspaceRestore.js", import.meta.url), "utf8");

const EXPECTED_KEYS = {
  rankings: "seogrow-rankings-v1",
  topicalMaps: "seogrow-topical-maps-v1",
  geoData: "seogrow-geo-v1",
  contentDrafts: "seogrow-content-drafts-v1",
  wordpressProfiles: "seogrow-wordpress-profiles-v1",
  auditMonitor: "seogrow-audit-monitor-v1",
  pageAuditHistory: "seogrow-page-audit-history-v2",
  auditResults: "seogrow-quick-audits-v1",
  preferences: "seogrow-preferences-v1",
  snapshots: "seogrow-snapshots-v1",
  remediationLastBatch: "seogrow-remediation-last-batch-v1",
};

test("il Core registra anche i dataset già esistenti dei domini Suite", () => {
  for (const [name, key] of Object.entries(EXPECTED_KEYS)) {
    assert.equal(WORKSPACE_KEYS[name], key, `${name} deve conservare la chiave persistita esistente`);
  }
});

test("il restore usa il registry Core invece di ridefinire le chiavi dei domini", () => {
  assert.match(restoreSource, /import \{ WORKSPACE_KEYS \} from "\.\/core\/workspace\/storageKeys\.js"/);
  for (const name of Object.keys(EXPECTED_KEYS)) {
    assert.match(restoreSource, new RegExp(`WORKSPACE_KEYS\\.${name}`));
  }
  assert.doesNotMatch(restoreSource, /"seogrow-(?:rankings|topical-maps|geo|content-drafts|wordpress-profiles|audit-monitor|page-audit-history|quick-audits|preferences|snapshots|remediation-last-batch)-/);
});
