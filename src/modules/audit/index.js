// Public UI API for the Audit domain.
//
// Implementations are extracted incrementally behind this boundary.
// Execution/remediation surfaces belong to Publish and are not exported here.
export { auditManifest } from "./manifest.js";
export {
  observedNumber,
  observedPageCount,
  observedScoreDelta,
  metadataDuplicateGroups,
} from "./data.js";
export { default as ProblemsNavBridge } from "../../ProblemsNavBridge.jsx";
export { default as ProblemsWorkspaceMount } from "../../ProblemsWorkspaceMount.jsx";
export { default as ProblemResolutionPage } from "../../ProblemResolutionPage.jsx";
export { default as AuditWorkspace } from "../../AuditWorkspace.jsx";
