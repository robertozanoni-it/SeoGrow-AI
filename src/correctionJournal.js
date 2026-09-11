import { saveCorrection } from "./remediationStore.js";

const stableValue = value => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export async function applyJournaledCorrection(record, write, persist = saveCorrection) {
  if (!record?.id || !record.fields?.length || record.fields.some(field =>
    record.before?.[field] === undefined || record.after?.[field] === undefined)) {
    throw new Error("Scrittura bloccata: snapshot prima/dopo incompleto.");
  }
  // Await the IndexedDB commit before any remote side effect. A lost response
  // or process crash must leave evidence, never an inferred success or retry.
  await persist({
    ...record,
    status: "Esito incerto",
    writeConfirmed: false,
    frontendConfirmed: false,
    verificationNote: "Snapshot salvato prima della richiesta. L'esito della scrittura non è confermato: controlla lo stato WordPress prima di riprovare o ripristinare.",
  });
  try {
    const patch = await write();
    if (record.fields.some(field => !Object.hasOwn(patch?.before || {}, field) || !Object.hasOwn(patch?.after || {}, field) ||
      stableValue(patch.before[field]) !== stableValue(record.before[field]) ||
      stableValue(patch.after[field]) !== stableValue(record.after[field]))) {
      throw new Error("Risposta WordPress incompleta o diversa dall'anteprima approvata: snapshot iniziale conservato.");
    }
    return await persist({ ...record, ...patch, id: record.id, clientId: record.clientId, status: "Da verificare", writeConfirmed: true,
      frontendConfirmed: false, verifiedAt: "" });
  } catch (cause) {
    if (["ATOMIC_WRITE_UNAVAILABLE", "STALE_CONFLICT", "STALE_PREVIEW", "EXPECTED_CURRENT_REQUIRED"].includes(cause.code)) {
      await persist({ ...record, status: "Bloccato", writeConfirmed: false, frontendConfirmed: false, verificationNote: cause.message });
      throw new Error(cause.message, { cause });
    }
    throw new Error("Esito della scrittura non confermato. Lo snapshot è conservato in Correzioni; verifica WordPress prima di riprovare.", { cause });
  }
}
