// Legacy compatibility shim for Google integration state helpers.
// System owns the implementation; existing imports remain valid during the
// Suite migration.
export {
  mergeGoogleStatus,
  normalizeGoogleProperties,
} from "./system/integrations/googleProperties.js";
