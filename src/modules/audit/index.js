// Transitional public API for the Audit & Fix domain.
//
// Implementations intentionally remain in their legacy paths during the first
// extraction. New consumers should import from this facade so files can move
// behind the boundary without forcing another application-wide rewrite.
export { default as ProblemsNavBridge } from "../../ProblemsNavBridge.jsx";
export { default as ProblemsWorkspaceMount } from "../../ProblemsWorkspaceMount.jsx";
export { default as ProblemResolutionPage } from "../../ProblemResolutionPage.jsx";
export { default as AutomaticProposalPage } from "../../AutomaticProposalPage.jsx";
export { default as AuditWorkspace } from "../../AuditWorkspace.jsx";
export { default as RemediationRuntime } from "../../RemediationRuntime.jsx";
export { default as CorrectionsWorkspace } from "../../CorrectionsWorkspace.jsx";
