import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const auditManifest = defineSuiteModule({
  id: "audit",
  label: "Audit",
  layer: "module",
  status: "active",
  agentEnabled: true,
  homePage: "Audit SEO",
  futurePath: "/audit",
  pages: ["Audit SEO", "Problemi"],
  capabilities: ["detect", "prioritize", "verify"],
});
