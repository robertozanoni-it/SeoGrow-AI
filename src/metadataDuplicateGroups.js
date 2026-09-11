import { confirmedSlashAlias } from "./taskUrlEvidence.js";

export function metadataDuplicateGroups(pages, field) {
  const groups = new Map();
  const observations = new Map(), conflicts = new Set();
  for (const page of Array.isArray(pages) ? pages : []) {
    if (!page?.url) continue;
    const previous = observations.get(page.url);
    if (previous && previous[field] !== page[field]) conflicts.add(page.url);
    if (!previous) observations.set(page.url, page);
  }
  for (const page of observations.values()) {
    if (conflicts.has(page.url)) continue;
    if (!page?.[field]) continue;
    const key = String(page[field]).normalize("NFC").replace(/\s+/g, " ").trim();
    const normalized = field === "title" ? key.toLocaleLowerCase("it") : key;
    if (!groups.has(normalized)) groups.set(normalized, []);
    groups.get(normalized).push(page);
  }
  const duplicates = [], aliases = [];
  for (const group of groups.values()) {
    const aliasUrls = new Set();
    for (const page of group) {
      if (page.url?.endsWith("/")) continue;
      const counterpart = group.find(other => other.url === `${page.url}/`);
      if (counterpart && confirmedSlashAlias([page.url, counterpart.url], [page, counterpart])) {
        aliases.push({ sourceUrl: page.url, canonicalUrl: counterpart.url, wordpressDocumentId: page.wordpressDocumentId });
        aliasUrls.add(page.url);
      }
    }
    const independent = group.filter(page => !aliasUrls.has(page.url));
    if (independent.length > 1) duplicates.push(independent);
  }
  return { duplicates, aliases, conflicts: [...conflicts] };
}
