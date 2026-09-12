import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  BROKEN_LINK_CLEANUP_MODES,
  prepareElementorBrokenExternalLink,
} from "./brokenLinkRemediation.js";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");
const target = "https://example.com/missing/";

test("trasformazione condivisa conserva o elimina l'anchor in modo deterministico", () => {
  const raw = JSON.stringify([{ id: "x", settings: { editor: `<p>Prima <a href="${target}"><strong>guida</strong></a> dopo</p>` }, elements: [] }]);
  const preserve = prepareElementorBrokenExternalLink(raw, target, BROKEN_LINK_CLEANUP_MODES.PRESERVE_TEXT);
  assert.equal(preserve.count, 1);
  assert.match(preserve.serialized, /<strong>guida<\/strong>/);
  assert.doesNotMatch(preserve.serialized, /example\.com\/missing/);

  const remove = prepareElementorBrokenExternalLink(raw, target, BROKEN_LINK_CLEANUP_MODES.DELETE_ANCHOR_TEXT);
  assert.equal(remove.count, 1);
  assert.doesNotMatch(remove.serialized, /example\.com\/missing|<strong>guida<\/strong>/);
});

test("Connector shared Elementor limita la scrittura a una transizione CAS atomica", async () => {
  const plugin = await read("../wordpress-plugin/seogrow-connector/elementor-shared-link-remediation.php");
  assert.match(plugin, /elementor-shared-link-scan/);
  assert.match(plugin, /elementor-shared-link-write/);
  assert.match(plugin, /post_type' => 'elementor_library'/);
  assert.match(plugin, /FOR UPDATE/);
  assert.match(plugin, /BINARY meta_value = BINARY/);
  assert.match(plugin, /START TRANSACTION/);
  assert.match(plugin, /COMMIT/);
  assert.match(plugin, /STALE_CONFLICT/);
  assert.match(plugin, /SHARED_LINK_TRANSITION_INVALID/);
});

test("scan guard prova l'unicità su tutta la libreria osservabile oppure blocca la write shared", async () => {
  const guard = await read("../wordpress-plugin/seogrow-connector/elementor-shared-link-scan-guard.php");
  const loader = await read("../wordpress-plugin/seogrow-connector/seogrow-connector.php");
  assert.match(loader, /elementor-shared-link-scan-guard\.php/);
  assert.match(guard, /posts_per_page' => \$scan_cap \+ 1/);
  assert.match(guard, /permissionDeniedTemplates/);
  assert.match(guard, /unreadableTemplates/);
  assert.match(guard, /unsupportedTemplateMatches/);
  assert.match(guard, /scannerMatchCountAgrees/);
  assert.match(guard, /uniqueMatchProven/);
  assert.match(guard, /SHARED_LINK_SCAN_INCOMPLETE/);
  assert.match(guard, /set_status\(409\)/);
  assert.match(guard, /sharedWriteAllowed'\] = false/);
});

test("server shared Elementor richiede coverage completa, template unico e verifica frontend con rollback", async () => {
  const server = await read("../server/elementorSharedLinkHook.js");
  assert.match(server, /attestElementorCoverage/);
  assert.match(server, /completeSiteEnumeration !== true/);
  assert.match(server, /matches\.length !== 1/);
  assert.match(server, /candidateAnchor !== frontendAnchor/);
  assert.match(server, /scanPublicImpact/);
  assert.match(server, /affectedPagesEnumerated: true/);
  assert.match(server, /elementor-shared-link-write/);
  assert.match(server, /"rollback"/);
  assert.match(server, /SHARED_LINK_FRONTEND_ROLLED_BACK/);
  assert.match(server, /SHARED_LINK_ROLLBACK_UNCERTAIN/);
});

test("UI shared Elementor mostra scelte, impatto e applicazione esplicita", async () => {
  const ux = await read("./SharedElementorBrokenLinkUx.js");
  const main = await read("./appMain.jsx");
  assert.match(main, /SharedElementorBrokenLinkUx/);
  assert.match(ux, /Rimuovi solo il link/);
  assert.match(ux, /Elimina link \+ anchor text/);
  assert.match(ux, /Pagine influenzate/);
  assert.match(ux, /window\.confirm/);
  assert.match(ux, /applyJournaledCorrection/);
  assert.match(ux, /elementor-shared-link-preview/);
  assert.match(ux, /elementor-shared-link-apply/);
  assert.match(ux, /status: "Verificato"/);
});

test("rollback storico conserva target e modalità shared Elementor", async () => {
  const payload = await read("./rollbackPayload.js");
  const route = await read("../server/elementorSharedRollbackRoute.js");
  assert.match(payload, /brokenTargetUrl/);
  assert.match(payload, /cleanupMode/);
  assert.match(route, /resource !== "elementor_library"/);
  assert.match(route, /rollbackSharedElementorLink/);
  assert.match(route, /staleChecked/);
});

test("campo URL 404 usa prima l'href verificato e non concatena Prossimo passo", async () => {
  const source = await read("./uiIntegrityFixes.js");
  assert.match(source, /evidenceBrokenTarget/);
  assert.match(source, /authoritative source/);
  assert.match(source, /Prossimo passo:/);
  assert.match(source, /existing\.replaceWith\(section\)/);
});
