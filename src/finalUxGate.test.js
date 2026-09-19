import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const css = await readFile(new URL("./FinalUxContract.css", import.meta.url), "utf8");
const semantics = await readFile(new URL("./FinalUxSemantics.js", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");
const guided = await readFile(new URL("./GuidedUxLayer.jsx", import.meta.url), "utf8");
const audit = await readFile(new URL("./AuditWorkspace.jsx", import.meta.url), "utf8");
const agent = await readFile(new URL("./AgentPage.jsx", import.meta.url), "utf8");
const geo = await readFile(new URL("./GeoPage.jsx", import.meta.url), "utf8");
const links = await readFile(new URL("./InternalLinksWorkspaceLayer.jsx", import.meta.url), "utf8");
const corrections = await readFile(new URL("./CorrectionsWorkspace.jsx", import.meta.url), "utf8");

test("final UX contract is loaded after all legacy visual overrides", () => {
  const finalIndex = main.indexOf("./FinalUxContract.css");
  assert.ok(finalIndex > main.indexOf("./SidebarContrastFinal.css"));
  assert.ok(finalIndex > main.indexOf("./SemanticVisualSystem.css"));
  assert.match(main, /import '\.\/FinalUxSemantics';/);
});

test("sidebar has one final active-state contract and controlled azure groups", () => {
  assert.match(css, /--ux-active:\s*#d92d20/);
  assert.match(css, /--ux-sidebar-full:\s*#78b8f5/);
  assert.match(css, /--ux-sidebar-tint:\s*#cfe6fb/);
  assert.match(css, /guided-nav-group:nth-of-type\(odd\)/);
  assert.match(css, /guided-nav-group:nth-of-type\(even\)/);
  assert.match(css, /button\[aria-current="page"\]/);
  assert.match(guided, /className=\{activePage === item\.page \? "active" : ""\}/);
  assert.match(guided, /aria-current=\{activePage === item\.page \? "page" : undefined\}/);
});

test("focus, disabled, error, status, empty and loading states are visually explicit", () => {
  for (const contract of [":focus-visible", ":disabled", ".ux-state-error", ".ux-state-status", ".ux-state-empty", ".ux-state-loading"]) {
    assert.match(css, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(semantics, /\[role="alert"\]/);
  assert.match(semantics, /\[role="status"\]/);
  assert.match(semantics, /progress,\[aria-busy="true"\]/);
  assert.match(semantics, /button:disabled/);
  assert.match(semantics, /aria-busy/);
});

test("core operational pages already expose real empty loading and error states", () => {
  assert.match(audit, /AnalysisProgress/);
  assert.match(audit, /role="alert"/);
  assert.match(agent, /role="alert"/);
  assert.match(geo, /role="alert"/);
  assert.match(links, /internal-links-empty/);
  assert.match(corrections, /corrections-empty/);
});

test("SEO Agent and GEO guidance no longer describes unavailable or invented capabilities", () => {
  assert.match(semantics, /L’Agent usa solo capacità di lettura realmente disponibili/);
  assert.match(semantics, /Apri Task o Correzioni/);
  assert.match(semantics, /nessun punteggio GEO sintetico/);
  assert.match(semantics, /senza dichiarare presenza reale nei motori AI/);
  const agentReplacements = semantics.match(/'SEO Agent':[\s\S]*?'GEO AI':/)?.[0] || "";
  assert.doesNotMatch(agentReplacements, /livello di autonomia appropriato[^']*':\s*'Scegli il livello di autonomia/i);
});

test("responsive final contract prevents clipped controls and preserves horizontal tables", () => {
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /overflow-x:\s*auto !important/);
  assert.match(css, /white-space:\s*normal/);
});


test("la sidebar usa anche la route reale per evidenziare la pagina attiva", () => {
  assert.match(guided, /const routedPage = readPage\(\)/);
  assert.match(guided, /const activePage = routedPage \|\| page/);
  assert.match(guided, /className=\{activePage === item\.page \? "active" : ""\}/);
  assert.match(guided, /aria-current=\{activePage === item\.page \? "page" : undefined\}/);
  assert.match(css, /--ux-active:\s*#d92d20/);
});
