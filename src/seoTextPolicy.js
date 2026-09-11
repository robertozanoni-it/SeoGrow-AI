// Editorial limits of SeoGrow, not fixed limits imposed by Google.
export const SEO_TEXT_LIMITS = Object.freeze({ seo_title: 70, title: 70, meta_description: 160, description: 160 });
export const seoCharacterCount = (value) => Array.from(String(value ?? "").normalize("NFC")).length;
export const seoFieldKind = (field) => ({
  "meta.rank_math_title": "seo_title", "meta._yoast_wpseo_title": "seo_title",
  "meta.rank_math_description": "meta_description", "meta._yoast_wpseo_metadesc": "meta_description",
  meta_description: "meta_description",
})[field] || "";
export function assertSeoTextLength(kind, value) {
  const max = SEO_TEXT_LIMITS[kind];
  if (!max) return;
  const count = seoCharacterCount(value);
  if (typeof value !== "string" || count > max) {
    const error = new Error(`${kind === "meta_description" || kind === "description" ? "La meta description" : "Il title SEO"} contiene ${count} caratteri: il limite SeoGrow è ${max}, inclusi spazi e punteggiatura. Rigenera un testo più breve prima di approvare.`);
    error.code = "SEO_TEXT_LIMIT_EXCEEDED";
    error.status = 422;
    error.characters = count;
    error.maxCharacters = max;
    throw error;
  }
}
export function assertSeoPatchLengths(changes = {}) {
  for (const [key, value] of Object.entries(changes.meta || {})) {
    const kind = seoFieldKind(`meta.${key}`);
    if (kind) assertSeoTextLength(kind, value);
  }
}
