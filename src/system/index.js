// Public API for SeoGrow System.
//
// Integrations and settings stay behind this boundary while implementation is
// extracted from the legacy shell without changing persisted configuration.
export { systemManifest } from "./manifest.js";
export {
  mergeGoogleStatus,
  normalizeGoogleProperties,
} from "./integrations/googleProperties.js";
