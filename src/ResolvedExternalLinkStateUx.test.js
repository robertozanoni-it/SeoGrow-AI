import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  externalLinkEvidenceState,
  normalizeSharedConnectorRouteError,
} from "./ResolvedExternalLinkStateModel.js";

const appMain = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("./ResolvedExternalLinkStateUx.css", import.meta.url), "utf8");

test("zero-occurrence evidence becomes resolved-stale only after evidence is loaded", () => {
  assert.equal(externalLinkEvidenceState("Il link non è più presente nel frontend corrente: riprepara il problema per aggiornare lo stato.", "1"), "resolved-stale");
  assert.equal(externalLinkEvidenceState("Problema non più presente nel frontend corrente. Nessuna correzione necessaria.", "1"), "resolved-stale");
  assert.equal(externalLinkEvidenceState("1 occorrenza verificata nel frontend della pagina.", "1"), "active");
  assert.equal(externalLinkEvidenceState("Verifica frontend in corso…", "loading"), "pending");
});

test("missing Connector shared route is translated into an actionable 1.3.8 instruction", () => {
  const message = normalizeSharedConnectorRouteError("Correzione automatica bloccata: Nessun percorso fornisce una corrispondenza tra l'URL ed il metodo richiesto.");
  assert.match(message, /Connector 1\.3\.8/);
  assert.match(message, /ricollega WordPress/i);
  assert.equal(normalizeSharedConnectorRouteError("Altro errore"), "");
});

test("stale state module is loaded and its CSS suppresses automatic shared remediation", () => {
  assert.match(appMain, /import '\.\/ResolvedExternalLinkStateUx';/);
  assert.match(css, /external-link-resolved-stale[\s\S]*seogrow-shared-link-remediation/);
  assert.match(css, /display:\s*none\s*!important/);
});
