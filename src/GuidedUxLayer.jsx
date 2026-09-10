import { opportunityGroups } from "./platform.js";
import { navigatePage as navigate, isNavigationItemVisible } from "./navigationUx.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
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
      ["Centro progetto", ClipboardCheck],
      ["Clienti", Users],
      ["Storico", History, true],
    ],
  },
  {
    label: "Analizza",
    items: [
      ["Audit SEO", CircleGauge],
      ["Link interni", Link2],
      ["Posizionamenti", BarChart3],
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
    intro: "La Panoramica serve solo a capire lo stato del progetto e scegliere la prossima azione utile.",
    steps: [
      ["Controlla", "Verifica progetto attivo, dati disponibili e avvisi principali."],
      ["Priorità", "Leggi le azioni suggerite e parti da quella con maggiore impatto."],
      ["Apri", "Entra nel modulo indicato senza cercare la funzione nel menu."],
    ],
  },
  "Centro progetto": {
    intro: "Qui prepari il progetto una volta e poi passi al lavoro operativo.",
    steps: [
      ["Obiettivo", "Definisci il risultato SEO che vuoi ottenere."],
      ["Dati", "Assicurati che Search Console e audit siano disponibili."],
      ["WordPress", "Verifica la connessione prima di preparare o applicare modifiche."],
      ["Correggi", "Apri i problemi e prepara solo le correzioni realmente supportate."],
      ["Report", "Condividi i risultati quando il ciclo di lavoro è concluso."],
    ],
  },
  Clienti: {
    intro: "Ogni sito deve avere un progetto chiaro e isolato dagli altri.",
    steps: [
      ["Seleziona", "Scegli il progetto su cui vuoi lavorare."],
      ["Controlla sito", "Verifica URL e dati identificativi prima di continuare."],
      ["Collega", "Configura le integrazioni necessarie al progetto."],
      ["Lavora", "Passa al Centro progetto o all'Audit SEO."],
    ],
  },
  Storico: {
    intro: "Lo Storico serve a ricostruire cosa è stato fatto e con quale risultato.",
    steps: [
      ["Filtra", "Riduci l'elenco al progetto o al periodo che ti interessa."],
      ["Apri", "Esamina il run o la modifica rilevante."],
      ["Confronta", "Valuta differenze, esito e stato finale."],
    ],
  },
  "Audit SEO": {
    intro: "L'audit crea la baseline tecnica su cui basare problemi, task e correzioni.",
    steps: [
      ["Perimetro", "Scegli se analizzare una pagina o l'intero sito."],
      ["Avvia", "Inserisci l'URL e avvia il controllo."],
      ["Risultati", "Leggi prima il riepilogo e i problemi confermati."],
      ["Problemi", "Apri solo le anomalie che richiedono un intervento."],
      ["Correggi", "Prepara una correzione o crea un task quando necessario."],
    ],
  },
  "Link interni": {
    intro: "Usa questa pagina per trovare collegamenti interni mancanti o migliorabili.",
    steps: [
      ["Analizza", "Controlla le pagine e le relazioni già presenti."],
      ["Seleziona", "Scegli solo opportunità pertinenti e utili all'utente."],
      ["Crea task", "Trasforma le opportunità approvate in attività operative."],
      ["Verifica", "Controlla il risultato dopo l'applicazione sul sito."],
    ],
  },
  Posizionamenti: {
    intro: "Qui trasformi i dati di ricerca in priorità concrete per pagine e query.",
    steps: [
      ["Dati", "Verifica che l'import Search Console sia aggiornato."],
      ["Filtra", "Riduci query e pagine al segmento che vuoi analizzare."],
      ["Priorità", "Individua cali, crescita e posizioni migliorabili."],
      ["Azione", "Crea un task o apri l'opportunità collegata."],
    ],
  },
  Opportunità: {
    intro: "Questa pagina deve mostrare poche opportunità ordinate per impatto, non un elenco da interpretare.",
    steps: [
      ["Seleziona", "Parti dalle opportunità con dati sufficienti."],
      ["Valuta", "Controlla pagina, query, posizione e potenziale."],
      ["Decidi", "Scegli se intervenire ora, rimandare o ignorare."],
      ["Crea task", "Trasforma la decisione in un'attività tracciabile."],
    ],
  },
  Correzioni: {
    intro: "Il flusso di correzione deve essere sequenziale: problema, proposta, connessione, applicazione, verifica.",
    steps: [
      ["Problema", "Apri un problema confermato e verifica la pagina interessata."],
      ["Genera", "Prepara la correzione automatica o assistita."],
      ["WordPress", "Verifica la connessione e i permessi prima di scrivere."],
      ["Applica", "Applica solo la modifica approvata."],
      ["Verifica", "Ricontrolla il sito e chiudi il problema solo se risolto."],
    ],
  },
  Task: {
    intro: "I task devono essere una coda di lavoro semplice, ordinata e verificabile.",
    steps: [
      ["Filtra", "Mostra solo le attività rilevanti per il progetto corrente."],
      ["Apri", "Leggi problema, URL e priorità prima di intervenire."],
      ["Esegui", "Completa l'azione nel modulo corretto."],
      ["Verifica", "Conferma che il risultato sia effettivamente visibile."],
      ["Chiudi", "Segna completato solo dopo la verifica."],
    ],
  },
  "Piano editoriale": {
    intro: "Il piano editoriale organizza contenuti utili, priorità e stato di avanzamento.",
    steps: [
      ["Tema", "Scegli il cluster o l'obiettivo editoriale."],
      ["Priorità", "Ordina i contenuti per opportunità e copertura."],
      ["Prepara", "Definisci brief, pagina e intento."],
      ["Produci", "Crea o aggiorna il contenuto."],
      ["Misura", "Controlla pubblicazione e risultati."],
    ],
  },
  "SEO Agent": {
    intro: "L'agente deve lavorare su un obiettivo alla volta e rendere visibili piano, approvazioni ed esito.",
    steps: [
      ["Obiettivo", "Descrivi un risultato preciso e verificabile."],
      ["Modalità", "Scegli il livello di autonomia appropriato."],
      ["Piano", "Controlla le azioni proposte prima dell'esecuzione."],
      ["Approva", "Autorizza soltanto le operazioni che vuoi eseguire."],
      ["Verifica", "Controlla output, fonti, costi ed esito finale."],
    ],
  },
  "GEO AI": {
    intro: "GEO AI serve a valutare e migliorare la leggibilità del brand e dei contenuti per sistemi generativi.",
    steps: [
      ["Contesto", "Seleziona progetto e contenuto da valutare."],
      ["Analizza", "Esegui i controlli disponibili senza confonderli con ranking Google."],
      ["Priorità", "Individua le carenze realmente azionabili."],
      ["Migliora", "Prepara interventi coerenti con il contenuto e il brand."],
      ["Verifica", "Ripeti il controllo dopo le modifiche."],
    ],
  },
  Integrazioni: {
    intro: "Configura una sorgente alla volta e considerala pronta solo dopo una verifica riuscita.",
    steps: [
      ["Scegli", "Apri l'integrazione che serve al progetto."],
      ["Configura", "Inserisci solo i dati richiesti."],
      ["Verifica", "Esegui il test di connessione."],
      ["Salva", "Conserva la configurazione soltanto se il test è valido."],
    ],
  },
  Impostazioni: {
    intro: "Le impostazioni raccolgono preferenze globali e limiti operativi; non devono interrompere il lavoro quotidiano.",
    steps: [
      ["Sezione", "Apri solo il gruppo di impostazioni che vuoi modificare."],
      ["Modifica", "Cambia il minimo necessario."],
      ["Controlla", "Verifica eventuali dipendenze o limiti."],
      ["Salva", "Conferma e torna al flusso operativo."],
    ],
  },
};

const DEFAULT_GUIDE = {
  intro: "Segui i passaggi in ordine e usa una sola azione principale per volta.",
  steps: [
    ["Controlla", "Verifica il contesto e i dati disponibili."],
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
    const value = localStorage.getItem(UI_MODE_KEY);
    return value === "advanced" ? "advanced" : "simple";
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

const cleanSite = (value) =>
  String(value || "")
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "");

const readableDate = (value) => {
  if (!value) return "mai";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "non disponibile";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const latestAnalysis = (value) => {
  if (Array.isArray(value)) return value[0] || null;
  if (value && typeof value === "object") return value;
  return null;
};

function useUiSnapshot() {
  const [, setVersion] = useState(0);
  const [page, setPage] = useState(readPage);
  const [mode, setMode] = useState(readMode);
  const [targets, setTargets] = useState({ sidebar: null, topbar: null, main: null });
  const [pageHosts, setPageHosts] = useState({ wizard: null, dashboard: null, help: null });

  useEffect(() => {
    const syncTargets = () =>
      setTargets({
        sidebar: document.querySelector(".sidebar"),
        topbar: document.querySelector(".topbar"),
        main: document.querySelector(".app main"),
      });
    syncTargets();
    const frame = window.requestAnimationFrame(syncTargets);
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setPage(readPage());
      setVersion((current) => current + 1);
    };
    const onChange = (event) => {
      if (event.target?.matches?.(".client-select select")) {
        window.setTimeout(refresh, 0);
      }
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
    try {
      localStorage.setItem(UI_MODE_KEY, mode);
    } catch {
      /* La modalità resta valida per la sessione anche se lo storage non è disponibile. */
    }
    return () => {
      if (document.body.dataset.seogrowUiMode === mode)
        delete document.body.dataset.seogrowUiMode;
    };
  }, [mode]);

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

    installHosts();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      wizardHost?.remove();
      dashboardHost?.remove();
      helpHost?.remove();
      setPageHosts({ wizard: null, dashboard: null, help: null });
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

function ProjectContext({ client, dataset, analysis, page }) {
  if (!client) return null;
  return (
    <div className="guided-project-context" aria-label="Contesto del progetto attivo">
      <span className="guided-context-path">
        <strong>{client.name}</strong>
        <i>/</i>
        <b>{page}</b>
      </span>
      <a href={client.url} target="_blank" rel="noreferrer" title={client.url}>
        <Globe2 />
        {cleanSite(client.url)}
      </a>
      <span className="guided-context-freshness">
        <Database />
        GSC {readableDate(dataset?.importedAt || dataset?.dateTo)} · Audit {readableDate(analysis?.analyzedAt)}
      </span>
    </div>
  );
}

function PageWizard({ page }) {
  const guide = PAGE_GUIDES[page] || DEFAULT_GUIDE;
  const [step, setStep] = useState(0);

  useEffect(() => setStep(0), [page]);

  const last = guide.steps.length - 1;
  return (
    <section className="guided-page-wizard" aria-label={`Passaggi guidati per ${page}`}>
      <div className="guided-wizard-steps" role="list">
        {guide.steps.map(([label], index) => (
          <button
            type="button"
            key={`${page}-${label}`}
            className={index === step ? "active" : index < step ? "done" : ""}
            aria-current={index === step ? "step" : undefined}
            onClick={() => setStep(index)}
          >
            <span className="guided-step-number">{index + 1}</span>
            <strong>{label}</strong>
          </button>
        ))}
      </div>
      <div className="guided-wizard-footer">
        <span>Passaggio <strong>{step + 1}</strong> di {guide.steps.length}: {guide.steps[step][0]}</span>
        <div>
          <button type="button" className="secondary mini" disabled={step === 0} onClick={() => setStep((value) => value - 1)}>
            <ChevronLeft /> Indietro
          </button>
          <button type="button" className="primary mini" disabled={step === last} onClick={() => setStep((value) => value + 1)}>
            Successivo <ChevronRight />
          </button>
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
        <div>
          <span className="guided-eyebrow">Spiegazioni</span>
          <h2 id="guided-page-help-title">Come usare questa pagina</h2>
          <p>{guide.intro}</p>
        </div>
      </div>
      <ol>
        {guide.steps.map(([label, detail], index) => (
          <li key={`${page}-help-${label}`}>
            <span>{index + 1}</span>
            <div><strong>{label}</strong><p>{detail}</p></div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NextActions({ client, tasks, dataset, analysis, corrections }) {
  const activeTasks = tasks.filter(
    (task) => !task.stale && task.status !== "Completato",
  );
  const highTasks = activeTasks.filter((task) => task.priority === "Alta").length;
  const issues = Array.isArray(analysis?.issues) ? analysis.issues : [];
  const pendingCorrections = corrections.filter((item) =>
    ["Applicato", "Da verificare"].includes(item.status),
  );
  const opportunities = opportunityGroups(dataset).quickWins.length;

  const actions = [];
  if (activeTasks.length) {
    actions.push({
      page: "Task",
      Icon: ClipboardCheck,
      tone: highTasks ? "urgent" : "normal",
      title: `${activeTasks.length} task aperte${highTasks ? ` · ${highTasks} ad alta priorità` : ""}`,
      text: "Apri l’elenco ordinato e lavora prima sulle attività con maggiore impatto.",
    });
  } else if (!analysis) {
    actions.push({
      page: "Audit SEO",
      Icon: CircleGauge,
      tone: "normal",
      title: "Manca una baseline tecnica",
      text: "Esegui un audit per avere problemi e priorità verificabili del progetto.",
    });
  } else if (issues.length) {
    actions.push({
      page: "Audit SEO",
      Icon: AlertTriangle,
      tone: "urgent",
      title: `${issues.length} problemi nell’ultimo audit`,
      text: "Rivedi i controlli tecnici e le evidenze prima di applicare nuove modifiche.",
    });
  }

  if (pendingCorrections.length) {
    actions.push({
      page: "Correzioni",
      Icon: CheckCircle2,
      tone: "verify",
      title: `${pendingCorrections.length} correzioni da verificare`,
      text: "Controlla che ciò che è stato scritto sia realmente visibile e risolto sul sito.",
    });
  }

  if (!dataset) {
    actions.push({
      page: "Integrazioni",
      Icon: Database,
      tone: "normal",
      title: "Search Console non ancora disponibile",
      text: "Importa o collega i dati per opportunità, query e andamento organico reali.",
    });
  } else if (opportunities) {
    actions.push({
      page: "Opportunità",
      Icon: Target,
      tone: "growth",
      title: `${opportunities} query tra posizione 4 e 20`,
      text: "Almeno 10 impressioni; fino a 50 opportunità ordinate per impressioni.",
    });
  }

  if (actions.length < 4 && dataset && analysis) {
    actions.push({
      page: "SEO Agent",
      Icon: WandSparkles,
      tone: "ai",
      title: "Chiedi a SeoGrow la prossima priorità",
      text: "Usa insieme audit e dati del progetto per decidere il prossimo intervento.",
    });
  }

  const shown = actions.slice(0, 4);
  return (
    <section className="guided-next-actions" aria-labelledby="guided-next-actions-title">
      <div className="guided-next-actions-head">
        <div>
          <span className="guided-eyebrow">Percorso guidato</span>
          <h2 id="guided-next-actions-title">Cosa fare adesso</h2>
          <p>Priorità operative per {client?.name || "il progetto"}, ricavate dai dati già presenti in SeoGrow.</p>
        </div>
        <span className="guided-flow">Analizza → Capisci → Correggi → Verifica → Monitora</span>
      </div>
      <div className="guided-action-grid">
        {shown.length ? (
          shown.map(({ page: targetPage, Icon, tone, title, text }) => (
            <button
              type="button"
              className={`guided-action-card ${tone}`}
              key={`${targetPage}-${title}`}
              onClick={() => navigate(targetPage)}
            >
              <span className="guided-action-icon"><Icon /></span>
              <span>
                <strong>{title}</strong>
                <small>{text}</small>
              </span>
              <b aria-hidden="true">→</b>
            </button>
          ))
        ) : (
          <button type="button" className="guided-action-card complete" onClick={() => navigate("Audit SEO")}>
            <span className="guided-action-icon"><CheckCircle2 /></span>
            <span>
              <strong>Nessuna urgenza rilevata</strong>
              <small>Puoi rieseguire l’audit per aggiornare la situazione del progetto.</small>
            </span>
            <b aria-hidden="true">→</b>
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
  const tasks = readJson(TASKS_KEY, []).filter(
    (task) =>
      task.sourceClientId === client?.id ||
      (!task.sourceClientId && task.client === client?.name),
  );
  const gscData = readJson(GSC_KEY, {});
  const analyses = readJson(ANALYSES_KEY, {});
  const corrections = readJson(REMEDIATION_INDEX_KEY, []).filter(
    (item) => Number(item.clientId) === Number(client?.id),
  );
  const snapshot = {
    client,
    tasks,
    dataset: client ? gscData[client.id] || null : null,
    analysis: client ? latestAnalysis(analyses[client.id]) : null,
    corrections,
  };

  return (
    <>
      {targets.sidebar &&
        createPortal(
          <GuidedNav page={page} mode={mode} setMode={setMode} />,
          targets.sidebar,
        )}
      {targets.topbar &&
        createPortal(
          <ProjectContext
            client={snapshot.client}
            dataset={snapshot.dataset}
            analysis={snapshot.analysis}
            page={page}
          />,
          targets.topbar,
        )}
      {pageHosts.wizard && createPortal(<PageWizard page={page} />, pageHosts.wizard)}
      {pageHosts.dashboard && createPortal(<NextActions {...snapshot} />, pageHosts.dashboard)}
      {pageHosts.help && createPortal(<PageHelp page={page} />, pageHosts.help)}
    </>
  );
}
