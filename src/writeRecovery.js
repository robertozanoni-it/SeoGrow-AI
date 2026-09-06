import { apiFetch } from "./api.js";
import { readCorrection, updateCorrection } from "./remediationStore.js";
import { correctionCredentials } from "./correctionCredentials.js";

const CORE_FIELDS = new Set(["title", "content", "excerpt"]);

export function recoveryPayload(record, providedCredentials = {}) {
  if (!record || record.status !== "Esito incerto" || record.writeConfirmed !== false) {
    throw new Error("La correzione non richiede riconciliazione di un esito incerto.");
  }
  if (!Array.isArray(record.fields) || !record.fields.length || record.fields.some((field) => !CORE_FIELDS.has(field))) {
    throw new Error("Riconciliazione automatica disponibile solo per title/content/excerpt.");
  }
  if (!record.before || !record.after || record.fields.some((field) => record.before[field] === undefined || record.after[field] === undefined)) {
    throw new Error("Snapshot prima/dopo incompleto.");
  }
  const credentials = correctionCredentials(record, providedCredentials);
  const resource = record.resource || record.wordpressResource;
  const id = Number(record.entityId || record.wordpressId || record.idWordPress);
  if (!["pages", "posts"].includes(resource) || !Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Identità WordPress incompleta per la riconciliazione.");
  }
  return {
    siteUrl: credentials.siteUrl,
    targetUrl: record.sourceUrl || "",
    username: credentials.username,
    applicationPassword: credentials.applicationPassword,
    resource,
    id,
    fields: [...record.fields],
    before: record.before,
    after: record.after,
  };
}

export async function reconcileUncertainCorrection(record, providedCredentials = {}, fetchImpl = apiFetch) {
  const payload = recoveryPayload(record, providedCredentials);
  const response = await fetchImpl("/api/wordpress/reconcile-write", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  if (!response.ok || data?.ok !== true || data?.readOnly !== true) {
    throw new Error(data?.error || "Riconciliazione WordPress non riuscita.");
  }
  const at = new Date().toISOString();
  if (data.classification === "APPLIED") {
    return updateCorrection(record.id, {
      status: "Da verificare",
      writeConfirmed: true,
      reconciliationAt: at,
      reconciliation: data,
      verificationNote: "Dopo il riavvio WordPress coincide esattamente con lo snapshot successivo: la scrittura remota è confermata. Serve ancora la riverifica SEO/frontend.",
    });
  }
  if (data.classification === "NOT_APPLIED") {
    return updateCorrection(record.id, {
      status: "Bloccato",
      writeConfirmed: false,
      reconciliationAt: at,
      reconciliation: data,
      verificationNote: "Dopo il riavvio WordPress coincide esattamente con lo snapshot precedente: la scrittura non è stata applicata. Nessun retry automatico eseguito.",
    });
  }
  return updateCorrection(record.id, {
    status: "Esito incerto",
    writeConfirmed: false,
    reconciliationAt: at,
    reconciliation: data,
    verificationNote: "Lo stato WordPress non coincide né con lo snapshot precedente né con quello successivo. Possibile modifica esterna: nessun retry o rollback automatico.",
  });
}

export async function reconcileUncertainCorrectionById(id, providedCredentials = {}, fetchImpl = apiFetch) {
  const record = await readCorrection(id);
  if (!record) throw new Error("Correzione non trovata nello storico.");
  return reconcileUncertainCorrection(record, providedCredentials, fetchImpl);
}
