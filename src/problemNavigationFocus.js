import { normalizeClientId, safeHttpHref } from "./reliabilityModel.js";

// Navigation context is never an approval: each destination resolves fresh data.
export function problemNavigationFocus(problem, clientId, currentClientId, openedFrom = "problem-card") {
  const scope = normalizeClientId(clientId);
  const sourceUrl = safeHttpHref(problem?.sourceUrl || problem?.url);
  const title = String(problem?.title || problem?.label || "").trim();
  if (!scope || scope !== normalizeClientId(currentClientId) || !sourceUrl || !title) return null;
  return { clientId: scope, sourceUrl, title, issueType: String(problem.issueType || problem.type || ""),
    issueKey: problem.key || "", correctability: problem.correctability || "manual", openedFrom, createdAt: Date.now() };
}
export function matchesProblemFocus(problem, focus) {
  if (!problem || !focus) return false;
  if (focus.issueKey && problem.key !== focus.issueKey) return false;
  const urlKey = value => { try { const u = new URL(value); u.hash = ""; return u.href; } catch { return ""; } };
  const wanted = urlKey(focus.sourceUrl);
  if (!wanted || urlKey(problem.sourceUrl) !== wanted) return false;
  return focus.issueType
    ? String(problem.issueType || "").toLowerCase() === String(focus.issueType).toLowerCase()
    : String(problem.title || "").trim().toLowerCase() === String(focus.title || "").trim().toLowerCase();
}
