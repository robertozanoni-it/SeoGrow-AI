import { lazy, Suspense, useEffect, useState } from "react";
import {
  Activity, AlertTriangle, BarChart3, Check, CheckCircle2, CircleGauge, ClipboardCheck,
  Database, FileText, Globe2, Plus, Plug, RefreshCw, Search, Sparkles, Target,
} from "lucide-react";
import { formatInteger } from "./gscImport.js";
import { compareDatasets, opportunityQueries } from "./modules/rank/index.js";
import { buildProjectIntelligence } from "./projectIntelligence.js";
import { loadProjectProblemSummary } from "./projectProblemSummary.js";

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
  onOpenClient,
  wordpressConnected = false,
}) {
  const client = clients.find((item) => item.id === selectedClient) || clients[0];
  const clientTasks = tasks.filter((task) => task.sourceClientId === selectedClient || (!task.sourceClientId && task.client === client?.name));
  const activeTasks = clientTasks.filter((task) => !task.stale && task.status !== "Completato");
  const [problemSummary, setProblemSummary] = useState({ active: 0, high: 0, verify: 0 });
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const summary = await loadProjectProblemSummary({ clientId: selectedClient, analysisHistory, analysis, tasks });
        if (!cancelled) setProblemSummary(summary);
      } catch {
        if (!cancelled) setProblemSummary({ active: 0, high: 0, verify: 0 });
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
  }, [analysis, analysisHistory, selectedClient, tasks]);
  const critical = problemSummary.high;
  const warnings = Math.max(0, problemSummary.active - problemSummary.high);
  const opportunities = dataset ? opportunityQueries(dataset) : [];
  const top10 = dataset?.queries?.filter((item) => Number(item.position) <= 10).length || 0;
  const comparison = compareDatasets(dataset, previousDataset);
  const score = Number.isFinite(Number(analysis?.score)) ? Number(analysis.score) : null;
  const contentTasks = activeTasks.filter((task) => /contenut|articol|meta|title/i.test(`${task.title || ""} ${task.kind || ""}`)).length;
  const intelligence = buildProjectIntelligence({ client, dataset, analysis, tasks, problemSummary, wordpressConnected, opportunityCount: opportunities.length, geo });
  const actionUi = {
    audit: [Search, "info", "Avvia"],
    "audit-refresh": [RefreshCw, "info", "Aggiorna"],
    gsc: [Database, "info", "Collega"],
    "gsc-refresh": [RefreshCw, "info", "Aggiorna"],
    critical: [AlertTriangle, "danger", "Correggi"],
    verify: [CheckCircle2, "danger", "Verifica"],
    tasks: [ClipboardCheck, "info", "Apri"],
    opportunities: [Target, "success", "Analizza"],
    content: [FileText, "success", "Pianifica"],
    geo: [Sparkles, "success", "Apri GEO"],
    wordpress: [Plug, "info", "Verifica"],
  };
  const priorityActions = intelligence.actions.slice(0, 3).map((item) => {
    const [Icon, tone, label] = actionUi[item.id] || [Target, "info", "Apri"];
    return { ...item, Icon, tone, label };
  });
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
      <section className="reference-priority-panel"><div className="reference-section-title"><Target /><div><h2>Next Best Action</h2><p>SeoGrow ordina le prossime azioni usando impatto, urgenza, affidabilità ed effort.</p></div><button className="text-link" onClick={() => setPage("Task")}>Vedi tutte le azioni →</button></div>{priorityActions.length ? priorityActions.map(({ title, detail, label, page, tone, Icon, score }) => <div className="reference-priority-row" key={title}><span className={`reference-priority-icon ${tone}`}><Icon /></span><span><strong>{title}</strong><small>{detail}</small></span><span className={`reference-impact ${tone}`}>Priorità {score}</span><button className="primary" onClick={() => setPage(page)}>{label} →</button></div>) : <div className="reference-priority-empty"><Check /><span><strong>Nessuna urgenza rilevata</strong><small>I dati disponibili non richiedono un intervento prioritario.</small></span></div>}</section>
      <div className="reference-dashboard-lower"><VisibilityChart dataset={dataset} /><RecentClients clients={clients} setPage={setPage} gscData={gscData} onOpenClient={onOpenClient} /></div>
    </div>
  );
}

