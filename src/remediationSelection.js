import { normalizeClientId, issueIdentity, safeHttpHref } from "./reliabilityModel.js";
import { remediationSourceUrl } from "./remediationIssueKind.js";
import { exactPageKey } from "./remediationEvidence.js";

export const proposalSelectionKey = focus => focus ? JSON.stringify([
  focus.clientId,
  focus.sourceUrl,
  focus.issueType || "",
  focus.title || "",
  focus.createdAt,
  focus.issueKey || "",
  focus.targetUrl || "",
  focus.controlledPreview === true,
  focus.controlledReviewPreview === true,
  focus.controlledContextPreview === true,
  focus.reviewOnly === true,
]) : "";

const auditAt = audit => Date.parse(audit?.item?.analyzedAt || audit?.item?.startedAt || "");
const auditType = audit => audit?.type || audit?.auditType || "";

// A dedicated proposal resolves its current persisted identity, never a replayed index.
export function selectFocusedRemediation(audits, focus, clientId, client) {
  if (!focus || !normalizeClientId(clientId) || normalizeClientId(focus.clientId) !== normalizeClientId(clientId)) return null;
  const source = exactPageKey(focus.sourceUrl);
  if (!source) return null;
  const text = value => String(value || "").trim().toLowerCase();
  const collections = focus.controlledReviewPreview === true || focus.controlledContextPreview === true
    ? ["reviewItems", "issues"]
    : ["issues"];
  const ordered = [...audits]
    .filter(audit => Number.isFinite(auditAt(audit)))
    .toSorted((a, b) => auditAt(b) - auditAt(a));
  const latestExactPage = ordered.find(audit => auditType(audit) === "page" && exactPageKey(audit.item?.url) === source) || null;
  const searchAudits = latestExactPage ? [latestExactPage] : ordered;
  const matching = [];

  for (const audit of searchAudits) {
    for (const collection of collections) {
      const rows = Array.isArray(audit.item?.[collection]) ? audit.item[collection] : [];
      const indexes = rows.flatMap((issue, index) => {
        const sameType = focus.issueType ? text(issue.type) === text(focus.issueType)
          : text(issue.label || issue.title || issue.type) === text(focus.title);
        const sameTarget = !focus.targetUrl || safeHttpHref(issue.targetUrl || issue.brokenUrl || issue.destinationUrl || issue.href || "") === safeHttpHref(focus.targetUrl);
        return sameType && sameTarget && exactPageKey(remediationSourceUrl(issue, audit.item, client)) === source ? [index] : [];
      });
      if (indexes.length) matching.push({ audit, rows, indexes, collection, at: auditAt(audit) });
    }
    // A newer exact page audit is authoritative. If it does not contain the finding,
    // never fall back to an older site/page audit and resurrect stale evidence.
    if (latestExactPage) break;
  }
  if (!matching.length) return null;
  const latest = Math.max(...matching.map(item => item.at));
  const newest = matching.filter(item => item.at === latest);
  if (newest.length !== 1 || newest[0].indexes.length !== 1) return null;
  const sourceIndex = newest[0].indexes[0];
  const collection = newest[0].collection;
  if (collection === "reviewItems") {
    const reviewItem = newest[0].rows[sourceIndex];
    const audit = { ...newest[0].audit, item: { ...newest[0].audit.item, issues: [reviewItem] } };
    return { audit, issueIndex: 0, sourceIssueIndex: sourceIndex, collection, focusKey: proposalSelectionKey(focus) };
  }
  return { audit: newest[0].audit, issueIndex: sourceIndex, sourceIssueIndex: sourceIndex, collection, focusKey: proposalSelectionKey(focus) };
}

export function correctionIssueKeys(record) {
  return [record.issueKey, record.legacyIssueKey, issueIdentity({
    issue: record.issue, issueType: record.issueType, issueLabel: record.issueLabel, sourceUrl: record.sourceUrl,
  })].filter(Boolean);
}
