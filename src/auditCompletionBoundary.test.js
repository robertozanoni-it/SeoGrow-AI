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

test("audit pagina completa H2 e noindex tramite osservazione frontend confinata ad AuditWorkspace", async () => {
  const [workspace, frontend, api] = await Promise.all([
    source("./AuditWorkspace.jsx"),
    readFile(new URL("../server/frontendVerificationHook.js", import.meta.url), "utf8"),
    source("./api.js"),
  ]);
  assert.match(workspace, /\/api\/frontend\/inspect/);
  assert.match(workspace, /inspection\.h2/);
  assert.match(workspace, /inspection\.noindex/);
  assert.match(workspace, /Nessun H2 rilevato/);
  assert.match(workspace, /Pagina impostata noindex/);
  assert.match(frontend, /visibleH2Count/);
  assert.match(frontend, /h2: result\.h2/);
  assert.match(frontend, /xRobotsTag/);
  assert.doesNotMatch(api, /auditEvidenceContract|normalizeAuditEvidenceResponse|supplementPageAudit/);
});

test("ogni issue passa dal contratto evidenza e AuditWorkspace espone Vai alla risoluzione", async () => {
  const [contract, workspace, bootstrap] = await Promise.all([
    source("./auditEvidenceContract.js"),
    source("./AuditWorkspace.jsx"),
    source("./appMain.jsx"),
  ]);
  assert.match(contract, /issueEvidenceComplete/);
  assert.match(contract, /sourceType/);
  assert.match(contract, /auditIssueIdentity/);
  assert.match(workspace, /Vai alla risoluzione/);
  assert.match(workspace, /audit-evidence-source/);
  assert.match(workspace, /evidence\.observed/);
  assert.match(workspace, /enforceAuditEvidence/);
  assert.doesNotMatch(bootstrap, /AuditEvidenceUx/);
});
