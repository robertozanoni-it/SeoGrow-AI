import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { correctionReceiptFields, latestCorrectionForFocus, canVerifyReceipt, receiptAfterLabel } from "./correctionReceipt.js";
import { metadataVerificationTarget, metadataVerificationPatch } from "./metadataCorrectionVerification.js";

const sourceUrl = "https://example.com/yoga/";
const record = {
  id: "receipt-a", clientId: 12, sourceUrl, resource: "posts", entityId: 42,
  issueType: "duplicate-description", issueLabel: "Meta description duplicata",
  status: "Da verificare", writeConfirmed: true, appliedAt: "2026-09-10T10:00:00Z",
  fields: ["meta.rank_math_description"],
  before: { "meta.rank_math_description": "Prima completa" },
  after: { "meta.rank_math_description": "Dopo completo" },
};
const frontend = { ok: true, isHtml: true, titleCount: 1, metaDescriptionCount: 1, status: 200, url: sourceUrl, wordpressDocumentId: 42, metaDescription: "Dopo completo" };

test("receipt preserves full UTF-8 snapshots across every historical status", () => {
  const long = "Testo integrale con è, apostrofi e accenti. ".repeat(250);
  for (const status of ["Da verificare", "Verificato", "Ripristinato", "Bloccato", "Esito incerto"]) {
    const input = { ...record, status, after: { "meta.rank_math_description": long } };
    const copy = structuredClone(input);
    const result = correctionReceiptFields(input);
    assert.equal(result[0].before, "Prima completa");
    assert.equal(result[0].after, long);
    assert.deepEqual(input, copy);
  }
});

test("nested legacy metadata and flat snapshots produce the same comparison", () => {
  assert.deepEqual(correctionReceiptFields({ ...record, before: { meta: { rank_math_description: "Prima completa" } } }), correctionReceiptFields(record));
});

test("missing snapshot is not presented as an empty saved value", () => {
  const [missing] = correctionReceiptFields({ ...record, before: {} });
  const [empty] = correctionReceiptFields({ ...record, before: { "meta.rank_math_description": "" } });
  assert.equal(missing.beforeAvailable, false);
  assert.equal(empty.beforeAvailable, true);
  assert.equal(empty.before, "");
  assert.equal(correctionReceiptFields({})?.length, 0);
});

test("receipt resolves exact client, source URL and issue; verification time cannot reorder applications", () => {
  const older = { ...record, id: "older", appliedAt: "2026-09-09T10:00:00Z", verifiedAt: "2099-01-01T00:00:00Z" };
  const foreign = { ...record, id: "foreign", clientId: 99, appliedAt: "2099-01-01T00:00:00Z" };
  const otherIssue = { ...record, id: "title", issueType: "duplicate-title", appliedAt: "2099-01-01T00:00:00Z" };
  const list = [older, record, foreign, otherIssue];
  const copy = [...list];
  const focus = { clientId: "12", sourceUrl: sourceUrl.slice(0, -1), issueType: record.issueType };
  assert.equal(latestCorrectionForFocus(list, focus)?.id, record.id);
  assert.deepEqual(list, copy);
  assert.equal(latestCorrectionForFocus(list, { ...focus, sourceUrl: "https://example.com/other/" }), null);
  assert.equal(latestCorrectionForFocus(list, { ...focus, clientId: null }), null);
  assert.equal(latestCorrectionForFocus([record], { ...focus, issueType: "", title: record.issueLabel })?.id, record.id);
});

test("failed, uncertain, and rolled-back writes never enable automatic reverify or pretend success", () => {
  assert.equal(canVerifyReceipt(record), true);
  for (const status of ["Bloccato", "Esito incerto", "Ripristinato", "Preparato", "Approvato"]) assert.equal(canVerifyReceipt({ ...record, status }), false);
  assert.equal(canVerifyReceipt({ ...record, writeConfirmed: false }), false);
  assert.match(receiptAfterLabel({ ...record, status: "Bloccato" }), /non applicata/);
  assert.match(receiptAfterLabel({ ...record, status: "Esito incerto" }), /da confermare/);
});

test("public metadata match confirms the value but not duplicate resolution", () => {
  const input = structuredClone(record);
  const patch = metadataVerificationPatch(input, frontend, "2026-09-10T11:00:00Z");
  assert.equal(patch.frontendConfirmed, true);
  assert.equal(patch.status, "Da verificare");
  assert.match(patch.verificationNote, /nuovo audit/);
  assert.equal(patch.frontendSnapshot.metaDescription, "Dopo completo");
  assert.equal(patch.lastVerificationAttemptAt, "2026-09-10T11:00:00Z");
  assert.equal("before" in patch || "after" in patch, false);
  assert.deepEqual(input, record);
});

test("metadata mismatch retains the actual observed value and does not overwrite snapshots", () => {
  const patch = metadataVerificationPatch(record, { ...frontend, metaDescription: "Vecchio testo in cache" });
  assert.equal(patch.frontendConfirmed, false);
  assert.equal(patch.frontendFailure, true);
  assert.equal(patch.frontendSnapshot.metaDescription, "Vecchio testo in cache");
  assert.equal(record.after["meta.rank_math_description"], "Dopo completo");
});

test("unknown or wrong-page responses cannot verify metadata", () => {
  for (const bad of [{ ...frontend, isHtml: false }, { ...frontend, status: null }, { ...frontend, url: "https://example.com/other/" }, { ...frontend, wordpressDocumentId: 999 }, { ...frontend, metaDescription: null }, {}]) assert.throws(() => metadataVerificationPatch(record, bad));
});

test("Rank Math and Yoast title/description fields are verified using the matching public field", () => {
  for (const [field, publicField] of [["meta.rank_math_title", "title"], ["meta._yoast_wpseo_title", "title"], ["meta.rank_math_description", "metaDescription"], ["meta._yoast_wpseo_metadesc", "metaDescription"]]) {
    const input = { ...record, fields: [field], after: { [field]: "Valore esatto" } };
    assert.equal(metadataVerificationTarget(input)?.publicField, publicField);
    assert.equal(metadataVerificationPatch(input, { ...frontend, [publicField]: "Valore esatto" }).frontendConfirmed, true);
  }
  assert.equal(metadataVerificationTarget({ ...record, after: {} }), null);
  assert.equal(metadataVerificationTarget({ ...record, after: { "meta.rank_math_title": "A", "meta._yoast_wpseo_title": "B" } }), null);
});

test("saved comparison is wired into proposal and cards without a DOM polling shim", async () => {
  const [proposal, cards, component] = await Promise.all(["AutomaticProposalPage.jsx", "CardWorkspaceLayer.jsx", "SavedCorrectionDetails.jsx"].map((file) => readFile(new URL(file, import.meta.url), "utf8")));
  assert.match(proposal, /latestCorrectionForFocus/);
  assert.match(proposal, /<SavedCorrectionDetails/);
  assert.match(cards, /listCorrections\(\{ clientId: selectedClientId \}\)/);
  assert.match(cards, /<SavedCorrectionDetails/);
  assert.doesNotMatch(cards, /corrections:\s*readJson\("seogrow-remediation-history-v1"/);
  assert.match(component, /readCorrection\(correctionId\)/);
  assert.match(component, /recheckCorrectionById\(record.id/);
  assert.doesNotMatch(component, /MutationObserver|setInterval|live-apply|live-rollback/);
});
