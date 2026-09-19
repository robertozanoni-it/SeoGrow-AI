import { useEffect, useMemo, useState } from "react";
import {
  GUARDIAN_RISK,
  guardianSnapshot,
  installGuardianRuntime,
  runGuardianScan,
  guardianMonitoringQueue,
  guardianMonitoringEnabled,
  setGuardianMonitoringEnabled,
  runDueGuardianMonitoring,
} from "./guardianEngine.js";
import { navigatePage } from "../navigationUx.js";
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
  const [monitoringEnabled, setMonitoringEnabled] = useState(() => guardianMonitoringEnabled());
  const [lastMonitoringRun, setLastMonitoringRun] = useState("");
  const [snapshot, setSnapshot] = useState(() => guardianSnapshot());
  const [focusFingerprint, setFocusFingerprint] = useState("");
  const [viewMode, setViewMode] = useState("open");

  useEffect(() => {
    const refresh = () => setSnapshot(guardianSnapshot());
    const openIncident = (event) => { setFocusFingerprint(event?.detail?.fingerprint || ""); setOpen(true); setSnapshot(guardianSnapshot()); };
    window.addEventListener("seogrow-guardian-updated", refresh);
    window.addEventListener("seogrow-guardian-open-incident", openIncident);
    return () => { window.removeEventListener("seogrow-guardian-updated", refresh); window.removeEventListener("seogrow-guardian-open-incident", openIncident); };
  }, []);

  const activateGuardian = () => {
    installGuardianRuntime();
    setSnapshot(guardianSnapshot());
    setOpen((value) => !value);
  };

  const monitoringQueue = useMemo(() => guardianMonitoringQueue(), [snapshot]);
  const nextMonitoring = useMemo(() => snapshot.open.map((incident) => incident.monitoring?.dueAt).filter(Boolean).toSorted()[0] || "", [snapshot.open]);

  const visibleIncidents = useMemo(() => {
    const source = viewMode === "resolved" ? snapshot.autoResolved : viewMode === "approval" ? snapshot.approvalRequired : snapshot.open;
    return source
      .toSorted((left, right) => (left.fingerprint === focusFingerprint ? -1 : right.fingerprint === focusFingerprint ? 1 : Date.parse(right.lastSeenAt || 0) - Date.parse(left.lastSeenAt || 0)))
      .slice(0, 8);
  }, [snapshot.open, snapshot.autoResolved, snapshot.approvalRequired, focusFingerprint, viewMode]);

  const openView = (mode) => {
    setViewMode(mode);
    setFocusFingerprint("");
    window.requestAnimationFrame(() => document.querySelector(".guardian-incidents")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };

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

          <div className="guardian-health-grid" aria-label="Filtri Guardian">
            <button type="button" className={`guardian-score ${scoreTone(snapshot.score)} ${viewMode === "open" ? "is-active" : ""}`} onClick={() => openView("open")}>
              <strong>{snapshot.score}%</strong>
              <span>System health</span>
            </button>
            <button type="button" className={`guardian-metric ${viewMode === "open" ? "is-active" : ""}`} onClick={() => openView("open")}><strong>{snapshot.open.length}</strong><span>Aperti</span></button>
            <button type="button" className={`guardian-metric ${viewMode === "resolved" ? "is-active" : ""}`} onClick={() => openView("resolved")}><strong>{snapshot.autoResolved.length}</strong><span>Auto-risolti</span></button>
            <button type="button" className={`guardian-metric ${viewMode === "approval" ? "is-active" : ""}`} onClick={() => openView("approval")}><strong>{snapshot.approvalRequired.length}</strong><span>Da approvare</span></button>
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

          <div className="guardian-monitoring-summary"><strong>Monitoraggio continuo</strong><label><input type="checkbox" checked={monitoringEnabled} onChange={(event) => { const enabled = event.target.checked; setGuardianMonitoringEnabled(enabled); setMonitoringEnabled(enabled); }} /> {monitoringEnabled ? "Attivo" : "Disattivato"}</label><span>{monitoringQueue.length} controlli dovuti</span><span>{nextMonitoring ? `Prossimo controllo: ${new Date(nextMonitoring).toLocaleString("it-IT")}` : "Le prossime scadenze vengono calcolate dal lifecycle Guardian"}</span><button type="button" disabled={!monitoringEnabled} onClick={() => { const due = runDueGuardianMonitoring(); setLastMonitoringRun(new Date().toISOString()); setSnapshot(guardianSnapshot()); if (!due.length) setLastMonitoringRun("none"); }}>Controlla problemi dovuti ora</button>{lastMonitoringRun && <small>{lastMonitoringRun === "none" ? "Nessun controllo dovuto in questo momento." : `Ultimo avvio manuale: ${new Date(lastMonitoringRun).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`}</small>}</div>

          <div className="guardian-boundary">
            <strong>Confine di sicurezza</strong>
            <span>Guardian corregge automaticamente solo stato derivato, navigazione e proprio ledger. WordPress, contenuti cliente e restore richiedono approvazione.</span>
          </div>

          <section className="guardian-incidents" aria-live="polite">
            <div className="guardian-section-title">
              <h3>{viewMode === "resolved" ? "Auto-risolti" : viewMode === "approval" ? "Da approvare" : "Incidenti attivi"}</h3>
              <span>{viewMode === "resolved" ? snapshot.autoResolved.length : viewMode === "approval" ? snapshot.approvalRequired.length : snapshot.open.length}</span>
            </div>
            {visibleIncidents.length === 0 ? (
              <div className="guardian-empty">
                <strong>{viewMode === "resolved" ? "Nessun intervento auto-risolto" : viewMode === "approval" ? "Nessuna approvazione richiesta" : "Nessuna anomalia attiva"}</strong>
                <span>{viewMode === "resolved" ? "Le correzioni automatiche concluse compariranno qui." : viewMode === "approval" ? "Non ci sono interventi che richiedono una decisione manuale." : "I controlli automatici non hanno rilevato problemi aperti."}</span>
              </div>
            ) : visibleIncidents.map((incident) => (
              <article className={`guardian-incident severity-${incident.severity || "warning"} ${incident.fingerprint === focusFingerprint ? "is-focused" : ""}`} key={incident.id}>
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
                {incident.state !== "resolved" && <div className="guardian-incident-actions">
                  {String(incident.action || "").startsWith("inspect-") && <button type="button" onClick={scanNow} disabled={running}>{incident.action === "inspect-local-api" ? "Riprova health check" : "Ricontrolla ora"}</button>}
                  {(incident.risk === GUARDIAN_RISK.APPROVAL_REQUIRED || incident.state === "approval_required" || incident.state === "blocked") && <button type="button" className="secondary" onClick={() => { setOpen(false); navigatePage("Correzioni"); }}>Apri Correzioni</button>}
                </div>}
                <footer>
                  <span>{riskLabel(incident.risk)}</span>
                  <span>{incident.occurrences > 1 ? `${incident.occurrences}×` : incident.source}</span>
                </footer>
              </article>
            ))}
          </section>

          <footer className="guardian-footer">
            Guardian v{snapshot.version} · monitoraggio automatico attivo mentre la Suite è aperta; regression e flapping restano fuori da AutoFix.
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
