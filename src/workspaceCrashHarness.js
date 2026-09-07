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

function pickJsonFileWithInput() {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return reject(new Error("Nessun file selezionato."));
      resolve(file);
    }, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

export async function runWorkspacePhysicalCrashHarnessFromPicker(options = {}) {
  let file;
  if (typeof globalThis.showOpenFilePicker === "function") {
    const [handle] = await globalThis.showOpenFilePicker({
      multiple: false,
      types: [{ description: "SeoGrow backup JSON", accept: { "application/json": [".json"] } }],
    });
    file = await handle.getFile();
  } else {
    file = await pickJsonFileWithInput();
  }
  const backup = JSON.parse(await file.text());
  return runWorkspacePhysicalCrashHarness(backup, options);
}
