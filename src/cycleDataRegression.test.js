import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { observedNumber, observedPageCount, observedScoreDelta } from "./observedAuditData.js";
import { normalizeSiteAnalysis, scoreFromVerifiedEvidence } from "./seoResponseIntegrity.js";
import { providerBudgetHealth, budgetMoney } from "./providerBudgetModel.js";
import { metadataDuplicateGroups } from "./metadataDuplicateGroups.js";
import { clientForCard } from "./clientCardNavigation.js";
import { metadataVerificationPatch, requiresDuplicateAudit } from "./metadataCorrectionVerification.js";
import { app } from "../server/index.js";

test("unknown observations and monetary amounts are not real zeroes", () => {
  for (const value of [null, undefined, "", "  ", false, [], {}, NaN, Infinity, -1, "not a number"]) {
    assert.equal(observedNumber(value), null);
    assert.equal(budgetMoney(value), "—");
  }
  assert.equal(observedNumber(0), 0);
  assert.equal(budgetMoney(0), "$0.00");
  assert.equal(observedPageCount({pagesChecked: 0, pages: []}), 0);
  assert.equal(observedPageCount({}), null);
});

test("an audit without any page observation cannot publish a technical score", () => {
  for (const audit of [{pagesChecked: 0}, {pagesChecked: null}, {pages: []}, {}]) {
    assert.equal(scoreFromVerifiedEvidence(audit, [], 5), null);
  }
  assert.equal(scoreFromVerifiedEvidence({pagesChecked: 1}, [], 0), 100);
  const migrated = normalizeSiteAnalysis({pagesChecked: 0, issues: [], score: 60, scoreSource: "seogrow-derived", evidencePolicy: "confirmed-issues-only", legalScopeVersion: 4, issueSchemaVersion: 2, scorePolicyVersion: 4});
  assert.equal(migrated.score, null);
  assert.equal(migrated.scorePolicyVersion, 5);
});

test("missing scores cannot invent positive or negative score deltas", () => {
  assert.equal(observedScoreDelta({score: null}, {score: 80}), null);
  assert.equal(observedScoreDelta({score: 80}, {score: undefined}), null);
  assert.equal(observedScoreDelta({score: 85}, {score: 80}), 5);
  assert.equal(observedScoreDelta({score: 0}, {score: 80}), -80);
});

test("budget status distinguishes exhausted, unavailable and explicitly unlimited values", () => {
  const config = {explicit: true};
  const known = {configured: true, monthlyCost: 8, reservedCost: 1, monthlyBudget: 10};
  assert.equal(providerBudgetHealth(known, config).remaining, 1);
  assert.equal(providerBudgetHealth({...known, monthlyCost: 10}, config).label, "Budget esaurito");
  assert.equal(providerBudgetHealth({...known, monthlyBudget: 0}, config).label, "Nessun tetto mensile");
  for (const patch of [{monthlyCost: null}, {reservedCost: null}, {monthlyCost: ""}, {reservedCost: -2}]) {
    const health = providerBudgetHealth({...known, ...patch}, config);
    assert.equal(health.label, "Spesa non disponibile");
    assert.equal(health.remaining, null);
    assert.notEqual(health.tone, "ok");
  }
  assert.equal(providerBudgetHealth({...known, monthlyBudget: null}, config).label, "Budget non valido");
});

test("DataForSEO status remains readable at the spending limit without making a provider call", async t => {
  const old = process.env.DATAFORSEO_MONTHLY_BUDGET_USD;
  process.env.DATAFORSEO_MONTHLY_BUDGET_USD = "1";
  t.after(() => { if (old === undefined) delete process.env.DATAFORSEO_MONTHLY_BUDGET_USD; else process.env.DATAFORSEO_MONTHLY_BUDGET_USD = old; });
  const parts = new Intl.DateTimeFormat("en-CA", {timeZone: process.env.DATAFORSEO_BILLING_TIME_ZONE || "Europe/Rome", year:"numeric", month:"2-digit"}).formatToParts(new Date());
  const month = `${parts.find(p=>p.type==="year").value}-${parts.find(p=>p.type==="month").value}`;
  const readFile = fs.readFile.bind(fs);
  t.mock.method(fs, "readFile", async (path, ...args) => String(path).endsWith("dataforseo-usage.json") ? JSON.stringify({month, cost: 1}) : readFile(path, ...args));
  t.mock.method(globalThis, "fetch", () => { throw new Error("Status must not request paid provider data"); });
  const handler = app.router.stack.find(layer => layer.route?.path === "/api/dataforseo/status").route.stack[0].handle;
  const res = {statusCode: 200, status(code) {this.statusCode=code;return this;}, json(body) {this.body=body;return this;}};
  await handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.monthlyCost, 1);
  assert.equal(res.body.monthlyBudget, 1);
});

test("two requests redirected to the same final URL are one document, not duplicate titles", () => {
  const page = {url: "https://example.com/yoga/", title: "Yoga in città", description: "Descrizione pagina"};
  assert.equal(metadataDuplicateGroups([page, {...page}], "title").duplicates.length, 0);
  const other = {...page, url: "https://example.com/altra/"};
  const result = metadataDuplicateGroups([page, {...page}, other], "title");
  assert.deepEqual(result.duplicates[0].map(p=>p.url), [page.url, other.url]);
  const ambiguous = metadataDuplicateGroups([page, {...page, title: "Testo diverso"}, other], "title");
  assert.deepEqual(ambiguous.conflicts, [page.url]);
  assert.equal(ambiguous.duplicates.length, 0);
});

test("client cards resolve their exact client and never fall back to the first project", () => {
  const clients = [{id: 1, name: "A"}, {id: 2, name: "B"}];
  assert.equal(clientForCard(clients, "2"), clients[1]);
  assert.equal(clientForCard(clients, 99), null);
  assert.equal(clientForCard(clients, null), null);
});

test("a metadata check preserves snapshots and clears an old SEO verification timestamp", () => {
  const record = {id: "history", clientId: 1, sourceUrl: "https://example.com/a/", entityId: 2, status: "Verificato", verifiedAt: "2026-09-01T00:00:00Z", after: {"meta.rank_math_description": "Nuovo testo."}};
  const patch = metadataVerificationPatch(record, {ok: true, isHtml: true, status: 200, url: record.sourceUrl, wordpressDocumentId: 2, metaDescription: "Nuovo testo."});
  assert.equal(patch.status, "Da verificare");
  assert.equal(patch.verifiedAt, "");
  assert.equal(patch.after, undefined);
  assert.equal(record.after["meta.rank_math_description"], "Nuovo testo.");
});

test("taxonomy duplicate descriptions also require a cross-page audit, not just a public-value match", () => {
  for (const issueType of ["duplicate-title", "duplicate-description"]) assert.equal(requiresDuplicateAudit({issueType}), true);
  assert.equal(requiresDuplicateAudit({issueLabel: "Meta description duplicata"}), true);
  assert.equal(requiresDuplicateAudit({issueType: "description", issueLabel: "Meta description mancante"}), false);
});
