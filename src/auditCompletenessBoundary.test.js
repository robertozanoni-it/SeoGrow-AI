import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = async (path) => readFile(new URL(path, import.meta.url), "utf8");

test("page and site audit use real server progress and shared technical analysis", async () => {
  const [server, progress] = await Promise.all([
    source("../server/index.js"),
    source("./AnalysisProgress.jsx"),
  ]);
  assert.match(server, /app\.post\("\/api\/audit"[\s\S]*?const reportProgress = trackAudit/);
  assert.match(server, /app\.post\("\/api\/site-analysis"[\s\S]*?const reportProgress = trackAudit/);
  assert.match(server, /phase: "Pagine"[\s\S]*?phase: "Link interni"[\s\S]*?phase: "Link esterni"[\s\S]*?phase: "Sitemap e riepilogo"/);
  assert.match(server, /phase: "Pagina · richiesta HTTP"[\s\S]*?phase: "Pagina · verifica link"[\s\S]*?phase: "Pagina · completata"/);
  assert.match(progress, /\/api\/analysis-progress\/\$\{encodeURIComponent\(progressId\)\}/);
  assert.match(progress, /state\?\.done/);
  assert.match(progress, /state\?\.total/);
  assert.doesNotMatch(progress, /setInterval\([^,]+,\s*\d+\).*percent/i);
});

test("audit technical coverage includes GDPR exclusions, headings, metadata, indexability and HTTP links", async () => {
  const server = await source("../server/index.js");
  assert.match(server, /isLegalPage\(finalUrl\)/);
  assert.match(server, /legalPages = pages\.filter\(page => isLegalPage\(page\.url\)\)/);
  assert.match(server, /visibleH1Count/);
  assert.match(server, /const h2 = count\(visibleMarkup, \/<h2/);
  assert.match(server, /page\.titleCount/);
  assert.match(server, /page\.metaDescriptionCount/);
  assert.match(server, /canonical-invalid/);
  assert.match(server, /page\.noindex/);
  assert.match(server, /x-robots-tag/);
  assert.match(server, /broken-link/);
  assert.match(server, /broken-external-link/);
  assert.match(server, /\[404, 410\]/);
  assert.match(server, /type: "http-status"/);
});

test("every displayed confirmed issue is normalized, deduplicated, sourced and has resolution CTA", async () => {
  const [server, audit, model] = await Promise.all([
    source("../server/index.js"),
    source("./AuditWorkspace.jsx"),
    source("./auditEvidenceModel.js"),
  ]);
  assert.match(server, /function finalizeAuditIssues/);
  assert.match(server, /dataSource:/);
  assert.match(server, /evidence:/);
  assert.match(model, /const identity = \[type\.toLowerCase\(\), normalizeUrl\(sourceUrl\), normalizeUrl\(targetUrl\)\]/);
  assert.match(model, /normalizeAuditSeverity/);
  assert.match(audit, /auditIssuesForDisplay\(result\?\.issues/);
  assert.match(audit, />Vai alla risoluzione<\/button>/);
  assert.match(audit, /Fonte dati:/);
  assert.match(audit, /issue\.evidence\?\.observed/);
  assert.match(audit, /issue\.targetUrl/);
});
