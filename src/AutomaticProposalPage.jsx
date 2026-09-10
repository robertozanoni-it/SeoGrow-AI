import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, ExternalLink, FileSearch, ShieldCheck, WandSparkles } from "lucide-react";
import { buildUnifiedProblems } from "./problemsModel.js";
import { normalizeAnalysisHistory } from "./platform.js";
import { listCorrections } from "./remediationStore.js";
import { normalizeClientId, normalizeHttpUrl, safeHttpHref } from "./reliabilityModel.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { navigatePage } from "./navigationUx.js";
import {
  PROPOSAL_PAGE,
  PROPOSAL_ROUTE_PAGE,
  clearAutomaticProposalFocus,
  readAutomaticProposalFocus,
} from "./AutomaticProposalNavigation.js";
import "./AutomaticProposalPage.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const TASKS_KEY = "seogrow-tasks-v2";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";

const currentPage = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

const readJson = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
};

const normalizedUrl = (value) => normalizeHttpUrl(value || "", { stripSlash: true });
const issueSourceUrl = (issue, audit, client) => {
  const type = String(issue?.type || "").toLowerCase();
  const brokenLink = /broken-(?:external-)?link/.test(type);
  return issue?.sourceUrl || issue?.url || (!brokenLink ? issue?.targetUrl : "") || audit?.url || client?.url || "";
};
const auditTimestamp = (audit) => audit?.analyzedAt || audit?.startedAt || "";

const matchesFocus = (problem, focus) => {
  if (!problem || !focus) return false;
  const titleMatches = String(problem.title || "").trim().toLowerCase() === String(focus.title || "").trim().toLowerCase();
  return titleMatches && normalizedUrl(problem.sourceUrl) === normalizedUrl(focus.sourceUrl);
};

const findAuditFocus = ({ clientId, client, focus, problem, pageHistory, siteHistory }) => {
  if (!clientId || !client || !focus) return null;
  const pages = Array.isArray(pageHistory?.[clientId])
    ? pageHistory[clientId]
    : Array.isArray(pageHistory?.[String(clientId)])
      ? pageHistory[String(clientId)]
      : [];
  const sites = normalizeAnalysisHistory(siteHistory?.[clientId] ?? siteHistory?.[String(clientId)] ?? []);
  const candidates = [
    ...pages.map((item) => ({ auditType: "page", item })),
    ...sites.map((item) => ({ auditType: "site", item })),
  ].toSorted((a, b) => Date.parse(auditTimestamp(b.item) || 0) - Date.parse(auditTimestamp(a.item) || 0));
  const wantedType = String(problem?.issueType || "").trim().toLowerCase();
  const wantedUrl = normalizedUrl(problem?.sourceUrl || focus.sourceUrl);
  const wantedTitle = String(problem?.title || focus.title || "").trim().toLowerCase();

  for (const entry of candidates) {
    const issues = Array.isArray(entry.item?.issues) ? entry.item.issues : [];
    const issueIndex = issues.findIndex((issue) => {
      const type = String(issue?.type || "").trim().toLowerCase();
      const title = String(issue?.label || issue?.title || issue?.type || "").trim().toLowerCase();
      const typeMatches = wantedType ? type === wantedType : title === wantedTitle;
      const urlMatches = normalizedUrl(issueSourceUrl(issue, entry.item, client)) === wantedUrl;
      return typeMatches && urlMatches;
    });
    if (issueIndex >= 0) {
      return {
        clientId,
        issueIndex,
        auditType: entry.auditType,
        analyzedAt: auditTimestamp(entry.item),
      };
    }
  }
  return null;
};

const label = (value, map) => map[value] || value || "Non disponibile";
const labels = {
  severity: { high: "Alta", medium: "Media", low: "Bassa", unknown: "Non classificata" },
  state: { open: "Aperto", needs_verification: "Da confermare", resolved: "Risolto", reappeared: "Ricomparso", intentional: "Intenzionale" },
  correctability: { automatic: "Automatica", assisted: "Assistita", manual: "Manuale", not_supported: "Non supportata" },
};

function RemediationFocusDispatcher({ focus }) {
  const serialized = focus ? JSON.stringify(focus) : "";
  useEffect(() => {
    if (!serialized) return undefined;
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("seogrow-remediation-open", { detail: JSON.parse(serialized) }));
    }, 220);
    return () => window.clearTimeout(timer);
  }, [serialized]);
  return null;
}

export default function AutomaticProposalPage() {
  const [host, setHost] = useState(null);
  const [revision, setRevision] = useState(0);
  const [correctionSnapshot, setCorrectionSnapshot] = useState({ clientId: null, rows: [], error: "" });

  const focus = readAutomaticProposalFocus();
  const active = currentPage() === PROPOSAL_ROUTE_PAGE && Boolean(focus);
  const selectedClientId = normalizeClientId(focus?.clientId || readJson(SELECTED_CLIENT_KEY, null));

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    window.addEventListener("hashchange", refresh);
    window.addEventListener("popstate", refresh);
    window.addEventListener("seogrow-locationchange", refresh);
    window.addEventListener("seogrow-storage-ok", refresh);
    window.addEventListener("seogrow-automatic-proposal-open", refresh);
    window.addEventListener("seogrow-automatic-proposal-close", refresh);
    window.addEventListener("seogrow-remediation-history", refresh);
    window.addEventListener("seogrow-remediation-applied", refresh);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
      window.removeEventListener("seogrow-storage-ok", refresh);
      window.removeEventListener("seogrow-automatic-proposal-open", refresh);
      window.removeEventListener("seogrow-automatic-proposal-close", refresh);
      window.removeEventListener("seogrow-remediation-history", refresh);
      window.removeEventListener("seogrow-remediation-applied", refresh);
    };
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    let mountedHost = null;

    const install = () => {
      if (cancelled) return;
      const workspace = document.querySelector(".workspace");
      if (!workspace) {
        if (attempts < 120) {
          attempts += 1;
          frame = window.requestAnimationFrame(install);
        }
        return;
      }

      mountedHost = document.createElement("div");
      mountedHost.className = "automatic-proposal-root-host";
      mountedHost.setAttribute("data-seogrow-dedicated-page", "proposal");
      workspace.appendChild(mountedHost);
      setHost(mountedHost);
    };

    frame = window.requestAnimationFrame(install);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      mountedHost?.remove();
    };
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    document.body.dataset.seogrowAutomaticProposal = "true";
    return () => { delete document.body.dataset.seogrowAutomaticProposal; };
  }, [active]);

  useEffect(() => {
    if (!active || !selectedClientId) return undefined;
    let cancelled = false;
    listCorrections({ clientId: selectedClientId })
      .then((rows) => {
        if (!cancelled) setCorrectionSnapshot({ clientId: selectedClientId, rows, error: "" });
      })
      .catch((error) => {
        if (!cancelled) setCorrectionSnapshot({ clientId: selectedClientId, rows: [], error: error.message || String(error) });
      });
    return () => { cancelled = true; };
  }, [active, selectedClientId, revision]);

  if (!active || !host?.isConnected) return null;

  const clients = readJson(CLIENTS_KEY, []);
  const client = clients.find((item) => normalizeClientId(item?.id) === selectedClientId) || null;
  const tasks = readJson(TASKS_KEY, []);
  const pageHistory = readJson(PAGE_HISTORY_KEY, {});
  const siteHistory = readJson(SITE_HISTORY_KEY, {});
  const correctionsReady = correctionSnapshot.clientId === selectedClientId;
  const corrections = correctionsReady ? correctionSnapshot.rows : [];
  const model = client && correctionsReady ? buildUnifiedProblems({
    clientId: client.id,
    siteHistory: siteHistory[client.id] || siteHistory[String(client.id)] || [],
    pageHistory: pageHistory[client.id] || pageHistory[String(client.id)] || [],
    tasks,
    corrections,
  }) : { rows: [] };
  const problem = model.rows.find((row) => matchesFocus(row, focus)) || null;
  const auditFocus = findAuditFocus({ clientId: selectedClientId, client, focus, problem, pageHistory, siteHistory });
  const href = safeHttpHref(problem?.sourceUrl || focus?.sourceUrl);

  const closeAndGo = (page) => {
    clearAutomaticProposalFocus();
    window.dispatchEvent(new CustomEvent("seogrow-automatic-proposal-close"));
    if (page === PROPOSAL_ROUTE_PAGE) {
      setRevision((value) => value + 1);
      return;
    }
    navigatePage(page);
  };

  const content = (
    <div className="automatic-proposal-page" data-revision={revision}>
      {auditFocus && problem?.correctability === "automatic" && <RemediationFocusDispatcher focus={auditFocus} />}
      <header className="automatic-proposal-header">
        <button type="button" className="secondary" onClick={() => closeAndGo("Problemi")}><ArrowLeft /> Torna ai problemi</button>
        <div>
          <span className="automatic-proposal-kicker"><WandSparkles /> Correzione automatica</span>
          <h1>{PROPOSAL_PAGE}</h1>
          <p>{problem?.title || focus?.title || "Problema SEO"}</p>
          <small>{problem?.sourceUrl || focus?.sourceUrl || "URL non disponibile"}</small>
        </div>
        <button type="button" className="secondary" onClick={() => closeAndGo(PROPOSAL_ROUTE_PAGE)}>Apri elenco Correzioni</button>
      </header>

      {!correctionsReady ? (
        <section className="automatic-proposal-warning" role="status">
          <h2>Caricamento dello stato reale</h2>
          <p>SeoGrow sta leggendo audit, task e storico correzioni prima di preparare una nuova proposta.</p>
        </section>
      ) : correctionSnapshot.error ? (
        <section className="automatic-proposal-warning" role="alert">
          <h2>Storico correzioni non leggibile</h2>
          <p>{correctionSnapshot.error}. Nessuna nuova proposta viene preparata finché lo stato precedente non è verificabile.</p>
          <button type="button" className="secondary" onClick={() => setRevision((value) => value + 1)}>Riprova</button>
        </section>
      ) : problem ? (
        <>
          <section className="automatic-proposal-summary" aria-label="Riepilogo del problema">
            <div><small>Problema</small><strong>{problem.title}</strong></div>
            <div><small>Gravità</small><strong>{label(problem.severity, labels.severity)}</strong></div>
            <div><small>Stato</small><strong>{label(problem.problemState, labels.state)}</strong></div>
            <div><small>Correggibilità</small><strong>{label(problem.correctability, labels.correctability)}</strong></div>
          </section>

          <section className="automatic-proposal-context">
            <article>
              <span>1</span>
              <div><h2>Problema rilevato</h2><p>{problem.detail || "Nessun dettaglio aggiuntivo."}</p></div>
            </article>
            <article>
              <span>2</span>
              <div>
                <h2>Prova</h2>
                {problem.evidence?.length
                  ? problem.evidence.slice(0, 3).map((item, index) => <p key={`${item.source}-${index}`}><FileSearch /> <strong>{item.source}</strong> · {item.detail}</p>)
                  : <p>La prova è disponibile nei dati dell’audit collegato.</p>}
              </div>
            </article>
            <article>
              <span>3</span>
              <div><h2>Proposta automatica</h2><p>SeoGrow prepara l’anteprima soltanto se lo stato corrente è ancora <strong>Automatica</strong>. Prima dell’approvazione mostra sempre <strong>Adesso sul sito</strong> e <strong>Dopo la modifica</strong>.</p></div>
            </article>
          </section>

          {href && <a className="secondary automatic-proposal-resource" href={href} target="_blank" rel="noreferrer"><ExternalLink /> Apri pagina interessata</a>}

          <section className="automatic-proposal-runtime">
            <div className="automatic-proposal-runtime-head">
              <ShieldCheck />
              <div>
                <small>Proposta e approvazione</small>
                <h2>Prepara la correzione del problema selezionato</h2>
                <p>Collega WordPress, prepara l’anteprima, confronta prima/dopo e applica soltanto se approvi la singola modifica.</p>
              </div>
            </div>
            {problem.correctability !== "automatic" ? (
              <div className="automatic-proposal-warning" role="alert">
                <strong>La correzione automatica non è più autorizzata.</strong>
                <p>I dati correnti classificano questo caso come {label(problem.correctability, labels.correctability)}. SeoGrow non forza una proposta automatica su uno stato cambiato.</p>
                <button type="button" className="secondary" onClick={() => closeAndGo("Problemi")}>Torna ai problemi</button>
              </div>
            ) : problem.problemState === "resolved" ? (
              <div className="automatic-proposal-warning" role="status">
                <strong>Problema già verificato come risolto.</strong>
                <p>Lo storico correzioni conferma la risoluzione. Esegui un nuovo audit se vuoi controllare che non sia ricomparso.</p>
                <button type="button" className="secondary" onClick={() => closeAndGo("Audit SEO")}>Apri Audit SEO</button>
              </div>
            ) : auditFocus ? (
              <div className="proposal-remediation-slot" />
            ) : (
              <div className="automatic-proposal-warning" role="alert">
                <strong>Audit sorgente non individuato con certezza.</strong>
                <p>Il problema resta visibile, ma SeoGrow non apre una proposta automatica su un audit diverso da quello che ha generato l’evidenza.</p>
                <button type="button" className="secondary" onClick={() => closeAndGo("Audit SEO")}>Apri Audit SEO</button>
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="automatic-proposal-warning" role="alert">
          <h2>Problema non più disponibile</h2>
          <p>Il problema selezionato non coincide più con i dati correnti del progetto. Torna a Problemi e selezionalo di nuovo.</p>
          <button type="button" className="secondary" onClick={() => closeAndGo("Problemi")}>Torna ai problemi</button>
        </section>
      )}
    </div>
  );

  return createPortal(content, host);
}
