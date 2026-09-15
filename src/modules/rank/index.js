// Public API for the Rank & Growth domain.
//
// Implementations are extracted incrementally behind this facade. New
// consumers should depend on this API instead of importing Rank/GSC helpers
// from legacy monolith files directly.
export { rankManifest } from "./manifest.js";
export { opportunityQueries } from "../../gscImport.js";
export {
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
} from "../../platform.js";
export { suggestPageForQuery } from "../../seoHelpers.js";
export { opportunityTask, findExistingTask } from "./opportunityTasks.js";
