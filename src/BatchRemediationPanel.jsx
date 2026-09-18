import { useEffect, useRef, useState } from 'react';
import { batchCapability, visibleBatchSelection, createBatchRun, batchSummary, batchFinalReport, BATCH_LABELS, BATCH_RISK_LABELS, retryableProblemKeys, recoverBatchRun } from './batchRemediationModel.js';
import { prepareBatch, executeBatch } from './batchRemediationQueue.js';
import { batchHistorySnapshot, listBatchRuns, saveBatchRun, withBatchLock } from './batchRemediationStore.js';
import { createBatchWordPressPorts } from './batchRemediationRuntime.js';
import { getWordPressSession, rememberWordPressSession } from './system/index.js';
import { listCorrections } from './remediationStore.js';
import { safeHttpHref } from './reliabilityModel.js';
import { openProblemResolution } from './AutomaticProposalNavigation.js';
import { readableCorrectionFields } from './correctionPresentation.js';
import { navigatePage } from './navigationUx.js';
import { workspaceStorage } from './workspaceDatabase.js';
import { writeCorrectionsWorkflowContext } from './taskWorkflow.js';
import './BatchRemediationPanel.css';

const runLabels = { PLANNING: 'Preparazione in corso', AWAITING_APPROVAL: 'Revisione correzione batch', RUNNING: 'Correzione batch in corso',
  SUCCESS: 'Correzione batch completata', PARTIAL_SUCCESS: 'Batch completato con problemi ancora aperti', COMPLETED_WITH_OPEN: 'Batch concluso: nessuna correzione ancora confermata', INTERRUPTED: 'Batch interrotto' };
const RISK_ORDER = ['high', 'standard', 'assisted', 'read_only'];
const date = at => at ? new Date(at).toLocaleString('it-IT') : 'Non disponibile';
function download(name, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const csvCell = value => '"' + String(value ?? '').replace(/^[\s]*[=+@-]/, match => "'" + match).replaceAll('"', '""') + '"';

export default function BatchRemediationPanel({ client, rows, selectedKeys, onSelect, busy: parentBusy, onBusy, onShowOpen }) {
  const [shown, setShown] = useState(false), [draft, setDraft] = useState([]), [run, setRun] = useState(null);
  const [credentials, setCredentials] = useState(() => getWordPressSession(client.id, client.url) || { username: '', applicationPassword: '' });
  const [message, setMessage] = useState(''), [history, setHistory] = useState([]), [highRisk, setHighRisk] = useState([]);
  const [historyOnly, setHistoryOnly] = useState(false), [showModified, setShowModified] = useState(false);
  const busy = useRef(false), stop = useRef(false), mounted = useRef(true), currentRun = useRef(null), ports = useRef(null), parentRun = useRef(null);
  const checkbox = useRef(null), heading = useRef(null);
  const selected = visibleBatchSelection(rows, selectedKeys);
  const automatic = rows.filter(p => batchCapability(p).state === 'PENDING');
  const selectedAutomatic = selected.filter(p => batchCapability(p).state === 'PENDING');
  const selectedOutsideBatch = selected.filter(p => batchCapability(p).state !== 'PENDING');
  useEffect(() => { if (checkbox.current) checkbox.current.indeterminate = selected.length > 0 && selected.length < rows.length; }, [selected.length, rows.length]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false, timer;
    const reload = () => { clearTimeout(timer); timer = setTimeout(() => { listBatchRuns(client.id).then(data => { if (!cancelled) setHistory(data); }).catch(error => { if (!cancelled) setMessage(error.message); }); }, 100); };
    reload(); window.addEventListener('seogrow-batch-history', reload);
    return () => { cancelled = true; mounted.current = false; stop.current = true; clearTimeout(timer); window.removeEventListener('seogrow-batch-history', reload); };
  }, [client.id]);
  const progress = value => { if (mounted.current) setRun({ ...value, entries: value.entries.map(e => ({ ...e })) }); };
  const action = async task => {
    if (busy.current) return;
    busy.current = true; stop.current = false; onBusy(true); setMessage('');
    try { await withBatchLock(client.url, task); }
    catch (error) { if (mounted.current) setMessage(error.message); }
    finally { busy.current = false; onBusy(false); }
  };
  const choose = (problems, from = null) => {
    if (busy.current) return;
    setShown(true); setDraft(problems); setRun(null); setHighRisk([]); setHistoryOnly(false); setMessage('');
    currentRun.current = null; parentRun.current = from;
    setTimeout(() => heading.current?.focus(), 0);
  };
  const prepare = () => action(async () => {
    const next = createBatchRun({ clientId: Number(client.id), clientName: client.name, siteUrl: client.url, problems: draft, parentRunId: parentRun.current });
    const connection = { ...credentials, url: client.url };
    const nextPorts = createBatchWordPressPorts({ run: next, credentials: connection, save: saveBatchRun, progress, stopped: () => stop.current });
    await nextPorts.connection();
    rememberWordPressSession(client.id, connection);
    currentRun.current = next; ports.current = nextPorts;
    await prepareBatch(next, nextPorts);
  });
  const approve = () => action(async () => {
    const next = currentRun.current;
    if (!next || historyOnly || next.id !== run?.id) throw new Error('Riapri la selezione e rigenera le anteprime.');
    await ports.current.connection();
    await executeBatch(next, { fingerprint: next.planFingerprint, highRiskIds: highRisk }, ports.current);
    window.dispatchEvent(new CustomEvent('seogrow-remediation-history'));
  });
  const openHistory = item => action(async () => {
    const corrections = await listCorrections({ clientId: Number(client.id) });
    const recovered = recoverBatchRun(item, corrections);
    if (recovered.status !== item.status) await saveBatchRun(recovered);
    currentRun.current = null; ports.current = null;
    setRun(recovered); setShown(true); setHistoryOnly(true); setHighRisk([]);
    setTimeout(() => heading.current?.focus(), 0);
  });
  const retry = () => {
    const keys = new Set(retryableProblemKeys(run));
    if (historyOnly && run.status === 'AWAITING_APPROVAL') for (const e of run.entries.filter(e => e.state === 'PREPARED')) for (const k of e.problemKeys) keys.add(k);
    choose(run.entries.filter(e => keys.has(e.problem.key)).map(e => e.problem), run.id);
  };
  const openSingleRollback = entry => {
    writeCorrectionsWorkflowContext(workspaceStorage, {
      id: entry.correctionId,
      kind: 'remediation',
      title: entry.problem.title,
      sourceUrl: entry.problem.sourceUrl,
      targetUrl: entry.problem.targetUrls?.[0] || '',
    });
    window.dispatchEvent(new CustomEvent('seogrow-corrections-task-handoff'));
    navigatePage('Correzioni');
  };
  const report = format => {
    if (!run) return;
    const finalReport = run.finalReport || batchFinalReport(run);
    if (format === 'json') download(`${run.id}.json`, JSON.stringify({ ...batchHistorySnapshot(run), finalReport }, null, 2), 'application/json');
    else {
      const columns = ['Problema','Pagina','Rischio','Ordine','Anchor text','Destinazione','Stato','Motivo','Correzione','Rollback','Verifica','Stop critico'];
      const lines = run.entries.map(e => [
        e.problem.title,
        e.problem.sourceUrl,
        BATCH_RISK_LABELS[e.riskGroup] || BATCH_RISK_LABELS.standard,
        e.executionOrder || '',
        e.preview?.plan?.linkCleanup?.anchorText || (e.problem.anchorTexts || []).join(' | '),
        (e.problem.targetUrls || []).join(' | '),
        BATCH_LABELS[e.state],
        e.reason,
        e.correctionId,
        e.correctionId && ['APPLIED_UNVERIFIED','RESOLVED_VERIFIED'].includes(e.state) ? 'Disponibile' : 'No',
        e.verification?.note || '',
        run.criticalStop?.entryId === e.id ? `${run.criticalStop.code}: ${run.criticalStop.reason}` : '',
      ]);
      download(`${run.id}.csv`, '\uFEFF' + [columns, ...lines].map(line => line.map(csvCell).join(';')).join('\r\n'), 'text/csv;charset=utf-8');
    }
  };
  const summary = run ? batchSummary(run) : null;
  const prepared = run?.entries.filter(e => e.state === 'PREPARED') || [];
  const canApprove = !parentBusy && !historyOnly && run?.status === 'AWAITING_APPROVAL' && prepared.length > 0 && prepared.filter(e => e.highRisk).every(e => highRisk.includes(e.id));
  const done = run ? run.entries.filter(e => !['PENDING','PREFLIGHT','PREPARED','IN_EXECUTION','VERIFYING'].includes(e.state)).length : 0;
  const riskGroups = run ? RISK_ORDER.map(riskGroup => ({ riskGroup, entries: run.entries.filter(entry => entry.riskGroup === riskGroup) })).filter(group => group.entries.length) : [];
  const entryCard = entry => <article key={entry.id} className={`batch-entry state-${entry.state.toLowerCase()}`} data-risk-group={entry.riskGroup || 'standard'}>
    <header><div><h3>{entry.problem.title}</h3><a href={safeHttpHref(entry.problem.sourceUrl)} target="_blank" rel="noopener noreferrer">{entry.problem.sourceUrl}</a></div><strong className="batch-state">{BATCH_LABELS[entry.state]}</strong></header>
    <p><strong>Rischio:</strong> {BATCH_RISK_LABELS[entry.riskGroup] || BATCH_RISK_LABELS.standard}{entry.executionOrder ? ` · Ordine esecuzione #${entry.executionOrder}` : ''}</p>
    <p>{entry.reason || 'La proposta richiede approvazione.'}</p>
    {(entry.problem.targetUrls || []).map(url => <p key={url}>Destinazione: <a href={safeHttpHref(url)} target="_blank" rel="noopener noreferrer">{url}</a></p>)}
    {entry.kind === 'external_link' && <p>Anchor text: <strong>{entry.preview?.plan?.linkCleanup?.anchorText || entry.problem.anchorTexts?.join(' · ') || 'Non disponibile: non viene inventato'}</strong></p>}
    {entry.preview && <>
      <p>Sistema: <strong>{entry.preview.plan.adapter}</strong> · Risorsa: {entry.preview.data.resource} #{entry.preview.data.id} · Rollback: snapshot disponibile per questa singola modifica, soggetto a stale-check.</p>
      <p>Verifica: controllo WordPress e HTML pubblico; audit incrementale quando supportato. Duplicati tra pagine e visibilità dinamica possono richiedere ulteriori controlli.</p>
      {readableCorrectionFields(entry.preview).map(field => <section key={field.field} className="batch-field"><h4>{field.label}</h4><div className="batch-diff"><div><strong>Valore attuale / prima</strong><pre>{typeof field.before === 'string' ? field.before : JSON.stringify(field.before,null,2)}</pre></div><div><strong>Valore proposto / dopo</strong><pre>{typeof field.after === 'string' ? field.after : JSON.stringify(field.after,null,2)}</pre></div></div></section>)}
      <details><summary>Payload completo, campi e dipendenze</summary><div className="batch-diff"><pre>{JSON.stringify(entry.preview.data.previewBefore,null,2)}</pre><pre>{JSON.stringify(entry.preview.data.previewAfter,null,2)}</pre></div><p>Dipendenze: {entry.dependsOn.join(', ') || 'nessuna'}</p></details>
    </>}
    {entry.state === 'PREPARED' && entry.highRisk && !historyOnly && <label className="batch-highrisk"><input type="checkbox" disabled={parentBusy} checked={highRisk.includes(entry.id)} onChange={e => setHighRisk(v => e.target.checked ? [...v, entry.id] : v.filter(id => id !== entry.id))} /> Confermo esplicitamente questa modifica ad alto rischio e il suo payload.</label>}
    {entry.verification?.note && <p><strong>Esito verifica:</strong> {entry.verification.note}</p>}
    {!parentBusy && entry.correctionId && ['APPLIED_UNVERIFIED','RESOLVED_VERIFIED'].includes(entry.state) && <button className="secondary" onClick={() => openSingleRollback(entry)}>Apri rollback di questa modifica</button>}
    {!parentBusy && ['BLOCKED','MANUAL_REQUIRED','UNSUPPORTED','UNCERTAIN','APPLIED_UNVERIFIED','MANAGED_ASSISTED'].includes(entry.state) && <button className="secondary" onClick={() => openProblemResolution(entry.problem, client.id, 'problem-row')}>Apri problema e intervento singolo</button>}
  </article>;
  return <section className="batch-remediation" aria-label="Correzione batch dei problemi">
    <div className="batch-toolbar">
      <label><input ref={checkbox} type="checkbox" checked={rows.length > 0 && selected.length === rows.length} disabled={parentBusy || !rows.length} onChange={e => onSelect(e.target.checked ? rows.map(p => p.key) : [])} /> Seleziona tutti i visibili</label>
      <strong>{selected.length} selezionati</strong>
      <select aria-label="Selezione rapida batch" value="" disabled={parentBusy} onChange={e => {
        const mode = e.target.value;
        onSelect((mode === 'none' ? [] : mode === 'auto' ? automatic : mode === 'critical' ? rows.filter(p => p.severity === 'high') : rows.filter(p => p.priority === 'high')).map(p => p.key));
      }}><option value="">Selezione rapida</option><option value="none">Deseleziona tutti</option><option value="auto">Risolvibili automaticamente</option><option value="critical">Critici / gravità alta</option><option value="priority">Alta priorità</option></select>
      <button className="primary" disabled={parentBusy || !selectedAutomatic.length} onClick={() => choose(selectedAutomatic)}>Risolvi problemi in batch{selectedAutomatic.length ? ` (${selectedAutomatic.length})` : ''}</button>
      <button className="secondary" disabled={parentBusy || !automatic.length} onClick={() => { onSelect(automatic.map(p => p.key)); choose(automatic); }}>Risolvi tutti i problemi risolvibili ({automatic.length})</button>
    </div>
    <p className="batch-note">Tutti i problemi attivi entrano nel batch. Le modifiche vengono raggruppate per rischio, ordinate rispettando dipendenze e rischio di mutazione, quindi applicate solo dopo approvazione. Un errore critico interrompe le write successive.</p>
    {selectedOutsideBatch.length > 0 && <p className="batch-note"><strong>{selectedOutsideBatch.length}</strong> elementi selezionati sono già risolti/intenzionali o non richiedono una nuova azione batch.</p>}
    {selectedKeys.length > selected.length && <p className="batch-note">{selectedKeys.length - selected.length} selezioni non visibili escluse dal prossimo batch.</p>}
    {message && <p className="batch-error" role="alert">{message}</p>}
    {shown && <section className="batch-workspace panel" aria-label="Revisione correzione batch">
      <div className="batch-heading"><h2 ref={heading} tabIndex={-1}>{run ? runLabels[run.status] || run.status : 'Prepara correzione batch'}</h2>
        {parentBusy ? <button className="secondary" onClick={() => { stop.current = true; setMessage('Arresto richiesto: l’operazione già inviata viene registrata, senza avviare nuove write.'); }}>Interrompi dopo l’operazione corrente</button>
          : <button className="secondary" onClick={() => { setShown(false); currentRun.current = null; window.dispatchEvent(new CustomEvent('seogrow-tasks-changed')); }}>Torna ai problemi</button>}
      </div>
      <p><strong>{client.name}</strong> · <a href={safeHttpHref(client.url)} target="_blank" rel="noopener noreferrer">{client.url}</a></p>
      {!run && <>
        <p>{draft.length} problemi da esaminare. Preparazione e connessione sono in sola lettura su WordPress. Le proposte AI possono consumare credito del provider configurato.</p>
        <div className="batch-credentials"><label>Utente WordPress<input autoComplete="username" value={credentials.username} disabled={parentBusy} onChange={e => setCredentials(v => ({ ...v, username: e.target.value }))} /></label>
          <label>Password applicativa<input type="password" autoComplete="off" value={credentials.applicationPassword} disabled={parentBusy} onChange={e => setCredentials(v => ({ ...v, applicationPassword: e.target.value }))} /></label></div>
        <p className="batch-note">Credenziali solo nella sessione in memoria; non sono salvate nei report o nello storico.</p>
        <button className="primary" disabled={parentBusy || !credentials.username || !credentials.applicationPassword} onClick={prepare}>{parentBusy ? 'Preflight in corso…' : 'Prepara piano e anteprime'}</button>
      </>}
      {run && <>
        <p className="batch-note">{run.id} · {date(run.createdAt)}{run.parentRunId ? ` · Retry di ${run.parentRunId}` : ''}</p>
        <div className={`batch-outcome ${summary.resolvedProblems ? 'has-resolved' : 'has-open'}`}><strong>{summary.resolvedProblems ? `${summary.resolvedProblems} problemi risolti e verificati.` : 'Nessun problema è stato ancora corretto e verificato.'}</strong><span>{summary.pagesModified ? `${summary.pagesModified} pagine modificate.` : 'Nessuna pagina del sito è stata modificata.'} {summary.stillOpen ? `${summary.stillOpen} problemi richiedono ancora una conclusione.` : 'Non restano problemi aperti in questo batch.'}</span></div>
        {run.criticalStop && <p className="batch-error" role="alert"><strong>Batch interrotto al primo errore critico:</strong> {run.criticalStop.code} · {run.criticalStop.reason}</p>}
        {run.finalReport && <section className="batch-final-report" aria-label="Report finale batch">
          <h3>Report finale</h3>
          <p><strong>Esiti:</strong> {run.finalReport.outcomes.succeeded} riusciti · {run.finalReport.outcomes.skipped} saltati · {run.finalReport.outcomes.manual} manuali/assistiti · {run.finalReport.outcomes.failed} falliti · {run.finalReport.outcomes.blocked} bloccati.</p>
          <p><strong>Rollback:</strong> {run.finalReport.execution.filter(item => item.rollbackAvailable).length} modifiche ripristinabili singolarmente dalla cronologia Correzioni.</p>
          {run.finalReport.criticalStop ? <p className="batch-error"><strong>Stop critico:</strong> {run.finalReport.criticalStop.code} · {run.finalReport.criticalStop.reason}</p> : <p>Nessuno stop critico: le operazioni indipendenti hanno completato il proprio percorso.</p>}
        </section>}
        <div className="batch-kpis">{[['Analizzati',summary.selected],['Risolti e rimossi',summary.resolvedProblems],['Soluzioni da approvare',summary.awaitingApproval],['Applicati da verificare',summary.appliedAwaitingVerification],['Ancora aperti',summary.stillOpen],['Rischio alto',summary.riskGroups.high],['Rischio ordinario',summary.riskGroups.standard],['Assistiti/manuali',summary.riskGroups.assisted],['Sola lettura',summary.riskGroups.read_only]].map(([label,value]) => <button type="button" key={label} onClick={() => { setShown(false); onShowOpen?.(); }} aria-label={`Apri problemi: ${label}`}><strong>{value}</strong><span>{label}</span></button>)}</div>
        <p>Costo AI stimato: {run.estimatedCost ?? 'non disponibile'} · Costo reale: {run.cost ?? 'non disponibile'} · Modello: {run.model || 'configurazione corrente; dato non restituito'}</p>
        <div aria-live="polite"><progress max={run.entries.length} value={done} aria-label="Avanzamento batch" /> <span>{done} / {run.entries.length} problemi elaborati</span></div>
        {historyOnly && <p className="batch-note">Vista storica: i token di approvazione non vengono conservati. Un nuovo tentativo richiede nuove anteprime e una nuova approvazione.</p>}
        <div className="batch-entry-list">{riskGroups.map(group => <section className={`batch-risk-group risk-${group.riskGroup}`} key={group.riskGroup} aria-label={`Gruppo rischio ${BATCH_RISK_LABELS[group.riskGroup]}`}><h3>{BATCH_RISK_LABELS[group.riskGroup]} <span>{group.entries.length}</span></h3>{group.entries.map(entryCard)}</section>)}</div>
        <div className="batch-actions">
          {!historyOnly && run.status === 'AWAITING_APPROVAL' && <button className="primary" disabled={!canApprove} onClick={approve}>Approva e avvia correzione batch</button>}
          {!parentBusy && <>
            {(retryableProblemKeys(run).length > 0 || historyOnly && run.status === 'AWAITING_APPROVAL') && <button className="secondary" onClick={retry}>{historyOnly && run.status === 'AWAITING_APPROVAL' ? 'Rigenera anteprime' : 'Riprova problemi falliti / bloccati sicuri'}</button>}
            <button className="secondary" onClick={() => choose(selected.length ? selected : run.entries.map(e => e.problem))}>Modifica selezione</button>
            <button className="secondary" onClick={() => { setShown(false); window.dispatchEvent(new CustomEvent('seogrow-tasks-changed')); onShowOpen?.(); }}>Visualizza problemi ancora aperti</button>
            <button className="secondary" onClick={() => report('json')}>Scarica report JSON</button><button className="secondary" onClick={() => report('csv')}>Scarica report CSV</button>
            <button className="secondary" onClick={() => navigatePage('Correzioni')}>Cronologia e ripristino</button>
            <button className="secondary" onClick={() => setShowModified(v => !v)}>Apri pagine modificate</button>
          </>}
        </div>
        {showModified && <div className="batch-modified">{[...new Set(run.entries.filter(e => ['APPLIED_UNVERIFIED','RESOLVED_VERIFIED'].includes(e.state)).map(e => e.problem.sourceUrl))].map(url => <a key={url} href={safeHttpHref(url)} target="_blank" rel="noopener noreferrer">{url}</a>)}</div>}
      </>}
    </section>}
    <details className="batch-history"><summary>Cronologia batch ({history.length})</summary>
      {history.length ? <div className="batch-history-grid">{history.map(item => <button className="secondary" disabled={parentBusy} key={item.id} onClick={() => openHistory(item)}><strong>{date(item.createdAt)}</strong><span>{runLabels[item.status] || item.status}</span><small>{item.entries.length} problemi · {item.id.slice(0,18)}…</small></button>)}</div> : <p>Nessun batch salvato per questo progetto.</p>}
    </details>
  </section>;
}
