import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isFrontendOnlyStaleMarkerLog } from "../scripts/wordpress-rankmath-general-e2e.mjs";

const workflow = await readFile(new URL("../.github/workflows/wordpress-staging-e2e.yml", import.meta.url), "utf8");
const general = await readFile(new URL("../scripts/wordpress-rankmath-general-e2e.mjs", import.meta.url), "utf8");
const publicCachePreflight = await readFile(new URL("../scripts/wordpress-rankmath-public-cache-purge-preflight.mjs", import.meta.url), "utf8");
const loader = await readFile(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");
const purgeModule = await readFile(new URL("../wordpress-plugin/seogrow-connector/taxonomy-public-cache-purge.php", import.meta.url), "utf8");

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

test("workflow espone il mode generale Rank Math protetto dalla conferma write e dal cache preflight", () => {
  assert.match(workflow, /taxonomy-rank-math-general/);
  assert.match(workflow, /Rank Math public-cache purge capability preflight/);
  assert.match(workflow, /node scripts\/wordpress-rankmath-public-cache-purge-preflight\.mjs/);
  assert.match(workflow, /Rank Math general E2E/);
  assert.match(workflow, /node scripts\/wordpress-rankmath-general-e2e\.mjs/);
  assert.match(workflow, /inputs\.mode == 'taxonomy-rank-math-general' \|\| inputs\.mode == 'taxonomy-rank-math'/);
});

test("public-cache preflight richiede la build esatta e resta strettamente read-only", () => {
  assert.match(publicCachePreflight, /taxonomy-public-cache-purge-capability/);
  assert.match(publicCachePreflight, /litespeed-url-purge-20260906-v1/);
  assert.match(publicCachePreflight, /data\?\.readOnly !== true/);
  assert.match(publicCachePreflight, /data\?\.contentWritesPerformed !== 0/);
  assert.match(publicCachePreflight, /data\?\.cacheMutationPerformed !== false/);
});

test("Connector carica un purge mirato cache-only per tassonomie Rank Math", () => {
  assert.match(loader, /taxonomy-public-cache-purge\.php/);
  assert.match(purgeModule, /litespeed_purge_url/);
  assert.match(purgeModule, /taxonomy-public-cache-purge-capability/);
  assert.match(purgeModule, /litespeed-url-purge-20260906-v1/);
  assert.match(purgeModule, /contentWritesPerformed'\s*=>\s*0/);
  assert.match(purgeModule, /cacheMutationPerformed'\s*=>\s*true/);
  assert.match(purgeModule, /cacheMutationPerformed'\s*=>\s*false/);
  assert.match(purgeModule, /updated_term_meta/);
  assert.match(purgeModule, /rank_math_description/);
});

test("Rank Math general usa il purge mirato solo nel caso frontend-only e verifica dopo il purge", () => {
  const stale = general.indexOf("RANK_MATH_GENERAL=FRONTEND_ONLY_STALE_MARKER");
  const purge = general.indexOf("const purge = await purgePublicCache(url);", stale);
  const verify = general.indexOf("RANK_MATH_GENERAL=PUBLIC_CACHE_RECOVERED", purge);
  const writeCycle = general.indexOf("single controlled apply/verify/rollback cycle", verify);
  assert.ok(stale >= 0 && purge > stale && verify > purge && writeCycle > verify);
  assert.match(general, /RANK_MATH_GENERAL=PUBLIC_CACHE_PURGE_INEFFECTIVE/);
  assert.match(general, /contentWritesPerformed !== 0/);
  assert.match(general, /purgeRequested !== true/);
});
