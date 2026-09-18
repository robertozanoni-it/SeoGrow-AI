import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Activity, AlertTriangle, Archive, CheckCircle2, RefreshCw, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { registerPageHost } from "./PageStartHierarchy.js";
import { readWorkspaceJson, writeWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import {
  SERVER_ONLY_CONFIGURATION,
  normalizeProjectPolicy,
  projectPolicyFromPreferences,
  writeProjectPolicy,
} from "./system/index.js";
import { guardianSnapshot, runGuardianScan } from "./guardian/guardianEngine.js";
import { automationExecutionPlan } from "./automationOrchestrator.js";
import { automationStatusRows } from "./automationStatusModel.js";
import "./SettingsWorkspaceLayer.css";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const lines = (value) => String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);


const stateLabel = (state) => ({
  active: "Attivo",
  inactive: "Non attivo",
  attention: "Richiede attenzione",
  waiting: "In attesa",
  blocked: "Bloccato",
  circuit_open: "Interrotto",
  approval_required: "Da approvare",
  budget_blocked: "Budget bloccato",
}[state] || state);

function AutomationStatusPanel({ revision }) {
  void revision;
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState("");
  const guardian = guardianSnapshot();
  const failures = guardian.open
    .filter((item) => ["error", "critical"].includes(item?.severity))
    .map((item) => String(item?.source || ""))
    .filter(Boolean);
  const plan = automationExecutionPlan({ failures });
  const rows = automationStatusRows({ guardian, plan });
  const runNow = async () => {
    if (running) return;
    setRunning(true); setRunMessage("");
    try {
      const result = await runGuardianScan({ trigger: "settings-manual" });
      setRunMessage(result.lastScan?.failed ? `Controllo completato: ${result.lastScan.failed} verifiche richiedono attenzione.` : "Controllo completato: nessun errore rilevato.");
    } catch (error) {
      setRunMessage(`Controllo non completato: ${error?.message || error}`);
    } finally { setRunning(false); }
  };

  return <section className="settings-automation-status" aria-label="Stato automatismi">
    <header className="settings-automation-head">
      <div><span className="eyebrow"><Activity /> Automazioni</span><h2>Stato operativo automatismi</h2><p>Vista di controllo degli engine trasversali della suite. Non aggiunge nuovi moduli e non modifica le policy di sicurezza.</p></div>
      <div className="automation-head-actions"><span className={guardian.open.length ? "automation-health attention" : "automation-health healthy"}>{guardian.open.length ? `${guardian.open.length} incidenti aperti` : "Tutto operativo"}</span><button className="secondary" type="button" onClick={runNow} disabled={running}><RefreshCw className={running ? "is-spinning" : ""} /> {running ? "Controllo…" : "Esegui controllo ora"}</button></div>
    </header>
    {runMessage && <p className="automation-run-message" role="status">{runMessage}</p>}
    {guardian.lastScan && <div className="automation-last-run"><span><strong>Ultimo controllo</strong> {new Date(guardian.lastScan.completedAt).toLocaleString("it-IT")}</span><span><strong>Check</strong> {guardian.lastScan.checks}</span><span><strong>Errori</strong> {guardian.lastScan.failed}</span><span><strong>Correzioni sicure</strong> {guardian.lastScan.changed}</span></div>}
    <div className="settings-automation-grid">
      {rows.map((row) => <article key={row.id} className={`automation-card state-${row.state}`}>
        <div className="automation-card-head"><strong>{row.label}</strong><span>{stateLabel(row.state)}</span></div>
        <dl>
          <div><dt>Rischio</dt><dd>{row.risk}</dd></div>
          <div><dt>Problemi</dt><dd>{row.incidents}</dd></div>
          <div><dt>Auto-risolti</dt><dd>{row.autoResolved}</dd></div>
          <div><dt>Ultima esecuzione</dt><dd>{row.lastRun ? new Date(row.lastRun).toLocaleString("it-IT") : "Non disponibile"}</dd></div>
        </dl>
        {row.reason && <p className="automation-reason"><AlertTriangle /> {row.reason}</p>}
      </article>)}
    </div>
  </section>;
}

function ProjectPolicyEditor({ clientId, client, policy, revision }) {
  const [draft, setDraft] = useState(() => normalizeProjectPolicy(policy));
  const [message, setMessage] = useState("");
  const patch = (group, values) => setDraft((current) => ({ ...current, [group]: { ...current[group], ...values } }));
  const save = () => {
    const preferences = readWorkspaceJson(WORKSPACE_KEYS.preferences, {});
    writeWorkspaceJson(WORKSPACE_KEYS.preferences, writeProjectPolicy({ ...preferences, approveWordPress: true }, clientId, draft));
    window.dispatchEvent(new CustomEvent("seogrow-project-policy-changed", { detail: { clientId } }));
    setMessage("Policy progetto salvate e applicate.");
  };

  return <><AutomationStatusPanel revision={revision} /><section className="settings-policy" aria-label="Policy progetto">
    <header className="settings-policy-head">
      <div><span className="eyebrow"><SlidersHorizontal /> Policy progetto</span><h2>Impostazioni operative · {client.name}</h2><p>Controlli che incidono sul comportamento della suite. I segreti dei provider restano nelle Integrazioni/runtime e non vengono copiati qui.</p></div>
      <button className="primary" type="button" onClick={save}><Save /> Salva policy</button>
    </header>

    {message && <p className="settings-policy-message" role="status"><CheckCircle2 /> {message}</p>}

    <div className="settings-policy-grid">
      <article>
        <h3>Esclusioni Audit</h3>
        <label className="check-row"><input type="checkbox" checked={draft.audit.excludeLegalPages} disabled /><span>Escludi automaticamente privacy, cookie, GDPR e termini <small>Protezione SEO predefinita; non viene disattivata dal progetto.</small></span></label>
        <label>Path aggiuntivi da escludere<textarea rows="5" value={draft.audit.excludedPaths.join("\n")} onChange={(event) => patch("audit", { excludedPaths: lines(event.target.value) })} placeholder="/area-riservata/&#10;/thank-you/" /><small>Un path per riga. Si applica al path esatto e ai suoi discendenti.</small></label>
      </article>

      <article>
        <h3>Policy correzioni</h3>
        <label className="check-row"><input type="checkbox" checked={draft.corrections.requireApproval} disabled /><span>Approvazione obbligatoria prima di ogni write <small>Invariante di sicurezza: non disattivabile.</small></span></label>
        <p className="settings-invariants"><ShieldCheck /> SEO Agent e GEO non scrivono direttamente. Le azioni operative passano dai moduli proprietari.</p>
      </article>

      <article className={draft.writeSecurity.writesEnabled ? "" : "write-disabled"}>
        <h3>Sicurezza write</h3>
        <label className="check-row critical"><input type="checkbox" checked={draft.writeSecurity.writesEnabled} onChange={(event) => patch("writeSecurity", { writesEnabled: event.target.checked })} /><span>Abilita scritture WordPress per questo progetto <small>Kill-switch progetto. Se spento, preview e letture restano disponibili ma le richieste di modifica vengono bloccate.</small></span></label>
        <p className="settings-invariants"><ShieldCheck /> Preview obbligatoria · preflight fresco · rollback/receipt obbligatori.</p>
      </article>

      <article>
        <h3>Retention e log</h3>
        <div className="settings-retention-grid">
          <label>Audit<input type="number" min="1" max="100" value={draft.retention.auditRuns} onChange={(event) => patch("retention", { auditRuns: Number(event.target.value) })} /></label>
          <label>Ranking<input type="number" min="1" max="100" value={draft.retention.rankingRuns} onChange={(event) => patch("retention", { rankingRuns: Number(event.target.value) })} /></label>
          <label>Agent log<input type="number" min="1" max="100" value={draft.retention.agentRuns} onChange={(event) => patch("retention", { agentRuns: Number(event.target.value) })} /></label>
          <label>GEO snapshot<input type="number" min="1" max="100" value={draft.retention.geoSnapshots} onChange={(event) => patch("retention", { geoSnapshots: Number(event.target.value) })} /></label>
        </div>
        <small><Archive /> La retention automatica riguarda soltanto storici non autoritativi. Le Correzioni verificate non vengono eliminate perché partecipano alla riconciliazione di problemi e Task.</small>
      </article>

      <article>
        <h3>Feature flag progetto</h3>
        <label className="check-row"><input type="checkbox" checked={draft.featureFlags.geoDiagnostics} onChange={(event) => patch("featureFlags", { geoDiagnostics: event.target.checked })} /><span>Diagnostica OpenAI in GEO AI</span></label>
        <label className="check-row"><input type="checkbox" checked={draft.featureFlags.batchAutoFix} onChange={(event) => patch("featureFlags", { batchAutoFix: event.target.checked })} /><span>Batch AutoFix</span></label>
        <label className="check-row"><input type="checkbox" checked={draft.featureFlags.editorialGeneration} onChange={(event) => patch("featureFlags", { editorialGeneration: event.target.checked })} /><span>Generazione editoriale</span></label>
      </article>

      <article className="server-config">
        <h3>Cosa resta fuori dalle Impostazioni</h3>
        <p><AlertTriangle /> Solo configurazione che non deve essere controllata come policy del progetto:</p>
        <ul>{SERVER_ONLY_CONFIGURATION.map((item) => <li key={item}>{item}</li>)}</ul>
        <small>API key, OAuth secret e token non vengono salvati nelle preferenze del progetto.</small>
      </article>
    </div>
  </section></>;
}

export default function SettingsWorkspaceLayer() {
  const [page, setPage] = useState(currentPage);
  const [host, setHost] = useState(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const onPage = () => setPage(currentPage());
    const onData = () => setRevision((value) => value + 1);
    for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.addEventListener(event, onPage);
    for (const event of ["storage", "seogrow-storage-ok", "seogrow-guardian-updated", "seogrow-automation-orchestrator-updated"]) window.addEventListener(event, onData);
    return () => {
      for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.removeEventListener(event, onPage);
      for (const event of ["storage", "seogrow-storage-ok", "seogrow-guardian-updated", "seogrow-automation-orchestrator-updated"]) window.removeEventListener(event, onData);
    };
  }, []);

  useEffect(() => {
    if (page !== "Impostazioni") return undefined;
    let release;
    const frame = window.requestAnimationFrame(() => {
      const node = document.createElement("div");
      node.className = "settings-workspace-host guided-next-actions-host";
      node.dataset.settingsPolicyHost = "true";
      release = registerPageHost(page, node);
      setHost(node);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      release?.();
      setHost(null);
    };
  }, [page]);

  // revision intentionally triggers a fresh workspace read after storage events.
  void revision;
  const clients = readWorkspaceJson(WORKSPACE_KEYS.clients, []);
  const clientId = Number(readWorkspaceJson(WORKSPACE_KEYS.selectedClient, 0));
  const client = clients.find((item) => Number(item?.id) === clientId) || null;
  const preferences = readWorkspaceJson(WORKSPACE_KEYS.preferences, {});
  const policy = client ? projectPolicyFromPreferences(preferences, clientId) : null;
  const fingerprint = JSON.stringify(policy);

  if (page !== "Impostazioni" || !host) return null;
  if (!client || !policy) return createPortal(<section className="settings-policy empty"><h2>Seleziona un progetto</h2><p>Le policy operative sono salvate per progetto.</p></section>, host);

  return createPortal(
    <ProjectPolicyEditor key={`${clientId}:${fingerprint}`} clientId={clientId} client={client} policy={policy} revision={revision} />,
    host,
  );
}
