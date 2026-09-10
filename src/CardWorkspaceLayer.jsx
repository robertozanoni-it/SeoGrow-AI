import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CalendarDays,
  ChevronRight,
  ExternalLink,
  Layers3,
  Settings2,
} from "lucide-react";
import { navigatePage } from "./navigationUx.js";
import { opportunityGroups } from "./platform.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import "./CardWorkspaceLayer.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const CARD_EXCLUDED_PAGES = new Set(["Centro progetto"]);

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const pageFromHash = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

const arrayForClient = (store, clientId) => {
  const value = store?.[clientId] ?? store?.[String(clientId)] ?? [];
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
};

const validDate = (value) => {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "";
};

const firstDate = (...values) => {
  for (const value of values) {
    const normalized = validDate(value);
    if (normalized) return normalized;
  }
  return "";
};

const maxDate = (values) => {
  const dates = values.map(validDate).filter(Boolean).map((value) => Date.parse(value));
  return dates.length ? new Date(Math.max(...dates)).toISOString() : "";
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

const shortUrl = (value) => String(value || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");

const compact = (value, max = 180) => {
  if (value == null || value === "") return "—";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

const safeLink = (value) => {
  try {
    const url = new URL(String(value || ""));
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const field = (label, value) => ({ label, value: compact(value, 420) });

const card = ({
  id,
  date,
  title,
  subtitle = "",
  fields = [],
  rows = [],
  url = "",
  kind = "record",
  solutions = [],
  actionPage = "",
  actionLabel = "",
}) => ({
  id,
  date: validDate(date),
  title: compact(title, 100),
  subtitle: compact(subtitle, 150),
  fields,
  rows,
  url: safeLink(url),
  kind,
  solutions,
  actionPage,
  actionLabel,
});

const clientTasks = (tasks, client) => tasks.filter((task) =>
  Number(task.sourceClientId) === Number(client?.id) ||
  (!task.sourceClientId && task.client === client?.name),
);

const starter = (page, client, date = "") => {
  const definitions = {
    "Audit SEO": {
      title: "Nuova analisi SEO",
      subtitle: "Avvia o aggiorna la baseline tecnica",
      fields: [field("Progetto", client?.name || "—"), field("Modalità", "Pagina singola o sito completo")],
      solutions: ["Scegli il perimetro dell’analisi.", "Avvia il controllo.", "Apri poi i problemi confermati."],
    },
    Problemi: {
      title: "Centro problemi",
      subtitle: "Rileva, filtra e risolvi i problemi SEO",
      fields: [field("Progetto", client?.name || "—"), field("Fonte", "Audit SEO salvati")],
      solutions: ["Aggiorna l’audit se i dati sono vecchi.", "Apri un problema alla volta.", "Verifica evidenza e correggibilità prima di intervenire."],
      actionPage: "Audit SEO",
      actionLabel: "Aggiorna audit",
    },
    Correzioni: {
      title: "Correzioni e verifiche",
      subtitle: "Proposte, approvazioni, applicazioni e rollback",
      fields: [field("Progetto", client?.name || "—"), field("Regola", "Nessuna scrittura senza approvazione")],
      solutions: ["Apri una correzione preparata.", "Confronta Prima/Dopo.", "Applica solo dopo approvazione e riverifica il risultato."],
      actionPage: "Problemi",
      actionLabel: "Apri problemi",
    },
    Posizionamenti: {
      title: "Nuovo controllo posizionamenti",
      subtitle: "Verifica keyword e URL tramite DataForSEO",
      fields: [field("Progetto", client?.name || "—"), field("Output", "Posizione, variazione e URL")],
      solutions: ["Inserisci le keyword da controllare.", "Scegli dispositivo e profondità.", "Confronta il risultato con il precedente controllo comparabile."],
      actionPage: "Opportunità",
      actionLabel: "Apri opportunità",
    },
    "Link interni": {
      title: "Analisi link interni",
      subtitle: "Link interrotti e collegamenti suggeriti",
      fields: [field("Progetto", client?.name || "—"), field("Fonte", "Ultimo crawl")],
      solutions: ["Controlla prima i link interrotti.", "Valuta editorialmente i suggerimenti.", "Trasforma gli interventi approvati in task."],
      actionPage: "Task",
      actionLabel: "Apri task",
    },
    Opportunità: {
      title: "Opportunità SEO",
      subtitle: "Query e pagine con margine di crescita",
      fields: [field("Progetto", client?.name || "—"), field("Fonte", "Search Console")],
      solutions: ["Filtra le opportunità con dati sufficienti.", "Valuta posizione e impressioni.", "Crea una task solo quando la relazione query–pagina è verificabile."],
      actionPage: "Task",
      actionLabel: "Apri task",
    },
    Task: {
      title: "Gestione attività",
      subtitle: "Coda di lavoro del progetto",
      fields: [field("Progetto", client?.name || "—"), field("Flusso", "Da fare → In corso → Verifica → Completato")],
      solutions: ["Lavora prima sulle attività ad alta priorità.", "Apri URL ed evidenze prima di modificare.", "Chiudi una task solo dopo la verifica."],
    },
    "Piano editoriale": {
      title: "Piano editoriale",
      subtitle: "Topical map, brief, bozze e calendario",
      fields: [field("Progetto", client?.name || "—"), field("Output", "Contenuti e task editoriali")],
      solutions: ["Scegli il tema o cluster.", "Prepara il brief.", "Revisiona il contenuto prima dell’invio come bozza WordPress."],
      actionPage: "Task",
      actionLabel: "Apri task editoriali",
    },
    "SEO Agent": {
      title: "Nuovo lavoro SEO Agent",
      subtitle: "Definisci un obiettivo e controlla il piano",
      fields: [field("Progetto", client?.name || "—"), field("Controllo", "Approvazioni esplicite per le azioni sensibili")],
      solutions: ["Definisci un obiettivo verificabile.", "Controlla il piano proposto.", "Approva solo le operazioni desiderate e verifica l’esito."],
    },
    "GEO AI": {
      title: "Analisi GEO AI",
      subtitle: "Valuta la preparazione dei contenuti per sistemi generativi",
      fields: [field("Progetto", client?.name || "—"), field("Output", "Segnali, gap e priorità GEO")],
      solutions: ["Seleziona il contenuto o il perimetro.", "Analizza i segnali disponibili.", "Applica solo miglioramenti supportati dai dati."],
    },
    Integrazioni: {
      title: "Gestisci integrazioni",
      subtitle: "Search Console, WordPress, DataForSEO e OpenAI",
      fields: [field("Progetto", client?.name || "—"), field("Regola", "Verifica ogni connessione prima dell’uso")],
      solutions: ["Apri una sola integrazione alla volta.", "Inserisci i dati necessari.", "Esegui il test e salva soltanto una configurazione valida."],
    },
    Impostazioni: {
      title: "Preferenze e sicurezza",
      subtitle: "Impostazioni, backup e copie locali",
      fields: [field("Ambito", "Applicazione locale"), field("Protezione", "Backup cifrato disponibile")],
      solutions: ["Modifica il minimo necessario.", "Crea un backup prima di cambiamenti importanti.", "Controlla le copie locali prima di un ripristino."],
    },
    Storico: {
      title: "Storico analisi",
      subtitle: "Confronta scansioni e risultati nel tempo",
      fields: [field("Progetto", client?.name || "—"), field("Output", "Score, problemi nuovi e risolti")],
      solutions: ["Apri una scansione per data.", "Confronta nuovi problemi e risolti.", "Esegui una nuova analisi quando serve una baseline aggiornata."],
      actionPage: "Audit SEO",
      actionLabel: "Nuova analisi",
    },
  };
  const definition = definitions[page] || {
    title: page,
    subtitle: "Apri gli strumenti della pagina",
    fields: [field("Progetto", client?.name || "—")],
    solutions: ["Apri gli strumenti operativi per continuare."],
  };
  return card({ id: `starter-${page}`, date, kind: "starter", ...definition });
};

const buildAuditCards = (clientId, siteStore, pageStore) => {
  const site = arrayForClient(siteStore, clientId).map((item, index) => card({
    id: `site-audit-${item.analyzedAt || index}`,
    date: firstDate(item.analyzedAt, item.startedAt),
    title: "Audit sito completo",
    subtitle: item.url || "Crawl del progetto",
    kind: "audit",
    url: item.url,
    fields: [
      field("Punteggio", item.score != null ? `${item.score}/100` : "—"),
      field("Pagine", item.pagesChecked ?? 0),
      field("Link", item.linksChecked ?? 0),
      field("Problemi", item.issues?.length ?? 0),
      field("Da confermare", item.reviewItems?.length ?? 0),
      field("Nuovi", item.newIssues?.length ?? 0),
      field("Risolti", item.resolvedIssues?.length ?? 0),
    ],
    rows: (item.issues || []).slice(0, 100).map((issue) => [
      issue.label || issue.type || "Problema SEO",
      issue.severity || "—",
      issue.sourceUrl || issue.url || "—",
    ]),
    solutions: ["Apri i problemi confermati.", "Valuta gravità e priorità.", "Esegui un nuovo audit dopo le correzioni per confermare l’esito."],
    actionPage: "Problemi",
    actionLabel: "Apri problemi",
  }));
  const pages = arrayForClient(pageStore, clientId).map((item, index) => card({
    id: `page-audit-${item.analyzedAt || index}`,
    date: firstDate(item.analyzedAt, item.startedAt),
    title: "Audit pagina",
    subtitle: item.url || "Pagina analizzata",
    kind: "audit",
    url: item.url,
    fields: [
      field("Punteggio", item.score != null ? `${item.score}/100` : "—"),
      field("Title", item.title || "Mancante"),
      field("Meta description", item.description || "Mancante"),
      field("H1", item.h1 || "Mancante"),
      field("Canonical", item.canonical || "Non rilevata"),
      field("Problemi", item.issues?.length ?? 0),
    ],
    rows: (item.issues || []).slice(0, 100).map((issue) => [
      issue.label || issue.type || "Problema SEO",
      issue.severity || "—",
      issue.sourceUrl || issue.url || item.url || "—",
    ]),
    solutions: ["Controlla i problemi della pagina.", "Apri la risorsa per verificare il frontend.", "Ripeti l’audit dopo l’intervento."],
    actionPage: "Problemi",
    actionLabel: "Apri problemi",
  }));
  return [...site, ...pages].sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
};

const buildRankingCards = (clientId, store) => {
  const history = arrayForClient(store, clientId);
  return history.map((item, index) => {
    const previous = history.slice(index + 1).find((candidate) =>
      candidate?.device === item?.device &&
      candidate?.depth === item?.depth &&
      candidate?.locationCode === item?.locationCode &&
      candidate?.languageCode === item?.languageCode,
    );
    const previousMap = new Map((previous?.rankings || []).map((ranking) => [
      String(ranking.keyword || "").toLocaleLowerCase("it"),
      ranking.position,
    ]));
    const rows = (item.rankings || []).map((ranking) => {
      const old = previousMap.get(String(ranking.keyword || "").toLocaleLowerCase("it"));
      const delta = ranking.position && old ? old - ranking.position : null;
      return [
        ranking.keyword || "—",
        ranking.error ? "Non verificata" : ranking.position || `Oltre ${item.depth || "—"}`,
        delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`,
        ranking.url || "Non trovata",
      ];
    });
    return card({
      id: `ranking-${item.checkedAt || index}`,
      date: item.checkedAt,
      title: `Controllo posizionamenti · ${item.device || "dispositivo"}`,
      subtitle: `${item.rankings?.length || 0} keyword · Top ${item.depth || "—"}`,
      kind: "ranking",
      fields: [
        field("Dispositivo", item.device || "—"),
        field("Profondità", item.depth ? `Top ${item.depth}` : "—"),
        field("Località", item.locationCode || "—"),
        field("Lingua", item.languageCode || "—"),
        field("Keyword", item.rankings?.length || 0),
        field("Costo", item.cost != null ? `$${Number(item.cost).toFixed(4)}` : "—"),
        field("Parziale", item.partial ? "Sì" : "No"),
      ],
      rows,
      solutions: ["Individua le keyword che hanno perso posizioni.", "Controlla l’URL realmente posizionata.", "Crea task per le opportunità prioritarie."],
      actionPage: "Opportunità",
      actionLabel: "Apri opportunità",
    });
  });
};

const buildProblemCards = (auditCards) => auditCards.flatMap((audit) =>
  audit.rows.map((row, index) => card({
    id: `problem-${audit.id}-${index}`,
    date: audit.date,
    title: row[0],
    subtitle: row[2],
    kind: "problem",
    url: row[2],
    fields: [field("Gravità", row[1]), field("Pagina", row[2]), field("Fonte", audit.title)],
    solutions: ["Apri gli strumenti per vedere evidenza e correggibilità.", "Prepara una proposta solo se supportata.", "Dopo l’applicazione, riverifica il problema."],
    actionPage: "Correzioni",
    actionLabel: "Apri correzioni",
  })),
).slice(0, 120);

const buildCorrectionCards = (clientId, store) => (Array.isArray(store) ? store : [])
  .filter((item) => Number(item.clientId) === Number(clientId))
  .map((item, index) => card({
    id: `correction-${item.id || index}`,
    date: firstDate(item.verifiedAt, item.appliedAt, item.updatedAt, item.createdAt),
    title: item.issueLabel || item.title || "Correzione SEO",
    subtitle: item.sourceUrl || item.url || item.status || "Intervento SeoGrow",
    kind: "correction",
    url: item.sourceUrl || item.url,
    fields: [
      field("Stato", item.status || "—"),
      field("Tipo", item.issueType || item.kind || "—"),
      field("Pagina", item.sourceUrl || item.url || "—"),
      field("Prima", item.before || item.previousValue || "—"),
      field("Dopo", item.after || item.nextValue || "—"),
      field("Verifica", item.verificationNote || item.note || "—"),
    ],
    solutions: ["Confronta Prima/Dopo.", "Riverifica frontend e SEO.", "Usa il rollback controllato se il risultato non è corretto."],
    actionPage: "Problemi",
    actionLabel: "Torna ai problemi",
  }))
  .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));

const buildTaskCards = (tasks, client) => clientTasks(tasks, client)
  .map((item, index) => card({
    id: `task-${item.id || index}`,
    date: firstDate(item.updatedAt, item.createdAt, item.completedAt, item.due),
    title: item.title || "Task SEO",
    subtitle: `${item.status || "Da fare"} · priorità ${item.priority || "—"}`,
    kind: "task",
    url: item.sourceUrl || item.targetUrl,
    fields: [
      field("Stato", item.status || "—"),
      field("Priorità", item.priority || "—"),
      field("Scadenza", item.due || "—"),
      field("Pagina", item.sourceUrl || "—"),
      field("Destinazione", item.targetUrl || "—"),
      field("Dettaglio", item.detail || "—"),
      field("Note", item.notes || "—"),
    ],
    solutions: ["Apri evidenze e URL coinvolte.", "Esegui l’intervento nel modulo corretto.", "Aggiorna stato e note dopo la verifica."],
  }))
  .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));

const buildOpportunityCards = (dataset) => {
  if (!dataset) return [];
  const date = firstDate(dataset.importedAt, dataset.dateTo, dataset.dateFrom);
  return opportunityGroups(dataset).quickWins.slice(0, 100).map((item, index) => card({
    id: `opportunity-${index}-${item.dimension || item.query || "query"}`,
    date,
    title: item.dimension || item.query || "Opportunità SEO",
    subtitle: `Posizione ${Number(item.position || 0).toFixed(1)} · ${item.impressions || 0} impressioni`,
    kind: "opportunity",
    url: item.url || item.page,
    fields: [
      field("Posizione", item.position ?? "—"),
      field("Impressioni", item.impressions ?? 0),
      field("Clic", item.clicks ?? 0),
      field("CTR", item.ctr != null ? `${Number(item.ctr).toFixed(2)}%` : "—"),
      field("Pagina", item.url || item.page || "Da associare"),
    ],
    solutions: ["Controlla l’associazione query–pagina.", "Valuta il potenziale rispetto alle impressioni.", "Crea una task con obiettivo misurabile."],
    actionPage: "Task",
    actionLabel: "Apri task",
  }));
};

const buildInternalLinkCards = (analysis) => {
  if (!analysis) return [];
  const date = firstDate(analysis.analyzedAt, analysis.startedAt);
  const broken = (analysis.brokenLinks || []).map((item, index) => card({
    id: `broken-${index}-${item.url || "link"}`,
    date,
    title: `Link interrotto · ${item.status || "Errore"}`,
    subtitle: item.url || "Destinazione non disponibile",
    kind: "link",
    url: item.url,
    fields: [
      field("Destinazione", item.url || "—"),
      field("Errore", item.error || item.status || "—"),
      field("Pagine sorgenti", (item.sources || []).join(" · ") || "—"),
    ],
    solutions: ["Verifica la destinazione.", "Correggi tutte le pagine sorgenti coinvolte.", "Esegui nuovamente il crawl per confermare."],
    actionPage: "Task",
    actionLabel: "Crea o apri task",
  }));
  const suggestions = (analysis.internalLinkSuggestions || []).map((item, index) => card({
    id: `internal-${index}-${item.sourceUrl || "source"}`,
    date,
    title: `Link suggerito · “${item.anchor || "anchor"}”`,
    subtitle: item.sourceUrl || "Pagina sorgente",
    kind: "link",
    url: item.sourceUrl,
    fields: [
      field("Sorgente", item.sourceUrl || "—"),
      field("Destinazione", item.targetUrl || "—"),
      field("Anchor", item.anchor || "—"),
      field("Motivo", item.reason || "—"),
    ],
    solutions: ["Verifica che il collegamento sia utile all’utente.", "Controlla anchor e destinazione.", "Crea la task solo dopo la verifica editoriale."],
    actionPage: "Task",
    actionLabel: "Apri task",
  }));
  return [...broken, ...suggestions];
};

const buildClientCards = ({ clients, gscStore, analysisStore, rankingStore, tasks }) => clients.map((client) => {
  const dataset = gscStore?.[client.id] ?? gscStore?.[String(client.id)] ?? null;
  const audits = arrayForClient(analysisStore, client.id);
  const rankings = arrayForClient(rankingStore, client.id);
  const scopedTasks = clientTasks(tasks, client);
  const last = maxDate([
    dataset?.importedAt,
    dataset?.dateTo,
    audits[0]?.analyzedAt,
    rankings[0]?.checkedAt,
    ...scopedTasks.map((task) => firstDate(task.updatedAt, task.createdAt, task.due)),
  ]);
  return card({
    id: `client-${client.id}`,
    date: last,
    title: client.name,
    subtitle: shortUrl(client.url),
    kind: "client",
    url: client.url,
    fields: [
      field("Sito", client.url),
      field("Search Console", dataset ? "Dati disponibili" : "Da importare"),
      field("Ultimo audit", audits[0]?.analyzedAt ? formatDate(audits[0].analyzedAt) : "Mai"),
      field("Ultimo posizionamento", rankings[0]?.checkedAt ? formatDate(rankings[0].checkedAt) : "Mai"),
      field("Task", scopedTasks.length),
    ],
    solutions: ["Controlla la completezza dei dati.", "Apri il Centro progetto.", "Lavora sempre nel progetto selezionato."],
    actionPage: "Centro progetto",
    actionLabel: "Apri Centro progetto",
  });
});

const genericObjectCards = (prefix, value, fallbackTitle, options = {}) => {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? [value] : [];
  return list.map((item, index) => card({
    id: `${prefix}-${item.id || index}`,
    date: firstDate(item.updatedAt, item.createdAt, item.analyzedAt, item.generatedAt, item.checkedAt, item.startedAt),
    title: item.title || item.topic || item.goal || fallbackTitle,
    subtitle: item.status || item.url || item.source || "",
    kind: prefix,
    url: item.url,
    fields: Object.entries(item)
      .filter(([key, fieldValue]) => fieldValue != null && typeof fieldValue !== "function" && !["id"].includes(key))
      .slice(0, 12)
      .map(([key, fieldValue]) => field(key, fieldValue)),
    solutions: options.solutions || ["Apri gli strumenti operativi per esaminare e aggiornare questo elemento."],
    actionPage: options.actionPage || "",
    actionLabel: options.actionLabel || "",
  }));
};

const integrationCards = (client, dataset, wp) => [
  card({
    id: "integration-gsc",
    date: firstDate(dataset?.importedAt, dataset?.dateTo),
    title: "Google Search Console",
    subtitle: dataset ? "Dati disponibili" : "Da collegare o importare",
    kind: "integration",
    fields: [
      field("Stato", dataset ? "Dati disponibili" : "Configurazione richiesta"),
      field("Periodo", dataset ? `${dataset.dateFrom || "—"} → ${dataset.dateTo || "—"}` : "—"),
      field("Query", dataset?.queries?.length || 0),
      field("Pagine", dataset?.pages?.length || 0),
    ],
    solutions: ["Importa o aggiorna i dati.", "Verifica il periodo coperto.", "Usa i dati aggiornati per opportunità e posizionamenti."],
  }),
  card({
    id: "integration-wordpress",
    date: firstDate(wp?.verifiedAt, wp?.updatedAt),
    title: "WordPress",
    subtitle: wp?.verifiedAt ? "Connessione verificata" : "Da verificare",
    kind: "integration",
    url: wp?.url || client?.url,
    fields: [field("Sito", wp?.url || client?.url || "—"), field("Utente", wp?.username || "—"), field("Ultima verifica", wp?.verifiedAt ? formatDate(wp.verifiedAt) : "Mai")],
    solutions: ["Inserisci URL, utente e password applicativa.", "Esegui il test di connessione.", "Rinnova la verifica quando la sessione è scaduta."],
  }),
  card({
    id: "integration-dataforseo",
    date: "",
    title: "DataForSEO",
    subtitle: "Posizionamenti e dati keyword",
    kind: "integration",
    fields: [field("Utilizzo", "Posizionamenti e topical map"), field("Costo", "Controllato prima delle richieste")],
    solutions: ["Verifica le credenziali.", "Controlla il costo stimato prima di richieste massive.", "Usa la profondità minima necessaria."],
  }),
  card({
    id: "integration-openai",
    date: "",
    title: "OpenAI",
    subtitle: "Generazione assistita e SEO Agent",
    kind: "integration",
    fields: [field("Utilizzo", "Contenuti e flussi agentici"), field("Scritture", "Sempre soggette ai gate previsti")],
    solutions: ["Configura la chiave solo quando necessaria.", "Usa obiettivi precisi.", "Mantieni le approvazioni per le operazioni sensibili."],
  }),
];

const settingsCards = (stores) => [
  card({
    id: "settings-preferences",
    date: stores.preferences?.updatedAt,
    title: "Preferenze",
    subtitle: "Notifiche, approvazioni e comportamento locale",
    kind: "settings",
    fields: [field("Nome", stores.preferences?.name || "—"), field("Controllo automatico", stores.preferences?.refreshHours ? `Ogni ${stores.preferences.refreshHours} ore` : "Disattivato")],
    solutions: ["Modifica solo le preferenze necessarie.", "Mantieni l’approvazione WordPress se vuoi un controllo esplicito.", "Salva e torna al flusso operativo."],
  }),
  card({
    id: "settings-backup",
    date: stores.snapshots?.[0]?.createdAt,
    title: "Backup e ripristino",
    subtitle: "Proteggi il workspace locale",
    kind: "settings",
    fields: [field("Copie locali", stores.snapshots?.length || 0), field("Export", "Backup cifrato")],
    solutions: ["Crea una copia prima di modifiche importanti.", "Usa una password robusta per l’export.", "Ripristina solo backup verificati."],
  }),
  ...genericObjectCards("snapshot", stores.snapshots, "Copia locale", {
    solutions: ["Controlla data e motivo della copia.", "Ripristina solo quando necessario.", "Verifica il workspace dopo il ripristino."],
  }),
];

function buildCards(page, client, stores) {
  if (!client && page !== "Clienti" && page !== "Impostazioni") return [starter(page, null)];
  const clientId = client?.id;
  const audits = client ? buildAuditCards(clientId, stores.analyses, stores.pageAudits) : [];
  const rankingCards = client ? buildRankingCards(clientId, stores.rankings) : [];
  const dataset = client ? stores.gsc?.[clientId] ?? stores.gsc?.[String(clientId)] ?? null : null;
  const latestAnalysis = arrayForClient(stores.analyses, clientId)[0] || null;
  const lastActivity = maxDate([
    dataset?.importedAt,
    dataset?.dateTo,
    audits[0]?.date,
    rankingCards[0]?.date,
  ]);

  switch (page) {
    case "Clienti":
      return [starter("Clienti", null), ...buildClientCards({ clients: stores.clients, gscStore: stores.gsc, analysisStore: stores.analyses, rankingStore: stores.rankings, tasks: stores.tasks })];
    case "Audit SEO":
      return [starter(page, client, audits[0]?.date), ...audits];
    case "Storico":
      return audits.length ? audits : [starter(page, client)];
    case "Problemi": {
      const problems = buildProblemCards(audits);
      return problems.length ? problems : [starter(page, client, audits[0]?.date)];
    }
    case "Correzioni": {
      const corrections = buildCorrectionCards(clientId, stores.corrections);
      return [starter(page, client, corrections[0]?.date), ...corrections];
    }
    case "Posizionamenti":
      return [starter(page, client, rankingCards[0]?.date), ...rankingCards];
    case "Task": {
      const tasks = buildTaskCards(stores.tasks, client);
      return [starter(page, client, tasks[0]?.date), ...tasks];
    }
    case "Opportunità": {
      const opportunities = buildOpportunityCards(dataset);
      return opportunities.length ? opportunities : [starter(page, client, firstDate(dataset?.importedAt, dataset?.dateTo))];
    }
    case "Link interni": {
      const links = buildInternalLinkCards(latestAnalysis);
      return [starter(page, client, latestAnalysis?.analyzedAt), ...links];
    }
    case "Piano editoriale": {
      const draft = stores.contentDrafts?.[clientId] ?? stores.contentDrafts?.[String(clientId)] ?? null;
      const topical = stores.topicalMaps?.[clientId] ?? stores.topicalMaps?.[String(clientId)] ?? null;
      return [
        starter(page, client, firstDate(draft?.updatedAt, topical?.updatedAt)),
        ...genericObjectCards("content", draft, "Bozza editoriale"),
        ...genericObjectCards("topical", topical, "Topical map"),
        ...buildTaskCards(stores.tasks.filter((task) => /content|article|editor/i.test(`${task.kind || ""} ${task.title || ""}`)), client),
      ];
    }
    case "SEO Agent": {
      const raw = stores.agentRuns?.[clientId] ?? stores.agentRuns?.[String(clientId)] ?? [];
      return [starter(page, client, arrayForClient(stores.agentRuns, clientId)[0]?.updatedAt), ...genericObjectCards("agent", raw, "Run SEO Agent")];
    }
    case "GEO AI": {
      const raw = stores.geo?.[clientId] ?? stores.geo?.[String(clientId)] ?? null;
      return [starter(page, client, raw?.updatedAt || raw?.analyzedAt), ...genericObjectCards("geo", raw, "Analisi GEO AI")];
    }
    case "Integrazioni": {
      const wp = stores.wordpressProfiles?.[clientId] ?? stores.wordpressProfiles?.[String(clientId)] ?? null;
      return integrationCards(client, dataset, wp);
    }
    case "Impostazioni":
      return settingsCards(stores);
    case "Panoramica": {
      const cards = [];
      cards.push(card({
        id: "summary-gsc",
        date: firstDate(dataset?.importedAt, dataset?.dateTo),
        title: "Dati Search Console",
        subtitle: dataset ? `${dataset.queries?.length || 0} query · ${dataset.pages?.length || 0} pagine` : "Dati da importare",
        kind: "summary",
        fields: [field("Clic", dataset?.totals?.clicks ?? "—"), field("Impressioni", dataset?.totals?.impressions ?? "—"), field("CTR", dataset?.totals?.ctr ?? "—"), field("Posizione media", dataset?.totals?.position ?? "—")],
        solutions: ["Aggiorna Search Console quando i dati sono vecchi.", "Usa le query per individuare opportunità.", "Confronta i dati con audit e posizionamenti."],
        actionPage: "Integrazioni",
        actionLabel: "Gestisci dati",
      }));
      if (audits[0]) cards.push(audits[0]);
      if (rankingCards[0]) cards.push(rankingCards[0]);
      const taskCards = buildTaskCards(stores.tasks, client);
      if (taskCards[0]) cards.push(taskCards[0]);
      return cards.length ? cards : [starter(page, client, lastActivity)];
    }
    case "Centro progetto":
      return [starter(page, client, lastActivity)];
    default:
      return [starter(page, client, lastActivity)];
  }
}

function DatedCard({ item, index, onOpen }) {
  return (
    <button
      type="button"
      className={`card-record ${index % 2 ? "mint" : "blue"}`}
      onClick={onOpen}
    >
      <span className="card-record-date"><CalendarDays /> {formatDate(item.date)}</span>
      <strong>{item.title}</strong>
      <small>{item.subtitle}</small>
      <span className="card-record-open">Apri <ChevronRight /></span>
    </button>
  );
}

function HorizontalDetail({ item, page, managing, onBack, onManage }) {
  if (!item) return null;
  return (
    <section className="card-horizontal-detail" aria-live="polite">
      <div className="card-horizontal-head">
        <div className="card-horizontal-heading">
          <button type="button" className="card-back-button" onClick={onBack}><ArrowLeft /> Torna alle card</button>
          <span><Layers3 /> Dettaglio {page}</span>
          <h2>{item.title}</h2>
          <p>{formatDate(item.date)}{item.subtitle ? ` · ${item.subtitle}` : ""}</p>
        </div>
        {item.url && <a className="secondary" href={item.url} target="_blank" rel="noreferrer"><ExternalLink /> Apri risorsa</a>}
      </div>

      <div className="card-horizontal-fields">
        {item.fields.length ? item.fields.map((entry, index) => (
          <div key={`${entry.label}-${index}`}>
            <small>{entry.label}</small>
            <strong>{entry.value}</strong>
          </div>
        )) : <div><small>Informazioni</small><strong>Nessun dettaglio aggiuntivo disponibile.</strong></div>}
      </div>

      {item.rows.length > 0 && (
        <div className="card-horizontal-rows" role="region" aria-label={`Dati completi ${item.title}`}>
          {item.kind === "ranking" && <div className="card-row-head"><span>Keyword</span><span>Posizione</span><span>Variazione</span><span>URL</span></div>}
          {item.kind === "audit" && <div className="card-row-head audit"><span>Problema</span><span>Gravità</span><span>Pagina</span></div>}
          {item.rows.map((row, rowIndex) => (
            <div className={`card-detail-row ${item.kind}`} key={`${item.id}-row-${rowIndex}`}>
              {row.map((value, valueIndex) => {
                const link = valueIndex === row.length - 1 ? safeLink(value) : "";
                return link
                  ? <a key={`${rowIndex}-${valueIndex}`} href={link} target="_blank" rel="noreferrer">{shortUrl(value)}</a>
                  : <span key={`${rowIndex}-${valueIndex}`}>{compact(value, 180)}</span>;
              })}
            </div>
          ))}
        </div>
      )}

      <section className="card-horizontal-solutions" aria-label="Soluzioni e azioni">
        <div>
          <small>Soluzioni e prossimi passi</small>
          <ol>
            {(item.solutions.length ? item.solutions : ["Apri gli strumenti operativi per continuare."]).map((solution) => <li key={solution}>{solution}</li>)}
          </ol>
        </div>
        <div className="card-horizontal-actions">
          <button type="button" className="primary" onClick={onManage}><Settings2 /> {managing ? "Nascondi strumenti" : "Apri strumenti operativi"}</button>
          {item.actionPage && item.actionPage !== page && (
            <button type="button" className="secondary" onClick={() => navigatePage(item.actionPage)}>{item.actionLabel || `Apri ${item.actionPage}`} <ChevronRight /></button>
          )}
        </div>
      </section>

      {managing && <div className="card-manage-anchor"><strong>Strumenti operativi aperti</strong><span>Continua nella sezione originale visualizzata subito sotto. I dati e le funzioni restano invariati.</span></div>}
    </section>
  );
}

export default function CardWorkspaceLayer() {
  const [page, setPage] = useState(pageFromHash);
  const [version, setVersion] = useState(0);
  const [host, setHost] = useState(null);
  const [selectedId, setSelectedId] = useState("");
  const [managing, setManaging] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setPage(pageFromHash());
      setSelectedId("");
      setManaging(false);
      setVersion((value) => value + 1);
    };
    const refreshData = () => setVersion((value) => value + 1);
    const onChange = (event) => {
      if (event.target?.matches?.(".client-select select")) window.setTimeout(refresh, 0);
    };
    window.addEventListener("hashchange", refresh);
    window.addEventListener("popstate", refresh);
    window.addEventListener("seogrow-locationchange", refresh);
    window.addEventListener("seogrow-storage-ok", refreshData);
    window.addEventListener("storage", refreshData);
    document.addEventListener("change", onChange, true);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
      window.removeEventListener("seogrow-storage-ok", refreshData);
      window.removeEventListener("storage", refreshData);
      document.removeEventListener("change", onChange, true);
    };
  }, []);

  useEffect(() => {
    if (CARD_EXCLUDED_PAGES.has(page)) return undefined;
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    let mountedHost = null;
    const install = () => {
      if (cancelled) return;
      const main = document.querySelector(".app main");
      const anchor = main?.querySelector(".guided-page-wizard-host") || main?.querySelector(".page-title");
      if (!main || !anchor) {
        if (attempts < 80) {
          attempts += 1;
          frame = window.requestAnimationFrame(install);
        }
        return;
      }
      mountedHost = document.createElement("div");
      mountedHost.className = "card-workspace-host";
      anchor.insertAdjacentElement("afterend", mountedHost);
      document.body.dataset.seogrowCardPage = page;
      setHost(mountedHost);
    };
    frame = window.requestAnimationFrame(install);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      mountedHost?.remove();
      if (document.body.dataset.seogrowCardPage === page) delete document.body.dataset.seogrowCardPage;
    };
  }, [page]);

  useEffect(() => {
    if (!host || CARD_EXCLUDED_PAGES.has(page)) return undefined;
    const marked = new Set();
    let frame = 0;
    const markOriginalContent = () => {
      const scope = host.parentElement;
      if (!scope) return;
      for (const element of [...scope.children]) {
        if (
          element === host ||
          element.matches(".page-title, .guided-page-wizard-host, .guided-page-help-host")
        ) continue;
        element.dataset.seogrowCardOriginal = "true";
        marked.add(element);
      }
    };
    markOriginalContent();
    frame = window.requestAnimationFrame(markOriginalContent);
    return () => {
      window.cancelAnimationFrame(frame);
      for (const element of marked) delete element.dataset.seogrowCardOriginal;
    };
  }, [host, page, version]);

  useEffect(() => {
    if (!host || CARD_EXCLUDED_PAGES.has(page)) return undefined;
    document.body.dataset.seogrowCardMode = managing ? "manage" : selectedId ? "detail" : "hub";
    return () => {
      delete document.body.dataset.seogrowCardMode;
    };
  }, [host, page, selectedId, managing]);

  const stores = useMemo(() => ({
    revision: version,
    clients: readJson(CLIENTS_KEY, []),
    tasks: readJson("seogrow-tasks-v2", []),
    gsc: readJson("seogrow-gsc-v1", {}),
    analyses: readJson("seogrow-analyses-v2", {}),
    pageAudits: readJson("seogrow-page-audit-history-v2", {}),
    rankings: readJson("seogrow-rankings-v1", {}),
    corrections: readJson("seogrow-remediation-history-v1", []),
    contentDrafts: readJson("seogrow-content-drafts-v1", {}),
    topicalMaps: readJson("seogrow-topical-maps-v1", {}),
    agentRuns: readJson("seogrow-agent-runs-v1", {}),
    geo: readJson("seogrow-geo-v1", {}),
    wordpressProfiles: readJson("seogrow-wordpress-profiles-v1", {}),
    snapshots: readJson("seogrow-snapshots-v1", []),
    preferences: readJson("seogrow-preferences-v1", {}),
  }), [version]);

  const domClientId = Number(document.querySelector(".client-select select")?.value || 0);
  const selectedClientId = domClientId || Number(readJson(SELECTED_CLIENT_KEY, 0));
  const client = stores.clients.find((item) => Number(item.id) === selectedClientId) || stores.clients[0] || null;
  const items = useMemo(() => buildCards(page, client, stores), [page, client, stores]);
  const selected = selectedId ? items.find((item) => item.id === selectedId) || null : null;

  const openCard = (id) => {
    setSelectedId(id);
    setManaging(false);
    window.requestAnimationFrame(() => host?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const backToCards = () => {
    setSelectedId("");
    setManaging(false);
    window.requestAnimationFrame(() => host?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const toggleManage = () => {
    setManaging((value) => !value);
    if (!managing) {
      window.requestAnimationFrame(() => {
        const original = host?.parentElement?.querySelector('[data-seogrow-card-original="true"]');
        original?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
  };

  if (!host || CARD_EXCLUDED_PAGES.has(page)) return null;

  return createPortal(
    <section className={`card-workspace ${selected ? "is-detail" : "is-hub"}`} aria-label={`Workspace a card ${page}`}>
      {!selected ? (
        <>
          <div className="card-workspace-title">
            <div>
              <h2>{page === "Clienti" ? "Progetti a card" : `${page} · card operative`}</h2>
              <p>Apri una card alla volta. Nel dettaglio trovi informazioni, dati e soluzioni senza scorrere tutti i pannelli.</p>
            </div>
            <span>{items.length} {items.length === 1 ? "card" : "card"}</span>
          </div>
          <div className="card-record-grid">
            {items.map((item, index) => <DatedCard key={item.id} item={item} index={index} onOpen={() => openCard(item.id)} />)}
          </div>
        </>
      ) : (
        <HorizontalDetail
          item={selected}
          page={page}
          managing={managing}
          onBack={backToCards}
          onManage={toggleManage}
        />
      )}
    </section>,
    host,
  );
}
