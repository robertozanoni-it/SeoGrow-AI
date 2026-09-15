// Public API for SeoGrow Publish.
//
// The implementation intentionally stays in its current legacy location while
// callers are migrated incrementally. Consumers outside Publish should depend
// on this facade instead of importing wordpressRemediationEngine directly.
export { publishManifest } from "./manifest.js";
export {
  preparationFailure,
  inspectWordPress,
  inspectFrontend,
  inspectLinkEvidence,
  buildPlan,
  createWordPressCorrection,
  applyPreparedCorrection,
} from "../../wordpressRemediationEngine.js";
