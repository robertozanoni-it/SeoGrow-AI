import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const connector = await readFile(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");
const writer = await readFile(new URL("../wordpress-plugin/seogrow-connector/elementor-link-cleanup-write.php", import.meta.url), "utf8");
const issueKind = await readFile(new URL("./remediationIssueKind.js", import.meta.url), "utf8");
const presentation = await readFile(new URL("./correctionPresentation.js", import.meta.url), "utf8");

test("il Connector include il writer atomico dedicato ai link Elementor", () => {
  assert.match(connector, /elementor-link-cleanup-write\.php/);
  assert.match(writer, /\/seogrow\/v1\/atomic-write/);
  assert.match(writer, /current_user_can\('edit_post', \$id\)/);
  assert.match(writer, /array\('posts', 'pages'\)/);
  assert.match(writer, /_elementor_edit_mode/);
  assert.match(writer, /_elementor_template_type/);
  assert.match(writer, /BINARY meta_value = BINARY %s/);
  assert.match(writer, /elementor-single-external-link-cas-v1/);
});

test("il writer accetta soltanto una singola trasformazione anchor -> testo e supporta rollback", () => {
  assert.match(writer, /\$changed !== 0/);
  assert.match(writer, /count\(\$valid\) !== 1/);
  assert.match(writer, /\$operation === 'rollback'/);
  assert.match(writer, /seogrow_elementor_link_cleanup_external_url/);
});

test("broken external link è classificato e la UI mostra la destinazione esatta", () => {
  assert.match(issueKind, /"broken-external-link": "external_link"/);
  assert.match(presentation, /Link esatto da correggere:/);
  assert.match(presentation, /Elementor\/WordPress, non da Rank Math o Yoast/);
});
