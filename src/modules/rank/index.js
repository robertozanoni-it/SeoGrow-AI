// Public API for the Rank & Growth domain.
//
// Implementations are extracted incrementally behind this facade. New
// consumers should depend on this API instead of importing Rank/GSC helpers
// from legacy monolith files directly.
export { rankManifest } from "./manifest.js";
export { opportunityQueries } from "./opportunityQueries.js";
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
export { suggestPageForQuery } from "./pageSuggestion.js";
export { opportunityTask, findExistingTask } from "./opportunityTasks.js";
export {
  RANKING_SOURCE,
  rankingRunIdentity,
  validRankingRuns,
  comparableRankingRuns,
  rankingPositionLabel,
  buildPositioningRows,
  opportunityEvidenceForKeyword,
  positioningFilter,
} from "./positioningModel.js";
export {
  buildSeoOpportunities,
  validateSeoOpportunityActionability,
} from "./seoOpportunities.js";
