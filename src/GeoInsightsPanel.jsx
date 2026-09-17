import { AlertTriangle, Bot, Check, Download, ExternalLink, Radar, RefreshCw, Target } from "lucide-react";

const stateLabel = (state) => ({
  "observed-pass": "Rilevato",
  "observed-gap": "Gap osservato",
  observed: "Osservato",
  diagnostic: "Diagnostica",
}[state] || "Da verificare");

const facetByKey = (model, key) => model?.facets?.find((facet) => facet.key === key) || { label: key, evidence: [] };

function EvidenceTable({ facet }) {
  return <div className="table-scroll"><table><thead><tr><th>Segnale</th><th>Valore osservato</th><th>Stato prova</th><th>Fonte</th><th>Dettaglio</th></tr></thead><tbody>
    {facet.evidence.length ? facet.evidence.map((item) => <tr key={item.id}><td><strong>{item.label}</strong></td><td>{String(item.value ?? "—")}</td><td><span className={`priority ${item.state === "observed-gap" ? "alta" : item.state === "observed-pass" ? "bassa" : "media"}`}>{stateLabel(item.state)}</span></td><td>{item.source}</td><td><small>{item.detail || "—"}</small></td></tr>) : <tr><td colSpan="5">Nessuna evidenza disponibile per questa sezione.</td></tr>}
  </tbody></table></div>;
}

function ActionList({ items, onCreateTask, onOpenOpportunities }) {
  if (!items.length) return <p>Nessuna azione derivata dalle evidenze disponibili.</p>;
  return <div className="geo-issue-list">{items.map((item) => <article className="geo-issue" key={item.id}>
    <span className="priority media">{item.severity || (item.evidenceKind === "diagnostic" ? "Diagnostica" : "Osservato")}</span>
    <div><h3>{item.title}</h3><p>{item.detail}</p><strong>Intervento: {item.recommendation}</strong><small>Fonte: {item.source} · Evidenza: {item.evidenceKind}</small>{item.url && <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink /> Apri pagina</a>}</div>
    <div className="agent-controls"><button className="secondary mini" onClick={() => onOpenOpportunities(item)}><Target /> Opportunità</button><button className="secondary mini" onClick={() => onCreateTask(item)}>Crea task</button></div>
  </article>)}</div>;
}

export default function GeoInsightsPanel({
  tab,
  evidenceModel,
  operationalItems = [],
  simulation,
  observation,
  history = [],
  onRunObservation,
  observationLoading,
  dataForSeo,
  observationSettings,
  onSettingsChange,
  onCreateTask,
  onOpenOpportunities,
  onExportReport,
}) {
  if (tab === "Entità & Schema") {
    const facet = facetByKey(evidenceModel, "entity-schema");
    const actions = operationalItems.filter((item) => item.category === "entity-schema");
    return <section className="panel geo-results"><div className="panel-head"><div><h2>Entità e schema osservati</h2><p>Nessun entity score: vengono mostrati soltanto tipi JSON-LD e segnali realmente rilevati.</p></div><Radar /></div><EvidenceTable facet={facet} /><h3>Azioni collegate</h3><ActionList items={actions} onCreateTask={onCreateTask} onOpenOpportunities={onOpenOpportunities} /></section>;
  }

  if (tab === "Citabilità") {
    const facet = facetByKey(evidenceModel, "citability-authority");
    const actions = operationalItems.filter((item) => item.category === "citability-authority");
    return <section className="panel geo-results"><div className="panel-head"><div><h2>Citabilità e autorevolezza documentabile</h2><p>Autore, data di aggiornamento e fonti esterne sono segnali osservabili; non vengono trasformati in un punteggio di autorevolezza.</p></div><Check /></div><EvidenceTable facet={facet} /><h3>Azioni collegate</h3><ActionList items={actions} onCreateTask={onCreateTask} onOpenOpportunities={onOpenOpportunities} /></section>;
  }

  if (tab === "Contenuto") {
    const facet = facetByKey(evidenceModel, "content");
    const actions = operationalItems.filter((item) => item.category === "content");
    return <section className="panel geo-results"><div className="panel-head"><div><h2>Contenuto e answerability</h2><p>Conteggi grezzi dall’audit e diagnostica OpenAI sul materiale fornito. Non è una metrica di presenza nelle AI.</p></div><Bot /></div><EvidenceTable facet={facet} />
      {simulation?.results?.length ? <div className="geo-result-list"><h3>Diagnostica domande</h3>{simulation.results.map((item, index) => <details key={`${item.question}-${index}`}><summary><span>{item.question}</span><b>{item.coverage || "Da verificare"}</b></summary><div className="geo-answer"><p><strong>Risposta sul contesto:</strong> {item.answer || "—"}</p><p><strong>Gap dichiarato:</strong> {item.gap || "Nessuno"}</p>{item.bestUrl && <a href={item.bestUrl} target="_blank" rel="noreferrer"><ExternalLink /> Pagina associata</a>}</div></details>)}</div> : null}
      <h3>Azioni collegate</h3><ActionList items={actions} onCreateTask={onCreateTask} onOpenOpportunities={onOpenOpportunities} />
    </section>;
  }

  if (tab === "Presenza") {
    const facet = facetByKey(evidenceModel, "presence");
    return <section className="geo-overview">
      <div className="panel geo-readiness"><div><h2>Presenza osservabile</h2><p>Solo Google SERP via DataForSEO. Non è una misurazione di citazioni o ranking nei motori generativi.</p></div><EvidenceTable facet={facet} /></div>
      <div className="panel geo-simulation-summary"><div className="panel-head"><div><h2>Osserva SERP Google</h2><p>Controllo esterno ripetibile sulle domande monitorate.</p></div><Radar /></div>
        <div className="form-row two"><label>Località<input type="number" min="1" value={observationSettings.locationCode} onChange={(event) => onSettingsChange({ locationCode: Number(event.target.value) || 2380 })} /></label><label>Lingua<select value={observationSettings.languageCode} onChange={(event) => onSettingsChange({ languageCode: event.target.value })}><option value="it">Italiano</option><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="es">Español</option></select></label></div>
        <button className="primary" disabled={observationLoading} onClick={onRunObservation}><RefreshCw className={observationLoading ? "spin" : ""} />{observationLoading ? "Osservazione…" : dataForSeo?.configured ? "Osserva SERP" : "Configura DataForSEO"}</button>
        {observation?.competitors?.length ? <div className="table-scroll"><table><thead><tr><th>Dominio osservato</th><th>Presenze nelle query</th></tr></thead><tbody>{observation.competitors.map((item) => <tr key={item.domain}><td><strong>{item.domain}</strong></td><td>{item.appearances}</td></tr>)}</tbody></table></div> : <p>Nessun confronto SERP salvato.</p>}
      </div>
    </section>;
  }

  if (tab === "Azioni & Report") return <section className="panel geo-issues"><div className="panel-head"><div><h2>Azioni GEO verificabili</h2><p>La coda nasce da evidenze osservate o da diagnostica esplicitamente etichettata e può continuare in Opportunità SEO o Task.</p></div><button className="secondary" onClick={onExportReport}><Download /> Esporta CSV</button></div><ActionList items={operationalItems} onCreateTask={onCreateTask} onOpenOpportunities={onOpenOpportunities} />
    <div className="geo-result-list"><h3>Storico delle prove</h3>{history.length ? history.slice(0, 12).map((entry, index) => <div key={`${entry.capturedAt}-${index}`}><strong>{new Date(entry.capturedAt).toLocaleString("it-IT")}</strong><small>{entry.audit ? `Audit GEO · ${entry.audit.pagesAudited?.length || 0} pagine` : entry.simulation ? `Diagnostica OpenAI · ${entry.simulation.results?.length || 0} domande` : entry.observation ? `SERP DataForSEO · ${entry.observation.queries?.length || 0} query` : "Snapshot"}</small></div>) : <p>Nessuno storico GEO disponibile.</p>}</div>
  </section>;

  return <section className="panel"><AlertTriangle /><p>Seleziona una sezione GEO disponibile.</p></section>;
}
