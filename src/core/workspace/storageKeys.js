export const WORKSPACE_KEYS = Object.freeze({
  clients: "seogrow-clients",
  selectedClient: "seogrow-selected-client-v1",
  selectedPage: "seogrow-selected-page-v1",
  tasks: "seogrow-tasks-v2",
  gsc: "seogrow-gsc-v1",
  gscHistory: "seogrow-gsc-history-v1",
  analyses: "seogrow-analyses-v2",
  rankings: "seogrow-rankings-v1",
  topicalMaps: "seogrow-topical-maps-v1",
  geoData: "seogrow-geo-v1",
  contentDrafts: "seogrow-content-drafts-v1",
  wordpressProfiles: "seogrow-wordpress-profiles-v1",
  cmsRouter: "seogrow-cms-router-v1",
  auditMonitor: "seogrow-audit-monitor-v1",
  pageAuditHistory: "seogrow-page-audit-history-v2",
  auditResults: "seogrow-quick-audits-v1",
  agentRuns: "seogrow-agent-runs-v1",
  problemClosures: "seogrow-problem-closures-v1",
  preferences: "seogrow-preferences-v1",
  snapshots: "seogrow-snapshots-v1",
  remediationHistory: "seogrow-remediation-history-v1",
  remediationLastBatch: "seogrow-remediation-last-batch-v1",
  approvalLedger: "seogrow-agent-approval-ledger-v1",
  uiMode: "seogrow-ui-mode-v1",
  wizardContext: "seogrow-wizard-context-v1",
});

export const SESSION_KEYS = Object.freeze({
  agentPrefill: "seogrow-agent-prefill-v1",
});

export const workspaceKey = (name) => {
  const value = WORKSPACE_KEYS[name];
  if (!value) throw new Error(`Chiave workspace SeoGrow sconosciuta: ${name}`);
  return value;
};

export const sessionKey = (name) => {
  const value = SESSION_KEYS[name];
  if (!value) throw new Error(`Chiave sessione SeoGrow sconosciuta: ${name}`);
  return value;
};
