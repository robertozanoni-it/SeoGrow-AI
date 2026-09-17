import { getWordPressSession } from "./system/index.js";
import { readCorrection } from "./remediationStore.js";
import { verifyAutoFixCorrectionById } from "./autoFixVerification.js";

const running = new Map();

async function verifyAppliedCorrection(id) {
  if (!id || running.has(id)) return running.get(id) || null;
  const pending = (async () => {
    const record = await readCorrection(id);
    if (!record?.liveApproval || record.writeConfirmed !== true || ["Ripristinato", "Bloccato", "Esito incerto"].includes(record.status)) return null;
    const session = getWordPressSession(record.clientId, record.siteUrl);
    if (!session?.username || !session?.applicationPassword) {
      window.dispatchEvent(new CustomEvent("seogrow-autofix-verification", {
        detail: { id, verified: false, pending: true, reason: "Sessione WordPress non disponibile per la verifica automatica." },
      }));
      return null;
    }
    const result = await verifyAutoFixCorrectionById(id, {
      clientId: record.clientId,
      siteUrl: record.siteUrl,
      username: session.username,
      applicationPassword: session.applicationPassword,
    });
    const verified = result?.record?.status === "Verificato" && result?.record?.confirmationAudit?.resolved === true;
    window.dispatchEvent(new CustomEvent("seogrow-autofix-verification", {
      detail: {
        id,
        verified,
        pending: !verified,
        reason: result?.record?.verificationNote || result?.auditError?.message || result?.error?.message || "",
      },
    }));
    window.dispatchEvent(new CustomEvent("seogrow-remediation-history", { detail: { id, autoFixVerified: verified } }));
    return result;
  })().catch((error) => {
    window.dispatchEvent(new CustomEvent("seogrow-autofix-verification", {
      detail: { id, verified: false, pending: true, reason: error?.message || String(error) },
    }));
    return null;
  }).finally(() => running.delete(id));
  running.set(id, pending);
  return pending;
}

const onApplied = (event) => {
  const id = event?.detail?.id;
  if (!id) return;
  window.setTimeout(() => verifyAppliedCorrection(id), 0);
};

if (typeof window !== "undefined" && !window.__seogrowAutoFixPostApplyVerifierInstalled) {
  window.__seogrowAutoFixPostApplyVerifierInstalled = true;
  window.addEventListener("seogrow-remediation-applied", onApplied);
}

export { verifyAppliedCorrection };
