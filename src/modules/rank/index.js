// Public API for the Rank & Growth domain.
//
// Implementations intentionally remain in their legacy files while callers are
// migrated incrementally. New consumers should depend on this facade instead
// of importing Rank/GSC opportunity logic from the monolith helpers directly.
export { rankManifest } from "./manifest.js";
export { trafficDropSignals } from "./signals.js";
export { opportunityQueries } from "../../gscImport.js";
export {
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
} from "../../platform.js";
export { suggestPageForQuery } from "../../seoHelpers.js";
export { opportunityTask, findExistingTask } from "../../opportunityTasks.js";
