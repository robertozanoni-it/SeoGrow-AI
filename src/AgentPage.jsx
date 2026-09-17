import { confirmAction } from "./ui/dialogs.js";
import { agentStatusLabel, agentCostLabel } from "./agentPresentation.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Circle, LoaderCircle, Play, ShieldCheck, Sparkles } from "lucide-react";
import { AgentMode, AgentStatus, SeoAgentOrchestrator, createSeoGrowToolRegistry } from "./agentRuntime";
import { buildProblemAgentRun, problemNeedsFreshAudit } from "./problemAgentDiagnosis.js";
import { readWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { runConfirmationAudit } from "./confirmationAudit.js";
import { openProblemResolution } from "./AutomaticProposalNavigation.js";
import { problemResolutionPriority } from "./problemResolutionPriority.js";
import { remediationIndex } from "./remediationStore.js";
import { appendAgentLog, asAgentAnalysisLog, reconcileAgentLog, validateRealAgentCapabilities } from "./intelligence/agent/agentSuiteContract.js";

const AGENT_PREFILL_KEY = "seogrow-agent-prefill-v1";
const AGENT_AUTORUN_KEY = "seogrow-agent-autorun-v1";
const TASKS_KEY = "seogrow-tasks-v2";
const quickGoals = ["Trova le 10 migliori opportunità SEO", "Perché il traffico organico è diminuito?", "Quali pagine posso portare in Top 10?", "Quali contenuti devo aggiornare?", "Trova opportunità di internal linking"];
const toolLabels = { "data.gsc": ["Dati Search Console", "Dataset salvato del progetto"], "data.analysis": ["Audit SEO", "Ultima analisi tecnica salvata"], "data.rankings": ["Ranking DataForSEO", "Storico posizionamenti salvato"], "seo.opportunities": ["Calcolo opportunità", "Motore opportunità SeoGrow"], "seo.trafficDrop": ["Analisi calo traffico", "Confronto periodi Search Console"], "seo.contentDecay": ["Analisi content decay", "Cali e piano contenuti"], "seo.internalLinks": ["Suggerimenti link interni", "Risultati del crawl salvato"] };

const problemPrompt = (detail) => {
  const title = String(detail?.title || detail?.issueLabel || "Problema SEO").trim();
  const url = String(detail?.sourceUrl || detail?.url || "").trim();
  const state = String(detail?.problemState || detail?.status || "").trim();
  const targets = Array.isArray(detail?.targetUrls) ? detail.targetUrls.filter(Boolean).join(", ") : "";
  const evidence = Array.isArray(detail?.evidence) ? detail.evidence.map((item) => typeof item === "string" ? item : `${item?.label || item?.source || "evidenza"}: ${item?.value || item?.detail || ""}`).filter(Boolean).join("; ") : String(detail?.evidence || detail?.detail || "").trim();
  return [`Analizza e aiutami a risolvere questo problema specifico: ${title}.`, url ? `URL: ${url}.` : "", state ? `Stato attuale: ${state}.` : "", targets ? `Target interessati: ${targets}.` : "", evidence ? `Evidenze disponibili: ${evidence}.` : "", "Usa solo dati verificabili del progetto, distingui osservazioni da inferenze e non dichiarare risolto il problema: le azioni operative appartengono a Correzioni e Task."].filter(Boolean).join(" ");
};

const problemFromRecommendation = (context, item) => {
  const title = String(context?.title || item?.query || "Problema SEO").trim();
  const inferredType = /meta\s*description.*(?:larga|snippet|920\s*px)|description.*serp/i.test(title) ? "description-serp-width" : "";
  const issueType = String(context?.issueType || item?.issueType || inferredType).trim();
  const reviewOnly = context?.reviewOnly === true || item?.reviewOnly === true || issueType === "description-serp-width";
  return { key: context?.issueKey || item?.issueKey || "", issueType, title, detail: context?.detail || item?.interpretation || "", sourceUrl: item?.page || context?.sourceUrl || "", problemState: context?.problemStateCode || item?.problemStateCode || (reviewOnly ? "needs_verification" : "open"), interventionState: context?.interventionStateCode || item?.interventionStateCode || "not_prepared", correctability: context?.correctability || item?.correctability || (issueType === "description-serp-width" ? "not_supported" : "manual"), reviewOnly, ownershipBlocked: context?.ownershipBlocked === true || item?.ownershipBlocked === true, stale: context?.stale === true || item?.stale === true, targetUrls: Array.isArray(context?.targetUrls) ? context.targetUrls : Array.isArray(item?.targetUrls) ? item.targetUrls : [] };
};

const agentRunDisplayStatus = (run) => run?.status === AgentStatus.COMPLETED ? "Analisi completata" : agentStatusLabel(run?.status);
const recommendationTaskValues = (run, item, problemContext) => ({
  title: run?.plan?.workflow === "PROBLEM_DIAGNOSIS" ? (item.query || "Verifica finding SEO") : (item.recommendation || "Rivedi raccomandazione SEO"),
  priority: item.priority === "Quick Win" || item.priority === "Strategic" ? "Alta" : "Media",
  kind: "seo-agent",
  origin: "workflow",
  sourceUrl: item.page || "",
  targetUrl: "",
  linkLabel: "Apri pagina",
  query: item.query || "",
  taskLinks: problemContext?.issueKey || item?.issueKey ? { problemKey: problemContext?.issueKey || item?.issueKey } : {},
  detail: `${item.interpretation || ""}\n\nProposta: ${item.recommendation || ""}\n\nEvidenza: ${(Array.isArray(item.evidence) ? item.evidence : []).map((entry) => `${entry?.metric || "dato"}: ${entry?.value ?? "non disponibile"}`).join(" · ")}\nFonti: ${(Array.isArray(item.sources) ? item.sources : []).join(", ")}`,
});

export default function AgentPage({ client, dataset, analysis, rankings, savedRuns = [], onSaveRun, onDeleteRun, onCreateTask }) {
  const [goal, setGoal] = useState("");
  const [problemContext, setProblemContext] = useState(null);
  const [currentRun, setCurrentRun] = useState(null);
  const [running, setRunning] = useState(false);
  const [mode, setMode] = useState(AgentMode.READ_ONLY);
  const [selectedRunId, setSelectedRunId] = useState("");
  const [actionError, setActionError] = useState("");
  const [canonicalRevision, setCanonicalRevision] = useState(0);
  const operationLock = useRef(false);
  const autorunPending = useRef(false);
  const runtime = useMemo(() => { const registry = createSeoGrowToolRegistry(); return { capabilities: registry.capabilities(), orchestrator: new SeoAgentOrchestrator({ registry, onUpdate: setCurrentRun }) }; }, []);
  const capabilityGate = useMemo(() => validateRealAgentCapabilities(runtime.capabilities), [runtime.capabilities]);
  const orchestrator = runtime.orchestrator;

  useEffect(() => () => { for (const runId of orchestrator.active.keys()) orchestrator.cancel(runId); }, [orchestrator]);
  useEffect(() => { const refresh = () => setCanonicalRevision((value) => value + 1); for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-task-cause-reconciled", "seogrow-tasks-changed"]) window.addEventListener(event, refresh); return () => { for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-task-cause-reconciled", "seogrow-tasks-changed"]) window.removeEventListener(event, refresh); }; }, []);

  const run = currentRun || savedRuns.find((item) => item?.id === selectedRunId) || savedRuns[0];
  const input = { projectId: client.id, dataset, analysis, rankings, dataVersion: [dataset?.importedAt, analysis?.analyzedAt, rankings?.[0]?.checkedAt].filter(Boolean).join("|"), mode: AgentMode.READ_ONLY };
  const canonicalTasks = useMemo(() => readWorkspaceJson(TASKS_KEY, []).filter((task) => Number(task?.sourceClientId) === Number(client.id)), [canonicalRevision, client.id]);
  const canonicalCorrections = useMemo(() => remediationIndex().filter((row) => Number(row?.clientId) === Number(client.id)), [canonicalRevision, client.id]);
  const reconciliation = useMemo(() => reconcileAgentLog(run, { tasks: canonicalTasks, corrections: canonicalCorrections }), [run, canonicalTasks, canonicalCorrections]);
  const persistRun = (value) => { const logged = asAgentAnalysisLog(value); setCurrentRun(logged); onSaveRun(logged); return logged; };
  const logAction = (baseRun, entry) => { if (!baseRun?.id) return baseRun; const next = appendAgentLog(baseRun, entry); setCurrentRun(next); onSaveRun(next); return next; };

  useEffect(() => {
    const applyPrefill = (detail) => { if (!detail || Number(detail.clientId) !== Number(client.id)) return false; setGoal(problemPrompt(detail)); setProblemContext(detail); setCurrentRun(null); setSelectedRunId(""); setActionError(""); return true; };
    try { const raw = sessionStorage.getItem(AGENT_PREFILL_KEY); if (raw) { const detail = JSON.parse(raw); if (applyPrefill(detail)) { sessionStorage.removeItem(AGENT_PREFILL_KEY); autorunPending.current = sessionStorage.getItem(AGENT_AUTORUN_KEY) === "1"; sessionStorage.removeItem(AGENT_AUTORUN_KEY); } } } catch { sessionStorage.removeItem(AGENT_PREFILL_KEY); }
    const onPrefill = (event) => applyPrefill(event.detail); window.addEventListener("seogrow-agent-prefill", onPrefill); return () => window.removeEventListener("seogrow-agent-prefill", onPrefill);
  }, [client.id]);

  const start = async () => {
    if (!goal.trim() || operationLock.current) return;
    if (!capabilityGate.ok) { setActionError(capabilityGate.errors.join(" ")); return; }
    operationLock.current = true; setRunning(true); setActionError("");
    try {
      const contextualProblem = problemContext && Number(problemContext.clientId) === Number(client.id) ? problemContext : null;
      let result;
      if (contextualProblem && problemNeedsFreshAudit(analysis, contextualProblem)) {
        const confirmation = await runConfirmationAudit({ clientId: client.id, siteUrl: client.url, sourceUrl: contextualProblem.sourceUrl || contextualProblem.url, issueType: contextualProblem.issueType, issueLabel: contextualProblem.title || contextualProblem.issueLabel, targetUrl: Array.isArray(contextualProblem.targetUrls) && contextualProblem.targetUrls.length === 1 ? contextualProblem.targetUrls[0] : "" });
        result = buildProblemAgentRun({ goal, detail: contextualProblem, analysis: confirmation.audit, projectId: client.id });
        result = { ...result, observations: [...(result.observations || []), { id: `fresh-audit-${Date.now()}`, tool: "data.analysis", status: "COMPLETED", usable: true, result: { data: confirmation.audit, source: "LIVE_AUDIT", freshness: "fresh", observedAt: new Date().toISOString(), durationMs: 0, estimatedCost: 0, actualCost: 0 } }], resolutionOutcome: confirmation.covered && !confirmation.stillPresent ? { kind: "analysis-only", note: "La verifica recente non rileva più il finding. SEO Agent non chiude il problema né le Task: conferma lo stato nel modulo Audit/Correzioni, che resta la source of truth." } : { kind: "analysis-only", note: confirmation.note || "Verifica recente completata. Le eventuali azioni restano nei moduli proprietari." } };
      } else result = contextualProblem ? buildProblemAgentRun({ goal, detail: contextualProblem, analysis, projectId: client.id }) : await orchestrator.run(goal, input);
      persistRun(appendAgentLog(asAgentAnalysisLog(result), { phase: "analysis", kind: "ANALYSIS_COMPLETED", label: "Analisi conclusa con capability reali del progetto" }));
    } catch (error) { setActionError(error?.message || "Non è stato possibile avviare l’analisi."); }
    finally { operationLock.current = false; setRunning(false); }
  };
  useEffect(() => {
    if (!autorunPending.current || !goal.trim() || running) return;
    autorunPending.current = false;
    start();
    // start intentionally reads the freshly applied prefill state in this one-shot handoff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal]);

  const saveRecommendationTask = (item) => {
    if (!run?.id || running) return null;
    if (!confirmAction("Creare questa Task operativa? Verrà salvata nel modulo Task del progetto.")) return null;
    const task = onCreateTask(recommendationTaskValues(run, item, problemContext));
    if (!task?.id) return task;
    logAction(run, { phase: "action", kind: "TASK_CREATED", label: `Task creata: ${task.title}`, targetType: "task", targetId: task.id, problemKey: problemContext?.issueKey || item?.issueKey || "", sourceUrl: item.page || "" });
    return task;
  };
  const runProblemAction = (item) => {
    if (!run?.id || running) return false;
    const problem = problemFromRecommendation(problemContext, item); const priority = problemResolutionPriority(problem); let opened;
    if (priority.mode === "automatic") opened = openProblemResolution(problem, client.id, "problem-card", { forceAutomatic: true });
    else if (priority.mode === "approval") opened = openProblemResolution(problem, client.id, "problem-card", { controlledPreview: true });
    else if (priority.mode === "confirm") { const message = priority.kind === "canonical" ? `Confermi che ${problem.sourceUrl} debba essere la versione canonica pubblica? SeoGrow aprirà Correzioni e preparerà il Prima/Dopo; nessuna scrittura parte da SEO Agent.` : `Confermi che ${problem.sourceUrl} debba essere indicizzabile? SeoGrow aprirà Correzioni e preparerà il Prima/Dopo; nessuna scrittura parte da SEO Agent.`; if (!confirmAction(message)) return false; opened = openProblemResolution(problem, client.id, "problem-card", { controlledContextPreview: true }); }
    else opened = openProblemResolution(problem, client.id, "problem-card");
    if (!opened) { setActionError("Non è stato possibile aprire il percorso di risoluzione. Riapri il finding da Problemi e riprova."); return false; }
    logAction(run, { phase: "action", kind: "CORRECTION_HANDOFF", label: `Handoff a Correzioni: ${priority.label}`, targetType: "correction", problemKey: problem.key || problemContext?.issueKey || item?.issueKey || "", sourceUrl: problem.sourceUrl });
    return true;
  };

  return <div className="reference-agent-page">
    <section className="reference-agent-hero"><div className="reference-agent-heading"><span><Sparkles /></span><div><h1>SEO Agent</h1><p>Analizza {client.name} usando soltanto capability realmente disponibili; le modifiche restano nei moduli proprietari.</p></div></div><div className="reference-agent-hero-copy"><strong>Analisi → proposta → azione.</strong><span><ShieldCheck /> Nessuna scrittura diretta</span></div></section>
    <div className="reference-agent-tabs"><span className="active">1 · Analisi</span><span>2 · Proposte</span><span>3 · Azioni</span><span>Log</span></div>
    <section className="reference-agent-command-card"><div><h2>Capability disponibili</h2><p>L’Agent esegue solo tool di lettura realmente registrati nel progetto.</p></div><div className="reference-agent-shortcuts">{capabilityGate.capabilities.map((item) => { const [label] = toolLabels[item.name] || [item.name]; return <span key={item.name}><CheckCircle2 /> {label}</span>; })}</div></section>
    <section className="panel agent-console">
      <div className="agent-form-field"><label htmlFor="seo-agent-mode">Modalità</label><select id="seo-agent-mode" disabled={running} value={mode} onChange={(event) => setMode(event.target.value)}><option value={AgentMode.READ_ONLY}>Sola lettura</option><option value={AgentMode.ASSISTED} disabled>Assistita — non disponibile: nessun writer Agent</option><option value={AgentMode.AUTONOMOUS} disabled>Autonoma — non disponibile: nessun writer Agent</option></select><p className="agent-help"><ShieldCheck /> L’esecuzione usa sempre Sola lettura; i valori disabilitati restano visibili solo per compatibilità del form storico.</p></div>
      <div className="agent-form-field"><label htmlFor="seo-agent-goal">Cosa vuoi ottenere?</label><textarea id="seo-agent-goal" disabled={running} rows="3" value={goal} onChange={(event) => { setGoal(event.target.value); setProblemContext(null); }} placeholder="Es. Trova le 10 migliori opportunità SEO" /></div>
      <div className="agent-quick-actions">{quickGoals.map((item) => <button className="secondary" disabled={running} key={item} onClick={() => { setGoal(item); setProblemContext(null); }}>{item}</button>)}</div>
      <div className="agent-controls"><button className="primary" onClick={start} disabled={running || !goal.trim()}>{running ? <LoaderCircle className="spin" aria-hidden="true" /> : <Play aria-hidden="true" />}{running ? "Analisi…" : "Avvia analisi"}</button>{running && run?.id && <button className="secondary" onClick={() => orchestrator.cancel(run.id)}>Interrompi</button>}</div>
      {running && <p className="agent-help" role="status">Analisi in corso. Nessuna azione di scrittura può essere eseguita da questa fase.</p>}{!running && !goal.trim() && <p className="agent-help">Scegli un obiettivo supportato oppure descrivi il risultato SEO che vuoi analizzare.</p>}{actionError && <div className="empty-state" role="alert"><p>{actionError}</p></div>}
    </section>
    {savedRuns.length > 0 && <section className="panel agent-history"><div className="panel-head"><div><h2>Log analisi</h2><p>Registro non autoritativo: non determina lo stato di Problemi, Correzioni o Task.</p></div></div><div className="agent-form-field"><label htmlFor="agent-history">Esecuzione</label><select id="agent-history" disabled={running} value={selectedRunId} onChange={(event) => { setCurrentRun(null); setSelectedRunId(event.target.value); }}><option value="">Più recente</option>{savedRuns.filter(Boolean).map((item) => <option value={item.id} key={item.id}>{item.startedAt ? new Date(item.startedAt).toLocaleString("it-IT") : "Data sconosciuta"} · {agentRunDisplayStatus(item)}</option>)}</select></div>{run?.id && <button className="secondary" disabled={running} onClick={() => { if (confirmAction("Eliminare questo log di analisi SEO Agent? Nessuno stato operativo verrà modificato.")) { onDeleteRun(run.id); setCurrentRun(null); setSelectedRunId(""); } }}>Elimina log</button>}</section>}
    {run && <section className="panel agent-run" aria-live="polite"><div className="panel-head"><div><h2>1 · Analisi</h2><p>{run.goal}</p></div><span className={`priority ${run.status === AgentStatus.COMPLETED ? "bassa" : "media"}`}>{agentRunDisplayStatus(run)}</span></div><ol className="agent-steps">{(run.plan?.steps || []).map((step) => { const observation = (run.observations || []).findLast((item) => item.tool === step.tool); const [label, description] = toolLabels[step.tool] || [step.tool, "Capability registrata"]; return <li key={step.id} className={`agent-step-${String(step.status || "pending").toLowerCase()}`}>{["COMPLETED", "CACHED"].includes(step.status) ? <CheckCircle2 aria-hidden="true" /> : <Circle aria-hidden="true" />}<div><strong>{label}</strong><small>{description}</small><span>Stato: {agentStatusLabel(step.status || "PENDING")} · Fonte: {observation?.result?.source || "—"} · Aggiornamento dati: {observation?.result?.freshness || "—"} · Durata: {observation?.result?.durationMs ?? "—"} ms · Costo: {agentCostLabel(observation?.result)}</span>{observation?.error && <em>{observation.error}</em>}</div></li>; })}</ol>{run.resolutionOutcome?.note && <div className="empty-state agent-resolution-outcome"><p>{run.resolutionOutcome.note}</p></div>}{run.errors?.length > 0 && <div className="empty-state"><p>{run.errors.join(" ")}</p></div>}</section>}
    {run?.recommendations?.length > 0 && <section className="agent-recommendations"><h2>2 · Proposte</h2>{run.recommendations.map((item) => { const isProblem = run?.plan?.workflow === "PROBLEM_DIAGNOSIS"; const preparedProblem = isProblem ? problemFromRecommendation(problemContext, item) : null; const priority = isProblem ? problemResolutionPriority(preparedProblem) : null; return <article className="panel agent-recommendation" key={item.id}><div className="panel-head"><div><h3>{item.query || item.page || "Opportunità SEO"}</h3><p>{item.page}</p></div><span className="priority media">{item.priority}</span></div><p><strong>Evidenza:</strong> {(Array.isArray(item.evidence) ? item.evidence : []).map((entry) => `${entry?.metric || "dato"}: ${entry?.value ?? "non disponibile"}`).join(" · ") || "non disponibile"}</p><p><strong>Interpretazione:</strong> {item.interpretation}</p><p><strong>Proposta:</strong> {item.recommendation}</p><div className="agent-recommendation-footer"><small>Confidenza {item.confidence ?? "—"}% · Fonti: {Array.isArray(item.sources) && item.sources.length ? item.sources.join(", ") : "non disponibili"}</small></div><div className="agent-controls" aria-label="3 · Azione"><strong>3 · Azione</strong>{isProblem ? <><button className="primary" disabled={running} onClick={() => runProblemAction(item)}><Sparkles /> {priority.label}</button><button className="secondary" disabled={running} onClick={() => saveRecommendationTask(item)}>Salva come task</button></> : <button className="secondary" disabled={running} onClick={() => saveRecommendationTask(item)}>Crea task</button>}</div></article>; })}</section>}
    {run?.id && <section className="panel agent-history agent-action-log"><div className="panel-head"><div><h2>Log azioni e riconciliazione</h2><p>Il log registra gli handoff; stato e risultato vengono letti dai moduli canonici.</p></div></div>{reconciliation.length ? <ul>{reconciliation.map((entry) => <li key={entry.id}><strong>{entry.label || entry.kind}</strong><small>{entry.at ? new Date(entry.at).toLocaleString("it-IT") : ""}</small>{entry.canonical && <span>{entry.canonical.type === "task" ? "Task" : "Correzione"}: {entry.canonical.status}{entry.canonical.id ? ` · ${entry.canonical.id}` : ""}</span>}</li>)}</ul> : <p className="agent-help">Nessuna azione operativa registrata. Le analisi da sole non modificano la suite.</p>}</section>}
  </div>;
}
