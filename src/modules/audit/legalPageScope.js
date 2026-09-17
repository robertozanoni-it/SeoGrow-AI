// Exact policy slugs: articles discussing privacy are still editorial SEO pages.
export function isLegalPage(value) {
  try {
    const parts = decodeURIComponent(new URL(value).pathname).toLowerCase().split('/').filter(Boolean).map(part => part.replace(/\.html?$/, '').replace(/[_.\s]+/g, '-').replace(/-+/g, '-').replace(/-\d+$/, '').replace(/^-|-$/g, ''));
    return parts.some(part => /^(privacy|privacy-policy|informativa-privacy|informativa-sulla-privacy|cookie|cookies|cookie-policy|cookies-policy|informativa-cookie|gdpr|gdpr-policy|privacy-e-cookie|privacy-cookie-policy|politica-di-utilizzo|termini-del-servizio|termini-di-uso|termini-di-utilizzo|terms-of-service|terms-of-use|terms-and-conditions|termini-e-condizioni)$/.test(part));
  } catch { return false; }
}

const normalizedPath = (value) => {
  try {
    const path = decodeURIComponent(new URL(String(value || '')).pathname).toLowerCase().replace(/\/{2,}/g, '/');
    return path || '/';
  } catch { return ''; }
};

export function isConfiguredAuditExclusion(value, excludedPaths = []) {
  const pathname = normalizedPath(value);
  if (!pathname) return false;
  return (Array.isArray(excludedPaths) ? excludedPaths : []).some(pattern => {
    const raw = String(pattern || '').trim().toLowerCase();
    if (!raw) return false;
    const normalized = `/${raw.replace(/^\/+|\/+$/g, '')}${raw === '/' ? '' : '/'}`.replace(/\/{2,}/g, '/');
    const exact = normalized === '/' ? '/' : normalized.replace(/\/$/, '');
    const candidate = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
    return candidate === exact || (exact !== '/' && candidate.startsWith(`${exact}/`));
  });
}

const isExcludedPage = (value, excludedPaths) => isLegalPage(value) || isConfiguredAuditExclusion(value, excludedPaths);

const issueScopeUrl = (issue, fallbackUrl = '') => {
  const type = String(issue?.type || '').toLowerCase();
  const brokenLink = /broken-(?:external-)?link/.test(type);
  // Per i link rotti targetUrl è la destinazione guasta, non la pagina sorgente
  // da includere/escludere dall'audit SEO. Per gli altri finding legacy targetUrl
  // può invece essere l'unica URL della pagina analizzata.
  return issue?.sourceUrl || issue?.url || (!brokenLink ? issue?.targetUrl : '') || fallbackUrl || '';
};

const failureScopeUrl = (failure, fallbackUrl = '') =>
  failure?.sourceUrl || failure?.url || failure?.pageUrl || fallbackUrl || '';

const linkSources = (link) => {
  const explicit = Array.isArray(link?.sources) ? link.sources : [];
  const single = [link?.sourceUrl, link?.source, link?.pageUrl].filter(Boolean);
  return [...new Set([...explicit, ...single].filter(Boolean))];
};

const linkHasSeoSource = (link, excludedPaths) => {
  const sources = linkSources(link);
  // Se il crawler non ha salvato la sorgente, conserviamo il dato invece di
  // eliminarlo per supposizione. Se invece tutte le sorgenti sono escluse,
  // quel link non appartiene all'audit SEO operativo.
  return !sources.length || sources.some(source => !isExcludedPage(source, excludedPaths));
};

export function excludeLegalSeo(data, { excludedPaths = [] } = {}) {
  const legalOnly = isLegalPage(data.url);
  const configuredOnly = !legalOnly && isConfiguredAuditExclusion(data.url, excludedPaths);
  const excluded = [...(data.legalPages || []), ...(data.pages || []).filter(p => isExcludedPage(p.url, excludedPaths))];
  for (const issue of [...(data.issues || []), ...(data.reviewItems || [])]) {
    const url = issueScopeUrl(issue, data.url);
    if (isExcludedPage(url, excludedPaths)) excluded.push({ url });
  }
  for (const failure of data.failures || []) {
    const url = failureScopeUrl(failure, data.url);
    if (isExcludedPage(url, excludedPaths)) excluded.push({ url });
  }
  if (legalOnly || configuredOnly) excluded.push({ url: data.url });
  data.legalPages = excluded.filter((p, i, all) => p?.url && all.findIndex(x => x?.url === p.url) === i).map(p => ({ url: p.url }));
  for (const field of ['issues', 'reviewItems']) data[field] = (data[field] || []).filter(i => !legalOnly && !configuredOnly && !isExcludedPage(issueScopeUrl(i, data.url), excludedPaths));
  if (Array.isArray(data.failures)) data.failures = data.failures.filter(failure => !legalOnly && !configuredOnly && !isExcludedPage(failureScopeUrl(failure, data.url), excludedPaths));
  if (Array.isArray(data.brokenLinks)) data.brokenLinks = data.brokenLinks.filter(link => linkHasSeoSource(link, excludedPaths));
  if (Array.isArray(data.brokenExternalLinks)) data.brokenExternalLinks = data.brokenExternalLinks.filter(link => linkHasSeoSource(link, excludedPaths));
  if (Array.isArray(data.pages)) {
    data.pages = data.pages.filter(p => !isExcludedPage(p.url, excludedPaths));
    data.pagesChecked = data.pages.length;
  }
  data.legalOnly = legalOnly;
  data.projectExcluded = configuredOnly;
  data.auditExcludedPaths = [...new Set((Array.isArray(excludedPaths) ? excludedPaths : []).map(value => String(value || '').trim()).filter(Boolean))];
  data.legalScopeVersion = 5;
  return data;
}
