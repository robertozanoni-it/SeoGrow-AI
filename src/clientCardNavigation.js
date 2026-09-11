import { workspaceStorage, flushWorkspace } from "./workspaceDatabase.js";
import { normalizeClientId } from "./reliabilityModel.js";
const CLIENT_KEY = "seogrow-selected-client-v1";
export function clientForCard(clients, id) {
  const scope = normalizeClientId(id);
  return scope ? (Array.isArray(clients) ? clients : []).find(client => normalizeClientId(client?.id) === scope) || null : null;
}
export async function selectCardClient(id) {
  const clients = JSON.parse(workspaceStorage.getItem("seogrow-clients") || "[]");
  const client = clientForCard(clients, id);
  if (!client) throw new Error("Il progetto di questa card non è più disponibile.");
  const oldValue = workspaceStorage.getItem(CLIENT_KEY);
  const newValue = JSON.stringify(normalizeClientId(client.id));
  if (oldValue !== newValue) {
    workspaceStorage.setItem(CLIENT_KEY, newValue);
    // React must see the same identity immediately; a pending state persistence
    // effect must never restore the previous project during this navigation.
    window.dispatchEvent(new StorageEvent("storage", { key: CLIENT_KEY, oldValue, newValue }));
    await flushWorkspace();
    window.dispatchEvent(new CustomEvent("seogrow-storage-ok", { detail: { key: CLIENT_KEY } }));
  }
  if (workspaceStorage.getItem(CLIENT_KEY) !== newValue) throw new Error("Il progetto è cambiato durante l’apertura. Riapri la card desiderata.");
  return client;
}
