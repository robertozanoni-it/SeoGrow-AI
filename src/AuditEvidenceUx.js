import { enforceAuditEvidence } from "./auditEvidenceContract.js";
import { readWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { normalizeHttpUrl } from "./reliabilityModel.js";
import "./AuditEvidenceUx.css";

const clean = (value) => String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
const norm = (value) => normalizeHttpUrl(value || "", { stripSlash: true });

const rowsForClient = (store, clientId) => {
  const value = store?.[clientId] ?? store?.[String(clientId)] ?? [];
  return Array.isArray(value) ? value : value ? [value] : [];
};

const evidenceRows = () => {
  const clientId = Number(readWorkspaceJson(WORKSPACE_KEYS.selectedClient, 0));
  if (!Number.isSafeInteger(clientId) || clientId <= 0) return [];
  const site = readWorkspaceJson(WORKSPACE_KEYS.analyses, {});
  const pages = readWorkspaceJson(WORKSPACE_KEYS.pageAuditHistory, {});
  const audits = [...rowsForClient(pages, clientId), ...rowsForClient(site, clientId)];
  return audits.flatMap((audit) => {
    const normalized = enforceAuditEvidence({ ...audit, issues: [...(audit?.issues || [])], reviewItems: [...(audit?.reviewItems || [])] });
    return [
      ...(normalized?.issues || []).map((issue) => ({ ...issue, bucket: "issue" })),
      ...(normalized?.reviewItems || []).map((issue) => ({ ...issue, bucket: "review" })),
    ];
  });
};

const sourceUrlFromRow = (row) => row.querySelector('a.task-link[href], a[href][target="_blank"]')?.href || "";

const candidateRows = (row, records) => {
  const label = clean(row.querySelector("strong")?.textContent);
  const sourceUrl = norm(sourceUrlFromRow(row));
  if (!label) return [];
  return records.filter((item) =>
    clean(item.label || item.title || item.type) === label &&
    (!sourceUrl || norm(item.sourceUrl || item.url) === sourceUrl),
  );
};

const evidenceText = (record) => {
  const evidence = record?.evidence || {};
  const parts = [
    evidence.sourceType ? `Sorgente: ${evidence.sourceType}` : "",
    evidence.field ? `campo: ${evidence.field}` : "",
    evidence.observed ? `osservato: ${evidence.observed}` : "",
    evidence.url ? `URL: ${evidence.url}` : "",
    evidence.observedAt ? `rilevato: ${new Date(evidence.observedAt).toLocaleString("it-IT")}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
};

const setResolutionLabel = (button) => {
  if (!button) return;
  const textNode = [...button.childNodes].reverse().find((node) => node.nodeType === Node.TEXT_NODE);
  if (textNode) textNode.textContent = "Vai alla risoluzione";
  else button.append(document.createTextNode("Vai alla risoluzione"));
  button.setAttribute("aria-label", "Vai alla risoluzione del problema");
};

const decorate = () => {
  if (!document.body || !decodeURIComponent(location.hash.slice(1)).includes("Audit SEO")) return;
  const records = evidenceRows();
  const groups = new Map();
  const rows = [...document.querySelectorAll(".audit-issues-list > div, .audit-review-items .audit-review-row")];
  for (const row of rows) {
    setResolutionLabel(row.querySelector(".audit-agent-action"));
    const matches = candidateRows(row, records);
    if (!matches.length) continue;
    const key = `${clean(row.querySelector("strong")?.textContent)}::${norm(sourceUrlFromRow(row))}`;
    const used = groups.get(key) || 0;
    const record = matches[Math.min(used, matches.length - 1)];
    groups.set(key, used + 1);
    let node = row.querySelector(".audit-evidence-source");
    if (!node) {
      node = document.createElement("small");
      node.className = "audit-evidence-source";
      row.append(node);
    }
    node.textContent = evidenceText(record) || "Sorgente audit non disponibile: ripetere il controllo prima di intervenire.";
    node.dataset.reproducible = record?.evidence?.reproducible === true ? "true" : "false";
  }
};

if (typeof window !== "undefined" && !window.__seoGrowAuditEvidenceUx) {
  window.__seoGrowAuditEvidenceUx = true;
  let timer = 0;
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(decorate, 0);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  for (const event of ["hashchange", "popstate", "seogrow-locationchange", "seogrow-storage-ok"])
    window.addEventListener(event, schedule);
  schedule();
}
