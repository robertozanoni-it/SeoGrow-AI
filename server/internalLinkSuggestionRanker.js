const DEFAULT_IGNORED = new Set([
  "questo", "questa", "quello", "quella", "anche", "della", "delle", "degli",
  "nella", "nelle", "sono", "come", "dalla", "dallo", "dove", "quando",
  "perché", "essere", "avere", "pagina", "servizio", "servizi",
]);

const normalize = (value) => String(value || "").toLocaleLowerCase("it");
const words = (value, min = 4) => normalize(value)
  .split(/[^a-z0-9à-ÿ]+/)
  .filter((token) => token.length >= min && !DEFAULT_IGNORED.has(token));
const unique = (items) => [...new Set(items)];
const isHome = (value) => {
  try { return (new URL(value).pathname.replace(/\/+$/, "") || "/") === "/"; }
  catch { return false; }
};

const pageSignals = (page) => ({
  path: unique(words(new URL(page.url).pathname, 4)),
  title: unique(words(page.title, 4)),
  content: unique(words(page.contentExcerpt, 6).slice(0, 120)),
});

const findNaturalAnchor = (source, targetSignals, fallback) => {
  const sourceText = String(source.contentExcerpt || "");
  const sourceLower = normalize(sourceText);
  const cleanFallback = String(fallback || "").split(/[|–—]/)[0].trim().split(/\s+/).slice(0, 8).join(" ");
  if (cleanFallback && sourceLower.includes(normalize(cleanFallback))) return cleanFallback;

  const targetSet = new Set([...targetSignals.path, ...targetSignals.title, ...targetSignals.content]);
  const sourceWords = sourceText.match(/[\p{L}\p{N}'’]+/gu) || [];
  let best = "";
  let bestScore = 0;
  for (let size = 6; size >= 2; size -= 1) {
    for (let i = 0; i <= sourceWords.length - size; i += 1) {
      const phrase = sourceWords.slice(i, i + size).join(" ");
      const phraseTokens = words(phrase, 3);
      const score = phraseTokens.filter((token) => targetSet.has(token)).length;
      if (score >= 2 && score > bestScore) {
        best = phrase;
        bestScore = score;
      }
    }
    if (best) break;
  }
  return best || cleanFallback;
};

export function rankInternalLinkSuggestions(pages = [], linkedPairs = new Set(), limit = 30) {
  const candidates = [];
  const signals = new Map(pages.map((page) => [page.url, pageSignals(page)]));

  for (const source of pages) {
    const sourceSignals = signals.get(source.url);
    const sourceSet = new Set([...sourceSignals.path, ...sourceSignals.title, ...sourceSignals.content]);
    for (const target of pages) {
      if (source.url === target.url || linkedPairs.has(`${source.url}|${target.url}`)) continue;
      const targetSignals = signals.get(target.url);
      const targetSet = new Set([...targetSignals.path, ...targetSignals.title, ...targetSignals.content]);
      const overlap = [...sourceSet].filter((token) => targetSet.has(token));
      if (overlap.length < 2) continue;

      const titleHits = targetSignals.title.filter((token) => sourceSet.has(token)).length;
      const pathHits = targetSignals.path.filter((token) => sourceSet.has(token)).length;
      const contentHits = targetSignals.content.filter((token) => sourceSet.has(token)).length;
      const homePenalty = isHome(source.url) ? 2 : 0;
      const score = titleHits * 5 + pathHits * 4 + Math.min(contentHits, 6) * 2 + Math.min(overlap.length, 8) - homePenalty;
      const anchor = findNaturalAnchor(source, targetSignals, target.title || overlap.join(" "));
      candidates.push({
        sourceUrl: source.url,
        targetUrl: target.url,
        anchor,
        reason: `Sorgente selezionata per pertinenza semantica (score ${score}): ${overlap.slice(0, 5).join(", ")}.`,
        relevanceScore: score,
        relevance: score >= 18 ? "Alta" : score >= 11 ? "Media" : "Bassa",
        sourceKind: isHome(source.url) ? "homepage" : "pagina pertinente",
      });
    }
  }

  const ranked = candidates.toSorted((a, b) => b.relevanceScore - a.relevanceScore);
  const selected = [];
  const targets = new Set();
  const sourceCounts = new Map();
  for (const candidate of ranked) {
    if (targets.has(candidate.targetUrl)) continue;
    const used = sourceCounts.get(candidate.sourceUrl) || 0;
    if (used >= 4) continue;
    targets.add(candidate.targetUrl);
    sourceCounts.set(candidate.sourceUrl, used + 1);
    selected.push(candidate);
    if (selected.length >= limit) break;
  }
  return selected;
}
