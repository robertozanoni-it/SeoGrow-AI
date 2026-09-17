import { inspectEditableElementor, serializeElementor } from "../../wordpressOwnership.js";

export const INTERNAL_LINK_ISSUE_TYPE = "internal-link";
const TEXT_CONTAINERS = new Set(["p", "li", "td", "th", "blockquote", "figcaption"]);
const BLOCKED_CONTAINERS = new Set(["script", "style", "template", "textarea", "noscript", "pre", "code"]);
const STOP_WORDS = new Set([
  "anche", "come", "con", "dalla", "dalle", "della", "delle", "degli", "dello", "dove", "nelle", "nella", "per", "pagina", "servizio", "servizi", "questo", "questa",
  "about", "also", "from", "into", "page", "service", "services", "that", "this", "with", "your",
]);

const cleanText = (value) => String(value || "").replace(/\s+/g, " ").trim();
const pageIdentity = (value) => {
  try {
    const url = new URL(String(value || ""));
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    url.search = "";
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.href;
  } catch { return ""; }
};
const hostIdentity = (value) => {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
};
const safeUrl = (value) => {
  const identity = pageIdentity(value);
  if (!identity) return "";
  const url = new URL(identity);
  return url.protocol === "https:" ? url.href : "";
};
const anchorTokens = (value) => (cleanText(value).toLocaleLowerCase("it").match(/[\p{L}\p{N}]+/gu) || [])
  .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
const escapeAttribute = (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const isWord = (value) => Boolean(value && /[\p{L}\p{N}]/u.test(value));
const sameText = (left, right) => cleanText(left).toLocaleLowerCase("it") === cleanText(right).toLocaleLowerCase("it");

const fail = (code, message, extra = {}) => Object.assign(new Error(message), { code, ...extra });

export function validateInternalLinkSuggestion(input = {}) {
  const sourceUrl = safeUrl(input.sourceUrl);
  const targetUrl = safeUrl(input.targetUrl);
  const anchor = cleanText(input.anchor || input.anchorText);
  const reason = cleanText(input.reason);
  if (!sourceUrl || !targetUrl) throw fail("INVALID_INTERNAL_URL", "Sorgente e destinazione devono essere URL HTTPS validi.");
  if (hostIdentity(sourceUrl) !== hostIdentity(targetUrl)) throw fail("EXTERNAL_TARGET", "La destinazione non appartiene allo stesso sito: auto-link bloccato.");
  if (pageIdentity(sourceUrl) === pageIdentity(targetUrl)) throw fail("SELF_LINK", "Sorgente e destinazione coincidono: auto-link bloccato.");
  if (!reason) throw fail("MISSING_LINK_REASON", "Manca una motivazione verificabile per il collegamento.");
  if (anchor.length < 4 || anchor.length > 160 || anchorTokens(anchor).length < 2)
    throw fail("WEAK_ANCHOR", "Anchor troppo generica o insufficiente per un auto-link sicuro.");
  return { ...input, sourceUrl, targetUrl, anchor, reason, key: `${pageIdentity(sourceUrl)}|${pageIdentity(targetUrl)}` };
}

export function analyzeInternalLinkSuggestions(items = []) {
  const valid = [], rejected = [], seen = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    try {
      const suggestion = validateInternalLinkSuggestion(item);
      if (seen.has(suggestion.key)) {
        rejected.push({ item, code: "DUPLICATE_SUGGESTION", reason: "Suggerimento duplicato sorgente→destinazione." });
        continue;
      }
      seen.add(suggestion.key);
      valid.push(suggestion);
    } catch (error) {
      rejected.push({ item, code: error.code || "INVALID_SUGGESTION", reason: error.message });
    }
  }
  return { valid, rejected };
}

const hrefFromTag = (tag) => tag.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)?.slice(1).find(Boolean) || "";
const resolvedLinkIdentity = (href, sourceUrl) => {
  try { return pageIdentity(new URL(String(href || "").trim(), sourceUrl).href); }
  catch { return ""; }
};

export function inspectAnchorInsertion(html, suggestionInput) {
  const suggestion = validateInternalLinkSuggestion(suggestionInput);
  const source = String(html || "");
  const hasMarkup = /<\/?[a-z][^>]*>/i.test(source);
  const tokens = source.match(/<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/g) || [source];
  const stack = [];
  const matches = [];
  let existingTargetLinks = 0;
  const targetIdentity = pageIdentity(suggestion.targetUrl);

  for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += 1) {
    const token = tokens[tokenIndex];
    if (token.startsWith("<")) {
      const tagMatch = token.match(/^<\s*(\/)?\s*([a-z0-9-]+)/i);
      if (!tagMatch) continue;
      const closing = Boolean(tagMatch[1]);
      const tag = tagMatch[2].toLowerCase();
      if (!closing && tag === "a") {
        const href = hrefFromTag(token);
        if (href && resolvedLinkIdentity(href, suggestion.sourceUrl) === targetIdentity) existingTargetLinks += 1;
      }
      const selfClosing = /\/\s*>$/.test(token) || ["br", "hr", "img", "input", "meta", "link"].includes(tag);
      if (closing) {
        const index = stack.lastIndexOf(tag);
        if (index >= 0) stack.splice(index, 1);
      } else if (!selfClosing) stack.push(tag);
      continue;
    }
    if (!token || stack.includes("a") || stack.some((tag) => BLOCKED_CONTAINERS.has(tag))) continue;
    if (hasMarkup && !stack.some((tag) => TEXT_CONTAINERS.has(tag))) continue;

    const haystack = token.toLocaleLowerCase("it");
    const needle = suggestion.anchor.toLocaleLowerCase("it");
    let offset = 0;
    while (offset <= haystack.length - needle.length) {
      const found = haystack.indexOf(needle, offset);
      if (found < 0) break;
      const before = token[found - 1] || "";
      const after = token[found + suggestion.anchor.length] || "";
      const leftBoundary = !isWord(suggestion.anchor[0]) || !isWord(before);
      const rightBoundary = !isWord(suggestion.anchor.at(-1)) || !isWord(after);
      if (leftBoundary && rightBoundary) matches.push({ tokenIndex, start: found, end: found + suggestion.anchor.length });
      offset = found + Math.max(1, needle.length);
    }
  }

  return { suggestion, source, tokens, matches, existingTargetLinks };
}

const snippet = (value, anchor, max = 230) => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  const index = text.toLocaleLowerCase("it").indexOf(String(anchor || "").toLocaleLowerCase("it"));
  if (index < 0 || text.length <= max) return text.slice(0, max);
  const start = Math.max(0, index - Math.floor(max / 2));
  return `${start ? "…" : ""}${text.slice(start, start + max)}${start + max < text.length ? "…" : ""}`;
};

export function insertInternalLinkIntoHtml(html, suggestionInput) {
  const inspected = inspectAnchorInsertion(html, suggestionInput);
  if (inspected.existingTargetLinks > 0) throw fail("LINK_ALREADY_EXISTS", "La pagina contiene già un link verso questa destinazione.", { existingTargetLinks: inspected.existingTargetLinks });
  if (inspected.matches.length === 0) throw fail("ANCHOR_NOT_FOUND", "L’anchor suggerita non compare in un blocco di testo modificabile: intervento manuale richiesto.");
  if (inspected.matches.length > 1) throw fail("ANCHOR_AMBIGUOUS", "L’anchor compare più volte: SeoGrow non sceglie automaticamente il punto di inserimento.", { occurrences: inspected.matches.length });
  const match = inspected.matches[0];
  const token = inspected.tokens[match.tokenIndex];
  const original = token.slice(match.start, match.end);
  const linked = `<a href="${escapeAttribute(inspected.suggestion.targetUrl)}">${original}</a>`;
  inspected.tokens[match.tokenIndex] = `${token.slice(0, match.start)}${linked}${token.slice(match.end)}`;
  const after = inspected.tokens.join("");
  return {
    before: inspected.source,
    after,
    beforeSnippet: snippet(inspected.source, original),
    afterSnippet: snippet(after, linked),
    anchor: original,
    targetUrl: inspected.suggestion.targetUrl,
  };
}

export function buildInternalLinkPatch(entity, suggestionInput) {
  const suggestion = validateInternalLinkSuggestion(suggestionInput);
  const elementor = inspectEditableElementor("content", entity || {});
  if (elementor.state === "invalid") throw fail("ELEMENTOR_INVALID", "Documento Elementor non valido: auto-link bloccato.");

  if (elementor.hasDocument) {
    if (!elementor.parsed || !elementor.widgets.length)
      throw fail("ELEMENTOR_OWNERSHIP_UNCERTAIN", "Il testo visibile appartiene a Elementor ma non esiste un text-editor locale univocamente modificabile.");
    const candidates = [];
    let existingTargetLinks = 0;
    for (const widget of elementor.widgets) {
      const inspected = inspectAnchorInsertion(widget.value, suggestion);
      existingTargetLinks += inspected.existingTargetLinks;
      if (inspected.matches.length) candidates.push({ widget, inspected });
    }
    if (existingTargetLinks > 0) throw fail("LINK_ALREADY_EXISTS", "Il documento Elementor contiene già un link verso questa destinazione.");
    const totalMatches = candidates.reduce((sum, entry) => sum + entry.inspected.matches.length, 0);
    if (totalMatches === 0) throw fail("ANCHOR_NOT_FOUND", "L’anchor non compare nei text-editor Elementor locali: intervento manuale richiesto.");
    if (totalMatches !== 1) throw fail("ANCHOR_AMBIGUOUS", "L’anchor compare in più punti Elementor: selezione automatica bloccata.", { occurrences: totalMatches });
    const candidate = candidates.find((entry) => entry.inspected.matches.length === 1);
    const transformed = insertInternalLinkIntoHtml(candidate.widget.value, suggestion);
    candidate.widget.item.settings.editor = transformed.after;
    return {
      adapter: "Elementor text-editor",
      changes: { meta: { _elementor_data: serializeElementor(elementor.parsed) } },
      field: "meta._elementor_data",
      ...transformed,
    };
  }

  const content = String(entity?.content?.raw ?? entity?.content?.rendered ?? "");
  if (!content.trim()) throw fail("CONTENT_EMPTY", "Il contenuto WordPress modificabile è vuoto.");
  const transformed = insertInternalLinkIntoHtml(content, suggestion);
  return { adapter: "WordPress post_content", changes: { content: transformed.after }, field: "content", ...transformed };
}

export function assessInternalLinkPreflight(evidence) {
  if (!evidence || evidence.ok !== true || evidence.verificationSafe !== true || evidence.scanComplete !== true)
    return { ok: false, code: "EVIDENCE_UNSAFE", reason: "Il frontend non consente di dimostrare in modo affidabile l’assenza del link." };
  if (Number(evidence.occurrenceCount) > 0)
    return { ok: false, code: "LINK_ALREADY_EXISTS", reason: `La destinazione è già collegata ${Number(evidence.occurrenceCount)} volta/e nella pagina.` };
  return { ok: true, code: "READY", reason: "Assenza del link verificata sul frontend corrente." };
}

export function assessInternalLinkVerification(evidence, expectedAnchor) {
  if (!evidence || evidence.ok !== true || evidence.verificationSafe !== true || evidence.scanComplete !== true)
    return { ok: false, code: "EVIDENCE_UNSAFE", reason: "La verifica frontend non è sufficientemente affidabile." };
  const count = Number(evidence.occurrenceCount || 0);
  if (count !== 1)
    return { ok: false, code: count > 1 ? "DUPLICATE_LINK" : "LINK_NOT_FOUND", reason: count > 1 ? `Sono presenti ${count} link alla stessa destinazione.` : "Il link applicato non è visibile nel frontend." };
  if (!sameText(evidence.anchorText, expectedAnchor))
    return { ok: false, code: "ANCHOR_MISMATCH", reason: `Il link è presente, ma l’anchor pubblica (“${cleanText(evidence.anchorText)}”) non coincide con quella approvata.` };
  return { ok: true, code: "VERIFIED", reason: "Un solo link, con anchor approvata, è presente nel frontend." };
}
