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
  capabilities: ["entity-clarity", "answerability", "citation-readiness", "query-monitor", "serp-observation", "competitor-gap", "geo-strategy", "geo-report"],
});
