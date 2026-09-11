// Evidence for public coverage only. A redirect never proves WordPress field ownership.
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 4;
const MAX_EVIDENCE_AGE_MS = 30 * 60_000;
const hostKey = (value) => value.toLowerCase().replace(/^www\./, "");

export function coverageIdentityUrl(value, siteUrl) {
  try {
    if ((typeof value !== "string" && !(value instanceof URL)) || !String(value).trim()) return "";
    const site = new URL(String(siteUrl || ""));
    const url = new URL(String(value || ""), site);
    if (site.protocol !== "https:" || url.protocol !== "https:") return "";
    if (url.username || url.password || site.username || site.password) return "";
    if (url.port !== site.port || hostKey(url.hostname) !== hostKey(site.hostname)) return "";
    url.hash = "";
    // Preserve path, slash, hostname and query. Equivalence needs observed redirects.
    return url.href;
  } catch {
    return "";
  }
}

export function verifiedCoverageRedirects(publicCoverage, siteUrl, now = Date.now()) {
  const aliases = new Map();
  if (publicCoverage?.publicCoverageReconciled !== true) return aliases;
  const coverage = new Set((Array.isArray(publicCoverage.coverageUrls) ? publicCoverage.coverageUrls : [])
    .map((url) => coverageIdentityUrl(url, siteUrl)).filter(Boolean));
  const rows = Array.isArray(publicCoverage.redirects) ? publicCoverage.redirects : [];
  if (rows.length > 300) return aliases;
  const conflicts = new Set();
  for (const row of rows) {
    const from = coverageIdentityUrl(row?.requestedUrl, siteUrl);
    const to = coverageIdentityUrl(row?.finalUrl, siteUrl);
    const chain = row?.chain;
    const observed = Date.parse(row?.inspectedAt || "");
    const mime = String(row?.contentType || "").split(";")[0].trim().toLowerCase();
    if (!from || !to || from === to || !coverage.has(to)) continue;
    if (row.source !== "seogrow-public-crawl" || row.readOnly !== true || row.verified !== true) continue;
    if (row.finalStatus !== 200 || !["text/html", "application/xhtml+xml"].includes(mime)) continue;
    if (!Number.isFinite(observed) || observed > now + 5_000 || now - observed > MAX_EVIDENCE_AGE_MS) continue;
    if (!Array.isArray(chain) || chain.length === 0 || chain.length > MAX_REDIRECTS) continue;
    let current = from;
    let valid = true;
    const seen = new Set([from]);
    for (const hop of chain) {
      const start = coverageIdentityUrl(hop?.fromUrl, siteUrl);
      const end = coverageIdentityUrl(hop?.toUrl, siteUrl);
      if (start !== current || !end || seen.has(end) || !REDIRECT_STATUSES.has(hop?.status)) {
        valid = false;
        break;
      }
      seen.add(end);
      current = end;
    }
    if (!valid || current !== to) continue;
    if (aliases.has(from) && aliases.get(from).finalUrl !== to) conflicts.add(from);
    aliases.set(from, { requestedUrl: from, finalUrl: to, redirectCount: chain.length });
  }
  for (const from of conflicts) aliases.delete(from);
  return aliases;
}
