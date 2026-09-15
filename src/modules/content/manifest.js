import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const contentManifest = defineSuiteModule({
  id: "content",
  label: "Content",
  layer: "module",
  status: "active",
  agentEnabled: true,
  homePage: "Piano editoriale",
  futurePath: "/content",
  pages: ["Piano editoriale"],
  capabilities: ["editorial-plan", "content-brief", "content-optimization"],
});
