import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULE_WORKSPACE_VIEWS,
  moduleCanAccessWorkspaceKey,
  moduleWorkspaceKeyNames,
  moduleWorkspaceKeys,
  moduleWorkspaceView,
} from "./core/workspace/moduleWorkspaceViews.js";
import { WORKSPACE_KEYS, SESSION_KEYS } from "./core/workspace/storageKeys.js";

test("ogni modulo Suite dispone di una vista logica sul workspace condiviso", () => {
  const ids = MODULE_WORKSPACE_VIEWS.map((definition) => definition.moduleId);
  assert.deepEqual(ids, ["hub", "audit", "rank", "content", "links", "geo", "tasks", "agent", "publish", "system"]);
  assert.equal(new Set(ids).size, ids.length);
});

test("Rank, Content e GEO riusano i dataset esistenti senza crearne di nuovi", () => {
  assert.deepEqual(moduleWorkspaceKeyNames("rank"), ["clients", "selectedClient", "gsc", "gscHistory", "rankings"]);
  assert.ok(moduleWorkspaceKeyNames("content").includes("topicalMaps"));
  assert.ok(moduleWorkspaceKeyNames("content").includes("contentDrafts"));
  assert.ok(moduleWorkspaceKeyNames("geo").includes("geoData"));
  assert.ok(moduleWorkspaceKeys("rank").includes("seogrow-rankings-v1"));
  assert.ok(moduleWorkspaceKeys("content").includes("seogrow-content-drafts-v1"));
  assert.ok(moduleWorkspaceKeys("geo").includes("seogrow-geo-v1"));
});

test("Audit conserva evidenza mentre Publish possiede i dati di esecuzione WordPress", () => {
  assert.equal(moduleCanAccessWorkspaceKey("audit", "remediationHistory"), true);
  assert.equal(moduleCanAccessWorkspaceKey("audit", "wordpressProfiles"), false);
  assert.equal(moduleCanAccessWorkspaceKey("audit", "cmsRouter"), false);
  assert.equal(moduleCanAccessWorkspaceKey("audit", "remediationLastBatch"), false);
  assert.equal(moduleCanAccessWorkspaceKey("publish", WORKSPACE_KEYS.wordpressProfiles), true);
  assert.equal(moduleCanAccessWorkspaceKey("publish", "cmsRouter"), true);
  assert.equal(moduleCanAccessWorkspaceKey("publish", "remediationHistory"), true);
  assert.equal(moduleCanAccessWorkspaceKey("publish", "remediationLastBatch"), true);
  assert.equal(moduleCanAccessWorkspaceKey("rank", "wordpressProfiles"), false);
  assert.equal(moduleCanAccessWorkspaceKey("geo", "remediationHistory"), false);
});

test("CMS routing e prefill Agent sono registrati senza confondere workspace e sessione", () => {
  assert.equal(WORKSPACE_KEYS.cmsRouter, "seogrow-cms-router-v1");
  assert.equal(SESSION_KEYS.agentPrefill, "seogrow-agent-prefill-v1");
  assert.ok(moduleWorkspaceView("publish").names.includes("cmsRouter"));
  assert.equal(moduleWorkspaceView("missing"), null);
});
