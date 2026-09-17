import { getWordPressSession } from "./system/index.js";
import { readCorrection } from "./remediationStore.js";
import { hasAutoFixCompletionEvidence, verifyAutoFixCorrectionById } from "./autoFixVerification.js";

const running = new Map();
const sharedWriter = record => /elementor shared template/i.test(String(record?.adapter || ""));
const updateSharedStatus = (record, text, kind = "") => {
  if (!sharedWriter(record) || typeof document === "undefined") return;
  for (const node of document.querySelectorAll(".seogrow-shared-link-status")) {
    node.textContent = text;
    node.dataset.kind = kind;
  }
};

async function verifyAppliedCorrection(id) {
  if (!id || running.has(id)) return running.get(id) || null;
  const pending = (async () => {
    const record = await readCorrection(id);
    if (!record?.liveApproval || record.writeConfirmed !== true || ["Ripristinato", "Bloccato", "Esito incerto"].includes(record.status)) return null;
    updateSharedStatus(record, "Scrittura e verifica frontend completate; audit di conferma in corso…", "busy");
    const session = getWordPressSession(record.clientId, record.siteUrl);
    if (!session?.username || !session?.applicationPassword) {
      updateSharedStatus(record, "Scrittura applicata, ma la verifica AutoFix resta aperta: riconnetti WordPress per completare l’audit di conferma.", "warning");
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
    const verified = hasAutoFixCompletionEvidence(result?.record);
    const reason = result?.record?.verificationNote || result?.auditError?.message || result?.error?.message || "";
    updateSharedStatus(record,
      verified
        ? "Correzione applicata, verificata nel frontend e confermata da un audit post-fix."
        : `Correzione applicata, ma non ancora conclusa: ${reason || "serve una verifica ulteriore."}`,
      verified ? "success" : "warning",
    );
    window.dispatchEvent(new CustomEvent("seogrow-autofix-verification", {
      detail: { id, verified, pending: !verified, reason },
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
