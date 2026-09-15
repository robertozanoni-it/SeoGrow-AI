import { isRegisteredPage } from "../core/modules/moduleRegistry.js";

const item = (page, label, icon, advancedOnly = false) => Object.freeze({ page, label, icon, advancedOnly });
const group = (label, items) => Object.freeze({ label, items: Object.freeze(items) });

export const SUITE_NAVIGATION = Object.freeze([
  group("Overview", [
    item("Panoramica", "Overview", "overview"),
    item("Clienti", "Clienti", "clients"),
    item("Centro progetto", "Centro progetto", "project", true),
    item("Storico", "Storico", "history", true),
  ]),
  group("GROW", [
    item("Audit SEO", "Audit", "audit"),
    item("Problemi", "Problemi", "problems"),
    item("Posizionamenti", "Rankings", "rankings"),
    item("Opportunità", "Opportunità", "opportunities", true),
    item("Piano editoriale", "Content", "content"),
    item("Link interni", "Links", "links"),
    item("GEO AI", "GEO", "geo"),
  ]),
  group("ACT", [
    item("Correzioni", "Publish", "fix"),
    item("Task", "Tasks", "tasks"),
  ]),
  group("AI", [
    item("SEO Agent", "SeoGrow Agent", "agent"),
    item("SeoGrow AI", "SeoGrow AI", "ai-overview", true),
  ]),
  group("SYSTEM", [
    item("Integrazioni", "Integrations", "integrations"),
    item("Impostazioni", "Settings", "settings"),
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
