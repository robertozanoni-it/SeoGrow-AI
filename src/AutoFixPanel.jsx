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
    <h2>Analizza e correggi</h2><p>Modalità assistita: organizza i problemi dell’ultimo audit salvato e prepara fino a 10 proposte da approvare singolarmente.</p>
    <div className="feature-toolbar"><button className="primary" onClick={analyze} disabled={Boolean(batch)}>Analizza e correggi</button><button className="secondary" onClick={() => onNavigate('Audit SEO')}>Apri audit SEO</button><button className="secondary" onClick={() => onNavigate('Correzioni')}>Cronologia e ripristino</button></div>
    {message && <p role="status">{message}</p>}
    {plan && <>
      <p>Audit del {new Date(plan.analyzedAt).toLocaleString('it-IT')} · {plan.entries.length} problemi · {eligible.length} da approvare · {plan.entries.length - eligible.length} manuali · 0 modifiche automatiche</p>
      <p>La disponibilità della correzione viene confermata durante l’anteprima. Le operazioni non supportate restano bloccate.</p>
      {!plan.entries.length && <p>Nessun problema segnalato nell’audit salvato.</p>}
      <details open={!batch}><summary>{batch ? "Problemi selezionati: " + selected.length + " — mostra elenco" : "Scegli i problemi da esaminare"}</summary><div className="auto-fix-list">{plan.entries.map(entry => <label className="auto-fix-item" key={entry.index}>
        <input type="checkbox" aria-label={`Seleziona ${entry.issue?.label || entry.issue?.type || 'problema ' + (entry.index + 1)}`} checked={selected.includes(entry.index)} disabled={Boolean(batch) || entry.level !== 'approval' || (!selected.includes(entry.index) && selected.length >= AUTO_FIX_LIMIT)} onChange={event => setSelected(current => event.target.checked ? [...current, entry.index] : current.filter(i => i !== entry.index))} />
        <span><strong>{entry.issue?.label || entry.issue?.type || 'Problema SEO'}</strong><small>{entry.level === 'approval' ? 'Da approvare' : 'Manuale'} · {entry.reason}</small><small>{entry.issue?.targetUrl || entry.issue?.url || plan.siteUrl}</small></span>
      </label>)}</div></details>
      <details><summary>Diagnostica dei dati interni</summary><p>{plan.diagnostics.duplicateIds} ID task duplicati nel progetto. {plan.diagnostics.orphanTasks} task con progetto mancante nel workspace. Le anomalie richiedono revisione; nessun task viene eliminato.</p></details>
      <div className="feature-toolbar"><button className="primary" disabled={!selected.length || Boolean(batch)} onClick={() => setBatch({ ...plan, indexes: [...selected] })}>Revisiona {selected.length} problemi selezionati</button><span>{selected.length}/{AUTO_FIX_LIMIT} selezionati</span></div>
      {batch && <><button className="secondary" disabled={busy} onClick={() => setBatch(null)}>Modifica selezione</button><p>Inserisci la connessione WordPress e prepara le anteprime. Dopo ogni applicazione, apri Correzioni per la verifica e l’eventuale ripristino controllato.</p><div className="auto-fix-slot" /><RemediationHost initialAudit={batch} slotSelector=".auto-fix-slot" /><WordPressConnectionControl clientId={client.id} /><WordPressLiveRemediationControlV2 batchPlan={batch} onBusyChange={setBusy} /></>}
    </>}
  </section>;
}
