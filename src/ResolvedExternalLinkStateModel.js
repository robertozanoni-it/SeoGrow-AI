export const STALE_MESSAGE = "Problema non più presente nel frontend corrente. Nessuna correzione necessaria: aggiorna l’audit per chiuderlo definitivamente.";
export const CONNECTOR_ROUTE_MESSAGE = "SeoGrow Connector 1.3.8 non espone ancora la route richiesta sul sito collegato. Aggiorna o reinstalla il Connector 1.3.8, ricollega WordPress e riprova.";

export function externalLinkEvidenceState(statusText = "", loaded = "") {
  if (String(loaded) !== "1") return "pending";
  const text = String(statusText || "");
  if (/link non è più presente nel frontend corrente|problema non più presente nel frontend corrente/i.test(text)) return "resolved-stale";
  if (/\b\d+\s+occorrenz|1 occorrenza verificata/i.test(text)) return "active";
  return "unknown";
}

export function normalizeSharedConnectorRouteError(text = "") {
  const value = String(text || "");
  if (/nessun percorso fornisce una corrispondenza tra l['’]url ed il metodo richiesto/i.test(value)) return CONNECTOR_ROUTE_MESSAGE;
  if (/rest_no_route/i.test(value)) return CONNECTOR_ROUTE_MESSAGE;
  return "";
}
