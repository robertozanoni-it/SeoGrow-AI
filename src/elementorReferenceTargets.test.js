import test from "node:test";
import assert from "node:assert/strict";
import { validateElementorReferenceTargets } from "../server/elementorReferenceTargets.js";

const refs = [
  { templateId: 42, sources: [{ referenceKind: "template-widget" }] },
  { templateId: 77, sources: [{ referenceKind: "global-widget" }] },
];
const payload = {
  ok: true,
  readOnly: true,
  sharedWriteAllowed: false,
  documents: [
    { ok: true, id: 42, type: "section", title: "CTA", status: "publish", link: "", readOnly: true, sharedWriteAllowed: false },
    { ok: true, id: 77, type: "widget", title: "Global", status: "publish", link: "", readOnly: true, sharedWriteAllowed: false },
  ],
};

test("target Elementor referenziati esatti diventano verificati", () => {
  const result = validateElementorReferenceTargets(refs, payload);
  assert.equal(result.verified, true);
  assert.equal(result.documents.length, 2);
  assert.equal(result.sharedWriteAllowed, false);
});

test("global widget richiede type widget", () => {
  const bad = structuredClone(payload);
  bad.documents[1].type = "section";
  const result = validateElementorReferenceTargets(refs, bad);
  assert.equal(result.verified, false);
  assert.equal(result.status, "global-widget-type-mismatch");
});

test("target mancante o duplicato fallisce chiuso", () => {
  const missing = structuredClone(payload);
  missing.documents.pop();
  assert.equal(validateElementorReferenceTargets(refs, missing).status, "reference-target-missing");

  const duplicate = structuredClone(payload);
  duplicate.documents.push({ ...duplicate.documents[0] });
  assert.equal(validateElementorReferenceTargets(refs, duplicate).status, "reference-target-duplicate");
});

test("contratto non read-only viene rifiutato", () => {
  assert.equal(validateElementorReferenceTargets(refs, { ...payload, sharedWriteAllowed: true }).verified, false);
  assert.equal(validateElementorReferenceTargets(refs, { ...payload, readOnly: false }).verified, false);
});

test("oltre 20 target non viene dichiarato completo", () => {
  const many = Array.from({ length: 21 }, (_, index) => ({ templateId: index + 1, sources: [{ referenceKind: "template-widget" }] }));
  const result = validateElementorReferenceTargets(many, payload);
  assert.equal(result.verified, false);
  assert.equal(result.status, "reference-target-limit-exceeded");
});

test("nessun riferimento è validamente completo senza scrittura", () => {
  const result = validateElementorReferenceTargets([], null);
  assert.equal(result.verified, true);
  assert.equal(result.status, "no-reference-targets");
  assert.equal(result.sharedWriteAllowed, false);
});
