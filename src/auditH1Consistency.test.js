import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  stripAlwaysHiddenMarkup,
  visibleH1Count,
} from "../server/frontendVerificationHook.js";

const serverIndex = await readFile(new URL("../server/index.js", import.meta.url), "utf8");

const auditH1 = (html) => visibleH1Count(stripAlwaysHiddenMarkup(html));

test("audit pagina, audit sito e verifica live condividono un solo contatore H1 visibile", () => {
  assert.match(
    serverIndex,
    /function pageSignals\([\s\S]*?const visibleMarkup = stripAlwaysHiddenMarkup\(html\);[\s\S]*?const h1 = visibleH1Count\(visibleMarkup\)/,
    "pageSignals deve essere l'unica pipeline di conteggio H1 per gli audit",
  );
  assert.match(
    serverIndex,
    /app\.post\("\/api\/audit"[\s\S]*?pageSignals\(html, finalUrl/,
    "audit pagina deve usare pageSignals",
  );
  assert.match(
    serverIndex,
    /app\.post\("\/api\/site-analysis"[\s\S]*?pageSignals\([\s\S]*?html,[\s\S]*?response\.url/,
    "audit sito deve usare pageSignals",
  );
  const matches = serverIndex.match(/visibleH1Count\(/g) || [];
  assert.equal(matches.length, 1, "il server deve mantenere una sola source of truth per il conteggio H1");
  assert.doesNotMatch(serverIndex, /const h1 = count\(html, \/<h1\\b\[\^>\]\*>\/gi\)/);
});

test("H1 dentro JSON-LD non viene contato come heading della pagina", () => {
  const html = `
    <!doctype html>
    <html>
      <body>
        <main><h1>Yoga in Gravidanza</h1></main>
        <script type="application/ld+json">
          {"@type":"BlogPosting","articleBody":"<h1>Yoga in Gravidanza</h1><p>Testo schema</p>"}
        </script>
      </body>
    </html>
  `;
  assert.equal(auditH1(html), 1);
});

test("markup inerte e heading nascosti staticamente non generano falsi H1", () => {
  const html = `
    <h1>Titolo reale</h1>
    <template><h1>Template</h1></template>
    <noscript><h1>Noscript</h1></noscript>
    <style>.x::after{content:"<h1>finto</h1>"}</style>
    <div hidden><h1>Nascosto</h1></div>
    <div aria-hidden="true"><h1>Nascosto ARIA</h1></div>
    <div style="display:none"><h1>Nascosto CSS</h1></div>
  `;
  assert.equal(auditH1(html), 1);
});
