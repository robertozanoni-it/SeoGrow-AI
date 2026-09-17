import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, CalendarDays, FileText, Search, ShieldCheck, Sparkles, Target } from "lucide-react";
import { registerPageHost } from "./PageStartHierarchy.js";
import { readWorkspaceJson as readJson, writeWorkspaceJson as writeJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { navigatePage } from "./navigationUx.js";
import {
  EDITORIAL_STATUSES,
  buildEditorialPlanRows,
  patchEditorialPlanState,
  scheduleItem,
  contentPlan,
  buildEditorialProjectContext,
  validateEditorialProjectContext,
} from "./modules/content/index.js";
import {
  validRankingRuns,
  comparableRankingRuns,
  buildPositioningRows,
  buildSeoOpportunities,
} from "./modules/rank/index.js";
import "./EditorialPlanWorkspaceLayer.css";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const forClient = (store, clientId, fallback = null) => store?.[clientId] ?? store?.[String(clientId)] ?? fallback;
const historyForClient = (store, clientId) => {
  const value = forClient(store, clientId, []);
  return Array.isArray(value) ? value : value ? [value] : [];
};
const latestByDate = (items, fields = ["analyzedAt", "startedAt"]) => (Array.isArray(items) ? [...items] : [])
  .toSorted((left, right) => {
    const at = (item) => fields.map((field) => Date.parse(item?.[field] || "") || 0).find(Boolean) || 0;
    return at(right) - at(left);
  })[0] || null;

const projectSettings = (preferences, clientId) => preferences?.projectSettings?.[clientId] ?? preferences?.projectSettings?.[String(clientId)] ?? {};
const saveProjectSettings = (clientId, patch) => {
  const preferences = readJson(WORKSPACE_KEYS.preferences, {});
  const current = projectSettings(preferences, clientId);
  const next = {
    ...preferences,
    projectSettings: {
      ...(preferences?.projectSettings || {}),
      [clientId]: { ...current, ...patch },
    },
  };
  writeJson(WORKSPACE_KEYS.preferences, next);
  return next;
};

const formatPosition = (ranking) => ranking?.position == null ? "—" : Number(ranking.position).toFixed(1).replace(".0", "");

export default function EditorialPlanWorkspaceLayer() {
  const [page, setPage] = useState(currentPage);
  const [revision, setRevision] = useState(0);
  const [host, setHost] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const refreshPage = () => { setPage(currentPage()); setQuery(""); setStatusFilter("all"); setMessage(""); };
    const refresh = () => setRevision((value) => value + 1);
    for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.addEventListener(event, refreshPage);
    for (const event of ["storage", "seogrow-storage-ok", "seogrow-task-cause-reconciled"]) window.addEventListener(event, refresh);
    return () => {
      for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.removeEventListener(event, refreshPage);
      for (const event of ["storage", "seogrow-storage-ok", "seogrow-task-cause-reconciled"]) window.removeEventListener(event, refresh);
    };
  }, []);

  useEffect(() => {
    if (page !== "Piano editoriale") return undefined;
    let release;
    const frame = window.requestAnimationFrame(() => {
      const mountedHost = document.createElement("div");
      mountedHost.className = "editorial-plan-workspace-host guided-next-actions-host";
      mountedHost.dataset.editorialPlanWorkspace = "true";
      release = registerPageHost(page, mountedHost);
      document.body.dataset.seogrowEditorialPlanWorkspace = "true";
      setHost(mountedHost);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      release?.();
      delete document.body.dataset.seogrowEditorialPlanWorkspace;
    };
  }, [page]);

  const stores = useMemo(() => ({
    revision,
    clients: readJson(WORKSPACE_KEYS.clients, []),
    gsc: readJson(WORKSPACE_KEYS.gsc, {}),
    analyses: readJson(WORKSPACE_KEYS.analyses, {}),
    rankings: readJson(WORKSPACE_KEYS.rankings, {}),
    topicalMaps: readJson(WORKSPACE_KEYS.topicalMaps, {}),
    contentDrafts: readJson(WORKSPACE_KEYS.contentDrafts, {}),
    preferences: readJson(WORKSPACE_KEYS.preferences, {}),
  }), [revision]);

  const clientId = Number(readJson(WORKSPACE_KEYS.selectedClient, 0));
  const client = stores.clients.find((item) => Number(item.id) === clientId) || null;
  const dataset = forClient(stores.gsc, clientId, null);
  const analysis = latestByDate(historyForClient(stores.analyses, clientId));
  const topicalMap = forClient(stores.topicalMaps, clientId, null);
  const draft = forClient(stores.contentDrafts, clientId, null);
  const settings = projectSettings(stores.preferences, clientId);
  const schedule = Array.isArray(settings.editorialSchedule) ? settings.editorialSchedule : [];
  const state = settings.editorialPlanState && typeof settings.editorialPlanState === "object" ? settings.editorialPlanState : {};

  const rankingRuns = useMemo(() => validRankingRuns(historyForClient(stores.rankings, clientId)), [stores.rankings, clientId]);
  const currentRanking = rankingRuns[0] || null;
  const previousRanking = currentRanking ? comparableRankingRuns(currentRanking, rankingRuns)[0] || null : null;
  const rankingRows = useMemo(() => buildPositioningRows(currentRanking, previousRanking, rankingRuns), [currentRanking, previousRanking, rankingRuns]);
  const contentItems = useMemo(() => contentPlan(dataset, analysis), [dataset, analysis]);
  const opportunities = useMemo(() => buildSeoOpportunities({
    rankingRows,
    contentItems,
    gscDataset: dataset,
  }).opportunities, [rankingRows, contentItems, dataset]);
  const rows = useMemo(() => buildEditorialPlanRows({
    dataset,
    analysis,
    topicalMap,
    schedule,
    draft,
    rankingRows,
    opportunities,
    state,
  }), [dataset, analysis, topicalMap, schedule, draft, rankingRows, opportunities, state]);

  const generationContext = useMemo(() => buildEditorialProjectContext({
    client,
    dataset,
    analysis,
    rankings: currentRanking,
    topicalMap,
  }), [client, dataset, analysis, currentRanking, topicalMap]);
  const contextGate = useMemo(() => validateEditorialProjectContext(generationContext), [generationContext]);

  const visible = rows.filter((row) => {
    const needle = query.trim().toLocaleLowerCase("it");
    const haystack = `${row.topic} ${row.keyword} ${row.intent} ${row.cluster} ${row.brief}`.toLocaleLowerCase("it");
    if (needle && !haystack.includes(needle)) return false;
    if (statusFilter !== "all" && row.status !== statusFilter) return false;
    return true;
  });

  const updateState = (row, patch) => {
    try {
      const nextState = patchEditorialPlanState(state, row.id, patch);
      saveProjectSettings(clientId, { editorialPlanState: nextState });
      setMessage("Piano editoriale aggiornato.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Aggiornamento non riuscito.");
    }
  };

  const updateDate = (row, date) => {
    try {
      const nextSchedule = scheduleItem(schedule, { id: row.id, title: row.topic, type: row.type, url: row.sourceUrl }, date);
      saveProjectSettings(clientId, { editorialSchedule: nextSchedule });
      setMessage(date ? `Data prevista aggiornata: ${date}.` : "Data prevista rimossa.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Data non aggiornata.");
    }
  };

  const openRanking = (row) => {
    sessionStorage.setItem("seogrow-ranking-focus-v1", row.keyword || "");
    navigatePage("Posizionamenti");
  };
  const openOpportunity = (row) => {
    sessionStorage.setItem("seogrow-opportunity-focus-v1", row.opportunity?.id || row.opportunity?.dedupeKey || row.keyword || "");
    navigatePage("Opportunità");
  };

  if (page !== "Piano editoriale" || !host) return null;
  const scheduled = rows.filter((row) => row.date).length;
  const readyDrafts = rows.filter((row) => row.status === "Bozza pronta").length;
  const linkedRanking = rows.filter((row) => row.ranking).length;

  const content = !client ? (
    <section className="editorial-plan-workspace empty"><h2>Seleziona un progetto</h2><p>Il piano editoriale richiede un progetto attivo.</p></section>
  ) : (
    <section className="editorial-plan-workspace" aria-label="Piano editoriale strutturato">
      <header className="editorial-plan-head">
        <div><span className="eyebrow"><ShieldCheck /> Gate contesto progetto {contextGate.ok ? "attivo" : "bloccato"}</span><h2>Piano editoriale strutturato</h2><p>Topic, keyword, intento, cluster, stato, brief e calendario collegati ai segnali SEO reali del progetto.</p></div>
        <div className={`editorial-context-gate ${contextGate.ok ? "ready" : "blocked"}`}><strong>{contextGate.ok ? "Contesto pronto" : "Generazione bloccata"}</strong><small>{contextGate.ok ? contextGate.evidenceSources.join(" · ") : contextGate.errors.join(" ")}</small></div>
      </header>

      <div className="editorial-plan-kpis">
        <article><FileText /><span><small>Voci piano</small><strong>{rows.length}</strong></span></article>
        <article><CalendarDays /><span><small>Pianificate</small><strong>{scheduled}</strong></span></article>
        <article><Sparkles /><span><small>Bozze pronte</small><strong>{readyDrafts}</strong></span></article>
        <article><BarChart3 /><span><small>Con ranking</small><strong>{linkedRanking}</strong></span></article>
      </div>

      <div className="editorial-plan-toolbar">
        <label className="editorial-plan-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca topic, keyword, intento o cluster…" /></label>
        <label>Stato<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tutti</option>{EDITORIAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label>
        <span>{visible.length} / {rows.length}</span>
      </div>
      {message && <p className="editorial-plan-message" role="status">{message}</p>}

      {rows.length ? <div className="editorial-plan-table-wrap"><table className="editorial-plan-table"><caption className="sr-only">Piano editoriale SEO del progetto</caption><thead><tr><th>Topic</th><th>Keyword</th><th>Intento</th><th>Cluster</th><th>Stato</th><th>Brief</th><th>Data prevista</th><th>Ranking / opportunità</th></tr></thead><tbody>
        {visible.map((row) => <tr key={row.id}>
          <td><strong>{row.topic}</strong><small>{row.source} · {row.priority}</small></td>
          <td>{row.keyword || <span className="editorial-unknown">—</span>}</td>
          <td>{row.intent || <span className="editorial-unknown">Da definire</span>}</td>
          <td>{row.cluster || <span className="editorial-unknown">Da definire</span>}</td>
          <td><select aria-label={`Stato ${row.topic}`} value={row.status} onChange={(event) => updateState(row, { status: event.target.value })}>{EDITORIAL_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></td>
          <td><details><summary>Apri brief</summary><textarea aria-label={`Brief ${row.topic}`} defaultValue={row.brief} onBlur={(event) => { if (event.target.value.trim() !== row.brief) updateState(row, { brief: event.target.value }); }} /><small>{row.reason || row.association}</small></details></td>
          <td><input type="date" aria-label={`Data prevista ${row.topic}`} value={row.date || ""} onChange={(event) => updateDate(row, event.target.value)} /></td>
          <td><div className="editorial-plan-links">
            {row.ranking ? <button type="button" className="secondary mini" onClick={() => openRanking(row)}><BarChart3 /> Pos. {formatPosition(row.ranking)}</button> : <span>Ranking —</span>}
            {row.opportunity ? <button type="button" className="secondary mini" onClick={() => openOpportunity(row)}><Target /> Opportunità {row.opportunity.priority || ""}</button> : <span>Opportunità —</span>}
          </div></td>
        </tr>)}
        {!visible.length && <tr><td colSpan="8" className="editorial-plan-empty-row">Nessuna voce corrisponde ai filtri selezionati.</td></tr>}
      </tbody></table></div> : <div className="editorial-plan-empty"><FileText /><div><h3>Nessuna voce editoriale disponibile</h3><p>Importa Search Console, esegui un Audit SEO oppure crea una Topical Map per costruire il piano su dati reali.</p></div></div>}

      <footer className="editorial-plan-foot"><span>Intento e cluster non vengono dedotti senza evidenza Topical Map.</span><span>Ranking e opportunità usano associazioni esatte della keyword.</span><span>La generazione editoriale è bloccata se il progetto non dispone di contesto SEO verificabile.</span></footer>
    </section>
  );

  return createPortal(content, host);
}
