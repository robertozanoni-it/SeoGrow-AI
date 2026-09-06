import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isFrontendOnlyStaleMarkerLog } from "../scripts/wordpress-rankmath-general-e2e.mjs";

const workflow = await readFile(new URL("../.github/workflows/wordpress-staging-e2e.yml", import.meta.url), "utf8");

test("classifica il caso marker solo frontend come stale frontend isolato", () => {
  const log = [
    "[categoria] Confronti · api=inspection:true · api=db:true · api=frontend:false · duplicateRows:false",
    '[categoria] Marker SeoGrow · {"api":false,"inspection":false,"database":false,"cache":false,"frontend":true}',
  ].join("\n");
  assert.equal(isFrontendOnlyStaleMarkerLog(log), true);
});

test("non classifica come frontend-only una divergenza backend", () => {
  const log = [
    "[categoria] Confronti · api=inspection:false · api=db:true · api=frontend:false · duplicateRows:false",
    '[categoria] Marker SeoGrow · {"api":true,"inspection":false,"database":true,"cache":false,"frontend":true}',
  ].join("\n");
  assert.equal(isFrontendOnlyStaleMarkerLog(log), false);
});

test("workflow espone un solo mode generale Rank Math protetto dalla conferma write", () => {
  assert.match(workflow, /taxonomy-rank-math-general/);
  assert.match(workflow, /Rank Math general E2E/);
  assert.match(workflow, /node scripts\/wordpress-rankmath-general-e2e\.mjs/);
  assert.match(workflow, /inputs\.mode == 'taxonomy-rank-math-general' \|\| inputs\.mode == 'taxonomy-rank-math'/);
});
