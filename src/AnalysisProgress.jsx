import { useEffect, useState } from 'react';
import { apiFetch } from './api.js';
import './AnalysisProgress.css';

export default function AnalysisProgress({ progressId, endpoint = '/api/analysis-progress' }) {
  const [state, setState] = useState(null);
  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await apiFetch(`${endpoint}/${encodeURIComponent(progressId)}`, { signal: controller.signal });
        if (response.ok) {
          const value = await response.json();
          if (!stopped) setState(value);
          if (value?.complete) return;
        }
      } catch { /* Keep the last confirmed counters on a temporary polling error. */ }
      if (!stopped) timer = setTimeout(poll, 1000);
    };
    if (progressId) poll();
    return () => { stopped = true; clearTimeout(timer); controller.abort(); };
  }, [progressId, endpoint]);
  const done = Math.max(0, Number(state?.done) || 0);
  const total = Math.max(done, Number(state?.total) || 0);
  const indeterminate = !state || state.discovering;
  const unit = state?.unit || 'elementi';
  return <div className="analysis-progress" aria-busy={state?.complete ? 'false' : 'true'}>
    <strong role="status">{state?.phase || 'Avvio analisi…'}</strong>
    <progress aria-label={state?.phase || 'Avvio analisi'} value={indeterminate ? undefined : done} max={Math.max(1, total)} />
    <small>{state ? `${done} ${unit} completati · ${Math.max(0, total - done)} rimanenti nella fase corrente.` : 'Avvio e ricerca delle prime pagine in corso.'}</small>
    {state?.discovering && <small>Scoperta URL in corso: il totale cresce solo quando vengono trovate nuove pagine reali, fino al limite scelto.</small>}
    {state?.error && <small role="alert">{state.error}</small>}
    <small>I contatori provengono dal crawler: pagine e link vengono avanzati soltanto dopo una richiesta realmente completata.</small>
  </div>;
}
