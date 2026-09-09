import { useEffect, useRef, useState } from 'react';
import { apiFetch } from './api.js';
import { archiveDuplicateTasks } from './taskDuplicates.js';
import { slashPairs, confirmedSlashAlias } from './taskUrlEvidence.js';

export default function TaskCleanup({ tasks, clientId, setTasks }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  const run = async () => {
    if (controller.current) return;
    const request = new AbortController();
    controller.current = request;
    setBusy(true);
    setMessage('');
    const aliases = {};
    let failures = 0;
    try {
      for (const pair of slashPairs(tasks)) {
        try {
          const results = await Promise.all(pair.map(async url => {
            const response = await apiFetch('/api/frontend/inspect', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ url }), signal: request.signal,
            });
            if (!response.ok) throw new Error('Ispezione non riuscita');
            return response.json();
          }));
          if (confirmedSlashAlias(pair, results)) aliases[pair[0]] = pair[1];
          else failures++;
        } catch {
          if (request.signal.aborted) return;
          failures++;
        }
      }
      if (request.signal.aborted) return;
      const preview = archiveDuplicateTasks(tasks, clientId, aliases);
      const count = preview.filter((task, i) => task !== tasks[i]).length;
      setTasks(current => archiveDuplicateTasks(current, clientId, aliases));
      setMessage(`${count} duplicati individuati. ${count ? 'Archiviazione eseguita; dati conservati. Puoi usare Annulla ultima modifica task.' : 'Nessun task da archiviare.'}${failures ? ` ${failures} coppie di URL non confermate, mantenute separate.` : ''}`);
    } finally {
      if (!request.signal.aborted) { controller.current = null; setBusy(false); }
    }
  };
  return <div>
    <button className="secondary small-button" disabled={busy} onClick={run}>{busy ? 'Verifica URL in corso…' : 'Controlla e archivia duplicati'}</button>
    {message && <p role="status" style={{ maxWidth: 440 }}>{message}</p>}
  </div>;
}
