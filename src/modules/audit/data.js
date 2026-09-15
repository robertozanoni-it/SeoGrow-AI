// Pure data API for the Audit domain.
//
// This entry point intentionally exports no React/UI surface so non-UI domains
// can consume normalized audit evidence without importing the Audit UI facade.
export {
  observedNumber,
  observedPageCount,
  observedScoreDelta,
} from "./observedData.js";
export { metadataDuplicateGroups } from "./metadataDuplicateGroups.js";
export { isLegalPage, excludeLegalSeo } from "./legalPageScope.js";
export {
  latestOf,
  normalizeAnalysisHistory,
  analysisDiff,
} from "./history.js";
