import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (file) => readFile(new URL(file, import.meta.url), "utf8");

test("Clienti conserva un solo CRUD per nome e sito e il cambio dominio pulisce il vecchio progetto", async () => {
  const app = await source("./App.jsx");
  assert.match(app, /function ClientsPage\(/);
  assert.match(app, /Nuovo cliente/);
  assert.match(app, /Modifica cliente/);
  assert.match(app, /normalizeProjectUrl\(form\.url\)/);
  assert.match(app, /projectIdentity\(client\.url\) === projectIdentity\(normalizedUrl\)/);
  assert.match(app, /Il dominio è cambiato[\s\S]*vecchi dati Search Console, analisi, ranking, GEO, bozze e connessione WordPress/);
  assert.match(app, /setWordpressProfiles/);
});

test("da una card cliente si seleziona il progetto e si raggiunge Centro progetto", async () => {
  const cards = await source("./CardWorkspaceLayer.jsx");
  assert.match(cards, /selectCardClient\(item\.clientId\)/);
  assert.match(cards, /actionPage:\s*"Centro progetto"/);
  assert.match(cards, /Apri il Centro progetto/);
});

test("Centro progetto espone integrazioni e cinque superfici operative nello stesso contesto", async () => {
  const layer = await source("./ProjectContinuityLayer.jsx");
  const bootstrap = await source("./appMain.jsx");
  for (const integration of ["WordPress", "Search Console", "DataForSEO", "OpenAI"]) assert.match(layer, new RegExp(integration));
  for (const page of ["Audit SEO", "Problemi", "Correzioni", "Task", "Posizionamenti"]) assert.match(layer, new RegExp(`page:\\s*"${page}"`));
  assert.match(layer, /navigatePage\("Centro progetto"\)/);
  assert.match(layer, /\/api\/dataforseo\/status/);
  assert.match(layer, /\/api\/openai\/status/);
  assert.match(bootstrap, /<ProjectContinuityLayer \/>/);
});

test("WordPress usa una sola sessione per progetto e non persiste la password applicativa", async () => {
  const session = await source("./system/integrations/wordpressSession.js");
  const continuity = await source("./projectContinuity.js");
  assert.match(session, /const sessions = new Map\(\)/);
  assert.match(session, /return `\$\{clientId\}:/);
  assert.match(session, /30 \* 60_000/);
  assert.doesNotMatch(session, /workspaceStorage|localStorage|indexedDB/i);
  assert.match(continuity, /getWordPressSession\(clientId, sessionUrl\)/);
});
