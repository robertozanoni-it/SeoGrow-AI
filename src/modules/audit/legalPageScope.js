// Exact policy slugs: articles discussing privacy are still editorial SEO pages.
export function isLegalPage(value) {
  try {
    const parts = decodeURIComponent(new URL(value).pathname).toLowerCase().split('/').filter(Boolean).map(part => part.replace(/\.html?$/, '').replace(/[_.\s]+/g, '-').replace(/-+/g, '-').replace(/-\d+$/, '').replace(/^-|-$/g, ''));
    return parts.some(part => /^(privacy|privacy-policy|informativa-privacy|informativa-sulla-privacy|cookie|cookies|cookie-policy|cookies-policy|informativa-cookie|gdpr|gdpr-policy|privacy-e-cookie|privacy-cookie-policy|politica-di-utilizzo|termini-del-servizio|termini-di-uso|termini-di-utilizzo|terms-of-service|terms-of-use|terms-and-conditions|termini-e-condizioni)$/.test(part));
  } catch { return false; }
}

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

const linkHasSeoSource = (link) => {
  const sources = linkSources(link);
  // Se il crawler non ha salvato la sorgente, conserviamo il dato invece di
  // eliminarlo per supposizione. Se invece tutte le sorgenti sono legali,
  // quel link non appartiene all'audit SEO operativo.
  return !sources.length || sources.some(source => !isLegalPage(source));
};

export function excludeLegalSeo(data) {
  const legalOnly = isLegalPage(data.url);
  const excluded = [...(data.legalPages || []), ...(data.pages || []).filter(p => isLegalPage(p.url))];
  for (const issue of [...(data.issues || []), ...(data.reviewItems || [])]) {
    const url = issueScopeUrl(issue, data.url);
    if (isLegalPage(url)) excluded.push({ url });
  }
  for (const failure of data.failures || []) {
    const url = failureScopeUrl(failure, data.url);
    if (isLegalPage(url)) excluded.push({ url });
  }
  if (legalOnly) excluded.push({ url: data.url });
  data.legalPages = excluded.filter((p, i, all) => p?.url && all.findIndex(x => x?.url === p.url) === i).map(p => ({ url: p.url }));
  for (const field of ['issues', 'reviewItems']) data[field] = (data[field] || []).filter(i => !legalOnly && !isLegalPage(issueScopeUrl(i, data.url)));
  if (Array.isArray(data.failures)) data.failures = data.failures.filter(failure => !legalOnly && !isLegalPage(failureScopeUrl(failure, data.url)));
  if (Array.isArray(data.brokenLinks)) data.brokenLinks = data.brokenLinks.filter(linkHasSeoSource);
  if (Array.isArray(data.brokenExternalLinks)) data.brokenExternalLinks = data.brokenExternalLinks.filter(linkHasSeoSource);
  if (Array.isArray(data.pages)) {
    data.pages = data.pages.filter(p => !isLegalPage(p.url));
    data.pagesChecked = data.pages.length;
  }
  data.legalOnly = legalOnly;
  data.legalScopeVersion = 4;
  return data;
}
