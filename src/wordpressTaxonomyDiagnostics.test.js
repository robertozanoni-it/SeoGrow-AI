import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const diagnosticsModule = await readFile(
  new URL("../wordpress-plugin/seogrow-connector/taxonomy-diagnostics-read.php", import.meta.url),
  "utf8",
);
const loader = await readFile(
  new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url),
  "utf8",
);
const runner = await readFile(
  new URL("../scripts/wordpress-taxonomy-diagnostics.mjs", import.meta.url),
  "utf8",
);
const workflow = await readFile(
  new URL("../.github/workflows/wordpress-staging-e2e.yml", import.meta.url),
  "utf8",
);

test("Connector espone diagnostica tassonomie autenticata e strettamente READABLE", () => {
  assert.match(loader, /taxonomy-diagnostics-read\.php/);
  assert.match(diagnosticsModule, /\/taxonomy-diagnostics/);
  assert.match(diagnosticsModule, /WP_REST_Server::READABLE/);
  assert.match(diagnosticsModule, /'readOnly' => true/);
  assert.match(diagnosticsModule, /'writesPerformed' => 0/);
  assert.doesNotMatch(diagnosticsModule, /update_term_meta\s*\(/);
  assert.doesNotMatch(diagnosticsModule, /delete_term_meta\s*\(/);
  assert.doesNotMatch(diagnosticsModule, /add_term_meta\s*\(/);
  assert.doesNotMatch(diagnosticsModule, /wp_cache_delete\s*\(/);
  assert.doesNotMatch(diagnosticsModule, /clean_term_cache\s*\(/);
});

test("diagnostica confronta API meta, object cache e righe DB senza scrivere", () => {
  assert.match(diagnosticsModule, /get_term_meta\s*\(/);
  assert.match(diagnosticsModule, /wp_cache_get\s*\(/);
  assert.match(diagnosticsModule, /SELECT meta_id, meta_value FROM/);
  assert.match(diagnosticsModule, /duplicateRows/);
  assert.match(diagnosticsModule, /rank_math_description/);
});

test("runner read-only confronta Connector, SeoGrow inspection e frontend", () => {
  assert.match(runner, /taxonomy-diagnostics/);
  assert.match(runner, /inspect-taxonomy/);
  assert.match(runner, /metaDescriptionFromHtml/);
  assert.match(runner, /api=inspection/);
  assert.match(runner, /api=db/);
  assert.match(runner, /api=frontend/);
  assert.match(runner, /Marker SeoGrow/);
  assert.doesNotMatch(runner, /taxonomy-apply/);
  assert.doesNotMatch(runner, /taxonomy-preview/);
  assert.doesNotMatch(runner, /YES_I_UNDERSTAND/);
});

test("workflow separa diagnostica e sampler read-only dalla guardia di scrittura", () => {
  assert.match(workflow, /taxonomy-read-only-diagnostics/);
  assert.match(workflow, /Taxonomy read-only diagnostics/);
  assert.match(workflow, /taxonomy-consistency-sampler/);
  assert.match(workflow, /Taxonomy consistency sampler read-only/);
  assert.match(workflow, /inputs\.mode == 'taxonomy-rank-math' \|\| inputs\.mode == 'taxonomy-yoast'/);
  assert.match(workflow, /node scripts\/wordpress-taxonomy-diagnostics\.mjs/);
  assert.match(workflow, /node scripts\/wordpress-taxonomy-consistency-sampler\.mjs/);
  assert.match(workflow, /diagnostica, sampler ed Elementor sono read-only/);
});
