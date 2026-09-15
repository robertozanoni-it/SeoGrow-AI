import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const linksManifest = defineSuiteModule({
  id: "links",
  label: "Links",
  layer: "module",
  status: "active",
  agentEnabled: true,
  homePage: "Link interni",
  futurePath: "/links",
  pages: ["Link interni"],
  capabilities: ["internal-links", "broken-links", "anchor-analysis"],
});
