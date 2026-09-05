import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extractRestElementorData,
  normalizeConnectorReferenceData,
  normalizeRestBase,
} from "../server/elementorReferenceImpactHook.js";

const source = await readFile(
  new URL("../server/elementorReferenceImpactHook.js", import.meta.url),
  "utf8",
);

const inventory = {
  resources: [
    { id: 10, postType: "page", url: "https://example.com/a/" },
    { id: 20, postType: "product", url: "https://example.com/b/" },
  ],
};

const connectorPayload = {
  source: "seogrow-connector",
  resource: "elementor-reference-data",
  readOnly: true,
  sharedWriteAllowed: false,
  complete: true,
  requestedDocuments: 2,
  documents: [
    {
      ok: true,
      id: 10,
      postType: "page",
      status: "publish",
      url: "https://example.com/a/",
      elementorData: '[{"settings":{"template_id":42}}]',
      readOnly: true,
      sharedWriteAllowed: false,
    },
    {
      ok: true,
      id: 20,
      postType: "product",
      status: "publish",
      url: "https://example.com/b/",
      elementorData: "",
      readOnly: true,
      sharedWriteAllowed: false,
    },
  ],
};

test("meta Elementor REST vuoto è una scansione valida senza riferimenti", () => {
  assert.deepEqual(extractRestElementorData({ meta: { _elementor_data: "" } }), {
    ok: true,
    status: "no-elementor-data",
    value: [],
  });
});

test("meta Elementor non esposto resta fail-closed", () => {
  assert.equal(extractRestElementorData({ meta: {} }).ok, false);
  assert.equal(extractRestElementorData({}).status, "elementor-meta-unavailable");
});

test("page e post usano rest base core note", () => {
  assert.deepEqual(normalizeRestBase("page", null), {
    ok: true,
    restBase: "pages",
    source: "core-known",
  });
  assert.deepEqual(normalizeRestBase("post", null), {
    ok: true,
    restBase: "posts",
    source: "core-known",
  });
});

test("custom post type usa solo rest_base dichiarata e sicura", () => {
  assert.deepEqual(normalizeRestBase("product", { rest_base: "products" }), {
    ok: true,
    restBase: "products",
    source: "wordpress-type-descriptor",
  });
  assert.equal(normalizeRestBase("product", { rest_base: "../users" }).ok, false);
  assert.equal(normalizeRestBase("product", { rest_base: "products/v2" }).ok, false);
  assert.equal(normalizeRestBase("product", {}).ok, false);
});

test("Connector reference data valida produce righe read-only anche per CPT", () => {
  const normalized = normalizeConnectorReferenceData(connectorPayload, inventory);
  assert.equal(normalized.ok, true);
  assert.equal(normalized.rows.length, 2);
  assert.deepEqual(normalized.rows[0].scan.references, [
    { id: 42, key: "template_id", referenceKind: "template-widget" },
  ]);
  assert.equal(normalized.rows[1].scan.ok, true);
});

test("Connector spoofato o non read-only viene rifiutato", () => {
  assert.equal(normalizeConnectorReferenceData({ ...connectorPayload, source: "client" }, inventory).ok, false);
  assert.equal(normalizeConnectorReferenceData({ ...connectorPayload, readOnly: false }, inventory).ok, false);
  assert.equal(normalizeConnectorReferenceData({ ...connectorPayload, sharedWriteAllowed: true }, inventory).ok, false);
});

test("mismatch ID, post type o URL Connector fallisce chiuso", () => {
  const wrongId = structuredClone(connectorPayload);
  wrongId.documents[0].id = 999;
  assert.equal(normalizeConnectorReferenceData(wrongId, inventory).ok, false);

  const wrongType = structuredClone(connectorPayload);
  wrongType.documents[1].postType = "post";
  assert.equal(normalizeConnectorReferenceData(wrongType, inventory).ok, false);

  const wrongUrl = structuredClone(connectorPayload);
  wrongUrl.documents[0].url = "https://example.com/other/";
  assert.equal(normalizeConnectorReferenceData(wrongUrl, inventory).ok, false);
});

test("duplicati o set documenti incompleto Connector vengono rifiutati", () => {
  const duplicate = structuredClone(connectorPayload);
  duplicate.documents[1] = { ...duplicate.documents[0] };
  assert.equal(normalizeConnectorReferenceData(duplicate, inventory).ok, false);

  const incomplete = structuredClone(connectorPayload);
  incomplete.documents.pop();
  incomplete.requestedDocuments = 1;
  assert.equal(normalizeConnectorReferenceData(incomplete, inventory).ok, false);
});

test("hook preferisce Connector reference data e REST è fallback solo su 404", () => {
  assert.match(source, /elementor-reference-data/);
  assert.match(source, /connectorResponse\.status === 404/);
  assert.match(source, /normalizeConnectorReferenceData/);
  assert.match(source, /readRowsViaRest/);
  assert.doesNotMatch(source, /connectorResponse\.status >= 400.*readRowsViaRest/s);
});

test("fallback REST continua a risolvere CPT via type descriptor sicuro", () => {
  assert.match(source, /\/wp-json\/wp\/v2\/types\//);
  assert.match(source, /rest_base/);
  assert.match(source, /unsupported-authoritative-post-types/);
});

test("lettura documenti usa context edit e parser _elementor_data", () => {
  assert.match(source, /\?context=edit/);
  assert.match(source, /_elementor_data/);
  assert.match(source, /scanElementorExplicitReferences/);
  assert.match(source, /aggregateElementorReferenceImpact/);
});

test("cross-page impact resta strettamente read-only", () => {
  assert.doesNotMatch(source, /sharedWriteAllowed:\s*true/);
  assert.match(source, /sharedWriteAllowed:\s*false/);
  assert.doesNotMatch(source, /wp_update_post|update_post_meta|delete_post_meta|WP_REST_Server::CREATABLE/i);
});

test("route cross-page è POST locale e fallisce chiusa sugli errori", () => {
  assert.match(source, /\/api\/wordpress\/elementor-reference-impact/);
  assert.match(source, /app\.post\(ROUTE/);
  assert.match(source, /affectedPagesEnumerated:\s*false/);
});
