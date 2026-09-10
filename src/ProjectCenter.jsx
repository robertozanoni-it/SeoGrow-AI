import IsolatedElementorQaPanel from "./IsolatedElementorQaPanel.jsx";
import { getWordPressSession } from "./wordpressSession.js";
import AutoFixPanel from "./AutoFixPanel.jsx";
import { readAuditMonitor } from "./auditMonitorStore.js";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  FlaskConical,
  ScanSearch,
  Target,
} from "lucide-react";
import { reportSections, reportTemplate } from "./projectPlanning.js";
import "./ProjectCenterCards.css";

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
  analysis,
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
  const [now, setNow] = useState(() => Date.now());
  const detailRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    onSave({
      ...settings,
      ...patch,
      centerActivity: {
        ...(settings.centerActivity || {}),
        setup: new Date().toISOString(),
      },
    });

  const updateTemplate = (patch) =>
    onSave({
      ...settings,
      report: { ...template, ...patch, updatedAt: new Date().toISOString() },
      centerActivity: {
        ...(settings.centerActivity || {}),
        report: new Date().toISOString(),
      },
    });

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

  return (
    <>
      <div className="page-title">
        <div>
          <h1>Centro progetto — {client.name}</h1>
          <p>Apri una card alla volta. Ogni sezione mostra informazioni, stato e soluzioni nello stesso spazio.</p>
        </div>
      </div>

      <section className="project-center-card-hub" aria-labelledby="project-center-card-hub-title">
        <div className="project-center-card-hub-head">
          <div>
            <h2 id="project-center-card-hub-title">Sezioni del progetto</h2>
            <p>Non devi più scorrere tutti i pannelli. Ogni card apre una sola pagina operativa con le informazioni relative.</p>
          </div>
          <span>{areas.length} sezioni</span>
        </div>
        <div className="project-center-section-grid">
          {areas.map((area, index) => {
            const Icon = area.Icon;
            return (
              <button
                type="button"
                key={area.id}
                className={`project-center-section-card tone-${index % 2 ? "mint" : "blue"}`}
                onClick={() => openArea(area.id)}
                aria-controls="project-center-detail"
              >
                <span className="project-center-card-top">
                  <span className="project-center-card-number">{index + 1}</span>
                  <span className="project-center-card-icon"><Icon /></span>
                </span>
                <span className="project-center-card-date"><CalendarDays /> {formatDate(area.date)}</span>
                <h3>{area.title}</h3>
                <p>{area.summary}</p>
                <span className="project-center-card-foot">
                  <span className={`project-center-card-status ${area.positive ? "ok" : ""}`}>{area.status}</span>
                  <span className="project-center-card-open">Apri <ChevronRight /></span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

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
