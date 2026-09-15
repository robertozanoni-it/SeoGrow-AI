// Public API for Links.
//
// Broken-link remediation remains implemented in the legacy files during the
// modular extraction. This facade gives the Links domain a stable public
// contract without changing current behavior or persisted data.
export {
  BROKEN_LINK_CLEANUP_MODES,
  brokenExternalTarget,
  normalizeBrokenLinkCleanupMode,
  setBrokenLinkCleanupMode,
  brokenLinkCleanupMode,
  clearBrokenLinkCleanupMode,
  consumeBrokenLinkCleanupMode,
  removeExactAnchor,
  prepareElementorBrokenExternalLink,
} from "../../brokenLinkRemediation.js";
export { matchBrokenLinkHref, transformBrokenLinkAnchors } from "../../brokenLinkHref.js";
