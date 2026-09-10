import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CalendarDays, ChevronRight, ExternalLink, Layers3 } from "lucide-react";
import { opportunityGroups } from "./platform.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import "./CardWorkspaceLayer.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";

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

const maxDate = (values) => {
  const dates = values.map(validDate).filter(Boolean).map((value) => Date.parse(value));
  return dates.length ? new Date(Math.max(...dates)).toISOString() : "";
};

const field = (label, value) => ({ label, value: compact(value, 320) });

const card = ({ id, date, title, subtitle = "", fields = [], rows = [], url = "", kind = "record" }) => ({
  id,
  date: validDate(date),
  title: compact(title, 90),
  subtitle: compact(subtitle, 120),
  fields,
  rows,
  url: safeLink(url),
  kind,
});

const clientTasks = (tasks, client) => tasks.filter((task) =>
  Number(task.sourceClientId) === Number(client?.id) ||
  (!task.sourceClientId && task.client === client?.name),
);

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
    rows: (item.issues || []).slice(0, 80).map((issue) => [
      issue.label || issue.type || "Problema SEO",
      issue.severity || "—",
      issue.sourceUrl || issue.url || "—",
    ]),
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
    rows: (item.issues || []).slice(0, 80).map((issue) => [
      issue.label || issue.type || "Problema SEO",
      issue.severity || "—",
      issue.sourceUrl || issue.url || item.url || "—",
    ]),
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
  })),
).slice(0, 100);

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
  }))
  .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));

const buildOpportunityCards = (dataset) => {
  if (!dataset) return [];
  const date = firstDate(dataset.importedAt, dataset.dateTo, dataset.dateFrom);
  return opportunityGroups(dataset).quickWins.slice(0, 80).map((item, index) => card({
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
  });
});

const genericObjectCards = (prefix, value, fallbackTitle) => {
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
  }));
};

function buildCards(page, client, stores) {
  if (!client && page !== "Clienti" && page !== "Impostazioni") return [];
  const clientId = client?.id;
  const audits = client ? buildAuditCards(clientId, stores.analyses, stores.pageAudits) : [];
  const rankingCards = client ? buildRankingCards(clientId, stores.rankings) : [];
  const dataset = client ? stores.gsc?.[clientId] ?? stores.gsc?.[String(clientId)] ?? null : null;
  const latestAnalysis = arrayForClient(stores.analyses, clientId)[0] || null;

  switch (page) {
    case "Clienti":
      return buildClientCards({ clients: stores.clients, gscStore: stores.gsc, analysisStore: stores.analyses, rankingStore: stores.rankings, tasks: stores.tasks });
    case "Audit SEO":
    case "Storico":
      return audits;
    case "Problemi":
      return buildProblemCards(audits);
    case "Correzioni":
      return buildCorrectionCards(clientId, stores.corrections);
    case "Posizionamenti":
      return rankingCards;
    case "Task":
      return buildTaskCards(stores.tasks, client);
    case "Opportunità":
      return buildOpportunityCards(dataset);
    case "Link interni":
      return buildInternalLinkCards(latestAnalysis);
    case "Piano editoriale": {
      const draft = stores.contentDrafts?.[clientId] ?? stores.contentDrafts?.[String(clientId)] ?? null;
      const topical = stores.topicalMaps?.[clientId] ?? stores.topicalMaps?.[String(clientId)] ?? null;
      return [
        ...genericObjectCards("content", draft, "Bozza editoriale"),
        ...genericObjectCards("topical", topical, "Topical map"),
        ...buildTaskCards(stores.tasks.filter((task) => /content|article|editor/i.test(`${task.kind || ""} ${task.title || ""}`)), client),
      ];
    }
    case "SEO Agent": {
      const raw = stores.agentRuns?.[clientId] ?? stores.agentRuns?.[String(clientId)] ?? [];
      return genericObjectCards("agent", raw, "Run SEO Agent");
    }
    case "GEO AI": {
      const raw = stores.geo?.[clientId] ?? stores.geo?.[String(clientId)] ?? null;
      return genericObjectCards("geo", raw, "Analisi GEO AI");
    }
    case "Integrazioni": {
      const wp = stores.wordpressProfiles?.[clientId] ?? stores.wordpressProfiles?.[String(clientId)] ?? null;
      const cards = [];
      if (dataset) cards.push(card({
        id: "integration-gsc",
        date: firstDate(dataset.importedAt, dataset.dateTo),
        title: "Google Search Console",
        subtitle: "Dati SEO del progetto",
        kind: "integration",
        fields: [field("Periodo", `${dataset.dateFrom || "—"} → ${dataset.dateTo || "—"}`), field("Query", dataset.queries?.length || 0), field("Pagine", dataset.pages?.length || 0)],
      }));
      if (wp) cards.push(card({
        id: "integration-wordpress",
        date: firstDate(wp.verifiedAt, wp.updatedAt),
        title: "WordPress",
        subtitle: shortUrl(wp.url || client.url),
        kind: "integration",
        url: wp.url || client.url,
        fields: [field("Utente", wp.username || "—"), field("Verificata", wp.verifiedAt ? formatDate(wp.verifiedAt) : "No"), field("Sito", wp.url || client.url)],
      }));
      return cards;
    }
    case "Impostazioni":
      return genericObjectCards("snapshot", stores.snapshots, "Copia locale");
    case "Panoramica":
    case "Centro progetto": {
      const cards = [];
      if (dataset) cards.push(card({
        id: "summary-gsc",
        date: firstDate(dataset.importedAt, dataset.dateTo),
        title: "Dati Search Console",
        subtitle: `${dataset.queries?.length || 0} query · ${dataset.pages?.length || 0} pagine`,
        kind: "summary",
        fields: [field("Clic", dataset.totals?.clicks ?? "—"), field("Impressioni", dataset.totals?.impressions ?? "—"), field("CTR", dataset.totals?.ctr ?? "—"), field("Posizione media", dataset.totals?.position ?? "—")],
      }));
      if (audits[0]) cards.push(audits[0]);
      if (rankingCards[0]) cards.push(rankingCards[0]);
      const taskCards = buildTaskCards(stores.tasks, client);
      if (taskCards[0]) cards.push(taskCards[0]);
      return cards;
    }
    default:
      return [];
  }
}

function DatedCard({ item, active, index, onOpen }) {
  return (
    <button
      type="button"
      className={`card-record ${active ? "active" : ""} ${index % 2 ? "mint" : "blue"}`}
      onClick={onOpen}
      aria-pressed={active}
    >
      <span className="card-record-date"><CalendarDays /> {formatDate(item.date)}</span>
      <strong>{item.title}</strong>
      <small>{item.subtitle}</small>
      <span className="card-record-open">Apri dettaglio <ChevronRight /></span>
    </button>
  );
}

function HorizontalDetail({ item, page }) {
  if (!item) return null;
  return (
    <section className="card-horizontal-detail" aria-live="polite">
      <div className="card-horizontal-head">
        <div>
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
                return link ? <a key={`${rowIndex}-${valueIndex}`} href={link} target="_blank" rel="noreferrer">{shortUrl(value)}</a> : <span key={`${rowIndex}-${valueIndex}`}>{compact(value, 160)}</span>;
              })}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function CardWorkspaceLayer() {
  const [page, setPage] = useState(pageFromHash);
  const [version, setVersion] = useState(0);
  const [host, setHost] = useState(null);
  const [selectedId, setSelectedId] = useState("");

  useEffect(() => {
    const refresh = () => {
      setPage(pageFromHash());
      setSelectedId("");
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
      setHost(null);
    };
  }, [page]);

  const stores = useMemo(() => ({
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
  }), [version]);

  const domClientId = Number(document.querySelector(".client-select select")?.value || 0);
  const selectedClientId = domClientId || Number(readJson(SELECTED_CLIENT_KEY, 0));
  const client = stores.clients.find((item) => Number(item.id) === selectedClientId) || stores.clients[0] || null;
  const items = useMemo(() => buildCards(page, client, stores), [page, client, stores]);
  const selected = items.find((item) => item.id === selectedId) || items[0] || null;

  if (!host || !items.length) return null;

  return createPortal(
    <section className="card-workspace" aria-label={`Archivio a card ${page}`}>
      <div className="card-workspace-title">
        <div>
          <h2>{page === "Clienti" ? "Progetti a card" : `${page} · attività salvate`}</h2>
          <p>Ogni card è datata. Cliccala per aprire sotto tutte le informazioni relative in formato orizzontale.</p>
        </div>
        <span>{items.length} {items.length === 1 ? "card" : "card"}</span>
      </div>
      <div className="card-record-rail">
        {items.map((item, index) => <DatedCard key={item.id} item={item} index={index} active={selected?.id === item.id} onOpen={() => setSelectedId(item.id)} />)}
      </div>
      <HorizontalDetail item={selected} page={page} />
    </section>,
    host,
  );
}
