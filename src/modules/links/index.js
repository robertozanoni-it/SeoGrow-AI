// Public API for the Links domain.
//
// Audit/crawl evidence stays in the shared workspace while consumers migrate
// behind this facade. Links reads that evidence without taking storage ownership.
export { linksManifest } from "./manifest.js";
export {
  internalLinkSuggestions,
  brokenInternalLinks,
  brokenExternalLinks,
  orphanPages,
} from "./selectors.js";
export {
  decodeLinkEntities,
  matchBrokenLinkHref,
  singleAnchorHref,
  transformBrokenLinkAnchors,
} from "./brokenLinkHref.js";
export {
  INTERNAL_LINK_ISSUE_TYPE,
  validateInternalLinkSuggestion,
  analyzeInternalLinkSuggestions,
  inspectAnchorInsertion,
  insertInternalLinkIntoHtml,
  buildInternalLinkPatch,
  assessInternalLinkPreflight,
  assessInternalLinkVerification,
} from "./internalLinkRemediation.js";
