import { normalizeClientId, normalizeHttpUrl, safeHttpHref } from "./reliabilityModel.js";

// Navigation context is never an approval: each destination resolves fresh data.
export function problemNavigationFocus(problem, clientId, currentClientId, openedFrom = "problem-card") {
  const scope = normalizeClientId(clientId);
  const sourceUrl = safeHttpHref(problem?.sourceUrl || problem?.url);
  const title = String(problem?.title || problem?.label || "").trim();
  if (!scope || scope !== normalizeClientId(currentClientId) || !sourceUrl || !title) return null;
  const targetUrl = Array.isArray(problem?.targetUrls) && problem.targetUrls.length === 1 ? safeHttpHref(problem.targetUrls[0]) : safeHttpHref(problem?.targetUrl);
  return {
    clientId: scope,
    sourceUrl,
    title,
    issueType: String(problem.issueType || problem.type || ""),
    issueKey: problem.key || "",
    targetUrl: targetUrl || "",
    identity: [problem.key || "", String(problem.issueType || problem.type || ""), sourceUrl, targetUrl || ""].join("::"),
    correctability: problem.correctability || "manual",
    openedFrom,
    createdAt: Date.now(),
  };
}

const urlKey = (value) => normalizeHttpUrl(value || "", { stripSlash: true });

export function matchesProblemFocus(problem, focus) {
  if (!problem || !focus) return false;
  const wantedUrl = urlKey(focus.sourceUrl);
  if (!wantedUrl || urlKey(problem.sourceUrl) !== wantedUrl) return false;

  const wantedType = String(focus.issueType || "").trim().toLowerCase();
  const problemType = String(problem.issueType || "").trim().toLowerCase();
  if (wantedType && problemType !== wantedType) return false;

  const wantedTarget = urlKey(focus.targetUrl);
  if (wantedTarget) {
    const targets = Array.isArray(problem.targetUrls) ? problem.targetUrls.map(urlKey) : [];
    if (!targets.includes(wantedTarget)) return false;
  }

  // The stable issue key remains the strongest match. If an audit refresh rebuilds
  // the key from fresher evidence, fall back to type + normalized URL. Broken-link
  // findings remain target-scoped so two links on the same page never collapse.
  if (focus.issueKey && problem.key === focus.issueKey) return true;
  if (focus.issueKey && /broken-(?:external-)?link/.test(problemType) && !wantedTarget) return false;

  if (wantedType) return true;
  return String(problem.title || "").trim().toLowerCase() === String(focus.title || "").trim().toLowerCase();
}
