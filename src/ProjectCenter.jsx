import IsolatedElementorQaPanel from "./IsolatedElementorQaPanel.jsx";
import { getWordPressSession } from "./wordpressSession.js";
import AutoFixPanel from "./AutoFixPanel.jsx";
import { readAuditMonitor } from "./auditMonitorStore.js";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Clock3,
  FileText,
  FlaskConical,
  Globe2,
  ScanSearch,
  Settings,
  Target,
} from "lucide-react";
import { reportSections, reportTemplate } from "./projectPlanning.js";
import { buildProjectIntelligence } from "./projectIntelligence.js";
import { buildProjectOutcomes } from "./projectOutcomes.js";
import { loadProjectProblemSummary } from "./projectProblemSummary.js";
import "./ProjectCenterCards.css";
import "./ProjectCenterReference.css";

const validDate = (value) => {
  if (!value) return "";
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : "";
};

const latestDate = (...values) => {
  const dates = values.map(validDate).filter(Boolean);
  if (!dates.length) return "";
  return dates.toSorted((a, b) => Date.parse(b) - Date.parse(a))[0];
};

const formatDate = (value) => {
  const normalized = validDate(value);
  if (!normalized) return "Data non disponibile";
  return new Date(normalized).toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const isElementorQaProject = (url) => {
  try {
    return new URL(url).href.replace(/\/$/, "") === "https://yogabuenaonda.it";
  } catch {
    return false;
  }
};

const formatMetric = (value) => Number.isFinite(Number(value)) ? new Intl.NumberFormat("it-IT").format(Number(value)) : "—";
const trendPoints = (rows = []) => {
  const values = rows.map((row) => Number(row.clicks || row.impressions || 0)).filter(Number.isFinite);
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  return values.map((value, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 36 - ((value - min) / span) * 30;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
};

const statusFromMonitor = (record, enabled) => {
  if (!enabled) return "Audit periodico disattivato";
  if (!record) return "Attivo · nessun controllo";
  if (record.status === "success") return "Ultimo controllo riuscito";
  if (record.status === "error") return "Ultimo controllo non riuscito";
  if (record.status === "running") return "Controllo in corso";
  return "Monitoraggio configurato";
};

export default function ProjectCenter({
  client,
  dataset,
  previousDataset,
  analysis,
  geo,
  analysisHistory = [],
  tasks = [],
  opportunityCount = 0,
  connection,
  aiConfigured,
  settings = {},
  onSave,
  onNavigate,
  onReport,
  children,
}) {
  const [step, setStep] = useState(0);
  const [activeArea, setActiveArea] = useState("");
  const [problemSummary, setProblemSummary] = useState({ active: 0, high: 0, verify: 0 });
  const [now, setNow] = useState(() => Date.now());
  const detailRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const summary = await loadProjectProblemSummary({ clientId: client.id, analysisHistory, analysis, tasks });
        if (!cancelled) setProblemSummary(summary);
      } catch {
        if (!cancelled) setProblemSummary({ active: 0, high: 0, verify: 0 });
      }
    };
    refresh();
    window.addEventListener("seogrow-remediation-history", refresh);
    window.addEventListener("seogrow-remediation-applied", refresh);
    window.addEventListener("seogrow-storage-ok", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("seogrow-remediation-history", refresh);
      window.removeEventListener("seogrow-remediation-applied", refresh);
      window.removeEventListener("seogrow-storage-ok", refresh);
    };
  }, [client.id, analysisHistory, analysis, tasks]);

  const template = reportTemplate(settings.report);
  const objective = typeof settings.objective === "string" ? settings.objective : "";
  const currentConnection = getWordPressSession(client.id, client.url) || connection;
  const verified = Boolean(
    currentConnection?.verifiedAt &&
      now - Date.parse(currentConnection.verifiedAt) < 30 * 60_000 &&
      Date.parse(currentConnection.verifiedAt) <= now,
  );
  const monitorRecord = readAuditMonitor()?.[client.id] || null;
  const monitorEnabled = Boolean(settings.monitor?.enabled);
  const elementorEligible = isElementorQaProject(client.url);
  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const reportSelected = Object.values(template.sections).filter(Boolean).length;

  const saveSetup = (patch) =>
    onSave((current) => ({
      ...current,
      ...patch,
      centerActivity: {
        ...(current.centerActivity || {}),
        setup: new Date().toISOString(),
      },
    }));

  const updateTemplate = (patch) =>
    onSave((current) => ({
      ...current,
      report: { ...reportTemplate(current.report), ...patch, updatedAt: new Date().toISOString() },
      centerActivity: {
        ...(current.centerActivity || {}),
        report: new Date().toISOString(),
      },
    }));

  const setupCompleted = [Boolean(objective.trim()), Boolean(dataset), Boolean(analysis), verified].filter(Boolean).length;
  const setupDate = latestDate(
    settings.centerActivity?.setup,
    dataset?.importedAt,
    dataset?.dateTo,
    analysis?.analyzedAt,
    analysis?.startedAt,
    currentConnection?.verifiedAt,
  );
  const correctionDate = latestDate(analysis?.analyzedAt, analysis?.startedAt, settings.centerActivity?.setup);
  const elementorDate = latestDate(currentConnection?.verifiedAt, correctionDate);
  const monitoringDate = latestDate(
    monitorRecord?.completedAt,
    monitorRecord?.lastAttemptAt,
    monitorRecord?.history?.[0]?.fetchedAt,
  );
  const reportDate = latestDate(settings.centerActivity?.report, settings.report?.updatedAt, analysis?.analyzedAt);
  const helpDate = latestDate(setupDate, correctionDate, elementorDate, monitoringDate, reportDate);

  const areas = [
    {
      id: "setup",
      title: "Preparazione del progetto",
      summary: "Obiettivo, dati SEO, WordPress e riepilogo iniziale.",
      date: setupDate,
      status: `${setupCompleted}/4 completati`,
      positive: setupCompleted === 4,
      Icon: Target,
      info: [
        `Obiettivo: ${objective.trim() ? "definito" : "da definire"}`,
        `Search Console: ${dataset ? "dati presenti" : "da importare"}`,
        `Audit: ${analysis ? "disponibile" : "da eseguire"}`,
        `WordPress: ${verified ? "verificato" : "da verificare"}`,
      ],
      solutions: [
        "Completa soltanto il dato mancante.",
        "Usa Integrazioni per Search Console e WordPress.",
        "Esegui Audit SEO prima di passare alle correzioni.",
      ],
    },
    {
      id: "fix",
      title: "Analizza e correggi",
      summary: "Dall’audit alle proposte approvabili e alla verifica finale.",
      date: correctionDate,
      status: analysis ? `${issues.length} problemi nell’ultimo audit` : "Audit richiesto",
      positive: Boolean(analysis),
      Icon: ScanSearch,
      info: [
        `Ultimo audit: ${analysis ? formatDate(analysis.analyzedAt || analysis.startedAt) : "non disponibile"}`,
        `Problemi rilevati: ${issues.length}`,
        `WordPress: ${verified ? "verificato" : "da verificare"}`,
        "Scrittura: solo dopo approvazione esplicita",
      ],
      solutions: [
        "Carica i problemi dall’ultimo audit salvato.",
        "Revisiona soltanto gli interventi supportati.",
        "Confronta prima/dopo, approva, applica e riverifica.",
      ],
    },
    ...(elementorEligible
      ? [
          {
            id: "elementor",
            title: "Collaudo Elementor",
            summary: "Prova tecnica isolata sulla bozza 8196, con ripristino.",
            date: elementorDate,
            status: verified ? "WordPress verificato" : "WordPress da collegare",
            positive: verified,
            Icon: FlaskConical,
            info: [
              "Pagina tecnica: 8196",
              "Stato: bozza isolata",
              `WordPress: ${verified ? "connessione valida" : "connessione assente o scaduta"}`,
              "Pubblicazione: mai automatica",
            ],
            solutions: [
              "Prepara l’anteprima prima di qualsiasi scrittura.",
              "Approva solo il testo di prova previsto.",
              "Controlla il risultato e ripristina la versione precedente.",
            ],
          },
        ]
      : []),
    {
      id: "monitoring",
      title: "Controlli nel tempo",
      summary: "Freschezza dei dati e audit periodico facoltativo.",
      date: monitoringDate,
      status: statusFromMonitor(monitorRecord, monitorEnabled),
      positive: monitorRecord?.status === "success",
      Icon: Clock3,
      info: [
        `Avvisi freschezza: ${settings.freshnessEnabled === false ? "disattivati" : "attivi"}`,
        `Soglia: ${settings.freshnessDays || 7} giorni`,
        `Audit periodico: ${monitorEnabled ? "attivo" : "disattivato"}`,
        `Frequenza: ogni ${settings.monitor?.hours || 24} ore`,
      ],
      solutions: [
        "Riduci la soglia se vuoi dati più freschi.",
        "Attiva l’audit periodico solo quando serve.",
        "Usa le variazioni per decidere il prossimo audit o intervento.",
      ],
    },
    {
      id: "report",
      title: "Condivisione dei risultati",
      summary: "Configura e scarica il report del progetto.",
      date: reportDate,
      status: `${reportSelected}/${Object.keys(reportSections).length} sezioni incluse`,
      positive: reportSelected > 0,
      Icon: FileText,
      info: [
        `Brand: ${template.brand || "da definire"}`,
        `Titolo: ${template.title || "Report SEO"}`,
        `Sezioni incluse: ${reportSelected}`,
        `Introduzione: ${template.intro ? "personalizzata" : "vuota"}`,
      ],
      solutions: [
        "Personalizza brand, titolo e introduzione.",
        "Mantieni solo le sezioni utili al cliente.",
        "Scarica il report quando il ciclo di verifica è concluso.",
      ],
    },
    {
      id: "help",
      title: "Spiegazioni e guida",
      summary: "Cosa significa ogni area, cosa fare e quale risultato aspettarsi.",
      date: helpDate,
      status: "Guida disponibile",
      positive: true,
      Icon: BookOpen,
      info: [
        "6 aree operative del Centro progetto",
        "Flussi spiegati senza modificare i dati",
        "Azioni collegate ai moduli reali",
        "Nessuna scrittura automatica da questa guida",
      ],
      solutions: [
        "Apri solo la sezione che non ti è chiara.",
        "Segui prima le informazioni, poi le azioni suggerite.",
        "Torna alle card per cambiare area senza scorrere tutta la pagina.",
      ],
    },
  ];

  const activeMeta = areas.find((area) => area.id === activeArea) || areas[0];
  const ActiveIcon = activeMeta.Icon;

  const openArea = (id) => {
    setActiveArea(id);
    window.requestAnimationFrame(() => {
      detailRef.current?.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  const score = Number.isFinite(Number(analysis?.score)) ? Number(analysis.score) : null;
  const top10 = (dataset?.queries || []).filter((row) => Number(row.position) > 0 && Number(row.position) <= 10).length;
  const criticalIssues = issues.filter((issue) => String(issue.severity || "").toLowerCase() === "high").length;
  const contentIssues = issues.filter((issue) => /content|contenut|meta|title|image|immagin/i.test(`${issue.type || ""} ${issue.label || ""}`)).length;
  const topPages = [...(dataset?.pages || [])].toSorted((a, b) => Number(b.clicks || 0) - Number(a.clicks || 0)).slice(0, 5);
  const trend = trendPoints(dataset?.graph || []);
  const intelligence = buildProjectIntelligence({ client, dataset, analysis, tasks, problemSummary, wordpressConnected: verified, opportunityCount, geo });
  const outcomes = buildProjectOutcomes({ client, tasks, dataset, previousDataset, problemSummary, geo });
  const projectActions = intelligence.actions;
  const activity = [
    analysis?.analyzedAt && { label: "Audit completato", date: analysis.analyzedAt, Icon: ScanSearch },
    dataset?.importedAt && { label: "Dati Search Console aggiornati", date: dataset.importedAt, Icon: BarChart3 },
    currentConnection?.verifiedAt && { label: "WordPress verificato", date: currentConnection.verifiedAt, Icon: CheckCircle2 },
    settings.report?.updatedAt && { label: "Report aggiornato", date: settings.report.updatedAt, Icon: FileText },
  ].filter(Boolean).toSorted((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 5);

  return (
    <>
      <section className="reference-project-identity">
        <div className="reference-project-mark"><img src="/favicon.svg" alt="" aria-hidden="true" /></div>
        <div className="reference-project-title"><span>Centro progetto</span><h1>{client.name}</h1><a href={client.url} target="_blank" rel="noreferrer">{client.url}<ExternalLink /></a><p>{objective.trim() || "Definisci l’obiettivo principale del progetto per mantenere allineate analisi e azioni."}</p></div>
        <div className="reference-project-controls"><span className="reference-project-active"><i /> Attivo</span><a className="secondary" href={client.url} target="_blank" rel="noreferrer"><Globe2 /> Visita sito</a><button className="secondary" onClick={() => openArea("setup")}><Settings /> Impostazioni progetto</button><button className="primary" onClick={() => onNavigate("Audit SEO")}><ScanSearch /> Nuovo audit</button></div>
      </section>

      <section className="reference-project-kpis">
        <article className="score"><div className="reference-project-score-ring"><strong>{score ?? "—"}</strong><small>{score != null ? "/100" : ""}</small></div><span><small>SEO Score</small><strong>{score == null ? "Da analizzare" : score >= 80 ? "Ottimo" : score >= 60 ? "Da migliorare" : "Prioritario"}</strong><em>{analysis ? `Ultimo audit ${formatDate(analysis.analyzedAt || analysis.startedAt)}` : "Nessun audit disponibile"}</em></span></article>
        <article><BarChart3 /><span><small>Keyword in Top 10</small><strong>{top10}</strong><em>su {dataset?.queries?.length || 0} monitorate</em></span></article>
        <article><Activity /><span><small>Traffico organico</small><strong>{dataset ? formatMetric(dataset.totals?.clicks) : "—"}</strong><em>{dataset ? "Click nel periodo Search Console" : "Search Console da collegare"}</em></span></article>
        <article><Target /><span><small>Problemi critici</small><strong>{criticalIssues}</strong><em>su {issues.length} totali</em></span></article>
        <article><FileText /><span><small>Contenuti da migliorare</small><strong>{contentIssues}</strong><em>segnali on-page/editoriali</em></span></article>
      </section>

      <nav className="reference-project-tabs" aria-label="Aree del progetto">
        {["Panoramica", "Problemi", "Posizionamenti", "Piano editoriale", "Link interni", "Audit SEO", "Storico"].map((label, index) => <button type="button" className={index === 0 ? "active" : ""} key={label} onClick={() => label !== "Panoramica" && onNavigate(label)}>{label}</button>)}
      </nav>

      <section className="reference-project-main-grid">
        <article className="reference-project-status-panel"><header><h2>Project Intelligence</h2><span>{intelligence.readiness}% copertura dati</span></header><div><CheckCircle2 className={verified ? "ok" : "pending"}/><span>Connessione WordPress</span><strong>{verified ? "Attiva" : "Da verificare"}</strong></div><div><CheckCircle2 className={dataset ? "ok" : "pending"}/><span>Search Console</span><strong>{dataset ? "Collegata" : "Da collegare"}</strong></div><div><CheckCircle2 className={dataset ? "ok" : "pending"}/><span>Dati keyword</span><strong>{dataset ? "Aggiornati" : "Non disponibili"}</strong></div><div><CheckCircle2 className={analysis ? "ok" : "pending"}/><span>Ultimo audit</span><strong>{analysis ? formatDate(analysis.analyzedAt || analysis.startedAt) : "Da eseguire"}</strong></div><footer><button className="primary" onClick={() => onNavigate("Audit SEO")}><ScanSearch /> Esegui nuovo audit</button><button className="secondary" onClick={() => onNavigate("Storico")}><Clock3 /> Vedi storico</button></footer></article>
        <article className="reference-project-trend"><header><h2>Andamento SEO</h2><span>{dataset?.graph?.length ? `${dataset.graph.length} giorni` : "Dati non disponibili"}</span></header>{trend ? <div className="reference-project-trend-chart"><svg viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Andamento dei clic Search Console"><polyline points={trend} fill="none" stroke="currentColor" strokeWidth="1.5" vectorEffect="non-scaling-stroke" /></svg><div className="reference-project-chart-grid" /></div> : <div className="reference-project-empty-chart"><BarChart3 /><span>Importa Search Console per vedere l’andamento.</span></div>}</article>
        <article className="reference-project-actions"><header><h2>Prossime azioni</h2><button onClick={() => onNavigate("Task")}>Vedi tutte →</button></header>{projectActions.length ? projectActions.map((item, index) => <button key={item.id} onClick={() => onNavigate(item.page)}><b>{index + 1}</b><span><strong>{item.title}</strong><small>{item.detail}</small></span><em className={item.level.toLowerCase()}>{item.level} · {item.score}</em></button>) : <div className="reference-project-no-actions"><CheckCircle2 /><span><strong>Nessuna urgenza</strong><small>I dati disponibili non richiedono un intervento prioritario.</small></span></div>}</article>
      </section>

      <section className="reference-project-secondary-grid">
        <article className="reference-project-pages"><header><h2>Pagine principali</h2><button onClick={() => onNavigate("Posizionamenti")}>Vedi tutte →</button></header>{topPages.length ? <div className="reference-project-pages-table"><div className="head"><span>URL</span><span>Posizione</span><span>Click</span></div>{topPages.map((row) => <a href={row.dimension} target="_blank" rel="noreferrer" key={row.dimension}><span>{new URL(row.dimension).pathname || "/"}<small>{row.dimension.replace(/^https?:\/\//, "")}</small></span><strong>{Number(row.position || 0).toFixed(1)}</strong><b>{formatMetric(row.clicks)}</b></a>)}</div> : <p className="reference-project-muted">Nessuna pagina Search Console disponibile.</p>}</article>
        <article className="reference-project-activity"><header><h2>Ultime attività</h2><button onClick={() => onNavigate("Storico")}>Vedi tutte →</button></header>{activity.length ? activity.map(({ label, date, Icon }) => <div key={`${label}-${date}`}><span><Icon /></span><p><strong>{label}</strong><small>{formatDate(date)}</small></p></div>) : <p className="reference-project-muted">Le attività del progetto compariranno qui.</p>}</article>
        <article className="reference-project-growth"><Target /><h2>Risultati osservati</h2><p>{outcomes.completedTasks} task completate · {outcomes.resolvedProblems} problemi risolti · {outcomes.verifiedCorrections} correzioni verificate{outcomes.clickDeltaPct != null ? ` · click ${outcomes.clickDeltaPct >= 0 ? "+" : ""}${outcomes.clickDeltaPct.toFixed(1)}%` : ""}.</p><small>{outcomes.note}</small><button className="primary" onClick={() => onNavigate("Storico")}>Vedi storico →</button></article>
      </section>

      <details className="reference-project-operations">
        <summary>Gestione operativa avanzata</summary>
        <p>Configurazione, remediation, monitoraggio, report e strumenti tecnici già presenti nel progetto.</p>
        <section className="project-center-card-hub" aria-labelledby="project-center-card-hub-title">
          <div className="project-center-card-hub-head"><div><h2 id="project-center-card-hub-title">Sezioni operative</h2><p>Apri una funzione tecnica senza perdere il contesto del progetto.</p></div><span>{areas.length} sezioni</span></div>
          <div className="project-center-section-grid">{areas.map((area, index) => { const Icon = area.Icon; return <button type="button" key={area.id} className={`project-center-section-card tone-${index % 2 ? "mint" : "blue"}`} onClick={() => openArea(area.id)} aria-controls="project-center-detail"><span className="project-center-card-top"><span className="project-center-card-number">{index + 1}</span><span className="project-center-card-icon"><Icon /></span></span><span className="project-center-card-date"><CalendarDays /> {formatDate(area.date)}</span><h3>{area.title}</h3><p>{area.summary}</p><span className="project-center-card-foot"><span className={`project-center-card-status ${area.positive ? "ok" : ""}`}>{area.positive && <CheckCircle2 />}{area.status}</span><span className="project-center-card-open">Apri <ChevronRight /></span></span></button>; })}</div>
        </section>
      </details>

      <section
        id="project-center-detail"
        ref={detailRef}
        className="project-center-detail-shell"
        hidden={!activeArea}
        aria-live="polite"
      >
        <header className="project-center-detail-head">
          <div className="project-center-detail-head-main">
            <span className={`project-center-detail-head-icon ${areas.findIndex((area) => area.id === activeMeta.id) % 2 ? "mint" : ""}`}><ActiveIcon /></span>
            <div>
              <small>Dettaglio operativo · {formatDate(activeMeta.date)}</small>
              <h2>{activeMeta.title}</h2>
              <p>{activeMeta.summary}</p>
            </div>
          </div>
          <button type="button" className="secondary project-center-back" onClick={() => setActiveArea("")}><ArrowLeft /> Torna alle card</button>
        </header>

        <div className="project-center-detail-metrics">
          {activeMeta.info.map((item, index) => {
            const [label, ...rest] = item.split(": ");
            return (
              <div key={`${activeMeta.id}-metric-${index}`}>
                <small>{rest.length ? label : `Informazione ${index + 1}`}</small>
                <strong>{rest.length ? rest.join(": ") : item}</strong>
              </div>
            );
          })}
        </div>

        <div className="project-center-horizontal-layout">
          <aside className="project-center-detail-aside">
            <section>
              <h3>Informazioni</h3>
              <ul>{activeMeta.info.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
            <section>
              <h3>Soluzioni e prossimi passi</h3>
              <ul>{activeMeta.solutions.map((item) => <li key={item}>{item}</li>)}</ul>
            </section>
          </aside>

          <div className="project-center-detail-content">
            <div className="project-center-area project-center-area-setup" hidden={activeArea !== "setup"}>
              <section className="panel planning-panel project-setup">
                <h2>Configurazione guidata</h2>
                <div className="project-center-setup-main">
                  <ol className="wizard-steps">
                    {["Obiettivo", "Dati SEO", "WordPress", "Riepilogo"].map((label, index) => (
                      <li key={label}>
                        <button className="secondary" aria-current={index === step ? "step" : undefined} onClick={() => setStep(index)}>{index + 1}. {label}</button>
                      </li>
                    ))}
                  </ol>
                  <div className="project-center-setup-step">
                    {step === 0 && (
                      <label>
                        Obiettivo del progetto
                        <small>Scrivi il risultato che vuoi ottenere, poi premi Avanti.</small>
                        <textarea maxLength={1000} value={objective} onChange={(event) => saveSetup({ objective: event.target.value })} placeholder="Es. aumentare le richieste per i corsi di yoga" />
                      </label>
                    )}
                    {step === 1 && (
                      <>
                        <p>Search Console: <strong>{dataset ? "dati importati" : "dati mancanti"}</strong>. Audit del sito: <strong>{analysis ? "disponibile" : "non eseguito"}</strong>.</p>
                        <p>Collega i dati di ricerca e crea una baseline tecnica prima di decidere cosa correggere.</p>
                        <div className="feature-toolbar">
                          <button className="secondary" onClick={() => onNavigate("Integrazioni")}>Importa Search Console</button>
                          <button className="primary" onClick={() => onNavigate("Audit SEO")}>Apri audit SEO</button>
                        </div>
                      </>
                    )}
                    {step === 2 && (
                      <>
                        <p>WordPress: <strong>{verified ? "connessione verificata in questa sessione" : "verifica assente o scaduta"}</strong>.</p>
                        <p>La verifica legge il sito senza modificare contenuti. La scrittura resta separata e richiede approvazione.</p>
                        <button className="primary" onClick={() => onNavigate("Integrazioni")}>Verifica connessione WordPress</button>
                      </>
                    )}
                    {step === 3 && (
                      <ul className="project-center-summary-list">
                        <li>Obiettivo: {objective.trim() || "da definire"}</li>
                        <li>Search Console: {dataset ? "presente" : "da importare"}</li>
                        <li>Audit: {analysis ? "presente" : "da eseguire"}</li>
                        <li>WordPress: {verified ? "verificato" : "da verificare"}</li>
                        <li>OpenAI: {aiConfigured ? "configurato" : "non configurato"}</li>
                      </ul>
                    )}
                    <div className="feature-toolbar">
                      <button className="secondary" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>Indietro</button>
                      <button className="primary" disabled={step === 3} onClick={() => setStep((value) => value + 1)}>Avanti</button>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="project-center-area project-center-area-fix" hidden={activeArea !== "fix"}>
              <AutoFixPanel client={client} onNavigate={onNavigate} />
            </div>

            <div className="project-center-area project-center-area-elementor" hidden={activeArea !== "elementor"}>
              <IsolatedElementorQaPanel key={client.id} client={client} onNavigate={onNavigate} />
            </div>

            <div className="project-center-area project-center-area-monitoring" hidden={activeArea !== "monitoring"}>
              {children}
            </div>

            <div className="project-center-area project-center-area-report" hidden={activeArea !== "report"}>
              <section className="panel planning-panel project-report">
                <h2>Modello del report</h2>
                <div className="project-center-report-form">
                  <div className="report-identity">
                    <label>Nome studio o agenzia<input maxLength={100} value={template.brand} onChange={(event) => updateTemplate({ brand: event.target.value })} /></label>
                    <label>Titolo<input maxLength={100} value={template.title} onChange={(event) => updateTemplate({ title: event.target.value })} /></label>
                    <label>Colore<input type="color" value={template.color} onChange={(event) => updateTemplate({ color: event.target.value })} /></label>
                  </div>
                  <label className="full">Introduzione<textarea maxLength={2000} value={template.intro} onChange={(event) => updateTemplate({ intro: event.target.value })} /></label>
                  <fieldset>
                    <legend>Sezioni da includere</legend>
                    {Object.entries(reportSections).map(([key, label]) => (
                      <label className="report-option" key={key}>
                        <input
                          type="checkbox"
                          checked={template.sections[key]}
                          disabled={template.sections[key] && Object.values(template.sections).filter(Boolean).length === 1}
                          onChange={(event) => updateTemplate({ sections: { ...template.sections, [key]: event.target.checked } })}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>
                  <div className="project-center-report-actions"><button className="primary" onClick={onReport}>Scarica report personalizzato</button></div>
                </div>
              </section>
            </div>

            <div className="project-center-area project-center-area-help" hidden={activeArea !== "help"}>
              <section className="panel project-center-help-page">
                {areas.filter((area) => area.id !== "help").map((area, index) => (
                  <div className="project-center-help-row" key={area.id}>
                    <span>{index + 1}</span>
                    <h3>{area.title}</h3>
                    <p>{area.summary}</p>
                    <strong>{area.solutions.join(" · ")}</strong>
                  </div>
                ))}
              </section>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
