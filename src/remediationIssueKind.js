export function remediationIssueKind(issue = {}) {
  const type = String(issue.type || issue.issueType || "").trim().toLowerCase();
  const exact = { title: "title", "duplicate-title": "title", seo_title: "title", description: "meta_description", "duplicate-description": "meta_description", "meta-description": "meta_description", meta_description: "meta_description", "meta description": "meta_description", h1: "h1", thin: "content", content: "content", excerpt: "excerpt", canonical: "canonical", indexability: "noindex", noindex: "noindex" };
  if (exact[type]) return exact[type];
  if (["url-alias", "broken-link", "broken-external-link"].includes(type)) return "";
  const label = String(issue.label || issue.title || "").toLowerCase();
  if (/meta\s*description|metadescription/.test(label)) return "meta_description";
  if (/title|titolo/.test(label)) return "title";
  if (/canonical/.test(label)) return "canonical";
  if (/noindex|indexability/.test(label)) return "noindex";
  if (/\bh1\b/.test(label)) return "h1";
  if (/excerpt|estratto/.test(label)) return "excerpt";
  if (/contenuto|content|testo|parole|word|brev/.test(label)) return "content";
  return "";
}
export function remediationSourceUrl(issue, audit, client) {
  const type = String(issue?.type || issue?.issueType || "").toLowerCase();
  const brokenLink = /broken-(?:external-)?link/.test(type);
  return issue?.sourceUrl || issue?.url || (!brokenLink ? issue?.targetUrl : "") || audit?.url || client?.url || "";
}
