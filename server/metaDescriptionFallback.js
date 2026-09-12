import { validateSeoSuggestion } from "../src/editorialQuality.js";
import { decodeLinkEntities } from "../src/brokenLinkHref.js";
const clean = value => decodeLinkEntities(String(value || "").replace(/<(script|style|h[1-6])\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
// Reuse complete source sentences. Do not prepend the title, clip words, or
// invent punctuation to make a truncated generated excerpt look complete.
export function completeSourceDescription(page = {}) {
  const title = clean(page.title).toLocaleLowerCase("it");
  const segmenter = new Intl.Segmenter("it", { granularity: "sentence" });
  for (const source of [page.content, page.excerpt].map(clean).filter(Boolean)) {
    const sentences = [...segmenter.segment(source)].map(item => item.segment.trim()).filter(sentence => sentence &&
      !/introduzione\s*:|\[|\]|\.{3}|…|&hellip;|continua a leggere|read more/i.test(sentence) && (!title || !sentence.toLocaleLowerCase("it").startsWith(title)));
    for (let index = 0; index < sentences.length; index += 1) for (const width of [1, 2]) {
      const candidate = sentences.slice(index, index + width).join(" ");
      if (validateSeoSuggestion("meta_description", candidate, page).publishable) return candidate;
    }
  }
  return "";
}
