// Legacy compatibility shim.
// Content owns editorial quality and publishability policy; existing server
// consumers remain valid while imports migrate to the Content public API.
export {
  validateSeoSuggestion,
  assertPublishableSeoSuggestion,
  stripHtml,
} from "./modules/content/editorialQuality.js";
