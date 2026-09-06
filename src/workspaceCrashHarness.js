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

    // Se il dialogo viene chiuso normalmente invece del browser, non consentire
    // accidentalmente il commit: il test deve restare fail-closed.
    tx.abort();
  };
}
