import { useEffect, useState } from 'react';
import { workspaceStorage } from './workspaceDatabase.js';
import { normalizeAnalysisHistory } from './platform.js';
import { AUTO_FIX_LIMIT, buildAutoFixPlan } from './autoFixPlan.js';
import WordPressConnectionControl from './WordPressConnectionControl.jsx';
import RemediationHost from './RemediationHost.jsx';
import WordPressLiveRemediationControlV2 from './WordPressLiveRemediationControlV2.jsx';
import './AutoFixPanel.css';

const read = (key, fallback) => { try { return JSON.parse(workspaceStorage.getItem(key)) ?? fallback; } catch { return fallback; } };

export default function AutoFixPanel({ client, onNavigate }) {
  const [plan, setPlan] = useState(null);
  const [selected, setSelected] = useState([]);
  const [batch, setBatch] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!plan) return undefined;
    const check = () => {
      const key = plan.auditType === 'page' ? 'seogrow-page-audit-history-v2' : 'seogrow-analyses-v2';
      const audits = normalizeAnalysisHistory(read(key, {})[client.id]);
      const matches = audits.filter(a => (a?.analyzedAt || a?.startedAt || '') === plan.analyzedAt);
      if (matches.length === 1 && JSON.stringify(matches[0]) === plan.fingerprint && client.url === plan.siteUrl) return;
      setMessage('Il progetto o i dati dell’audit sono cambiati. Analizza nuovamente prima di continuare.');
      if (!busy) { setBatch(null); setPlan(null); setSelected([]); }
    };
    check();
    window.addEventListener('storage', check);
    window.addEventListener('seogrow-storage-ok', check);
    return () => { window.removeEventListener('storage', check); window.removeEventListener('seogrow-storage-ok', check); };
  }, [plan, busy, client.id, client.url]);
  const analyze = () => {
    const candidates = [
      ...(read('seogrow-page-audit-history-v2', {})[client.id] || []).map(audit => ({ auditType: 'page', audit })),
      ...normalizeAnalysisHistory(read('seogrow-analyses-v2', {})[client.id]).map(audit => ({ auditType: 'site', audit })),
    ].filter(({ audit }) => Array.isArray(audit?.issues) && Number.isFinite(Date.parse(audit.analyzedAt || audit.startedAt)))
      .toSorted((a, b) => Date.parse(b.audit.analyzedAt || b.audit.startedAt) - Date.parse(a.audit.analyzedAt || a.audit.startedAt));
    setBatch(null); setSelected([]);
    if (!candidates.length) { setPlan(null); setMessage('Esegui e salva un audit SEO per preparare il piano.'); return; }
    const next = buildAutoFixPlan({ clientId: client.id, siteUrl: client.url, ...candidates[0], tasks: read('seogrow-tasks-v2', []), clients: read('seogrow-clients', []) });
    setPlan(next); setMessage('Piano pronto. Seleziona i problemi da esaminare.');
  };
  const eligible = plan?.entries.filter(e => e.level === 'approval') || [];
  return <section className="panel planning-panel auto-fix-panel" aria-label="Analizza e correggi">
    <h2>Analizza e correggi</h2><p>Segui questi 5 passaggi. Il sito cambia solo quando approvi una proposta con “Applica questa modifica sul sito”.</p>
    <ol className="correction-route" aria-label="Percorso delle correzioni">{['Audit', 'Problemi', 'WordPress', 'Proposte', 'Verifica'].map((label, index) => <li key={label}><span>{index + 1}</span>{label}</li>)}</ol>
    <section className="workflow-step workflow-source" aria-label="1. Parti dall’audit">
    <h3>1. Parti dall’audit</h3><p><strong>Cosa fare:</strong> premi “Analizza e correggi” per caricare i problemi dell’ultimo audit salvato. Per controllare di nuovo il sito, apri prima Audit SEO ed esegui un nuovo audit.</p>
    <div className="feature-toolbar"><button className="primary" onClick={analyze} disabled={Boolean(batch)}>Analizza e correggi</button><button className="secondary" onClick={() => onNavigate('Audit SEO')}>Apri audit SEO</button></div>
    {message && <p role="status">{message}</p>}
    </section>
    {plan && <>
      <section className="workflow-step workflow-selection" aria-label="2. Scegli i problemi"><h3>2. Scegli i problemi</h3><p><strong>Cosa fare:</strong> seleziona fino a 10 problemi e premi “Revisiona”. La selezione prepara il lavoro: non applica modifiche.</p>
      <p>Audit del {new Date(plan.analyzedAt).toLocaleString('it-IT')} · {plan.entries.length} problemi · {eligible.length} da esaminare · {plan.entries.length - eligible.length} manuali · 0 modifiche automatiche</p>
      <p>La disponibilità della correzione viene confermata durante l’anteprima. Le operazioni non supportate restano bloccate.</p>
      {!plan.entries.length && <p>Nessun problema segnalato nell’audit salvato.</p>}
      <details open={!batch}><summary>{batch ? "Problemi selezionati: " + selected.length + " — mostra elenco" : "Scegli i problemi da esaminare"}</summary><div className="auto-fix-list">{plan.entries.map(entry => <label className={`auto-fix-item ${entry.level === 'approval' ? 'candidate' : 'manual'}`} key={entry.index}>
        <input type="checkbox" aria-label={`Seleziona ${entry.issue?.label || entry.issue?.type || 'problema ' + (entry.index + 1)}`} checked={selected.includes(entry.index)} disabled={Boolean(batch) || entry.level !== 'approval' || (!selected.includes(entry.index) && selected.length >= AUTO_FIX_LIMIT)} onChange={event => setSelected(current => event.target.checked ? [...current, entry.index] : current.filter(i => i !== entry.index))} />
        <span><strong>{entry.issue?.label || entry.issue?.type || 'Problema SEO'}</strong><small>{entry.level === 'approval' ? 'Da preparare' : 'Intervento manuale'} · {entry.reason}</small><small>{entry.issue?.targetUrl || entry.issue?.url || plan.siteUrl}</small>{entry.issue?.detail && <small><b>Problema rilevato:</b> {entry.issue.detail}</small>}<small><b>Cosa fare:</b> {entry.level === 'approval' ? 'seleziona il problema; nel passaggio 4 potrai leggere la proposta e decidere se applicarla.' : 'apri Audit SEO, controlla il dettaglio e intervieni sulla pagina o nelle impostazioni indicate. Poi esegui un nuovo audit.'}</small></span>
      </label>)}</div></details>
      <details className="workflow-diagnostics"><summary>Controlli aggiuntivi: coerenza dei dati interni</summary><p>{plan.diagnostics.duplicateIds} ID task duplicati nel progetto. {plan.diagnostics.orphanTasks} task con progetto mancante nel workspace. Le anomalie richiedono revisione; nessun task viene eliminato.</p></details>
      <div className="feature-toolbar"><button className="primary" disabled={!selected.length || Boolean(batch)} onClick={() => setBatch({ ...plan, indexes: [...selected] })}>Revisiona {selected.length} problemi selezionati</button><span>{selected.length}/{AUTO_FIX_LIMIT} selezionati</span></div>
      </section>
      {batch && <><button className="secondary" disabled={busy} onClick={() => setBatch(null)}>Modifica selezione</button><div className="auto-fix-slot" /><RemediationHost initialAudit={batch} slotSelector=".auto-fix-slot" /><WordPressConnectionControl clientId={client.id} /><WordPressLiveRemediationControlV2 batchPlan={batch} onBusyChange={setBusy} /></>}
    </>}
    {!batch && <aside className="workflow-pending"><strong>Passaggi successivi</strong><p>{plan ? 'Seleziona i problemi e premi Revisiona per aprire il passaggio 3 (WordPress) e il passaggio 4 (proposte).' : 'Carica l’audit nel passaggio 1 per scegliere i problemi. Poi potrai collegare WordPress e preparare le proposte.'}</p></aside>}
    <section className="workflow-step workflow-verify" aria-label="5. Verifica il risultato"><h3>5. Verifica il risultato</h3><p><strong>Quando:</strong> dopo aver applicato una modifica. Apri “Cronologia e ripristino”, trova la correzione e premi “Riverifica”. “Applicata” significa ancora da verificare.</p><p>Se la verifica segnala un problema, consulta l’esito e usa il ripristino controllato quando disponibile. Per aggiornare l’elenco dei problemi, esegui un nuovo audit.</p><button className="secondary" disabled={busy} onClick={() => onNavigate('Correzioni')}>Cronologia e ripristino</button></section>
  </section>;
}
