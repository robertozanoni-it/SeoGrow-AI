import { normalizeHttpUrl } from "./reliabilityModel.js";

export function canonicalEquivalentIssueType(record = {}) {
  const type = String(record?.issueType || record?.kind || record?.issue?.type || "").trim().toLowerCase();
  const label = String(record?.issueLabel || record?.title || record?.issue?.label || "").trim().toLowerCase();

  if ((type === "title" || type === "seo_title") && /(?:title|titolo).*duplic/.test(label)) return "duplicate-title";
  if (["description", "meta-description", "meta_description", "meta description"].includes(type) && /(?:description|metadescription).*duplic/.test(label)) return "duplicate-description";
  if (["meta-description", "meta_description", "meta description"].includes(type)) return "description";
  if (["noindex", "indexability"].includes(type)) return "indexability";
  if (["thin-content", "thin"].includes(type)) return "thin";
  if (type === "content" && /contenuto breve|short content|\b\d+\s+parole\b/i.test(label)) return "thin";
  return type;
}

export function auditCompatibilityIdentity(record = {}) {
  const family = canonicalEquivalentIssueType(record);
  const source = normalizeHttpUrl(
    record?.sourceUrl || record?.url || record?.targetUrl || record?.issue?.sourceUrl || record?.issue?.url || "",
    { stripSlash: true },
  );
  if (!family || !source) return "";
  const broken = /^broken-(?:external-)?link$/i.test(family);
  const target = broken
    ? normalizeHttpUrl(
        record?.targetUrl || record?.brokenUrl || record?.destinationUrl || record?.href || record?.issue?.targetUrl || "",
        { stripSlash: true },
      )
    : "";
  return `${family}::${source}${target ? `::target:${target}` : ""}`;
}
