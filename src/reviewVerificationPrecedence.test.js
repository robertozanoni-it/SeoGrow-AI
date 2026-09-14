import test from "node:test";
import assert from "node:assert/strict";
import { buildUnifiedProblems } from "./problemsModel.js";

const url = "https://example.com/yoga/";
const finding = {
  type: "canonical-different",
  label: "Canonical differente dall’URL analizzato",
  sourceUrl: url,
  url,
  severity: "bassa",
  diagnosisState: "needs-confirmation",
};

const audit = (at) => ({
  url: "https://example.com/",
  analyzedAt: at,
  pagesChecked: 1,
  pages: [{ url, ok: true }],
  issues: [],
  reviewItems: [finding],
});

const correction = {
  id: "readonly-1",
  clientId: 1,
  issueType: finding.type,
  issueLabel: finding.label,
  issue: finding,
  sourceUrl: url,
  status: "Verificato",
  verifiedAt: "2026-09-14T13:10:00.000Z",
  createdAt: "2026-09-14T13:10:00.000Z",
  noWriteResolution: true,
  writeConfirmed: false,
  frontendConfirmed: true,
};

test("verified review finding stays resolved after read-only batch verification", () => {
  const model = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [audit("2026-09-14T13:00:00.000Z")],
    corrections: [correction],
  });
  const row = model.rows.find((item) => item.issueType === finding.type);
  assert.equal(row?.problemState, "resolved");
  assert.equal(row?.interventionState, "verified");
});

test("a newer review observation reopens the verified finding for confirmation", () => {
  const model = buildUnifiedProblems({
    clientId: 1,
    siteHistory: [audit("2026-09-14T13:20:00.000Z")],
    corrections: [correction],
  });
  const row = model.rows.find((item) => item.issueType === finding.type);
  assert.equal(row?.problemState, "needs_verification");
});