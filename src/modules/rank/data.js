// Pure data API for Rank & Growth consumers that do not need the full facade.
// Cross-domain modules should prefer this entrypoint for Rank-owned data behavior.
export {
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
} from "./opportunityAnalysis.js";
export {
  datasetKey,
  addDatasetToHistory,
  compareDatasets,
} from "./datasetHistory.js";
