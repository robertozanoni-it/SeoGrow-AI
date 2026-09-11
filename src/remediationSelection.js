import { normalizeClientId, issueIdentity } from "./reliabilityModel.js";
import { remediationSourceUrl } from "./remediationIssueKind.js";
import { exactPageKey } from "./remediationEvidence.js";

export const proposalSelectionKey = focus => focus ? JSON.stringify([
  focus.clientId, focus.sourceUrl, focus.issueType || "", focus.title || "", focus.createdAt,
]) : "";

// A dedicated proposal resolves its current persisted identity, never a replayed index.
export function selectFocusedRemediation(audits, focus, clientId, client) {
  if (!focus || !normalizeClientId(clientId) || normalizeClientId(focus.clientId) !== normalizeClientId(clientId)) return null;
  const source = exactPageKey(focus.sourceUrl);
  if (!source) return null;
  const text = value => String(value || "").trim().toLowerCase();
  const matching = [];
  for (const audit of audits) {
    const indexes = (Array.isArray(audit.item?.issues) ? audit.item.issues : []).flatMap((issue, index) => {
      const sameType = focus.issueType ? text(issue.type) === text(focus.issueType)
        : text(issue.label || issue.title || issue.type) === text(focus.title);
      return sameType && exactPageKey(remediationSourceUrl(issue, audit.item, client)) === source ? [index] : [];
    });
    if (indexes.length) matching.push({ audit, indexes, at: Date.parse(audit.item.analyzedAt || audit.item.startedAt || "") });
  }
  if (!matching.length || matching.some(item => !Number.isFinite(item.at))) return null;
  const latest = Math.max(...matching.map(item => item.at));
  const newest = matching.filter(item => item.at === latest);
  if (newest.length !== 1 || newest[0].indexes.length !== 1) return null;
  return { audit: newest[0].audit, issueIndex: newest[0].indexes[0], focusKey: proposalSelectionKey(focus) };
}

export function correctionIssueKeys(record) {
  return [record.issueKey, record.legacyIssueKey, issueIdentity({
    issue: record.issue, issueType: record.issueType, issueLabel: record.issueLabel, sourceUrl: record.sourceUrl,
  })].filter(Boolean);
}
