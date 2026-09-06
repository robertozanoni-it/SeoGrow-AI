import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isFrontendOnlyStaleMarkerLog, isSeoGrowE2EMarker } from "../scripts/wordpress-rankmath-general-e2e.mjs";

const workflow = await readFile(new URL("../.github/workflows/wordpress-staging-e2e.yml", import.meta.url), "utf8");
const general = await readFile(new URL("../scripts/wordpress-rankmath-general-e2e.mjs", import.meta.url), "utf8");
const publicCachePreflight = await readFile(new URL("../scripts/wordpress-rankmath-public-cache-purge-preflight.mjs", import.meta.url), "utf8");
const loader = await readFile(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");
const purgeModule = await readFile(new URL("../wordpress-plugin/seogrow-connector/taxonomy-public-cache-purge.php", import.meta.url), "utf8");
const recoveryModule = await readFile(new URL("../wordpress-plugin/seogrow-connector/taxonomy-recovery-journal.php", import.meta.url), "utf8");
const recoveryAuto = await readFile(new URL("../wordpress-plugin/seogrow-connector/taxonomy-recovery-auto-journal.php", import.meta.url), "utf8");

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

test("riconosce solo marker SeoGrow E2E con timestamp ISO", () => {
  assert.equal(isSeoGrowE2EMarker("SeoGrow E2E categoria 2026-09-06T09:45:57.538Z"), true);
  assert.equal(isSeoGrowE2EMarker("SeoGrow E2E tag 2026-09-06T09:45:57Z"), true);
  assert.equal(isSeoGrowE2EMarker("normale meta description"), false);
  assert.equal(isSeoGrowE2EMarker("SeoGrow E2E categoria modificato"), false);
});

test("workflow espone il mode generale Rank Math protetto dalla conferma write e dal cache preflight", () => {
  assert.match(workflow, /taxonomy-rank-math-general/);
  assert.match(workflow, /Rank Math public-cache purge capability preflight/);
  assert.match(workflow, /node scripts\/wordpress-rankmath-public-cache-purge-preflight\.mjs/);
  assert.match(workflow, /Rank Math general E2E/);
  assert.match(workflow, /node scripts\/wordpress-rankmath-general-e2e\.mjs/);
  assert.match(workflow, /inputs\.mode == 'taxonomy-rank-math-general' \|\| inputs\.mode == 'taxonomy-rank-math'/);
  assert.match(workflow, /recovery_original:/);
  assert.match(workflow, /SEOGROW_WP_RECOVERY_ORIGINAL: \$\{\{ inputs\.recovery_original \}\}/);
});

test("public-cache preflight richiede la build esatta e resta strettamente read-only", () => {
  assert.match(publicCachePreflight, /taxonomy-public-cache-purge-capability/);
  assert.match(publicCachePreflight, /litespeed-url-purge-20260906-v1/);
  assert.match(publicCachePreflight, /data\?\.readOnly !== true/);
  assert.match(publicCachePreflight, /data\?\.contentWritesPerformed !== 0/);
  assert.match(publicCachePreflight, /data\?\.cacheMutationPerformed !== false/);
});

test("Connector carica purge mirato e recovery journal persistente", () => {
  assert.match(loader, /taxonomy-public-cache-purge\.php/);
  assert.match(loader, /taxonomy-recovery-journal\.php/);
  assert.match(loader, /taxonomy-recovery-auto-journal\.php/);
  assert.match(purgeModule, /litespeed_purge_url/);
  assert.match(purgeModule, /taxonomy-public-cache-purge-capability/);
  assert.match(purgeModule, /litespeed-url-purge-20260906-v1/);
  assert.match(purgeModule, /contentWritesPerformed'\s*=>\s*0/);
  assert.match(purgeModule, /cacheMutationPerformed'\s*=>\s*true/);
  assert.match(purgeModule, /updated_term_meta/);
  assert.match(recoveryModule, /taxonomy-recovery-journal-20260906-v1/);
  assert.match(recoveryModule, /taxonomy-recovery-execute/);
  assert.match(recoveryModule, /seogrow_recovery_stale/);
  assert.match(recoveryModule, /singleRow/);
  assert.match(recoveryModule, /journalCleared'\s*=>\s*true/);
});

test("recovery journal si arma prima della write marker e si pulisce sul ritorno all'originale", () => {
  assert.match(recoveryAuto, /add_filter\('update_term_metadata'/);
  assert.match(recoveryAuto, /seogrow_connector_taxonomy_recovery_marker_valid\(\$meta_value\)/);
  assert.match(recoveryAuto, /'original'\s*=>\s*\$original/);
  assert.match(recoveryAuto, /'marker'\s*=>\s*\$marker/);
  assert.match(recoveryAuto, /update_option\(\$key, \$journal, false\)/);
  assert.match(recoveryAuto, /delete_option\(\$key\)/);
});

test("Rank Math general recupera marker persistito prima di qualunque nuovo ciclo E2E", () => {
  const detect = general.indexOf("RANK_MATH_GENERAL=STABLE_ORPHAN_MARKER_DETECTED");
  const recover = general.indexOf('wordpressPost("taxonomy-recovery-execute"', detect);
  const complete = general.indexOf("RANK_MATH_GENERAL=ORPHAN_MARKER_RECOVERED", recover);
  const writeCycle = general.indexOf("single controlled apply/verify/rollback cycle", complete);
  assert.ok(detect >= 0 && recover > detect && complete > recover && writeCycle > complete);
  assert.match(general, /RANK_MATH_GENERAL=RECOVERY_ORIGINAL_REQUIRED/);
  assert.match(general, /Nessun nuovo E2E viene eseguito in questo run/);
});

test("Rank Math general usa il purge mirato solo nel caso frontend-only e si ferma dopo recovery", () => {
  const stale = general.indexOf("RANK_MATH_GENERAL=FRONTEND_ONLY_STALE_MARKER");
  const purge = general.indexOf("const purge = await purgePublicCache(target.url);", stale);
  const recovered = general.indexOf("RANK_MATH_GENERAL=PUBLIC_CACHE_RECOVERED", purge);
  const complete = general.indexOf("RANK_MATH_GENERAL=RECOVERY_COMPLETE", recovered);
  assert.ok(stale >= 0 && purge > stale && recovered > purge && complete > recovered);
  assert.match(general, /RANK_MATH_GENERAL=PUBLIC_CACHE_PURGE_INEFFECTIVE/);
  assert.match(general, /contentWritesPerformed !== 0/);
  assert.match(general, /purgeRequested !== true/);
});
