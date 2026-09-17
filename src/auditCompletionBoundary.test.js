import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("Audit completa gli endpoint esistenti senza creare un secondo motore", async () => {
  const [bootstrap, decorator, server] = await Promise.all([
    source("../server/remediationBootstrap.js"),
    source("../server/auditTraceabilityDecorator.js"),
    source("../server/index.js"),
  ]);
  assert.match(server, /app\.post\("\/api\/audit"/);
  assert.match(server, /app\.post\("\/api\/site-analysis"/);
  assert.match(bootstrap, /installAuditTraceabilityDecorator\(app\)/);
  assert.match(decorator, /PAGE_ROUTE = "\/api\/audit"/);
  assert.match(decorator, /SITE_ROUTE = "\/api\/site-analysis"/);
  assert.doesNotMatch(decorator, /app\.post\("\/api\/audit"|app\.post\("\/api\/site-analysis"/);
});

test("progress Audit usa contatori osservati per pagina, link e H2", async () => {
  const [progressUi, decorator, server] = await Promise.all([
    source("./AnalysisProgress.jsx"),
    source("../server/auditTraceabilityDecorator.js"),
    source("../server/index.js"),
  ]);
  assert.match(progressUi, /state\?\.done/);
  assert.match(progressUi, /state\?\.total/);
  assert.doesNotMatch(progressUi, /Math\.random|setInterval\([^)]*percent|fake|simulat/i);
  assert.match(server, /reportProgress\(\{ phase: "Pagine", done: queueCursor/);
  assert.match(server, /phase: "Link interni"/);
  assert.match(server, /phase: "Link esterni"/);
  assert.match(decorator, /phase: "Verifica link HTTP"/);
  assert.match(decorator, /phase: "Verifica H2 ed evidenze"/);
});

test("copertura Audit include i segnali richiesti e 404", async () => {
  const decorator = await source("../server/auditTraceabilityDecorator.js");
  for (const token of ["http-status", "title", "meta-description", "h1", "h2", "canonical", "noindex", "links", "404"]) {
    assert.match(decorator, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
  assert.match(decorator, /\[404, 410\]/);
  assert.match(decorator, /isLegalPage/);
  assert.match(decorator, /dedupeIssues/);
  assert.match(decorator, /reproducible:\s*true/);
  assert.match(decorator, /dataSource:/);
  assert.match(decorator, /evidence/);
});

test("Audit espone CTA Vai alla risoluzione mantenendo il click handler esistente", async () => {
  const [workspace, label, bootstrap] = await Promise.all([
    source("./AuditWorkspace.jsx"),
    source("./AuditResolutionCtaLabel.jsx"),
    source("./appMain.jsx"),
  ]);
  assert.match(workspace, /onClick=\{\(\) => openRemediation\(index\)\}/);
  assert.match(workspace, /audit-agent-action/);
  assert.match(label, /Vai alla risoluzione/);
  assert.match(label, /\.audit-agent-action/);
  assert.match(bootstrap, /<AuditResolutionCtaLabel \/>/);
});
