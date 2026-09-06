import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const moduleSource = fs.readFileSync(new URL("../wordpress-plugin/seogrow-connector/taxonomy-persistence-proof.php", import.meta.url), "utf8");
const loader = fs.readFileSync(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");
const runner = fs.readFileSync(new URL("../scripts/wordpress-taxonomy-e2e.mjs", import.meta.url), "utf8");

test("Connector carica il persistence proof Rank Math", () => {
  assert.match(loader, /taxonomy-persistence-proof\.php/);
  assert.match(moduleSource, /rest_post_dispatch/);
  assert.match(moduleSource, /\/seogrow\/v1\/taxonomy-write/);
});

test("persistence proof confronta get_term_meta e wp_termmeta reale", () => {
  assert.match(moduleSource, /\$wpdb->termmeta/);
  assert.match(moduleSource, /seogrow_connector_rank_math_term_values/);
  assert.match(moduleSource, /dbRowCount/);
  assert.match(moduleSource, /apiMatches/);
  assert.match(moduleSource, /dbMatches/);
  assert.match(moduleSource, /seogrow_taxonomy_persistence_divergence/);
  assert.match(moduleSource, /seogrow_taxonomy_db_ambiguous/);
});

test("persistence proof espone un preflight strettamente read-only", () => {
  assert.match(moduleSource, /taxonomy-persistence-capability/);
  assert.match(moduleSource, /rankMathPersistenceProof/);
  assert.match(moduleSource, /writesPerformed' => 0/);
  assert.match(runner, /requireRankMathPersistenceCapability/);
  assert.match(runner, /wordpressReadOnly\("taxonomy-persistence-capability"\)/);
});

test("persistence proof è read-after-write: non introduce nuove scritture", () => {
  assert.doesNotMatch(moduleSource, /update_term_meta\s*\(/);
  assert.doesNotMatch(moduleSource, /add_term_meta\s*\(/);
  assert.doesNotMatch(moduleSource, /delete_term_meta\s*\(/);
  assert.doesNotMatch(moduleSource, /\$wpdb->(?:insert|update|delete|query)\s*\(/);
});

test("E2E tratta gli errori post-write come stato incerto e forza recovery", () => {
  assert.match(runner, /UNCERTAIN_WRITE_CODES/);
  assert.match(runner, /seogrow_taxonomy_persistence_divergence/);
  assert.match(runner, /RANK_MATH_PERSISTENCE_PROOF_REQUIRED/);
  assert.match(runner, /if \(isUncertainWriteError\(error\)\) \{\s*applied = true;/s);
  assert.match(runner, /safeRecovery\(target, adapter, original, marker\)/);
});

test("E2E richiede il proof completo sia su apply sia su rollback", () => {
  assert.match(runner, /assertPersistenceProof\(result, adapter, `\$\{target\.label\}: apply`\)/);
  assert.match(runner, /assertPersistenceProof\(applied, adapter, `\$\{target\.label\}: rollback`\)/);
  assert.match(runner, /proof\?\.dbRowCount !== 1/);
  assert.match(runner, /proof\?\.apiMatches !== true/);
  assert.match(runner, /proof\?\.dbMatches !== true/);
});
