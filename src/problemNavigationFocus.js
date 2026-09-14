import { normalizeClientId, normalizeHttpUrl, safeHttpHref } from "./reliabilityModel.js";

// Navigation context is never an approval: each destination resolves fresh data.
export function problemNavigationFocus(problem, clientId, currentClientId, openedFrom = "problem-card") {
  const scope = normalizeClientId(clientId);
  const sourceUrl = safeHttpHref(problem?.sourceUrl || problem?.url);
  const title = String(problem?.title || problem?.label || "").trim();
  if (!scope || scope !== normalizeClientId(currentClientId) || !sourceUrl || !title) return null;
  return {
    clientId: scope,
    sourceUrl,
    title,
    issueType: String(problem.issueType || problem.type || ""),
    issueKey: problem.key || "",
    correctability: problem.correctability || "manual",
    openedFrom,
    createdAt: Date.now(),
  };
}

const focusUrlKey = (value) => normalizeHttpUrl(value || "", { stripSlash: true });
const isTargetSpecificLink = (problem, focus) => /broken-(?:external-)?link/i.test(String(problem?.issueType || focus?.issueType || ""));

export function matchesProblemFocus(problem, focus) {
  if (!problem || !focus) return false;
  const wanted = focusUrlKey(focus.sourceUrl);
  if (!wanted || focusUrlKey(problem.sourceUrl) !== wanted) return false;

  const typeMatches = focus.issueType
    ? String(problem.issueType || "").toLowerCase() === String(focus.issueType).toLowerCase()
    : String(problem.title || "").trim().toLowerCase() === String(focus.title || "").trim().toLowerCase();
  if (!typeMatches) return false;

  // Link findings can share the same source URL/type but refer to different destinations,
  // therefore their persisted identity must remain exact. Other findings may legitimately
  // receive a new identity after URL normalization or audit reconciliation; URL + type is
  // sufficient to reopen the current row without reviving stale data.
  if (focus.issueKey && problem.key !== focus.issueKey && isTargetSpecificLink(problem, focus)) return false;
  return true;
}
