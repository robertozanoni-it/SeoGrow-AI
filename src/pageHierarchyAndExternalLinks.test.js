import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const hierarchy = await readFile(new URL("./PageStartHierarchy.js", import.meta.url), "utf8");
const external = await readFile(new URL("./ExternalLinkDestinationUx.js", import.meta.url), "utf8");
const sidebar = await readFile(new URL("./SidebarContrastFinal.css", import.meta.url), "utf8");
const main = await readFile(new URL("./appMain.jsx", import.meta.url), "utf8");

test("titolo pagina precede sempre contesto, wizard e card senza spostare il nodo React del titolo", () => {
  assert.match(hierarchy, /querySelectorAll\("\.page-title"\).*titleMatches\(node, page\)/);
  assert.match(hierarchy, /main\.dataset\.page !== page/);
  assert.match(hierarchy, /export function registerPageHost/);
  assert.match(hierarchy, /"\.wizard-context-host"/);
  assert.match(hierarchy, /"\.guided-page-wizard-host"/);
  assert.match(hierarchy, /"\.card-workspace-host"/);
  assert.match(hierarchy, /for \(const selector of PAGE_HOST_SELECTORS\)/);
  assert.match(hierarchy, /anchor\.insertAdjacentElement\("afterend", host\)/);
  assert.doesNotMatch(hierarchy, /prepend\(title\)|appendChild\(title\)|insertBefore\(title/);
  assert.match(main, /import '\.\/PageStartHierarchy'/);
});

test("sidebar finale è sensibilmente più scura delle superfici precedenti", () => {
  assert.match(sidebar, /background:\s*#dfe7ef\s*!important/);
  assert.match(sidebar, /#cfdeed/);
  assert.match(sidebar, /#d0e5dd/);
  assert.match(main, /import '\.\/SidebarContrastFinal\.css'/);
});

test("problemi link esterni espongono pagina sorgente, anchor e destinazione esatta", () => {
  assert.match(external, /broken-external-link/);
  assert.match(external, /issue\?\.targetUrl \|\| issue\?\.brokenUrl \|\| issue\?\.destinationUrl/);
  assert.match(external, /Link esterno: \$\{target\}/);
  assert.match(external, /problem-external-targets/);
  assert.match(external, /Pagina con il link/);
  assert.match(external, /Anchor text/);
  assert.match(external, /Link da correggere/);
  assert.match(external, /makeExternalLink\(issue\.sourceUrl/);
  assert.match(external, /makeExternalLink\(issue\.targetUrl/);
  assert.match(external, /Riprova correzione/);
  assert.match(main, /import '\.\/ExternalLinkDestinationUx'/);
});