import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api';
import { getWordPressSession } from './wordpressSession.js';
import { applyJournaledCorrection } from './correctionJournal.js';
import { listCorrections, setLastBatch } from './remediationStore.js';

const SITE = 'https://yogabuenaonda.it/';
const FIELD = 'meta._elementor_data';
const LABEL = 'Collaudo Elementor 8196';
const flatten = state => ({ [FIELD]: state.meta._elementor_data });
async function post(path, body) {
  const response = await apiFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'Operazione non riuscita.'); error.code = data.code; throw error; }
  return data;
}
export default function IsolatedElementorQaPanel({ client, onNavigate }) {
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('Collega WordPress nel passaggio 3, poi prepara questa prova. Non serve selezionare un problema SEO.');
  const [busy, setBusy] = useState(false);
  const [recorded, setRecorded] = useState(false);
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  let eligible = false;
  try { eligible = new URL(client.url).href.replace(/\/$/, '') === SITE.replace(/\/$/, ''); } catch { /* Other projects have no test panel. */ }
  if (!eligible) return null;
  const credentials = () => {
    const session = getWordPressSession(client.id, client.url);
    if (!session) throw new Error('Collega WordPress nel passaggio 3: la connessione è assente o scaduta.');
    return { siteUrl: SITE, username: session.username, applicationPassword: session.applicationPassword };
  };
  const run = async action => {
    if (lock.current) return;
    lock.current = true; setBusy(true);
    try { await action(); } catch (error) { if (mounted.current) setMessage(error.message); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };
  const prepare = () => run(async () => {
    setPreview(null);
    const pending = (await listCorrections({ clientId: client.id })).find(row => row.issueLabel === LABEL && !['Ripristinato', 'Bloccato'].includes(row.status));
    if (pending) { setRecorded(true); throw new Error('Esiste già una prova da controllare. Apri il risultato e il ripristino prima di iniziarne un’altra.'); }
    const data = await post('/api/wordpress/live-preview', { ...credentials(), isolatedQa: true, resource: 'pages', id: 8196, targetUrl: `${SITE}?page_id=8196`, adapter: 'Elementor Canvas — collaudo isolato', issue: { type: 'qa-isolated', label: LABEL } });
    if (!mounted.current) return;
    setPreview(data); setRecorded(false); setMessage('Anteprima pronta. Nessuna modifica eseguita. La pagina resterà in bozza.');
  });
  const apply = () => run(async () => {
    if (!preview || recorded) return;
    const auth = credentials();
    if (!window.confirm('Applicare il solo testo di prova alla bozza Elementor 8196 su yogabuenaonda.it? Lo snapshot verrà salvato prima della richiesta e sarà disponibile per il ripristino.')) return;
    const batchId = `qa-elementor-${crypto.randomUUID()}`;
    const record = {
      id: `correction-${crypto.randomUUID()}`, batchId, clientId: client.id, clientName: client.name,
      platform: 'wordpress', liveApproval: true, adapter: preview.adapter,
      issue: { type: 'qa-isolated', label: LABEL }, issueLabel: LABEL, issueType: 'qa-isolated',
      siteUrl: SITE, sourceUrl: `${SITE}?page_id=8196`, username: auth.username,
      resource: 'pages', entityId: 8196, wordpressResource: 'pages', wordpressId: 8196,
      fields: [FIELD], before: flatten(preview.previewBefore), after: flatten(preview.previewAfter),
      rollbackChanges: preview.previewBefore, appliedAt: new Date().toISOString(),
      frontendConfirmed: false, verificationNote: 'Prova tecnica su bozza: verificare anteprima desktop/mobile e ripristinare. Non certifica una correzione SEO.'
    };
    setLastBatch(batchId);
    setRecorded(true); setPreview(null);
    await applyJournaledCorrection(record, async () => {
      const applied = await post('/api/wordpress/live-apply', { approvalToken: preview.approvalToken, username: auth.username, applicationPassword: auth.applicationPassword });
      return { before: flatten(applied.before), after: flatten(applied.after), rollbackChanges: applied.before };
    });
    if (mounted.current) setMessage('Testo di prova salvato. Apri l’anteprima WordPress, poi il risultato: Vedi Prima / Dopo → Ripristina versione precedente.');
  });
  return <section className="panel planning-panel workflow-step workflow-verify" aria-label="Collaudo Elementor su pagina isolata">
    <h2>Collaudo Elementor — pagina di prova 8196</h2>
    <p>Questa prova cambia soltanto il titolo visibile nella bozza tecnica. Non corregge un problema SEO e non pubblica la pagina.</p>
    <ol className="workflow-instructions"><li>Prepara la prova e confronta il testo.</li><li>Approva la modifica alla bozza.</li><li>Controlla l’anteprima WordPress, poi apri il risultato e ripristina la versione precedente.</li></ol>
    <div className="feature-toolbar"><button className="primary" disabled={busy || recorded} onClick={prepare}>1. Prepara prova Elementor</button><button className="secondary" disabled={busy} onClick={() => onNavigate('Correzioni')}>3. Apri risultato e ripristino</button></div>
    <p role="status">{busy ? 'Controllo in corso…' : message}</p>
    {preview && <div className="workflow-step workflow-proposals"><p><strong>Adesso:</strong> Collaudo SeoGrow — versione iniziale</p><p><strong>Dopo:</strong> Collaudo SeoGrow — versione di prova</p><p>Pagina 8196 · Bozza · Font, stile e struttura invariati nella proposta.</p><button className="primary" disabled={busy} onClick={apply}>2. Applica testo alla pagina di prova</button></div>}
    <p><a href={`${SITE}?page_id=8196&preview=true`} target="_blank" rel="noreferrer">Apri anteprima WordPress della pagina 8196</a> · Richiede accesso a WordPress.</p>
  </section>;
}
