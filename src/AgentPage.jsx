import { confirmAction } from "./ui/dialogs.js";
import { agentModeLabels, agentModeHelp, agentStatusLabel, agentCostLabel } from "./agentPresentation.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { BarChart3, CheckCircle2, Circle, FileText, Link2, LoaderCircle, Play, Search, ShieldCheck, Sparkles, Target } from "lucide-react";
import { AgentMode, AgentStatus, SeoAgentOrchestrator, createSeoGrowToolRegistry } from "./agentRuntime";
import { buildProblemAgentRun, problemNeedsFreshAudit, retireObsoleteProblemTasks } from "./problemAgentDiagnosis.js";
import { readWorkspaceJson, writeWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { runConfirmationAudit } from "./confirmationAudit.js";
import { openProblemResolution } from "./AutomaticProposalNavigation.js";
import { problemResolutionPriority } from "./problemResolutionPriority.js";

const AGENT_PREFILL_KEY = "seogrow-agent-prefill-v1";
const AGENT_AUTORUN_KEY = "seogrow-agent-autorun-v1";
const quickGoals = ["Trova le 10 migliori opportunità SEO", "Perché il traffico organico è diminuito?", "Quali pagine posso portare in Top 10?", "Quali contenuti devo aggiornare?", "Trova opportunità di internal linking"];

const toolLabels = { "data.gsc": ["Dati Search Console", "Dataset salvato del progetto"], "data.analysis": ["Audit SEO", "Ultima analisi tecnica salvata"], "data.rankings": ["Ranking DataForSEO", "Storico posizionamenti salvato"], "seo.opportunities": ["Calcolo opportunità", "Motore opportunità SeoGrow"], "seo.trafficDrop": ["Analisi calo traffico", "Confronto periodi Search Console"], "seo.contentDecay": ["Analisi content decay", "Cali e piano contenuti"], "seo.internalLinks": ["Suggerimenti link interni", "Risultati del crawl salvato"] };

const problemPrompt = (detail) => {
  const title = String(detail?.title || detail?.issueLabel || "Problema SEO").trim();
  const url = String(detail?.sourceUrl || detail?.url || "").trim();
  const state = String(detail?.problemState || detail?.status || "").trim();
  const targets = Array.isArray(detail?.targetUrls) ? detail.targetUrls.filter(Boolean).join(", ") : "";
  const evidence = Array.isArray(detail?.evidence)
    ? detail.evidence.map((item) => typeof item === "string" ? item : `${item?.label || item?.source || "evidenza"}: ${item?.value || item?.detail || ""}`).filter(Boolean).join("; ")
    : String(detail?.evidence || detail?.detail || "").trim();
  return [
    `Analizza e aiutami a risolvere questo problema specifico: ${title}.`,
    url ? `URL: ${url}.` : "",
    state ? `Stato attuale: ${state}.` : "",
    targets ? `Target interessati: ${targets}.` : "",
    evidence ? `Evidenze disponibili: ${evidence}.` : "",
    "Usa solo dati verificabili del progetto, distingui osservazioni da inferenze e non dichiarare risolto il problema senza una verifica recente.",
  ].filter(Boolean).join(" ");
};

const problemFromRecommendation = (context, item) => {
  const title = String(context?.title || item?.query || "Problema SEO").trim();
  const inferredType = /meta\s*description.*(?:larga|snippet|920\s*px)|description.*serp/i.test(title) ? "description-serp-width" : "";
  const issueType = String(context?.issueType || item?.issueType || inferredType).trim();
  const reviewOnly = context?.reviewOnly === true || item?.reviewOnly === true || issueType === "description-serp-width";
  return {
    key: context?.issueKey || item?.issueKey || "",
    issueType,
    title,
    detail: context?.detail || item?.interpretation || "",
    sourceUrl: item?.page || context?.sourceUrl || "",
    problemState: context?.problemStateCode || item?.problemStateCode || (reviewOnly ? "needs_verification" : "open"),
    interventionState: context?.interventionStateCode || item?.interventionStateCode || "not_prepared",
    correctability: context?.correctability || item?.correctability || (issueType === "description-serp-width" ? "not_supported" : "manual"),
    reviewOnly,
    ownershipBlocked: context?.ownershipBlocked === true || item?.ownershipBlocked === true,
    stale: context?.stale === true || item?.stale === true,
    targetUrls: Array.isArray(context?.targetUrls) ? context.targetUrls : Array.isArray(item?.targetUrls) ? item.targetUrls : [],
  };
};

const saveRecommendationTask = (onCreateTask, run, item) => onCreateTask({
  title: run?.plan?.workflow === "PROBLEM_DIAGNOSIS" ? (item.query || "Verifica finding SEO") : (item.recommendation || "Rivedi raccomandazione SEO"),
  priority: item.priority === "Quick Win" || item.priority === "Strategic" ? "Alta" : "Media",
  kind: "seo-agent",
  sourceUrl: item.page || "",
  targetUrl: "",
  linkLabel: "Apri pagina",
  query: item.query || "",
  detail: `${item.interpretation || ""}\n\nAzione: ${item.recommendation || ""}\n\nEvidenza: ${(Array.isArray(item.evidence) ? item.evidence : []).map((entry) => `${entry?.metric || "dato"}: ${entry?.value ?? "non disponibile"}`).join(" · ")}\nFonti: ${(Array.isArray(item.sources) ? item.sources : []).join(", ")}`,
});

export default function AgentPage({ client, dataset, analysis, rankings, savedRuns = [], onSaveRun, onDeleteRun, onCreateTask }) {
  const [goal, setGoal] = useState("");
  const [problemContext, setProblemContext] = useState(null);
  const [currentRun, setCurrentRun] = useState(null);
  const [running, setRunning] = useState(false);
  const operationLock = useRef(false);
  const autorunPending = useRef(false);
  const [mode, setMode] = useState(AgentMode.ASSISTED);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [actionError, setActionError] = useState("");
  const orchestrator = useMemo(() => new SeoAgentOrchestrator({ registry: createSeoGrowToolRegistry(), onUpdate: setCurrentRun }), []);
  useEffect(() => () => {
    for (const runId of orchestrator.active.keys()) orchestrator.cancel(runId);
  }, [orchestrator]);
  const run = currentRun || savedRuns.find((item) => item?.id === selectedRunId) || savedRuns[0];
  const input = { projectId: client.id, dataset, analysis, rankings, dataVersion: [dataset?.importedAt, analysis?.analyzedAt, rankings?.[0]?.checkedAt].filter(Boolean).join("|"), mode };

  useEffect(() => {
    const applyPrefill = (detail) => {
      if (!detail || Number(detail.clientId) !== Number(client.id)) return false;
      setGoal(problemPrompt(detail));
      setProblemContext(detail);
      setCurrentRun(null);
      setSelectedRunId("");
      setActionError("");
      return true;
    };
    try {
      const raw = sessionStorage.getItem(AGENT_PREFILL_KEY);
      if (raw) {
        const detail = JSON.parse(raw);
        if (applyPrefill(detail)) { sessionStorage.removeItem(AGENT_PREFILL_KEY); autorunPending.current = sessionStorage.getItem(AGENT_AUTORUN_KEY) === "1"; sessionStorage.removeItem(AGENT_AUTORUN_KEY); }
      }
    } catch {
      sessionStorage.removeItem(AGENT_PREFILL_KEY);
    }
    const onPrefill = (event) => applyPrefill(event.detail);
    window.addEventListener("seogrow-agent-prefill", onPrefill);
    return () => window.removeEventListener("seogrow-agent-prefill", onPrefill);
  }, [client.id]);

  const start = async () => {
    if (!goal.trim() || operationLock.current) return;
    operationLock.current = true;
    setRunning(true); setActionError("");
    try {
      const contextualProblem = problemContext && Number(problemContext.clientId) === Number(client.id) ? problemContext : null;
      let result;
      if (contextualProblem && problemNeedsFreshAudit(analysis, contextualProblem)) {
        const confirmation = await runConfirmationAudit({
          clientId: client.id, siteUrl: client.url, sourceUrl: contextualProblem.sourceUrl || contextualProblem.url,
          issueType: contextualProblem.issueType, issueLabel: contextualProblem.title || contextualProblem.issueLabel,
        });
        if (confirmation.covered && !confirmation.stillPresent) {
          result = buildProblemAgentRun({ goal, detail: { ...contextualProblem, title: contextualProblem.title || contextualProblem.issueLabel }, analysis: confirmation.audit, projectId: client.id });
          const retired = retireObsoleteProblemTasks(readWorkspaceJson("seogrow-tasks-v2", []), contextualProblem, client.id);
          if (retired.changed) {
            writeWorkspaceJson("seogrow-tasks-v2", retired.tasks);
            window.dispatchEvent(new CustomEvent("seogrow-tasks-changed"));
          }
          result = { ...result, status: "COMPLETED", observations: [...(result.observations || []), { id:`fresh-audit-${Date.now()}`, tool:"audit.page", status:"COMPLETED", usable:true, result:{ data:confirmation.audit, source:"LIVE_AUDIT", freshness:"fresh", observedAt:new Date().toISOString(), durationMs:0, estimatedCost:0, actualCost:0 } }], errors:[], recommendations:[], resolutionOutcome:{ kind:"obsolete", note:"Verifica automatica completata: il finding non è più presente. Il problema è stato chiuso e rimosso dall’elenco dei problemi aperti." } };
        } else {
          result = buildProblemAgentRun({ goal, detail: contextualProblem, analysis: confirmation.audit, projectId: client.id });
          if (!result.recommendations?.length) result = { ...result, errors:[confirmation.note] };
        }
      } else result = contextualProblem
        ? buildProblemAgentRun({ goal, detail: contextualProblem, analysis, projectId: client.id })
        : await orchestrator.run(goal, input);
      setCurrentRun(result);
      onSaveRun(result);
    }
    catch (error) { setActionError(error?.message || "Non è stato possibile avviare l’analisi."); }
    finally { operationLock.current = false; setRunning(false); }
  };
  useEffect(() => {
    if (!autorunPending.current || !goal.trim() || running) return;
    autorunPending.current = false;
    start();
  // start intentionally reads the freshly applied prefill state in this one-shot handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  const decide = async (approved) => {
    if (!run?.pendingApproval || operationLock.current) return;
    operationLock.current = true;
    setRunning(true); setActionError("");
    try { const result = await orchestrator.resolveApproval(run, input, { approved, token: run.pendingApproval.token }); onSaveRun(result); setCurrentRun(result); }
    catch (error) { setActionError(error?.message || "Non è stato possibile registrare la decisione."); }
    finally { operationLock.current = false; setRunning(false); }
  };

  const runProblemAction = (item) => {
    const problem = problemFromRecommendation(problemContext, item);
    const priority = problemResolutionPriority(problem);
    let opened;
    if (priority.mode === "automatic") {
      opened = openProblemResolution(problem, client.id, "problem-card", { forceAutomatic: true });
    } else if (priority.mode === "approval") {
      opened = openProblemResolution(problem, client.id, "problem-card", { controlledPreview: true });
    } else if (priority.mode === "confirm") {
      const message = priority.kind === "canonical"
        ? `Confermi che ${problem.sourceUrl} debba essere la versione canonica pubblica? SeoGrow preparerà la modifica ma non la applicherà senza il Prima/Dopo e la tua approvazione.`
        : `Confermi che ${problem.sourceUrl} debba essere indicizzabile? SeoGrow preparerà la modifica ma non la applicherà senza il Prima/Dopo e la tua approvazione.`;
      if (!confirmAction(message)) return false;
      opened = openProblemResolution(problem, client.id, "problem-card", { controlledContextPreview: true });
    } else {
      opened = openProblemResolution(problem, client.id, "problem-card");
    }
    if (!opened) setActionError("Non è stato possibile aprire il percorso di risoluzione. Riapri il finding da Problemi e riprova.");
    return opened;
  };

  return <div className="reference-agent-page">
    <section className="reference-agent-hero">
      <div className="reference-agent-heading"><span><Sparkles /></span><div><h1>SEO Agent</h1><p>Il tuo assistente AI per analizzare, ottimizzare e far crescere {client.name}.</p></div></div>
      <div className="reference-agent-hero-copy"><strong>Dati in azioni.<br/>Risultati reali.</strong><span><ShieldCheck /> {agentModeLabels[mode]}</span></div>
    </section>
    <div className="reference-agent-tabs"><span className="active">Assistente</span><span>Analisi AI</span><span>Strategie</span><span>Contenuti</span><span>Monitoraggio</span></div>
    <section className="reference-agent-command-card">
      <div><h2>Scrivi cosa vuoi fare…</h2><p>Descrivi un obiettivo concreto: l’agente usa solo i dati necessari del progetto.</p></div>
      <div className="reference-agent-shortcuts"><span><Search /> Analizza un sito</span><span><Target /> Trova opportunità</span><span><FileText /> Crea contenuti</span><span><BarChart3 /> Ottimizza pagine</span><span><Link2 /> Link interni</span></div>
    </section>
    <section className="panel agent-console">
      <div className="agent-form-field"><label htmlFor="seo-agent-mode">Modalità</label><select id="seo-agent-mode" aria-describedby="seo-agent-mode-help" disabled={running} value={mode} onChange={(event) => setMode(event.target.value)}><option value={AgentMode.READ_ONLY}>Sola lettura</option><option value={AgentMode.ASSISTED}>Assistita</option><option value={AgentMode.AUTONOMOUS}>Autonoma con limiti</option></select><p id="seo-agent-mode-help" className="agent-help">{agentModeHelp[mode]}</p></div>
      <div className="agent-form-field"><label htmlFor="seo-agent-goal">Cosa vuoi ottenere?</label><textarea id="seo-agent-goal" disabled={running} rows="3" value={goal} onChange={(event) => { setGoal(event.target.value); setProblemContext(null); }} placeholder="Es. Trova le 10 migliori opportunità SEO" /></div>
      <div className="agent-quick-actions">{quickGoals.map((item) => <button className="secondary" disabled={running} key={item} onClick={() => { setGoal(item); setProblemContext(null); }}>{item}</button>)}</div>
      <div className="agent-controls"><button className="primary" onClick={start} disabled={running || !goal.trim()}>{running ? <LoaderCircle className="spin" aria-hidden="true" /> : <Play aria-hidden="true" />}{running ? "Analisi…" : "Avvia analisi"}</button>{running && run?.id && <button className="secondary" onClick={() => orchestrator.cancel(run.id)}>Interrompi</button>}</div>
      {running && <p className="agent-help" role="status">Analisi in corso: modalità, obiettivo e cronologia sono temporaneamente bloccati. Puoi interrompere l’esecuzione.</p>}
      {!running && !goal.trim() && <p className="agent-help">Scegli un esempio qui sopra oppure descrivi il tuo obiettivo per abilitare Avvia analisi.</p>}
      {actionError && <div className="empty-state" role="alert"><p>{actionError}</p></div>}
    </section>
    {savedRuns.length > 0 && <section className="panel agent-history"><div className="panel-head"><div><h2>Cronologia analisi</h2><p>Conservata per il progetto selezionato.</p></div></div><div className="agent-form-field"><label htmlFor="agent-history">Esecuzione</label><select id="agent-history" disabled={running} value={selectedRunId} onChange={(event) => { setCurrentRun(null); setSelectedRunId(event.target.value); }}><option value="">Più recente</option>{savedRuns.filter(Boolean).map((item) => <option value={item.id} key={item.id}>{item.startedAt ? new Date(item.startedAt).toLocaleString("it-IT") : "Data sconosciuta"} · {agentStatusLabel(item.status)}</option>)}</select></div>{run?.id && <button className="secondary" disabled={running} onClick={() => { if (confirmAction("Eliminare questa analisi dalla cronologia SEO Agent?")) { onDeleteRun(run.id); setCurrentRun(null); setSelectedRunId(""); } }}>Elimina analisi</button>}</section>}
    {run && <section className="panel agent-run" aria-live="polite">
      <div className="panel-head"><div><h2>{agentStatusLabel(run.status)}</h2><p>{run.goal}</p></div><span className={`priority ${run.status === AgentStatus.COMPLETED ? "bassa" : "media"}`}>{agentStatusLabel(run.status)}</span></div>
      <ol className="agent-steps">{(run.plan?.steps || []).map((step) => { const observation = (run.observations || []).findLast((item) => item.tool === step.tool); const [label, description] = toolLabels[step.tool] || [step.tool, "Tool agentico"]; return <li key={step.id} className={`agent-step-${String(step.status || "pending").toLowerCase()}`}>{["COMPLETED", "CACHED"].includes(step.status) ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}<div><strong>{label}</strong><small>{description}</small><span>Stato: {agentStatusLabel(step.status || "PENDING")} · Fonte: {observation?.result?.source || "—"} · Aggiornamento dati: {observation?.result?.freshness || "—"} · Durata: {observation?.result?.durationMs ?? "—"} ms · Costo: {agentCostLabel(observation?.result)}</span>{observation?.error && <em>{observation.error}</em>}</div></li>; })}</ol>
      {run.resolutionOutcome?.note && <div className="empty-state agent-resolution-outcome"><p>{run.resolutionOutcome.note}</p></div>}
      {run.errors?.length > 0 && <div className="empty-state"><p>{run.errors.join(" ")}</p></div>}
      {run.status === AgentStatus.WAITING_APPROVAL && run.pendingApproval && <div className="agent-approval"><h3>Approvazione richiesta</h3><dl><dt>Operazione</dt><dd>{toolLabels[run.pendingApproval.tool]?.[0] || run.pendingApproval.tool}</dd><dt>Rischio</dt><dd>{run.pendingApproval.risk || "non disponibile"}</dd><dt>Costo stimato</dt><dd>{agentCostLabel({ estimatedCost: run.pendingApproval.estimatedCost })}</dd><dt>Anteprima</dt><dd><pre>{JSON.stringify(run.pendingApproval.preview || {}, null, 2)}</pre></dd></dl><div className="agent-controls"><button className="primary" disabled={running} onClick={() => decide(true)}>Approva</button><button className="secondary" disabled={running} onClick={() => decide(false)}>Rifiuta</button></div></div>}
    </section>}
    {run?.recommendations?.length > 0 && <section className="agent-recommendations"><h2>Azioni prioritarie</h2>{run.recommendations.map((item) => {
      const isProblem = run?.plan?.workflow === "PROBLEM_DIAGNOSIS";
      const preparedProblem = isProblem ? problemFromRecommendation(problemContext, item) : null;
      const priority = isProblem ? problemResolutionPriority(preparedProblem) : null;
      return <article className="panel agent-recommendation" key={item.id}>
        <div className="panel-head"><div><h3>{item.query || item.page || "Opportunità SEO"}</h3><p>{item.page}</p></div><span className="priority media">{item.priority}</span></div>
        <p><strong>Evidenza:</strong> {(Array.isArray(item.evidence) ? item.evidence : []).map((entry) => `${entry?.metric || "dato"}: ${entry?.value ?? "non disponibile"}`).join(" · ") || "non disponibile"}</p>
        <p><strong>Interpretazione:</strong> {item.interpretation}</p><p><strong>Azione:</strong> {item.recommendation}</p>
        <div className="agent-recommendation-footer">
          <small>Confidenza {item.confidence ?? "—"}% · Fonti: {Array.isArray(item.sources) && item.sources.length ? item.sources.join(", ") : "non disponibili"}</small>
          {isProblem ? <div className="agent-controls"><button className="primary" onClick={() => runProblemAction(item)}><Sparkles /> {priority.label}</button><button className="secondary" onClick={() => saveRecommendationTask(onCreateTask, run, item)}>Salva come task</button></div> : <button className="secondary" onClick={() => saveRecommendationTask(onCreateTask, run, item)}>Crea task</button>}
        </div>
      </article>;
    })}</section>}
  </div>;
}
