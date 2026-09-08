import AutoFixPanel from "./AutoFixPanel.jsx";
import { useEffect, useState } from "react";
import { reportSections, reportTemplate } from "./projectPlanning.js";
export default function ProjectCenter({ client, dataset, analysis, connection, aiConfigured, settings = {}, onSave, onNavigate, onReport, children }) {
  const [step, setStep] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const template = reportTemplate(settings.report);
  const objective = typeof settings.objective === "string" ? settings.objective : "";
  const verified = connection?.verifiedAt && now - Date.parse(connection.verifiedAt) < 30 * 60_000 && Date.parse(connection.verifiedAt) <= now;
  const updateTemplate = patch => onSave({ ...settings, report: { ...template, ...patch } });
  return <><div className="page-title"><div><h1>Centro progetto — {client.name}</h1><p>Configura il lavoro e controlla quali dati sono disponibili.</p></div></div>
    <section className="panel planning-panel"><h2>Configurazione guidata</h2><ol className="wizard-steps">{["Obiettivo", "Dati SEO", "WordPress", "Riepilogo"].map((label, index) => <li key={label}><button className="secondary" aria-current={index === step ? "step" : undefined} onClick={() => setStep(index)}>{index + 1}. {label}</button></li>)}</ol>
      {step === 0 && <label>Obiettivo del progetto<textarea maxLength={1000} value={objective} onChange={event => onSave({ ...settings, objective: event.target.value })} placeholder="Es. aumentare le richieste per i corsi di yoga" /></label>}
      {step === 1 && <><p>Search Console: {dataset ? "dati importati" : "dati mancanti"}. Audit del sito: {analysis ? "disponibile" : "non eseguito"}.</p><button className="secondary" onClick={() => onNavigate("Integrazioni")}>Importa Search Console</button><button className="secondary" onClick={() => onNavigate("Audit SEO")}>Apri audit SEO</button></>}
      {step === 2 && <><p>WordPress: {verified ? "connessione verificata in questa sessione" : "verifica assente o scaduta"}. La verifica della connessione legge il sito senza modificare contenuti.</p><button className="secondary" onClick={() => onNavigate("Integrazioni")}>Verifica connessione WordPress</button></>}
      {step === 3 && <ul><li>Obiettivo: {objective.trim() || "da definire"}</li><li>Search Console: {dataset ? "presente" : "da importare"}</li><li>Audit: {analysis ? "presente" : "da eseguire"}</li><li>WordPress: {verified ? "verificato" : "da verificare nelle Integrazioni"}</li><li>OpenAI: {aiConfigured ? "configurato" : "non configurato, facoltativo per i controlli locali"}</li></ul>}
      <div className="feature-toolbar"><button className="secondary" disabled={step === 0} onClick={() => setStep(value => value - 1)}>Indietro</button><button className="primary" disabled={step === 3} onClick={() => setStep(value => value + 1)}>Avanti</button></div>
    </section>
    <AutoFixPanel client={client} onNavigate={onNavigate} />
    {children}
    <section className="panel planning-panel"><h2>Modello del report</h2><p>Personalizza il report HTML del progetto, stampabile anche in PDF.</p><div className="feature-toolbar"><label>Nome studio o agenzia<input maxLength={100} value={template.brand} onChange={event => updateTemplate({ brand: event.target.value })} /></label><label>Titolo<input maxLength={100} value={template.title} onChange={event => updateTemplate({ title: event.target.value })} /></label><label>Colore<input type="color" value={template.color} onChange={event => updateTemplate({ color: event.target.value })} /></label></div><label>Introduzione<textarea maxLength={2000} value={template.intro} onChange={event => updateTemplate({ intro: event.target.value })} /></label><fieldset><legend>Sezioni da includere</legend>{Object.entries(reportSections).map(([key, label]) => <label className="report-option" key={key}><input type="checkbox" checked={template.sections[key]} disabled={template.sections[key] && Object.values(template.sections).filter(Boolean).length === 1} onChange={event => updateTemplate({ sections: { ...template.sections, [key]: event.target.checked } })} />{label}</label>)}</fieldset><button className="primary" onClick={onReport}>Scarica report personalizzato</button></section>
  </>;
}
