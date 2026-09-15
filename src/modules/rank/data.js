// Pure data API for Rank & Growth consumers that do not need the full facade.
// Cross-domain modules should prefer this entrypoint for opportunity analysis.
export {
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
} from "./opportunityAnalysis.js";
