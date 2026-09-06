import { commitWorkspaceRestore, openWorkspaceDb } from "./workspaceDatabase.js";
import { prepareWorkspaceRestore } from "./workspaceRestore.js";

export const WORKSPACE_RESTORE_CRASH_PARAM = "qaWorkspaceRestoreCrash";

export function shouldArmWorkspaceRestoreCrashHarness({
  isDev = Boolean(import.meta.env?.DEV),
  search = globalThis.location?.search || "",
} = {}) {
  if (!isDev) return false;
  const params = new URLSearchParams(search);
  return params.get(WORKSPACE_RESTORE_CRASH_PARAM) === "1";
}

export function createWorkspaceRestoreCrashInterrupt(options = {}) {
  if (!shouldArmWorkspaceRestoreCrashHarness(options)) return undefined;
  return (tx) => {
    const confirmFn = options.confirmFn || globalThis.confirm;
    if (typeof confirmFn !== "function") {
      tx.abort();
      throw new Error("Harness crash workspace non disponibile in questo contesto.");
    }
    confirmFn(
      "QA CRASH CHECKPOINT — NON premere OK o Annulla. Chiudi adesso l'intera finestra Brave Test mentre questo dialogo è aperto. La transazione IndexedDB è ancora in corso. Al riavvio il workspace deve essere interamente quello precedente o interamente quello nuovo, mai misto.",
    );
    // Se il dialogo viene chiuso normalmente, il test resta fail-closed.
    tx.abort();
  };
}

// Harness manuale, importabile solo dalla console/dev build. Usa esattamente
// prepareWorkspaceRestore + commitWorkspaceRestore di produzione, ma non viene
// caricato dall'app e non modifica il bundle di produzione.
export async function runWorkspacePhysicalCrashHarness(backup, options = {}) {
  if (!shouldArmWorkspaceRestoreCrashHarness(options)) {
    throw new Error(`Harness disarmato. Apri la dev app con ?${WORKSPACE_RESTORE_CRASH_PARAM}=1.`);
  }
  const prepared = await prepareWorkspaceRestore(backup);
  const db = await openWorkspaceDb();
  try {
    await commitWorkspaceRestore(
      db,
      prepared.entries,
      prepared.corrections,
      undefined,
      createWorkspaceRestoreCrashInterrupt(options),
    );
    throw new Error("Checkpoint chiuso senza crash fisico: transazione abortita, prova non valida.");
  } finally {
    db.close();
  }
}

export async function runWorkspacePhysicalCrashHarnessFromPicker(options = {}) {
  if (typeof globalThis.showOpenFilePicker !== "function") {
    throw new Error("File picker QA non disponibile in questo browser.");
  }
  const [handle] = await globalThis.showOpenFilePicker({
    multiple: false,
    types: [{ description: "SeoGrow backup JSON", accept: { "application/json": [".json"] } }],
  });
  const file = await handle.getFile();
  const backup = JSON.parse(await file.text());
  return runWorkspacePhysicalCrashHarness(backup, options);
}
