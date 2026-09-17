import { confirmAction } from "./ui/dialogs.js";
import { formatUiDate as formatDate } from "./ui/dateFormat.js";
import { readWorkspaceJson as readJson } from "./core/workspace/jsonStorage.js";
import { resolutionPath, correctionMatchesProblem } from "./resolutionPath.js";
import { problemResolutionPriority } from "./problemResolutionPriority.js";
import { matchesProblemFocus } from "./problemNavigationFocus.js";
import { excludeProblemPermanently } from "./problemDisposition.js";
import { correctionReceiptFields } from "./correctionReceipt.js";
import { openProblemResolution, RESOLUTION_FOCUS_KEY, PROPOSAL_ROUTE_PAGE } from "./AutomaticProposalNavigation.js";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Ban, ExternalLink, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { buildUnifiedProblems } from "./problemsModel";
import { listCorrections } from "./remediationStore";
import { recheckCorrectionById } from "./remediationIntegrity";
import { freshnessLabel, normalizeClientId, safeHttpHref } from "./reliabilityModel";
import { navigatePage } from "./navigationUx.js";
import "./ProblemResolutionPage.css";

const PAGE = PROPOSAL_ROUTE_PAGE;
const FOCUS_KEY = RESOLUTION_FOCUS_KEY;
const AGENT_PREFILL_KEY = "seogrow-agent-prefill-v1";
const AGENT_AUTORUN_KEY = "seogrow-agent-autorun-v1";
const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const TASKS_KEY = "seogrow-tasks-v2";
const ANALYSES_KEY = "seogrow-analyses-v2";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const PROBLEM_CLOSURES_KEY = "seogrow-problem-closures-v1";

const labelMap = {
  problem: { open: "Aperto", needs_verification: "Da confermare", resolved: "Risolto", reappeared: "Ricomparso", intentional: "Non modificare" },
  intervention: { not_prepared: "Da preparare", prepared: "Pronto", approved: "Approvato", applied: "Applicato", verified: "Verificato tecnicamente", failed: "Fallito", rolled_back: "Ripristinato", task_completed: "Task completata" },
  correctability: { automatic: "Automatica", assisted: "Assistita", manual: "Manuale", not_supported: "Non supportata" },
  confidence: { observed: "Osservato", measured_html: "Misurato su HTML", needs_confirmation: "Da confermare" },
  severity: { high: "Alta", medium: "Media", low: "Bassa", unknown: "Non classificata" },
  priority: { high: "Alta", medium: "Media", low: "Bassa", unknown: "Non assegnata" },
};

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; } catch { return "Panoramica"; }
};
const readFocus = () => {
  try { return JSON.parse(sessionStorage.getItem(FOCUS_KEY) || "null"); } catch { return null; }
};
const sameProblemCorrection = correctionMatchesProblem;
const matchesFocus = matchesProblemFocus;
const displayValue = (value, available) => {
  if (!available) return "Non disponibile nello snapshot salvato";
  if (value === "") return "(vuoto)";
  if (value == null) return "(valore nullo)";
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
};

function ResolutionView({ problem, client, corrections, onRefresh }) {
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const href = safeHttpHref(problem.sourceUrl);
  const latestCorrection = corrections
    .filter((item) => sameProblemCorrection(problem, item))
    .toSorted((a, b) => (Date.parse(b.verifiedAt || b.appliedAt || b.createdAt || "") || 0) - (Date.parse(a.verifiedAt || a.appliedAt || a.createdAt || "") || 0))[0] || null;
  const beforeAfter = latestCorrection ? correctionReceiptFields(latestCorrection) : [];

  const path = resolutionPath(problem, latestCorrection);
  const priority = problemResolutionPriority(problem, latestCorrection);
  const verificationSnapshot = latestCorrection?.frontendSnapshot || null;
  const verificationMismatch = latestCorrection?.frontendFailure === true
    && latestCorrection?.verificationFailure?.nextAction === "PREPARE_AND_REVERIFY"
    && Boolean(verificationSnapshot?.expected);
  const observedVerificationValue = verificationSnapshot?.observed
    ?? verificationSnapshot?.metaDescription
    ?? verificationSnapshot?.title
    ?? "Non rilevato";
  const verificationFieldLabel = verificationSnapshot?.label || "valore SEO";

  const openCorrectionHistory = () => {
    try { sessionStorage.removeItem(FOCUS_KEY); } catch { /* route remains read-only */ }
    window.dispatchEvent(new CustomEvent("seogrow-problem-resolution-open"));
    navigatePage("Correzioni");
  };

  const verifyNow = async () => {
    if (!latestCorrection?.id) { navigatePage("Audit SEO"); return; }
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
    } finally { setWorking(false); }
  };

  const startAutomaticResolution = () => openProblemResolution(problem, client.id, "problem-card", { forceAutomatic: true });
  const prepareApprovalSolution = () => openProblemResolution(problem, client.id, "problem-card", { controlledPreview: true });
  const confirmContextAndPrepare = () => {
    const text = priority.kind === "canonical"
      ? `Confermi che ${problem.sourceUrl} debba avere canonical verso se stessa? Verrà preparato il Prima/Dopo e dovrai approvare la scrittura.`
      : `Confermi che ${problem.sourceUrl} debba essere indicizzabile? Verrà preparato il Prima/Dopo e dovrai approvare la scrittura.`;
    if (!confirmAction(text)) return;
    openProblemResolution(problem, client.id, "problem-card", { controlledContextPreview: true });
  };

  const askAgentForManualWork = () => {
    const detail = {
      clientId: client.id,
      issueKey: problem.key,
      issueType: problem.issueType,
      title: problem.title,
      sourceUrl: problem.sourceUrl,
      problemState: labelMap.problem[problem.problemState] || problem.problemState,
      problemStateCode: problem.problemState,
      interventionStateCode: problem.interventionState,
      correctability: problem.correctability,
      reviewOnly: problem.reviewOnly === true,
      ownershipBlocked: problem.ownershipBlocked === true,
      stale: problem.stale === true,
      targetUrls: problem.targetUrls || [],
      evidence: problem.evidence,
      detail: problem.detail,
    };
    sessionStorage.setItem(AGENT_PREFILL_KEY, JSON.stringify(detail));
    sessionStorage.setItem(AGENT_AUTORUN_KEY, "1");
    navigatePage("SEO Agent");
    window.setTimeout(() => window.dispatchEvent(new CustomEvent("seogrow-agent-prefill", { detail })), 0);
  };

  const doNotModify = () => {
    const accepted = confirmAction(`Escludere definitivamente “${problem.title}” dai problemi attivi? La scelta “Non modificare” resterà valida anche dopo nuovi audit finché non verrà riattivata esplicitamente.`);
    if (!accepted) return;
    try {
      excludeProblemPermanently(problem, client.id);
      try { sessionStorage.removeItem(FOCUS_KEY); } catch { /* navigation remains safe */ }
      navigatePage("Problemi");
    } catch (error) {
      setMessage(`Esclusione non completata: ${error.message}`);
    }
  };

  const runPrimaryAction = () => {
    if (verificationMismatch) return prepareApprovalSolution();
    if (priority.mode === "automatic") return startAutomaticResolution();
    if (priority.mode === "approval") return prepareApprovalSolution();
    if (priority.mode === "confirm") return confirmContextAndPrepare();
    if (priority.mode === "verify") {
      if (priority.action === "history") return openCorrectionHistory();
      return verifyNow();
    }
    if (priority.mode === "audit" || path.action === "audit") return navigatePage("Audit SEO");
    return askAgentForManualWork();
  };

  return (
    <div className="problem-resolution-root">
      <header className="problem-resolution-header">
        <button type="button" className="secondary problem-resolution-back" onClick={() => navigatePage("Problemi")}><ArrowLeft /> Torna ai problemi</button>
        <div className="problem-resolution-heading">
          <span className={`problem-severity ${problem.severity}`}>Gravità {labelMap.severity[problem.severity]}</span>
          <div><small>Problema → Correzione · {client.name}</small><h1>{problem.title}</h1><p>{problem.sourceUrl || "URL non disponibile"}</p></div>
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
              <h2>Problema</h2>
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
              <h2>Spiegazione</h2>
              <p>{priority.instructions || path.instructions}</p>
              {problem.evidence.length ? <ol className="problem-resolution-evidence">{problem.evidence.map((item, index) => <li key={`${item.source}-${item.at}-${index}`}><FileSearch /><div><strong>{item.source}</strong><span>{item.detail}</span><small>{formatDate(item.at)} · {item.nature === "verified" ? "verifica tecnica" : item.nature === "observed" ? "dato osservato" : "dato operativo"}</small></div></li>)}</ol> : <p>Nessuna evidenza strutturata disponibile: prima di modificare serve un nuovo controllo.</p>}
            </div>
          </section>

          <section className="problem-resolution-section tone-blue">
            <span className="problem-resolution-number">3</span>
            <div>
              <h2>Prima / Dopo</h2>
              {beforeAfter.length ? <div className="problem-resolution-before-after">{beforeAfter.map((field) => <article key={field.field}><h3>{field.field}</h3><div><section><strong>Prima</strong><pre>{displayValue(field.before, field.beforeAvailable)}</pre></section><section><strong>Dopo</strong><pre>{displayValue(field.after, field.afterAvailable)}</pre></section></div></article>)}</div> : <div className="problem-resolution-before-after empty"><section><strong>Prima</strong><p>{problem.detail || "Valore corrente rilevato dall’audit."}</p></section><section><strong>Dopo</strong><p>Non ancora disponibile. SeoGrow lo mostrerà soltanto dopo una preparazione reale; nessun valore viene inventato.</p></section></div>}
              {latestCorrection && <div className="problem-resolution-correction"><ShieldCheck /><div><strong>Ultima correzione collegata</strong><span>{latestCorrection.status || "Stato disponibile nello storico"}</span><small>{formatDate(latestCorrection.verifiedAt || latestCorrection.appliedAt || latestCorrection.createdAt)}</small></div></div>}
            </div>
          </section>

          <section className="problem-resolution-section tone-mint">
            <span className="problem-resolution-number">4</span>
            <div>
              <h2>Soluzione</h2>
              {problem.ownershipBlocked ? <p>La modifica automatica è bloccata: l’ownership del campo o widget non è determinata con certezza.</p> : <p>{priority.title || path.title}</p>}
              <div className="problem-resolution-guidance"><h3>{priority.label}</h3><p>{priority.instructions || path.instructions}</p></div>
              {problem.fields.length > 0 && <p><strong>Campi coinvolti:</strong> {problem.fields.join(", ")}</p>}
              {problem.adapters.length > 0 && <p><strong>Adapter:</strong> {problem.adapters.join(", ")}</p>}
              <p>Una modifica applicata non chiude da sola il problema: la chiusura richiede verifica recente o un audit successivo che ne confermi l’assenza.</p>
            </div>
          </section>
        </main>

        <aside className="problem-resolution-actions">
          <div><small>Prossima azione</small><h2>{priority.label}</h2><p>Una sola azione principale in base alla correggibilità reale del problema.</p></div>
          {href && <a className="secondary problem-resolution-resource" href={href} target="_blank" rel="noreferrer"><ExternalLink /> Apri pagina interessata</a>}
          {verificationMismatch && <div className="problem-resolution-guidance" role="alert"><h3>Verifica fallita</h3><p><strong>{verificationFieldLabel} atteso:</strong> {verificationSnapshot.expected}</p><p><strong>Valore rilevato:</strong> {observedVerificationValue}</p><p>La scrittura non è confermata nel markup pubblico. Serve una nuova correzione controllata.</p></div>}
          <button className="primary problem-resolution-auto" type="button" disabled={working || problem.problemState === "intentional"} onClick={runPrimaryAction}><Sparkles />{working ? "Verifica…" : verificationMismatch ? "Prepara correzione" : priority.label}</button>
          {problem.problemState !== "resolved" && problem.problemState !== "intentional" && <button className="secondary problem-resolution-do-not-modify" type="button" onClick={doNotModify}><Ban /> Non modificare</button>}
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
    if (!active) return undefined;
    let cancelled = false;
    let timer = 0;
    let mountedHost = null;
    const install = () => {
      if (cancelled) return;
      const workspace = document.querySelector(".workspace");
      if (!workspace) return;
      if (mountedHost?.isConnected && mountedHost.parentElement === workspace) return;
      mountedHost?.remove();
      mountedHost = document.createElement("div");
      mountedHost.className = "problem-resolution-root-host";
      workspace.appendChild(mountedHost);
      setMainTarget(mountedHost);
    };
    install();
    timer = window.setInterval(install, 100);
    return () => { cancelled = true; window.clearInterval(timer); mountedHost?.remove(); };
  }, [active]);

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
    window.addEventListener("seogrow-problem-closures-changed", refresh);
    return () => {
      window.removeEventListener("seogrow-problem-resolution-open", refresh);
      window.removeEventListener("seogrow-automatic-proposal-open", refresh);
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
      window.removeEventListener("seogrow-storage-ok", refresh);
      window.removeEventListener("seogrow-remediation-history", refresh);
      window.removeEventListener("seogrow-problem-closures-changed", refresh);
    };
  }, []);

  const selectedClientId = normalizeClientId(readJson(SELECTED_CLIENT_KEY, null));
  const clients = readJson(CLIENTS_KEY, []);
  const client = clients.find((item) => normalizeClientId(item?.id) === selectedClientId) || null;

  useEffect(() => {
    if (!active || !selectedClientId) return undefined;
    let cancelled = false;
    listCorrections({ clientId: selectedClientId })
      .then((rows) => { if (!cancelled) { setCorrections(rows); setCorrectionsError(""); } })
      .catch((error) => { if (!cancelled) { setCorrections([]); setCorrectionsError(`Storico correzioni non leggibile: ${error.message}`); } });
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
  const closures = readJson(PROBLEM_CLOSURES_KEY, []);
  const model = client ? buildUnifiedProblems({ clientId: client.id, siteHistory: analyses[client.id] || analyses[String(client.id)] || [], pageHistory: pageHistory[client.id] || pageHistory[String(client.id)] || [], tasks, corrections, closures }) : { rows: [] };
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
      <section><h1>Problema non disponibile</h1><p>Il problema selezionato non è più presente nei dati correnti, è stato escluso oppure il progetto attivo è cambiato.</p>{correctionsError && <p role="alert">{correctionsError}</p>}</section>
    </div>
  ) : <ResolutionView problem={problem} client={client} corrections={corrections} onRefresh={reloadCorrections} />;

  return createPortal(content, mainTarget);
}
