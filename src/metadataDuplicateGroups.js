import { confirmedSlashAlias } from "./taskUrlEvidence.js";

export function metadataDuplicateGroups(pages, field) {
  const groups = new Map();
  for (const page of pages) {
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
  return { duplicates, aliases };
}
