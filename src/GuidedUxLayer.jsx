import { readWorkspaceJson as readJson } from "./core/workspace/jsonStorage.js";
import { registerPageHost } from "./PageStartHierarchy.js";
import { navigatePage as navigate, isNavigationItemVisible } from "./navigationUx.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { SUITE_NAVIGATION } from "./suite/navigationModel.js";
import { useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
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

const UI_MODE_KEY = WORKSPACE_KEYS.uiMode;
const SELECTED_CLIENT_KEY = WORKSPACE_KEYS.selectedClient;
const CLIENTS_KEY = WORKSPACE_KEYS.clients;
const GSC_KEY = WORKSPACE_KEYS.gsc;
const ANALYSES_KEY = WORKSPACE_KEYS.analyses;

const NAV_ICONS = Object.freeze({
  overview: CircleGauge,
  clients: Users,
  project: ClipboardCheck,
  history: History,
  audit: CircleGauge,
  problems: ListChecks,
  rankings: BarChart3,
  opportunities: Target,
  content: FileText,
  links: Link2,
  geo: Sparkles,
  fix: CheckCircle2,
  tasks: ClipboardCheck,
  agent: WandSparkles,
  "ai-overview": Sparkles,
  integrations: Plug,
  settings: Settings,
});

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
  "SeoGrow AI": {
    intro: "Usa una vista unica per passare dai dati alle azioni principali.",
    steps: [
      ["Stato", "Controlla analisi, task, keyword e progetti disponibili."],
      ["Andamento", "Leggi i dati organici reali del progetto selezionato."],
      ["Azione", "Apri audit, opportunità, contenuti o correzioni."],
      ["AI", "Passa al SEO Agent per un obiettivo assistito."],
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
  const [pageHosts, setPageHosts] = useState({ wizard: null, help: null });

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    let cancelled = false;
    const syncTargets = () => {
      if (cancelled) return;
      const next = {
        sidebar: document.querySelector(".sidebar"),
        topbar: document.querySelector(".topbar"),
        main: document.querySelector(".app main"),
      };
      setTargets((current) =>
        current.sidebar === next.sidebar && current.topbar === next.topbar && current.main === next.main
          ? current
          : next,
      );
      if ((!next.sidebar || !next.topbar || !next.main) && attempts < 120) {
        attempts += 1;
        frame = window.requestAnimationFrame(syncTargets);
      }
    };
    const scheduleSync = () => {
      window.cancelAnimationFrame(frame);
      attempts = 0;
      const settle = () => {
        syncTargets();
        attempts += 1;
        if (attempts < 8) frame = window.requestAnimationFrame(settle);
      };
      frame = window.requestAnimationFrame(settle);
    };
    scheduleSync();
    window.addEventListener("hashchange", scheduleSync);
    window.addEventListener("popstate", scheduleSync);
    window.addEventListener("seogrow-locationchange", scheduleSync);
    window.addEventListener("seogrow-storage-ok", scheduleSync);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", scheduleSync);
      window.removeEventListener("popstate", scheduleSync);
      window.removeEventListener("seogrow-locationchange", scheduleSync);
      window.removeEventListener("seogrow-storage-ok", scheduleSync);
    };
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

  useLayoutEffect(() => {
    const slug = pageSlug(page);
    document.body.dataset.seogrowUiMode = mode;
    document.body.dataset.seogrowPage = slug;
    try {
      localStorage.setItem(UI_MODE_KEY, mode);
    } catch {
      /* La modalità resta valida per la sessione anche se lo storage non è disponibile. */
    }
    return () => {
      if (document.body.dataset.seogrowUiMode === mode) delete document.body.dataset.seogrowUiMode;
      if (document.body.dataset.seogrowPage === slug) delete document.body.dataset.seogrowPage;
    };
  }, [mode, page]);

  useEffect(() => {
    const releases = [];
    const frame = window.requestAnimationFrame(() => {
      const make = (className) => {
        const host = document.createElement("div");
        host.className = className;
        releases.push(registerPageHost(page, host));
        return host;
      };
      const wizard = make("guided-page-wizard-host");
      const help = make("guided-page-help-host");
      setPageHosts({ wizard, help });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      for (const release of releases) release();
    };
  }, [page]);

  return { page, mode, setMode, targets, pageHosts };
}

function GuidedNav({ page, mode, setMode }) {
  return (
    <nav className="guided-nav" aria-label="Navigazione SeoGrow Suite">
      <div className="guided-nav-scroll">
        {SUITE_NAVIGATION.map((group, groupIndex) => {
          const visibleItems = group.items.filter((item) =>
            isNavigationItemVisible(item.page, item.advancedOnly, mode, page),
          );
          if (!visibleItems.length) return null;
          return (
            <section className={`guided-nav-group tone-${groupIndex % 2 ? "mint" : "blue"}`} key={group.label}>
              <span className="guided-nav-label">{group.label}</span>
              {visibleItems.map((item) => {
                const Icon = NAV_ICONS[item.icon] || CircleGauge;
                return (
                  <button
                    type="button"
                    key={item.page}
                    data-seogrow-page={item.page}
                    className={page === item.page ? "active" : ""}
                    aria-current={page === item.page ? "page" : undefined}
                    onClick={() => navigate(item.page)}
                  >
                    <Icon />
                    <span>{item.label}</span>
                    {item.label !== item.page && <span hidden aria-hidden="true">{item.page}</span>}
                  </button>
                );
              })}
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

export default function GuidedUxLayer() {
  const { page, mode, setMode, targets, pageHosts } = useUiSnapshot();
  const clients = readJson(CLIENTS_KEY, []);
  const domClientId = Number(document.querySelector(".client-select select")?.value || 0);
  const selectedClientId = domClientId || Number(readJson(SELECTED_CLIENT_KEY, 0));
  const client = clients.find((item) => item.id === selectedClientId) || clients[0] || null;
  const gscData = readJson(GSC_KEY, {});
  const analyses = readJson(ANALYSES_KEY, {});
  const snapshot = {
    client,
    dataset: client ? gscData[client.id] || null : null,
    analysis: client ? latestAnalysis(analyses[client.id]) : null,
  };

  return (
    <>
      {targets.sidebar && createPortal(<GuidedNav page={page} mode={mode} setMode={setMode} />, targets.sidebar)}
      {targets.topbar && createPortal(<ProjectContext client={snapshot.client} dataset={snapshot.dataset} analysis={snapshot.analysis} />, targets.topbar)}
      {pageHosts.wizard && createPortal(<PageWizard key={page} page={page} />, pageHosts.wizard)}
      {pageHosts.help && createPortal(<PageHelp page={page} />, pageHosts.help)}
    </>
  );
}
