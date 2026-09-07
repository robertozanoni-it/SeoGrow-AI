import { auditTaskIdentity } from "./auditTaskReconciliation.js";
import { normalizeSiteHost } from "./gscImport.js";
import { tasksFromAnalysis } from "./platform.js";
import { openWorkspaceDb, workspaceStorage } from "./workspaceDatabase.js";

const readJson = (key, fallback) => {
  try { return JSON.parse(workspaceStorage.getItem(key)) ?? fallback; } catch { return fallback; }
};

const clients = () => readJson("seogrow-clients", []);
const clientIds = () => new Set(clients().map((item) => Number(item?.id)).filter((id) => Number.isSafeInteger(id) && id > 0));
const validHttpUrl = (value) => {
  if (!value) return true;
  try { return ["http:", "https:"].includes(new URL(String(value)).protocol); } catch { return false; }
};
const latest = (value) => Array.isArray(value) ? value[0] || null : value || null;

async function allCorrections() {
  const db = await openWorkspaceDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("corrections", "readonly");
      const request = tx.objectStore("corrections").getAll();
      tx.oncomplete = () => resolve(request.result || []);
      tx.onabort = () => reject(tx.error || new Error("Lettura correzioni interrotta"));
    });
  } finally { db.close(); }
}

export function checkTaskIntegrity() {
  const rows = readJson("seogrow-tasks-v2", []);
  const ids = new Set();
  const knownClients = clientIds();
  const problems = [];
  for (const task of rows) {
    if (!task || typeof task.id !== "string" || !task.id.trim()) problems.push("task senza id");
    else if (ids.has(task.id)) problems.push(`id duplicato ${task.id}`);
    else ids.add(task.id);
    if (task?.sourceClientId != null && !knownClients.has(Number(task.sourceClientId))) problems.push(`clientId inesistente ${task.sourceClientId}`);
    if (!validHttpUrl(task?.sourceUrl) || !validHttpUrl(task?.targetUrl)) problems.push(`URL non valido ${task?.id || "?"}`);
    if (task?.status === "Completato" && task?.regression === true) problems.push(`regressione ancora completata ${task.id}`);
  }
  return {
    status: problems.length ? "FAIL" : "PASS",
    area: "Task / clientId / URL",
    detail: problems.length ? `${problems.length} incoerenze: ${problems.slice(0, 6).join("; ")}` : `${rows.length} task con ID univoci, client scope e URL coerenti.`,
  };
}

export function checkAuditTaskCoherence() {
  const storedTasks = readJson("seogrow-tasks-v2", []);
  const analyses = readJson("seogrow-analyses-v2", {});
  const knownClients = clients();
  const issues = [];
  let observed = 0;
  for (const client of knownClients) {
    const analysis = latest(analyses?.[client.id]);
    if (!analysis?.analyzedAt || !Array.isArray(analysis?.issues)) continue;
    const generated = tasksFromAnalysis(analysis, client);
    const expected = new Set(generated.map(auditTaskIdentity));
    observed += expected.size;
    for (const task of storedTasks) {
      if (Number(task?.sourceClientId) !== Number(client.id)) continue;
      if (task.status === "Completato" && expected.has(auditTaskIdentity(task))) {
        issues.push(`task completata ma issue ancora presente: ${task.title}`);
      }
    }
  }
  return {
    status: issues.length ? "FAIL" : "PASS",
    area: "Audit → Task",
    detail: issues.length ? `${issues.length} task incoerenti con l'ultimo audit: ${issues.slice(0, 4).join("; ")}` : `${observed} identità issue dell'ultimo audit confrontate; nessuna issue presente resta chiusa come risolta.`,
  };
}

export function checkAgentHistory() {
  const store = readJson("seogrow-agent-runs-v1", {});
  const known = clientIds();
  const bad = [];
  let runsCount = 0;
  let provenanceMissing = 0;
  for (const [projectId, runs] of Object.entries(store || {})) {
    if (!known.has(Number(projectId)) || !Array.isArray(runs)) { bad.push(`scope Agent non valido ${projectId}`); continue; }
    const ids = new Set();
    for (const run of runs) {
      runsCount += 1;
      if (!run?.id || ids.has(run.id)) bad.push(`run id non valido/duplicato ${projectId}`); else ids.add(run.id);
      if (String(run?.projectId) !== String(projectId)) bad.push(`run ${run?.id || "?"} assegnato al progetto errato`);
      if (run?.status === "WAITING_APPROVAL") {
        if (!run.pendingApproval || String(run.pendingApproval.projectId) !== String(projectId)) bad.push(`approval fuori scope ${run?.id || "?"}`);
      } else if (run?.pendingApproval != null) bad.push(`pendingApproval su stato ${run?.status || "?"}`);
      for (const observation of Array.isArray(run?.observations) ? run.observations : []) {
        if (observation?.result && !observation?.error && (!observation.result.source || !observation.result.freshness)) provenanceMissing += 1;
      }
    }
  }
  return {
    status: bad.length ? "FAIL" : "PASS",
    area: "Storico Agent",
    detail: bad.length ? `${bad.length} incoerenze Agent: ${bad.slice(0, 5).join("; ")}` : `${runsCount} run client-scoped validi; osservazioni senza source/freshness: ${provenanceMissing}.`,
  };
}

export async function checkCorrectionStates() {
  const rows = await allCorrections();
  const bad = [];
  for (const row of rows) {
    if (row.status === "Verificato" && (row.writeConfirmed === false || row.frontendConfirmed !== true)) bad.push(`${row.id}: Verificato senza prove complete`);
    if (row.status === "Esito incerto" && row.writeConfirmed === true) bad.push(`${row.id}: Esito incerto ma writeConfirmed=true`);
    if (row.status === "Ripristinato" && !row.rollbackAt) bad.push(`${row.id}: Ripristinato senza rollbackAt`);
    if (row.reconciliation?.classification === "APPLIED" && row.writeConfirmed !== true) bad.push(`${row.id}: APPLIED senza writeConfirmed`);
    if (row.reconciliation?.classification === "NOT_APPLIED" && row.writeConfirmed === true) bad.push(`${row.id}: NOT_APPLIED ma writeConfirmed=true`);
  }
  return {
    status: bad.length ? "FAIL" : "PASS",
    area: "Stati correzioni",
    detail: bad.length ? `${bad.length} stati impossibili: ${bad.slice(0, 5).join("; ")}` : `${rows.length} correzioni senza combinazioni di stato impossibili.`,
  };
}

const validateDataset = (dataset, client, label, problems, freshness) => {
  if (!dataset) return;
  const importedAt = Date.parse(dataset.importedAt || "");
  if (!Number.isFinite(importedAt)) problems.push(`${label}: importedAt assente/non valido`);
  else freshness.push(Math.max(0, Math.floor((Date.now() - importedAt) / 86400000)));
  if (!dataset.dateFrom || !dataset.dateTo || dataset.dateFrom > dataset.dateTo) problems.push(`${label}: intervallo date non valido`);
  const expectedHost = normalizeSiteHost(client?.url);
  const actualHost = normalizeSiteHost(dataset?.property?.host);
  if (expectedHost && actualHost && expectedHost !== actualHost) problems.push(`${label}: property ${actualHost} != cliente ${expectedHost}`);
  if (!dataset?.property?.source) problems.push(`${label}: fonte property assente`);
  for (const section of ["queries", "pages", "graph"]) {
    if (!Array.isArray(dataset?.[section])) problems.push(`${label}: ${section} non è un array`);
  }
  for (const row of [...(dataset.queries || []), ...(dataset.pages || [])].slice(0, 5000)) {
    const clicks = Number(row.clicks); const impressions = Number(row.impressions); const ctr = Number(row.ctr); const position = Number(row.position);
    if (![clicks, impressions, ctr, position].every(Number.isFinite) || clicks < 0 || impressions < 0 || clicks > impressions || ctr < 0 || ctr > 100 || position < 0) {
      problems.push(`${label}: metrica non valida`); break;
    }
  }
};

export function checkSearchConsoleIntegrity() {
  const current = readJson("seogrow-gsc-v1", {});
  const history = readJson("seogrow-gsc-history-v1", {});
  const knownClients = clients();
  const byId = new Map(knownClients.map((client) => [String(client.id), client]));
  const problems = [];
  const freshness = [];
  let datasets = 0;
  for (const [projectId, dataset] of Object.entries(current || {})) {
    const client = byId.get(String(projectId));
    if (!client) { problems.push(`GSC corrente orfano ${projectId}`); continue; }
    datasets += 1; validateDataset(dataset, client, `GSC ${projectId}`, problems, freshness);
  }
  for (const [projectId, entries] of Object.entries(history || {})) {
    const client = byId.get(String(projectId));
    if (!client || !Array.isArray(entries)) { problems.push(`storico GSC non valido ${projectId}`); continue; }
    entries.forEach((dataset, index) => validateDataset(dataset, client, `GSC storico ${projectId}/${index}`, problems, freshness));
  }
  const maxAge = freshness.length ? Math.max(...freshness) : null;
  return {
    status: problems.length ? "FAIL" : "PASS",
    area: "Search Console / provenance",
    detail: problems.length ? `${problems.length} incoerenze GSC: ${problems.slice(0, 5).join("; ")}` : `${datasets} dataset correnti coerenti con i clienti; fonte/date/metriche valide${maxAge == null ? "" : `; età massima import ${maxAge} giorni`}.`,
  };
}

export function runMasterQaV2Checks() {
  return [
    checkTaskIntegrity(),
    checkAuditTaskCoherence(),
    checkAgentHistory(),
    checkSearchConsoleIntegrity(),
  ];
}

export async function runMasterQaV2AsyncChecks() {
  return [await checkCorrectionStates()];
}
