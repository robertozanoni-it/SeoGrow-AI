import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const agentManifest = defineSuiteModule({
  id: "agent",
  label: "SeoGrow Agent",
  layer: "intelligence",
  status: "active",
  homePage: "SEO Agent",
  futurePath: "/agent",
  pages: ["SEO Agent"],
  capabilities: ["orchestration", "planning", "verification", "canonical-handoffs", "action-log"],
});
