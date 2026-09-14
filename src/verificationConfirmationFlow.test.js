import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchesProblemFocus } from "./problemNavigationFocus.js";
import { metadataVerificationPatch } from "./metadataCorrectionVerification.js";
import { verificationAuditPlan } from "./verificationAuditPlan.js";
import { auditConfirmsCorrection } from "./auditCorrectionReconciliation.js";

const url = "https://yogabuenaonda.it/yoga-alimentazione-cinisello-balsamo/";
const description = "Yoga e alimentazione a Cinisello Balsamo: guida alle pratiche yogiche e alla nutrizione consapevole, con corsi locali per integrare dieta e yoga.";

const correction = (overrides = {}) => ({
  id: "correction-1",
  clientId: 1,
  sourceUrl: url,
  issueType: "description-serp-width",
  issueLabel: "Meta description larga nello snippet: circa 960px / 920px",
  status: "Da verificare",
  frontendConfirmed: true,
  appliedAt: "2026-09-14T13:00:00.000Z",
  after: { meta: { rank_math_description: description } },
  ...overrides,
});

test("focus canonical survives slash normalization and identity refresh", () => {
  const focus = { sourceUrl: url.slice(0, -1), issueType: "canonical-different", issueKey: "old-key", title: "Canonical differente" };
  const problem = { sourceUrl: url, issueType: "canonical-different", key: "new-key", title: "Canonical differente" };
  assert.equal(matchesProblemFocus(problem, focus), true);
});

test("broken-link focus keeps exact identity when multiple targets can share a page", () => {
  const focus = { sourceUrl: url.slice(0, -1), issueType: "broken-external-link", issueKey: "target-a", title: "Link 404" };
  const problem = { sourceUrl: url, issueType: "broken-external-link", key: "target-b", title: "Link 404" };
  assert.equal(matchesProblemFocus(problem, focus), false);
});

test("SERP width verification asks for the 920px confirmation, not duplicate checking", () => {
  const record = correction();
  const patch = metadataVerificationPatch(record, {
    ok: true,
    isHtml: true,
    status: 200,
    url,
    metaDescriptionCount: 1,
    metaDescription: description,
  }, "2026-09-14T13:05:00.000Z");
  assert.equal(patch.frontendConfirmed, true);
  assert.match(patch.verificationNote, /920px/i);
  assert.doesNotMatch(patch.verificationNote, /assenza di duplicati/i);
});

test("duplicate metadata still requires a site crawl", () => {
  const record = correction({ issueType: "duplicate-description", issueLabel: "Meta description duplicata" });
  const patch = metadataVerificationPatch(record, {
    ok: true,
    isHtml: true,
    status: 200,
    url,
    metaDescriptionCount: 1,
    metaDescription: description,
  });
  assert.match(patch.verificationNote, /duplicat/i);
  assert.match(patch.verificationNote, /crawl/i);
  assert.equal(verificationAuditPlan(record).mode, "site");
});

test("confirmation plan uses a page audit for SERP width", () => {
  const plan = verificationAuditPlan(correction());
  assert.equal(plan.mode, "page");
  assert.equal(plan.url, url);
  assert.equal(plan.label, "Esegui audit di conferma");
  assert.match(plan.reason, /920px/i);
});

test("a newer page audit closes SERP width only when the finding is absent", () => {
  const record = correction();
  const clean = { url, analyzedAt: "2026-09-14T13:10:00.000Z", issues: [], reviewItems: [] };
  const stillWide = { ...clean, reviewItems: [{ type: "description-serp-width", sourceUrl: url }] };
  assert.equal(auditConfirmsCorrection(record, "page", clean), true);
  assert.equal(auditConfirmsCorrection(record, "page", stillWide), false);
});

test("duplicate correction cannot be closed by a single-page audit", () => {
  const record = correction({ issueType: "duplicate-description", issueLabel: "Meta description duplicata" });
  const page = { url, analyzedAt: "2026-09-14T13:10:00.000Z", issues: [], reviewItems: [] };
  const site = { url: "https://yogabuenaonda.it/", analyzedAt: "2026-09-14T13:10:00.000Z", pages: [{ url, ok: true }], issues: [], reviewItems: [] };
  assert.equal(auditConfirmsCorrection(record, "page", page), false);
  assert.equal(auditConfirmsCorrection(record, "site", site), true);
});

test("UI exposes direct confirmation audit and current Agent policy", async () => {
  const [saved, resolution, agent, launcher] = await Promise.all([
    readFile(new URL("./SavedCorrectionDetails.jsx", import.meta.url), "utf8"),
    readFile(new URL("./ProblemResolutionPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8"),
    readFile(new URL("./verificationAuditPlan.js", import.meta.url), "utf8"),
  ]);
  assert.match(saved, /Esegui audit di conferma/);
  assert.match(resolution, /confirmationAudit\?\.label/);
  assert.match(agent, /Azione attuale/);
  assert.match(agent, /Indicazione salvata nell’analisi/);
  assert.match(launcher, /requestSubmit\(\)/);
});
