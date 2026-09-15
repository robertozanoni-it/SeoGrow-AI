import { isRegisteredPage } from "../core/modules/moduleRegistry.js";

const item = (page, label, icon, advancedOnly = false) => Object.freeze({ page, label, icon, advancedOnly });
const group = (label, items) => Object.freeze({ label, items: Object.freeze(items) });

export const SUITE_NAVIGATION = Object.freeze([
  group("CONTROLLO", [
    item("Panoramica", "Panoramica", "overview"),
    item("Clienti", "Clienti", "clients"),
    item("Centro progetto", "Centro progetto", "project", true),
    item("Storico", "Storico", "history", true),
  ]),
  group("CRESCITA", [
    item("Audit SEO", "Audit", "audit"),
    item("Problemi", "Problemi", "problems"),
    item("Posizionamenti", "Posizionamenti", "rankings"),
    item("Opportunità", "Opportunità", "opportunities", true),
    item("Piano editoriale", "Piano editoriale", "content"),
    item("Link interni", "Link interni", "links"),
    item("GEO AI", "GEO", "geo"),
  ]),
  group("AZIONI", [
    item("Correzioni", "Correzioni", "fix"),
    item("Task", "Task", "tasks"),
  ]),
  group("AI", [
    item("SEO Agent", "SEO Agent", "agent"),
    item("SeoGrow AI", "Hub AI", "ai-overview", true),
  ]),
  group("SISTEMA", [
    item("Integrazioni", "Integrazioni", "integrations"),
    item("Impostazioni", "Impostazioni", "settings"),
  ]),
]);

for (const navigationGroup of SUITE_NAVIGATION) {
  for (const navigationItem of navigationGroup.items) {
    if (!isRegisteredPage(navigationItem.page)) {
      throw new Error(`Navigazione SeoGrow punta a una pagina non registrata: ${navigationItem.page}`);
    }
  }
}

export const suiteNavigationItem = (page) => {
  for (const navigationGroup of SUITE_NAVIGATION) {
    const found = navigationGroup.items.find((navigationItem) => navigationItem.page === page);
    if (found) return found;
  }
  return null;
};
