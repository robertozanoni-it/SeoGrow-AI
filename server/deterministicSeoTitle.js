const STOPWORDS = new Set([
  "a", "ad", "al", "alla", "alle", "con", "da", "dal", "dalla", "de", "del", "della", "di", "e", "ed", "il", "in", "la", "le", "nel", "nella", "per", "su", "tra", "fra",
]);

const normalize = (value) => String(value || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const titleCaseTokens = (tokens) => tokens.map((token, index) => {
  const lower = String(token || "").toLocaleLowerCase("it");
  if (!lower) return "";
  if (index > 0 && STOPWORDS.has(lower)) return lower;
  return `${lower.charAt(0).toLocaleUpperCase("it")}${lower.slice(1)}`;
}).filter(Boolean).join(" ");

const wordsFromSegment = (segment) => {
  let decoded = String(segment || "");
  try { decoded = decodeURIComponent(decoded); } catch { /* Mantieni il segmento originale. */ }
  return decoded
    .replace(/\.(?:html?|php)$/i, "")
    .split(/[-_+\s]+/)
    .map((value) => value.trim())
    .filter(Boolean);
};

const domainLabel = (hostname) => {
  const host = String(hostname || "").toLowerCase().replace(/^www\./, "");
  const first = host.split(".")[0] || "";
  return titleCaseTokens(wordsFromSegment(first));
};

export function isDuplicateTitleIssue(issue = {}) {
  return /(?:duplicate-title|title\s+duplicat)/i.test(`${issue?.type || ""} ${issue?.label || ""} ${issue?.detail || ""}`);
}

export function deterministicDuplicateTitle(page = {}, issue = {}) {
  if (!isDuplicateTitleIssue(issue)) return "";
  let url;
  try { url = new URL(String(page?.url || "")); } catch { return ""; }
  const segments = url.pathname.split("/").filter(Boolean);
  const slugTokens = wordsFromSegment(segments.at(-1) || "");
  if (slugTokens.length < 3) return "";

  let candidate = titleCaseTokens(slugTokens);
  const current = String(page?.title || "").trim();
  if (normalize(candidate) === normalize(current)) {
    const parent = titleCaseTokens(wordsFromSegment(segments.at(-2) || ""));
    const suffix = parent || domainLabel(url.hostname);
    if (suffix && normalize(suffix) !== normalize(candidate)) candidate = `${candidate} – ${suffix}`;
  }

  if (candidate.length < 20 || candidate.length > 70) return "";
  if (candidate.split(/\s+/).filter(Boolean).length < 3) return "";
  return candidate;
}
