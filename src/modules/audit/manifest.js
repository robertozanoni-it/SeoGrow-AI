import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const auditManifest = defineSuiteModule({
  id: "audit",
  label: "Audit & Fix",
  layer: "module",
  status: "active",
  homePage: "Audit SEO",
  futurePath: "/audit",
  pages: ["Audit SEO", "Problemi", "Correzioni"],
  capabilities: ["detect", "prioritize", "fix", "verify"],
});
