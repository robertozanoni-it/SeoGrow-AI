import { runConfirmationAudit } from "./confirmationAudit.js";
import { recheckCorrectionById } from "./remediationIntegrity.js";
import { hasAutoFixCompletionEvidence, requiresAutoFixCompletionGate } from "./autoFixCompletionEvidence.js";
import {
  readCorrection,
  updateCorrection,
  removeVerifiedTask,
  reopenTask,
} from "./remediationStore.js";

const pendingPatch = (record, note, confirmation = null) => ({
  status: "Da verificare",
  verifiedAt: "",
  lastVerificationAttemptAt: new Date().toISOString(),
  verificationNote: note || record?.verificationNote || "La verifica post-fix non è conclusa.",
  ...(confirmation ? {
    confirmationAudit: {
      mode: confirmation.mode,
      analyzedAt: confirmation.audit?.analyzedAt || new Date().toISOString(),
      resolved: false,
      covered: confirmation.covered === true,
    },
  } : {}),
});

export async function verifyAutoFixCorrectionById(id, credentials = {}) {
  const original = await readCorrection(id);
  if (!original) throw new Error("Correzione AutoFix non trovata nello storico.");

  const result = await recheckCorrectionById(id, credentials);
  let record = result?.record || original;
  if (result?.error || !requiresAutoFixCompletionGate(record)) return result;

  if (result?.needsBrowserVerification === true) {
    if (record.status === "Verificato") {
      const updated = await updateCorrection(record.id, pendingPatch(record, "La verifica HTML non basta: serve una verifica browser prima dell’audit di conferma."), { expectedRecord: record });
      if (updated) reopenTask(updated);
      record = updated || record;
    }
    return { ...result, record, needsAudit: true };
  }

  if (hasAutoFixCompletionEvidence(record)) return { ...result, record, needsAudit: false };

  try {
    const confirmation = await runConfirmationAudit(record);
    const now = new Date().toISOString();
    const patch = confirmation.resolved
      ? {
          status: "Verificato",
          frontendConfirmed: true,
          frontendFailure: false,
          verifiedAt: now,
          lastVerificationAttemptAt: now,
          verificationNote: confirmation.note,
          confirmationAudit: {
            mode: confirmation.mode,
            analyzedAt: confirmation.audit?.analyzedAt || now,
            resolved: true,
            covered: true,
          },
        }
      : pendingPatch(record, confirmation.note, confirmation);
    const updated = await updateCorrection(record.id, patch, { expectedRecord: record });
    if (updated && confirmation.resolved) removeVerifiedTask(updated);
    else if (updated && record.status === "Verificato") reopenTask(updated);
    return {
      ...result,
      changed: Boolean(updated) || result?.changed === true,
      record: updated || record,
      needsAudit: !confirmation.resolved,
      confirmationAudit: confirmation,
    };
  } catch (error) {
    const note = `${record.verificationNote || "Verifica frontend eseguita."} Audit di conferma non completato: ${error.message}`;
    try {
      const updated = await updateCorrection(record.id, pendingPatch(record, note), { expectedRecord: record });
      if (updated && record.status === "Verificato") reopenTask(updated);
      return { ...result, changed: Boolean(updated) || result?.changed === true, record: updated || record, needsAudit: true, auditError: error };
    } catch {
      return { ...result, record, needsAudit: true, auditError: error };
    }
  }
}
