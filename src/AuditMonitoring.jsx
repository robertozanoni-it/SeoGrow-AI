import { useEffect, useState } from "react";
import { apiFetch } from "./api.js";
import { freshness, MONITOR_KEY, monitorConfig, runScheduledAudit } from "./auditMonitoring.js";
import { readAuditMonitor, readMonitorSource, saveAuditMonitor } from "./auditMonitorStore.js";

export function AuditScheduler() {
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    const tick = () => runScheduledAudit({ locks: navigator.locks, read: readMonitorSource, save: saveAuditMonitor, transport: apiFetch, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]) }).catch(error => { if (!controller.signal.aborted) setError(`Audit periodico sospeso: ${error.message}`); });
    const first = setTimeout(tick, 1000);
    const timer = setInterval(tick, 60000);
    return () => { controller.abort(); clearTimeout(first); clearInterval(timer); };
  }, []);
  return error ? <p className="storage-warning" role="alert">{error}</p> : null;
}

function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60000); return () => clearInterval(timer); }, []);
  return now;
}
export function FreshnessNotice({ sources, settings, onOpen }) {
  const now = useClock();
  const days = Number.isInteger(settings?.freshnessDays) && settings.freshnessDays >= 1 && settings.freshnessDays <= 365 ? settings.freshnessDays : 7;
  const items = sources.map(source => ({ ...source, ...freshness(source.date, days, now) }));
  if (settings?.freshnessEnabled === false || items.every(item => item.state === "fresh")) return null;
  return <aside className="freshness-notice"><strong>Dati da verificare</strong><p>{items.filter(item => item.state !== "fresh").map(item => `${item.labelName}: ${item.label}`).join(" · ")}</p><button className="secondary" onClick={onOpen}>Gestisci avvisi nel Centro progetto</button></aside>;
}
export function ProjectMonitoring({ client, settings, onSave }) {
  const [records, setRecords] = useState(readAuditMonitor);
  const now = useClock();
  useEffect(() => { const update = event => { if (event.key === MONITOR_KEY) setRecords(readAuditMonitor()); }; window.addEventListener("storage", update); return () => window.removeEventListener("storage", update); }, []);
  const config = monitorConfig(settings.monitor);
  const result = records[client.id];
  const interrupted = result?.status === "running" && now - Date.parse(result.lastAttemptAt) > 60000;
  return <section className="panel planning-panel project-monitoring"><span className="workflow-category">Controlli nel tempo · facoltativi</span><h2>Monitoraggio e aggiornamento dati</h2><ol className="workflow-instructions"><li>Scegli dopo quanti giorni vuoi ricevere gli avvisi sui dati.</li><li>Se desideri controlli ricorrenti, abilita l’audit periodico e scegli la frequenza.</li><li>Leggi l’esito e le variazioni qui sotto. Per correggere i problemi torna ad “Analizza e correggi”.</li></ol><label className="report-option"><input type="checkbox" checked={settings.freshnessEnabled !== false} onChange={event => onSave({ ...settings, freshnessEnabled: event.target.checked })} />Mostra avvisi sui dati mancanti o non aggiornati</label><label>Soglia avvisi<select value={settings.freshnessDays || 7} onChange={event => onSave({ ...settings, freshnessDays: Number(event.target.value) })}>{[1, 3, 7, 14, 30, 90].map(days => <option key={days} value={days}>{days} giorni</option>)}</select></label>
    <h3>Audit periodico della pagina principale</h3><p>Solo lettura del sito pubblico, una pagina per controllo. Attivo per i progetti abilitati mentre l’app è aperta; nessun recupero in blocco dei controlli saltati. Non usa API AI a pagamento e non modifica WordPress.</p>
    {!navigator.locks && <p role="status">Il browser non supporta il coordinamento tra schede: gli audit automatici restano disabilitati.</p>}
    <label className="report-option"><input type="checkbox" disabled={!navigator.locks} checked={config.enabled} onChange={event => onSave({ ...settings, monitor: { ...config, enabled: event.target.checked } })} />Abilita audit periodico per {client.name}</label><label>Frequenza<select value={config.hours} onChange={event => onSave({ ...settings, monitor: { ...config, hours: Number(event.target.value) } })}>{[6, 12, 24, 168].map(hours => <option key={hours} value={hours}>Ogni {hours} ore</option>)}</select></label>
    <p role="status">{!result ? "Nessun controllo periodico eseguito." : result.status === "success" ? `Ultimo controllo riuscito: ${new Date(result.completedAt).toLocaleString("it-IT")}` : result.status === "error" ? `Ultimo controllo non riuscito: ${result.error}` : interrupted ? "Controllo interrotto o risposta non disponibile; nuovo tentativo alla prossima scadenza." : "Controllo in corso…"}</p>
    {result?.changes && <p>{result.changes.baseline ? "Primo campione: confronto disponibile dal prossimo controllo riuscito." : `Variazione punteggio: ${result.changes.scoreDelta}. Nuovi problemi: ${result.changes.added.length}; non più rilevati: ${result.changes.resolved.length}.`}</p>}
    {result?.changes && !result.changes.baseline && <details><summary>Dettaglio variazioni dell’ultimo controllo riuscito</summary><ul>{result.changes.added.map((item, i) => <li key={`a${i}`}>Nuovo: {item.label}</li>)}{result.changes.resolved.map((item, i) => <li key={`r${i}`}>Non più rilevato: {item.label}</li>)}</ul></details>}
    {Array.isArray(result?.history) && <details><summary>Ultimi {result.history.length} campioni (massimo 12)</summary><ul>{result.history.map((item, i) => <li key={i}>{new Date(item.fetchedAt).toLocaleString("it-IT")} · Punteggio {item.score}/100 · {item.issues.length} problemi</li>)}</ul></details>}
  </section>;
}

export function AuditUpdateNotice({ clientId, settings, onRead, onOpen }) {
  const [records, setRecords] = useState(readAuditMonitor);
  useEffect(() => { const update = event => { if (event.key === MONITOR_KEY) setRecords(readAuditMonitor()); }; window.addEventListener("storage", update); return () => window.removeEventListener("storage", update); }, []);
  const record = records[clientId];
  if (!record?.completedAt || record.completedAt === settings.monitorSeenAt || !record.changes || record.changes.baseline || (!record.changes.added.length && !record.changes.resolved.length && !record.changes.scoreDelta)) return null;
  return <aside className="freshness-notice"><strong>Variazioni rilevate nell’audit periodico</strong><p>{record.changes.added.length} nuovi problemi, {record.changes.resolved.length} non più rilevati. Confronto dell’ultimo controllo riuscito.</p><button className="secondary" onClick={onOpen}>Vedi confronto</button><button className="secondary" onClick={() => onRead(record.completedAt)}>Ho letto</button></aside>;
}
