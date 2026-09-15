import { issueIdentity } from "../../reliabilityModel.js";

export const latestOf = (value) =>
  Array.isArray(value) ? value[0] || null : value || null;

export function normalizeAnalysisHistory(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function analysisDiff(current, previous) {
  if (!current || !previous) return { newIssues: [], resolvedIssues: [] };
  const key = (issue) => issueIdentity({ issueType: issue.type, issueLabel: issue.label, sourceUrl: issue.sourceUrl || issue.url, issue });
  const reviewKeys = new Set((Array.isArray(current.reviewItems) ? current.reviewItems : []).map(key));
  const pages = Array.isArray(current.pages) ? current.pages : [];
  const verifiableFields = { title: "titleLength", description: "descriptionLength", h1: "h1", image: "missingAlt", thin: "words", performance: "responseMs", depth: "depth" };
  const wasRechecked = issue => {
    const field = verifiableFields[issue.type];
    if (!field || reviewKeys.has(key(issue))) return false;
    return pages.some(page => page.url === (issue.sourceUrl || issue.url) && Number(page.status) >= 200 && Number(page.status) < 300 && Number.isFinite(page[field]));
  };
  const old = new Map(
    (Array.isArray(previous.issues) ? previous.issues : []).map((issue) => [
      key(issue),
      issue,
    ]),
  );
  const now = new Map(
    (Array.isArray(current.issues) ? current.issues : []).map((issue) => [
      key(issue),
      issue,
    ]),
  );
  return {
    newIssues: [...now]
      .filter(([id]) => !old.has(id))
      .map(([, issue]) => issue),
    resolvedIssues: [...old]
      .filter(([id, issue]) => !now.has(id) && wasRechecked(issue))
      .map(([, issue]) => issue),
  };
}
