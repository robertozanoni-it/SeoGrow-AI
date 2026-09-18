import { lazy, Suspense, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Check, CheckCircle2, CircleGauge, ClipboardCheck,
  Database, FileText, Globe2, Plus, Plug, RefreshCw, Search, Sparkles, Target, Users,
} from "lucide-react";
import { formatInteger } from "./gscImport.js";
import { compareDatasets, opportunityQueries } from "./modules/rank/index.js";
import { buildProjectIntelligence } from "./projectIntelligence.js";
import { loadProjectProblemSummary } from "./projectProblemSummary.js";
import { normalizeAnalysisHistory } from "./modules/audit/data.js";

const PerformanceChart = lazy(() => import("./PerformanceChart"));

export function VisibilityChart({ dataset }) {
  if (!dataset?.graph?.length)
    return (
      <section className="panel chart-panel empty-chart">
        <h2>Visibilità organica</h2>
        <p>Importa Search Console per visualizzare clic e impressioni reali.</p>
      </section>
    );
  const data = dataset.graph;
  const impressions = formatInteger(dataset.totals.impressions);
  const clicks = formatInteger(dataset.totals.clicks);
  return (
    <section className="panel chart-panel">
      <div className="panel-head">
        <div>
          <h2>Visibilità organica</h2>
          <div className="legend">
            <span className="green-dot" /> Impressioni <b>{impressions}</b>
            <span className="blue-dot" /> Clic <b>{clicks}</b>
          </div>
        </div>
        <span className="chart-period">
          {`${dataset.graph.length} giorni`}
        </span>
      </div>
      <div className="chart-wrap">
        <Suspense fallback={<div className="chart-loading">Caricamento grafico…</div>}>
          <PerformanceChart data={data} />
        </Suspense>
      </div>
    </section>
  );
}


function RecentClients({ clients, setPage, gscData, onOpenClient }) {
  return (
    <section className="panel recent">
      <div className="panel-head">
        <h2>Clienti recenti</h2>
        <button className="text-link" onClick={() => setPage("Clienti")}>
          Vedi tutti
        </button>
      </div>
      {clients.slice(0, 4).map((client) => {
        const dataset = gscData[client.id];
        return (
          <button
            type="button"
            className="client-row"
            key={client.id}
            onClick={() => onOpenClient(client.id)}
          >
            <div
              className="client-initial"
              style={{ background: client.color }}
            >
              {client.name
                .split(" ")
                .map((w) => w[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div>
              <strong>{client.name}</strong>
              <small>
                {client.sites} {client.sites === 1 ? "sito" : "siti"}
              </small>
            </div>
            <span className={dataset ? "has-real-data" : "demo-data"}>
              <i />
              {dataset
                ? `${formatInteger(dataset.totals.impressions)} imp.`
                : "Non importati"}
            </span>
          </button>
        );
      })}
    </section>
  );
}


export function Dashboard({
  clients,
  tasks,
  setPage,
  openAudit,
  dataset,
  previousDataset,
  analysis,
  analysisHistory = [],
  selectedClient,
  gscData,
  geo,
  rankings = [],
  onOpenClient,
  wordpressConnected = false,
}) {
  const client = clients.find((item) => item.id === selectedClient) || clients[0];
  const clientTasks = tasks.filter((task) => task.sourceClientId === selectedClient || (!task.sourceClientId && task.client === client?.name));
  const activeTasks = clientTasks.filter((task) => !task.stale && task.status !== "Completato");
  const [problemSummaryState, setProblemSummaryState] = useState(null);
  const summaryKey = `${selectedClient || 0}:${analysis?.analyzedAt || analysis?.startedAt || ""}`;
  const auditIssues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const fallbackProblemSummary = {
    active: auditIssues.length,
    high: auditIssues.filter((issue) => ["alta", "high", "critical", "critica"].includes(String(issue?.severity || "").toLowerCase())).length,
    verify: 0,
  };
  const problemSummary = problemSummaryState?.key === summaryKey
    ? problemSummaryState.value
    : fallbackProblemSummary;
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const summary = await loadProjectProblemSummary({ clientId: selectedClient, analysisHistory, analysis, tasks });
        if (!cancelled) setProblemSummaryState({ key: summaryKey, value: summary });
      } catch {
        if (!cancelled) setProblemSummaryState({ key: summaryKey, value: null });
      }
    };
    refresh();
    const rerun = () => refresh();
    window.addEventListener("seogrow-remediation-history", rerun);
    window.addEventListener("seogrow-remediation-applied", rerun);
    window.addEventListener("seogrow-storage-ok", rerun);
    return () => {
      cancelled = true;
      window.removeEventListener("seogrow-remediation-history", rerun);
      window.removeEventListener("seogrow-remediation-applied", rerun);
      window.removeEventListener("seogrow-storage-ok", rerun);
    };
  }, [analysis, analysisHistory, selectedClient, tasks, summaryKey]);
  const critical = problemSummary.high;
  const warnings = Math.max(0, problemSummary.active - problemSummary.high);
  const opportunities = dataset ? opportunityQueries(dataset) : [];
  const top10 = dataset?.queries?.filter((item) => Number(item.position) <= 10).length || 0;
  const comparison = compareDatasets(dataset, previousDataset);
  const score = Number.isFinite(Number(analysis?.score)) ? Number(analysis.score) : null;
  const contentTasks = activeTasks.filter((task) => /contenut|articol|meta|title/i.test(`${task.title || ""} ${task.kind || ""}`)).length;
  const intelligence = buildProjectIntelligence({ client, dataset, analysis, tasks, problemSummary, wordpressConnected, opportunityCount: opportunities.length, rankings, geo });
  const actionUi = {
    audit: [Search, "info", "Avvia"],
    "audit-refresh": [RefreshCw, "info", "Aggiorna"],
    gsc: [Database, "info", "Collega"],
    "gsc-refresh": [RefreshCw, "info", "Aggiorna"],
    critical: [AlertTriangle, "danger", "Correggi"],
    problems: [AlertTriangle, "danger", "Apri"],
    verify: [CheckCircle2, "danger", "Verifica"],
    "tasks-overdue": [ClipboardCheck, "danger", "Apri"],
    tasks: [ClipboardCheck, "info", "Apri"],
    "rankings-missing": [BarChart3, "info", "Apri"],
    "rankings-refresh": [RefreshCw, "info", "Aggiorna"],
    "rankings-decline": [BarChart3, "danger", "Controlla"],
    opportunities: [Target, "success", "Analizza"],
    content: [FileText, "success", "Pianifica"],
    geo: [Sparkles, "success", "Apri GEO"],
    wordpress: [Plug, "info", "Verifica"],
  };
  const primaryAction = intelligence.nextAction ? (() => {
    const [Icon, tone, label] = actionUi[intelligence.nextAction.id] || [Target, "info", "Apri"];
    return { ...intelligence.nextAction, Icon, tone, label };
  })() : null;
  const operationalSignals = intelligence.operationalSignals || [];
  const PrimaryActionIcon = primaryAction?.Icon || Target;
  return (
    <div className="reference-dashboard">
      <section className="reference-dashboard-head">
        <div><span>SEO SUITE CONTROL CENTER</span><h1>Panoramica Suite</h1><p>Controlla salute SEO, crescita, azioni operative e AI in un’unica vista.</p></div>
        <div className="reference-dashboard-actions">
          <div className="reference-project-chip"><Globe2 /><span><strong>{client?.name || "Progetto"}</strong><small>{client?.url?.replace(/^https?:\/\//, "") || ""}</small></span></div>
          <div className="reference-audit-chip"><small>Ultimo audit</small><strong>{analysis?.analyzedAt ? new Date(analysis.analyzedAt).toLocaleDateString("it-IT") : "Non disponibile"}</strong></div>
          <div className="reference-score-chip"><small>SEO Score</small><strong>{score ?? "—"}<span>{score != null ? "/100" : ""}</span></strong></div>
          <button className="primary" onClick={openAudit}><Plus /> Nuovo audit</button>
        </div>
      </section>
      <section className="reference-overview-grid">
        <button className="reference-overview-card problems" onClick={() => setPage("Problemi")}><AlertTriangle /><div><h2>Salute SEO</h2><p className="reference-problem-total"><strong>{problemSummary.active}</strong> problemi aperti</p><div className="reference-card-numbers"><span><strong>{critical}</strong><small>Critici</small></span><span><strong>{warnings}</strong><small>Altri aperti</small></span><span><strong>{problemSummary.verify}</strong><small>Da verificare</small></span></div></div><b>›</b></button>
        <button className="reference-overview-card ranking" onClick={() => setPage("Posizionamenti")}><BarChart3 /><div><h2>Crescita organica</h2><div className="reference-card-numbers"><span><strong>{top10}</strong><small>Top 10</small></span><span><strong>{dataset?.queries?.length || 0}</strong><small>Monitorate</small></span></div></div><b>›</b></button>
        <button className="reference-overview-card google" onClick={() => setPage("Posizionamenti")}><Database /><div><h2>Dati Google</h2><div className="reference-card-numbers"><span><strong>{dataset ? formatInteger(dataset.totals.clicks) : "—"}</strong><small>Click</small></span><span><strong>{dataset ? formatInteger(dataset.totals.impressions) : "—"}</strong><small>Impression</small></span><span><strong>{dataset ? `${dataset.totals.ctr.toFixed(1)}%` : "—"}</strong><small>CTR</small></span></div></div><b>›</b></button>
        <button className="reference-overview-card content" onClick={() => setPage("Piano editoriale")}><FileText /><div><h2>Azioni & contenuti</h2><div className="reference-card-numbers"><span><strong>{contentTasks}</strong><small>Da migliorare</small></span><span><strong>{activeTasks.length}</strong><small>Task aperte</small></span></div></div><b>›</b></button>
      </section>
      <section className="reference-health-strip"><div className="reference-health-title"><Activity /><span><strong>Salute sito</strong><small>Controlli principali del tuo sito</small></span></div><div><Check /><span><strong>Indicizzazione</strong><small>{analysis ? "Controllata" : "Da verificare"}</small></span></div><div><Check /><span><strong>WordPress</strong><small>{wordpressConnected ? "Connesso" : "Da collegare"}</small></span></div><div><Check /><span><strong>Search Console</strong><small>{dataset ? "Connesso" : "Da collegare"}</small></span></div><div className={comparison?.clicks < -10 ? "warning" : "ok"}><CircleGauge /><span><strong>Performance</strong><small>{comparison?.clicks != null ? `${comparison.clicks >= 0 ? "+" : ""}${comparison.clicks.toFixed(1)}%` : "Da monitorare"}</small></span></div></section>
      <section className="reference-priority-panel">
        <div className="reference-section-title"><Target /><div><h2>Cosa devo fare adesso?</h2><p>SeoGrow combina Problemi, Opportunità, Posizionamenti e Task e propone una sola prossima azione.</p></div></div>
        {primaryAction ? <div className="reference-priority-row reference-priority-primary"><span className={`reference-priority-icon ${primaryAction.tone}`}><PrimaryActionIcon /></span><span><strong>{primaryAction.title}</strong><small>{primaryAction.detail}</small></span><span className={`reference-impact ${primaryAction.tone}`}>{primaryAction.source || "Priorità operativa"}</span><button className="primary" onClick={() => setPage(primaryAction.page)}>{primaryAction.label} →</button></div> : <div className="reference-priority-empty"><Check /><span><strong>Nessuna urgenza rilevata</strong><small>I dati disponibili non richiedono un intervento prioritario.</small></span></div>}
        <div className="reference-priority-signals" aria-label="Segnali usati per la priorità">
          {operationalSignals.map((signal) => <button type="button" key={signal.id} onClick={() => setPage(signal.page)}><small>{signal.label}</small><strong>{signal.value}</strong><span>{signal.detail}</span></button>)}
        </div>
      </section>
      <div className="reference-dashboard-lower"><VisibilityChart dataset={dataset} /><RecentClients clients={clients} setPage={setPage} gscData={gscData} onOpenClient={onOpenClient} /></div>
    </div>
  );
}


export function SeoGrowAiDashboard({ clients, gscData, analyses, tasks, selectedClient, setPage, openAudit, onOpenClient }) {
  const selected = clients.find((item) => item.id === selectedClient) || clients[0];
  const dataset = selected ? gscData[selected.id] : null;
  const analysisHistory = selected ? normalizeAnalysisHistory(analyses[selected.id]) : [];
  const latestAnalysis = analysisHistory[0] || null;
  const allAnalysisCount = clients.reduce((sum, client) => sum + normalizeAnalysisHistory(analyses[client.id]).length, 0);
  const completedTasks = tasks.filter((task) => !task.stale && task.status === "Completato").length;
  const monitoredKeywords = Object.values(gscData || {}).reduce((sum, item) => sum + (item?.queries?.length || 0), 0);
  const activeProjects = clients.length;
  const taskByStatus = {
    done: tasks.filter((task) => !task.stale && task.status === "Completato").length,
    active: tasks.filter((task) => !task.stale && task.status !== "Completato").length,
  };
  const recentProjects = clients.slice(0, 5);
  const recentActivities = [
    ...(analysisHistory.slice(0, 3).map((item) => ({
      title: "Analisi SEO completata",
      meta: `${selected?.name || "Progetto"} · ${item.analyzedAt ? new Date(item.analyzedAt).toLocaleString("it-IT") : "data non disponibile"}`,
      tone: "success",
    }))),
    ...tasks.filter((task) => !task.stale).slice(0, 3).map((task) => ({
      title: task.status === "Completato" ? "Task completato" : "Task aggiornato",
      meta: `${task.title} · ${task.client || selected?.name || "progetto"}`,
      tone: task.status === "Completato" ? "success" : "info",
    })),
  ].slice(0, 5);
  return (
    <div className="reference-seogrow-page">
      <section className="reference-seogrow-hero">
        <div><small>SEOGROW AI</small><h1>La tua crescita SEO, potenziata dall’AI</h1><p>Analizza. Pianifica. Migliora. Ottieni risultati.</p><div><button className="primary" onClick={openAudit}>Nuova analisi con AI →</button><button className="secondary" onClick={() => setPage("SEO Agent")}>Scopri come funziona</button></div></div>
        <div className="reference-seogrow-hero-mark"><img src="/favicon.svg" alt="" /><strong>Dati oggi.<br/>Risultati domani.</strong></div>
      </section>
      <section className="reference-seogrow-kpis">
        <article className="blue"><Search /><span><strong>{allAnalysisCount}</strong><small>Analisi completate</small><em>Storico reale dei progetti</em></span></article>
        <article className="green"><BarChart3 /><span><strong>{completedTasks}</strong><small>Task risolti</small><em>Attività completate</em></span></article>
        <article className="purple"><Target /><span><strong>{monitoredKeywords}</strong><small>Keyword monitorate</small><em>Dati Search Console</em></span></article>
        <article className="orange"><Users /><span><strong>{activeProjects}</strong><small>Progetti attivi</small><em>Clienti nel workspace</em></span></article>
      </section>
      <div className="reference-seogrow-main-grid">
        <section className="reference-seogrow-chart"><div className="reference-panel-title"><div><h2>Andamento visibilità</h2><p>{selected?.name || "Progetto selezionato"}</p></div></div><VisibilityChart dataset={dataset} /></section>
        <section className="reference-seogrow-distribution"><h2>Distribuzione attività</h2><div className="reference-seogrow-ring" style={{"--done": `${tasks.length ? taskByStatus.done / tasks.length * 360 : 0}deg`}}><span><strong>{tasks.length}</strong><small>attività</small></span></div><ul><li><i className="green" />Completate <b>{taskByStatus.done}</b></li><li><i className="blue" />Aperte <b>{taskByStatus.active}</b></li></ul></section>
        <aside className="reference-seogrow-actions"><h2>Cosa vuoi fare oggi?</h2>{[["Analizza un sito","Audit SEO",Search],["Trova opportunità","Opportunità",Target],["Genera contenuti","Piano editoriale",FileText],["Correggi problemi","Correzioni",Check],["Monitora posizionamenti","Posizionamenti",BarChart3]].map(([label,page,Icon]) => <button key={label} onClick={() => setPage(page)}><Icon /><span>{label}</span>›</button>)}</aside>
        <section className="reference-seogrow-projects"><div className="reference-panel-title"><div><h2>Progetti recenti</h2><p>Apri rapidamente un progetto.</p></div><button className="text-link" onClick={() => setPage("Clienti")}>Vedi tutti →</button></div>{recentProjects.map((client) => <button key={client.id} onClick={() => onOpenClient(client.id)}><span><strong>{client.name}</strong><small>{client.url.replace(/^https?:\/\//, "")}</small></span><em>{gscData[client.id] ? "Dati collegati" : "Da configurare"}</em>•••</button>)}</section>
        <section className="reference-seogrow-activity"><div className="reference-panel-title"><div><h2>Ultime attività</h2><p>Eventi reali del progetto selezionato.</p></div></div>{recentActivities.length ? recentActivities.map((item,index) => <div key={`${item.title}-${index}`}><i className={item.tone} /><span><strong>{item.title}</strong><small>{item.meta}</small></span></div>) : <p className="reference-empty-copy">Nessuna attività registrata.</p>}</section>
        <aside className="reference-seogrow-ai-card"><Sparkles /><h2>L’AI al servizio del tuo successo</h2><p>SeoGrow AI usa dati, audit e workflow verificabili per trasformare segnali in azioni.</p><button className="primary" onClick={() => setPage("SEO Agent")}>Esegui un’analisi con AI →</button><small>{latestAnalysis ? `Ultimo audit: ${new Date(latestAnalysis.analyzedAt || latestAnalysis.startedAt).toLocaleDateString("it-IT")}` : "Nessun audit disponibile"}</small></aside>
      </div>
    </div>
  );
}
