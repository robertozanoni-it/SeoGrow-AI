import { useEffect, useMemo, useState } from "react";
import {
  GUARDIAN_RISK,
  guardianSnapshot,
  installGuardianRuntime,
  runGuardianScan,
} from "./guardianEngine.js";
import "./GuardianConsole.css";

const riskLabel = (risk) => ({
  [GUARDIAN_RISK.OBSERVE]: "Osserva",
  [GUARDIAN_RISK.DIAGNOSE]: "Diagnosi",
  [GUARDIAN_RISK.SAFE_AUTOFIX]: "AutoFix sicuro",
  [GUARDIAN_RISK.APPROVAL_REQUIRED]: "Approvazione",
}[risk] || risk || "Diagnosi");

const stateLabel = (state) => ({
  open: "Aperto",
  resolved: "Risolto",
  approval_required: "Da approvare",
  blocked: "Bloccato",
}[state] || state || "Aperto");

const scoreTone = (score) => score >= 95 ? "healthy" : score >= 80 ? "warning" : "critical";

export default function GuardianConsole() {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [snapshot, setSnapshot] = useState(() => guardianSnapshot());

  useEffect(() => {
    const refresh = () => setSnapshot(guardianSnapshot());
    window.addEventListener("seogrow-guardian-updated", refresh);
    return () => window.removeEventListener("seogrow-guardian-updated", refresh);
  }, []);

  const activateGuardian = () => {
    installGuardianRuntime();
    setSnapshot(guardianSnapshot());
    setOpen((value) => !value);
  };

  const visibleIncidents = useMemo(
    () => snapshot.open
      .toSorted((left, right) => Date.parse(right.lastSeenAt || 0) - Date.parse(left.lastSeenAt || 0))
      .slice(0, 8),
    [snapshot.open],
  );

  const scanNow = async () => {
    setRunning(true);
    try {
      const result = await runGuardianScan({ trigger: "console" });
      setSnapshot(result);
    } finally {
      setRunning(false);
    }
  };

  return (
    <aside className={`guardian-shell ${open ? "is-open" : ""}`} aria-label="SeoGrow Guardian">
      {open && (
        <section className="guardian-panel" role="dialog" aria-label="Guardian control plane">
          <header className="guardian-header">
            <div>
              <span className="guardian-kicker">SELF-HEALING CONTROL PLANE</span>
              <h2>SeoGrow Guardian</h2>
              <p>Controlla la suite senza diventare un nuovo modulo operativo.</p>
            </div>
            <button className="guardian-close" type="button" onClick={() => setOpen(false)} aria-label="Chiudi Guardian">×</button>
          </header>

          <div className="guardian-health-grid">
            <div className={`guardian-score ${scoreTone(snapshot.score)}`}>
              <strong>{snapshot.score}%</strong>
              <span>System health</span>
            </div>
            <div className="guardian-metric"><strong>{snapshot.open.length}</strong><span>Aperti</span></div>
            <div className="guardian-metric"><strong>{snapshot.autoResolved.length}</strong><span>Auto-risolti</span></div>
            <div className="guardian-metric"><strong>{snapshot.approvalRequired.length}</strong><span>Da approvare</span></div>
          </div>

          <div className="guardian-actions">
            <button type="button" onClick={scanNow} disabled={running}>
              {running ? "Controllo in corso…" : "Controlla ora"}
            </button>
            <span>
              {snapshot.lastScan?.completedAt
                ? `Ultimo controllo: ${new Date(snapshot.lastScan.completedAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`
                : "Primo controllo automatico in avvio"}
            </span>
          </div>

          <div className="guardian-boundary">
            <strong>Confine di sicurezza</strong>
            <span>Guardian corregge automaticamente solo stato derivato, navigazione e proprio ledger. WordPress, contenuti cliente e restore richiedono approvazione.</span>
          </div>

          <section className="guardian-incidents" aria-live="polite">
            <div className="guardian-section-title">
              <h3>Incidenti attivi</h3>
              <span>{snapshot.open.length}</span>
            </div>
            {visibleIncidents.length === 0 ? (
              <div className="guardian-empty">
                <strong>Nessuna anomalia attiva</strong>
                <span>I controlli automatici non hanno rilevato problemi aperti.</span>
              </div>
            ) : visibleIncidents.map((incident) => (
              <article className={`guardian-incident severity-${incident.severity || "warning"}`} key={incident.id}>
                <div className="guardian-incident-top">
                  <strong>{incident.code}</strong>
                  <span>{stateLabel(incident.state)}</span>
                </div>
                <p>{incident.message}</p>
                {incident.detail && <small>{incident.detail}</small>}
                {incident.recurrence && <div className={`guardian-recurrence kind-${incident.recurrence.kind}`}><strong>Lifecycle</strong><span>{incident.recurrence.kind}</span><small>{incident.recurrence.reason}</small>{incident.recurrence.autoFixAllowed === false && <em>AutoFix sospeso</em>}</div>}
                {incident.resolution && <div className={`guardian-resolution path-${String(incident.resolution.path || "").split("-")[0].toLowerCase()}`}><strong>Cosa farà SeoGrow</strong><span>{incident.resolution.path}</span><small>{incident.resolution.reason}</small>{incident.resolution.canExecute && <em>Auto-esecuzione consentita dalle policy di sicurezza</em>}</div>}
                {incident.diagnosis && <div className={`guardian-diagnosis confidence-${incident.diagnosis.confidence || "low"}`}>
                  <div><strong>Causa probabile</strong><span>{incident.diagnosis.cause}</span></div>
                  <div className="guardian-diagnosis-meta"><span>Confidenza: <b>{incident.diagnosis.confidence}</b></span><span>Ricorrenza: <b>{incident.diagnosis.recurrence || incident.occurrences || 1}×</b></span></div>
                  {incident.diagnosis.evidence?.length > 0 && <details><summary>Perché lo pensa</summary><ul>{incident.diagnosis.evidence.map((item) => <li key={item}>{item}</li>)}</ul></details>}
                  {incident.diagnosis.requiresHumanReview && <p className="guardian-root-review">Analisi della causa radice richiesta prima di ulteriori correzioni automatiche.</p>}
                </div>}
                <footer>
                  <span>{riskLabel(incident.risk)}</span>
                  <span>{incident.occurrences > 1 ? `${incident.occurrences}×` : incident.source}</span>
                </footer>
              </article>
            ))}
          </section>

          <footer className="guardian-footer">
            Guardian v{snapshot.version} · nessun audit SEO viene avviato automaticamente.
          </footer>
        </section>
      )}

      <button
        className={`guardian-trigger ${scoreTone(snapshot.score)}`}
        type="button"
        onClick={activateGuardian}
        aria-expanded={open}
      >
        <span className="guardian-trigger-dot" aria-hidden="true" />
        <span>Guardian</span>
        <strong>{snapshot.score}%</strong>
        {snapshot.open.length > 0 && <em>{snapshot.open.length}</em>}
      </button>
    </aside>
  );
}
