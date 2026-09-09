export function wordpressDocumentId(html) {
  const body = String(html).match(/<body\b[^>]*>/i)?.[0] || '';
  const classes = body.match(/\bclass\s*=\s*["']([^"']*)["']/i)?.[1] || '';
  const ids = [...new Set([...classes.matchAll(/\b(?:postid|page-id)-(\d+)\b/g)].map(m => Number(m[1])))];
  return ids.length === 1 && Number.isSafeInteger(ids[0]) && ids[0] > 0 ? ids[0] : null;
}

export function slashPairs(tasks) {
  const urls = [...new Set(tasks.filter(t => !t.stale && t.status !== 'Completato' && /^(duplicate-title|duplicate-description|h1|thin)$/.test(t.kind)).map(t => t.sourceUrl || t.targetUrl))];
  return urls.filter(u => {
    try { const p = new URL(u); return p.protocol === 'https:' && !p.search && !p.hash && !u.endsWith('/') && urls.includes(`${u}/`); } catch { return false; }
  }).map(u => [u, `${u}/`]).slice(0, 20);
}

export function confirmedSlashAlias(pair, results) {
  const [a, b] = results;
  return a?.ok === true && b?.ok === true && a.status === 200 && b.status === 200 && a.isHtml === true && b.isHtml === true &&
    a.url === pair[0] && b.url === pair[1] && a.canonical === pair[1] && b.canonical === pair[1] &&
    Number.isSafeInteger(a.wordpressDocumentId) && a.wordpressDocumentId > 0 && a.wordpressDocumentId === b.wordpressDocumentId;
}
