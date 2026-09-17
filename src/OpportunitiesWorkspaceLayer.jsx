import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, ArrowRight, FileText, Link2, ListTodo, Search, ShieldCheck, Sparkles, Target, TrendingUp, Wrench } from "lucide-react";
import { registerPageHost } from "./PageStartHierarchy.js";
import { readWorkspaceJson as readJson, writeWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { buildUnifiedProblems } from "./problemsModel.js";
import { openProblemResolution } from "./AutomaticProposalNavigation.js";
import { navigatePage } from "./navigationUx.js";
import { listCorrections } from "./remediationStore.js";
import { createTaskDraft, sameTask } from "./experience/tasks/index.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { writeTaskWorkflowContext } from "./taskWorkflow.js";
import { contentPlan } from "./modules/content/index.js";
import { analyzeInternalLinkSuggestions } from "./modules/links/index.js";
import { geoOpportunityInputs } from "./modules/geo/index.js";
import {
  validRankingRuns,
  comparableRankingRuns,
  buildPositioningRows,
  buildSeoOpportunities,
} from "./modules/rank/index.js";
import "./OpportunitiesWorkspaceLayer.css";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const forClient = (store, clientId, fallback = null) => store?.[clientId] ?? store?.[String(clientId)] ?? fallback;
const historyForClient = (store, clientId) => {
  const value = forClient(store, clientId, []);
  return Array.isArray(value) ? value : value ? [value] : [];
};
const latestByDate = (items) => (Array.isArray(items) ? items : []).toSorted((left, right) =>
  (Date.parse(right?.analyzedAt || right?.startedAt || 0) || 0) - (Date.parse(left?.analyzedAt || left?.startedAt || 0) || 0),
)[0] || null;
const sourceLabels = Object.freeze({ audit: "Audit SEO", ranking: "Ranking", content: "Contenuti", links: "Link interni", geo: "GEO AI" });
const actionIcon = (kind) => kind === "correction" ? Wrench : kind === "content" ? FileText : ListTodo;
const taskPriority = (priority) => ["Alta", "Media", "Bassa"].includes(priority) ? priority : "Media";

const ensureOpportunityTask = (opportunity, client, clientId) => {
  const values = {
    ...(opportunity.action?.task || {}),
    title: opportunity.action?.task?.title || opportunity.title,
    priority: taskPriority(opportunity.priority),
    detail: opportunity.action?.task?.detail || opportunity.reason,
    sourceUrl: opportunity.action?.task?.sourceUrl || opportunity.url || "",
    targetUrl: opportunity.action?.task?.targetUrl || opportunity.targetUrl || "",
  };
  const draft = createTaskDraft(values, {
    client,
    clientId,
    idFactory: () => `opportunity-${crypto.randomUUID()}`,
  });
  const tasks = readJson(WORKSPACE_KEYS.tasks, []);
  const existing = tasks.find((task) => Number(task.sourceClientId) === Number(clientId) && !task.stale && task.status !== "Completato" && sameTask(task, draft));
  if (existing) return existing;
  writeWorkspaceJson(WORKSPACE_KEYS.tasks, [draft, ...tasks]);
  return draft;
};

export default function OpportunitiesWorkspaceLayer() {
  const [page, setPage] = useState(currentPage);
  const [revision, setRevision] = useState(0);
  const [host, setHost] = useState(null);
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [correctionSnapshot, setCorrectionSnapshot] = useState({ clientId: null, rows: [] });
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refreshPage = () => {
      setPage(currentPage());
      setQuery("");
      setSourceFilter("all");
      setPriorityFilter("all");
      setActionFilter("all");
      setMessage("");
    };
    const refreshData = () => setRevision((value) => value + 1);
    for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.addEventListener(event, refreshPage);
    for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-remediation-applied", "seogrow-problem-closures-changed"]) window.addEventListener(event, refreshData);
    return () => {
      for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.removeEventListener(event, refreshPage);
      for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-remediation-applied", "seogrow-problem-closures-changed"]) window.removeEventListener(event, refreshData);
    };
  }, []);

  useEffect(() => {
    if (page !== "Opportunità") return undefined;
    let release;
    const frame = window.requestAnimationFrame(() => {
      const mountedHost = document.createElement("div");
      mountedHost.className = "opportunities-workspace-host guided-next-actions-host";
      mountedHost.dataset.opportunitiesIntegrityHost = "true";
      release = registerPageHost(page, mountedHost);
      document.body.dataset.seogrowOpportunitiesWorkspace = "true";
      setHost(mountedHost);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      release?.();
      delete document.body.dataset.seogrowOpportunitiesWorkspace;
    };
  }, [page]);

  const stores = useMemo(() => ({
    revision,
    clients: readJson(WORKSPACE_KEYS.clients, []),
    tasks: readJson(WORKSPACE_KEYS.tasks, []),
    analyses: readJson(WORKSPACE_KEYS.analyses, {}),
    pageAudits: readJson(WORKSPACE_KEYS.pageAuditHistory, {}),
    rankings: readJson(WORKSPACE_KEYS.rankings, {}),
    gsc: readJson(WORKSPACE_KEYS.gsc, {}),
    geo: readJson(WORKSPACE_KEYS.geoData, {}),
    closures: readJson(WORKSPACE_KEYS.problemClosures, []),
  }), [revision]);

  const selectedClientId = Number(readJson(WORKSPACE_KEYS.selectedClient, 0));
  const client = stores.clients.find((item) => Number(item.id) === selectedClientId) || null;

  useEffect(() => {
    if (page !== "Opportunità" || !Number.isSafeInteger(selectedClientId) || selectedClientId <= 0) return undefined;
    let cancelled = false;
    listCorrections({ clientId: selectedClientId })
      .then((rows) => { if (!cancelled) setCorrectionSnapshot({ clientId: selectedClientId, rows }); })
      .catch(() => { if (!cancelled) setCorrectionSnapshot({ clientId: selectedClientId, rows: [] }); });
    return () => { cancelled = true; };
  }, [page, selectedClientId, revision]);

  const siteHistory = historyForClient(stores.analyses, selectedClientId);
  const pageHistory = historyForClient(stores.pageAudits, selectedClientId);
  const analysis = latestByDate(siteHistory);
  const gscDataset = forClient(stores.gsc, selectedClientId, null);
  const geoSaved = forClient(stores.geo, selectedClientId, null);
  const corrections = useMemo(
    () => correctionSnapshot.clientId === selectedClientId ? correctionSnapshot.rows : [],
    [correctionSnapshot, selectedClientId],
  );
  const problems = useMemo(() => client ? buildUnifiedProblems({
    clientId: selectedClientId,
    siteHistory,
    pageHistory,
    tasks: stores.tasks,
    corrections,
    closures: stores.closures,
  }).activeRows : [], [client, selectedClientId, siteHistory, pageHistory, stores.tasks, corrections, stores.closures]);
  const rankingRuns = useMemo(() => validRankingRuns(historyForClient(stores.rankings, selectedClientId)), [stores.rankings, selectedClientId]);
  const currentRanking = rankingRuns[0] || null;
  const comparisonRanking = currentRanking ? comparableRankingRuns(currentRanking, rankingRuns)[0] || null : null;
  const rankingRows = useMemo(() => buildPositioningRows(currentRanking, comparisonRanking, rankingRuns), [currentRanking, comparisonRanking, rankingRuns]);
  const contentItems = useMemo(() => contentPlan(gscDataset, analysis), [gscDataset, analysis]);
  const safeLinks = useMemo(() => analyzeInternalLinkSuggestions(analysis?.internalLinkSuggestions || []).valid, [analysis]);
  const geoItems = useMemo(() => geoOpportunityInputs({ audit: geoSaved?.audit, simulation: geoSaved?.simulation, observation: geoSaved?.observation }), [geoSaved]);
  const opportunityGate = useMemo(() => buildSeoOpportunities({
    auditProblems: problems,
    rankingRows,
    contentItems,
    linkSuggestions: safeLinks,
    geoItems,
    gscDataset,
  }), [problems, rankingRows, contentItems, safeLinks, geoItems, gscDataset]);

  const visible = opportunityGate.opportunities.filter((item) => {
    const haystack = `${item.title} ${item.reason} ${item.url} ${item.targetUrl}`.toLocaleLowerCase("it");
    if (!haystack.includes(query.trim().toLocaleLowerCase("it"))) return false;
    if (sourceFilter !== "all" && !item.sourceTypes.includes(sourceFilter)) return false;
    if (priorityFilter !== "all" && item.priority !== priorityFilter) return false;
    if (actionFilter !== "all" && item.action.kind !== actionFilter) return false;
    return true;
  });

  const handleAction = (opportunity) => {
    if (!client) return;
    setMessage("");
    try {
      if (opportunity.action.kind === "correction" && opportunity.action.page === "Correzioni") {
        const problem = opportunity.raw?.problem || problems.find((item) => item.key === opportunity.action.problemKey);
        if (problem && openProblemResolution(problem, selectedClientId, "opportunity-workspace")) return;
        navigatePage("Correzioni");
        return;
      }
      if (opportunity.action.kind === "correction" && opportunity.action.page === "Link interni") {
        sessionStorage.setItem("seogrow-internal-link-focus-v1", opportunity.action.linkKey || "");
        navigatePage("Link interni");
        return;
      }
      const task = ensureOpportunityTask(opportunity, client, selectedClientId);
      if (opportunity.action.kind === "content") {
        writeTaskWorkflowContext(workspaceStorage, task);
        navigatePage("Piano editoriale");
        return;
      }
      navigatePage("Task");
      setMessage(`Task pronta: ${task.title}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Azione opportunità non riuscita.");
    }
  };

  if (page !== "Opportunità" || !host) return null;
  const high = opportunityGate.opportunities.filter((item) => item.priority === "Alta").length;
  const corroborated = opportunityGate.opportunities.filter((item) => item.sources.length > 1).length;
  const bySource = Object.keys(sourceLabels).map((type) => [type, opportunityGate.opportunities.filter((item) => item.sourceTypes.includes(type)).length]);

  const content = !client ? (
    <section className="seo-opportunities-workspace empty"><h2>Seleziona un progetto</h2><p>Le opportunità SEO sono isolate per cliente e sito.</p></section>
  ) : (
    <section className="seo-opportunities-workspace" aria-label="Opportunità SEO azionabili">
      <header className="seo-opportunities-head">
        <div><span className="eyebrow"><ShieldCheck /> Gate azionabilità attivo</span><h2>Opportunità SEO</h2><p>Audit, ranking, contenuti, link interni e segnali GEO raccolti in una sola coda deduplicata e operativa.</p></div>
        <div className="seo-opportunities-source-summary">{bySource.map(([type, count]) => <span key={type}><strong>{count}</strong><small>{sourceLabels[type]}</small></span>)}</div>
      </header>

      <div className="seo-opportunities-kpis">
        <article><Target /><span><small>Azionabili</small><strong>{opportunityGate.opportunities.length}</strong></span></article>
        <article><TrendingUp /><span><small>Priorità alta</small><strong>{high}</strong></span></article>
        <article><Sparkles /><span><small>Multi-fonte</small><strong>{corroborated}</strong></span></article>
        <article><AlertTriangle /><span><small>Scartate dal Gate</small><strong>{opportunityGate.rejected.length}</strong></span></article>
      </div>

      <div className="seo-opportunities-toolbar">
        <label className="seo-opportunities-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca opportunità, pagina o evidenza…" /></label>
        <label>Fonte<select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}><option value="all">Tutte</option>{Object.entries(sourceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Priorità<select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}><option value="all">Tutte</option><option value="Alta">Alta</option><option value="Media">Media</option><option value="Bassa">Bassa</option></select></label>
        <label>CTA<select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}><option value="all">Tutte</option><option value="task">Task</option><option value="correction">Correzione</option><option value="content">Contenuto</option></select></label>
        <span>{visible.length} / {opportunityGate.opportunities.length}</span>
      </div>

      {message && <p className="seo-opportunities-message" role="status">{message}</p>}
      {!opportunityGate.opportunities.length ? <div className="seo-opportunities-empty"><ShieldCheck /><div><h3>Nessuna opportunità azionabile</h3><p>Non ci sono segnali sufficienti nelle fonti salvate, oppure il Gate ha escluso candidati senza una CTA sicura.</p></div></div> : (
        <div className="seo-opportunities-table-wrap"><table className="seo-opportunities-table"><caption className="sr-only">Opportunità SEO aggregate, deduplicate e azionabili</caption><thead><tr><th>Opportunità</th><th>Fonti</th><th>Evidenza</th><th>Priorità</th><th>Impatto</th><th>Sforzo</th><th>Azione</th></tr></thead><tbody>
          {visible.map((item) => {
            const ActionIcon = actionIcon(item.action.kind);
            return <tr key={item.id} data-opportunity-action={item.action.kind}>
              <td><strong>{item.title}</strong>{item.url && <a href={item.url} target="_blank" rel="noreferrer">{item.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</a>}</td>
              <td><div className="seo-opportunity-sources">{item.sources.map((entry, index) => <span key={`${entry.type}-${index}`}>{entry.label}</span>)}</div></td>
              <td><small>{item.reason}</small><em>{item.priorityEvidence}</em></td>
              <td><span className={`seo-opportunity-priority ${item.priority.toLowerCase()}`}>{item.priority}</span></td>
              <td><strong className={`seo-opportunity-impact ${item.impact.toLowerCase()}`}>{item.impact}</strong></td>
              <td><span>{item.effort}</span></td>
              <td><button type="button" className="primary mini" onClick={() => handleAction(item)}><ActionIcon /> {item.action.label} <ArrowRight /></button></td>
            </tr>;
          })}
          {!visible.length && <tr><td colSpan="7" className="seo-opportunities-no-results">Nessuna opportunità corrisponde ai filtri selezionati.</td></tr>}
        </tbody></table></div>
      )}

      <footer className="seo-opportunities-foot"><span><Link2 /> Duplicati fusi per problema, query, coppia sorgente→destinazione o evidenza GEO.</span><span><Wrench /> Impatto e sforzo sono stime operative del modulo Opportunità; GEO fornisce evidenze grezze e non score sintetici.</span><span><ListTodo /> Ogni riga visibile supera il Gate e possiede una CTA verso Task, Correzione o Contenuto.</span></footer>
    </section>
  );

  return createPortal(content, host);
}
