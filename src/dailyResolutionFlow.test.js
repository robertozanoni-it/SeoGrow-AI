import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildUnifiedProblems } from "./problemsModel.js";
import { correctionPresentation } from "./correctionPresentation.js";

const [integrity, liveFlow, taxonomyFlow, problems, receipt, autoFix] = await Promise.all([
  "remediationIntegrity.js",
  "WordPressLiveRemediationControlV2.jsx",
  "WordPressTaxonomyRemediationControl.jsx",
  "ProblemsWorkspace.jsx",
  "SavedCorrectionDetails.jsx",
  "AutoFixPanel.jsx",
].map((file) => readFile(new URL(file, import.meta.url), "utf8")));

const auditIssue = {
  type: "title",
  label: "Title da correggere",
  sourceUrl: "https://example.com/pagina/",
  severity: "alta",
};

const verifiedCorrection = {
  id: "correction-daily-1",
  clientId: 1,
  issueType: "title",
  issueLabel: "Title da correggere",
  sourceUrl: "https://example.com/pagina/",
  status: "Verificato",
  appliedAt: "2026-09-18T08:01:00Z",
  verifiedAt: "2026-09-18T08:02:00Z",
};

test("una correzione verificata sparisce subito dai problemi attivi ma resta nel modello storico", () => {
  const model = buildUnifiedProblems({
    clientId: 1,
    pageHistory: [{
      analyzedAt: "2026-09-18T08:00:00Z",
      url: "https://example.com/pagina/",
      issues: [auditIssue],
    }],
    corrections: [verifiedCorrection],
    now: Date.parse("2026-09-18T08:03:00Z"),
  });
  assert.equal(model.rows.length, 1);
  assert.equal(model.rows[0].problemState, "resolved");
  assert.equal(model.activeRows.length, 0);
});

test("una nuova rilevazione successiva alla verifica riapre lo stesso problema", () => {
  const model = buildUnifiedProblems({
    clientId: 1,
    pageHistory: [{
      analyzedAt: "2026-09-18T08:04:00Z",
      url: "https://example.com/pagina/",
      issues: [auditIssue],
    }],
    corrections: [verifiedCorrection],
    now: Date.parse("2026-09-18T08:05:00Z"),
  });
  assert.equal(model.rows[0].problemState, "reappeared");
  assert.equal(model.activeRows.length, 1);
});

test("il lifecycle event resolved rispetta il completion evidence gate esistente", () => {
  assert.match(integrity, /completionVerified[\s\S]*hasAutoFixCompletionEvidence\(after\)/);
  assert.match(integrity, /dispatchProblemState\("seogrow-problem-resolved", after\)/);
  assert.match(integrity, /dispatchProblemState\("seogrow-problem-reopened", after\)/);
  assert.match(integrity, /removeVerifiedTask\(after\)/);
});

test("single fix e tassonomia verificano automaticamente subito dopo l'apply approvato", () => {
  assert.match(liveFlow, /applyPreparedCorrection\([\s\S]*recheckCorrectionById\(record\.id/);
  assert.match(liveFlow, /status: resolved \? "verified" : "applied"/);
  assert.match(liveFlow, /verificationError/);
  assert.match(taxonomyFlow, /applyJournaledCorrection\([\s\S]*recheckCorrectionById\(record\.id/);
  assert.match(taxonomyFlow, /problema è stato rimosso dai problemi attivi/);
});

test("Problems reagisce al lifecycle canonico, chiude il drawer e ripulisce la selezione batch", () => {
  assert.match(problems, /addEventListener\("seogrow-problem-resolved", refresh\)/);
  assert.match(problems, /addEventListener\("seogrow-problem-reopened", refresh\)/);
  assert.match(problems, /filtered\.some\(\(row\) => row\.key === selectedKey\)/);
  assert.match(problems, /setSelectedKey\(""\)/);
  assert.match(problems, /activeKeys\.has\(key\)/);
});

test("lo storico resta accessibile dopo la risoluzione e la UX non richiede una Riverifica manuale obbligatoria", () => {
  assert.match(receipt, /record\.status === "Verificato"[\s\S]*Torna ai problemi attivi/);
  assert.match(autoFix, /SeoGrow avvia automaticamente la verifica canonica/);
  assert.match(correctionPresentation({ status: "verified" }).title, /Correzione verificata/);
  assert.match(correctionPresentation({ status: "verified" }).explanation, /non compare più tra quelli attivi/);
});
