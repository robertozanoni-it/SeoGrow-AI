import { defineSuiteModule } from "../core/modules/moduleContract.js";

export const systemManifest = defineSuiteModule({
  id: "system",
  label: "System",
  layer: "system",
  status: "active",
  homePage: "Integrazioni",
  futurePath: "/settings",
  pages: ["Integrazioni", "Impostazioni"],
  capabilities: ["integrations", "settings"],
});
