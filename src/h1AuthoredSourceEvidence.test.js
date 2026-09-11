import test from "node:test";
import assert from "node:assert/strict";
import { inspectElementorAuthoredH1 } from "../server/elementorCoverageRouteDecorator.js";
import {
  assessCoreOwnership,
  verifiedElementorH1SourceFrontend,
} from "./wordpressOwnership.js";

const targetEntity = (evidence) => ({
  id: 6336,
  type: "post",
  meta: {
    _elementor_data: JSON.stringify([
      {
        id: "local-text",
        elType: "widget",
        widgetType: "text-editor",
        settings: {
          editor: "<h1>Yoga in Gravidanza</h1><p>Testo</p>",
        },
        elements: [],
      },
    ]),
  },
  _seogrowOwnership: {
    elementorLocalDocumentRendered: true,
    elementorExternalRenderedDocuments: [
      { id: 185, type: "header" },
      { id: 327, type: "footer" },
    ],
    elementorImpactEvidence: {
      h1SourceEvidence: evidence,
    },
  },
});

const completeEvidence = () => ({
  complete: true,
  readOnly: true,
  sharedWriteAllowed: false,
  targetEntityId: 6336,
  totalAuthoredH1: 1,
  dynamicH1Unknown: false,
  documents: [
    { id: 6336, role: "target", h1Count: 1, dynamicH1Unknown: false, complete: true },
    { id: 185, role: "shared-rendered-document", h1Count: 0, dynamicH1Unknown: false, complete: true },
    { id: 327, role: "shared-rendered-document", h1Count: 0, dynamicH1Unknown: false, complete: true },
  ],
});

test("scanner H1 Elementor conta heading e markup HTML senza inventare ownership", () => {
  const data = JSON.stringify([
    {
      id: "a",
      widgetType: "heading",
      settings: { title: "Titolo", header_size: "h1" },
      elements: [],
    },
    {
      id: "b",
      widgetType: "text-editor",
      settings: { editor: "<p>Prima</p><h1>Secondo</h1>" },
      elements: [],
    },
  ]);
  const result = inspectElementorAuthoredH1(data);
  assert.equal(result.complete, true);
  assert.equal(result.h1Count, 2);
  assert.equal(result.dynamicH1Unknown, false);
});

test("scanner H1 resta fail-closed quando un campo capace di produrre H1 è dinamico", () => {
  const data = JSON.stringify([
    {
      id: "a",
      widgetType: "text-editor",
      settings: {
        editor: "<p>Fallback</p>",
        __dynamic__: { editor: "[elementor-tag id=1]" },
      },
      elements: [],
    },
  ]);
  const result = inspectElementorAuthoredH1(data);
  assert.equal(result.complete, true);
  assert.equal(result.dynamicH1Unknown, true);
});

test("un solo H1 verificato tra target e documenti condivisi rende chiudibile un audit H1 obsoleto", () => {
  const entity = targetEntity(completeEvidence());
  const staticFrontend = {
    h1: 2,
    verificationSafe: false,
    requiresBrowserVerification: true,
  };
  const verified = verifiedElementorH1SourceFrontend(entity, staticFrontend);
  assert.ok(verified);
  assert.equal(verified.h1, 1);
  assert.equal(verified.verificationSafe, true);
  assert.equal(verified.requiresBrowserVerification, false);
  assert.equal(verified.h1SourceVerified, true);

  const ownership = assessCoreOwnership("h1", entity, staticFrontend);
  assert.equal(ownership.ok, false);
  assert.equal(ownership.frontend.h1, 1);
  assert.equal(ownership.frontend.h1SourceVerified, true);
  assert.match(ownership.reason, /nessuna scrittura è necessaria/i);
});

test("evidenza incompleta, dinamica o con set documenti diverso non chiude il falso positivo", () => {
  const incomplete = completeEvidence();
  incomplete.complete = false;
  assert.equal(verifiedElementorH1SourceFrontend(targetEntity(incomplete), { h1: 2 }), null);

  const dynamic = completeEvidence();
  dynamic.dynamicH1Unknown = true;
  assert.equal(verifiedElementorH1SourceFrontend(targetEntity(dynamic), { h1: 2 }), null);

  const missingShared = completeEvidence();
  missingShared.documents = missingShared.documents.filter((item) => item.id !== 327);
  assert.equal(verifiedElementorH1SourceFrontend(targetEntity(missingShared), { h1: 2 }), null);

  const twoH1 = completeEvidence();
  twoH1.totalAuthoredH1 = 2;
  twoH1.documents[1].h1Count = 1;
  assert.equal(verifiedElementorH1SourceFrontend(targetEntity(twoH1), { h1: 2 }), null);
});
