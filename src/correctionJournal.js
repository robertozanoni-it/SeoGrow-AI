import { saveCorrection } from "./remediationStore.js";

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
    if (record.fields.some(field => (patch?.before || record.before)?.[field] === undefined ||
      (patch?.after || record.after)?.[field] === undefined)) {
      throw new Error("Risposta WordPress incompleta: snapshot iniziale conservato.");
    }
    return await persist({ ...record, ...patch, id: record.id, clientId: record.clientId, status: "Da verificare", writeConfirmed: true });
  } catch (cause) {
    throw new Error("Esito della scrittura non confermato. Lo snapshot è conservato in Correzioni; verifica WordPress prima di riprovare.", { cause });
  }
}
