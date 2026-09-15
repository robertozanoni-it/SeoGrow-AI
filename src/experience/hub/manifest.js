import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const hubManifest = defineSuiteModule({
  id: "hub",
  label: "SeoGrow Hub",
  layer: "experience",
  status: "active",
  homePage: "Panoramica",
  futurePath: "/overview",
  pages: ["Panoramica", "Clienti", "Centro progetto", "Storico", "SeoGrow AI"],
  capabilities: ["project-context", "project-health", "activity-summary"],
});
