// Legacy compatibility boundary.
// Approval is enforced at the actual WordPress draft submit boundary and by
// remediation approval tokens. Do not rewrite the user's stored preference:
// old workspaces and browser QA must remain stable across reloads.
export function enforceMandatoryWordPressApproval() {
  return false;
}
