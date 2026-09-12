// Match an actual href, not a URL mentioned inside arbitrary query parameters.
// Some WordPress filters render these Google wrappers as their direct URL.
const GOOGLE_HOSTS = new Set(["google.com", "www.google.com"]);

export const decodeLinkEntities = (value) => String(value || "").replace(
  /&(?:amp|quot|apos|lt|gt|nbsp|#39|#\d+|#x[0-9a-f]+);/gi,
  (entity) => {
    const named = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">", "&nbsp;": " " };
    const key = entity.toLowerCase();
    if (Object.hasOwn(named, key)) return named[key];
    const code = key.startsWith("&#x") ? Number.parseInt(key.slice(3, -1), 16) : Number.parseInt(key.slice(2, -1), 10);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff)
      ? String.fromCodePoint(code) : entity;
  },
);

const httpUrl = (value) => {
  try {
    const input = String(value || "").trim();
    if (!/^https?:\/\//i.test(input) || input.includes("\\") || [...input].some((char) => char.charCodeAt(0) <= 32 || char.charCodeAt(0) === 127)) return "";
    const url = new URL(input);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
};

export function matchBrokenLinkHref(rawHref, targetUrl) {
  const storedHref = httpUrl(decodeLinkEntities(rawHref));
  const target = httpUrl(targetUrl);
  if (!storedHref || !target) return null;
  if (storedHref === target) return { storedHref, targetUrl: target, kind: "exact" };
  const wrapper = new URL(storedHref);
  if (wrapper.protocol !== "https:" || wrapper.port || wrapper.hash || !GOOGLE_HOSTS.has(wrapper.hostname)) return null;
  if (!["/search", "/url"].includes(wrapper.pathname)) return null;
  const q = wrapper.searchParams.getAll("q");
  const url = wrapper.searchParams.getAll("url");
  // Reject duplicate/conflicting destinations and search phrases containing a URL.
  if (q.length + url.length !== 1 || (wrapper.pathname === "/search" && q.length !== 1)) return null;
  const destination = httpUrl((q.length ? q : url)[0]);
  if (destination !== target) return null;
  return { storedHref, targetUrl: target, kind: "google-url-wrapper" };
}

export function singleAnchorHref(attributes) {
  const values = [];
  const tokens = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of String(attributes || "").matchAll(tokens)) {
    if (match[1].toLowerCase() === "href") values.push(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return values.length === 1 ? values[0] : "";
}

export function transformBrokenLinkAnchors(html, targetUrl, removeText = false) {
  const source = String(html || "");
  const anchors = [];
  const matches = [];
  // Keep comments and non-rendered/raw-text blocks untouched. Quoted '>' is valid.
  const pattern = /<!--[\s\S]*?-->|<(script|style|textarea|template|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>|<a\b((?:"[^"]*"|'[^']*'|[^"'>])*)>([\s\S]*?)<\/a\s*>/gi;
  const value = source.replace(pattern, (whole, rawTextTag, attributes, inner) => {
    if (rawTextTag || attributes === undefined || /<a\b/i.test(inner)) return whole;
    const match = matchBrokenLinkHref(singleAnchorHref(attributes), targetUrl);
    if (!match) return whole;
    const anchorText = decodeLinkEntities(inner.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    anchors.push(anchorText);
    matches.push({ ...match, anchorText });
    return removeText ? "" : inner;
  });
  return { value, count: anchors.length, anchors, matches };
}
