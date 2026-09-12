import test from "node:test";
import assert from "node:assert/strict";
import { extractLinkEvidence } from "../server/linkEvidenceHook.js";

test("estrae anchor text e risolve href assoluto", () => {
  const html = '<main><a class="cta" href="https://external.example/guide/">Guida <strong>avanzata</strong></a></main>';
  const result = extractLinkEvidence(html, "https://example.com/pagina/", "https://external.example/guide/");
  assert.equal(result.occurrenceCount, 1);
  assert.equal(result.anchorText, "Guida avanzata");
  assert.equal(result.matches[0].href, "https://external.example/guide/");
});

test("normalizza link relativo e decodifica entità nell'anchor", () => {
  const html = '<a href="/risorsa/?a=1&amp;b=2">Yoga &amp; mobilità</a>';
  const result = extractLinkEvidence(
    html,
    "https://example.com/pagina/",
    "https://example.com/risorsa/?a=1&b=2",
  );
  assert.equal(result.occurrenceCount, 1);
  assert.equal(result.anchorText, "Yoga & mobilità");
});

test("conta occorrenze multiple senza confonderle con link diversi", () => {
  const html = [
    '<a href="https://external.example/manca">Prima ancora</a>',
    '<a href="https://external.example/altro">Altro</a>',
    '<a href="https://external.example/manca">Seconda ancora</a>',
  ].join("");
  const result = extractLinkEvidence(html, "https://example.com/", "https://external.example/manca");
  assert.equal(result.occurrenceCount, 2);
  assert.equal(result.anchorText, "Prima ancora");
  assert.equal(result.matches.length, 2);
});

test("non segnala un link non più presente", () => {
  const result = extractLinkEvidence(
    '<a href="https://external.example/ok">Funziona</a>',
    "https://example.com/",
    "https://external.example/manca",
  );
  assert.equal(result.occurrenceCount, 0);
  assert.equal(result.anchorText, "");
  assert.deepEqual(result.matches, []);
});
