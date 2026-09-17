import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Archive, CheckCircle2, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { registerPageHost } from "./PageStartHierarchy.js";
import { readWorkspaceJson, writeWorkspaceJson } from "./core/workspace/jsonStorage.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import {
  SERVER_ONLY_CONFIGURATION,
  normalizeProjectPolicy,
  projectPolicyFromPreferences,
  writeProjectPolicy,
} from "./system/index.js";
import "./SettingsWorkspaceLayer.css";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const lines = (value) => String(value || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);

export default function SettingsWorkspaceLayer() {
  const [page, setPage] = useState(currentPage);
  const [host, setHost] = useState(null);
  const [revision, setRevision] = useState(0);
  const [draft, setDraft] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onPage = () => setPage(currentPage());
    const onData = () => setRevision((value) => value + 1);
    for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.addEventListener(event, onPage);
    for (const event of ["storage", "seogrow-storage-ok"]) window.addEventListener(event, onData);
    return () => {
      for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.removeEventListener(event, onPage);
      for (const event of ["storage", "seogrow-storage-ok"]) window.removeEventListener(event, onData);
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

  const state = useMemo(() => {
    revision;
    const clients = readWorkspaceJson(WORKSPACE_KEYS.clients, []);
    const clientId = Number(readWorkspaceJson(WORKSPACE_KEYS.selectedClient, 0));
    const client = clients.find((item) => Number(item?.id) === clientId) || null;
    const preferences = readWorkspaceJson(WORKSPACE_KEYS.preferences, {});
    return { clientId, client, preferences, policy: client ? projectPolicyFromPreferences(preferences, clientId) : null };
  }, [revision]);

  useEffect(() => {
    setDraft(state.policy ? normalizeProjectPolicy(state.policy) : null);
    setMessage("");
  }, [state.clientId, state.policy && JSON.stringify(state.policy)]);

  if (page !== "Impostazioni" || !host) return null;
  if (!state.client || !draft) return createPortal(<section className="settings-policy empty"><h2>Seleziona un progetto</h2><p>Le policy operative sono salvate per progetto.</p></section>, host);

  const patch = (group, values) => setDraft((current) => ({ ...current, [group]: { ...current[group], ...values } }));
  const save = () => {
    const preferences = readWorkspaceJson(WORKSPACE_KEYS.preferences, {});
    writeWorkspaceJson(WORKSPACE_KEYS.preferences, writeProjectPolicy(preferences, state.clientId, draft));
    window.dispatchEvent(new CustomEvent("seogrow-project-policy-changed", { detail: { clientId: state.clientId } }));
    setMessage("Policy progetto salvate e applicate.");
  };

  const content = <section className="settings-policy" aria-label="Policy progetto">
    <header className="settings-policy-head">
      <div><span className="eyebrow"><SlidersHorizontal /> Policy progetto</span><h2>Impostazioni operative · {state.client.name}</h2><p>Controlli che incidono sul comportamento della suite. I segreti dei provider restano nelle Integrazioni/runtime e non vengono copiati qui.</p></div>
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
        <label className="check-row"><input type="checkbox" checked={draft.corrections.allowAutoPrepareLowRisk} onChange={(event) => patch("corrections", { allowAutoPrepareLowRisk: event.target.checked })} /><span>Permetti preparazione automatica delle correzioni a basso rischio <small>Prepara soltanto la proposta; non autorizza la scrittura.</small></span></label>
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
  </section>;

  return createPortal(content, host);
}
