import { AlertTriangle, BarChart3, Bot, Check, Download, ExternalLink, Radar, RefreshCw, Sparkles, Target } from "lucide-react";

const coverageTone = (coverage) => coverage === "Coperta" ? "bassa" : coverage === "Parziale" ? "media" : coverage === "Scoperta" ? "alta" : "media";

export default function GeoInsightsPanel({ tab, queryMonitor = [], entityProfile, pageScores = [], strategies = [], observation, history = [], onRunObservation, observationLoading, dataForSeo, observationSettings, onSettingsChange, onCreateTask, onExportReport }) {
  if (tab === "Ricerche AI") return (
    <section className="panel geo-results">
      <div className="panel-head"><div><h2>Query Monitor GEO</h2><p>Storico delle domande, copertura simulata e pagina associata.</p></div><Bot /></div>
      <div className="table-scroll"><table><thead><tr><th>Domanda</th><th>Copertura</th><th>Variazione</th><th>Pagina</th><th>Azione</th></tr></thead><tbody>
        {queryMonitor.length ? queryMonitor.map((item) => <tr key={item.question}><td><strong>{item.question}</strong>{item.gap && <small className="block-note">{item.gap}</small>}</td><td><span className={`priority ${coverageTone(item.coverage)}`}>{item.coverage}</span></td><td>{item.changed ? `${item.previousCoverage} → ${item.coverage}` : item.previousCoverage || "—"}</td><td>{item.bestUrl ? <a href={item.bestUrl} target="_blank" rel="noreferrer"><ExternalLink /> Apri</a> : "—"}</td><td>{item.coverage !== "Coperta" ? <button className="secondary mini" onClick={() => onCreateTask({ title:`GEO: migliora “${item.question}”`, sourceUrl:item.bestUrl || "", kind:"geo-content", priority:item.coverage === "Scoperta" ? "Alta" : "Media", detail:`Domanda: ${item.question}\nCopertura: ${item.coverage}\nGap: ${item.gap || "Da approfondire"}` })}>Crea task</button> : <Check />}</td></tr>) : <tr><td colSpan="5">Aggiungi domande e avvia una simulazione per creare lo storico.</td></tr>}
      </tbody></table></div>
    </section>
  );

  if (tab === "Brand Mentions") return (
    <section className="geo-overview">
      <div className="panel geo-readiness"><div><h2>Brand & Entity Intelligence</h2><p>Coerenza dei segnali verificabili dell’entità responsabile del sito.</p></div><div className="geo-sim-metrics"><div><strong>{entityProfile?.score ?? 0}</strong><span>Entity score</span></div><div><strong>{entityProfile?.entityType || "—"}</strong><span>Entità</span></div></div>{entityProfile?.checks?.map((check) => <div className="geo-signal" key={check.label}><span>{check.ok ? <Check /> : <AlertTriangle />}</span><div><strong>{check.label}</strong><small>{check.ok ? "Rilevato" : "Da migliorare"}</small></div></div>)}</div>
      <div className="panel geo-simulation-summary"><div className="panel-head"><div><h2>Presenza brand osservata</h2><p>SERP Google via DataForSEO. Non è una misurazione di citazioni nelle AI.</p></div><Radar /></div>
        <div className="form-row two"><label>Località<input type="number" min="1" value={observationSettings.locationCode} onChange={(e)=>onSettingsChange({ locationCode:Number(e.target.value) || 2380 })} /></label><label>Lingua<select value={observationSettings.languageCode} onChange={(e)=>onSettingsChange({ languageCode:e.target.value })}><option value="it">Italiano</option><option value="en">English</option><option value="de">Deutsch</option><option value="fr">Français</option><option value="es">Español</option></select></label></div>
        <button className="primary" disabled={observationLoading} onClick={onRunObservation}><RefreshCw className={observationLoading ? "spin" : ""}/>{observationLoading ? "Osservazione…" : dataForSeo?.configured ? "Osserva SERP" : "Configura DataForSEO"}</button>
        {observation ? <><div className="geo-sim-metrics"><div><strong>{observation.summary?.ownedPresence || 0}</strong><span>Query con dominio</span></div><div><strong>{observation.summary?.brandTextPresence || 0}</strong><span>Query con brand testuale</span></div><div><strong>{observation.summary?.observed || 0}</strong><span>Query osservate</span></div></div><small>{observation.disclaimer}</small></> : <p>Nessuna osservazione SERP salvata.</p>}
      </div>
    </section>
  );

  if (tab === "Competitor") return (
    <section className="panel geo-results"><div className="panel-head"><div><h2>Competitor osservati</h2><p>Domini ricorrenti nelle SERP delle domande monitorate. È un gap competitivo SERP, non una classifica AI.</p></div><BarChart3 /></div>
      {observation?.competitors?.length ? <div className="table-scroll"><table><thead><tr><th>Dominio</th><th>Presenze</th><th>Azione</th></tr></thead><tbody>{observation.competitors.map((item) => <tr key={item.domain}><td><strong>{item.domain}</strong></td><td>{item.appearances}</td><td><button className="secondary mini" onClick={() => onCreateTask({ title:`GEO competitor: analizza ${item.domain}`, kind:"geo-competitor", priority:"Media", detail:`Competitor osservato ${item.appearances} volte nelle SERP delle query GEO monitorate. Verifica gap di contenuto, entità e fonti senza copiare il competitor.` })}>Crea task</button></td></tr>)}</tbody></table></div> : <p>Avvia “Osserva SERP” nella sezione Brand Mentions per costruire il confronto.</p>}
    </section>
  );

  if (tab === "Strategie") return (
    <section className="panel geo-issues"><div className="panel-head"><div><h2>Strategie GEO prioritarie</h2><p>Azioni ordinate da evidenze tecniche, gap informativi e osservazioni SERP.</p></div><Target /></div><div className="geo-issue-list">{strategies.length ? strategies.slice(0, 20).map((item) => <article className="geo-issue" key={item.id}><span className={`priority ${item.priority >= 85 ? "alta" : item.priority >= 65 ? "media" : "bassa"}`}>{item.priority}</span><div><h3>{item.title}</h3><p>{item.detail}</p><small>Fonte: {item.source}</small>{item.url && <a href={item.url} target="_blank" rel="noreferrer"><ExternalLink/> Apri pagina</a>}</div><button className="secondary mini" onClick={() => onCreateTask({ title:`GEO: ${item.title}`, sourceUrl:item.url, kind:item.kind, priority:item.priority >= 80 ? "Alta" : "Media", detail:`${item.detail}\n\nFonte: ${item.source}\nPriorità GEO: ${item.priority}` })}>Crea task</button></article>) : <p>Nessuna strategia disponibile: esegui Audit GEO e simulazione.</p>}</div></section>
  );

  if (tab === "Report") return (
    <section className="panel geo-results"><div className="panel-head"><div><h2>Report GEO verificabile</h2><p>Score per pagina, answerability e storico delle misurazioni.</p></div><button className="secondary" onClick={onExportReport}><Download/> Esporta CSV</button></div>
      <div className="table-scroll"><table><thead><tr><th>Pagina</th><th>GEO score</th><th>Answerability</th><th>Parole</th><th>Fonti</th><th>Problemi</th></tr></thead><tbody>{pageScores.length ? pageScores.map((item) => <tr key={item.url}><td><a href={item.url} target="_blank" rel="noreferrer">{item.url}</a></td><td><strong>{item.score}</strong></td><td>{item.answerability}</td><td>{item.words}</td><td>{item.sources}</td><td>{item.issues}</td></tr>) : <tr><td colSpan="6">Esegui un Audit GEO per ottenere gli score per pagina.</td></tr>}</tbody></table></div>
      <div className="geo-result-list"><h3>Storico GEO</h3>{history.length ? history.slice(0, 12).map((entry, index) => <div key={`${entry.capturedAt}-${index}`}><strong>{new Date(entry.capturedAt).toLocaleString("it-IT")}</strong><small>{entry.audit ? `Audit ${entry.audit.score ?? "—"}/100` : entry.simulation ? `Simulazione: ${entry.simulation.summary?.covered || 0} coperte` : entry.observation ? `SERP: ${entry.observation.summary?.ownedPresence || 0} presenze` : "Snapshot"}</small></div>) : <p>Nessuno storico GEO disponibile.</p>}</div>
    </section>
  );

  return <section className="panel"><Sparkles/><p>Seleziona una sezione GEO.</p></section>;
}
