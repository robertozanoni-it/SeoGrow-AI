// Read public SEO metadata from active head markup, never from script strings,
// comments or body content. Attribute quoting is respected (including apostrophes).
const named = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',ndash:'–',mdash:'—',hellip:'…',egrave:'è',eacute:'é',agrave:'à',igrave:'ì',ograve:'ò',ugrave:'ù',Egrave:'È',Eacute:'É',Agrave:'À',Igrave:'Ì',Ograve:'Ò',Ugrave:'Ù'};
export function decodePublicEntities(value) {
  return String(value || '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== '#') return named[code] ?? entity;
    const number = /^#x/i.test(code) ? parseInt(code.slice(2),16) : parseInt(code.slice(1),10);
    return Number.isInteger(number) && number>0 && number<=0x10ffff && !(number>=0xd800 && number<=0xdfff) ? String.fromCodePoint(number) : '\ufffd';
  });
}
export function activeHeadMarkup(html) {
  const clean = String(html || '').replace(/<!--[\s\S]*?-->/g,'');
  const head = clean.match(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/i)?.[1] || '';
  return head.replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1\s*>/gi,'');
}
const attribute = (tag, name) => {
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) if (match[1].toLowerCase() === name) return decodePublicEntities(match[2] ?? match[3] ?? match[4] ?? '');
  return '';
};
export function publicHeadMetadata(html) {
  const head = activeHeadMarkup(html);
  const titles = [], meta = [];
  const tags = /<\/?([a-z][\w:-]*)(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  let match;
  while ((match = tags.exec(head))) {
    if (match[0].startsWith('</')) continue;
    const name = match[1].toLowerCase();
    if (name === 'meta') meta.push({name:attribute(match[0],'name').toLowerCase(),content:attribute(match[0],'content')});
    if (name === 'title') {
      const tail = head.slice(tags.lastIndex), closing = /<\/title\s*>/i.exec(tail);
      if (closing) {
        titles.push(decodePublicEntities(tail.slice(0,closing.index)).replace(/\s+/g,' ').trim());
        tags.lastIndex += closing.index + closing[0].length;
      }
    }
  }
  const descriptions = meta.filter(item => item.name === 'description');
  return {title:titles[0] || '',titleCount:titles.length,metaDescription:descriptions[0]?.content || '',metaDescriptionCount:descriptions.length,
    robots:meta.filter(item=>item.name==='robots').map(item=>item.content).join(', '),googlebot:meta.filter(item=>item.name==='googlebot').map(item=>item.content).join(', ')};
}
