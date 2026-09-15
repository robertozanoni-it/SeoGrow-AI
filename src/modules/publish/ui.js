// Public UI API for the Publish domain.
//
// The components still live in their legacy locations; this facade establishes
// ownership now so they can be moved later without changing application consumers.
export { default as AutomaticProposalPage } from "../../AutomaticProposalPage.jsx";
export { default as RemediationRuntime } from "../../RemediationRuntime.jsx";
export { default as CorrectionsWorkspace } from "../../CorrectionsWorkspace.jsx";
