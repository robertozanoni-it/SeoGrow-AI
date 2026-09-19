import test from "node:test";
import assert from "node:assert/strict";
import { rankInternalLinkSuggestions } from "../server/internalLinkSuggestionRanker.js";

test("internal link suggestions prefer semantically stronger non-home sources", () => {
  const pages = [
    { url: "https://example.com/", title: "Yoga Cinisello", contentExcerpt: "Yoga corsi benessere dimagrire gravidanza schiena prezzi." },
    { url: "https://example.com/corsi-yoga/", title: "Corsi yoga", contentExcerpt: "Scopri corsi yoga e yoga per dimagrire con percorsi adatti." },
    { url: "https://example.com/yoga-dimagrire/", title: "Yoga per dimagrire", contentExcerpt: "Benefici dello yoga per dimagrire e controllo del peso." },
    { url: "https://example.com/yoga-gravidanza/", title: "Yoga in gravidanza", contentExcerpt: "Yoga gravidanza benessere mamma corso dolce." },
  ];
  const result = rankInternalLinkSuggestions(pages, new Set(), 30);
  const dimagrire = result.find((item) => item.targetUrl.endsWith("/yoga-dimagrire/"));
  assert.ok(dimagrire);
  assert.equal(dimagrire.sourceUrl, "https://example.com/corsi-yoga/");
  assert.notEqual(dimagrire.sourceKind, "homepage");
  assert.match(dimagrire.reason, /pertinenza semantica/i);
});

test("internal link suggestions avoid existing pairs and cap repeated sources", () => {
  const pages = Array.from({ length: 8 }, (_, index) => ({
    url: index === 0 ? "https://example.com/" : `https://example.com/yoga-${index}/`,
    title: `Yoga benessere tema ${index}`,
    contentExcerpt: "Yoga benessere respirazione postura pratica corso guida tema comune.",
  }));
  const linked = new Set(["https://example.com/yoga-1/|https://example.com/yoga-2/"]);
  const result = rankInternalLinkSuggestions(pages, linked, 30);
  assert.equal(result.some((item) => item.sourceUrl.endsWith("/yoga-1/") && item.targetUrl.endsWith("/yoga-2/")), false);
  const counts = result.reduce((map, item) => map.set(item.sourceUrl, (map.get(item.sourceUrl) || 0) + 1), new Map());
  assert.ok([...counts.values()].every((count) => count <= 4));
});
