export const agentModeLabels = { READ_ONLY: "Sola lettura", ASSISTED: "Assistita", AUTONOMOUS: "Autonoma con limiti" };
export const agentModeHelp = {
  READ_ONLY: "Analizza i dati senza autorizzare modifiche.",
  ASSISTED: "Le operazioni di modifica richiedono la tua approvazione.",
  AUTONOMOUS: "Opera entro i limiti configurati. Le azioni ad alto rischio richiedono comunque approvazione.",
};
const statuses = { PLANNING: "Pianificazione", RUNNING: "Analisi in corso", WAITING_APPROVAL: "In attesa di approvazione", COMPLETED: "Completata", PARTIAL: "Risultato parziale", BLOCKED: "Esecuzione bloccata", FAILED: "Errore", CANCELLED: "Interrotta", PENDING: "Da eseguire", CACHED: "Risultato riutilizzato", SKIPPED: "Non eseguita" };
export const agentStatusLabel = status => statuses[status] || status || "Non disponibile";

// Preserve zero as a real observation; absent costs must not look free.
export function agentCostLabel(result) {
  const actual = result?.actualCost;
  const estimate = result?.estimatedCost;
  if (typeof actual === "number" && Number.isFinite(actual) && actual >= 0) return `${actual} (consuntivo)`;
  if (typeof estimate === "number" && Number.isFinite(estimate) && estimate >= 0) return `${estimate} (stima)`;
  return "non disponibile";
}
