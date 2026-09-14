import test from "node:test";
import assert from "node:assert/strict";
import { confirmationAuditOutcome, confirmationAuditPolicy, confirmationAuditReady } from "./confirmationAuditPolicy.js";
import { problemResolutionPriority } from "./problemResolutionPriority.js";
import { selectFocusedRemediation } from "./remediationSelection.js";

const url = "https://example.com/pagina/";
const baseCorrection = {
  id: "correction-1",
  clientId: 7,
  sourceUrl: url,
  status: "Da verificare",
  lastVerificationAttemptAt: "2026-09-14T13:50:40.000Z",
  frontendConfirmed: true,
  frontendFailure: false,
};

test("SERP width usa audit pagina e non parla di duplicati", () => {
  const record = { ...baseCorrection, issueType: "description-serp-width", issueLabel: "Meta description larga nello snippet: circa 960px / 920px" };
  const policy = confirmationAuditPolicy(record);
  assert.equal(policy.mode, "page");
  assert.equal(policy.label, "Esegui audit di conferma");
  assert.match(policy.frontendMatchedNote, /920px/);
  assert.doesNotMatch(policy.frontendMatchedNote, /duplicat/i);
  assert.equal(confirmationAuditReady(record), true);
});

test("duplicati usano crawl sito fino a 200 pagine", () => {
  const policy = confirmationAuditPolicy({ ...baseCorrection, issueType: "duplicate-description", issueLabel: "Meta description duplicata" });
  assert.equal(policy.mode, "site");
  assert.equal(policy.maxPages, 200);
  assert.match(policy.frontendMatchedNote, /crawl/i);
});

test("audit pagina chiude SERP width solo quando il finding scompare", () => {
  const record = { ...baseCorrection, issueType: "description-serp-width", issueLabel: "Meta description larga nello snippet" };
  const clean = confirmationAuditOutcome(record, { url, issues: [], reviewItems: [] }, "page");
  assert.equal(clean.confirmed, true);
  const present = confirmationAuditOutcome(record, { url, issues: [], reviewItems: [{ type: "description-serp-width", sourceUrl: url }] }, "page");
  assert.equal(present.confirmed, false);
  assert.equal(present.matching.length, 1);
});

test("audit senza copertura della URL non dichiara risolto", () => {
  const record = { ...baseCorrection, issueType: "duplicate-description", issueLabel: "Meta description duplicata" };
  const result = confirmationAuditOutcome(record, { url: "https://example.com/", pagesChecked: 2, pages: [{ url: "https://example.com/altra/" }], issues: [] }, "site");
  assert.equal(result.confirmed, false);
  assert.equal(result.inconclusive, true);
});

test("pagina risoluzione privilegia audit finale dopo frontend confermato", () => {
  const correction = { ...baseCorrection, issueType: "description-serp-width", issueLabel: "Meta description larga nello snippet" };
  const problem = { sourceUrl: url, issueType: "description-serp-width", title: correction.issueLabel, problemState: "needs_verification", interventionState: "applied", correctability: "assisted", reviewOnly: true };
  const priority = problemResolutionPriority(problem, correction);
  assert.equal(priority.mode, "confirmation-audit");
  assert.equal(priority.action, "audit-confirmation");
  assert.equal(priority.label, "Esegui audit di conferma");
});

test("canonical review non viene riaperta da un audit vecchio se esiste un audit pagina più recente pulito", () => {
  const oldReview = { type: "canonical-different", label: "Canonical differente", sourceUrl: url };
  const audits = [
    { type: "page", item: { url, analyzedAt: "2026-09-14T13:50:00.000Z", issues: [], reviewItems: [] } },
    { type: "page", item: { url, analyzedAt: "2026-09-14T12:00:00.000Z", issues: [], reviewItems: [oldReview] } },
  ];
  const focus = { clientId: 7, sourceUrl: url, title: oldReview.label, issueType: oldReview.type, controlledContextPreview: true, openedFrom: "problem-card", createdAt: 1 };
  assert.equal(selectFocusedRemediation(audits, focus, 7, { id: 7, url: "https://example.com/" }), null);
});

test("canonical review corrente resta selezionabile in modo controllato", () => {
  const review = { type: "canonical-different", label: "Canonical differente", sourceUrl: url };
  const audits = [{ type: "page", item: { url, analyzedAt: "2026-09-14T13:50:00.000Z", issues: [], reviewItems: [review] } }];
  const focus = { clientId: 7, sourceUrl: url, title: review.label, issueType: review.type, controlledContextPreview: true, openedFrom: "problem-card", createdAt: 1 };
  const selected = selectFocusedRemediation(audits, focus, 7, { id: 7, url: "https://example.com/" });
  assert.equal(selected?.collection, "reviewItems");
  assert.equal(selected?.issueIndex, 0);
});
