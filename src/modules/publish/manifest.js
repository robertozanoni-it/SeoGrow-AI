import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const publishManifest = defineSuiteModule({
  id: "publish",
  label: "Publish",
  layer: "action",
  status: "planned",
  homePage: null,
  futurePath: "/publish",
  pages: [],
  capabilities: ["wordpress", "rank-math", "elementor", "preview", "rollback", "verify"],
});
