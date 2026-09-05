import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const loader = await readFile(
  new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url),
  "utf8",
);
const core = await readFile(
  new URL("../wordpress-plugin/seogrow-connector/seogrow-connector-core.inc", import.meta.url),
  "utf8",
);
const reference = await readFile(
  new URL("../wordpress-plugin/seogrow-connector/elementor-reference-read.php", import.meta.url),
  "utf8",
);

test("loader conserva un solo header plugin e carica core più modulo reference", () => {
  assert.match(loader, /Plugin Name: SeoGrow Connector/);
  assert.match(loader, /Version: 1\.3\.0/);
  assert.match(loader, /require_once __DIR__ \. '\/seogrow-connector-core\.inc'/);
  assert.match(loader, /require_once __DIR__ \. '\/elementor-reference-read\.php'/);
  assert.equal((loader.match(/Plugin Name:/g) || []).length, 1);
});

test("core conserva versione e contratti storici dopo lo split", () => {
  assert.match(core, /SEOGROW_CONNECTOR_VERSION = '1\.3\.0'/);
  assert.match(core, /\/elementor-impact-inspect/);
  assert.match(core, /\/wordpress-public-inventory/);
  assert.match(core, /\/taxonomy-inspect/);
  assert.match(core, /\/taxonomy-write/);
});

test("modulo reference è separato e strettamente read-only", () => {
  assert.match(reference, /\/elementor-reference-data/);
  assert.match(reference, /WP_REST_Server::READABLE/);
  assert.doesNotMatch(reference, /WP_REST_Server::CREATABLE|update_post_meta|delete_post_meta|wp_update_post/i);
  assert.doesNotMatch(reference, /sharedWriteAllowed'\s*=>\s*true/);
});
