import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("Audit SEO mantiene pagina e sito con progress server reale", async () => {
  const [workspace, progress, server] = await Promise.all([
    source("./AuditWorkspace.jsx"),
    source("./AnalysisProgress.jsx"),
    readFile(new URL("../server/index.js", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /\/api\/audit/);
  assert.match(workspace, /\/api\/site-analysis/);
  assert.match(workspace, /progressId/);
  assert.match(progress, /endpoint\s*=\s*["']\/api\/analysis-progress["']/);
  assert.match(progress, /apiFetch\(`\$\{endpoint\}\/\$\{encodeURIComponent\(progressId\)\}`/);
  assert.match(progress, /state\?\.done/);
  assert.match(progress, /state\?\.total/);
  assert.match(progress, /I contatori provengono dal crawler/);
  assert.match(server, /reportProgress\(\{ phase: "Pagine", done:/);
  assert.match(server, /reportProgress\(\{ phase: "Link interni", done:/);
  assert.match(server, /reportProgress\(\{ phase: "Link esterni", done:/);
  assert.match(server, /phase: "Sitemap e riepilogo"/);
});

test("crawl sito copre segnali tecnici richiesti e filtra pagine legali", async () => {
  const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
  for (const token of [
    'push("title"', 'push("description"', 'push("h1"', 'push("canonical"',
    '"indexability"', '"broken-link"', '"broken-external-link"', '[404, 410]',
  ]) assert.match(server, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(server, /isLegalPage\(page\.url\)/);
  assert.match(server, /filter\(issue => !isLegalPage/);
});

test("audit pagina completa H2 e noindex tramite osservazione frontend reale", async () => {
  const [api, frontend] = await Promise.all([
    source("./api.js"),
    readFile(new URL("../server/frontendVerificationHook.js", import.meta.url), "utf8"),
  ]);
  assert.match(api, /\/api\/frontend\/inspect/);
  assert.match(api, /inspection\.h2/);
  assert.match(api, /inspection\.noindex/);
  assert.match(api, /Nessun H2 rilevato/);
  assert.match(api, /Pagina impostata noindex/);
  assert.match(frontend, /visibleH2Count/);
  assert.match(frontend, /h2: result\.h2/);
  assert.match(frontend, /xRobotsTag/);
});

test("ogni issue passa dal contratto evidenza e la UI espone Vai alla risoluzione", async () => {
  const [api, contract, ux, bootstrap] = await Promise.all([
    source("./api.js"),
    source("./auditEvidenceContract.js"),
    source("./AuditEvidenceUx.js"),
    source("./appMain.jsx"),
  ]);
  assert.match(api, /normalizeAuditEvidenceResponse/);
  assert.match(contract, /issueEvidenceComplete/);
  assert.match(contract, /Sorgente|sourceType/);
  assert.match(contract, /auditIssueIdentity/);
  assert.match(ux, /Vai alla risoluzione/);
  assert.match(ux, /audit-evidence-source/);
  assert.match(ux, /evidence\.observed/);
  assert.match(bootstrap, /AuditEvidenceUx/);
});
