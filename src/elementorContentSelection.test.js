import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chooseElementorContentCandidate, inspectEditableElementor } from "./wordpressOwnership.js";

const control = await readFile(new URL("./WordPressLiveRemediationControlV2.jsx", import.meta.url), "utf8");
const writer = await readFile(new URL("../wordpress-plugin/seogrow-connector/elementor-single-text-write.php", import.meta.url), "utf8");
const loader = await readFile(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");

test("header/footer esterni conservano i candidati content locali", () => {
  const entity = {
    meta: {
      _elementor_data: JSON.stringify([
        { id: "a", widgetType: "text-editor", settings: { editor: "Primo testo locale con contenuto sufficiente per la verifica frontend." }, elements: [] },
        { id: "b", widgetType: "text-editor", settings: { editor: "Secondo testo locale con contenuto sufficiente per la verifica frontend." }, elements: [] },
      ]),
    },
    _seogrowOwnership: {
      elementorEvidenceStatus: "rendered-shared-documents",
      elementorLocalDocumentRendered: true,
      elementorExternalRenderedDocuments: [
        { id: 185, type: "header" },
        { id: 327, type: "footer" },
      ],
    },
  };
  const state = inspectEditableElementor("content", entity);
  assert.deepEqual(state.widgets.map((item) => item.id), ["a", "b"]);
  assert.equal(state.sharedReferences.length, 2);
});

test("più candidati verificati vengono restituiti per la scelta assistita", () => {
  const candidates = [
    { id: "a", item: {}, value: "uno ".repeat(20), words: 20 },
    { id: "b", item: {}, value: "due ".repeat(20), words: 20 },
  ];
  const probe = { contentProbeVisible: true, contentProbeCount: 2, contentProbeMatches: 2, expectedWords: 20 };
  const result = chooseElementorContentCandidate(candidates, [probe, probe]);
  assert.equal(result.candidate, null);
  assert.deepEqual(result.candidates.map((item) => item.id), ["a", "b"]);
});

test("la UI richiede una scelta esplicita prima di generare la proposta", () => {
  assert.match(control, /CONTENT_WIDGET_SELECTION_REQUIRED/);
  assert.match(control, /selection_required/);
  assert.match(control, /Scegli il blocco da ampliare/);
  assert.match(control, /Amplia questo blocco/);
  assert.match(control, /contentWidgetId/);
});

test("Connector 1.3.8 conserva il writer atomico limitato a un solo text-editor", () => {
  assert.match(loader, /Version:\s*1\.3\.8/);
  assert.match(loader, /elementor-single-text-write\.php/);
  assert.match(writer, /widgetType.*text-editor/);
  assert.match(writer, /\$changed !== 0/);
  assert.match(writer, /BINARY meta_value = BINARY/);
  assert.match(writer, /elementor-single-text-editor-cas-v1/);
  assert.match(writer, /rest_pre_dispatch/);
});
