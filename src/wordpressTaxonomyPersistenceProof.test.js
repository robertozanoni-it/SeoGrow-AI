import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const moduleSource = fs.readFileSync(new URL("../wordpress-plugin/seogrow-connector/taxonomy-persistence-proof.php", import.meta.url), "utf8");
const loader = fs.readFileSync(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");

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

test("persistence proof è read-after-write: non introduce nuove scritture", () => {
  assert.doesNotMatch(moduleSource, /update_term_meta\s*\(/);
  assert.doesNotMatch(moduleSource, /add_term_meta\s*\(/);
  assert.doesNotMatch(moduleSource, /delete_term_meta\s*\(/);
  assert.doesNotMatch(moduleSource, /\$wpdb->(?:insert|update|delete|query)\s*\(/);
});
