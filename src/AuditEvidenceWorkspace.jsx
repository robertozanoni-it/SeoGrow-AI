import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, CircleGauge, ExternalLink, FileSearch, ListChecks, RefreshCw, ShieldCheck } from "lucide-react";
import AnalysisProgress from "./AnalysisProgress.jsx";
import { apiFetch } from "./api.js";
import { readWorkspaceJson as readJson, writeWorkspaceJson as writeJson } from "./core/workspace/jsonStorage.js";
import { observedScoreDelta } from "./modules/audit/data.js";
import { analysisDiff, normalizeAnalysisHistory, tasksFromAnalysis } from "./platform.js";
import { reconcileAuditTasks } from "./auditTaskReconciliation.js";
import { issueIdentity, normalizeClientId, safeHttpHref } from "./reliabilityModel.js";
import "./AuditEvidenceWorkspace.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";
const TASKS_KEY = "seogrow-tasks-v2";

const pageFromHash = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const time = (value) => Number.isFinite(Date.parse(value || "")) ? Date.parse(value) : 0;
const auditDate = (item) => item?.analyzedAt || item?.startedAt || "";
const forClient = (store, id) => store?.[id] ?? store?.[String(id)] ?? [];
const severityClass = (value) => {
  const text = String(value || "").toLowerCase();
  if (["alta", "high", "critical", "critica"].includes(text)) return "high";
  if (["bassa", "low"].includes(text)) return "low";
  return "medium";
};
const severityLabel = (value) => ({ high: "Alta", medium: "Media", low: "Bassa" })[severityClass(value)];
const sourceUrl = (issue, result, client) => issue?.sourceUrl || issue?.url || result?.url || client?.url || "";

const dedupeIssues = (items, result, client) => {
  const map = new Map();
  for (const issue of Array.isArray(items) ? items : []) {
    if (!issue || issue.reproducible !== true || !issue.evidence?.source || !issue.evidence?.rule) continue;
    const key = issueIdentity({
      issueType: issue.type,
      issueLabel: issue.label,
      sourceUrl: sourceUrl(issue, result, client),
      targetUrl: issue.targetUrl || "",
      issue,
    });
    const current = map.get(key);
    if (!current || ({ high: 0, medium: 1, low: 2 }[severityClass(issue.severity)] < { high: 0, medium: 1, low: 2 }[severityClass(current.severity)])) map.set(key, issue);
  }
  return [...map.values()];
};

const coverageChecks = ["HTTP", "title", "meta-description", "H1", "H2", "canonical", "noindex", "links", "404"];

function EvidenceIssue({ issue, result, client, index, onResolve }) {
  const href = safeHttpHref(sourceUrl(issue, result, client));
  const target = safeHttpHref(issue.targetUrl || "");
  const evidence = issue.evidence || {};
  return (
    <article className={`audit-evidence-issue ${severityClass(issue.severity)}`}>
      <header>
        <span className="audit-evidence-severity">{severityLabel(issue.severity)}</span>
        <div><h3>{issue.label || issue.type || "Problema SEO"}</h3><p>{issue.detail || "Dettaglio non disponibile."}</p></div>
        <button type="button" className="primary" onClick={() => onResolve(index)}>Vai alla risoluzione</button>
      </header>
      <div className="audit-evidence-proof">
        <div><small>Sorgente dati</small><strong>{evidence.source}</strong></div>
        <div><small>Osservato</small><strong>{evidence.observed || "—"}</strong></div>
        <div><small>Atteso</small><strong>{evidence.expected || "—"}</strong></div>
        <div><small>Regola riproducibile</small><strong>{evidence.rule}</strong></div>
      </div>
      <footer>
        {href && <a href={href} target="_blank" rel="noreferrer"><ExternalLink /> Pagina sorgente</a>}
        {target && target !== href && <a href={target} target="_blank" rel="noreferrer"><ExternalLink /> Destinazione verificata</a>}
        <span>Tipo: {issue.type || "non classificato"}</span>
      </footer>
    </article>
  );
}

function ReviewItem({ item, result, client }) {
  const href = safeHttpHref(sourceUrl(item, result, client));
  return (
    <article className="audit-evidence-review">
      <ShieldCheck /><div><strong>{item.label || item.type}</strong><p>{item.detail}</p><small>{item.evidence?.source} · osservato: {item.evidence?.observed || "—"}</small></div>
      {href && <a href={href} target="_blank" rel="noreferrer">Verifica pagina <ExternalLink /></a>}
    </article>
  );
}

function AuditEvidenceView({ client, clientId, onRefresh }) {
  const pageStore = readJson(PAGE_HISTORY_KEY, {});
  const siteStore = readJson(SITE_HISTORY_KEY, {});
  const evidenceHistory = useMemo(() => [
    ...(Array.isArray(forClient(pageStore, clientId)) ? forClient(pageStore, clientId) : []).filter((item) => item?.auditContractVersion === 2).map((item) => ({ type: "page", item })),
    ...normalizeAnalysisHistory(forClient(siteStore, clientId)).filter((item) => item?.auditContractVersion === 2).map((item) => ({ type: "site", item })),
  ].toSorted((a, b) => time(auditDate(b.item)) - time(auditDate(a.item))), [pageStore, siteStore, clientId]);

  const [mode, setMode] = useState("page");
  const [url, setUrl] = useState(client.url);
  const [maxPages, setMaxPages] = useState(75);
  const [progressId, setProgressId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(evidenceHistory[0] || null);
  const requestRef = useRef(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const savePage = (result) => {
    const store = readJson(PAGE_HISTORY_KEY, {});
    const history = Array.isArray(forClient(store, clientId)) ? forClient(store, clientId) : [];
    writeJson(PAGE_HISTORY_KEY, { ...store, [clientId]: [result, ...history].slice(0, 30) });
  };
  const saveSite = (result) => {
    const store = readJson(SITE_HISTORY_KEY, {});
    const previousHistory = normalizeAnalysisHistory(forClient(store, clientId));
    const previous = previousHistory[0];
    const diff = analysisDiff(result, previous);
    const scoreDelta = observedScoreDelta(result, previous);
    const enriched = { ...result, ...diff, scoreDelta, hasPrevious: scoreDelta !== null };
    writeJson(SITE_HISTORY_KEY, { ...store, [clientId]: [enriched, ...previousHistory].slice(0, 20) });
    const tasks = readJson(TASKS_KEY, []);
    const generated = tasksFromAnalysis(enriched, client);
    writeJson(TASKS_KEY, reconcileAuditTasks(tasks, generated, clientId, enriched.analyzedAt));
    return enriched;
  };

  const run = async (event) => {
    event.preventDefault();
    if (loading) return;
    const id = crypto.randomUUID();
    const controller = new AbortController();
    requestRef.current = controller;
    setProgressId(id);
    setLoading(true);
    setError("");
    try {
      const endpoint = mode === "page" ? "/api/audit-evidence/page" : "/api/audit-evidence/site";
      const response = await apiFetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mode === "page" ? { url, progressId: id } : { url, maxPages, progressId: id }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Audit non riuscito.");
      const stored = mode === "page" ? data : saveSite(data);
      if (mode === "page") savePage(stored);
      setSelected({ type: mode, item: stored });
      onRefresh();
    } catch (runError) {
      if (runError.name !== "AbortError") setError(runError.message || "Audit non riuscito.");
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      setLoading(false);
    }
  };

  const result = selected?.item || null;
  const issues = result ? dedupeIssues(result.issues, result, client) : [];
  const reviewItems = result ? dedupeIssues(result.reviewItems, result, client) : [];
  const resolve = (index) => {
    if (!result) return;
    window.dispatchEvent(new CustomEvent("seogrow-remediation-open", { detail: { clientId, issueIndex: index, auditType: selected.type, analyzedAt: auditDate(result) } }));
  };
  const count = (severity) => issues.filter((issue) => severityClass(issue.severity) === severity).length;
  const checks = Array.isArray(result?.coverage?.checks) ? result.coverage.checks : coverageChecks;

  return (
    <div className="audit-evidence-root">
      <section className="audit-evidence-head">
        <div><span className="audit-evidence-icon"><CircleGauge /></span><div><small>{client.name}</small><h1>Audit SEO</h1><p>Solo rilevazioni riproducibili, con sorgente dati e regola esplicita.</p></div></div>
        <button type="button" className="secondary" onClick={() => { window.history.pushState(null, "", `#${encodeURIComponent("Problemi")}`); window.dispatchEvent(new CustomEvent("seogrow-locationchange")); }}><ListChecks /> Apri Problemi</button>
      </section>

      <section className="audit-evidence-launcher panel">
        <header><div><h2>Nuovo audit verificabile</h2><p>Pagina singola o crawl del sito. Privacy, Cookie Policy, Termini e altre pagine legali vengono escluse dal problema SEO.</p></div><span className="audit-contract-badge">Evidence contract v2</span></header>
        <form onSubmit={run}>
          <div className="audit-mode-choice"><button type="button" className={mode === "page" ? "active" : ""} onClick={() => setMode("page")}>Audit pagina</button><button type="button" className={mode === "site" ? "active" : ""} onClick={() => setMode("site")}>Audit sito</button></div>
          <label>URL HTTPS<input type="url" required value={url} onChange={(event) => setUrl(event.target.value)} /></label>
          {mode === "site" && <label>Limite pagine<input type="number" min="1" max="200" value={maxPages} onChange={(event) => setMaxPages(Number(event.target.value) || 1)} /></label>}
          <button type="submit" className="primary" disabled={loading}>{loading ? "Audit in corso…" : mode === "page" ? "Analizza pagina" : "Analizza sito"}</button>
          {loading && <button type="button" className="secondary" onClick={() => requestRef.current?.abort()}>Annulla</button>}
        </form>
        {loading && progressId && <AnalysisProgress progressId={progressId} endpoint="/api/audit-evidence/progress" />}
        {error && <p role="alert" className="error">{error}</p>}
      </section>

      {!result ? <section className="panel audit-evidence-empty"><FileSearch /><div><h2>Nessun audit verificabile salvato</h2><p>Esegui un audit v2. I vecchi audit restano nello storico ma non vengono mostrati come problemi finché non dispongono di una prova strutturata.</p></div></section> : <>
        <section className="audit-evidence-summary">
          <article><small>SEO Score</small><strong>{result.score ?? "—"}<span>/100</span></strong><p>{result.scoreMethodology}</p></article>
          <article><small>Pagine osservate</small><strong>{result.coverage?.pagesObserved ?? result.pagesChecked ?? 1}</strong><p>{result.legalPagesExcluded || result.coverage?.legalPagesExcluded || 0} pagine legali escluse</p></article>
          <article className="high"><small>Alta severità</small><strong>{count("high")}</strong><p>problemi confermati</p></article>
          <article><small>Media / Bassa</small><strong>{count("medium") + count("low")}</strong><p>problemi confermati</p></article>
        </section>

        <section className="panel audit-evidence-coverage">
          <header><div><h2>Copertura e sorgente</h2><p>Audit {selected.type === "site" ? "sito" : "pagina"} · {new Date(auditDate(result)).toLocaleString("it-IT")}</p></div><span>{result.sourceKind || "sorgente non dichiarata"}</span></header>
          <div>{checks.map((check) => <span key={check}><CheckCircle2 /> {check}</span>)}</div>
          <p><strong>Link osservati:</strong> {result.coverage?.linksObserved ?? result.links?.length ?? 0}. <strong>Controlli link massimi:</strong> {result.coverage?.linkChecksCappedAt ?? "—"}.</p>
        </section>

        <section className="audit-evidence-results">
          <header><div><h2>Problemi riproducibili</h2><p>{issues.length} issue uniche dopo deduplica per tipo, URL sorgente, destinazione ed evidenza.</p></div><span><AlertTriangle /> {issues.length}</span></header>
          {issues.length ? issues.map((issue, index) => <EvidenceIssue key={`${issueIdentity({ issueType: issue.type, sourceUrl: sourceUrl(issue, result, client), targetUrl: issue.targetUrl || "", issue })}-${index}`} issue={issue} result={result} client={client} index={index} onResolve={resolve} />) : <div className="audit-evidence-ok"><CheckCircle2 /><div><strong>Nessun problema confermato</strong><p>Non sono emerse issue che soddisfano le regole riproducibili del contratto v2.</p></div></div>}
        </section>

        {reviewItems.length > 0 && <section className="audit-evidence-review-section"><header><div><h2>Da confermare</h2><p>Segnali osservati ma non automaticamente classificati come errore: per esempio noindex intenzionale, canonical diversa o H2 assente su contenuti brevi.</p></div><ShieldCheck /></header>{reviewItems.map((item, index) => <ReviewItem key={`${item.type}-${sourceUrl(item, result, client)}-${index}`} item={item} result={result} client={client} />)}</section>}

        {evidenceHistory.length > 0 && <section className="panel audit-evidence-history"><header><h2>Audit verificabili recenti</h2><RefreshCw /></header><div>{evidenceHistory.slice(0, 12).map((entry) => <button type="button" key={`${entry.type}-${auditDate(entry.item)}-${entry.item.url}`} className={selected?.item === entry.item ? "active" : ""} onClick={() => setSelected(entry)}><strong>{entry.type === "site" ? "Sito" : "Pagina"}</strong><span>{new Date(auditDate(entry.item)).toLocaleString("it-IT")}</span><small>{entry.item.url}</small></button>)}</div></section>}
      </>}
    </div>
  );
}

export default function AuditEvidenceWorkspace() {
  const [page, setPage] = useState(pageFromHash);
  const [revision, setRevision] = useState(0);
  const [host, setHost] = useState(null);
  const active = page === "Audit SEO";

  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    const changed = () => { setPage(pageFromHash()); refresh(); };
    window.addEventListener("hashchange", changed);
    window.addEventListener("popstate", changed);
    window.addEventListener("seogrow-locationchange", changed);
    window.addEventListener("storage", refresh);
    window.addEventListener("seogrow-storage-ok", refresh);
    return () => {
      window.removeEventListener("hashchange", changed);
      window.removeEventListener("popstate", changed);
      window.removeEventListener("seogrow-locationchange", changed);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("seogrow-storage-ok", refresh);
    };
  }, [refresh]);

  useEffect(() => {
    if (!active) return undefined;
    document.body.dataset.seogrowAuditEvidence = "true";
    let frame = 0;
    let disposed = false;
    const find = () => {
      if (disposed) return;
      const main = document.querySelector(".app main");
      if (!main) { frame = window.requestAnimationFrame(find); return; }
      let node = main.querySelector(':scope > [data-audit-evidence-host="true"]');
      if (!node) {
        node = document.createElement("div");
        node.dataset.auditEvidenceHost = "true";
        main.insertBefore(node, main.firstChild);
      }
      setHost(node);
    };
    find();
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      delete document.body.dataset.seogrowAuditEvidence;
      setHost(null);
    };
  }, [active]);

  const clients = readJson(CLIENTS_KEY, []);
  const clientId = normalizeClientId(readJson(SELECTED_CLIENT_KEY, null));
  const client = clients.find((item) => normalizeClientId(item.id) === clientId) || null;
  void revision;
  if (!active || !host || !client) return null;
  return createPortal(<AuditEvidenceView key={`${clientId}-${revision}`} client={client} clientId={clientId} onRefresh={refresh} />, host);
}
