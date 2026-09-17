// Public API for SeoGrow System.
//
// Integrations and settings stay behind this boundary while implementation is
// extracted from the legacy shell without changing persisted configuration.
export { systemManifest } from "./manifest.js";
export {
  mergeGoogleStatus,
  normalizeGoogleProperties,
} from "./integrations/googleProperties.js";
export {
  rememberWordPressSession,
  getWordPressSession,
  forgetWordPressSession,
} from "./integrations/wordpressSession.js";
export {
  INTEGRATION_KINDS,
  buildProjectIntegrationRegistry,
  integrationConnection,
  integrationStatusLabel,
  validateSingleProjectIntegrationConfig,
} from "./integrations/projectIntegrationRegistry.js";
export {
  DEFAULT_PROJECT_POLICY,
  USER_CONTROLLABLE_SETTINGS,
  SERVER_ONLY_CONFIGURATION,
  normalizeProjectPolicy,
  projectPolicyFromPreferences,
  writeProjectPolicy,
  pathExcludedByProjectPolicy,
  projectWriteAllowed,
} from "./settings/projectPolicy.js";
export {
  budgetMoney,
  providerBudgetHealth,
} from "./providers/providerBudget.js";
