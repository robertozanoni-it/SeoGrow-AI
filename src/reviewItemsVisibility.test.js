import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedProblems } from "./problemsModel.js";

const analyzedAt = "2026-09-14T10:19:54.000Z";
const baseUrl = "https://yogabuenaonda.it/";

const reviewItems = Array.from({ length: 8 }, (_, index) => ({
  type: `review-${index + 1}`,
  label: `Segnale da confermare ${index + 1}`,
  detail: `Verifica richiesta per il segnale ${index + 1}.`,
  sourceUrl: `${baseUrl}pagina-${index + 1}/`,
  severity: "low",
  diagnosisState: "needs-confirmation",
  evidenceNature: "derived-estimate",
}));

test("gli elementi Da confermare dell'audit entrano nel modello Problemi come needs_verification", () => {
  const model = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{
      analyzedAt,
      url: baseUrl,
      issues: [],
      reviewItems,
      pages: [],
    }],
  });

  assert.equal(model.rows.length, 8);
  assert.equal(model.rows.filter((row) => row.problemState === "needs_verification").length, 8);
  assert.ok(model.rows.every((row) => row.reviewOnly === true));
  assert.ok(model.rows.every((row) => row.correctability === "not_supported"));
  assert.ok(model.rows.every((row) => row.confidence === "needs_confirmation"));
  assert.ok(model.rows.every((row) => row.severity !== "high"));
});

test("un finding confermato con la stessa identità resta un problema reale e non review-only", () => {
  const shared = {
    type: "canonical",
    label: "Canonical da verificare",
    sourceUrl: `${baseUrl}pagina/`,
  };
  const model = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [{
      analyzedAt,
      url: baseUrl,
      issues: [{ ...shared, detail: "Canonical osservata come problema.", severity: "medium" }],
      reviewItems: [{ ...shared, detail: "Richiede conferma contestuale." }],
      pages: [],
    }],
  });

  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].reviewOnly, false);
  assert.equal(model.rows[0].problemState, "open");
  assert.equal(model.rows[0].correctability, "assisted");
});
