import { resolutionPath, correctionMatchesProblem } from "./resolutionPath.js";
import { matchesProblemFocus } from "./problemNavigationFocus.js";
import { openProblemResolution, RESOLUTION_FOCUS_KEY, PROPOSAL_ROUTE_PAGE } from "./AutomaticProposalNavigation.js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileSearch,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { buildUnifiedProblems } from "./problemsModel";
import { listCorrections } from "./remediationStore";
import { recheckCorrectionById } from "./remediationIntegrity";
import {
  freshnessLabel,
  normalizeClientId,
  safeHttpHref,
} from "./reliabilityModel";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";
import { navigatePage } from "./navigationUx.js";
import "./ProblemResolutionPage.css";

const PAGE = PROPOSAL_ROUTE_PAGE;
const FOCUS_KEY = RESOLUTION_FOCUS_KEY;
const REMEDIATION_FOCUS_KEY = "seogrow-remediation-focus-v1";
const AGENT_PREFILL_KEY = "seogrow-agent-prefill-v1";
const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const TASKS_KEY = "seogrow-tasks-v2";
const ANALYSES_KEY = "seogrow-analyses-v2";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";

const labelMap = {
  problem: {
    open: "Aperto",
    needs_verification: "Da confermare",
    resolved: "Risolto",
    reappeared: "Ricomparso",
    intentional: "Intenzionale",
  },
  intervention: {
    not_prepared: "Da preparare",
    prepared: "Pronto",
    approved: "Approvato",
    applied: "Applicato",
    verified: "Verificato tecnicamente",
    failed: "Fallito",
    rolled_back: "Ripristinato",
    task_completed: "Task completata",
  },
  correctability: {
    automatic: "Automatica",
    assisted: "Assistita",
    manual: "Manuale",
    not_supported: "Non supportata",
  },
  confidence: {
    observed: "Osservato",
    measured_html: "Misurato su HTML",
    needs_confirmation: "Da confermare",
  },
  severity: { high: "Alta", medium: "Media", low: "Bassa", unknown: "Non classificata" },
  priority: { high: "Alta", medium: "Media", low: "Bassa", unknown: "Non assegnata" },
};

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

const readFocus = () => {
  try {
    return JSON.parse(sessionStorage.getItem(FOCUS_KEY) || "null");
  } catch {
    return null;
  }
};

const formatDate = (value) => {
  if (!value) return "Data non disponibile";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data non disponibile";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sameProblemCorrection = correctionMatchesProblem;

const matchesFocus = matchesProblemFocus;

function ResolutionView({ problem, client, corrections, onRefresh }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const href = safeHttpHref(problem.sourceUrl);
  const latestCorrection = corrections
    .filter((item) => sameProblemCorrection(problem, item))
    .toSorted((a, b) => Date.parse(b.appliedAt || 0) - Date.parse(a.appliedAt || 0))[0] || null;

  const path = resolutionPath(problem, latestCorrection);

  const openCorrectionHistory = () => {
    try { sessionStorage.removeItem(FOCUS_KEY); } catch { /* The route still remains read-only. */ }
    window.dispatchEvent(new CustomEvent("seogrow-problem-resolution-open"));
    navigatePage("Correzioni");
  };

  const openIntervention = () => {
    if (problem.issueType === "broken-external-link" && openProblemResolution(problem, client.id, "problem-card", { controlledPreview: true })) return;
    const request = {
      clientId: client.id,
      issueKey: problem.key,
      issueType: problem.issueType,
      sourceUrl: problem.sourceUrl,
    };
    sessionStorage.setItem(REMEDIATION_FOCUS_KEY, JSON.stringify(request));
    navigatePage("Audit SEO");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("seogrow-remediation-focus", { detail: request }));
    }, 0);
  };

  const verifyNow = async () => {
    if (!latestCorrection?.id) {
      navigatePage("Audit SEO");
      return;
    }
    setWorking(true);
    setMessage("Riverifica specifica in corso…");
    try {
      const result = await recheckCorrectionById(latestCorrection.id, { clientId: client.id });
      if (result?.error) throw result.error;
      setMessage(result?.record?.verificationNote || (result?.needsAudit
        ? "Controllo frontend completato. Per confermare la risoluzione SEO serve un nuovo audit."
        : "Riverifica completata. Lo stato è stato aggiornato con la nuova evidenza."));
      await onRefresh();
    } catch (error) {
      setMessage(`Riverifica non completata: ${error.message}`);
    } finally {
      setWorking(false);
    }
  };

  const askAgent = () => {
    const detail = {
      clientId: client.id,
      title: problem.title,
      sourceUrl: problem.sourceUrl,
      problemState: labelMap.problem[problem.problemState] || problem.problemState,
      evidence: problem.evidence,
      detail: problem.detail,
    };
    sessionStorage.setItem(AGENT_PREFILL_KEY, JSON.stringify(detail));
    navigatePage("SEO Agent");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("seogrow-agent-prefill", { detail }));
    }, 0);
  };

  return (
    <div className="problem-resolution-root">
      <header className="problem-resolution-header">
        <button type="button" className="secondary problem-resolution-back" onClick={() => navigatePage("Problemi")}>
          <ArrowLeft /> Torna ai problemi
        </button>
        <div className="problem-resolution-heading">
          <span className={`problem-severity ${problem.severity}`}>Gravità {labelMap.severity[problem.severity]}</span>
          <div>
            <small>Risoluzione problema · {client.name}</small>
            <h1>{problem.title}</h1>
            <p>{problem.sourceUrl || "URL non disponibile"}</p>
          </div>
        </div>
      </header>

      <section className="problem-resolution-status" aria-label="Stato del problema">
        <div><small>Stato problema</small><strong>{labelMap.problem[problem.problemState] || problem.problemState}</strong></div>
        <div><small>Stato intervento</small><strong>{labelMap.intervention[problem.interventionState] || problem.interventionState}</strong></div>
        <div><small>Correggibilità</small><strong>{labelMap.correctability[problem.correctability] || problem.correctability}</strong></div>
        <div><small>Ultima osservazione</small><strong>{formatDate(problem.observedAt)}</strong></div>
      </section>

      <div className="problem-resolution-layout">
        <main className="problem-resolution-content">
          <section className="problem-resolution-section tone-blue">
            <span className="problem-resolution-number">1</span>
            <div>
              <h2>Che cosa è stato rilevato</h2>
              <p>{problem.detail}</p>
              {(problem.targetUrls || []).length > 0 && <div className="problem-resolution-targets"><strong>Link interessati</strong>{problem.targetUrls.map(target => safeHttpHref(target) ? <a key={target} href={safeHttpHref(target)} target="_blank" rel="noopener noreferrer">{target}</a> : null)}</div>}
              <dl className="problem-resolution-facts">
                <div><dt>Tipo</dt><dd>{problem.issueType || "Non classificato"}</dd></div>
                <div><dt>Gravità tecnica</dt><dd>{labelMap.severity[problem.severity]}</dd></div>
                <div><dt>Priorità operativa</dt><dd>{labelMap.priority[problem.priority]}</dd></div>
                <div><dt>Certezza</dt><dd>{labelMap.confidence[problem.confidence] || problem.confidence}</dd></div>
                <div><dt>Freschezza</dt><dd>{freshnessLabel(problem.observedAt)}</dd></div>
                <div><dt>Copertura</dt><dd>{problem.auditScopes.length ? problem.auditScopes.map((scope) => scope === "site" ? "Crawl sito" : "Audit pagina").join(" + ") : "Non disponibile"}</dd></div>
              </dl>
            </div>
          </section>

          <section className="problem-resolution-section tone-mint">
            <span className="problem-resolution-number">2</span>
            <div>
              <h2>Qual è la prova</h2>
              {problem.evidence.length ? (
                <ol className="problem-resolution-evidence">
                  {problem.evidence.map((item, index) => (
                    <li key={`${item.source}-${item.at}-${index}`}>
                      <FileSearch />
                      <div><strong>{item.source}</strong><span>{item.detail}</span><small>{formatDate(item.at)} · {item.nature === "verified" ? "verifica tecnica" : item.nature === "observed" ? "dato osservato" : "dato operativo"}</small></div>
                    </li>
                  ))}
                </ol>
              ) : <p>Nessuna evidenza strutturata disponibile. Il problema resta da confermare.</p>}
            </div>
          </section>

          <section className="problem-resolution-section tone-blue">
            <span className="problem-resolution-number">3</span>
            <div>
              <h2>Che cosa propone SeoGrow</h2>
              {problem.ownershipBlocked ? (
                <p>La correzione automatica è bloccata perché SeoGrow non può attribuire con certezza il frontend a un singolo campo o widget. Il blocco di sicurezza resta attivo.</p>
              ) : (
                <p>
                  {problem.correctability === "automatic" && "SeoGrow può preparare una proposta automatica. La scrittura resta separata e richiede sempre anteprima e approvazione."}
                  {problem.correctability === "assisted" && "Serve una verifica del contesto prima di autorizzare la modifica."}
                  {problem.correctability === "manual" && "SeoGrow può guidare l'intervento, ma non deve applicarlo automaticamente."}
                  {problem.correctability === "not_supported" && "Questo caso non dispone di un adapter automatico sicuro."}
                </p>
              )}
              <div className="problem-resolution-guidance"><h3>{path.title}</h3><p>{path.instructions}</p></div>
              {problem.fields.length > 0 && <p><strong>Campi coinvolti:</strong> {problem.fields.join(", ")}</p>}
              {problem.adapters.length > 0 && <p><strong>Adapter:</strong> {problem.adapters.join(", ")}</p>}
              {problem.quality && <p><strong>Quality gate:</strong> {problem.quality.publishable === false ? "revisione richiesta" : "superato"}</p>}
            </div>
          </section>

          <section className="problem-resolution-section tone-mint">
            <span className="problem-resolution-number">4</span>
            <div>
              <h2>Dopo l’approvazione</h2>
              <p>La modifica viene registrata come applicata. Solo una verifica frontend recente e, quando richiesto dal tipo di problema, un nuovo audit possono portare lo stato SEO a risolto.</p>
              {latestCorrection && (
                <div className="problem-resolution-correction">
                  <ShieldCheck />
                  <div>
                    <strong>Ultima correzione collegata</strong>
                    <span>{labelMap.intervention[latestCorrection.status] || latestCorrection.status || "Stato disponibile nello storico"}</span>
                    <small>{formatDate(latestCorrection.verifiedAt || latestCorrection.appliedAt)}</small>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>

        <aside className="problem-resolution-actions">
          <div>
            <small>Prossima azione</small>
            <h2>Risolvi e verifica</h2>
            <p>Procedi sul singolo problema senza perdere il contesto della pagina.</p>
          </div>

          {href && <a className="secondary problem-resolution-resource" href={href} target="_blank" rel="noreferrer"><ExternalLink /> Apri pagina interessata</a>}

          <button className="primary" type="button" disabled={working} onClick={() => {
            if (path.action === "history") openCorrectionHistory();
            else if (path.action === "verify") verifyNow();
            else if (path.action === "agent") askAgent();
            else if (path.action === "manual" && href) window.open(href, "_blank", "noopener,noreferrer");
            else if (path.action === "audit") navigatePage("Audit SEO");
            else openIntervention();
          }}>{working ? "Verifica…" : path.label}</button>

          <button className="secondary" type="button" onClick={askAgent}><Sparkles /> Chiedi a SeoGrow</button>
          <button className="secondary" type="button" onClick={openCorrectionHistory}><CheckCircle2 /> Apri Correzioni</button>

          {message && <p className="problem-resolution-message" role="status">{message}</p>}
        </aside>
      </div>
    </div>
  );
}

export default function ProblemResolutionPage() {
  const isActive = () => currentPage() === PAGE && Boolean(readFocus()) && normalizeClientId(readFocus()?.clientId) === normalizeClientId(readJson(SELECTED_CLIENT_KEY, null));
  const [active, setActive] = useState(isActive);
  const [mainTarget, setMainTarget] = useState(null);
  const [revision, setRevision] = useState(0);
  const [corrections, setCorrections] = useState([]);
  const [correctionsError, setCorrectionsError] = useState("");

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    let mountedHost = null;
    const findMain = () => {
      const workspace = document.querySelector(".workspace");
      if (workspace) {
        const target = document.createElement("div");
        target.className = "problem-resolution-root-host";
        workspace.appendChild(target);
        mountedHost = target;
        setMainTarget(target);
        return;
      }
      attempts += 1;
      if (attempts < 120) frame = window.requestAnimationFrame(findMain);
    };
    frame = window.requestAnimationFrame(findMain);
    return () => { window.cancelAnimationFrame(frame); mountedHost?.remove(); };
  }, []);

  useEffect(() => {
    const refresh = () => {
      setActive(currentPage() === PAGE && Boolean(readFocus()) && normalizeClientId(readFocus()?.clientId) === normalizeClientId(readJson(SELECTED_CLIENT_KEY, null)));
      setRevision((value) => value + 1);
    };
    window.addEventListener("seogrow-problem-resolution-open", refresh);
    window.addEventListener("seogrow-automatic-proposal-open", refresh);
    window.addEventListener("hashchange", refresh);
    window.addEventListener("popstate", refresh);
    window.addEventListener("seogrow-locationchange", refresh);
    window.addEventListener("seogrow-storage-ok", refresh);
    window.addEventListener("seogrow-remediation-history", refresh);
    return () => {
      window.removeEventListener("seogrow-problem-resolution-open", refresh);
      window.removeEventListener("seogrow-automatic-proposal-open", refresh);
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
      window.removeEventListener("seogrow-storage-ok", refresh);
      window.removeEventListener("seogrow-remediation-history", refresh);
    };
  }, []);

  useEffect(() => {
    const interceptProblemRow = (event) => {
      if (currentPage() !== "Problemi") return;
      const row = event.target.closest?.(".problem-row");
      if (!row || row.dataset.problemNavigation === "direct" || event.target.closest?.("a")) return;
      const title = row.querySelector(".problem-main strong")?.textContent?.trim() || "";
      const sourceUrl = row.querySelector(".problem-main small")?.textContent?.trim() || "";
      if (!title || !sourceUrl || sourceUrl === "URL non disponibile") return;
      const selectedClientId = normalizeClientId(readJson(SELECTED_CLIENT_KEY, null));
      if (!openProblemResolution({ title, sourceUrl, correctability: "manual" }, selectedClientId, "problem-row")) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      // The data-driven destination is already open; never open an intermediate list.
    };
    document.addEventListener("click", interceptProblemRow, true);
    return () => document.removeEventListener("click", interceptProblemRow, true);
  }, []);

  const selectedClientId = normalizeClientId(readJson(SELECTED_CLIENT_KEY, null));
  const clients = readJson(CLIENTS_KEY, []);
  const client = clients.find((item) => normalizeClientId(item?.id) === selectedClientId) || null;

  useEffect(() => {
    if (!active || !selectedClientId) return undefined;
    let cancelled = false;
    listCorrections({ clientId: selectedClientId })
      .then((rows) => {
        if (!cancelled) {
          setCorrections(rows);
          setCorrectionsError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setCorrections([]);
          setCorrectionsError(`Storico correzioni non leggibile: ${error.message}`);
        }
      });
    return () => { cancelled = true; };
  }, [active, selectedClientId, revision]);

  useEffect(() => {
    if (!active) return undefined;
    document.body.dataset.seogrowProblemResolution = "true";
    return () => { delete document.body.dataset.seogrowProblemResolution; };
  }, [active]);

  if (!active || !mainTarget) return null;

  const focus = readFocus();
  const tasks = readJson(TASKS_KEY, []);
  const analyses = readJson(ANALYSES_KEY, {});
  const pageHistory = readJson(PAGE_HISTORY_KEY, {});
  const model = client ? buildUnifiedProblems({
    clientId: client.id,
    siteHistory: analyses[client.id] || analyses[String(client.id)] || [],
    pageHistory: pageHistory[client.id] || pageHistory[String(client.id)] || [],
    tasks,
    corrections,
  }) : { rows: [] };
  const problem = normalizeClientId(focus?.clientId) === selectedClientId ? model.rows.find((row) => matchesFocus(row, focus)) || null : null;

  const reloadCorrections = async () => {
    if (!selectedClientId) return;
    const rows = await listCorrections({ clientId: selectedClientId });
    setCorrections(rows);
    setRevision((value) => value + 1);
  };

  const content = !client || !problem ? (
    <div className="problem-resolution-root problem-resolution-missing">
      <button type="button" className="secondary problem-resolution-back" onClick={() => navigatePage("Problemi")}><ArrowLeft /> Torna ai problemi</button>
      <section>
        <h1>Problema non disponibile</h1>
        <p>Il problema selezionato non è più presente nei dati correnti oppure il progetto attivo è cambiato.</p>
        {correctionsError && <p role="alert">{correctionsError}</p>}
      </section>
    </div>
  ) : <ResolutionView problem={problem} client={client} corrections={corrections} onRefresh={reloadCorrections} />;

  return createPortal(content, mainTarget);
}
