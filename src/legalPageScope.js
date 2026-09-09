// Exact policy slugs: articles discussing privacy are still editorial SEO pages.
export function isLegalPage(value) {
  try {
    const parts = decodeURIComponent(new URL(value).pathname).toLowerCase().split('/').filter(Boolean).map(part => part.replace(/\.html?$/, '').replace(/[_.\s]+/g, '-').replace(/-+/g, '-').replace(/-\d+$/, '').replace(/^-|-$/g, ''));
    return parts.some(part => /^(privacy|privacy-policy|informativa-privacy|informativa-sulla-privacy|cookie|cookies|cookie-policy|cookies-policy|informativa-cookie|gdpr|gdpr-policy|privacy-e-cookie|privacy-cookie-policy|politica-di-utilizzo|termini-del-servizio|termini-di-uso|termini-di-utilizzo|terms-of-service|terms-of-use|terms-and-conditions|termini-e-condizioni)$/.test(part));
  } catch { return false; }
}

export function excludeLegalSeo(data) {
  const legalOnly = isLegalPage(data.url);
  const excluded = [...(data.legalPages || []), ...(data.pages || []).filter(p => isLegalPage(p.url))];
  for (const issue of [...(data.issues || []), ...(data.reviewItems || [])]) {
    const url = issue.url || issue.targetUrl || data.url;
    if (isLegalPage(url)) excluded.push({ url });
  }
  if (legalOnly) excluded.push({ url: data.url });
  data.legalPages = excluded.filter((p, i, all) => all.findIndex(x => x.url === p.url) === i).map(p => ({ url: p.url }));
  for (const field of ['issues', 'reviewItems']) data[field] = (data[field] || []).filter(i => !legalOnly && !isLegalPage(i.url || i.targetUrl || data.url));
  if (Array.isArray(data.pages)) {
    data.pages = data.pages.filter(p => !isLegalPage(p.url));
    data.pagesChecked = data.pages.length;
  }
  data.legalOnly = legalOnly;
  data.legalScopeVersion = 2;
  return data;
}
