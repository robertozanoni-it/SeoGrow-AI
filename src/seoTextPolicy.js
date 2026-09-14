// Editorial limits of SeoGrow, not fixed limits imposed by Google.
export const SEO_TEXT_LIMITS = Object.freeze({ seo_title: 70, title: 70, meta_description: 160, description: 160 });
export const SEO_SERP_PIXEL_LIMITS = Object.freeze({ meta_description: 920 });
export const seoCharacterCount = (value) => Array.from(String(value ?? "").normalize("NFC")).length;

const serpCharacterWidth = (character) => {
  if (/\s/u.test(character)) return 3.5;
  if ("ilI1.,:;!'|`".includes(character)) return 3.5;
  if ("mwMW@%&".includes(character)) return 9;
  if (/[A-ZÀ-ÖØ-Þ]/u.test(character)) return 8;
  if (/[0-9]/u.test(character)) return 7;
  if ((character.codePointAt(0) || 0) > 0x024f) return 12;
  return 6.5;
};

export function seoSerpPixelWidth(value) {
  const text = String(value ?? "").normalize("NFC").replace(/\s+/gu, " ").trim();
  const weighted = Array.from(text).reduce((sum, character) => sum + serpCharacterWidth(character), 0);
  return Math.round(weighted * 1.07);
}

export function metaDescriptionSerpWidthWarning(value) {
  const characters = seoCharacterCount(value);
  const pixels = seoSerpPixelWidth(value);
  const maxCharacters = SEO_TEXT_LIMITS.meta_description;
  const maxPixels = SEO_SERP_PIXEL_LIMITS.meta_description;
  if (!characters || characters > maxCharacters || pixels <= maxPixels) return null;
  return { characters, pixels, maxCharacters, maxPixels };
}

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
