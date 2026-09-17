import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { hasAutoFixCompletionEvidence, requiresAutoFixCompletionGate } from "./autoFixCompletionEvidence.js";
import { verificationState } from "./batchRemediationModel.js";
import { classifyAutoFix } from "./autoFixPlan.js";

const live = {
  id: "fix-1",
  liveApproval: true,
  writeConfirmed: true,
  status: "Verificato",
  frontendConfirmed: true,
  verifiedAt: "2026-09-17T12:00:00.000Z",
};

test("fix live non è completato senza audit di conferma", () => {
  assert.equal(requiresAutoFixCompletionGate(live), true);
  assert.equal(hasAutoFixCompletionEvidence(live), false);
  assert.equal(verificationState({ record: live }), "APPLIED_UNVERIFIED");
});

test("fix live diventa completato solo con audit post-fix risolto", () => {
  const verified = { ...live, confirmationAudit: { mode: "page", analyzedAt: "2026-09-17T12:01:00.000Z", resolved: true, covered: true } };
  assert.equal(hasAutoFixCompletionEvidence(verified), true);
  assert.equal(verificationState({ record: verified }), "RESOLVED_VERIFIED");
});

test("evidenza batch deve essere un vero audit, non una sola scansione link", () => {
  const linkOnly = { ...live, batchDeltaEvidence: { audit: { occurrenceCount: 0, scanComplete: true } } };
  const audited = { ...live, batchDeltaEvidence: { audit: { analyzedAt: "2026-09-17T12:01:00.000Z", issues: [] } } };
  assert.equal(hasAutoFixCompletionEvidence(linkOnly), false);
  assert.equal(hasAutoFixCompletionEvidence(audited), true);
});

test("broken external link verificabile entra nel planner AutoFix", () => {
  const result = classifyAutoFix({
    type: "broken-external-link",
    label: "Link esterno 404",
    sourceUrl: "https://example.com/pagina/",
    targetUrl: "https://external.example/not-found",
  }, "https://example.com/", "https://example.com/");
  assert.equal(result.level, "approval");
  assert.match(result.reason, /CAS atomico|writer/i);
});

test("runtime AutoFix usa verifier post-fix e writer shared certificato", async () => {
  const [runtime, adapter, queue, journal, confirmation, appMain] = await Promise.all([
    readFile(new URL("./batchRemediationRuntime.js", import.meta.url), "utf8"),
    readFile(new URL("./sharedElementorBatchAdapter.js", import.meta.url), "utf8"),
    readFile(new URL("./batchRemediationQueue.js", import.meta.url), "utf8"),
    readFile(new URL("./correctionJournal.js", import.meta.url), "utf8"),
    readFile(new URL("./confirmationAudit.js", import.meta.url), "utf8"),
    readFile(new URL("./appMain.jsx", import.meta.url), "utf8"),
  ]);
  assert.match(runtime, /verifyAutoFixCorrectionById/);
  assert.match(runtime, /prepareSharedElementorBatchPreview/);
  assert.match(runtime, /applySharedElementorBatchPreview/);
  assert.match(adapter, /elementor-shared-link-preview/);
  assert.match(adapter, /elementor-shared-link-apply/);
  assert.match(adapter, /frontendVerified\s*!==\s*true/);
  assert.match(adapter, /atomicGuaranteed\s*!==\s*true/);
  assert.match(adapter, /staleChecked\s*!==\s*true/);
  assert.match(queue, /summary\.resolvedProblems\s*===\s*summary\.selected/);
  assert.doesNotMatch(queue, /resolvedProblems\s*\+\s*summary\.managedAssisted\s*===\s*summary\.selected/);
  assert.match(journal, /SHARED_ELEMENTOR_WRITES_DISABLED/);
  assert.match(journal, /SHARED_LINK_FRONTEND_ROLLED_BACK/);
  assert.match(confirmation, /requiresDuplicateAudit\(record\)\s*\|\|\s*linkLike\(record\)/);
  assert.match(appMain, /AutoFixPostApplyVerifier/);
});
