import { decodeLinkEntities, singleAnchorHref } from "./brokenLinkHref.js";
const ALLOWED = new Set("p div span h1 h2 h3 h4 h5 h6 ul ol li strong em b i u s del blockquote pre code a br hr figure figcaption table thead tbody tfoot tr th td dl dt dd sup sub".split(" "));
const VOID = new Set(["br", "hr"]);
const tokens = html => [...String(html || "").matchAll(/<!--[\s\S]*?-->|<\/?[a-z][\w:-]*\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi)];
const links = html => tokens(html).filter(([tag]) => /^<a\s/i.test(tag)).map(([tag]) => decodeLinkEntities(singleAnchorHref(tag.replace(/^<a\b|>$/gi, "")))).filter(Boolean);
export function contentSafetyErrors(value, previous = "") {
  const html = String(value || "");
  const errors = [], stack = [];
  for (const [token] of tokens(html)) {
    if (token.startsWith("<!--")) continue;
    const name = token.match(/^<\/?([\w:-]+)/)?.[1].toLowerCase();
    if (!ALLOWED.has(name)) { errors.push(`Tag HTML non consentito nel testo proposto: ${name}.`); continue; }
    if (/^<\//.test(token)) { if (stack.pop() !== name) errors.push("Il contenuto HTML ha tag non bilanciati."); continue; }
    const attrs = token.replace(/^<[\w:-]+|\/?\s*>$/g, "");
    for (const attr of attrs.matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const key = attr[1].toLowerCase(), raw = decodeLinkEntities(attr[2] ?? attr[3] ?? attr[4] ?? "");
      if (/^on|srcdoc|formaction/i.test(key)) errors.push("Il contenuto HTML contiene attributi eseguibili non consentiti.");
      if (["href", "src", "xlink:href"].includes(key) && /^(?:javascript|data|vbscript):/i.test([...raw].filter(char => char.charCodeAt(0) > 32).join(""))) errors.push("Il contenuto contiene un URL eseguibile non consentito.");
      if (["href", "src", "xlink:href"].includes(key) && /&[a-z]+;/i.test(raw)) errors.push("Il link contiene entità HTML non interpretabili in sicurezza.");
      if (key === "style" && /url\s*\(|expression|behavior|@import|\\/i.test(raw)) errors.push("Il contenuto contiene CSS attivo non consentito.");
    }
    if (!VOID.has(name)) stack.push(name);
  }
  if (stack.length) errors.push("Il contenuto HTML termina con tag non chiusi.");
  const countH1 = text => (String(text || "").match(/<h1\b/gi) || []).length;
  if (countH1(html) > countH1(previous)) errors.push("L'ampliamento non deve aggiungere H1: conserva la gerarchia esistente.");
  const nextLinks = links(html);
  for (const href of links(previous)) {
    const index = nextLinks.indexOf(href);
    if (index < 0) { errors.push("La proposta rimuove o cambia un link esistente. Mantienilo oppure usa la correzione dedicata ai link."); break; }
    nextLinks.splice(index, 1);
  }
  return [...new Set(errors)];
}
