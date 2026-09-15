import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const publishManifest = defineSuiteModule({
  id: "publish",
  label: "Publish",
  layer: "action",
  status: "active",
  agentEnabled: false,
  homePage: "Correzioni",
  futurePath: "/publish",
  pages: ["Correzioni"],
  capabilities: ["preview", "apply", "wordpress", "rank-math", "elementor", "rollback", "verify"],
});
