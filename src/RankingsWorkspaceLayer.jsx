import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { registerPageHost } from "./PageStartHierarchy.js";
import { readWorkspaceJson as readJson } from "./core/workspace/jsonStorage.js";
import { buildUnifiedProblems } from "./problemsModel.js";
import { openProblemResolution } from "./AutomaticProposalNavigation.js";
import { navigatePage } from "./navigationUx.js";
import { listCorrections } from "./remediationStore.js";
import {
  RANKING_SOURCE,
  rankingRunIdentity,
  validRankingRuns,
  comparableRankingRuns,
  buildPositioningRows,
  opportunityEvidenceForKeyword,
  positioningFilter,
  opportunityGroups,
} from "./modules/rank/index.js";
import { BarChart3, CalendarDays, ExternalLink, Search, Target, TrendingDown, TrendingUp } from "lucide-react";
import "./RankingsWorkspaceLayer.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const RANKINGS_KEY = "seogrow-rankings-v1";
const GSC_KEY = "seogrow-gsc-v1";
const ANALYSES_KEY = "seogrow-analyses-v2";
const PAGE_AUDITS_KEY = "seogrow-page-audit-history-v2";
const TASKS_KEY = "seogrow-tasks-v2";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const clientValue = (store, clientId, fallback = null) => store?.[clientId] ?? store?.[String(clientId)] ?? fallback;
const historyForClient = (store, clientId) => {
  const value = clientValue(store, clientId, []);
  return Array.isArray(value) ? value : value ? [value] : [];
};
const formatDateTime = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString("it-IT") : "Data non disponibile";
};
const formatShortDate = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }) : "—";
};
const normalizedUrl = (value) => {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    url.search = "";
    return `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch { return ""; }
};
const opportunityLabels = (evidence) => [...new Set(evidence.map((item) => item.label))].join(" · ");
const readableError = (value) => {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value?.message === "string") return value.message;
  return "Dato non verificato dal provider.";
};

export default function RankingsWorkspaceLayer() {
  const [page, setPage] = useState(currentPage);
  const [revision, setRevision] = useState(0);
  const [host, setHost] = useState(null);
  const [comparisonId, setComparisonId] = useState("");
  const [query, setQuery] = useState("");
  const [view, setView] = useState("all");
  const [correctionSnapshot, setCorrectionSnapshot] = useState({ clientId: null, rows: [] });

  useEffect(() => {
    const refreshPage = () => { setPage(currentPage()); setComparisonId(""); setQuery(""); setView("all"); };
    const refreshData = () => setRevision((value) => value + 1);
    for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.addEventListener(event, refreshPage);
    for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-remediation-applied"]) window.addEventListener(event, refreshData);
    return () => {
      for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.removeEventListener(event, refreshPage);
      for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-remediation-applied"]) window.removeEventListener(event, refreshData);
    };
  }, []);

  useEffect(() => {
    if (page !== "Posizionamenti") return undefined;
    let release;
    const frame = window.requestAnimationFrame(() => {
      const mountedHost = document.createElement("div");
      mountedHost.className = "rankings-workspace-host guided-next-actions-host";
      mountedHost.dataset.rankingsIntegrityHost = "true";
      release = registerPageHost(page, mountedHost);
      document.body.dataset.seogrowRankingsWorkspace = "true";
      setHost(mountedHost);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      release?.();
      delete document.body.dataset.seogrowRankingsWorkspace;
    };
  }, [page]);

  const stores = useMemo(() => ({
    revision,
    clients: readJson(CLIENTS_KEY, []),
    rankings: readJson(RANKINGS_KEY, {}),
    gsc: readJson(GSC_KEY, {}),
    analyses: readJson(ANALYSES_KEY, {}),
    pageAudits: readJson(PAGE_AUDITS_KEY, {}),
    tasks: readJson(TASKS_KEY, []),
  }), [revision]);
  const selectedClientId = Number(readJson(SELECTED_CLIENT_KEY, 0));
  const client = stores.clients.find((item) => Number(item.id) === selectedClientId) || null;

  useEffect(() => {
    if (page !== "Posizionamenti" || !Number.isSafeInteger(selectedClientId) || selectedClientId <= 0) return undefined;
    let cancelled = false;
    listCorrections({ clientId: selectedClientId })
      .then((rows) => { if (!cancelled) setCorrectionSnapshot({ clientId: selectedClientId, rows }); })
      .catch(() => { if (!cancelled) setCorrectionSnapshot({ clientId: selectedClientId, rows: [] }); });
    return () => { cancelled = true; };
  }, [page, selectedClientId, revision]);

  const runs = useMemo(() => validRankingRuns(historyForClient(stores.rankings, selectedClientId)), [stores, selectedClientId]);
  const current = runs[0] || null;
  const comparable = useMemo(() => comparableRankingRuns(current, runs), [current, runs]);
  const selectedComparison = comparable.find((run) => rankingRunIdentity(run) === comparisonId) || comparable[0] || null;
  const rows = useMemo(() => buildPositioningRows(current, selectedComparison, runs), [current, selectedComparison, runs]);
  const dataset = clientValue(stores.gsc, selectedClientId, null);
  const opportunitySet = useMemo(() => opportunityGroups(dataset), [dataset]);
  const corrections = correctionSnapshot.clientId === selectedClientId ? correctionSnapshot.rows : [];
  const problems = useMemo(() => {
    if (!client) return [];
    return buildUnifiedProblems({
      clientId: selectedClientId,
      siteHistory: historyForClient(stores.analyses, selectedClientId),
      pageHistory: historyForClient(stores.pageAudits, selectedClientId),
      tasks: stores.tasks,
      corrections,
    }).rows || [];
  }, [client, selectedClientId, stores, corrections]);
  const problemIndex = useMemo(() => {
    const map = new Map();
    for (const problem of problems) {
      const key = normalizedUrl(problem.sourceUrl);
      if (!key) continue;
      const list = map.get(key) || [];
      list.push(problem);
      map.set(key, list);
    }
    return map;
  }, [problems]);
  const visibleRows = rows.filter((row) => positioningFilter(row, { query, view }));
  const top10 = rows.filter((row) => row.position != null && row.position <= 10).length;
  const growth = rows.filter((row) => Number(row.delta) > 0).length;
  const decline = rows.filter((row) => Number(row.delta) < 0).length;

  if (page !== "Posizionamenti" || !host) return null;

  const content = !client ? (
    <section className="rankings-evidence-workspace empty" role="region" aria-label="Posizionamenti verificati">
      <h2>Seleziona un progetto</h2><p>I posizionamenti sono sempre isolati per cliente e sito.</p>
    </section>
  ) : (
    <section className="rankings-evidence-workspace" role="region" aria-label="Posizionamenti verificati">
      <header className="rankings-evidence-head">
        <div><span className="eyebrow">Fonte verificabile: {RANKING_SOURCE}</span><h2>Posizionamenti verificati</h2><p>Keyword, URL, posizione, variazione e storico senza stime o dati sintetici.</p></div>
        <div className="rankings-source-stamp"><CalendarDays /><span><small>Ultimo dato</small><strong>{current ? formatDateTime(current.checkedAt) : "Nessun controllo disponibile"}</strong></span></div>
      </header>

      {current ? <>
        <div className="rankings-context-strip">
          <span><strong>Fonte</strong>{RANKING_SOURCE}</span>
          <span><strong>Data</strong>{formatDateTime(current.checkedAt)}</span>
          <span><strong>Device</strong>{current.device || "—"}</span>
          <span><strong>Località</strong>{current.locationCode ?? "—"}</span>
          <span><strong>Lingua</strong>{current.languageCode || "—"}</span>
          <span><strong>Profondità</strong>{current.depth ? `Top ${current.depth}` : "—"}</span>
        </div>

        <div className="rankings-evidence-kpis">
          <article><Target /><span><small>Keyword</small><strong>{rows.length}</strong></span></article>
          <article><BarChart3 /><span><small>Top 10</small><strong>{top10}</strong></span></article>
          <article><TrendingUp /><span><small>In crescita</small><strong>{selectedComparison ? growth : "—"}</strong></span></article>
          <article><TrendingDown /><span><small>In calo</small><strong>{selectedComparison ? decline : "—"}</strong></span></article>
        </div>

        <div className="rankings-evidence-toolbar">
          <label className="rankings-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filtra keyword o URL…" /></label>
          <label>Vista<select value={view} onChange={(event) => setView(event.target.value)}><option value="all">Tutte</option><option value="growth">In crescita</option><option value="decline">In calo</option><option value="top10">Top 10</option><option value="11-20">Posizioni 11–20</option><option value="beyond">Oltre profondità</option><option value="errors">Non verificate</option></select></label>
          <label>Confronto periodo<select value={selectedComparison ? rankingRunIdentity(selectedComparison) : ""} disabled={!comparable.length} onChange={(event) => setComparisonId(event.target.value)}><option value="">{comparable.length ? "Ultimo periodo comparabile" : "Nessun periodo comparabile"}</option>{comparable.map((run) => <option key={rankingRunIdentity(run)} value={rankingRunIdentity(run)}>{formatDateTime(run.checkedAt)}</option>)}</select></label>
          <span className="rankings-filter-count">{visibleRows.length} / {rows.length}</span>
        </div>

        <div className="rankings-evidence-table-wrap">
          <table className="rankings-evidence-table"><caption className="sr-only">Posizionamenti DataForSEO con storico, confronto e collegamenti</caption><thead><tr><th>Keyword</th><th>Posizione</th><th>Δ periodo</th><th>URL posizionata</th><th>Storico</th><th>Problema / opportunità</th><th>Fonte e data</th></tr></thead><tbody>
            {visibleRows.map((row) => {
              const linkedProblems = problemIndex.get(normalizedUrl(row.url)) || [];
              const opportunityEvidence = opportunityEvidenceForKeyword(row.keyword, opportunitySet);
              return <tr key={row.keyword}>
                <td><strong>{row.keyword || "Keyword non disponibile"}</strong>{row.error && <small className="rankings-row-error">{readableError(row.error)}</small>}</td>
                <td><span className="ranking-position-value">{row.positionLabel}</span></td>
                <td className={row.delta > 0 ? "positive" : row.delta < 0 ? "negative" : ""}>{row.delta == null ? "—" : `${row.delta > 0 ? "+" : ""}${row.delta}`}</td>
                <td>{row.url ? <a href={row.url} target="_blank" rel="noreferrer"><ExternalLink />{row.url.replace(/^https?:\/\/[^/]+/, "") || "/"}</a> : <span>URL non trovata</span>}</td>
                <td><div className="ranking-history-chips">{row.history.map((point, index) => <span key={`${point.checkedAt}-${index}`} title={`${formatDateTime(point.checkedAt)} · ${point.label}`}><small>{formatShortDate(point.checkedAt)}</small><strong>{point.label}</strong></span>)}</div></td>
                <td><div className="ranking-relations">
                  {linkedProblems.length ? <button type="button" className="secondary mini" onClick={() => { if (!openProblemResolution(linkedProblems[0], selectedClientId, "ranking-workspace")) navigatePage("Problemi"); }}>Problemi pagina ({linkedProblems.length})</button> : <small>Nessun problema osservato sulla URL</small>}
                  {opportunityEvidence.length ? <button type="button" className="secondary mini" title={opportunityLabels(opportunityEvidence)} onClick={() => navigatePage("Opportunità")}>Opportunità GSC ({opportunityEvidence.length})</button> : <small>Nessuna opportunità GSC associata</small>}
                </div></td>
                <td><span className="ranking-provenance"><strong>{row.source}</strong><small>{formatDateTime(row.checkedAt)}</small></span></td>
              </tr>;
            })}
            {!visibleRows.length && <tr><td colSpan="7" className="rankings-empty-row">Nessun dato reale corrisponde ai filtri selezionati.</td></tr>}
          </tbody></table>
        </div>
        <footer className="rankings-evidence-foot"><span>Il delta è mostrato solo quando esiste un controllo precedente con device, profondità, località e lingua identici.</span><span>Problemi e opportunità compaiono solo se esiste una corrispondenza nei dati salvati del progetto.</span></footer>
      </> : <div className="rankings-no-data"><BarChart3 /><div><h3>Nessun dato DataForSEO salvato</h3><p>Apri la card “Nuovo controllo posizionamenti” sopra e usa gli strumenti operativi per eseguire il primo controllo.</p></div></div>}
    </section>
  );

  return createPortal(content, host);
}
