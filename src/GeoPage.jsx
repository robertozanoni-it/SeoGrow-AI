import { confirmAction } from "./ui/dialogs.js";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Bot,
  Check,
  Download,
  ExternalLink,
  FileQuestion,
  ListTodo,
  Plus,
  Radar,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { downloadCsv } from "./core/export/index.js";
import { apiFetch } from "./api";
import GeoInsightsPanel from "./GeoInsightsPanel.jsx";
import { appendGeoHistory } from "./geoIntelligence.js";
import {
  GEO_SCOPE,
  buildGeoEvidenceModel,
  buildGeoOperationalItems,
} from "./modules/geo/geoOperationalModel.js";

const fetch = apiFetch;
const unique = (values) => [...new Set(values.filter(Boolean))];
const nowIso = () => new Date().toISOString();

function suggestedQuestions(dataset, topicalMap, clientName) {
  const searchQuestions = (dataset?.queries || []).slice(0, 8).map((row) => {
    const query = String(row.dimension || "").trim();
    if (!query) return "";
    return /^(come|cosa|quanto|quale|perch[eé]|dove|quando)\b/i.test(query)
      ? query
      : `Quali informazioni offre ${clientName} su ${query}?`;
  });
  const topicalQuestions = (topicalMap?.ideas || [])
    .filter((item) => !item.covered)
    .slice(0, 6)
    .map((item) => `Cosa bisogna sapere su ${item.keyword}?`);
  return unique([...searchQuestions, ...topicalQuestions]).slice(0, 12);
}

const evidenceStateLabel = (state) => ({
  "observed-pass": "Rilevato",
  "observed-gap": "Gap osservato",
  observed: "Osservato",
  diagnostic: "Diagnostica",
}[state] || "Da verificare");

function EvidenceList({ facet }) {
  if (!facet?.evidence?.length) return <p>Nessuna prova disponibile: esegui l’Audit GEO.</p>;
  return <div className="geo-signal-list">{facet.evidence.map((item) => (
    <div className={`geo-signal ${item.state === "observed-pass" ? "pass" : item.state === "observed-gap" ? "fail" : "neutral"}`} key={item.id}>
      <span>{item.state === "observed-pass" ? <Check /> : item.state === "observed-gap" ? <AlertTriangle /> : <Radar />}</span>
      <div><small>{item.label}</small><strong>{String(item.value ?? "—")}</strong><p>{evidenceStateLabel(item.state)} · Fonte: {item.source}{item.detail ? ` · ${item.detail}` : ""}</p></div>
    </div>
  ))}</div>;
}

export default function GeoPage({
  client,
  dataset,
  analysis,
  topicalMap,
  saved,
  onSave,
  onCreateTask,
  aiConfigured,
  dataForSeo = { configured: false },
  onNavigate,
}) {
  const initialQuestions = useMemo(() => suggestedQuestions(dataset, topicalMap, client.name), [client.name, dataset, topicalMap]);
  const initialQuestionsText = initialQuestions.join("\n");
  const savedQuestionsText = Array.isArray(saved?.questions) ? saved.questions.join("\n") : null;
  const [questionsOverride, setQuestionsOverride] = useState(null);
  const questionsText = questionsOverride ?? savedQuestionsText ?? initialQuestionsText;
  const [activeTab, setActiveTab] = useState("Scope");
  const [audit, setAudit] = useState(saved?.audit && typeof saved.audit === "object" ? saved.audit : null);
  const [simulation, setSimulation] = useState(saved?.simulation && typeof saved.simulation === "object" ? saved.simulation : null);
  const [observation, setObservation] = useState(saved?.observation && typeof saved.observation === "object" ? saved.observation : null);
  const [history, setHistory] = useState(Array.isArray(saved?.history) ? saved.history : []);
  const [observationSettings, setObservationSettings] = useState({ locationCode: 2380, languageCode: "it", device: "desktop", ...(saved?.observationSettings || {}) });
  const [auditLoading, setAuditLoading] = useState(false);
  const [simulationLoading, setSimulationLoading] = useState(false);
  const [observationLoading, setObservationLoading] = useState(false);
  const [error, setError] = useState("");
  const auditControllerRef = useRef(null);
  const simulationControllerRef = useRef(null);

  useEffect(() => () => {
    auditControllerRef.current?.abort();
    simulationControllerRef.current?.abort();
  }, []);

  const questions = unique(questionsText.split("\n").map((value) => value.trim()).filter(Boolean)).slice(0, 20);
  const persist = (next = {}) => {
    const value = { questions, audit, simulation, observation, history, observationSettings, updatedAt: nowIso(), ...next };
    onSave(value);
    return value;
  };

  const runAudit = async () => {
    auditControllerRef.current?.abort();
    const controller = new AbortController();
    auditControllerRef.current = controller;
    setAuditLoading(true);
    setError("");
    try {
      const response = await fetch("/api/geo/audit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: client.url, pageUrls: (analysis?.pages || []).map((page) => page.url).slice(0, 10) }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Audit GEO non riuscito");
      setAudit(data);
      const nextHistory = appendGeoHistory(history, { audit: data });
      setHistory(nextHistory);
      persist({ audit: data, history: nextHistory });
    } catch (err) {
      if (err.message !== "Richiesta annullata.") setError(err.message);
    } finally {
      if (auditControllerRef.current === controller) {
        auditControllerRef.current = null;
        setAuditLoading(false);
      }
    }
  };

  const runSimulation = async () => {
    if (!questions.length) return setError("Inserisci almeno una domanda da verificare.");
    if (!aiConfigured) return setError("Configura OpenAI nelle Integrazioni prima della diagnostica.");
    if (!confirmAction(`Inviare a OpenAI ${questions.length} domande e gli estratti del progetto? È una diagnostica di answerability sul contesto fornito: non misura citazioni o presenza reale nelle AI.`)) return;
    setSimulationLoading(true);
    setError("");
    simulationControllerRef.current?.abort();
    const controller = new AbortController();
    simulationControllerRef.current = controller;
    try {
      const projectPages = (analysis?.pages || []).slice(0, 40).map((page) => ({ url: page.url, title: page.title, words: page.words, excerpt: page.contentExcerpt || "" }));
      const response = await fetch("/api/geo/simulate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteName: client.name,
          siteUrl: client.url,
          questions,
          pages: projectPages,
          searchQueries: (dataset?.queries || []).slice(0, 30).map((row) => ({ query: row.dimension, position: row.position, impressions: row.impressions })),
        }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Diagnostica GEO non riuscita");
      setSimulation(data);
      const nextHistory = appendGeoHistory(history, { simulation: data });
      setHistory(nextHistory);
      persist({ simulation: data, questions, history: nextHistory });
    } catch (err) {
      if (err.message !== "Richiesta annullata.") setError(err.message);
    } finally {
      if (simulationControllerRef.current === controller) {
        simulationControllerRef.current = null;
        setSimulationLoading(false);
      }
    }
  };

  const updateObservationSettings = (patch) => {
    const next = { ...observationSettings, ...patch };
    setObservationSettings(next);
    persist({ observationSettings: next });
  };

  const runObservation = async () => {
    if (!dataForSeo?.configured) return onNavigate("Integrazioni");
    const queries = questions.slice(0, 10);
    if (!queries.length) return setError("Inserisci almeno una domanda GEO da osservare.");
    const maxCost = queries.length * Number(dataForSeo.maxSerpCost || 0.1);
    if (!confirmAction(`Osservare ${queries.length} query su Google tramite DataForSEO? Costo massimo stimato: $${maxCost.toFixed(2)}. Questa osservazione non rappresenta citazioni o ranking nei motori AI.`)) return;
    setObservationLoading(true);
    setError("");
    try {
      const response = await fetch("/api/dataforseo/geo-observe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ domain: client.url, siteName: client.name, queries, ...observationSettings }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Osservazione GEO non riuscita");
      setObservation(data);
      const nextHistory = appendGeoHistory(history, { observation: data });
      setHistory(nextHistory);
      persist({ observation: data, history: nextHistory, observationSettings });
    } catch (err) {
      setError(err.message);
    } finally {
      setObservationLoading(false);
    }
  };

  const evidenceModel = useMemo(() => buildGeoEvidenceModel({ audit, simulation, observation }), [audit, simulation, observation]);
  const operationalItems = useMemo(() => buildGeoOperationalItems({ audit, simulation, observation }), [audit, simulation, observation]);
  const gapEvidence = evidenceModel.facets.flatMap((facet) => facet.evidence).filter((item) => item.state === "observed-gap").length;

  const createGeoTask = (item) => onCreateTask({
    title: `GEO: ${item.title}`,
    sourceUrl: item.url || client.url,
    kind: item.actionKind === "content" ? "geo-content" : "geo",
    priority: item.severity === "Alta" ? "Alta" : item.severity === "Bassa" ? "Bassa" : "Media",
    detail: `${item.detail}\n\nIntervento: ${item.recommendation}\n\nTipo evidenza: ${item.evidenceKind}. Fonte: ${item.source}.`,
  });

  const openOpportunity = (item) => {
    sessionStorage.setItem("seogrow-opportunity-focus-v1", item.id);
    onNavigate("Opportunità");
  };

  const exportReport = () => {
    const evidenceRows = evidenceModel.facets.flatMap((facet) => facet.evidence.map((item) => ({
      sezione: facet.label,
      elemento: item.label,
      esito: String(item.value ?? "—"),
      tipo_prova: evidenceStateLabel(item.state),
      fonte: item.source,
      dettaglio: item.detail,
      url: item.url,
    })));
    const actionRows = operationalItems.map((item) => ({
      sezione: "Azioni GEO",
      elemento: item.title,
      esito: item.severity || "Da valutare",
      tipo_prova: item.evidenceKind,
      fonte: item.source,
      dettaglio: `${item.detail} · ${item.recommendation}`,
      url: item.url,
    }));
    downloadCsv([...evidenceRows, ...actionRows], `geo-ai-${client.name}.csv`);
  };

  const tabs = ["Scope", "Entità & Schema", "Citabilità", "Contenuto", "Presenza", "Azioni & Report"];
  const accessibility = evidenceModel.facets.find((facet) => facet.key === "accessibility");

  return (
    <div className="reference-geo-page">
      <section className="reference-geo-hero">
        <div className="reference-geo-heading"><span><Radar /></span><div><h1>GEO AI</h1><p>Evidenze tecniche e contenutistiche per rendere {client.name} leggibile, comprensibile e citabile. Non misura ranking o citazioni reali nei motori AI.</p></div></div>
        <div className="reference-geo-copy"><strong>Prove, gap, azioni.</strong><ShieldCheck /></div>
      </section>

      <div className="reference-geo-tabs">{tabs.map((tab) => <button type="button" key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>

      <section className="reference-geo-kpis">
        <article className="blue"><Radar /><span><strong>{evidenceModel.counts.pagesAudited || "—"}</strong><small>Pagine osservate</small><em>Audit GEO reale</em></span></article>
        <article className="orange"><AlertTriangle /><span><strong>{gapEvidence}</strong><small>Gap osservati</small><em>Nessun punteggio sintetico</em></span></article>
        <article className="purple"><FileQuestion /><span><strong>{evidenceModel.counts.diagnosticQuestions || "—"}</strong><small>Domande diagnosticate</small><em>OpenAI, non presenza reale</em></span></article>
        <article className="green"><ListTodo /><span><strong>{operationalItems.length}</strong><small>Azioni disponibili</small><em>Verso Opportunità o Task</em></span></article>
      </section>

      {error && <div className="geo-error" role="alert"><AlertTriangle /><span>{error}</span>{!aiConfigured && <button onClick={() => onNavigate("Integrazioni")}>Configura</button>}</div>}

      <div hidden={activeTab !== "Scope"}>
        <div className="page-title geo-title reference-geo-actions-only">
          <div><h2>Scope GEO verificabile</h2><p>Il modulo separa ciò che osserva direttamente da ciò che non può misurare.</p></div>
          <div className="geo-title-actions"><button className="secondary" disabled={!evidenceModel.hasEvidence} onClick={exportReport}><Download /> Esporta prove</button><button className="primary" onClick={runAudit} disabled={auditLoading}><RefreshCw className={auditLoading ? "spin" : ""} />{auditLoading ? "Analisi…" : audit ? "Ripeti audit" : "Avvia audit GEO"}</button></div>
        </div>

        <section className="geo-overview">
          <div className="panel geo-readiness"><h2>Cosa misura</h2><ul>{GEO_SCOPE.measures.map((item) => <li key={item}><Check /> {item}</li>)}</ul></div>
          <div className="panel geo-readiness"><h2>Cosa NON misura</h2><ul>{GEO_SCOPE.doesNotMeasure.map((item) => <li key={item}><AlertTriangle /> {item}</li>)}</ul></div>
        </section>

        <section className="panel geo-crawlers"><div className="panel-head"><div><h2>Accesso e leggibilità tecnica</h2><p>Prove osservate, senza trasformarle in un indice.</p></div><Radar /></div><EvidenceList facet={accessibility} /></section>

        <section className="panel geo-issues">
          <div className="panel-head"><div><h2>Azioni derivate dalle evidenze</h2><p>Ogni riga ha una fonte esplicita e può proseguire in Opportunità SEO o Task.</p></div><span className="geo-count">{operationalItems.length} azioni</span></div>
          <div className="geo-issue-list">{operationalItems.length ? operationalItems.slice(0, 12).map((item) => <article className="geo-issue" key={item.id}><span className="priority media">{item.severity || (item.evidenceKind === "diagnostic" ? "Diagnostica" : "Osservato")}</span><div><h3>{item.title}</h3><p>{item.detail}</p><strong>Intervento: {item.recommendation}</strong><small>Fonte: {item.source} · Evidenza: {item.evidenceKind}</small>{item.url && <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink /> Apri pagina</a>}</div><div className="agent-controls"><button className="secondary mini" onClick={() => openOpportunity(item)}><Target /> Opportunità</button><button className="secondary mini" onClick={() => createGeoTask(item)}><Plus /> Task</button></div></article>) : <p>Nessuna azione disponibile: esegui l’Audit GEO o una diagnostica.</p>}</div>
        </section>

        <section className="geo-lab">
          <div className="panel geo-questions">
            <div className="panel-head"><div><h2>Diagnostica contenuto / answerability</h2><p>OpenAI risponde usando soltanto gli estratti del progetto. Non è un test di presenza su ChatGPT.</p></div><FileQuestion /></div>
            <label className="geo-question-label"><span className="sr-only">Domande GEO da monitorare, una per riga</span><textarea aria-label="Domande GEO da monitorare" value={questionsText} onChange={(event) => setQuestionsOverride(event.target.value)} onBlur={() => persist({ questions })} placeholder="Es. Qual è il miglior servizio per…?" /></label>
            <div className="geo-question-actions"><span>{questions.length}/20 domande</span><button className="secondary" onClick={() => { setQuestionsOverride(initialQuestionsText); persist({ questions: initialQuestions }); }}>Rigenera dai dati</button><button className="primary" onClick={runSimulation} disabled={simulationLoading}><Sparkles className={simulationLoading ? "spin" : ""} />{simulationLoading ? "Diagnostica…" : "Simula con OpenAI"}</button></div>
          </div>
          <div className="panel geo-simulation-summary"><div className="panel-head"><div><h2>Risultati diagnostici</h2><p>Stati prodotti sul contesto fornito, non metriche di ranking/citazione.</p></div><Bot /></div>{simulation?.results?.length ? <div className="geo-result-list">{simulation.results.map((item, index) => <details key={`${item.question}-${index}`}><summary><span>{item.question}</span><b>{item.coverage || "Da verificare"}</b></summary><div className="geo-answer"><h3>Risposta sul contesto</h3><p>{item.answer}</p><h3>Gap</h3><p>{item.gap || "Nessun gap dichiarato dalla diagnostica."}</p></div></details>)}</div> : <p>Nessuna diagnostica salvata.</p>}</div>
        </section>
      </div>

      {activeTab !== "Scope" && <GeoInsightsPanel
        tab={activeTab}
        evidenceModel={evidenceModel}
        operationalItems={operationalItems}
        simulation={simulation}
        observation={observation}
        history={history}
        onRunObservation={runObservation}
        observationLoading={observationLoading}
        dataForSeo={dataForSeo}
        observationSettings={observationSettings}
        onSettingsChange={updateObservationSettings}
        onCreateTask={createGeoTask}
        onOpenOpportunities={openOpportunity}
        onExportReport={exportReport}
      />}
    </div>
  );
}
