import { defineSuiteModule } from "../../core/modules/moduleContract.js";

export const rankManifest = defineSuiteModule({
  id: "rank",
  label: "Rank & Growth",
  layer: "module",
  status: "active",
  homePage: "Posizionamenti",
  futurePath: "/rank",
  pages: ["Posizionamenti", "Opportunità"],
  capabilities: ["rankings", "search-opportunities", "growth-signals"],
});
