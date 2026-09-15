const STOP_WORDS = new Set([
  "a",
  "al",
  "alla",
  "con",
  "da",
  "dei",
  "del",
  "della",
  "di",
  "e",
  "il",
  "in",
  "la",
  "le",
  "lo",
  "per",
  "su",
  "un",
  "una",
  "uno",
  "vicino",
  "migliore",
]);

const tokens = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

export function suggestPageForQuery(query, pages = []) {
  const queryTokens = tokens(query);
  if (!queryTokens.length) return null;
  let best = null;
  for (const page of pages) {
    let url;
    try {
      url = new URL(page.dimension);
    } catch {
      continue;
    }
    const pathTokens = new Set(tokens(decodeURIComponent(url.pathname)));
    const titleTokens = new Set(tokens(page.title || ""));
    const excerptTokens = new Set(tokens(page.contentExcerpt || ""));
    const matches = queryTokens.filter(
      (token) =>
        pathTokens.has(token) ||
        titleTokens.has(token) ||
        excerptTokens.has(token),
    );
    const weighted = queryTokens.reduce(
      (sum, token) =>
        sum +
        (pathTokens.has(token) ? 1 : 0) +
        (titleTokens.has(token) ? 0.8 : 0) +
        (excerptTokens.has(token) ? 0.25 : 0),
      0,
    );
    const score = weighted / (queryTokens.length * 1.8);
    if (!best || score > best.score)
      best = { url: page.dimension, score, matches };
  }
  return best && (best.score >= 0.35 || best.matches.length >= 2) ? best : null;
}
