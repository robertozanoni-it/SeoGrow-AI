import { useEffect, useState } from 'react';
import './AnalysisProgress.css';

export default function AnalysisProgress() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className="analysis-progress" aria-busy="true">
    <strong role="status">Analisi in corso — lettura e controllo delle pagine</strong>
    <progress aria-label="Analisi in corso" />
    <small>Tempo trascorso: {seconds} s. Il risultato apparirà al termine. Il server non comunica una percentuale di avanzamento.</small>
  </div>;
}
