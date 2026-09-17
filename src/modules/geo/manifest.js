import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const geoManifest = defineSuiteModule({
  id: "geo",
  label: "GEO",
  layer: "module",
  status: "active",
  agentEnabled: true,
  homePage: "GEO AI",
  futurePath: "/geo",
  pages: ["GEO AI"],
  capabilities: [
    "crawler-access-evidence",
    "entity-schema-evidence",
    "citation-authority-signals",
    "content-answerability-diagnostic",
    "serp-observation",
    "opportunity-handoff",
    "geo-report",
  ],
});
