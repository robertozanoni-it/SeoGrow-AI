import { confirmAction, notifyUser } from "./ui/dialogs.js";
import { observedScoreDelta } from "./modules/audit/index.js";
import AnalysisProgress from "./AnalysisProgress.jsx";
import { rememberWordPressSession, getWordPressSession, mergeGoogleStatus, normalizeGoogleProperties } from "./system/index.js";
import { opportunityTask, findExistingTask } from "./modules/rank/index.js";
import TaskCleanup from './TaskCleanup.jsx';
import { AuditScheduler, FreshnessNotice, ProjectMonitoring, AuditUpdateNotice } from "./AuditMonitoring.jsx";
import { readAuditMonitor } from "./auditMonitorStore.js";
import EditorialCalendar from "./EditorialCalendar.jsx";
import { CommandPalette, SavedViews } from "./ProductivityUi.jsx";
import { taskChange, undoTaskChange } from "./productivity.js";
import { completeTaskById } from "./taskCompletion.js";
import { buildProjectHistory } from "./projectHistory.js";
import { Dashboard, SeoGrowAiDashboard } from "./OverviewDashboard.jsx";
import { SUITE_NAVIGATION } from "./suite/navigationModel.js";
import { createTaskDraft } from "./experience/tasks/index.js";
import { consumeTaskWorkflowContext, taskWorkflowTarget, writeCorrectionsWorkflowContext, writeTaskWorkflowContext } from "./taskWorkflow.js";
import { navigatePage, searchWorkspace } from "./navigationUx.js";
import { listCorrections } from "./remediationStore.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { restoreValidatedWorkspace } from "./workspaceRestore.js";
import { flushWorkspace } from "./workspaceDatabase.js";
import { reconcileAuditTasks } from "./auditTaskReconciliation";
import { closuresFromAgentRuns } from "./problemClosureMigration.js";
import { lazy, Suspense, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleGauge,
  ClipboardCheck,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileText,
  Globe2,
  HelpCircle,
  Home,
  Link2,
  Menu,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Users,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
const ProjectCenter = lazy(() => import("./ProjectCenter.jsx"));
const AgentPage = lazy(() => import("./intelligence/agent/index.js").then((module) => ({ default: module.AgentPage })));
const GeoPage = lazy(() => import("./modules/geo/index.js").then((module) => ({ default: module.GeoPage })));
import { initialClients } from "./data";
import { apiFetch } from "./api";
import {
  formatInteger,
  formatPeriodDate,
  importGscZip,
  normalizeSiteHost,
  opportunityQueries,
} from "./gscImport";
import {
  downloadClientReport,
  exportWorkspaceBackup,
  readWorkspaceBackup,
  normalizeAgentRuns,
  suggestPageForQuery,
} from "./seoHelpers";
import {
  addDatasetToHistory,
  analysisDiff,
  buildNotifications,
  contentPlan,
  downloadCsv,
  latestOf,
  normalizeAnalysisHistory,
  normalizeStoredTasks,
  opportunityGroups,
  queryChanges,
  queryTaskDetail,
  tasksFromAnalysis,
} from "./platform";

const NAV_ICON_BY_KEY = {
  overview: Home, clients: Users, project: ClipboardCheck, history: CalendarDays,
  audit: CircleGauge, problems: AlertTriangle, rankings: BarChart3, opportunities: Target,
  content: FileText, links: Link2, geo: Sparkles, fix: CheckCircle2, tasks: ClipboardCheck,
  agent: WandSparkles, "ai-overview": Sparkles, integrations: Plug, settings: Settings,
};
const nav = SUITE_NAVIGATION.flatMap((group) =>
  group.items.map((item) => [item.page, NAV_ICON_BY_KEY[item.icon] || CircleGauge]),
);
const fetch = apiFetch;
const newId = (prefix) => `${prefix}-${crypto.randomUUID()}`;
const stableKey = (value) => {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

const normalizeProjectUrl = (value) => {
  const raw = String(value || "").trim();
  const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  if (!/^https?:$/.test(url.protocol) || !url.hostname.includes("."))
    throw new Error("Indirizzo web non valido");
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/{2,}/g, "/");
  return url.href;
};
const projectIdentity = (value) => {
  try {
    const url = new URL(normalizeProjectUrl(value));
    return `${url.origin}${url.pathname.replace(/\/$/, "") || "/"}`;
  } catch {
    return "";
  }
};
const validateStoredValue = (key, value, initial) => {
  if (key === "seogrow-clients") {
    if (!Array.isArray(value) || !value.length) return initial;
    const valid = value.every(
      (client) =>
        client &&
        Number.isSafeInteger(client.id) &&
        client.id > 0 &&
        typeof client.name === "string" &&
        client.name.trim() &&
        projectIdentity(client.url),
    );
    return valid ? value : initial;
  }
  if (key.startsWith("seogrow-tasks")) {
    return normalizeStoredTasks(value, initial);
  }
  if (key === "seogrow-agent-runs-v1") return normalizeAgentRuns(value, initial);
  if (key === "seogrow-selected-page-v1")
    return nav.some(([label]) => label === value) || ["Problemi", "Correzioni"].includes(value) ? value : initial;
  if (key === "seogrow-selected-client-v1")
    return Number.isSafeInteger(value) && value > 0 ? value : initial;
  if (Array.isArray(initial)) return Array.isArray(value) ? value : initial;
  if (initial && typeof initial === "object")
    return value && typeof value === "object" && !Array.isArray(value)
      ? { ...initial, ...value }
      : initial;
  return typeof value === typeof initial ? value : initial;
};

function useStoredState(key, fallback) {
  const [value, setValue] = useState(() => {
    const initial = () =>
      typeof fallback === "function" ? fallback() : fallback;
    try {
      const defaultValue = initial();
      return validateStoredValue(
        key,
        JSON.parse(localStorage.getItem(key)) ?? defaultValue,
        defaultValue,
      );
    } catch {
      return initial();
    }
  });
  useEffect(() => {
    try {
      // Aggiorna subito il mirror in memoria: un reload immediato non deve
      // perdere l’ultimo valore React mentre il commit IndexedDB è in debounce.
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      console.error(`Impossibile salvare ${key}:`, error);
      window.dispatchEvent(
        new CustomEvent("seogrow-storage-error", {
          detail: { key, message: error.message },
        }),
      );
      return undefined;
    }

    const flush = async () => {
      try {
        await flushWorkspace();
        window.dispatchEvent(new CustomEvent("seogrow-storage-ok", { detail: { key } }));
      } catch (error) {
        console.error(`Impossibile salvare ${key}:`, error);
        window.dispatchEvent(
          new CustomEvent("seogrow-storage-error", {
            detail: { key, message: error.message },
          }),
        );
      }
    };
    const timer = window.setTimeout(flush, 120);
    return () => window.clearTimeout(timer);
  }, [key, value]);
  useEffect(() => {
    const sync = (event) => {
      if (event.key !== key || event.newValue == null) return;
      try {
        const parsedRaw = JSON.parse(event.newValue);
        setValue((current) => {
          const parsed = validateStoredValue(key, parsedRaw, current);
          const compatible = Array.isArray(current)
            ? Array.isArray(parsed)
            : current && typeof current === "object"
              ? parsed && typeof parsed === "object" && !Array.isArray(parsed)
              : typeof parsed === typeof current;
          return compatible ? parsed : current;
        });
      } catch {
        /* Ignora scritture esterne non valide. */
      }
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [key]);
  return [value, setValue];
}

function HistoryPage({ history, tasks = [], corrections = [], client, onAnalyze }) {
  const [historyFilter, setHistoryFilter] = useState("Tutti");
  const current = history[0];
  const oldest = history.at(-1);
  const scoreDelta = current?.score != null && oldest?.score != null ? current.score - oldest.score : null;
  const resolvedTotal = history.reduce((sum, item) => sum + (item.resolvedIssues?.length || 0), 0);
  const issueTotal = history.reduce((sum, item) => sum + (item.issues?.length || 0), 0);
  const timeline = buildProjectHistory({ audits: history, tasks, corrections });
  const filteredTimeline = historyFilter === "Tutti" ? timeline : timeline.filter((item) => item.type === historyFilter);
  const exportTimeline = () => downloadCsv(filteredTimeline.map((item) => ({ data: item.date, tipo: item.type, titolo: item.title, seo_score: item.score ?? "", risultato: item.detail || "", risorsa: item.url || "" })), `storico-${client.name}.csv`);
  return (
    <div className="reference-history-page">
      <section className="reference-history-project">
        <div className="reference-history-mark"><img src="/favicon.svg" alt="" /></div>
        <div><small>Storico progetto</small><h1>{client.name}</h1><a href={client.url} target="_blank" rel="noreferrer">{client.url}</a><p>Timeline unificata di audit, correzioni, contenuti e task completate.</p></div>
        <div className="reference-history-actions"><button className="secondary" onClick={exportTimeline}><Download /> Esporta CSV</button><button className="primary" onClick={onAnalyze}><Plus /> Nuovo audit</button></div>
      </section>
      <section className="reference-history-kpis">
        <article className="blue"><Search /><span><strong>{history.length}</strong><small>Audit eseguiti</small><em>Storico locale disponibile</em></span></article>
        <article className="green"><Target /><span><strong>{scoreDelta == null ? "—" : `${scoreDelta >= 0 ? "+" : ""}${scoreDelta}`}</strong><small>Miglioramento SEO</small><em>Dal primo all’ultimo audit</em></span></article>
        <article className="blue"><BarChart3 /><span><strong>{resolvedTotal}</strong><small>Problemi risolti</small><em>Registrati negli audit</em></span></article>
        <article className="green"><FileText /><span><strong>{current?.pagesChecked || 0}</strong><small>Pagine ultimo audit</small><em>{issueTotal} segnalazioni nello storico</em></span></article>
      </section>
      <nav className="reference-history-tabs" aria-label="Filtri storico">{["Tutti","Audit","Correzione","Contenuto","Task"].map((filter) => <button type="button" key={filter} className={historyFilter === filter ? "active" : ""} onClick={() => setHistoryFilter(filter)}>{filter === "Correzione" ? "Correzioni" : filter === "Contenuto" ? "Contenuti" : filter}</button>)}</nav>
      <div className="reference-history-layout">
        <section className="reference-history-table">
          <div className="table-scroll"><table><caption className="sr-only">Storico unificato del progetto</caption><thead><tr><th>Data</th><th>Tipo</th><th>Titolo / descrizione</th><th>SEO Score</th><th>Risultato</th><th>Risorsa</th></tr></thead><tbody>{filteredTimeline.length ? filteredTimeline.map((item) => <tr key={item.id}><td><strong>{new Date(item.date).toLocaleDateString("it-IT")}</strong><small>{new Date(item.date).toLocaleTimeString("it-IT", {hour:"2-digit",minute:"2-digit"})}</small></td><td><span className="reference-history-type">{item.type}</span></td><td><strong>{item.title}</strong></td><td>{item.score != null ? <span className={`reference-history-score ${Number(item.score) >= 80 ? "good" : Number(item.score) >= 60 ? "medium" : "low"}`}>{item.score}</span> : "—"}</td><td><small>{item.detail || "—"}</small></td><td>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">Apri</a> : "—"}</td></tr>) : <tr><td colSpan="6" className="empty-row">Nessuna attività disponibile per questo filtro.</td></tr>}</tbody></table></div>
        </section>
        <aside className="reference-history-aside">
          <section><BarChart3 /><h2>Confronta audit</h2><p>{history.length >= 2 ? `Dal punteggio ${oldest?.score ?? "—"} a ${current?.score ?? "—"}.` : "Servono almeno due audit per un confronto nel tempo."}</p><button className="secondary" onClick={onAnalyze}>Esegui nuovo audit →</button></section>
          <section className="reference-history-progress"><Target /><h2>Il tuo progresso</h2><strong>{scoreDelta == null ? "—" : `${scoreDelta >= 0 ? "+" : ""}${scoreDelta} punti`}</strong><p>{resolvedTotal} problemi risultano risolti nello storico disponibile.</p></section>
          <section><Download /><h2>Esporta storico</h2><p>Scarica la timeline completa in formato CSV.</p><button className="secondary" onClick={exportTimeline}>Esporta CSV</button></section>
        </aside>
      </div>
    </div>
  );
}

function InternalLinksPage({ analysis, client, onAnalyze, onCreateTask }) {
  const suggestions = analysis?.internalLinkSuggestions || [];
  const broken = analysis?.brokenLinks || [];
  const linksChecked = Number(analysis?.linksChecked || 0);
  const orphanPages = Array.isArray(analysis?.orphanPages) ? analysis.orphanPages : [];
  const anchorRows = suggestions
    .map((item) => String(item.anchor || "").trim())
    .filter(Boolean)
    .reduce((map, anchor) => map.set(anchor, (map.get(anchor) || 0) + 1), new Map());
  const topAnchors = [...anchorRows.entries()].toSorted((a,b) => b[1] - a[1]).slice(0, 5);
  const structureItems = suggestions.slice(0, 6);
  return (
    <div className="reference-links-page">
      <section className="reference-links-head">
        <div className="reference-links-title"><span><Link2 /></span><div><h1>Link interni</h1><p>Analizza la struttura di linking interno del sito e trasforma i suggerimenti in azioni verificabili.</p></div></div>
        <div className="reference-links-actions"><button className="secondary" onClick={onAnalyze}><RefreshCw /> Aggiorna analisi</button></div>
      </section>

      <section className="reference-links-kpis">
        <article><Link2 /><span><strong>{analysis ? formatInteger(linksChecked) : "—"}</strong><small>Link controllati</small><em>{analysis ? "Ultimo crawl salvato" : "Audit richiesto"}</em></span></article>
        <article><FileText /><span><strong>{analysis ? orphanPages.length : "—"}</strong><small>Pagine orfane</small><em>{Array.isArray(analysis?.orphanPages) ? "Rilevate dal crawl" : "Dato non disponibile"}</em></span></article>
        <article><Target /><span><strong>{analysis ? suggestions.length : "—"}</strong><small>Opportunità</small><em>Link suggeriti da verificare</em></span></article>
        <article><AlertTriangle /><span><strong>{analysis ? broken.length : "—"}</strong><small>Link rotti</small><em>{broken.length ? "Richiedono intervento" : "Nessun errore noto"}</em></span></article>
      </section>

      <section className="reference-links-grid">
        <article className="reference-link-map">
          <div className="reference-panel-title"><div><h2>Struttura di linking del sito</h2><p>Vista sintetica delle opportunità principali.</p></div><span>{client?.name}</span></div>
          <div className="reference-link-network"><div className="reference-link-home"><Home /><strong>Home</strong></div>{structureItems.map((item,index) => <div className={`reference-link-node node-${index+1}`} key={`${item.sourceUrl}-${item.targetUrl}-${index}`}><Link2 /><span><strong>{item.anchor || `Link ${index+1}`}</strong><small>{(() => { try { return item.targetUrl ? new URL(item.targetUrl).pathname : "Destinazione"; } catch { return item.targetUrl || "Destinazione"; } })()}</small></span></div>)}</div>
          <div className="reference-link-legend"><span><i className="blue" />Pagina principale</span><span><i className="green" />Opportunità</span><span><i className="red" />Link rotto</span></div>
        </article>

        <div className="reference-links-side">
          <article><h2>Distribuzione link</h2><div className="reference-link-donut" style={{"--good":`${linksChecked ? Math.max(0,((linksChecked-broken.length)/linksChecked)*360) : 0}deg`}}><span><strong>{linksChecked}</strong><small>controllati</small></span></div><ul><li><i className="green" />Validi / non segnalati <strong>{Math.max(0,linksChecked-broken.length)}</strong></li><li><i className="red" />Rotti <strong>{broken.length}</strong></li><li><i className="blue" />Suggeriti <strong>{suggestions.length}</strong></li></ul></article>
          <article><h2>Anchor text suggerite</h2>{topAnchors.length ? topAnchors.map(([anchor,count]) => <div className="reference-anchor-row" key={anchor}><span>{anchor}</span><i><b style={{width:`${Math.min(100,20+count*18)}%`}} /></i><strong>{count}</strong></div>) : <p className="reference-empty-copy">Nessuna anchor suggerita disponibile.</p>}</article>
        </div>
      </section>

      <section className="reference-link-opportunities panel"><div className="reference-panel-title"><div><h2>Pagine con opportunità di link</h2><p>Suggerimenti editoriali da validare prima dell’applicazione.</p></div><span>{suggestions.length} opportunità</span></div>{suggestions.length ? <div className="table-scroll"><table><caption className="sr-only">Opportunità di linking interno</caption><thead><tr><th>Pagina sorgente</th><th>Anchor</th><th>Destinazione</th><th>Azione</th></tr></thead><tbody>{suggestions.slice(0, 12).map((link,index) => <tr key={`${link.sourceUrl}-${link.targetUrl}-${index}`}><td><a href={link.sourceUrl} target="_blank" rel="noreferrer">{link.sourceUrl}</a></td><td><strong>{link.anchor || "Non disponibile"}</strong></td><td><a href={link.targetUrl} target="_blank" rel="noreferrer">{link.targetUrl}</a></td><td><button className="secondary mini" onClick={() => onCreateTask({ title:`Inserisci link interno: “${link.anchor}”`, sourceUrl:link.sourceUrl, targetUrl:link.targetUrl, detail:`${link.reason}\nPagina sorgente: ${link.sourceUrl}\nDestinazione: ${link.targetUrl}\nAnchor consigliata: ${link.anchor}`, priority:"Media", kind:"internal-link" })}>Crea task</button></td></tr>)}</tbody></table></div> : <p className="reference-empty-copy">Avvia un crawl completo per generare suggerimenti.</p>}</section>

      <section className="reference-broken-links panel"><div className="reference-panel-title"><div><h2>Link interrotti</h2><p>Pagine sorgenti e destinazioni rilevate dal crawl.</p></div><span>{broken.length}</span></div>{broken.length ? broken.slice(0,10).map((link) => <div className="reference-broken-row" key={link.url}><AlertTriangle /><span><strong>{link.url}</strong><small>{(link.sources || []).length} pagine sorgenti</small></span><button className="secondary mini" onClick={() => onCreateTask({ title:`Correggi link interrotto: ${link.url}`, sourceUrl:link.sources?.[0] || "", targetUrl:link.url, detail:`${link.error || `HTTP ${link.status}`}\nPagine sorgenti:\n${(link.sources || []).map((source) => `- ${source}`).join("\n")}\nDestinazione interrotta: ${link.url}`, priority:"Alta", kind:"broken-link" })}>Crea task</button></div>) : <div className="reference-link-success"><Check /><span><strong>Nessun link interrotto rilevato</strong><small>{analysis ? "Ultimo crawl senza errori di linking confermati." : "Avvia una nuova analisi completa."}</small></span></div>}</section>
    </div>
  );
}

function Logo() {
  return (
    <div className="logo reference-logo">
      <img src="/favicon.svg" alt="" aria-hidden="true" />
      <span className="reference-logo-copy"><strong>SeoGrow</strong> <b>AI</b><small>Grow smarter. Rank higher.</small></span>
    </div>
  );
}

function Sidebar({ page, setPage, open, setOpen, displayName }) {
  const sidebarRef = useRef(null);
  const previousFocusRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    previousFocusRef.current = document.activeElement;
    window.setTimeout(
      () => sidebarRef.current?.querySelector("button")?.focus(),
      0,
    );
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key === "Tab") {
        const focusable = [
          ...(sidebarRef.current?.querySelectorAll("button:not(:disabled)") || []),
        ];
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      previousFocusRef.current?.focus?.();
    };
  }, [open, setOpen]);
  return (
    <aside
      ref={sidebarRef}
      className={`sidebar ${open ? "open" : ""}`}
      role={open ? "dialog" : undefined}
      aria-modal={open || undefined}
      aria-label={open ? "Menu principale" : undefined}
      onClick={(event) => {
        if (event.target.closest("nav button")) setOpen(false);
      }}
    >
      <div className="side-head">
        <Logo />
        <button
          className="icon-btn mobile-only"
          onClick={() => setOpen(false)}
          aria-label="Chiudi menu"
        >
          <X />
        </button>
      </div>
      <nav>
        {nav.map(([label, Icon]) => (
          <button
            key={label}
            className={page === label ? "active" : ""}
            aria-current={page === label ? "page" : undefined}
            onClick={() => {
              setPage(label);
              setOpen(false);
            }}
          >
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
      <div className="side-foot">
        <div className="avatar avatar-small">
          {displayName
            .split(/\s+/)
            .map((word) => word[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        <div>
          <strong>{displayName}</strong>
          <small>Amministratore</small>
        </div>
      </div>
    </aside>
  );
}

function Header({
  clients,
  selectedClient,
  setSelectedClient,
  setMenuOpen,
  query,
  setQuery,
  searchResults,
  searchTotal,
  onSearchResult,
  notifications,
  onNotifications,
  onHelp,
  displayName,
}) {
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef(null);
  const notificationButtonRef = useRef(null);
  const searchRef = useRef(null);
  const closeNotifications = (restoreFocus = false) => {
    setShowNotifications(false);
    if (restoreFocus)
      window.setTimeout(() => notificationButtonRef.current?.focus(), 0);
  };
  useEffect(() => {
    if (!showNotifications) return undefined;
    const closeOnInteraction = (event) => {
      if (event.key === "Escape") closeNotifications(true);
      if (event.type === "mousedown" && !notificationRef.current?.contains(event.target))
        setShowNotifications(false);
    };
    window.addEventListener("keydown", closeOnInteraction);
    window.addEventListener("mousedown", closeOnInteraction);
    return () => {
      window.removeEventListener("keydown", closeOnInteraction);
      window.removeEventListener("mousedown", closeOnInteraction);
    };
  }, [showNotifications]);
  useEffect(() => {
    if (!showNotifications) return;
    notificationRef.current?.querySelector(".notification-menu button")?.focus();
  }, [showNotifications]);
  useEffect(() => {
    if (!showNotifications) return undefined;
    const trapFocus = (event) => {
      if (event.key !== "Tab") return;
      const buttons = [
        ...(notificationRef.current?.querySelectorAll(
          ".notification-menu button:not(:disabled)",
        ) || []),
      ];
      if (!buttons.length) return;
      const first = buttons[0];
      const last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [showNotifications]);
  useEffect(() => {
    if (!query.trim()) return undefined;
    const closeSearch = (event) => {
      if (!searchRef.current?.contains(event.target)) setQuery("");
    };
    window.addEventListener("mousedown", closeSearch);
    return () => window.removeEventListener("mousedown", closeSearch);
  }, [query, setQuery]);
  return (
    <header className="topbar">
      <button
        className="icon-btn mobile-only"
        onClick={() => setMenuOpen(true)}
        aria-label="Apri menu"
      >
        <Menu />
      </button>
      <label className="client-select">
        <Globe2 />
        <select
          aria-label="Progetto attivo"
          value={selectedClient}
          onChange={(e) => setSelectedClient(Number(e.target.value))}
        >
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <ChevronDown />
      </label>
      <div className="global-search-wrap" ref={searchRef}>
        <label className="global-search">
          <span className="sr-only">Cerca nell’app</span>
          <Search />
          <input
            aria-label="Cerca nell’app"
            type="search"
            aria-controls={query.trim() ? "global-search-results" : undefined}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
              if (event.key === "ArrowDown") {
                event.preventDefault();
                event.currentTarget
                  .closest(".global-search-wrap")
                  ?.querySelector(".search-results button")
                  ?.focus();
              }
            }}
            placeholder="Cerca clienti, task, URL e sezioni…"
          />
        </label>
        {query.trim() && (
          <div id="global-search-results" className="search-results" role="region" aria-label="Risultati della ricerca">
            <p role="status">{searchTotal > searchResults.length ? `Primi ${searchResults.length} di ${searchTotal} risultati · affina la ricerca` : `${searchTotal} risultati`} · Tutti i progetti</p>
            {searchResults.length ? (
              searchResults.map((item, index) => (
                <button
                  key={`${item.page}-${item.clientId || "app"}-${item.taskId || item.label}-${index}`}
                  onClick={() => onSearchResult(item)}
                  onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      const buttons = [...event.currentTarget.parentElement.querySelectorAll("button")];
                      buttons[(buttons.indexOf(event.currentTarget) + 1) % buttons.length]?.focus();
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      const buttons = [...event.currentTarget.parentElement.querySelectorAll("button")];
                      buttons[(buttons.indexOf(event.currentTarget) + buttons.length - 1) % buttons.length]?.focus();
                    }
                    if (event.key === "Escape") {
                      setQuery("");
                      event.currentTarget.closest(".global-search-wrap")?.querySelector("input")?.focus();
                    }
                  }}
                >
                  <strong>{item.label}</strong>
                  <small>{item.meta}</small>
                </button>
              ))
            ) : (
              <p>Nessuna corrispondenza. Prova il nome del progetto, una parola della task o un URL.</p>
            )}
          </div>
        )}
      </div>
      <div className="top-actions" ref={notificationRef}>
        <button
          ref={notificationButtonRef}
          className="icon-btn"
          aria-label="Notifiche"
          aria-expanded={showNotifications}
          aria-controls="notification-menu"
          aria-haspopup="dialog"
          onClick={() => setShowNotifications((value) => !value)}
        >
          <Bell />
          {notifications.length > 0 && (
            <i>{notifications.length > 9 ? "9+" : notifications.length}</i>
          )}
        </button>
        <button className="icon-btn help" aria-label="Aiuto" onClick={onHelp}>
          <HelpCircle />
        </button>
        <div className="avatar">
          {displayName
            .split(/\s+/)
            .map((word) => word[0])
            .slice(0, 2)
            .join("")
            .toUpperCase()}
        </div>
        {showNotifications && (
          <div id="notification-menu" className="notification-menu" role="dialog" aria-label="Notifiche">
            <div className="panel-head">
              <h2>Notifiche</h2>
              <button
                className="icon-btn"
                aria-label="Chiudi notifiche"
                onClick={() => closeNotifications(true)}
              >
                <X />
              </button>
            </div>
            {notifications.length ? (
              notifications.map((item, index) => (
                <button
                  key={`${item.title}-${item.text}-${index}`}
                  onClick={() => {
                    onNotifications(item);
                    setShowNotifications(false);
                  }}
                >
                  <AlertTriangle className={item.tone} />
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.text}</small>
                  </span>
                </button>
              ))
            ) : (
              <p>Nessun avviso per il progetto selezionato.</p>
            )}
          </div>
        )}
      </div>
    </header>
  );
}


function TaskTable({
  tasks,
  setTasks,
  compact = false,
  title,
  client,
  clients = [],
  openTaskId,
  views,
  onSaveViews,
  onTaskOpened,
  onContinueTask,
}) {
  const [editing, setEditing] = useState(
    () => tasks.find((item) => item.id === openTaskId) || null,
  );
  const [savedViewId, setSavedViewId] = useState("");
  useEffect(() => {
    const createTask = () => setEditing({ title: "", priority: "Media", due: "", status: "Da fare", targetUrl: client?.url || "", sourceUrl: "", detail: "", notes: "", sourceClientId: client?.id, client: client?.name });
    window.addEventListener("seogrow-task-create", createTask);
    return () => window.removeEventListener("seogrow-task-create", createTask);
  }, [client]);
  const [taskQuery, setTaskQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tutti");
  useEffect(() => {
    if (!openTaskId) return undefined;
    const requested = tasks.find((item) => item.id === openTaskId);
    const timer = window.setTimeout(() => {
      if (requested) setEditing(requested);
      onTaskOpened?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [openTaskId, onTaskOpened, tasks]);
  const priorityWeight = (task) => ({ Alta: 0, Media: 1, Bassa: 2 })[task.priority] ?? 3;
  const dueTime = (task) =>
    /^\d{4}-\d{2}-\d{2}$/.test(task.due || "")
      ? Date.parse(`${task.due}T00:00:00`)
      : Number.MAX_SAFE_INTEGER;
  const visibleTasks = compact
    ? tasks
        .filter((task) => !task.stale && task.status !== "Completato")
        .toSorted((a, b) => dueTime(a) - dueTime(b) || priorityWeight(a) - priorityWeight(b))
        .slice(0, 8)
    : tasks
        .filter(
          (task) =>
            statusFilter === "Archiviate"
              ? task.stale
              : !task.stale &&
                (statusFilter === "Tutti" || task.status === statusFilter),
        )
        .filter((task) =>
          `${task.title} ${task.detail || ""} ${task.sourceUrl || ""} ${task.targetUrl || ""}`
            .toLowerCase()
            .includes(taskQuery.trim().toLowerCase()),
        )
        .toSorted((a, b) => {
          return dueTime(a) - dueTime(b) || priorityWeight(a) - priorityWeight(b);
        });
  const statuses = ["Da fare", "In corso", "In revisione", "Completato"];
  return (
    <section className={`panel tasks-panel ${compact ? "compact" : ""}`}>
      <div className="panel-head">
        <div>
          <h2>
            {title || (compact ? "Priorità di oggi" : "Task del progetto")}
          </h2>
          <p>
            {compact
              ? "Le attività con il maggiore impatto."
              : "Solo attività relative al sito selezionato."}
          </p>
        </div>
        {!compact && (
          <div className="inline-actions">
            <TaskCleanup key={client?.id} tasks={tasks} clientId={client?.id} setTasks={setTasks} />
            <button
              className="secondary small-button"
              onClick={() =>
                setEditing({
                  title: "",
                  priority: "Media",
                  due: "",
                  status: "Da fare",
                  targetUrl: client?.url || "",
                  sourceUrl: "",
                  detail: "",
                  notes: "",
                  sourceClientId: client?.id,
                  client: client?.name,
                })
              }
            >
              <Plus />
              Nuova task
            </button>
            <button
              className="secondary small-button"
              onClick={() =>
                downloadCsv(tasks, `task-${client?.name || "progetto"}.csv`)
              }
            >
              <Download />
              CSV
            </button>
          </div>
        )}
      </div>
      {!compact && onSaveViews && <SavedViews savedViewId={savedViewId} onSelectView={setSavedViewId} label="task" views={views} filters={{ query: taskQuery, status: statusFilter }} onSave={onSaveViews} onApply={filters => { setTaskQuery(typeof filters.query === "string" ? filters.query : ""); setStatusFilter(["Tutti", "Archiviate", ...statuses].includes(filters.status) ? filters.status : "Tutti"); }} />}
      {!compact && (
        <div className="task-filters">
          <label>
            <span className="sr-only">Cerca task</span>
            <Search />
            <input
              value={taskQuery}
              onChange={(event) => { setSavedViewId(""); setTaskQuery(event.target.value); }}
              placeholder="Cerca nelle task…"
            />
          </label>
          <select
            aria-label="Filtra per stato"
            value={statusFilter}
            onChange={(event) => { setSavedViewId(""); setStatusFilter(event.target.value); }}
          >
            <option>Tutti</option>
            <option>Da fare</option>
            <option>In corso</option>
            <option>In revisione</option>
            <option>Completato</option>
            <option>Archiviate</option>
          </select>
          <small>{visibleTasks.length} task visualizzate</small>
        </div>
      )}
      <div className="table-scroll">
        <table>
          <caption className="sr-only">Task del progetto selezionato</caption>
          <thead>
            <tr>
              <th>Task</th>
              <th>Pagina o dettaglio</th>
              <th>Priorità</th>
              <th>Scadenza</th>
              <th>Stato</th>
            </tr>
          </thead>
          <tbody>
            {visibleTasks.length ? (
              visibleTasks.map((task) => (
                <tr key={task.id}>
                  <td>
                    <button
                      className="task-title-button"
                      onClick={() => setEditing(task)}
                    >
                      <span className={`row-icon ${task.kind}`}>
                        <Zap />
                      </span>
                      <strong>{task.title}</strong>
                      {task.completionReason && task.status === 'Completato' && <small>{task.completionReason}</small>}
                      {task.stale && (task.archivedReason || task.staleReason) && <small>{task.archivedReason || task.staleReason}</small>}
                    </button>
                  </td>
                  <td>
                    <div className="task-links">
                      {task.targetUrl ? (
                        <a
                          className="task-link"
                          href={task.targetUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink />
                          {task.linkLabel || "Apri pagina"}
                        </a>
                      ) : (
                        !task.sourceUrl && (
                          <span className="task-detail">
                            {task.detail || "Dettaglio non disponibile"}
                          </span>
                        )
                      )}
                      {task.targetUrl && <small style={{ overflowWrap: 'anywhere' }}>{task.targetUrl}</small>}
                      {task.sourceUrl && (
                        <a
                          className="task-link"
                          href={task.sourceUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink />
                          {task.kind === "search"
                            ? "Apri pagina suggerita"
                            : "Apri pagina sorgente"}
                        </a>
                      )}
                      {task.sourceUrl && <small style={{ overflowWrap: 'anywhere' }}>{task.sourceUrl}</small>}
                    </div>
                  </td>
                  <td>
                    <span className={`priority ${task.priority.toLowerCase()}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td>{task.due || "Da pianificare"}</td>
                  <td>
                    <select
                      className={`status ${task.status.toLowerCase().replaceAll(" ", "-")}`}
                      aria-label={`Stato della task ${task.title}`}
                      value={task.status}
                      onChange={(event) => {
                        const status = event.target.value;
                        setTasks((items) =>
                          items.map((item) =>
                            item.id === task.id
                              ? {
                                  ...item,
                                  status,
                                  updatedAt: new Date().toISOString(),
                                  completedAt:
                                    status === "Completato"
                                      ? new Date().toISOString()
                                      : null,
                                }
                              : item,
                          ),
                        );
                      }}
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="empty-row">
                  Nessun task verificato per questo progetto. Importa Search
                  Console o avvia una nuova analisi.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && (
        <TaskEditor
          task={editing}
          client={client}
          clients={clients}
          close={() => setEditing(null)}
          save={(task) => {
            const targetClientId = task.sourceClientId || client.id;
            const duplicate = findExistingTask(tasks.filter(item => item.id !== task.id), { ...task, kind: task.kind || 'manual' }, targetClientId);
            if (duplicate) {
              notifyUser("Esiste già una task attiva con lo stesso titolo e gli stessi collegamenti.");
              return;
            }
            setTasks((current) => {
              const exists = current.some((item) => item.id === task.id);
              return exists
                ? current.map((item) =>
                    item.id === task.id ? { ...task, userEdited: true } : item,
                  )
                : [
                    {
                      ...task,
                      id: newId("manual"),
                      sourceClientId: task.sourceClientId || client.id,
                      client:
                        clients.find((item) => item.id === task.sourceClientId)?.name ||
                        task.client ||
                        client.name,
                      kind: "manual",
                      createdAt: new Date().toISOString(),
                    },
                    ...current,
                  ];
            });
            setEditing(null);
          }}
          remove={
            editing.id
              ? () => {
                  if (confirmAction("Eliminare questa task?")) {
                    setTasks((current) =>
                      current.filter((item) => item.id !== editing.id),
                    );
                    setEditing(null);
                  }
                }
              : null
          }
          onContinueTask={(task) => {
            setEditing(null);
            onContinueTask?.(task);
          }}
        />
      )}
    </section>
  );
}

function TaskReferencePage({ tasks, setTasks, client, clients, views, onSaveViews, openTaskId, onTaskOpened, onOpenTask, onContinueTask }) {
  const active = tasks.filter((task) => !task.stale);
  const counts = {
    total: active.length,
    todo: active.filter((task) => task.status === "Da fare").length,
    progress: active.filter((task) => task.status === "In corso").length,
    review: active.filter((task) => task.status === "In revisione").length,
    done: active.filter((task) => task.status === "Completato").length,
  };
  const priorities = {
    Alta: active.filter((task) => task.priority === "Alta").length,
    Media: active.filter((task) => task.priority === "Media").length,
    Bassa: active.filter((task) => task.priority === "Bassa").length,
  };
  const due = active.filter((task) => task.status !== "Completato" && /^\d{4}-\d{2}-\d{2}$/.test(task.due || "")).toSorted((a,b) => Date.parse(a.due) - Date.parse(b.due)).slice(0,5);
  const totalRing = Math.max(1, counts.total);
  const todoDeg = counts.todo / totalRing * 360;
  const progressDeg = counts.progress / totalRing * 360;
  const reviewDeg = counts.review / totalRing * 360;
  return (
    <div className="reference-task-page">
      <section className="reference-task-head">
        <div className="reference-task-title"><span><ClipboardCheck /></span><div><h1>Task</h1><p>Organizza, assegna e monitora tutte le attività SEO del progetto.</p></div></div>
        <div className="reference-task-actions"><button className="secondary" onClick={() => downloadCsv(tasks, `task-${client?.name || "progetto"}.csv`)}><Download /> Esporta task</button><button className="primary" onClick={() => window.dispatchEvent(new CustomEvent("seogrow-task-create"))}><Plus /> Nuovo task</button></div>
      </section>
      <section className="reference-task-tabs">{[["Tutte",counts.total],["Da fare",counts.todo],["In corso",counts.progress],["In revisione",counts.review],["Completate",counts.done]].map(([label,value]) => <span key={label}>{label}<b>{value}</b></span>)}</section>
      <section className="reference-task-kpis">
        <article className="blue"><ClipboardCheck /><span><strong>{counts.total}</strong><small>Task totali</small><em>Progetto attivo</em></span></article>
        <article className="red"><Clock3 /><span><strong>{counts.todo}</strong><small>Da fare</small><em>In attesa di avvio</em></span></article>
        <article className="cyan"><RefreshCw /><span><strong>{counts.progress}</strong><small>In corso</small><em>Attualmente attivi</em></span></article>
        <article className="orange"><CheckCircle2 /><span><strong>{counts.done}</strong><small>Completati</small><em>Storico verificato</em></span></article>
      </section>
      <div className="reference-task-layout">
        <TaskTable tasks={tasks} setTasks={setTasks} client={client} clients={clients} views={views} onSaveViews={onSaveViews} openTaskId={openTaskId} onTaskOpened={onTaskOpened} onContinueTask={onContinueTask} />
        <aside className="reference-task-aside">
          <section><h2>Distribuzione task</h2><div className="reference-task-ring" style={{"--todo":`${todoDeg}deg`,"--progress":`${progressDeg}deg`,"--review":`${reviewDeg}deg`}}><span><strong>{counts.total}</strong><small>task</small></span></div><ul><li><i className="red" />Da fare <strong>{counts.todo}</strong></li><li><i className="blue" />In corso <strong>{counts.progress}</strong></li><li><i className="purple" />In revisione <strong>{counts.review}</strong></li><li><i className="green" />Completati <strong>{counts.done}</strong></li></ul></section>
          <section><h2>Priorità</h2>{Object.entries(priorities).map(([label,value]) => <div className="reference-task-priority" key={label}><span>{label}</span><i><b className={label.toLowerCase()} style={{width:`${counts.total ? Math.max(4,value/counts.total*100) : 0}%`}} /></i><strong>{value}</strong></div>)}</section>
          <section><div className="reference-panel-title"><div><h2>Task in scadenza</h2><p>Prime attività pianificate.</p></div></div>{due.length ? due.map((task) => <button key={task.id} onClick={() => onOpenTask?.(task.id)}><span className={`priority ${task.priority.toLowerCase()}`}>{task.priority}</span><span><strong>{task.title}</strong><small>{new Date(`${task.due}T00:00:00`).toLocaleDateString("it-IT")}</small></span></button>) : <p className="reference-empty-copy">Nessuna scadenza impostata.</p>}</section>
        </aside>
      </div>
    </div>
  );
}

function TaskEditor({ task, save, remove, close, clients = [], onContinueTask }) {
  const submissionPending = useRef(false);
  const [form, setForm] = useState(task);
  const suggested = form.associationStatus === "suggested";
  const manuallyVerified = form.associationStatus === "verified-manual";
  return (
    <Modal title={task.id ? "Dettaglio task" : "Nuova task"} close={close}>
      <form
        className="form task-editor"
        onSubmit={(event) => {
          event.preventDefault();
          if (!form.title.trim() || submissionPending.current) return;
          submissionPending.current = true;
          try { save({ ...form, updatedAt: new Date().toISOString() }); }
          finally { queueMicrotask(() => { submissionPending.current = false; }); }
        }}
      >
        {form.kind === "search" && (
          <div
            className={`task-evidence ${suggested ? "warning" : "verified"}`}
          >
            <AlertTriangle />
            <div>
              <strong>
                {suggested
                  ? "Associazione query–pagina da verificare"
                  : manuallyVerified
                    ? "Associazione verificata manualmente"
                    : "Dati query–pagina disponibili"}
              </strong>
              <p>
                {suggested
                  ? "Nei dati importati manca una relazione query–pagina confermata. L’eventuale URL suggerita va verificata."
                  : manuallyVerified
                    ? "Hai confermato questa relazione: resta modificabile dal dettaglio task."
                    : "La pagina proviene dai dati query–pagina dell’importazione API."}
              </p>
            </div>
          </div>
        )}
        {form.kind === "search" && form.sourceUrl && (
          <label className="check-row">
            <input
              type="checkbox"
              checked={form.associationStatus === "verified-manual"}
              onChange={(event) =>
                setForm({
                  ...form,
                  associationStatus: event.target.checked
                    ? "verified-manual"
                    : "suggested",
                })
              }
            />
            <span>Ho verificato manualmente che questa query appartiene alla pagina indicata</span>
          </label>
        )}
        <label>
          Titolo
          <input
            value={form.title}
            onChange={(event) =>
              setForm({ ...form, title: event.target.value })
            }
            required
          />
        </label>
        {clients.length > 1 && (
          <label>
            Progetto
            <select
              value={form.sourceClientId || ""}
              onChange={(event) => {
                const sourceClientId = Number(event.target.value);
                const selected = clients.find((item) => item.id === sourceClientId);
                setForm({
                  ...form,
                  id:
                    form.sourceClientId === sourceClientId
                      ? form.id
                      : newId("manual"),
                  sourceClientId,
                  client: selected?.name || form.client,
                  kind: "manual",
                  detachedFromAutomation: true,
                  sourceUrl: "",
                  targetUrl: selected?.url || "",
                  associationStatus: "manual",
                  query: "",
                  metrics: undefined,
                });
              }}
            >
              {clients.map((item) => (
                <option key={item.id} value={item.id}>{item.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="form-row">
          <label>
            Priorità
            <select
              value={form.priority}
              onChange={(event) =>
                setForm({ ...form, priority: event.target.value })
              }
            >
              <option>Alta</option>
              <option>Media</option>
              <option>Bassa</option>
            </select>
          </label>
          <label>
            Stato
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value })
              }
            >
              <option>Da fare</option>
              <option>In corso</option>
              <option>In revisione</option>
              <option>Completato</option>
            </select>
          </label>
          <label>
            Scadenza
            <input
              type="date"
              value={/^\d{4}-/.test(form.due || "") ? form.due : ""}
              onChange={(event) =>
                setForm({ ...form, due: event.target.value })
              }
            />
          </label>
        </div>
        <label>
          Pagina da correggere o verificare
          <input
            type="url"
            value={form.sourceUrl || ""}
            onChange={(event) =>
              setForm({ ...form, sourceUrl: event.target.value })
            }
          />
          {form.sourceUrl && (
            <a
              className="inline-resource"
              href={form.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink />
              Apri la pagina
            </a>
          )}
        </label>
        <label>
          Destinazione o risorsa collegata
          <input
            type="url"
            value={form.targetUrl || ""}
            onChange={(event) =>
              setForm({ ...form, targetUrl: event.target.value })
            }
          />
        </label>
        <label>
          Problema, evidenze e istruzioni
          <textarea
            className="task-instructions"
            value={form.detail || ""}
            onChange={(event) =>
              setForm({ ...form, detail: event.target.value })
            }
          />
        </label>
        <label>
          Note operative
          <textarea
            value={form.notes || ""}
            onChange={(event) =>
              setForm({ ...form, notes: event.target.value })
            }
            placeholder="Annota cosa è stato modificato e la data…"
          />
        </label>
        <div className="modal-actions">
          {taskWorkflowTarget(form) && onContinueTask && (
            <button type="button" className="secondary" onClick={() => onContinueTask(form)}>
              <ExternalLink /> {taskWorkflowTarget(form).label}
            </button>
          )}
          {remove && (
            <button
              type="button"
              className="secondary danger-text"
              onClick={remove}
            >
              <Trash2 />
              Elimina
            </button>
          )}
          <button className="primary">Salva task</button>
        </div>
      </form>
    </Modal>
  );
}



function EmptyTitle({ title, text, action, onAction }) {
  return (
    <div className="page-title">
      <div>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action && (
        <button className="primary" onClick={onAction}>
          <Plus />
          {action}
        </button>
      )}
    </div>
  );
}

function ClientsPage({
  clients,
  setClients,
  gscData,
  wordpressConnections = {},
  onNavigate,
  onOpenClient,
  onDeleteClient,
  onDownloadReport,
  onUpdateClient,
}) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", url: "" });
  const [formError, setFormError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Tutti");
  const add = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormError("Inserisci un nome cliente valido.");
    if (!form.url) return;
    let normalizedUrl;
    try { normalizedUrl = normalizeProjectUrl(form.url); }
    catch { return setFormError("Inserisci un indirizzo web valido."); }
    if (clients.some((client) => client.id !== editingId && projectIdentity(client.url) === projectIdentity(normalizedUrl))) return setFormError("Esiste già un progetto associato a questo sito o sottocartella.");
    if (editingId) {
      onUpdateClient(editingId, { name: form.name.trim(), url: normalizedUrl });
      setEditingId(null); setOpen(false); setForm({ name: "", url: "" }); setFormError(""); return;
    }
    setClients([...clients, { id: Math.max(0, ...clients.map((client) => Number(client.id) || 0)) + 1, ...form, name: form.name.trim(), url: normalizedUrl, score: 0, sites: 1, color: "#2477ee" }]);
    setOpen(false); setForm({ name: "", url: "" }); setFormError("");
  };
  const openClient = (event, id) => {
    if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    event.preventDefault(); onOpenClient(id);
  };
  const configured = clients.filter((client) => Boolean(gscData[client.id]) || Boolean(wordpressConnections[client.id])).length;
  const priority = clients.filter((client) => Number(client.score || 0) > 0 && Number(client.score) < 65).length;
  const filtered = clients.filter((client) => {
    const matchesQuery = `${client.name} ${client.url}`.toLowerCase().includes(query.trim().toLowerCase());
    if (!matchesQuery) return false;
    if (filter === "Attivi") return Boolean(gscData[client.id]) || Boolean(wordpressConnections[client.id]);
    if (filter === "Da collegare") return !gscData[client.id] || !wordpressConnections[client.id];
    if (filter === "Prioritari") return Number(client.score || 0) > 0 && Number(client.score) < 65;
    return true;
  });
  return (
    <div className="reference-clients-page">
      <section className="reference-clients-head">
        <div><span>Bentornato 👋</span><h1>Clienti</h1><p>Gestisci clienti, siti e stato SEO in un’unica vista.</p></div>
        <div className="reference-clients-tools"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca cliente o dominio…" /></label><button className="primary" onClick={() => setOpen(true)}><Plus /> Nuovo cliente</button></div>
      </section>
      <section className="reference-client-kpis">
        <article><Users /><span><small>Clienti totali</small><strong>{clients.length}</strong><em>Progetti nel workspace</em></span></article>
        <article><Link2 /><span><small>Siti collegati</small><strong>{configured}</strong><em>Almeno una integrazione attiva</em></span></article>
        <article><Settings /><span><small>Da configurare</small><strong>{Math.max(0, clients.length - configured)}</strong><em>In attesa di setup</em></span></article>
        <article><AlertTriangle /><span><small>Priorità alta</small><strong>{priority}</strong><em>Score sotto 65</em></span></article>
      </section>
      <section className="reference-client-filterbar">
        <div>{["Tutti", "Attivi", "Da collegare", "Prioritari"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>)}</div>
        <span>{filtered.length} progetti</span>
      </section>
      <div className="reference-clients-layout">
        <section className="reference-client-grid">
          {filtered.map((c) => {
            const dataset = gscData[c.id];
            const wpConnected = Boolean(wordpressConnections[c.id]);
            const score = Number(c.score || 0) || null;
            return <article className="reference-client-card client-card" key={c.id} role="button" tabIndex={0} aria-label={`Apri progetto ${c.name}`} onClick={(event) => { if (!event.target.closest("a,button")) openClient(event, c.id); }} onKeyDown={(event) => { if (event.target === event.currentTarget) openClient(event, c.id); }}>
              <header><div className="reference-client-mark" style={{ background: c.color || "#edf4ff" }}>{c.name.slice(0, 2).toUpperCase()}</div><div><h2>{c.name}</h2><a href={c.url} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>{c.url.replace(/^https?:\/\//, "")} <ExternalLink /></a></div><div className={`reference-client-score ${score && score < 65 ? "low" : score && score >= 80 ? "high" : ""}`}><small>SEO Score</small><strong>{score ?? "—"}<span>{score ? "/100" : ""}</span></strong></div></header>
              <div className="reference-client-status"><span><Globe2 /><small>WordPress</small><b className={wpConnected ? "ok" : "pending"}>{wpConnected ? "Connesso" : "Da collegare"}</b></span><span><Database /><small>Search Console</small><b className={dataset ? "ok" : "pending"}>{dataset ? "Connesso" : "Da collegare"}</b></span><span><CircleGauge /><small>Audit</small><b>{score ? "Disponibile" : "Da eseguire"}</b></span></div>
              <footer><span>{dataset ? `${dataset.queries.length} query importate` : "Dati Search Console non disponibili"}</span><div><button className="primary" onClick={(event) => openClient(event, c.id)}>Apri scheda →</button><button className="secondary mini" onClick={(event) => { event.stopPropagation(); onDownloadReport(c.id); }}><Download /></button><button className="secondary mini" data-client-action="edit" aria-label={`Modifica ${c.name}`} onClick={(event) => { event.stopPropagation(); setEditingId(c.id); setForm({ name: c.name, url: c.url }); setFormError(""); setOpen(true); }}>•••</button><button className="secondary mini danger-text" aria-label={`Elimina ${c.name}`} onClick={(event) => { event.stopPropagation(); onDeleteClient(c.id); }}><Trash2 /></button></div></footer>
            </article>;
          })}
        </section>
        <aside className="reference-clients-aside"><section><h2>Azioni rapide</h2><button onClick={() => onNavigate?.("Integrazioni")}><Database /><span><strong>Collega Search Console</strong><small>Importa dati e monitora il sito</small></span>›</button><button onClick={() => onNavigate?.("Integrazioni")}><Globe2 /><span><strong>Configura WordPress</strong><small>Collega e ottimizza il sito</small></span>›</button><button onClick={() => setOpen(true)}><Plus /><span><strong>Nuovo cliente</strong><small>Aggiungi un nuovo progetto</small></span>›</button></section><section className="reference-clients-tip"><Sparkles /><h2>Suggerimento</h2><p>Collega Search Console e WordPress per ottenere analisi più accurate e azioni verificabili.</p></section></aside>
      </div>
      {open && <Modal title={editingId ? "Modifica cliente" : "Nuovo cliente"} close={() => { setOpen(false); setEditingId(null); setForm({ name: "", url: "" }); setFormError(""); }}><form onSubmit={add} className="form"><label>Nome cliente<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Es. Studio Rossi" required /></label><label>Sito web<input type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" required /></label>{formError && <p className="error">{formError}</p>}<button className="primary" type="submit">{editingId ? "Salva modifiche" : "Crea cliente"}</button></form></Modal>}
    </div>
  );
}

function AuditPage({
  auditResult,
  setAuditResult,
  autoOpen = false,
  onCloseAuto,
  views,
  onSaveViews,
  initialUrl = "https://studiodentisticozirafa.com/",
}) {
  const [url, setUrl] = useState(initialUrl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const run = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setAuditResult(data);
      onCloseAuto?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const form = (
    <form className="audit-form" onSubmit={run}>
      <label>
        URL da analizzare
        <div>
          <Globe2 />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
          <button className="primary" disabled={loading}>
            {loading ? "Analisi…" : "Avvia audit"}
          </button>
        </div>
      </label>
      {error && <p className="error">{error}</p>}
    </form>
  );
  if (autoOpen)
    return (
      <Modal title="Nuova analisi SEO" close={onCloseAuto}>
        {form}
      </Modal>
    );
  return (
    <>
      <EmptyTitle
        title="Audit SEO"
        text="Controlla in tempo reale gli elementi essenziali di una pagina."
      />
      {form}
      {auditResult && <AuditResults data={auditResult} views={views} onSaveViews={onSaveViews} />}
    </>
  );
}

function AuditResults({ data, views, onSaveViews }) {
  const [savedViewId, setSavedViewId] = useState("");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState("");
  const issues = data.issues.filter(issue => (!severity || issue.severity === severity) && `${issue.label} ${issue.detail || ""} ${issue.url || ""}`.toLocaleLowerCase("it").includes(query.toLocaleLowerCase("it")));
  return (
    <div className="audit-results">
      <section className="score-panel">
        <div
          className="score-ring"
          style={{ "--score": `${data.score * 3.6}deg` }}
        >
          <span>
            {data.score}
            <small>/100</small>
          </span>
        </div>
        <div>
          <h2>Risultato dell’analisi</h2>
          <a href={data.url} target="_blank" rel="noreferrer">
            {data.url}
          </a>
          <p>
            {data.issues.length
              ? `${data.issues.length} elementi richiedono attenzione.`
              : "Nessun problema essenziale rilevato."}
          </p>
        </div>
      </section>
      <section className="panel audit-details">
        <h2>Controlli principali</h2>
        <dl>
          <div>
            <dt>Title</dt>
            <dd>
              {data.title || "Mancante"}{" "}
              <small>{data.titleLength} caratteri</small>
            </dd>
          </div>
          <div>
            <dt>Meta description</dt>
            <dd>
              {data.description || "Mancante"}{" "}
              <small>{data.descriptionLength} caratteri</small>
            </dd>
          </div>
          <div>
            <dt>H1</dt>
            <dd>{data.h1}</dd>
          </div>
          <div>
            <dt>Canonical</dt>
            <dd>{data.canonical || "Non rilevata"}</dd>
          </div>
          <div>
            <dt>Immagini</dt>
            <dd>
              {data.images} totali · {data.missingAlt} senza alt
            </dd>
          </div>
        </dl>
      </section>
      <section className="panel issues">
        <h2>Problemi rilevati</h2>
        <div className="feature-toolbar"><label>Cerca problemi<input value={query} onChange={event => { setSavedViewId(""); setQuery(event.target.value); }} /></label><label>Gravità<select value={severity} onChange={event => { setSavedViewId(""); setSeverity(event.target.value); }}><option value="">Tutte</option>{[...new Set(data.issues.map(issue => issue.severity))].map(value => <option key={value}>{value}</option>)}</select></label></div>
        {onSaveViews && <SavedViews savedViewId={savedViewId} onSelectView={setSavedViewId} label="audit" views={views} filters={{ query, severity }} onSave={onSaveViews} onApply={filters => { setQuery(typeof filters.query === "string" ? filters.query : ""); setSeverity(typeof filters.severity === "string" ? filters.severity : ""); }} />}
        {data.issues.length ? (
          issues.length ? issues.map((issue, i) => (
            <div key={i}>
              <span className={`priority ${issue.severity}`}>
                {issue.severity}
              </span>
              <strong>{issue.label}</strong>
            </div>
          )) : <p>Nessun problema corrisponde ai filtri selezionati.</p>
        ) : (
          <div className="success">
            <Check />
            Pagina conforme ai controlli essenziali
          </div>
        )}
      </section>
    </div>
  );
}

function Opportunities({ dataset, openIntegrations, onCreateTask, tasks, clientId, onOpenTask }) {
  const [tab, setTab] = useState("quickWins");
  const [query, setQuery] = useState("");
  const groups = opportunityGroups(dataset);
  const tabs = [
    ["quickWins", "Quick Wins"],
    ["lowCtr", "CTR basso"],
    ["losses", "In calo"],
    ["cannibalizations", "Cannibalizzazioni"],
  ];
  const unique = new Map();
  for (const [type, items] of Object.entries(groups)) {
    for (const row of items || []) {
      const text = String(row.dimension || row.query || "");
      unique.set(`${type}:${text.toLocaleLowerCase("it")}`, { type, row });
    }
  }
  const rows = (dataset ? groups[tab] : []).filter((row) => `${row.dimension || row.query || ""} ${(row.pages || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const activeTypes = Object.values(groups).filter((items) => items?.length).length;
  const quickWins = groups.quickWins || [];
  const totalTraffic = quickWins.reduce((sum,row) => sum + Number(row.clicks || 0), 0);
  const createOrOpen = (row, sourceTab = tab) => {
    const taskValues = opportunityTask(row, dataset, sourceTab);
    const existingTask = findExistingTask(tasks, taskValues, clientId);
    if (existingTask) onOpenTask(existingTask.id); else onCreateTask(taskValues);
  };
  return (
    <div className="reference-opportunities-page">
      <section className="reference-opportunities-head">
        <div className="reference-opportunities-title"><span><Target /></span><div><h1>Opportunità</h1><p>Scopri le opportunità di crescita ricavate dai dati reali Search Console.</p></div></div>
        <div className="reference-opportunities-actions"><button className="secondary" onClick={openIntegrations}>Search Console</button></div>
      </section>

      {!dataset && <button className="import-callout" onClick={openIntegrations}><Upload /> Importa i dati Search Console</button>}
      <section className="reference-opportunity-tabs">{tabs.map(([id,label]) => <button key={id} className={tab===id?"active":""} onClick={() => setTab(id)}>{label}<span>{dataset ? groups[id].length : "—"}</span></button>)}</section>

      <section className="reference-opportunity-kpis">
        <article className="green"><BarChart3 /><span><strong>{dataset ? unique.size : "—"}</strong><small>Opportunità rilevate</small><em>{activeTypes} categorie con dati</em></span></article>
        <article className="orange"><Sparkles /><span><strong>{dataset ? quickWins.length : "—"}</strong><small>Quick Wins</small><em>Query tra posizione 4–20</em></span></article>
        <article className="red"><AlertTriangle /><span><strong>{dataset ? groups.losses.length : "—"}</strong><small>In calo</small><em>Segnali da monitorare</em></span></article>
        <article className="blue"><Activity /><span><strong>{dataset ? formatInteger(totalTraffic) : "—"}</strong><small>Click dei Quick Wins</small><em>Valore osservato, non stimato</em></span></article>
      </section>

      <div className="reference-opportunity-layout">
        <section className="reference-opportunity-table panel">
          <div className="reference-opportunity-toolbar"><div><h2>Opportunità di crescita</h2><p>{dataset ? `${formatPeriodDate(dataset.dateFrom)} – ${formatPeriodDate(dataset.dateTo)}` : "Dati non disponibili"}</p></div><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca opportunità…" /></label></div>
          <div className="table-scroll"><table><caption className="sr-only">Opportunità SEO Search Console</caption><thead><tr><th>Opportunità</th><th>Pagina</th><th>Posizione</th><th>Impressioni</th><th>Priorità</th><th>Azione</th></tr></thead><tbody>{rows.length ? rows.map((row,index) => { const queryText=row.dimension || row.query; const taskValues=opportunityTask(row,dataset,tab); const existingTask=findExistingTask(tasks,taskValues,clientId); const position=Number(row.position || 0); const priority=position > 10 && position <= 20 ? "Alta" : position > 20 ? "Media" : "Alta"; return <tr key={`${queryText}-${index}`}><td><strong>{queryText}</strong>{row.pages?.length > 1 && <small className="block-note">{row.pages.length} URL competono</small>}</td><td>{taskValues.sourceUrl ? <a href={taskValues.sourceUrl} target="_blank" rel="noreferrer">{taskValues.sourceUrl.replace(/^https?:\/\/[^/]+/,"") || "/"}</a> : "Non disponibile"}</td><td>{position ? position.toFixed(2).replace(".",",") : "—"}</td><td>{formatInteger(row.impressions || 0)}</td><td><span className={`reference-opportunity-priority ${priority.toLowerCase()}`}>{priority}</span></td><td><button className="secondary mini" onClick={() => existingTask ? onOpenTask(existingTask.id) : onCreateTask(taskValues)}>{existingTask ? "Apri task" : "Crea task"}</button></td></tr>; }) : <tr><td colSpan="6" className="empty-row">{tab === "cannibalizations" && !dataset?.queryPages ? "Questo controllo richiede dati query–pagina: collega Search Console tramite API." : "Nessuna opportunità rilevata con questi criteri."}</td></tr>}</tbody></table></div>
        </section>

        <aside className="reference-opportunity-aside">
          <section><h2>Distribuzione per segnale</h2><div className="reference-opportunity-donut"><span><strong>{unique.size}</strong><small>segnali</small></span></div><ul>{tabs.map(([id,label],index) => <li key={id}><i className={`tone-${index}`} /><span>{label}</span><strong>{groups[id].length}</strong></li>)}</ul></section>
          <section><div className="reference-panel-title"><div><h2>Quick Wins</h2><p>Azioni rapide basate su query reali.</p></div></div>{quickWins.slice(0,5).map((row,index) => <button key={`${row.dimension}-${index}`} onClick={() => createOrOpen(row,"quickWins")}><Target /><span><strong>{row.dimension || row.query}</strong><small>Pos. {Number(row.position || 0).toFixed(1)} · {formatInteger(row.impressions || 0)} impressioni</small></span>›</button>)}{!quickWins.length && <p className="reference-empty-copy">Nessun Quick Win rilevato.</p>}</section>
        </aside>
      </div>
    </div>
  );
}

function TopicalMapPanel({
  dataset,
  existingContent,
  dataForSeo,
  topicalMap,
  onSave,
  onCreateTask,
  onNavigate,
  onUsage,
}) {
  const defaults = (dataset?.queries || [])
    .slice(0, 3)
    .map((row) => row.dimension)
    .join("\n");
  const [seeds, setSeeds] = useState(defaults);
  const [locationCode, setLocationCode] = useState(topicalMap?.locationCode || 2380);
  const [languageCode, setLanguageCode] = useState(topicalMap?.languageCode || "it");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generate = async (event) => {
    event.preventDefault();
    const seedList = seeds.split(/[\n,;]/).map(value => value.trim()).filter(Boolean);
    if (!seedList.length) {
      setError("Inserisci almeno un argomento valido.");
      return;
    }
    if (!dataForSeo.configured) return onNavigate("Integrazioni");
    if (
      !confirmAction(
        `DataForSEO applicherà un costo API per questa ricerca (massimo stimato $${Number(dataForSeo.maxLabsCost || 1).toFixed(2)}). Continuare?`,
      )
    )
      return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dataforseo/topical-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          seeds: seedList,
          existingKeywords: (dataset?.queries || []).map(
            (row) => row.dimension,
          ),
          existingContent,
          locationCode,
          languageCode,
          limit: 100,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Topical map non generata");
      if (data.monthlyCost != null) onUsage?.(data.monthlyCost);
      onSave(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const uncovered = (topicalMap?.ideas || []).filter((item) => !item.covered);
  return (
    <section className="panel topical-panel">
      <div className="panel-head">
        <div>
          <h2>Topical map e articoli mancanti</h2>
          <p>
            Espande gli argomenti principali con volumi DataForSEO e separa le
            keyword già coperte.
          </p>
        </div>
        {topicalMap && (
          <span className="cost-badge">
            Costo API: ${Number(topicalMap.cost || 0).toFixed(4)}
          </span>
        )}
      </div>
      <form className="topical-form" onSubmit={generate}>
        <label>
          Argomenti principali, uno per riga
          <textarea
            value={seeds}
            onChange={(event) => setSeeds(event.target.value)}
            placeholder="es. ortodonzia bergamo"
            required
          />
        </label>
        <div className="form-row two">
          <label>
            Codice località DataForSEO
            <input type="number" min="1" value={locationCode} onChange={(event) => setLocationCode(Number(event.target.value))} />
          </label>
          <label>
            Lingua
            <select value={languageCode} onChange={(event) => setLanguageCode(event.target.value)}>
              <option value="it">Italiano</option>
              <option value="en">English</option>
              <option value="de">Deutsch</option>
              <option value="fr">Français</option>
              <option value="es">Español</option>
            </select>
          </label>
        </div>
        <button className="primary" disabled={loading}>
          {loading
            ? "Creazione…"
            : dataForSeo.configured
              ? "Genera topical map"
              : "Configura DataForSEO"}
        </button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {topicalMap && (
        <>
          <div className="topical-summary">
            <span>
              <strong>{topicalMap.ideas?.length || 0}</strong>idee trovate
            </span>
            <span>
              <strong>{uncovered.length}</strong>argomenti da coprire
            </span>
            <span>
              <strong>
                {(topicalMap.ideas || []).filter((item) => item.covered).length}
              </strong>
              già presenti in GSC
            </span>
          </div>
          <div className="table-scroll topical-results">
            <table>
              <caption className="sr-only">Topical map e articoli suggeriti</caption>
              <thead>
                <tr>
                  <th>Cluster</th>
                  <th>Articolo suggerito</th>
                  <th>Intento</th>
                  <th>Volume</th>
                  <th>Trend</th>
                  <th>Copertura</th>
                  <th>Azione</th>
                </tr>
              </thead>
              <tbody>
                {(topicalMap.ideas || []).slice(0, 60).map((item) => (
                  <tr key={item.keyword}>
                    <td>{item.coreKeyword}</td>
                    <td>
                      <strong>{item.keyword}</strong>
                    </td>
                    <td>{item.intent}</td>
                    <td>{formatInteger(item.searchVolume)}</td>
                    <td>
                      {item.trend == null
                        ? "—"
                        : `${item.trend > 0 ? "+" : ""}${item.trend}%`}
                    </td>
                    <td>{item.covered ? "Già presente (da verificare)" : "Da coprire"}</td>
                    <td>
                      <button
                        className="secondary mini"
                        disabled={item.covered}
                        onClick={() =>
                          onCreateTask({
                            title: `Scrivi articolo: ${item.keyword}`,
                            detail: `Topical map: ${item.coreKeyword}\nIntento: ${item.intent}\nVolume mensile DataForSEO: ${item.searchVolume}\nObiettivo: coprire un argomento non presente nelle query Search Console.`,
                            priority:
                              item.searchVolume >= 100 ? "Alta" : "Media",
                          })
                        }
                      >
                        Crea task articolo
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function RankingsPage({
  client,
  dataset,
  dataForSeo,
  history,
  onSave,
  onCreateTask,
  onNavigate,
  onUsage,
}) {
  const suggested = (dataset?.queries || [])
    .slice(0, 8)
    .map((row) => row.dimension)
    .join("\n");
  const current = history?.[0];
  const previous = (history || []).slice(1).find(
    (item) =>
      item?.rankings?.some((ranking) => !ranking.error) &&
      item.device === current?.device &&
      item.depth === current?.depth &&
      item.locationCode === current?.locationCode &&
      item.languageCode === current?.languageCode,
  );
  const [keywords, setKeywords] = useState(suggested);
  const [depth, setDepth] = useState(20);
  const [device, setDevice] = useState("desktop");
  const [locationCode, setLocationCode] = useState(current?.locationCode || 2380);
  const [languageCode, setLanguageCode] = useState(current?.languageCode || "it");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const comparablePrevious = Boolean(
    current &&
      previous &&
      current.device === previous.device &&
      current.depth === previous.depth &&
      current.locationCode === previous.locationCode &&
      current.languageCode === previous.languageCode
  );
  const previousMap = new Map(
    (comparablePrevious ? previous.rankings || [] : []).map((item) => [
      String(item.keyword || "").toLocaleLowerCase("it"),
      item.position,
    ]),
  );
  const run = async (event) => {
    event.preventDefault();
    if (!dataForSeo.configured) return onNavigate("Integrazioni");
    const list = [
      ...new Set(
        keywords
          .split(/[\n,;]/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ].slice(0, 100);
    if (
      !list.length ||
      !confirmAction(
        `Controllare ${list.length} keyword fino alla posizione ${depth}? Costo massimo stimato: $${(list.length * Number(dataForSeo.maxSerpCost || 0.1)).toFixed(2)}.`,
      )
    )
      return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dataforseo/rankings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          domain: client.url,
          keywords: list,
          depth,
          device,
          locationCode,
          languageCode,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Controllo posizioni non riuscito");
      if (data.monthlyCost != null) onUsage?.(data.monthlyCost);
      onSave(data);
      if (data.partial)
        setError(
          `${data.errorCount} keyword non sono state verificate; i risultati riusciti sono stati salvati.`,
        );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  const [rankingView, setRankingView] = useState("all");
  const [rankingQuery, setRankingQuery] = useState("");
  const currentRankings = current?.rankings || [];
  const validRankings = currentRankings.filter((item) => !item.error && Number(item.position) > 0);
  const top3 = validRankings.filter((item) => Number(item.position) <= 3).length;
  const top10 = validRankings.filter((item) => Number(item.position) <= 10).length;
  const top100 = validRankings.filter((item) => Number(item.position) <= 100).length;
  const deltas = validRankings.map((item) => {
    const old = previousMap.get(String(item.keyword || "").toLocaleLowerCase("it"));
    return { ...item, delta: item.position && old ? old - item.position : null };
  });
  const growing = deltas.filter((item) => Number(item.delta) > 0).length;
  const declining = deltas.filter((item) => Number(item.delta) < 0).length;
  const visibleRankings = deltas.filter((item) => {
    const text = `${item.keyword || ""} ${item.url || ""}`.toLowerCase();
    if (!text.includes(rankingQuery.trim().toLowerCase())) return false;
    if (rankingView === "growth") return Number(item.delta) > 0;
    if (rankingView === "decline") return Number(item.delta) < 0;
    if (rankingView === "top10") return Number(item.position) <= 10;
    if (rankingView === "optimize") return Number(item.position) > 10;
    return true;
  });
  const trendRuns = (history || []).slice(0, 8).toReversed().map((runItem) => ({
    date: runItem.checkedAt,
    total: (runItem.rankings || []).filter((item) => !item.error && Number(item.position) > 0).length,
    top10: (runItem.rankings || []).filter((item) => !item.error && Number(item.position) > 0 && Number(item.position) <= 10).length,
    top3: (runItem.rankings || []).filter((item) => !item.error && Number(item.position) > 0 && Number(item.position) <= 3).length,
  }));
  const maxTrend = Math.max(1, ...trendRuns.map((item) => item.total));
  return (
    <div className="reference-rankings-page">
      <section className="reference-rankings-head">
        <div className="reference-rankings-title"><span><BarChart3 /></span><div><h1>Posizionamenti</h1><p>Monitora l’andamento delle keyword e scopri nuove opportunità di crescita.</p></div></div>
        <div className="reference-rankings-actions"><button className="secondary" onClick={() => onNavigate("Integrazioni")}>DataForSEO</button><button className="primary" onClick={() => document.getElementById("rankings-check-form")?.scrollIntoView({ behavior: "smooth" })}><RefreshCw /> Aggiorna posizioni</button></div>
      </section>

      <section className="reference-ranking-kpis">
        <article className="blue"><Target /><span><small>Keyword monitorate</small><strong>{currentRankings.length || "—"}</strong><em>{current ? "Ultimo controllo salvato" : "Nessun controllo"}</em></span></article>
        <article className="green"><Check /><span><small>In Top 3</small><strong>{current ? top3 : "—"}</strong><em>{current && currentRankings.length ? `${Math.round((top3/currentRankings.length)*100)}% delle keyword` : "—"}</em></span></article>
        <article className="orange"><CircleGauge /><span><small>In Top 10</small><strong>{current ? top10 : "—"}</strong><em>{current && currentRankings.length ? `${Math.round((top10/currentRankings.length)*100)}% delle keyword` : "—"}</em></span></article>
        <article className="purple"><BarChart3 /><span><small>In Top 100</small><strong>{current ? top100 : "—"}</strong><em>{current && currentRankings.length ? `${Math.round((top100/currentRankings.length)*100)}% delle keyword` : "—"}</em></span></article>
      </section>

      <section className="reference-rankings-overview">
        <article className="reference-ranking-trend"><div className="reference-panel-title"><div><h2>Andamento posizionamenti</h2><p>Dati reali delle ultime verifiche DataForSEO.</p></div><span>{trendRuns.length} controlli</span></div>{trendRuns.length ? <div className="reference-ranking-bars">{trendRuns.map((item, index) => <div key={`${item.date}-${index}`} title={`${item.top10} keyword Top 10 su ${item.total}`}><i style={{height:`${Math.max(8,(item.total/maxTrend)*100)}%`}} /><b style={{height:`${Math.max(5,(item.top10/maxTrend)*100)}%`}} /><small>{item.date ? new Date(item.date).toLocaleDateString("it-IT", {day:"2-digit",month:"short"}) : "—"}</small></div>)}</div> : <p className="reference-empty-copy">Esegui almeno un controllo per costruire il trend.</p>}</article>
        <article className="reference-ranking-distribution"><h2>Distribuzione posizioni</h2><div className="reference-ranking-ring" style={{"--top3":`${currentRankings.length ? (top3/currentRankings.length)*360 : 0}deg`,"--top10":`${currentRankings.length ? ((top10-top3)/currentRankings.length)*360 : 0}deg`}}><span><strong>{currentRankings.length || 0}</strong><small>keyword</small></span></div><ul><li><i className="green" /> Top 3 <strong>{top3}</strong></li><li><i className="blue" /> 4–10 <strong>{Math.max(0,top10-top3)}</strong></li><li><i className="purple" /> 11–100 <strong>{Math.max(0,top100-top10)}</strong></li><li><i className="gray" /> Oltre / non trovate <strong>{Math.max(0,currentRankings.length-top100)}</strong></li></ul></article>
      </section>

      <section className="reference-ranking-table panel">
        <div className="reference-ranking-toolbar"><div className="reference-ranking-tabs">{[["all","Tutte le keyword"],["growth",`In crescita (${growing})`],["decline",`In calo (${declining})`],["top10","Top 10"],["optimize","Da ottimizzare"]].map(([value,label]) => <button key={value} className={rankingView===value?"active":""} onClick={() => setRankingView(value)}>{label}</button>)}</div><label><Search /><input value={rankingQuery} onChange={(event) => setRankingQuery(event.target.value)} placeholder="Cerca keyword…" /></label></div>
        {current ? <div className="table-scroll"><table><caption className="sr-only">Posizionamenti keyword</caption><thead><tr><th>Keyword</th><th>Posizione</th><th>Var.</th><th>URL</th><th>Ultimo aggiornamento</th><th>Azioni</th></tr></thead><tbody>{visibleRankings.map((item) => <tr key={item.keyword}><td><strong>{item.keyword}</strong></td><td><strong>{item.position || `>${current.depth}`}</strong></td><td className={item.delta > 0 ? "green" : item.delta < 0 ? "red" : ""}>{item.delta == null ? "—" : `${item.delta > 0 ? "+" : ""}${item.delta}`}</td><td>{item.url ? <a href={item.url} target="_blank" rel="noreferrer">{item.url.replace(/^https?:\/\/[^/]+/,"") || "/"}</a> : "Non trovata"}</td><td>{current.checkedAt ? new Date(current.checkedAt).toLocaleString("it-IT") : "—"}</td><td><button className="secondary mini" onClick={() => onCreateTask({ title:`Migliora posizione: ${item.keyword}`, sourceUrl:item.url, detail:`Posizione DataForSEO: ${item.position || `oltre ${current.depth}`}\nDispositivo: ${current.device}\nLocalità: ${current.locationCode}\nVerificata: ${current.checkedAt}`, priority:!item.position || item.position > 20 ? "Alta" : "Media" })}>Analizza</button></td></tr>)}{!visibleRankings.length && <tr><td colSpan="6" className="empty-row">Nessuna keyword per questo filtro.</td></tr>}</tbody></table></div> : <p className="reference-empty-copy">Nessun controllo posizioni salvato. Configura DataForSEO e avvia il primo controllo.</p>}
      </section>

      <details className="reference-ranking-config" id="rankings-check-form"><summary>Configura e avvia un nuovo controllo DataForSEO</summary><form className="panel ranking-form" onSubmit={run}><label>Keyword, una per riga<textarea value={keywords} onChange={(event) => setKeywords(event.target.value)} required /></label><div className="form-row two"><label>Profondità<select value={depth} onChange={(event) => setDepth(Number(event.target.value))}><option value="10">Top 10</option><option value="20">Top 20</option><option value="50">Top 50</option><option value="100">Top 100</option></select></label><label>Dispositivo<select value={device} onChange={(event) => setDevice(event.target.value)}><option value="desktop">Desktop</option><option value="mobile">Mobile</option></select></label></div><div className="form-row two"><label>Codice località DataForSEO<input type="number" min="1" value={locationCode} onChange={(event) => setLocationCode(Number(event.target.value))} /></label><label>Lingua<select value={languageCode} onChange={(event) => setLanguageCode(event.target.value)}><option value="it">Italiano</option><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="es">Español</option></select></label></div><div className="integration-note"><AlertTriangle /> Ogni keyword genera una richiesta a pagamento. Un controllo più profondo può costare di più.</div><button className="primary" disabled={loading}>{loading ? "Controllo…" : dataForSeo.configured ? "Controlla posizioni" : "Configura DataForSEO"}</button>{error && <p className="error" role="alert">{error}</p>}</form></details>
    </div>
  );

}

function ContentPage({
  dataset,
  analysis,
  client,
  onCreateTask,
  requireApproval,
  wordpressConnection,
  onNavigate,
  dataForSeo,
  topicalMap,
  onSaveTopicalMap,
  draft,
  onSaveDraft,
  editorialSchedule,
  onSaveSchedule,
  onDataForSeoUsage,
  workflowContext,
  onWorkflowComplete,
}) {
  const editorRef = useRef(null);
  const topicalItems = (topicalMap?.ideas || [])
    .filter((item) => !item.covered)
    .slice(0, 12)
    .map((item, index) => ({
      id: `topical-${item.keyword}`,
      type: "Nuovo articolo",
      title: item.keyword,
      reason: `Volume ${item.searchVolume} · intento ${item.intent}`,
      url: "",
      association: "Argomento mancante secondo DataForSEO",
      objective: `Coprire il cluster ${item.coreKeyword}`,
      format: "Articolo editoriale",
      slot: `Settimana ${Math.floor(index / 3) + 1}`,
      priority: item.searchVolume >= 100 ? "Alta" : "Media",
    }));
  const basePlan = contentPlan(dataset, analysis);
  const topicalQuota = Math.min(4, topicalItems.length);
  const initialPlan = [
    ...basePlan.slice(0, 12 - topicalQuota),
    ...topicalItems.slice(0, topicalQuota),
  ]
    .map((item, index) => ({
      ...item,
      slot: `Settimana ${Math.floor(index / 3) + 1}`,
    }));
  const [topic, setTopic] = useState(
    draft?.topic || workflowContext?.query || workflowContext?.title || initialPlan[0]?.title || "",
  );
  const [type, setType] = useState(draft?.type || "brief");
  const [content, setContent] = useState(draft?.content || "");
  const [loading, setLoading] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [publishResult, setPublishResult] = useState("");
  const [publishLink, setPublishLink] = useState("");
  const [wordpressResource, setWordpressResource] = useState("posts");
  const [copyResult, setCopyResult] = useState("");
  const [generatedDemo, setGeneratedDemo] = useState(Boolean(draft?.demo));
  useEffect(() => {
    const timer = window.setTimeout(
      () =>
        onSaveDraft({
          topic,
          type,
          content,
          demo: generatedDemo,
          updatedAt: new Date().toISOString(),
        }),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [topic, type, content, generatedDemo, onSaveDraft]);
  const plan = initialPlan.map((item) => {
    if (item.url) return item;
    const suggestion = suggestPageForQuery(item.title, dataset?.pages || []);
    return {
      ...item,
      url: suggestion?.url || "",
      association: suggestion
        ? "URL suggerito da verificare"
        : item.association,
    };
  });
  const generate = async (event) => {
    event.preventDefault();
    if (!topic.trim()) {
      setGenerationError("Inserisci un argomento prima di generare il contenuto.");
      return;
    }
    setLoading(true);
    setGenerationError("");
    setPublishResult("");
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          topic,
          type,
          context: JSON.stringify({
            progetto: client.name,
            sito: client.url,
            taskOrigine: workflowContext ? { id: workflowContext.taskId, titolo: workflowContext.title, query: workflowContext.query, pagina: workflowContext.sourceUrl, destinazione: workflowContext.targetUrl } : null,
            querySearchConsole: (dataset?.queries || []).slice(0, 20).map((row) => ({
              query: row.dimension,
              clic: row.clicks,
              impressioni: row.impressions,
              ctr: row.ctr,
              posizione: row.position,
            })),
            pagine: (dataset?.pages || []).slice(0, 12).map((row) => row.dimension || row.url),
            problemiAudit: (analysis?.issues || []).slice(0, 15).map((issue) => ({
              problema: issue.label,
              url: issue.url,
              dettaglio: issue.detail,
            })),
            topicalGap: (topicalMap?.ideas || [])
              .filter((item) => !item.covered)
              .slice(0, 12)
              .map((item) => item.keyword),
            regola: "Usa soltanto queste evidenze; segnala i dati mancanti e non inventare fatti.",
          }),
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Generazione non riuscita");
      if (!String(data.content || "").trim())
        throw new Error("OpenAI non ha restituito contenuto utilizzabile.");
      setGeneratedDemo(Boolean(data.demo));
      setContent(data.content);
    } catch (error) {
      setGenerationError(error.message);
    } finally {
      setLoading(false);
    }
  };
  const publishDraft = async () => {
    if (!content.trim())
      return setPublishResult("Genera o incolla prima un contenuto.");
    if (generatedDemo)
      return setPublishResult(
        "Il contenuto è dimostrativo: configura OpenAI o sostituiscilo con un testo revisionato prima dell’invio.",
      );
    if (!wordpressConnection) return onNavigate("Integrazioni");
    if (
      !wordpressConnection.verifiedAt ||
      Date.now() - Date.parse(wordpressConnection.verifiedAt) > 30 * 60_000
    ) {
      setPublishLink("");
      setPublishResult(
        "La verifica WordPress è scaduta. Verifica nuovamente la connessione nelle Integrazioni.",
      );
      return;
    }
    if (
      requireApproval &&
      !confirmAction(
        "Creare una bozza su WordPress? Il contenuto NON verrà pubblicato.",
      )
    )
      return;
    setPublishLink("");
    setPublishResult("Invio in corso…");
    try {
      const response = await fetch("/api/wordpress/draft", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...wordpressConnection,
          title: topic || "Bozza seoGrow AI",
          content,
          resource: wordpressResource,
          confirmed: true,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Creazione bozza non riuscita");
      const editLink = data.editLink || data.link || "";
      setPublishResult(`Bozza WordPress creata (ID ${data.id}).`);
      setPublishLink(editLink);
      if (workflowContext?.taskId) onWorkflowComplete?.(workflowContext.taskId, "Bozza WordPress creata e verificata dal workflow editoriale", { result: `WordPress draft ${data.id}`, url: editLink });
    } catch (error) {
      setPublishLink("");
      setPublishResult(`Errore WordPress: ${error.message}`);
    }
  };
  const prepare = (item) => {
    setTopic(item.title);
    setType(
      item.type === "Ottimizza snippet" ? "meta description" : "brief",
    );
    editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const scheduledCount = Object.values(editorialSchedule || {}).filter(Boolean).length;
  const hasDraft = Boolean(content.trim());
  return (
    <div className="reference-editorial-page">
      <section className="reference-editorial-head">
        <div className="reference-editorial-title"><span><FileText /></span><div><h1>Piano editoriale</h1><p>Pianifica, crea e monitora i contenuti di {client.name}.</p></div></div>
        <div className="reference-editorial-actions"><button className="secondary" disabled={!plan.length} onClick={() => downloadCsv(plan, `piano-editoriale-${client.name}.csv`)}><Download /> Esporta piano</button><button className="primary" onClick={() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><Plus /> Nuovo contenuto</button></div>
      </section>
      <section className="reference-editorial-kpis">
        <article className="blue"><FileText /><span><strong>{plan.length}</strong><small>Attività pianificate</small><em>Dati reali del piano</em></span></article>
        <article className="green"><Check /><span><strong>{scheduledCount}</strong><small>Con scadenza</small><em>Calendario editoriale</em></span></article>
        <article className="orange"><Clock3 /><span><strong>{hasDraft ? 1 : 0}</strong><small>Bozza corrente</small><em>{hasDraft ? `${content.trim().split(/\s+/).length} parole` : "Nessuna bozza"}</em></span></article>
        <article className="purple"><Target /><span><strong>{topicalItems.length}</strong><small>Idee topical</small><em>Da dati disponibili</em></span></article>
      </section>
      <div className="reference-editorial-tabs"><span className="active">Calendario</span><span>Lista</span><span>Idee keyword</span><span>Cluster tematici</span><span>Analisi competitor</span></div>
      <EditorialCalendar plan={plan} saved={editorialSchedule} onSave={onSaveSchedule} clientId={client.id} />
      <TopicalMapPanel
        dataset={dataset}
        existingContent={(analysis?.pages || []).flatMap((page) => [
          page.url,
          page.title,
        ]).filter(Boolean)}
        dataForSeo={dataForSeo}
        topicalMap={topicalMap}
        onSave={onSaveTopicalMap}
        onCreateTask={onCreateTask}
        onNavigate={onNavigate}
        onUsage={onDataForSeoUsage}
      />
      <div className="workflow-strip">
        <span>
          <b>1</b>Scegli un’attività
        </span>
        <span>
          <b>2</b>Genera o scrivi la bozza
        </span>
        <span>
          <b>3</b>Revisiona
        </span>
        <span>
          <b>4</b>Invia a WordPress come bozza
        </span>
      </div>
      <section className="panel planner">
        <div className="panel-head">
          <div>
            <h2>Piano editoriale suggerito</h2>
            <p>
              Le associazioni non certe sono indicate esplicitamente e vanno
              verificate.
            </p>
          </div>
          <button
            className="secondary small-button"
            disabled={!plan.length}
            onClick={() =>
              downloadCsv(plan, `piano-editoriale-${client.name}.csv`)
            }
          >
            <Download />
            Esporta CSV
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <caption className="sr-only">Piano editoriale del progetto</caption>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Intervento</th>
                <th>Argomento</th>
                <th>Obiettivo</th>
                <th>Pagina</th>
                <th>Priorità</th>
                <th>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {plan.length ? (
                plan.map((item, index) => (
                  <tr key={`${item.id}-${index}`}>
                    <td>{item.slot}</td>
                    <td>
                      {item.type}
                      <small className="block-note">{item.format}</small>
                    </td>
                    <td>
                      <strong>{item.title}</strong>
                      <small className="block-note">{item.reason}</small>
                    </td>
                    <td>{item.objective}</td>
                    <td>
                      {item.url ? (
                        <a
                          className="task-link"
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink />
                          Apri URL
                        </a>
                      ) : (
                        <span className="task-detail">Da associare</span>
                      )}
                      <small className="block-note">{item.association}</small>
                    </td>
                    <td>
                      <span
                        className={`priority ${item.priority.toLowerCase()}`}
                      >
                        {item.priority}
                      </span>
                    </td>
                    <td>
                      <div className="plan-actions">
                        <button
                          className="secondary mini"
                          onClick={() => prepare(item)}
                        >
                          Prepara bozza
                        </button>
                        <button
                          className="secondary mini"
                          onClick={() =>
                            onCreateTask({
                              title: `${item.type}: ${item.title}`,
                              sourceUrl: item.url,
                              targetUrl: "",
                              detail: `${item.reason}\nObiettivo: ${item.objective}\nAssociazione: ${item.association}`,
                              priority: item.priority,
                            })
                          }
                        >
                          Crea task
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="empty-row">
                    Importa Search Console o avvia una nuova analisi per
                    generare il piano editoriale.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <div className="content-layout">
        <form className="panel generator" onSubmit={generate}>
          <div className="generator-title">
            <WandSparkles />
            <div>
              <h2>Prepara contenuto</h2>
              <p>Puoi partire da una voce del piano o inserire un argomento.</p>
            </div>
          </div>
          <label>
            Formato
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="brief">Brief SEO</option>
              <option value="articolo">Articolo</option>
              <option value="meta description">Metadati</option>
            </select>
          </label>
          <label>
            Argomento
            <input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              required
              placeholder="Es. gnatologo Bergamo"
            />
          </label>
          <button className="primary" disabled={loading}>
            <Sparkles />
            {loading ? "Generazione…" : "Genera contenuto"}
          </button>
          {generationError && (
            <p className="error" role="alert">{generationError}</p>
          )}
        </form>
        <section className="panel editor" ref={editorRef} tabIndex="-1">
          <div className="panel-head">
            <div>
              <h2>Bozza da revisionare</h2>
              <p>
                Salvataggio automatico locale ·{" "}
                {content.trim()
                  ? `${content.trim().split(/\s+/).length} parole`
                  : "bozza vuota"}
              </p>
            </div>
            {content && (
              <button
                className="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(content);
                    setCopyResult("Copiato");
                  } catch {
                    setCopyResult("Copia non riuscita");
                  }
                  window.setTimeout(() => setCopyResult(""), 1800);
                }}
              >
                {copyResult || "Copia"}
              </button>
            )}
          </div>
          <textarea
            aria-label="Bozza da revisionare"
            value={content}
            onChange={(event) => {
              setContent(event.target.value);
              if (generatedDemo) setGeneratedDemo(false);
            }}
            placeholder="Il contenuto generato o incollato apparirà qui…"
          />
          {generatedDemo && (
            <p className="error" role="alert">
              Questa è una bozza dimostrativa: configura OpenAI oppure modificala
              manualmente prima dell’invio a WordPress.
            </p>
          )}
          <div
            className={`wordpress-send ${wordpressConnection ? "connected" : ""}`}
          >
            <div>
              <strong>
                {wordpressConnection
                  ? `WordPress verificato: ${wordpressConnection.name || wordpressConnection.username}`
                  : "WordPress non ancora verificato"}
              </strong>
              <small>
                {wordpressConnection
                  ? "Credenziali mantenute solo durante questa sessione. L’invio crea sempre una bozza."
                  : "Vai in Integrazioni, verifica URL, utente e password applicativa, poi torna qui."}
              </small>
            </div>
            {wordpressConnection ? (
              <div className="api-actions">
                <label>
                  Tipo bozza
                  <select value={wordpressResource} onChange={(event) => setWordpressResource(event.target.value)}>
                    <option value="posts">Articolo</option>
                    <option
                      value="pages"
                      disabled={wordpressConnection?.canCreatePages === false}
                    >
                      Pagina
                    </option>
                  </select>
                </label>
                <button
                  className="primary"
                  type="button"
                  disabled={!content.trim() || generatedDemo}
                  onClick={publishDraft}
                >
                  Invia come bozza
                </button>
              </div>
            ) : (
              <button
                className="secondary"
                type="button"
                onClick={() => onNavigate("Integrazioni")}
              >
                Configura WordPress
              </button>
            )}
          </div>
          {publishResult && (
            <p
              className={
                publishResult.startsWith("Errore")
                  ? "error"
                  : "integration-result"
              }
            >
              {publishResult}
              {publishLink && (
                <>
                  {" "}
                  ·{" "}
                  <a href={publishLink} target="_blank" rel="noreferrer">
                    Apri e modifica in WordPress
                  </a>
                </>
              )}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Integrations({
  selectedClient,
  dataset,
  history,
  onGscImport,
  wordpressConnection,
  wordpressProfile,
  onWordPressVerified,
  onNavigate,
  dataForSeo,
  aiConfigured,
  aiStatus = {},
  onDataForSeoStatus,
}) {
  const [wp, setWp] = useState(
    () =>
      getWordPressSession(selectedClient.id, selectedClient.url) || {
        url: wordpressProfile?.url || selectedClient.url,
        username: wordpressProfile?.username || "",
        applicationPassword: "",
      },
  );
  const [result, setResult] = useState(() =>
    getWordPressSession(selectedClient.id, selectedClient.url)
      ? `Connessione attiva come ${getWordPressSession(selectedClient.id, selectedClient.url)?.name || getWordPressSession(selectedClient.id, selectedClient.url)?.username}.`
      : "",
  );
  const [importStatus, setImportStatus] = useState("");
  const [importing, setImporting] = useState(false);
  const [google, setGoogle] = useState({
    configured: false,
    connected: false,
    properties: [],
  });
  const [property, setProperty] = useState("");
  const [dfsResult, setDfsResult] = useState("");
  const [integrationBusy, setIntegrationBusy] = useState("");
  useEffect(() => {
    fetch("/api/google/status")
      .then((response) => response.json())
      .then(status => setGoogle(current => mergeGoogleStatus(current, status)))
      .catch(() => {});
  }, []);
  const loadProperties = async () => {
    setImportStatus("Lettura proprietà Google…");
    try {
      const response = await fetch("/api/google/properties");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Lettura non riuscita");
      const properties = normalizeGoogleProperties(data.properties);
      setGoogle((current) => ({ ...current, configured: true, connected: true, properties }));
      setProperty(current => properties.some(item => item.url === current) ? current : "");
      setImportStatus(`${properties.length} proprietà disponibili. Seleziona il sito nell’elenco qui sopra prima di importare.`);
    } catch (error) {
      setImportStatus(`Errore Google: ${error.message}`);
    }
  };
  const disconnectGoogle = async () => {
    if (
      !confirmAction(
        "Scollegare Google Search Console e cancellare il token locale?",
      )
    )
      return;
    setIntegrationBusy("google-disconnect");
    try {
      const response = await fetch("/api/google/connection", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Disconnessione non riuscita");
      setGoogle((current) => ({ ...current, connected: false, properties: [] }));
      setProperty("");
      setImportStatus("Google scollegata e token locale eliminato.");
    } catch (error) {
      setImportStatus(`Errore Google: ${error.message}`);
    } finally {
      setIntegrationBusy("");
    }
  };
  const testDataForSeo = async () => {
    setDfsResult("Verifica credenziali…");
    setIntegrationBusy("dataforseo-test");
    try {
      const response = await fetch("/api/dataforseo/test", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Verifica non riuscita");
      setDfsResult(`Connessione verificata${data.login ? ` per ${data.login}` : ""}.`);
      onDataForSeoStatus((current) => ({ ...current, configured: true, verified: true }));
    } catch (error) {
      setDfsResult(`Errore: ${error.message}`);
    } finally {
      setIntegrationBusy("");
    }
  };
  const importApi = async () => {
    if (!property) return;
    setImporting(true);
    setImportStatus("Importazione diretta da Google…");
    try {
      const response = await fetch("/api/google/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ property }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Importazione non riuscita");
      const assigned = await onGscImport(data);
      setImportStatus(`Dati API importati e abbinati a ${assigned.clientName}.`);
    } catch (error) {
      setImportStatus(`Errore Google: ${error.message}`);
    } finally {
      setImporting(false);
    }
  };
  const test = async (event) => {
    event.preventDefault();
    setResult("Verifica in corso…");
    setIntegrationBusy("wordpress-test");
    try {
      const response = await fetch("/api/wordpress/test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(wp),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Connessione non riuscita");
      onWordPressVerified({
        ...wp,
        name: data.name,
        site: data.site,
        canCreatePosts: data.canCreatePosts,
        canCreatePages: data.canCreatePages,
        verifiedAt: new Date().toISOString(),
      });
      setResult(
        `Connessione verificata come ${data.name}. Ora puoi inviare bozze dal Piano editoriale.`,
      );
    } catch (error) {
      setResult(`Errore: ${error.message}`);
    } finally {
      setIntegrationBusy("");
    }
  };
  const importFile = async (event) => {
    const files = [...(event.target.files || [])];
    if (!files.length) return;
    setImporting(true);
    setImportStatus(
      files.length === 1
        ? "Lettura dell’esportazione…"
        : `Lettura di ${files.length} esportazioni…`,
    );
    try {
      const assignments = [];
      const failures = [];
      for (const file of files) {
        try {
          const data = await importGscZip(file);
          assignments.push({ data, assignment: await onGscImport(data) });
        } catch (error) {
          failures.push(`${file.name}: ${error.message}`);
        }
      }
      const successText = assignments.length
        ? `${assignments.length} importazioni completate: ${assignments.map((item) => item.assignment.clientName).join(", ")}.`
        : "Nessuna importazione completata.";
      setImportStatus(
        failures.length
          ? `${successText} Errori: ${failures.join(" | ")}`
          : successText,
      );
    } catch (error) {
      setImportStatus(`Errore: ${error.message}`);
    } finally {
      setImporting(false);
      event.target.value = "";
    }
  };
  const activeIntegrations = [Boolean(dataset || google.connected), Boolean(wordpressConnection), Boolean(dataForSeo.configured), Boolean(aiConfigured)].filter(Boolean).length;
  return (
    <div className="reference-integrations-page">
      <section className="reference-integrations-head">
        <div className="reference-integrations-title"><span><Plug /></span><div><h1>Integrazioni</h1><p>Collega gli strumenti di {selectedClient.name} per analizzare, monitorare e automatizzare la crescita SEO.</p></div></div>
        <div className="reference-integrations-badge"><strong>{activeIntegrations}</strong><span>integrazioni attive</span></div>
      </section>
      <nav className="reference-integrations-tabs" aria-label="Categorie integrazioni"><span className="active">Tutte</span><span>SEO & Analytics</span><span>AI & Contenuti</span><span>Siti Web</span><span>Produttività</span></nav>
      <section className="reference-integrations-summary"><div><ShieldCheck /><span><strong>Stato integrazioni</strong><small>{activeIntegrations} provider configurati o collegati</small></span></div><div><Database /><span><strong>Credenziali protette</strong><small>Le chiavi non vengono mostrate nell’interfaccia</small></span></div><div><RefreshCw /><span><strong>Verifica reale</strong><small>Usa i test di connessione già presenti nelle card</small></span></div></section>
      <div className="integration-grid reference-integration-grid">
        <section className="panel integration gsc-integration">
          <div className="integration-head">
            <div className="google-mark">G</div>
            <div>
              <h2>Google Search Console</h2>
              <p>ZIP manuali oppure collegamento API automatico.</p>
            </div>
          </div>
          {dataset ? (
            <div className="gsc-summary">
              <span>
                <strong>{formatInteger(dataset.totals.clicks)}</strong>Clic
              </span>
              <span>
                <strong>{formatInteger(dataset.totals.impressions)}</strong>
                Impressioni
              </span>
              <span>
                <strong>{dataset.queries.length}</strong>Query
              </span>
              <span>
                <strong>{history?.length || 1}</strong>Importazioni
              </span>
            </div>
          ) : (
            <div className="integration-note">
              <Upload />
              Importa lo ZIP oppure configura Google nel file .env.
            </div>
          )}
          <label
            className={`secondary upload-button ${importing ? "disabled" : ""}`}
          >
            <Upload />
            Importa uno o più ZIP
            <input
              data-testid="gsc-file"
              type="file"
              accept=".zip,application/zip"
              multiple
              onChange={importFile}
              disabled={importing}
            />
          </label>
          <details className="google-oauth-help">
            <summary>Configurazione Google e errore redirect_uri_mismatch</summary>
            <p>Client ID e Client Secret OAuth vanno nelle variabili GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET del file .env nella cartella SeoGrow. Dopo averli modificati, riavvia l’app.</p>
            <p>Nel client OAuth di Google Cloud, aggiungi questo valore agli URI di reindirizzamento autorizzati, esattamente come mostrato:</p>
            {typeof google.redirectUri === "string" ? <input aria-label="URI di reindirizzamento Google" readOnly value={google.redirectUri} onFocus={event => event.target.select()} /> : <p>Indirizzo non disponibile: verifica che l’API locale sia avviata e riapri Integrazioni.</p>}
            <p>Non inserire qui email, password Google o Client Secret. Per autorizzare l’accesso usa il pulsante Collega account Google.</p>
          </details>
          <div className="api-actions">
            {!google.configured ? (
              <div className="integration-note">
                <AlertTriangle />
                Per il collegamento diretto inserisci GOOGLE_CLIENT_ID e
                GOOGLE_CLIENT_SECRET nel file .env.
              </div>
            ) : !google.connected ? (
              <>
                <a
                  className="secondary button-link"
                  href="/api/google/auth"
                  target="_blank"
                  rel="noreferrer"
                >
                  Collega account Google
                </a>
                <button className="secondary" onClick={loadProperties}>
                  <RefreshCw />
                  Ho autorizzato: aggiorna
                </button>
              </>
            ) : google.properties?.length ? (
              <>
                <label className="google-property-picker">
                  Proprietà Search Console ({google.properties.length})
                  <select
                    aria-label="Proprietà Search Console"
                    size={Math.min(7, google.properties.length + 1)}
                    value={property}
                    onChange={(event) => setProperty(event.target.value)}
                  >
                    <option value="" disabled>Seleziona la proprietà del sito…</option>
                    {google.properties.map((item) => (
                      <option key={item.url} value={item.url}>{item.url}</option>
                    ))}
                  </select>
                  <small>Scorri l’elenco per vedere tutti i siti disponibili.</small>
                </label>
                <button
                  className="primary"
                  onClick={importApi}
                  disabled={importing || !property}
                >
                  Importa ora via API
                </button>
                <button
                  className="secondary danger-text"
                  onClick={disconnectGoogle}
                  disabled={integrationBusy === "google-disconnect"}
                >
                  Scollega Google
                </button>
              </>
            ) : (
              <button className="secondary" onClick={loadProperties}>
                <RefreshCw />
                Carica proprietà Google
              </button>
            )}
          </div>
          {importStatus && (
            <p
              className={
                importStatus.includes("importat") &&
                importStatus.includes("abbinat")
                  ? "import-success"
                  : "integration-result"
              }
            >
              {importStatus}
            </p>
          )}
          {dataset && (
            <small className="import-meta">
              Periodo: {formatPeriodDate(dataset.dateFrom)} –{" "}
              {formatPeriodDate(dataset.dateTo)} · Importato{" "}
              {new Date(dataset.importedAt).toLocaleString("it-IT")}
            </small>
          )}
          {dataset?.truncated && (
            <p className="error">
              Importazione parziale: raggiunto il limite di{" "}
              {formatInteger(dataset.maximumRows || dataset.rowCount)} righe.
            </p>
          )}
        </section>
        <form
          className="panel integration wordpress-integration"
          onSubmit={test}
        >
          <div className="integration-head">
            <div className="wp-mark">W</div>
            <div>
              <h2>WordPress</h2>
              <p>
                Verifica il collegamento e abilita l’invio sicuro delle bozze.
              </p>
            </div>
          </div>
          <ol className="integration-steps">
            <li>Crea in WordPress una password applicativa per l’utente.</li>
            <li>Inserisci qui URL, nome utente e password applicativa.</li>
            <li>Verifica e passa al Piano editoriale per creare la bozza.</li>
          </ol>
          <label>
            URL sito
            <input
              type="url"
              value={wp.url}
              onChange={(event) => setWp({ ...wp, url: event.target.value })}
              required
            />
          </label>
          <label>
            Nome utente
            <input
              value={wp.username}
              onChange={(event) =>
                setWp({ ...wp, username: event.target.value })
              }
              required
              autoComplete="username"
            />
          </label>
          <label>
            Password applicativa
            <input
              type="password"
              value={wp.applicationPassword}
              onChange={(event) =>
                setWp({ ...wp, applicationPassword: event.target.value })
              }
              required
              autoComplete="current-password"
            />
          </label>
          <div className="integration-note">
            <Check />
            La password non viene salvata nel browser: resta in memoria solo
            finché l’app è aperta.
          </div>
          <button className="secondary" disabled={integrationBusy === "wordpress-test"}>
            {integrationBusy === "wordpress-test" ? "Verifica…" : "Verifica connessione"}
          </button>
          {result && (
            <p
              className={
                result.startsWith("Errore") ? "error" : "integration-result"
              }
            >
              {result}
            </p>
          )}
          {wordpressConnection && (
            <button
              className="primary"
              type="button"
              onClick={() => onNavigate("Piano editoriale")}
            >
              Vai al Piano editoriale
            </button>
          )}
        </form>
        <section className="panel integration">
          <div className="integration-head">
            <div className="dfs-mark">
              <BarChart3 />
            </div>
            <div>
              <h2>DataForSEO</h2>
              <p>Posizionamenti reali e ricerca per la topical map.</p>
            </div>
          </div>
          <div
            className={`integration-note ${dataForSeo.configured ? "configured-note" : ""}`}
          >
            {dataForSeo.configured ? <Check /> : <AlertTriangle />}
            {dataForSeo.verified
              ? "Credenziali verificate."
              : dataForSeo.configured
                ? "Credenziali presenti ma non ancora verificate."
                : "Inserisci DATAFORSEO_LOGIN e DATAFORSEO_PASSWORD nel file .env e riavvia l’app."}
          </div>
          <small className="settings-help">
            Le chiamate di posizionamento sono a pagamento e protette da un
            limite orario. Spesa del mese: ${Number(dataForSeo.monthlyCost || 0).toFixed(4)}
            {dataForSeo.monthlyBudget
              ? ` su $${Number(dataForSeo.monthlyBudget).toFixed(2)}`
              : ""}.
          </small>
          {dataForSeo.configured && (
            <div className="api-actions">
              <button className="secondary" onClick={testDataForSeo} disabled={integrationBusy === "dataforseo-test"}>
                Verifica credenziali
              </button>
              <button
                className="secondary"
                onClick={() => onNavigate("Posizionamenti")}
              >
                Apri posizionamenti
              </button>
            </div>
          )}
          {dfsResult && (
            <p
              className={
                dfsResult.startsWith("Errore") ? "error" : "integration-result"
              }
            >
              {dfsResult}
            </p>
          )}
        </section>
        <section className="panel integration">
          <div className="integration-head">
            <div className="ai-mark">
              <Sparkles />
            </div>
            <div>
              <h2>OpenAI</h2>
              <p>Generazione protetta tramite API lato server.</p>
            </div>
          </div>
          <div
            className={`integration-note ${aiConfigured ? "configured-note" : ""}`}
          >
            {aiConfigured ? <Check /> : <AlertTriangle />}
            {aiConfigured
              ? "Chiave configurata. I contenuti vengono generati con OpenAI."
              : "Chiave non configurata: viene usato soltanto il brief dimostrativo."}
          </div>
          {aiConfigured && (
            <small className="settings-help">
              Modello: {aiStatus.model || "configurato"}. Spesa stimata del mese: ${Number(aiStatus.monthlyCost || 0).toFixed(4)}
              {aiStatus.monthlyBudget
                ? ` su $${Number(aiStatus.monthlyBudget).toFixed(2)}`
                : ""}.
            </small>
          )}
        </section>
      </div>
      <section className="reference-integrations-safe"><ShieldCheck /><div><h2>I tuoi dati sono al sicuro</h2><p>Le credenziali sensibili restano nei flussi protetti già esistenti. SeoGrow non mostra API key complete in questa pagina.</p></div></section>
    </div>
  );
}

function SiteAnalysisModal({
  client,
  previousAnalysis,
  onComplete,
  close,
  openTasks,
}) {
  const [url, setUrl] = useState(client.url);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(previousAnalysis || null);
  const [maxPages, setMaxPages] = useState(75);
  const [progressId, setProgressId] = useState("");
  const requestRef = useRef(null);
  useEffect(() => () => requestRef.current?.abort(), []);
  const run = async (event) => {
    event.preventDefault();
    if (requestRef.current) return;
    setLoading(true);
    setError("");
    const controller = new AbortController();
    requestRef.current = controller;
    const nextProgressId = crypto.randomUUID();
    setProgressId(nextProgressId);
    try {
      const response = await fetch("/api/site-analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url, maxPages, progressId: nextProgressId }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setResult(data);
      onComplete(data);
    } catch (analysisError) {
      if (analysisError.message !== "Richiesta annullata.")
        setError(analysisError.message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };
  return (
    <Modal title={`Nuova analisi — ${client.name}`} close={close}>
      <p className="analysis-last-run">Ultima analisi completata: {Number.isFinite(Date.parse(result?.analyzedAt || result?.startedAt)) ? new Date(result.analyzedAt || result.startedAt).toLocaleString("it-IT") : "nessuna data disponibile"}</p>
      {loading && <AnalysisProgress key={progressId} progressId={progressId} />}
      <form className="site-analysis-form" onSubmit={run}>
        <label>
          Indirizzo iniziale
          <input
            type="url"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            required
          />
        </label>
        <label>
          Numero massimo di pagine
          <select
            value={maxPages}
            onChange={(event) => setMaxPages(Number(event.target.value))}
          >
            <option value="25">25 — controllo rapido</option>
            <option value="75">75 — consigliato</option>
            <option value="150">150 — approfondito</option>
            <option value="200">200 — massimo locale</option>
          </select>
        </label>
        <p>
          Controlla metadati, H1, canonical, noindex, immagini, contenuti brevi,
          velocità di risposta, profondità, duplicati, sitemap e link interni.
        </p>
        <button className="primary" disabled={loading}>
          {loading ? "Analisi in corso…" : "Analizza il sito"}
        </button>
        {loading && (
          <button
            type="button"
            className="secondary"
            onClick={() => requestRef.current?.abort()}
          >
            Annulla analisi
          </button>
        )}
        {error && <p className="error">{error}</p>}
      </form>
      {result && (
        <div className="analysis-summary four">
          <div>
            <strong>{result.score ?? "—"}</strong>
            <span>Punteggio SEO</span>
          </div>
          <div>
            <strong>{result.pagesChecked}</strong>
            <span>Pagine controllate</span>
          </div>
          <div>
            <strong>{result.linksChecked}</strong>
            <span>Link controllati</span>
          </div>
          <div>
            <strong>
              {Array.isArray(result.issues)
                ? result.issues.length
                : Array.isArray(result.brokenLinks)
                  ? result.brokenLinks.length
                  : 0}
            </strong>
            <span>Problemi verificati</span>
          </div>
        </div>
      )}
      {result && (
        <div className="analysis-results">
          <h3>Risultati verificati</h3>
          {result.issues?.length ? (
            result.issues.slice(0, 12).map((issue, index) => (
              <div key={`${issue.type}-${issue.url}-${index}`}>
                <span className={`priority ${issue.severity}`}>
                  {issue.severity}
                </span>
                <a
                  href={issue.targetUrl || issue.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {issue.label}
                </a>
                <small>
                  {issue.url}
                  {issue.detail ? ` · ${issue.detail}` : ""}
                </small>
              </div>
            ))
          ) : (
            <p className="success">
              <Check />
              Nessun problema tecnico tra quelli controllati.
            </p>
          )}
          <button className="secondary" onClick={openTasks}>
            Apri i task del progetto
          </button>
        </div>
      )}
    </Modal>
  );
}

function SettingsPage({
  clients,
  selectedClient,
  tasks,
  gscData,
  gscHistory,
  analyses,
  rankings,
  topicalMaps,
  geoData,
  contentDrafts,
  wordpressProfiles,
  auditResults,
  agentRuns,
  problemClosures,
  snapshots,
  preferences,
  setPreferences,
  onCreateSnapshot,
  onRestoreSnapshot,
  onRestore,
}) {
  const [saved, setSaved] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [backupPassword, setBackupPassword] = useState("");
  const importBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const backup = await readWorkspaceBackup(file, backupPassword);
      if (
        !confirmAction(
          "Importare questo backup? I dati locali attuali verranno sostituiti.",
        )
      )
        return;
      await onRestore(backup);
      setBackupPassword("");
      setBackupMessage(
        `Backup del ${new Date(backup.exportedAt).toLocaleString("it-IT")} ripristinato.`,
      );
    } catch (backupError) {
      setBackupMessage(backupError.message);
    } finally {
      event.target.value = "";
    }
  };
  const savePreferences = (event) => {
    event.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };
  const wordpressConfigured = Boolean(wordpressProfiles?.[selectedClient]);
  return (
    <div className="reference-settings-page">
      <section className="reference-settings-head">
        <div className="reference-settings-title"><span><Settings /></span><div><h1>Impostazioni</h1><p>Personalizza SeoGrow AI, le automazioni e la protezione dei dati locali.</p></div></div>
        <button className="primary" type="button" onClick={() => document.querySelector('.settings-form button.primary')?.click()}><Check /> Salva modifiche</button>
      </section>
      <nav className="reference-settings-tabs" aria-label="Sezioni impostazioni"><span className="active">Generali</span><span>SEO</span><span>AI & Modelli</span><span>WordPress</span><span>Notifiche</span><span>Aspetto</span><span>Privacy</span></nav>
      <section className="reference-settings-summary">
        <div><Users /><span><strong>Profilo locale</strong><small>{preferences.name || "Amministratore"}</small></span></div>
        <div><Globe2 /><span><strong>WordPress</strong><small>{wordpressConfigured ? "Profilo configurato" : "Da configurare"}</small></span></div>
        <div><Bell /><span><strong>Notifiche</strong><small>{preferences.notifications ? "Attive" : "Disattivate"}</small></span></div>
        <div><Database /><span><strong>Copie locali</strong><small>{snapshots.length} disponibili</small></span></div>
      </section>
      <div className="settings-layout reference-settings-layout">
        <form className="panel settings-form" onSubmit={savePreferences}>
          <h2>Preferenze e automazioni</h2>
          <label>
            Nome visualizzato
            <input
              value={preferences.name}
              onChange={(event) =>
                setPreferences({ ...preferences, name: event.target.value })
              }
            />
          </label>
          <label>
            Controllo automatico mentre l’app è aperta
            <select
              value={preferences.refreshHours}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  refreshHours: Number(event.target.value),
                })
              }
            >
              <option value="0">Disattivato</option>
              <option value="6">Ogni 6 ore</option>
              <option value="12">Ogni 12 ore</option>
              <option value="24">Ogni giorno</option>
            </select>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={preferences.approveWordPress}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  approveWordPress: event.target.checked,
                })
              }
            />
            <span>
              Richiedi sempre approvazione prima di inviare a WordPress
            </span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={preferences.notifications}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  notifications: event.target.checked,
                })
              }
            />
            <span>Avvisa per cali, nuovi errori e task scadute</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={preferences.autoBackup}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  autoBackup: event.target.checked,
                })
              }
            />
            <span>Crea una copia locale prima di importazioni e analisi</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={preferences.saveDrafts !== false}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  saveDrafts: event.target.checked,
                })
              }
            />
            <span>Salva le bozze editoriali nel browser locale</span>
          </label>
          <p className="settings-help">
            Disattiva questa opzione se le bozze contengono informazioni
            riservate: il testo resterà solo nella scheda aperta.
          </p>
          <button className="primary">
            {saved ? (
              <>
                <Check />
                Salvato
              </>
            ) : (
              "Conferma preferenze"
            )}
          </button>
          <p className="settings-help">
            Le automazioni locali funzionano quando seoGrow AI e il Terminale
            sono aperti. Per esecuzioni a computer spento servirà una versione
            cloud.
          </p>
        </form>
        <section className="panel backup-panel">
          <h2>Backup completo</h2>
          <p>
            Esporta clienti, storico Search Console, task e analisi in un unico
            file cifrato.
          </p>
          <label>
            Password del backup
            <input
              type="password"
              value={backupPassword}
              minLength="10"
              autoComplete="new-password"
              onChange={(event) => setBackupPassword(event.target.value)}
              placeholder="Almeno 10 caratteri"
            />
          </label>
          <button
            className="secondary"
            onClick={async () => {
              try {
                await exportWorkspaceBackup(
                  {
                    clients,
                    selectedClient,
                    tasks,
                    gscData,
                    gscHistory,
                    analyses,
                    rankings,
                    topicalMaps,
                    geoData,
                    contentDrafts,
                    wordpressProfiles,
                    auditResults,
                    agentRuns,
                    problemClosures,
                    auditMonitor: readAuditMonitor(),
                    preferences,
                  },
                  backupPassword,
                );
                setBackupPassword("");
                setBackupMessage("Backup cifrato esportato correttamente.");
              } catch (error) {
                setBackupMessage(error.message);
              }
            }}
          >
            <Download />
            Esporta backup
          </button>
          <label className="secondary upload-button">
            <Upload />
            Importa backup
            <input
              data-testid="backup-file"
              type="file"
              accept="application/json,.json"
              onChange={importBackup}
            />
          </label>
          <button className="secondary" onClick={onCreateSnapshot}>
            <RefreshCw />
            Crea copia locale ora
          </button>
          {backupMessage && (
            <p className="integration-result">{backupMessage}</p>
          )}
        </section>
        <section className="panel backup-panel snapshot-panel">
          <h2>Copie locali recenti</h2>
          <p>
            Vengono conservate al massimo due copie nel browser per ridurre
            l’uso di spazio.
          </p>
          {snapshots.length ? (
            snapshots.map((snapshot) => (
              <div className="snapshot-row" key={snapshot.id}>
                <span>
                  <strong>
                    {new Date(snapshot.createdAt).toLocaleString("it-IT")}
                  </strong>
                  <small>{snapshot.reason}</small>
                </span>
                <button
                  className="secondary mini"
                  onClick={() => onRestoreSnapshot(snapshot.id)}
                >
                  Ripristina
                </button>
              </div>
            ))
          ) : (
            <p className="empty-copy">Nessuna copia locale.</p>
          )}
        </section>
      </div>
      <section className="reference-settings-note"><ShieldCheck /><div><h2>Privacy e dati</h2><p>I backup cifrati, le copie locali e le preferenze continuano a usare i meccanismi di sicurezza già presenti nell’app.</p></div></section>
    </div>
  );
}

function Modal({ title, close, children }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(close);
  useEffect(() => {
    closeRef.current = close;
  }, [close]);
  useEffect(() => {
    const previous = document.activeElement;
    const fn = (event) => {
      if (event.key === "Escape") closeRef.current();
      if (event.key === "Tab") {
        const focusable = [
          ...(dialogRef.current?.querySelectorAll(
            "button, input, select, textarea, a[href]",
          ) || []),
        ].filter(
          (element) =>
            !element.disabled &&
            element.getAttribute("aria-hidden") !== "true" &&
            element.getClientRects().length > 0,
        );
        if (!focusable.length) return;
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", fn);
    dialogRef.current
      ?.querySelector("input, select, textarea, button")
      ?.focus();
    return () => {
      window.removeEventListener("keydown", fn);
      previous?.focus?.();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <div
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal-head">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-btn"
            aria-label="Chiudi finestra"
            onClick={close}
          >
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Toast({ message, kind = "info", onOpen, onClose }) {
  useEffect(() => {
    if (onOpen || kind !== "success") return undefined;
    const timer = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(timer);
  }, [onClose, onOpen, kind]);
  return (
    <div className={`toast toast-${kind}`}>
      {kind === "error" ? <AlertTriangle aria-hidden="true" /> : kind === "success" ? <Check aria-hidden="true" /> : <HelpCircle aria-hidden="true" />}
      <span role={kind === "error" ? "alert" : "status"}>{message}</span>
      {onOpen && <button onClick={onOpen}>Apri task</button>}
      <button className="icon-btn" aria-label="Chiudi" onClick={onClose}>
        <X />
      </button>
    </div>
  );
}

export default function App() {
  useEffect(() => {
    const flushOnPageHide = () => {
      void flushWorkspace().catch((error) => {
        console.error("Impossibile completare il salvataggio workspace in uscita:", error);
        window.dispatchEvent(new CustomEvent("seogrow-storage-error", { detail: { key: "workspace", message: error.message } }));
      });
    };
    window.addEventListener("pagehide", flushOnPageHide);
    return () => window.removeEventListener("pagehide", flushOnPageHide);
  }, []);
  const [clients, setClients] = useStoredState(
    "seogrow-clients",
    initialClients,
  );
  const [tasks, setTasks] = useStoredState("seogrow-tasks-v2", () => {
    try {
      const previous = JSON.parse(localStorage.getItem("seogrow-tasks")) || [];
      const datasets = JSON.parse(localStorage.getItem("seogrow-gsc-v1")) || {};
      const savedClients =
        JSON.parse(localStorage.getItem("seogrow-clients")) || initialClients;
      return previous
        .filter(
          (task) => typeof task.id === "string" && task.id.startsWith("gsc-"),
        )
        .map((task) => {
          const dataset = datasets[task.sourceClientId];
          const query = task.title.match(/[“"](.+?)[”"]/)?.[1] || "";
          const suggestion = suggestPageForQuery(query, dataset?.pages || []);
          const clientUrl =
            savedClients.find((client) => client.id === task.sourceClientId)
              ?.url || "";
          return {
            ...task,
            targetUrl: suggestion?.url || clientUrl,
            linkLabel: suggestion ? "Pagina suggerita" : "Apri il sito",
          };
        });
    } catch {
      return [];
    }
  });
  const tasksRef = useRef(tasks);
  useLayoutEffect(() => { tasksRef.current = tasks; }, [tasks]);
  const [taskUndo, setTaskUndo] = useState(null);
  const [undoError, setUndoError] = useState("");
  const changeTasks = update => {
    const before = tasksRef.current;
    const next = typeof update === "function" ? update(before) : update;
    const changes = taskChange(before, next);
    tasksRef.current = next;
    if (changes.length) { setTaskUndo(changes); setUndoError(""); setTasks(next); }
  };
  const undoTasks = () => {
    try { const next = undoTaskChange(tasksRef.current, taskUndo); tasksRef.current = next; setTasks(next); setTaskUndo(null); setUndoError(""); }
    catch (error) { setUndoError(error.message); }
  };
  const [gscData, setGscData] = useStoredState("seogrow-gsc-v1", {});
  const [gscHistory, setGscHistory] = useStoredState(
    "seogrow-gsc-history-v1",
    () => {
      try {
        const existing =
          JSON.parse(localStorage.getItem("seogrow-gsc-v1")) || {};
        return Object.fromEntries(
          Object.entries(existing).map(([id, data]) => [id, [data]]),
        );
      } catch {
        return {};
      }
    },
  );
  const [analyses, setAnalyses] = useStoredState("seogrow-analyses-v2", () => {
    try {
      const existing =
        JSON.parse(localStorage.getItem("seogrow-analyses-v1")) || {};
      return Object.fromEntries(
        Object.entries(existing).map(([id, data]) => [
          id,
          normalizeAnalysisHistory(data),
        ]),
      );
    } catch {
      return {};
    }
  });
  const [snapshots, setSnapshots] = useStoredState("seogrow-snapshots-v1", []);
  const [rankings, setRankings] = useStoredState("seogrow-rankings-v1", {});
  const [topicalMaps, setTopicalMaps] = useStoredState(
    "seogrow-topical-maps-v1",
    {},
  );
  const [geoData, setGeoData] = useStoredState("seogrow-geo-v1", {});
  const [contentDrafts, setContentDrafts] = useStoredState(
    "seogrow-content-drafts-v1",
    {},
  );
  const [agentRuns, setAgentRuns] = useStoredState("seogrow-agent-runs-v1", {});
  const [problemClosures, setProblemClosures] = useStoredState("seogrow-problem-closures-v1", []);
  useEffect(() => {
    const migrated = closuresFromAgentRuns(agentRuns, problemClosures);
    if (JSON.stringify(migrated) !== JSON.stringify(problemClosures)) setProblemClosures(migrated);
  }, [agentRuns, problemClosures, setProblemClosures]);

  const [wordpressProfiles, setWordpressProfiles] = useStoredState(
    "seogrow-wordpress-profiles-v1",
    {},
  );
  const [preferences, setPreferences] = useStoredState(
    "seogrow-preferences-v1",
    {
      name: "Amministratore",
      refreshHours: 0,
      approveWordPress: true,
      notifications: true,
      autoBackup: true,
      saveDrafts: true,
    },
  );
  const [selectedClient, setSelectedClient] = useStoredState(
    "seogrow-selected-client-v1",
    clients[0]?.id || 1,
  );
  const [page, setPage] = useStoredState(
    "seogrow-selected-page-v1",
    "Panoramica",
  );
  useEffect(() => {
    const fromHash = () => {
      try {
        const requested = decodeURIComponent(window.location.hash.slice(1));
        setPage(nav.some(([label]) => label === requested) || ["Problemi", "Correzioni"].includes(requested) ? requested : "Panoramica");
      } catch {
        setPage("Panoramica");
      }
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [setPage]);
  useEffect(() => {
    const nextHash = `#${encodeURIComponent(page)}`;
    if (window.location.hash !== nextHash)
      window.history.pushState(null, "", nextHash);
  }, [page]);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    const closeMenu = () => setMenuOpen(false);
    window.addEventListener("hashchange", closeMenu);
    window.addEventListener("seogrow-locationchange", closeMenu);
    return () => {
      window.removeEventListener("hashchange", closeMenu);
      window.removeEventListener("seogrow-locationchange", closeMenu);
    };
  }, []);
  const [query, setQuery] = useState("");
  const [quickAudit, setQuickAudit] = useState(false);
  const [auditResults, setAuditResults] = useStoredState("seogrow-quick-audits-v1", {});
  const [wordpressConnections, setWordpressConnections] = useState({});
  const [dataForSeo, setDataForSeo] = useState({ configured: false });
  const [apiStatus, setApiStatus] = useState({ aiConfigured: false });
  const [storageError, setStorageError] = useState("");
  const [toast, setToast] = useState("");
  const [requestedTask, setRequestedTask] = useState(null);
  const [taskWorkflowContextState, setTaskWorkflowContextState] = useState(() => consumeTaskWorkflowContext(localStorage));
  const handleGscImportRef = useRef(null);
  const clientsRef = useRef(clients);
  const storageErrorKeyRef = useRef("");
  const automaticRefreshRef = useRef(null);
  useEffect(() => {
    clientsRef.current = clients;
  }, [clients]);
  const selectedClientRecord =
    clients.find((client) => client.id === selectedClient) || clients[0];
  useEffect(() => {
    if (clients.length && !clients.some((client) => client.id === selectedClient))
      setSelectedClient(clients[0].id);
  }, [clients, selectedClient, setSelectedClient]);
  const selectedHistory =
    gscHistory[selectedClient] ||
    (gscData[selectedClient] ? [gscData[selectedClient]] : []);
  const selectedDataset = selectedHistory[0] || gscData[selectedClient];
  const selectedDatasetWithChanges = selectedDataset
    ? {
        ...selectedDataset,
        changes: queryChanges(selectedDataset, selectedHistory[1]),
      }
    : null;
  const selectedAnalysisHistory = normalizeAnalysisHistory(
    analyses[selectedClient],
  );
  const selectedAnalysis = latestOf(selectedAnalysisHistory);
  useEffect(() => {
    Promise.allSettled([
      fetch("/api/health").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "API non disponibile");
        return data;
      }),
      fetch("/api/dataforseo/status").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Stato DataForSEO non disponibile");
        return data;
      }),
      fetch("/api/openai/status").then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Stato OpenAI non disponibile");
        return data;
      }),
    ]).then(([healthResult, dataForSeoResult, openAiResult]) => {
        const data = healthResult.status === "fulfilled" ? healthResult.value : { aiConfigured: false };
        const dfs = dataForSeoResult.status === "fulfilled" ? dataForSeoResult.value : {};
        setApiStatus({
          ...data,
          ...(openAiResult.status === "fulfilled" ? openAiResult.value : {}),
          aiConfigured: Boolean(
            openAiResult.status === "fulfilled"
              ? openAiResult.value.configured
              : data.aiConfigured,
          ),
        });
        setDataForSeo((current) => ({
          ...current,
          configured: Boolean(dfs.configured ?? data.dataForSeoConfigured),
          monthlyCost: dfs.monthlyCost,
          monthlyBudget: dfs.monthlyBudget,
          maxSerpCost: dfs.maxSerpCost,
          maxLabsCost: dfs.maxLabsCost,
        }));
      });
  }, []);
  useEffect(() => {
    const listener = (event) => {
      storageErrorKeyRef.current = event.detail?.key || "dati";
      setStorageError(
        `Spazio locale esaurito: ${event.detail?.key || "dati"} non salvati. Esporta un backup e riduci lo storico.`,
      );
    };
    window.addEventListener("seogrow-storage-error", listener);
    const clear = (event) => {
      if (event.detail?.key === storageErrorKeyRef.current) {
        storageErrorKeyRef.current = "";
        setStorageError("");
      }
    };
    window.addEventListener("seogrow-storage-ok", clear);
    return () => {
      window.removeEventListener("seogrow-storage-error", listener);
      window.removeEventListener("seogrow-storage-ok", clear);
    };
  }, []);
  const saveContentDraft = useCallback(
    (draft) =>
      setContentDrafts((current) => {
        if (preferences.saveDrafts !== false)
          return { ...current, [selectedClient]: draft };
        if (!(selectedClient in current)) return current;
        const next = { ...current };
        delete next[selectedClient];
        return next;
      }),
    [preferences.saveDrafts, selectedClient, setContentDrafts],
  );
  useEffect(() => {
    setTasks((current) => {
      let changed = false;
      const migrated = current.map((task) => {
        if (
          task.kind !== "search" ||
          (task.detail &&
            !task.detail.includes("Associazione suggerita dal percorso URL"))
        )
          return task;
        const dataset = gscData[task.sourceClientId];
        const queryText =
          task.query || task.title.match(/[“"](.+?)[”"]/)?.[1] || "";
        const row = dataset?.queries?.find(
          (item) => item.dimension === queryText,
        );
        if (!row) return task;
        const exact =
          dataset.queryPages?.find(
            (item) => (item.dimension || item.query) === queryText,
          )?.pages?.[0] || "";
        const pageUrl =
          exact ||
          suggestPageForQuery(queryText, dataset.pages || [])?.url ||
          "";
        changed = true;
        return {
          ...task,
          query: queryText,
          sourceUrl: pageUrl,
          targetUrl: "",
          associationStatus: exact ? "verified" : "suggested",
          metrics: {
            clicks: row.clicks,
            impressions: row.impressions,
            ctr: row.ctr,
            position: row.position,
          },
          detail: queryTaskDetail(row, pageUrl, Boolean(exact)),
        };
      });
      return changed ? migrated : current;
    });
  }, [gscData, setTasks]);
  useEffect(() => {
    const today = new Date();
    const iso = (date) => date.toISOString().slice(0, 10);
    setTasks((current) => {
      let changed = false;
      const normalized = current.map((task) => {
        if (!task.due || /^\d{4}-\d{2}-\d{2}$/.test(task.due)) return task;
        changed = true;
        if (task.due === "Oggi") return { ...task, due: iso(today) };
        if (task.due === "Domani") {
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          return { ...task, due: iso(tomorrow) };
        }
        return { ...task, due: "" };
      });
      return changed ? normalized : current;
    });
  }, [setTasks]);
  const createSnapshot = async (reason = "Copia manuale") => {
    try {
    await flushWorkspace();
    const corrections = await listCorrections();
    setSnapshots((current) =>
      [
        {
          id: newId("snapshot"),
          createdAt: new Date().toISOString(),
          reason,
          data: {
            corrections,
            pageAuditHistory: JSON.parse(localStorage.getItem("seogrow-page-audit-history-v2") || "{}"),
            clients,
            tasks,
            gscData,
            gscHistory,
            analyses,
            rankings,
            topicalMaps,
            geoData,
            contentDrafts,
            wordpressProfiles,
            auditResults,
            agentRuns,
            problemClosures,
            auditMonitor: readAuditMonitor(),
            preferences,
          },
        },
        ...current,
      ].slice(0, 2),
    );
    return true;
    } catch (error) { setToast({ kind: "error", message: `Copia locale non creata: ${error.message}` }); return false; }
  };
  const handleGscImport = async (data) => {
    const propertyHost = data.property?.host || "";
    const currentClients = clientsRef.current;
    const exactPropertyClient = data.property?.url
      ? currentClients.find((client) => client.gscProperty === data.property.url)
      : null;
    const hostClients = propertyHost
      ? currentClients.filter(
          (client) => normalizeSiteHost(client.url) === propertyHost,
        )
      : [];
    if (!exactPropertyClient && hostClients.length > 1)
      throw new Error(
        `Più progetti usano ${propertyHost}. Collega Search Console via API oppure assegna prima la proprietà esatta al progetto corretto.`,
      );
    if (data.property?.confirmed === false) {
      if (!hostClients.length)
        throw new Error(
          `Il dominio ${propertyHost || "dello ZIP"} è stato dedotto soltanto dal nome del file. Rinomina lo ZIP con il dominio corretto oppure importalo nel progetto corrispondente.`,
        );
      if (
        !confirmAction(
          `Il dominio ${propertyHost} è stato dedotto dal nome dello ZIP, non dai dati interni. Confermi l’associazione a ${hostClients[0].name}?`,
        )
      )
        throw new Error("Importazione annullata: associazione non confermata.");
    }
    let targetClient =
      exactPropertyClient || hostClients[0] || (!propertyHost ? selectedClientRecord : null);
    if (preferences.autoBackup)
      if (!await createSnapshot("Prima dell’importazione Search Console")) return;
    let targetClientId = targetClient?.id;
    if (!targetClient) {
      targetClientId = Math.max(0, ...currentClients.map((client) => Number(client.id) || 0)) + 1;
      const readableName = propertyHost
        ? propertyHost
        : `Progetto Search Console ${currentClients.length + 1}`;
      targetClient = {
        id: targetClientId,
        name: readableName,
        url: propertyHost ? `https://${propertyHost}` : "",
        score: 0,
        sites: 1,
        color: "#2477ee",
        gscProperty: data.property?.url || "",
      };
      clientsRef.current = [...currentClients, targetClient];
      setClients((current) => [...current, targetClient]);
    } else if (data.property?.url && targetClient.gscProperty !== data.property.url) {
      targetClient = { ...targetClient, gscProperty: data.property.url };
      clientsRef.current = currentClients.map((client) =>
        client.id === targetClientId ? targetClient : client,
      );
      setClients((current) =>
        current.map((client) => (client.id === targetClientId ? targetClient : client)),
      );
    }
    setSelectedClient(targetClientId);
    setGscData((current) => ({ ...current, [targetClientId]: data }));
    setGscHistory((current) =>
      addDatasetToHistory(current, targetClientId, data),
    );
    const generatedTasks = opportunityQueries(data, 20).map((row) => {
      const exact =
        data.queryPages?.find(
          (item) => (item.dimension || item.query) === row.dimension,
        )?.pages?.[0] || "";
      const suggestion = exact
        ? { url: exact }
        : suggestPageForQuery(row.dimension, data.pages);
      const pageUrl = suggestion?.url || "";
      return {
        id: `gsc-${targetClientId}-${stableKey(row.dimension)}`,
        title: `Ottimizza “${row.dimension}”`,
        client: targetClient.name,
        priority: row.position <= 10 ? "Alta" : "Media",
        due: "",
        status: "Da fare",
        kind: "search",
        sourceClientId: targetClientId,
        sourceUrl: pageUrl,
        targetUrl: "",
        linkLabel: exact
          ? "Pagina associata"
          : suggestion
            ? "Pagina suggerita"
            : "Apri il sito",
        associationStatus: exact ? "verified" : "suggested",
        query: row.dimension,
        metrics: {
          clicks: row.clicks,
          impressions: row.impressions,
          ctr: row.ctr,
          position: row.position,
        },
        detail: queryTaskDetail(row, pageUrl, Boolean(exact)),
      };
    });
    setTasks((current) => {
      const previousByQuery = new Map(
        current
          .filter(
            (task) =>
              task.sourceClientId === targetClientId && task.kind === "search" && !task.duplicateOf,
          )
          .map((task) => [String(task.query || "").toLocaleLowerCase("it"), task]),
      );
      const merged = generatedTasks.map((task) => {
        const previous = previousByQuery.get(task.query.toLocaleLowerCase("it"));
        return previous
          ? {
              ...task,
              id: previous.id,
              status: previous.status,
              due: previous.due,
              notes: previous.notes,
              ...(previous.userEdited
                ? {
                    title: previous.title,
                    priority: previous.priority,
                    sourceUrl: previous.sourceUrl,
                    targetUrl: previous.targetUrl,
                    linkLabel: previous.linkLabel,
                    detail: previous.detail,
                    userEdited: true,
                  }
                : {}),
            }
          : task;
      });
      const generatedQueries = new Set(
        generatedTasks.map((task) => task.query.toLocaleLowerCase("it")),
      );
      const archived = current
        .filter(
          (task) =>
            task.sourceClientId === targetClientId &&
            task.kind === "search" &&
            !task.duplicateOf &&
            !generatedQueries.has(String(task.query || "").toLocaleLowerCase("it")),
        )
        .map((task) => ({
          ...task,
          stale: true,
          archivedReason:
            "La query non rientra più nelle opportunità principali dell'ultima importazione.",
        }));
      return [
        ...current.filter(
          (task) =>
            task.duplicateOf || !(task.sourceClientId === targetClientId && task.kind === "search"),
        ),
        ...archived,
        ...merged,
      ];
    });
    return { clientName: targetClient.name, clientId: targetClientId };
  };
  useEffect(() => {
    handleGscImportRef.current = handleGscImport;
  });
  useEffect(() => {
    if (!preferences.refreshHours) return undefined;
    const controller = new AbortController();
    const refresh = async () => {
      if (automaticRefreshRef.current) return;
      automaticRefreshRef.current = true;
      try {
        const propertiesResponse = await fetch("/api/google/properties", { signal: controller.signal });
        if (!propertiesResponse.ok) throw new Error("Impossibile leggere le proprietà Google");
        const propertiesData = await propertiesResponse.json();
        const match = propertiesData.properties?.find(
          (item) =>
            item.url === selectedClientRecord.gscProperty ||
            normalizeSiteHost(item.url) === normalizeSiteHost(selectedClientRecord.url),
        );
        if (!match) return;
        const response = await fetch("/api/google/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ property: match.url }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Aggiornamento automatico non riuscito");
        await handleGscImportRef.current?.(await response.json());
      } catch (error) {
        if (error.message !== "Richiesta annullata.")
          setStorageError(`Aggiornamento automatico: ${error.message}`);
      } finally {
        automaticRefreshRef.current = null;
      }
    };
    refresh();
    const interval = window.setInterval(
      refresh,
      preferences.refreshHours * 60 * 60 * 1000,
    );
    return () => {
      controller.abort();
      automaticRefreshRef.current = null;
      window.clearInterval(interval);
    };
    // L’intervallo viene ricreato soltanto quando cambiano frequenza o progetto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.refreshHours, selectedClient]);
  const openClient = (clientId) => {
    setSelectedClient(clientId);
    setPage("Panoramica");
  };
  const updateClient = (clientId, changes) => {
    const previous = clients.find((item) => item.id === clientId);
    if (!previous) return;
    const domainChanged =
      changes.url && projectIdentity(changes.url) !== projectIdentity(previous.url);
    if (
      domainChanged &&
      !confirmAction(
        "Il dominio è cambiato. Eliminare dal progetto i vecchi dati Search Console, analisi, ranking, GEO, bozze e connessione WordPress?",
      )
    ) return;
    const safeChanges = domainChanged
      ? { ...changes, gscProperty: "", demo: false }
      : { ...changes, demo: false };
    setClients((current) =>
      current.map((client) =>
        client.id === clientId ? { ...client, ...safeChanges } : client,
      ),
    );
    setTasks((current) =>
      domainChanged
        ? current.filter((task) => task.sourceClientId !== clientId)
        : current.map((task) =>
            task.sourceClientId === clientId
              ? { ...task, client: changes.name || previous.name }
              : task,
          ),
    );
    if (domainChanged) {
      for (const setter of [
        setGscData,
        setGscHistory,
        setAnalyses,
        setRankings,
        setTopicalMaps,
        setGeoData,
        setContentDrafts,
        setWordpressProfiles,
        setAuditResults,
        setAgentRuns,
      ])
        setter((current) => {
          const next = { ...current };
          delete next[clientId];
          return next;
        });
      setWordpressConnections((current) => {
        const next = { ...current };
        delete next[clientId];
        return next;
      });
    }
  };
  const deleteClient = async (clientId) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    if (clients.length === 1) {
      notifyUser(
        "Deve rimanere almeno un progetto. Crea prima un altro cliente.",
      );
      return;
    }
    if (
      !confirmAction(
        `Eliminare ${client.name} e tutti i suoi dati locali, task e analisi?`,
      )
    )
      return;
    if (preferences.autoBackup)
      if (!await createSnapshot(`Prima dell’eliminazione di ${client.name}`)) return;
    const remaining = clients.filter((item) => item.id !== clientId);
    const uniqueClientName =
      clients.filter((item) => item.name === client.name).length === 1;
    setWordpressConnections(current => { const next = { ...current }; delete next[clientId]; return next; });
    setClients(remaining);
    setTasks((current) =>
      current.filter(
        (task) =>
          task.sourceClientId !== clientId &&
          !(
            task.sourceClientId == null &&
            uniqueClientName &&
            task.client === client.name
          ),
      ),
    );
    setGscData((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setGscHistory((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setAnalyses((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setRankings((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setTopicalMaps((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setGeoData((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setContentDrafts((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setWordpressProfiles((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setAuditResults((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    setAgentRuns((current) => {
      const next = { ...current };
      delete next[clientId];
      return next;
    });
    if (selectedClient === clientId) setSelectedClient(remaining[0].id);
  };
  const saveViews = (scope, views) => setPreferences(current => ({ ...current, savedViews: { ...current.savedViews, [selectedClient]: { ...current.savedViews?.[selectedClient], [scope]: views } } }));
  const downloadReport = (clientId) => {
    const client = clients.find((item) => item.id === clientId);
    if (!client) return;
    const clientTasks = tasks.filter(
      (task) =>
        task.sourceClientId === clientId ||
        (!task.sourceClientId && task.client === client.name),
    );
    downloadClientReport({
      client,
      dataset: (gscHistory[clientId] || [gscData[clientId]])[0],
      tasks: clientTasks,
      analysis: latestOf(normalizeAnalysisHistory(analyses[clientId])),
      geo: geoData[clientId],
      rankings: rankings[clientId],
      editorial: preferences.projectSettings?.[clientId]?.editorialSchedule,
      template: preferences.projectSettings?.[clientId]?.report,
    });
  };
  const completeSiteAnalysis = async (analysis) => {
    if (preferences.autoBackup && !await createSnapshot("Prima della nuova analisi")) return;
    const previous = selectedAnalysisHistory[0];
    const diff = analysisDiff(analysis, previous);
    const enriched = {
      ...analysis,
      ...diff,
      scoreDelta: observedScoreDelta(analysis, previous),
      hasPrevious: observedScoreDelta(analysis, previous) !== null,
    };
    setAnalyses((current) => ({
      ...current,
      [selectedClient]: [
        enriched,
        ...normalizeAnalysisHistory(current[selectedClient]),
      ].slice(0, 20),
    }));
    const verifiedTasks = tasksFromAnalysis(enriched, selectedClientRecord);
    setTasks(current => reconcileAuditTasks(current, verifiedTasks, selectedClient, enriched.analyzedAt));
  };
  const restoreBackup = restoreValidatedWorkspace;
  const restoreSnapshot = async (snapshotId) => {
    const snapshot = snapshots.find((item) => item.id === snapshotId);
    if (!snapshot || !confirmAction("Ripristinare questa copia locale?"))
      return;
    try { await restoreBackup(snapshot.data, { preserveSnapshots: true }); }
    catch (error) { setToast({ kind: "error", message: `Ripristino non completato: ${error.message}` }); }
  };
  const createManualTask = (values) => {
    const title = String(values?.title || "").trim();
    if (!title) {
      setToast({ kind: "error", message: "Task non creata: inserisci un titolo." });
      return null;
    }
    const duplicate = findExistingTask(tasksRef.current, values, selectedClient);
    if (duplicate) {
      setToast({ kind: "info", message: `Task già presente: ${duplicate.title}`, taskId: duplicate.id, clientId: selectedClient });
      return duplicate;
    }
    const task = createTaskDraft(values, { client: selectedClientRecord, clientId: selectedClient });
    tasksRef.current = [task, ...tasksRef.current];
    setTasks(tasksRef.current);
    setToast({ kind: "success", message: `Task creata: ${task.title}`, taskId: task.id, clientId: selectedClient });
    return task;
  };
  const selectedTasks = tasks.filter(
    (task) =>
      task.sourceClientId === selectedClient ||
      (!task.sourceClientId && task.client === selectedClientRecord?.name),
  );
  const [correctionHistory, setCorrectionHistory] = useState([]);
  useEffect(() => {
    let cancelled = false;
    listCorrections({ clientId: selectedClient }).then(items => { if (!cancelled) setCorrectionHistory(items); }).catch(() => { if (!cancelled) setCorrectionHistory([]); });
    return () => { cancelled = true; };
  }, [selectedClient, tasks]);
  const notifications = preferences.notifications
    ? buildNotifications({
        tasks: selectedTasks,
        dataset: selectedDataset,
        previousDataset: selectedHistory[1],
        analysis: selectedAnalysis,
      })
    : [];
  const allSearchResults = searchWorkspace(query, { pages: nav.map(([label]) => label), clients, tasks });
  const searchResults = allSearchResults.slice(0, 10);
  const projectSettings = preferences.projectSettings?.[selectedClient] || {};
  const saveProjectSettings = updater => setPreferences(current => { const previous = current.projectSettings?.[selectedClient] || {}; const next = typeof updater === "function" ? updater(previous) : { ...previous, ...updater }; return { ...current, projectSettings: { ...current.projectSettings, [selectedClient]: next } }; });
  const content = (() => {
    // These pages render through their dedicated portals.
    if (["Problemi", "Correzioni"].includes(page)) return null;
    if (page === "Centro progetto") return <Suspense fallback={<div className="page-loading">Caricamento Centro progetto…</div>}><ProjectCenter key={selectedClient} client={selectedClientRecord} dataset={selectedDataset} previousDataset={selectedHistory[1]} analysis={selectedAnalysis || auditResults[selectedClient]} analysisHistory={selectedAnalysisHistory} geo={geoData[selectedClient]} rankings={rankings[selectedClient] || rankings[String(selectedClient)] || []} tasks={tasks} opportunityCount={selectedDataset ? opportunityQueries(selectedDataset).length : 0} connection={wordpressConnections[selectedClient]} aiConfigured={apiStatus.aiConfigured} settings={projectSettings} onSave={saveProjectSettings} onNavigate={setPage} onReport={() => downloadReport(selectedClient)}><ProjectMonitoring client={selectedClientRecord} settings={projectSettings} onSave={saveProjectSettings} /></ProjectCenter></Suspense>;
    if (page === "Panoramica")
      return (
        <Dashboard
          clients={clients}
          tasks={tasks}
          setPage={setPage}
          openAudit={() => setQuickAudit(true)}
          dataset={selectedDataset}
          previousDataset={selectedHistory[1]}
          analysis={selectedAnalysis}
          analysisHistory={selectedAnalysisHistory}
          selectedClient={selectedClient}
          gscData={gscData}
          geo={geoData[selectedClient]}
          rankings={rankings[selectedClient] || rankings[String(selectedClient)] || []}
          wordpressConnections={wordpressConnections}
          onNavigate={setPage}
          onOpenClient={openClient}
          wordpressConnected={Boolean(wordpressConnections[selectedClient])}
        />
      );
    if (page === "Clienti")
      return (
        <ClientsPage
          clients={clients}
          setClients={setClients}
          gscData={gscData}
          wordpressConnections={wordpressConnections}
          onNavigate={setPage}
          onOpenClient={openClient}
          onDeleteClient={deleteClient}
          onDownloadReport={downloadReport}
          onUpdateClient={updateClient}
        />
      );
    if (page === "Audit SEO")
      return (
        <AuditPage
          views={preferences.savedViews?.[selectedClient]?.audit}
          onSaveViews={views => saveViews("audit", views)}
          key={selectedClient}
          auditResult={auditResults[selectedClient] || null}
          setAuditResult={(result) =>
            setAuditResults((current) => ({ ...current, [selectedClient]: result }))
          }
          initialUrl={selectedClientRecord.url}
        />
      );
    if (page === "Storico")
      return (
        <HistoryPage
          history={selectedAnalysisHistory}
          tasks={selectedTasks}
          corrections={correctionHistory}
          client={selectedClientRecord}
          onAnalyze={() => setQuickAudit(true)}
        />
      );
    if (page === "Link interni")
      return (
        <InternalLinksPage
          analysis={selectedAnalysis}
          client={selectedClientRecord}
          onAnalyze={() => setQuickAudit(true)}
          onCreateTask={createManualTask}
        />
      );
    if (page === "Opportunità")
      return (
        <Opportunities
          dataset={selectedDatasetWithChanges}
          tasks={selectedTasks}
          clientId={selectedClient}
          onOpenTask={id => {
            setRequestedTask({ id, nonce: Date.now() });
            setPage("Task");
          }}
          openIntegrations={() => setPage("Integrazioni")}
          onCreateTask={createManualTask}
        />
      );
    if (page === "SeoGrow AI")
      return (
        <SeoGrowAiDashboard
          clients={clients}
          gscData={gscData}
          analyses={analyses}
          tasks={tasks}
          selectedClient={selectedClient}
          setPage={setPage}
          openAudit={() => setQuickAudit(true)}
          onOpenClient={openClient}
        />
      );
    if (page === "SEO Agent")
      return (
        <AgentPage
          key={selectedClient}
          client={selectedClientRecord}
          dataset={selectedDatasetWithChanges}
          analysis={selectedAnalysis}
          rankings={rankings[selectedClient] || []}
          savedRuns={agentRuns[selectedClient] || []}
          onSaveRun={(run) =>
            setAgentRuns((current) => ({
              ...current,
              [selectedClient]: [run, ...(current[selectedClient] || []).filter((item) => item.id !== run.id)].slice(0, 20),
            }))
          }
          onDeleteRun={(runId) => setAgentRuns((current) => ({ ...current, [selectedClient]: (current[selectedClient] || []).filter((item) => item.id !== runId) }))}
          onCreateTask={createManualTask}
        />
      );
    if (page === "Posizionamenti")
      return (
        <RankingsPage
          key={selectedClient}
          client={selectedClientRecord}
          dataset={selectedDataset}
          dataForSeo={dataForSeo}
          history={rankings[selectedClient] || []}
          onSave={(result) =>
            setRankings((current) => ({
              ...current,
              [selectedClient]: [
                result,
                ...(current[selectedClient] || []),
              ].slice(0, 20),
            }))
          }
          onCreateTask={createManualTask}
          onNavigate={setPage}
          onUsage={(monthlyCost) =>
            setDataForSeo((current) => ({ ...current, monthlyCost }))
          }
        />
      );
    if (page === "GEO AI")
      return (
        <GeoPage
          key={selectedClient}
          client={selectedClientRecord}
          dataset={selectedDataset}
          analysis={selectedAnalysis}
          topicalMap={topicalMaps[selectedClient]}
          saved={geoData[selectedClient]}
          onSave={(value) =>
            setGeoData((current) => ({ ...current, [selectedClient]: value }))
          }
          onCreateTask={createManualTask}
          aiConfigured={apiStatus.aiConfigured}
          dataForSeo={dataForSeo}
          aiStatus={apiStatus}
          onNavigate={setPage}
        />
      );
    if (page === "Piano editoriale")
      return (
        <ContentPage
          key={selectedClient}
          dataset={selectedDataset}
          analysis={selectedAnalysis}
          client={selectedClientRecord}
          onCreateTask={createManualTask}
          requireApproval={preferences.approveWordPress}
          wordpressConnection={wordpressConnections[selectedClient]}
          onNavigate={setPage}
          dataForSeo={dataForSeo}
          topicalMap={topicalMaps[selectedClient]}
          onSaveTopicalMap={(result) =>
            setTopicalMaps((current) => ({
              ...current,
              [selectedClient]: result,
            }))
          }
          editorialSchedule={projectSettings.editorialSchedule}
          onSaveSchedule={editorialSchedule => saveProjectSettings({ ...projectSettings, editorialSchedule })}
          draft={contentDrafts[selectedClient]}
          onSaveDraft={saveContentDraft}
          workflowContext={taskWorkflowContextState}
          onWorkflowComplete={(taskId, reason, metadata) => {
            const result = completeTaskById(tasksRef.current, taskId, reason, metadata);
            if (!result.changed) return;
            tasksRef.current = result.tasks;
            setTasks(result.tasks);
            setToast({ kind: "success", message: "Task completata: bozza WordPress creata.", taskId, clientId: selectedClient });
          }}
          onDataForSeoUsage={(monthlyCost) =>
            setDataForSeo((current) => ({ ...current, monthlyCost }))
          }
        />
      );
    if (page === "Task")
      return (
        <TaskReferencePage
          key={selectedClient}
          tasks={selectedTasks}
          setTasks={changeTasks}
          client={selectedClientRecord}
          clients={clients}
          views={preferences.savedViews?.[selectedClient]?.tasks}
          onSaveViews={views => saveViews("tasks", views)}
          openTaskId={requestedTask?.id}
          onTaskOpened={() => setRequestedTask(null)}
          onOpenTask={(id) => setRequestedTask({ id, nonce: Date.now() })}
          onContinueTask={(task) => {
            const target = taskWorkflowTarget(task);
            if (!target) return;
            if (target.page === "Correzioni") { writeCorrectionsWorkflowContext(localStorage, task); window.dispatchEvent(new CustomEvent("seogrow-corrections-task-handoff")); }
            else {
              const context = writeTaskWorkflowContext(localStorage, task);
              setTaskWorkflowContextState(context);
            }
            setRequestedTask(null);
            if (target.page === "Correzioni") navigatePage(target.page);
            else setPage(target.page);
          }}
        />
      );
    if (page === "Integrazioni")
      return (
        <Integrations
          key={selectedClient}
          selectedClient={selectedClientRecord}
          dataset={selectedDataset}
          history={selectedHistory}
          onGscImport={handleGscImport}
          wordpressConnection={wordpressConnections[selectedClient]}
          wordpressProfile={wordpressProfiles[selectedClient]}
          onWordPressVerified={(connection) => {
            rememberWordPressSession(selectedClient, connection);
            setWordpressConnections((current) => ({
              ...current,
              [selectedClient]: connection,
            }));
            setWordpressProfiles((current) => ({
              ...current,
              [selectedClient]: {
                url: connection.url,
                username: connection.username,
                name: connection.name,
              },
            }));
          }}
          onNavigate={setPage}
          dataForSeo={dataForSeo}
          aiConfigured={apiStatus.aiConfigured}
          aiStatus={apiStatus}
          onDataForSeoStatus={setDataForSeo}
        />
      );
    return (
      <SettingsPage
        clients={clients}
        selectedClient={selectedClient}
        tasks={tasks}
        gscData={gscData}
        gscHistory={gscHistory}
        analyses={analyses}
        rankings={rankings}
        topicalMaps={topicalMaps}
        geoData={geoData}
        contentDrafts={contentDrafts}
        wordpressProfiles={wordpressProfiles}
        auditResults={auditResults}
        agentRuns={agentRuns}
        problemClosures={problemClosures}
        snapshots={snapshots}
        preferences={preferences}
        setPreferences={setPreferences}
        onCreateSnapshot={() => createSnapshot("Copia manuale")}
        onRestoreSnapshot={restoreSnapshot}
        onRestore={restoreBackup}
      />
    );
  })();
  return (
    <div className="app">
      <Sidebar
        page={page}
        setPage={setPage}
        open={menuOpen}
        setOpen={setMenuOpen}
        displayName={preferences.name || "Amministratore"}
      />
      {menuOpen && (
        <button
          className="nav-scrim"
          aria-label="Chiudi menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className="workspace">
        <Header
          clients={clients}
          selectedClient={selectedClient}
          setSelectedClient={setSelectedClient}
          setMenuOpen={setMenuOpen}
          query={query}
          setQuery={setQuery}
          searchResults={searchResults}
          searchTotal={allSearchResults.length}
          onSearchResult={(item) => {
            if (item.clientId) setSelectedClient(item.clientId);
            if (item.taskId)
              setRequestedTask({ id: item.taskId, nonce: Date.now() });
            if (item.page === "Correzioni") navigatePage(item.page);
            else setPage(item.page);
            setQuery("");
          }}
          notifications={notifications}
          onNotifications={(item) =>
            setPage(item.title.includes("task") ? "Task" : "Opportunità")
          }
          onHelp={() => setPage("Impostazioni")}
          displayName={preferences.name || "Amministratore"}
        />
        {storageError && (
          <div className="storage-warning" role="alert">
            <AlertTriangle />
            <span>{storageError}</span>
            <button
              aria-label="Chiudi avviso"
              onClick={() => setStorageError("")}
            >
              <X />
            </button>
          </div>
        )}
        <div className="feature-toolbar workspace-tools"><CommandPalette pages={[...nav.map(([label]) => label), "Correzioni"]} onNavigate={navigatePage} onNewAudit={() => setQuickAudit(true)} />
          {taskUndo && <><button className="secondary" onClick={undoTasks}>Annulla ultima modifica task</button><button className="secondary" onClick={() => { setTaskUndo(null); setUndoError(""); }}>Ignora annullamento</button></>}
          {undoError && <p role="alert">{undoError}</p>}
        </div>
        <AuditScheduler />
        <FreshnessNotice key={`fresh-${selectedClient}`} sources={[{ labelName: "Search Console", date: selectedDataset?.importedAt }, { labelName: "Audit SEO", date: selectedAnalysis?.analyzedAt || auditResults[selectedClient]?.fetchedAt }, { labelName: "Posizionamenti", date: rankings[selectedClient]?.[0]?.checkedAt }]} settings={projectSettings} onOpen={() => setPage("Centro progetto")} />
        <AuditUpdateNotice key={`notice-${selectedClient}`} clientId={selectedClient} settings={projectSettings} onRead={monitorSeenAt => saveProjectSettings({ ...projectSettings, monitorSeenAt })} onOpen={() => setPage("Centro progetto")} />
        <main data-page={page}>{content}</main>
      </div>
      {quickAudit && (
        <SiteAnalysisModal
          key={selectedClient}
          client={selectedClientRecord}
          previousAnalysis={selectedAnalysis}
          onComplete={completeSiteAnalysis}
          close={() => setQuickAudit(false)}
          openTasks={() => {
            setQuickAudit(false);
            setPage("Task");
          }}
        />
      )}
      {toast && (
        <Toast
          message={toast.message}
          kind={toast.kind}
          onOpen={toast.taskId ? () => {
            setSelectedClient(toast.clientId);
            setRequestedTask({ id: toast.taskId, nonce: Date.now() });
            setPage("Task");
            setToast("");
          } : undefined}
          onClose={() => setToast("")}
        />
      )}
    </div>
  );
}
