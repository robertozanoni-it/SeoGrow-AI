import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../wordpress-plugin/seogrow-connector/elementor-reference-read.php", import.meta.url),
  "utf8",
);

test("endpoint reference data è strettamente READABLE", () => {
  assert.match(source, /elementor-reference-data/);
  assert.match(source, /WP_REST_Server::READABLE/);
  assert.doesNotMatch(source, /WP_REST_Server::CREATABLE/);
});

test("reference data limita gli ID a 30 e richiede edit_post", () => {
  assert.match(source, /array_slice\(explode\(',', \$raw_ids\), 0, 30\)/);
  assert.match(source, /current_user_can\('edit_post', \$id\)/);
});

test("reference data accetta solo post pubblicati dei post type pubblici queryable", () => {
  assert.match(source, /seogrow_connector_public_queryable_post_types/);
  assert.match(source, /\$post->post_status !== 'publish'/);
  assert.match(source, /in_array\(\$post->post_type, \$public_post_types, true\)/);
});

test("reference data legge _elementor_data senza primitive di scrittura", () => {
  assert.match(source, /metadata_exists\('post', \$id, '_elementor_data'\)/);
  assert.match(source, /get_post_meta\(\$id, '_elementor_data', true\)/);
  assert.doesNotMatch(source, /update_post_meta|delete_post_meta|wp_update_post|wp_insert_post|set_post_meta/i);
});

test("contratto resta fail-closed e non abilita shared write", () => {
  assert.match(source, /'complete' => count\(\$documents\) === count\(\$ids\)/);
  assert.doesNotMatch(source, /'sharedWriteAllowed'\s*=>\s*true/);
  assert.match(source, /'sharedWriteAllowed'\s*=>\s*false/);
});
