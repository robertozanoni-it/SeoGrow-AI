export const WORKSPACE_KEYS = Object.freeze({
  clients: "seogrow-clients",
  selectedClient: "seogrow-selected-client-v1",
  selectedPage: "seogrow-selected-page-v1",
  tasks: "seogrow-tasks-v2",
  gsc: "seogrow-gsc-v1",
  gscHistory: "seogrow-gsc-history-v1",
  analyses: "seogrow-analyses-v2",
  remediationHistory: "seogrow-remediation-history-v1",
  agentRuns: "seogrow-agent-runs-v1",
  approvalLedger: "seogrow-agent-approval-ledger-v1",
  uiMode: "seogrow-ui-mode-v1",
  wizardContext: "seogrow-wizard-context-v1",
});

export const workspaceKey = (name) => {
  const value = WORKSPACE_KEYS[name];
  if (!value) throw new Error(`Chiave workspace SeoGrow sconosciuta: ${name}`);
  return value;
};
