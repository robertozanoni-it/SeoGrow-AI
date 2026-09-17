// Public API for the Content domain.
//
// Implementations are extracted incrementally behind this facade. New
// consumers should depend on this API instead of importing editorial behavior
// from legacy monolith files directly.
export { contentManifest } from "./manifest.js";
export { contentPlan } from "./contentPlan.js";
export { contentSafetyErrors } from "./contentSafety.js";
export {
  validateSeoSuggestion,
  assertPublishableSeoSuggestion,
  stripHtml,
} from "./editorialQuality.js";
export {
  validDate,
  calendarDays,
  planItems,
  scheduleItem,
} from "./editorialPlanning.js";
export {
  EDITORIAL_CONTEXT_SCHEMA,
  buildEditorialProjectContext,
  validateEditorialProjectContext,
  parseEditorialProjectContext,
  serializeEditorialProjectContext,
} from "./editorialProjectContext.js";
