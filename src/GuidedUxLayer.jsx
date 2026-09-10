import { opportunityGroups } from "./platform.js";
import { navigatePage as navigate, isNavigationItemVisible } from "./navigationUx.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  ClipboardCheck,
  Database,
  FileText,
  Globe2,
  HelpCircle,
  History,
  Link2,
  ListChecks,
  Plug,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  WandSparkles,
} from "lucide-react";
import "./GuidedUxLayer.css";

const UI_MODE_KEY = "seogrow-ui-mode-v1";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const CLIENTS_KEY = "seogrow-clients";
const TASKS_KEY = "seogrow-tasks-v2";
const GSC_KEY = "seogrow-gsc-v1";
const ANALYSES_KEY = "seogrow-analyses-v2";
const REMEDIATION_INDEX_KEY = "seogrow-remediation-history-v1";

const groups = [
  {
    label: "Progetto",
    items: [
      ["Panoramica", CircleGauge],
      ["Clienti", Users],
      ["Centro progetto", ClipboardCheck],
      ["Storico", History, true],
    ],
  },
  {
    label: "Analizza",
    items: [
      ["Problemi", ListChecks],
      ["Audit SEO", CircleGauge],
      ["Posizionamenti", BarChart3],
      ["Link interni", Link2],
    ],
  },
  {
    label: "Migliora",
    items: [
      ["Opportunità", Target],
      ["Correzioni", CheckCircle2],
      ["Task", ClipboardCheck],
      ["Piano editoriale", FileText, true],
    ],
  },
  {
    label: "SeoGrow AI",
    items: [
      ["SEO Agent", WandSparkles],
      ["GEO AI", Sparkles, true],
    ],
  },
  {
    label: "Sistema",
    items: [
      ["Integrazioni", Plug],
      ["Impostazioni", Settings],
    ],
  },
];

const PAGE_GUIDES = {
  Panoramica: {
    intro: "Controlla lo stato del progetto e parti dalla prossima azione utile.",
    steps: [
      ["Stato progetto", "Verifica dati, audit e connessioni disponibili."],
      ["Priorità", "Individua problemi urgenti e attività aperte."],
      ["Opportunità", "Controlla query e pagine con margine di crescita."],
      ["Correzioni", "Rivedi ciò che è stato applicato e deve essere verificato."],
      ["Prossima azione", "Apri il modulo giusto senza cercarlo nel menu."],
    ],
  },
  Clienti: {
    intro: "Gestisci ogni sito come un progetto indipendente e facilmente riconoscibile.",
    steps: [
      ["Seleziona cliente", "Apri un progetto esistente o creane uno nuovo."],
      ["Controlla dati", "Verifica nome, sito e stato delle integrazioni."],
      ["Collega strumenti", "Configura Search Console e WordPress quando servono."],
      ["Apri progetto", "Entra nel Centro progetto e continua il flusso."],
    ],
  },
  "Centro progetto": {
    intro: "Segui il progetto SEO dall'obiettivo alla verifica dei risultati.",
    steps: [
      ["Obiettivo", "Definisci il risultato SEO che vuoi ottenere."],
      ["Dati SEO", "Assicurati che audit e dati di ricerca siano disponibili."],
      ["WordPress", "Verifica connessione e permessi prima di scrivere."],
      ["Audit e problemi", "Analizza il sito e individua le priorità reali."],
      ["Correzioni", "Applica solo modifiche approvate e poi verificale."],
      ["Report", "Raccogli risultati e stato finale del progetto."],
    ],
  },
  Problemi: {
    intro: "Rivedi i problemi rilevati, scegli cosa affrontare e apri la risoluzione corretta.",
    steps: [
      ["Visualizza", "Esplora i problemi del progetto corrente."],
      ["Seleziona", "Apri un problema e leggi URL, prova e contesto."],
      ["Valuta", "Controlla gravità, priorità e correggibilità."],
      ["Risolvi", "Apri l'intervento assistito o la guida appropriata."],
    ],
  },
  "Audit SEO": {
    intro: "Crea una baseline tecnica prima di decidere cosa correggere.",
    steps: [
      ["Perimetro", "Scegli pagina singola oppure sito completo."],
      ["URL", "Indica il punto di partenza del controllo."],
      ["Avvia", "Esegui l'analisi e segui l'avanzamento."],
      ["Risultati", "Leggi score, problemi confermati e segnali da verificare."],
      ["Correggi", "Apri soltanto gli interventi realmente supportati."],
    ],
  },
  Posizionamenti: {
    intro: "Monitora query e pagine per capire dove stai crescendo e dove intervenire.",
    steps: [
      ["Dati", "Controlla che Search Console sia aggiornata."],
      ["Filtra", "Riduci query e pagine al segmento che ti interessa."],
      ["Andamento", "Leggi posizione, variazione e trend nel tempo."],
      ["Opportunità", "Trasforma i margini di crescita in azioni concrete."],
    ],
  },
  "Link interni": {
    intro: "Trova collegamenti interni utili e trasformali in azioni verificabili.",
    steps: [
      ["Analizza", "Controlla pagine e relazioni già presenti."],
      ["Seleziona", "Scegli solo suggerimenti pertinenti."],
      ["Crea task", "Trasforma le opportunità approvate in attività."],
      ["Verifica", "Controlla il risultato dopo l'applicazione."],
    ],
  },
  Opportunità: {
    intro: "Lavora su poche opportunità ordinate per impatto, non su liste da interpretare.",
    steps: [
      ["Filtra", "Mostra soltanto opportunità con dati utili."],
      ["Valuta", "Controlla pagina, query, posizione e potenziale."],
      ["Decidi", "Scegli se intervenire, rimandare o ignorare."],
      ["Crea task", "Trasforma la decisione in un'attività tracciabile."],
    ],
  },
  Correzioni: {
    intro: "Segui sempre lo stesso flusso: problema, proposta, approvazione, applicazione e verifica.",
    steps: [
      ["Problema", "Apri il problema confermato da correggere."],
      ["Proposta", "Genera o rivedi la correzione suggerita."],
      ["Approvazione", "Confronta prima/dopo e autorizza la singola modifica."],
      ["Applica", "Scrivi su WordPress soltanto dopo l'approvazione."],
      ["Verifica", "Ricontrolla frontend e audit prima di chiudere."],
    ],
  },
  Task: {
    intro: "Usa i task come una coda di lavoro semplice, ordinata e verificabile.",
    steps: [
      ["Filtra", "Mostra solo le attività rilevanti."],
      ["Apri", "Leggi problema, URL e priorità."],
      ["Esegui", "Completa l'azione nel modulo corretto."],
      ["Verifica", "Conferma che il risultato sia visibile."],
      ["Chiudi", "Segna completato solo dopo la verifica."],
    ],
  },
  "Piano editoriale": {
    intro: "Organizza contenuti, priorità e stato di avanzamento in un unico flusso.",
    steps: [
      ["Tema", "Scegli cluster o obiettivo editoriale."],
      ["Priorità", "Ordina i contenuti per opportunità e copertura."],
      ["Brief", "Definisci intento, pagina e indicazioni."],
      ["Produci", "Crea o aggiorna il contenuto."],
      ["Misura", "Controlla pubblicazione e risultati."],
    ],
  },
  "SEO Agent": {
    intro: "Dai un obiettivo alla volta e mantieni visibili piano, approvazioni ed esito.",
    steps: [
      ["Obiettivo", "Descrivi un risultato preciso e verificabile."],
      ["Modalità", "Scegli il livello di autonomia appropriato."],
      ["Piano", "Controlla le azioni proposte."],
      ["Approva", "Autorizza soltanto le operazioni desiderate."],
      ["Verifica", "Controlla output, fonti, costi ed esito."],
    ],
  },
  "GEO AI": {
    intro: "Valuta la leggibilità del brand e dei contenuti per sistemi generativi.",
    steps: [
      ["Contesto", "Seleziona progetto e contenuto."],
      ["Analizza", "Esegui i controlli GEO disponibili."],
      ["Priorità", "Individua le carenze azionabili."],
      ["Migliora", "Prepara interventi coerenti con brand e contenuto."],
      ["Verifica", "Ripeti il controllo dopo le modifiche."],
    ],
  },
  Integrazioni: {
    intro: "Configura una sorgente alla volta e considerala pronta solo dopo un test valido.",
    steps: [
      ["Scegli", "Apri l'integrazione necessaria al progetto."],
      ["Configura", "Inserisci soltanto i dati richiesti."],
      ["Verifica", "Esegui il test di connessione."],
      ["Salva", "Conserva la configurazione solo se valida."],
    ],
  },
  Impostazioni: {
    intro: "Modifica il minimo necessario e torna subito al lavoro operativo.",
    steps: [
      ["Sezione", "Apri soltanto il gruppo da modificare."],
      ["Modifica", "Cambia i parametri necessari."],
      ["Controlla", "Verifica dipendenze e conseguenze."],
      ["Salva", "Conferma e torna al flusso principale."],
    ],
  },
  Storico: {
    intro: "Ricostruisci cosa è stato fatto e con quale risultato.",
    steps: [
      ["Filtra", "Riduci lo storico al progetto o periodo utile."],
      ["Apri", "Esamina il run o la modifica rilevante."],
      ["Confronta", "Valuta differenze, esito e stato finale."],
    ],
  },
};

const DEFAULT_GUIDE = {
  intro: "Segui i passaggi in ordine e usa una sola azione principale per volta.",
  steps: [
    ["Controlla", "Verifica contesto e dati disponibili."],
    ["Esegui", "Completa l'azione principale della pagina."],
    ["Verifica", "Controlla il risultato prima di proseguire."],
  ],
};

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const readMode = () => {
  try {
    return localStorage.getItem(UI_MODE_KEY) === "advanced" ? "advanced" : "simple";
  } catch {
    return "simple";
  }
};

const readPage = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

const cleanSite = (value) => String(value || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");

const readableDate = (value) => {
  if (!value) return "mai";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "non disponibile";
  return date.toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const latestAnalysis = (value) => {
  if (Array.isArray(value)) return value[0] || null;
  return value && typeof value === "object" ? value : null;
};

const pageSlug = (page) => String(page || "")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

function useUiSnapshot() {
  const [, setVersion] = useState(0);
  const [page, setPage] = useState(readPage);
  const [mode, setMode] = useState(readMode);
  const [targets, setTargets] = useState({ sidebar: null, topbar: null, main: null });
  const [pageHosts, setPageHosts] = useState({ wizard: null, dashboard: null, help: null });

  useEffect(() => {
    const syncTargets = () => setTargets({
      sidebar: document.querySelector(".sidebar"),
      topbar: document.querySelector(".topbar"),
      main: document.querySelector(".app main"),
    });
    const frame = window.requestAnimationFrame(syncTargets);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setPage(readPage());
      setVersion((current) => current + 1);
    };
    const onChange = (event) => {
      if (event.target?.matches?.(".client-select select")) window.setTimeout(refresh, 0);
    };
    window.addEventListener("hashchange", refresh);
    window.addEventListener("seogrow-locationchange", refresh);
    window.addEventListener("seogrow-storage-ok", refresh);
    window.addEventListener("seogrow-remediation-history", refresh);
    document.addEventListener("change", onChange, true);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
      window.removeEventListener("seogrow-storage-ok", refresh);
      window.removeEventListener("seogrow-remediation-history", refresh);
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  useEffect(() => {
    document.body.dataset.seogrowUiMode = mode;
    document.body.dataset.seogrowPage = pageSlug(page);
    try {
      localStorage.setItem(UI_MODE_KEY, mode);
    } catch {
      /* La modalità resta valida per la sessione anche se lo storage non è disponibile. */
    }
    return () => {
      delete document.body.dataset.seogrowUiMode;
      delete document.body.dataset.seogrowPage;
    };
  }, [mode, page]);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    let wizardHost = null;
    let dashboardHost = null;
    let helpHost = null;

    const installHosts = () => {
      if (cancelled || !targets.main) return;
      const title = targets.main.querySelector(".page-title");
      if (!title) {
        if (attempts < 30) {
          attempts += 1;
          frame = window.requestAnimationFrame(installHosts);
        }
        return;
      }

      wizardHost = document.createElement("div");
      wizardHost.className = "guided-page-wizard-host";
      title.insertAdjacentElement("afterend", wizardHost);

      if (page === "Panoramica") {
        dashboardHost = document.createElement("div");
        dashboardHost.className = "guided-next-actions-host";
        wizardHost.insertAdjacentElement("afterend", dashboardHost);
      }

      helpHost = document.createElement("div");
      helpHost.className = "guided-page-help-host";
      targets.main.appendChild(helpHost);
      setPageHosts({ wizard: wizardHost, dashboard: dashboardHost, help: helpHost });
    };

    frame = window.requestAnimationFrame(installHosts);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      wizardHost?.remove();
      dashboardHost?.remove();
      helpHost?.remove();
    };
  }, [page, targets.main]);

  return { page, mode, setMode, targets, pageHosts };
}

function GuidedNav({ page, mode, setMode }) {
  return (
    <nav className="guided-nav" aria-label="Navigazione guidata SeoGrow">
      <div className="guided-nav-scroll">
        {groups.map((group) => {
          const visibleItems = group.items.filter(([label, , advancedOnly]) =>
            isNavigationItemVisible(label, advancedOnly, mode, page),
          );
          if (!visibleItems.length) return null;
          return (
            <section className="guided-nav-group" key={group.label}>
              <span className="guided-nav-label">{group.label}</span>
              {visibleItems.map(([label, Icon]) => (
                <button
                  type="button"
                  key={label}
                  className={page === label ? "active" : ""}
                  aria-current={page === label ? "page" : undefined}
                  onClick={() => navigate(label)}
                >
                  <Icon />
                  <span>{label}</span>
                </button>
              ))}
            </section>
          );
        })}
      </div>
      <button
        type="button"
        className="guided-mode-toggle"
        onClick={() => setMode(mode === "simple" ? "advanced" : "simple")}
        aria-pressed={mode === "advanced"}
      >
        <SlidersHorizontal />
        <span>
          <strong>{mode === "simple" ? "Modalità semplice" : "Modalità avanzata"}</strong>
          <small>{mode === "simple" ? "Mostra tutti gli strumenti" : "Riduci le voci del menu"}</small>
        </span>
      </button>
    </nav>
  );
}

function ProjectContext({ client, dataset, analysis }) {
  if (!client) return null;
  return (
    <div className="guided-project-context" aria-label="Contesto del progetto attivo">
      <span className="guided-project-dot" aria-hidden="true" />
      <span className="guided-project-name"><small>Progetto attuale</small><strong>{client.name}</strong></span>
      <a href={client.url} target="_blank" rel="noreferrer" title={client.url}><Globe2 />{cleanSite(client.url)}</a>
      <span className="guided-context-freshness"><Database /> GSC {readableDate(dataset?.importedAt || dataset?.dateTo)} · Audit {readableDate(analysis?.analyzedAt)}</span>
    </div>
  );
}

function PageWizard({ page }) {
  const guide = PAGE_GUIDES[page] || DEFAULT_GUIDE;
  const [step, setStep] = useState(0);
  const last = guide.steps.length - 1;
  const progress = `${Math.round(((step + 1) / guide.steps.length) * 100)}%`;

  return (
    <section className="guided-page-wizard" aria-label={`Percorso guidato per ${page}`}>
      <header className="guided-wizard-head">
        <div><h2>Percorso guidato</h2><p>{guide.intro}</p></div>
        <div className="guided-wizard-progress" aria-label={`Passo ${step + 1} di ${guide.steps.length}`}>
          <span><i style={{ width: progress }} /></span>
          <strong>Passo {step + 1} di {guide.steps.length}</strong>
        </div>
      </header>

      <div className={`guided-wizard-cards count-${Math.min(guide.steps.length, 6)}`} role="list">
        {guide.steps.map(([label, detail], index) => (
          <button
            type="button"
            key={`${page}-${label}`}
            className={`guided-step-card tone-${index % 2 ? "mint" : "blue"} ${index === step ? "active" : ""} ${index < step ? "done" : ""}`}
            aria-current={index === step ? "step" : undefined}
            onClick={() => setStep(index)}
          >
            <span className="guided-step-number">{index + 1}</span>
            <span className="guided-step-copy"><strong>{label}</strong><small>{detail}</small></span>
            <span className="guided-step-action">{index === step ? "Step attivo" : "Apri step"}<ChevronRight /></span>
          </button>
        ))}
      </div>

      <div className="guided-wizard-footer">
        <span><strong>{guide.steps[step][0]}</strong> · {guide.steps[step][1]}</span>
        <div>
          <button type="button" className="secondary mini" disabled={step === 0} onClick={() => setStep((value) => value - 1)}><ChevronLeft /> Indietro</button>
          <button type="button" className="primary mini" disabled={step === last} onClick={() => setStep((value) => value + 1)}>Successivo <ChevronRight /></button>
        </div>
      </div>
    </section>
  );
}

function PageHelp({ page }) {
  const guide = PAGE_GUIDES[page] || DEFAULT_GUIDE;
  return (
    <section className="guided-page-help" aria-labelledby="guided-page-help-title">
      <div className="guided-page-help-head">
        <span className="guided-help-icon"><HelpCircle /></span>
        <div><h2 id="guided-page-help-title">Spiegazioni in fondo alla pagina</h2><p>Apri soltanto il passaggio per cui ti serve un chiarimento.</p></div>
      </div>
      <div className="guided-help-list">
        {guide.steps.map(([label, detail], index) => (
          <details key={`${page}-help-${label}`}>
            <summary><span>{index + 1}</span><strong>{label}</strong><small>{detail}</small><ChevronDown /></summary>
            <p>{detail}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function NextActions({ client, tasks, dataset, analysis, corrections }) {
  const activeTasks = tasks.filter((task) => !task.stale && task.status !== "Completato");
  const highTasks = activeTasks.filter((task) => task.priority === "Alta").length;
  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const pendingCorrections = corrections.filter((item) => ["Applicato", "Da verificare"].includes(item.status));
  const opportunities = opportunityGroups(dataset).quickWins.length;
  const actions = [];

  if (activeTasks.length) {
    actions.push({ page: "Task", Icon: ClipboardCheck, tone: highTasks ? "urgent" : "normal", title: `${activeTasks.length} task aperte${highTasks ? ` · ${highTasks} ad alta priorità` : ""}`, text: "Lavora prima sulle attività con maggiore impatto." });
  } else if (!analysis) {
    actions.push({ page: "Audit SEO", Icon: CircleGauge, tone: "normal", title: "Manca una baseline tecnica", text: "Esegui un audit per avere problemi e priorità verificabili." });
  } else if (issues.length) {
    actions.push({ page: "Problemi", Icon: AlertTriangle, tone: "urgent", title: `${issues.length} problemi nell'ultimo audit`, text: "Apri il Centro Problemi e scegli cosa affrontare." });
  }

  if (pendingCorrections.length) {
    actions.push({ page: "Correzioni", Icon: CheckCircle2, tone: "verify", title: `${pendingCorrections.length} correzioni da verificare`, text: "Controlla che ciò che è stato scritto sia realmente risolto." });
  }

  if (!dataset) {
    actions.push({ page: "Integrazioni", Icon: Database, tone: "normal", title: "Search Console non disponibile", text: "Importa i dati per vedere query, pagine e andamento organico." });
  } else if (opportunities) {
    actions.push({ page: "Opportunità", Icon: Target, tone: "growth", title: `${opportunities} opportunità rapide`, text: "Valuta le query tra posizione 4 e 20 con dati sufficienti." });
  }

  if (actions.length < 4 && dataset && analysis) {
    actions.push({ page: "SEO Agent", Icon: WandSparkles, tone: "ai", title: "Chiedi la prossima priorità", text: "Usa insieme audit e dati del progetto per decidere il prossimo intervento." });
  }

  return (
    <section className="guided-next-actions" aria-labelledby="guided-next-actions-title">
      <div className="guided-next-actions-head"><div><h2 id="guided-next-actions-title">Cosa fare adesso</h2><p>Priorità operative per {client?.name || "il progetto"}.</p></div></div>
      <div className="guided-action-grid">
        {actions.slice(0, 4).map(({ page: targetPage, Icon, tone, title, text }, index) => (
          <button type="button" className={`guided-action-card ${tone} tone-${index % 2 ? "mint" : "blue"}`} key={`${targetPage}-${title}`} onClick={() => navigate(targetPage)}>
            <span className="guided-action-icon"><Icon /></span>
            <span><strong>{title}</strong><small>{text}</small></span>
            <b aria-hidden="true">→</b>
          </button>
        ))}
        {!actions.length && (
          <button type="button" className="guided-action-card complete tone-mint" onClick={() => navigate("Audit SEO")}>
            <span className="guided-action-icon"><CheckCircle2 /></span><span><strong>Nessuna urgenza rilevata</strong><small>Puoi rieseguire l'audit per aggiornare la situazione.</small></span><b aria-hidden="true">→</b>
          </button>
        )}
      </div>
    </section>
  );
}

export default function GuidedUxLayer() {
  const { page, mode, setMode, targets, pageHosts } = useUiSnapshot();
  const clients = readJson(CLIENTS_KEY, []);
  const domClientId = Number(document.querySelector(".client-select select")?.value || 0);
  const selectedClientId = domClientId || Number(readJson(SELECTED_CLIENT_KEY, 0));
  const client = clients.find((item) => item.id === selectedClientId) || clients[0] || null;
  const tasks = readJson(TASKS_KEY, []).filter((task) => task.sourceClientId === client?.id || (!task.sourceClientId && task.client === client?.name));
  const gscData = readJson(GSC_KEY, {});
  const analyses = readJson(ANALYSES_KEY, {});
  const corrections = readJson(REMEDIATION_INDEX_KEY, []).filter((item) => Number(item.clientId) === Number(client?.id));
  const snapshot = {
    client,
    tasks,
    dataset: client ? gscData[client.id] || null : null,
    analysis: client ? latestAnalysis(analyses[client.id]) : null,
    corrections,
  };

  return (
    <>
      {targets.sidebar && createPortal(<GuidedNav page={page} mode={mode} setMode={setMode} />, targets.sidebar)}
      {targets.topbar && createPortal(<ProjectContext client={snapshot.client} dataset={snapshot.dataset} analysis={snapshot.analysis} />, targets.topbar)}
      {pageHosts.wizard && createPortal(<PageWizard key={page} page={page} />, pageHosts.wizard)}
      {pageHosts.dashboard && createPortal(<NextActions {...snapshot} />, pageHosts.dashboard)}
      {pageHosts.help && createPortal(<PageHelp page={page} />, pageHosts.help)}
    </>
  );
}
