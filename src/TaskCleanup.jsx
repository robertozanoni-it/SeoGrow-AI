import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api.js';
import { archiveDuplicateTasks } from './taskDuplicates.js';
import { slashPairs, confirmedSlashAlias } from './taskUrlEvidence.js';
import { activeClientTasks, missingCanonicalTask, completeVerifiedCanonicals } from './taskReview.js';

export default function TaskCleanup({ tasks, clientId, setTasks }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setMessage('');
    const aliases = {};
    const scoped = activeClientTasks(tasks, clientId);
    const pairs = slashPairs(scoped);
    const urls = [...new Set([...pairs.flat(), ...scoped.filter(missingCanonicalTask).map(task => task.sourceUrl || task.targetUrl)])].filter(Boolean);
    const evidence = new Map();
    setProgress({ done: 0, total: urls.length });
    let failures = 0;
    try {
      // Two requests at a time; reuse each response across task kinds.
      for (let offset = 0; offset < urls.length; offset += 2) {
        if (request.signal.aborted) return;
        await Promise.all(urls.slice(offset, offset + 2).map(async url => {
          try {
            const response = await apiFetch('/api/frontend/inspect', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ url }), signal: AbortSignal.any([request.signal, AbortSignal.timeout(30000)]),
            });
            if (!response.ok) throw new Error('Ispezione non riuscita');
            evidence.set(url, await response.json());
          } catch {
            if (!request.signal.aborted) failures++;
          } finally {
            if (!request.signal.aborted) setProgress(current => ({ ...current, done: current.done + 1 }));
          }
        }));
      }
      if (request.signal.aborted) return;
      for (const pair of pairs) {
        if (confirmedSlashAlias(pair, pair.map(url => evidence.get(url)))) aliases[pair[0]] = pair[1];
      }
      const checkedAt = new Date().toISOString();
      // changeTasks applies the updater synchronously to the latest task store.
      let archived = 0;
      let resolved = 0;
      setTasks(current => {
        const deduplicated = archiveDuplicateTasks(current, clientId, aliases);
        const next = completeVerifiedCanonicals(deduplicated, clientId, evidence, checkedAt);
        archived = deduplicated.filter((task, i) => task !== current[i]).length;
        resolved = next.filter((task, i) => task !== deduplicated[i]).length;
        return next;
      });
      const unconfirmed = pairs.length - Object.keys(aliases).length;
      setMessage(`${archived} duplicati archiviati. ${resolved} task con canonical mancante completati dopo verifica live. ${failures} URL non verificati.${unconfirmed ? ` ${unconfirmed} coppie non confermate: mantenute separate.` : ''} Storico conservato; puoi usare Annulla ultima modifica task.`);
    } catch (error) {
      if (!request.signal.aborted) setMessage(`Controllo non completato: ${error.message}`);
    } finally {
      if (!request.signal.aborted) { controller.current = null; setBusy(false); }
    }
  };
  return <div>
    <button className="secondary small-button" disabled={busy} onClick={run}>{busy ? `Verifica URL ${progress.done}/${progress.total}` : 'Controlla task e archivia duplicati'}</button>
    <small>Archivia i doppioni confermati e verifica i task con canonical mancante.</small>
    {busy && <progress aria-label="Avanzamento verifica task" value={progress.done} max={Math.max(1, progress.total)} />}
    {message && <p role="status" style={{ maxWidth: 440 }}>{message}</p>}
  </div>;
}
