import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';
import './AnalysisProgress.css';

export default function AnalysisProgress({ progressId }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await apiFetch(`/api/analysis-progress/${encodeURIComponent(progressId)}`, { signal: controller.signal });
        if (response.ok) {
          const value = await response.json();
          if (!stopped) setState(value);
        }
      } catch { /* Keep the last confirmed counters on a temporary polling error. */ }
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    if (progressId) poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [progressId]);
  const done = Math.max(0, Number(state?.done) || 0);
  const total = Math.max(done, Number(state?.total) || 0);
  return <div className="analysis-progress" aria-busy="true">
    <strong role="status">{state?.phase || 'Avvio analisi…'}</strong>
    <progress aria-label={state?.phase || 'Avvio analisi'} value={state?.discovering ? 0 : done} max={Math.max(1, total)} />
    <small>{state ? `${done} completati · ${Math.max(0, total - done)} rimanenti nella fase corrente.` : 'In attesa dei primi dati dal server.'}</small>
    {state?.discovering && <small>Ricerca delle pagine: il totale può aumentare, fino al limite scelto. La barra resta ferma finché il totale non è definito.</small>}
    <small>L’analisi comprende pagine, link interni, link esterni e riepilogo finale.</small>
  </div>;
}
