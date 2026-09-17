import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link2, ExternalLink, Eye, CheckCircle2, RotateCcw, ShieldCheck, AlertTriangle, Plug, RefreshCw } from "lucide-react";
import { registerPageHost } from "./PageStartHierarchy.js";
import { readWorkspaceJson as readJson } from "./core/workspace/jsonStorage.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { getWordPressSession } from "./system/index.js";
import { apiFetch } from "./api.js";
import { navigatePage } from "./navigationUx.js";
import { writeCorrectionsWorkflowContext } from "./taskWorkflow.js";
import { listCorrections, readCorrection, updateCorrection } from "./remediationStore.js";
import {
  inspectWordPress,
  inspectLinkEvidence,
  createWordPressCorrection,
  applyPreparedCorrection,
} from "./wordpressRemediationEngine.js";
import {
  INTERNAL_LINK_ISSUE_TYPE,
  analyzeInternalLinkSuggestions,
  buildInternalLinkPatch,
  assessInternalLinkPreflight,
  assessInternalLinkVerification,
} from "./modules/links/index.js";
import "./InternalLinksWorkspaceLayer.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const ANALYSES_KEY = "seogrow-analyses-v2";

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const valueForClient = (store, clientId, fallback = null) => store?.[clientId] ?? store?.[String(clientId)] ?? fallback;
const historyForClient = (store, clientId) => {
  const value = valueForClient(store, clientId, []);
  return Array.isArray(value) ? value : value ? [value] : [];
};
const analysisDate = (item) => item?.analyzedAt || item?.startedAt || "";
const formatDate = (value) => {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString("it-IT") : "Data non disponibile";
};
const shortUrl = (value) => {
  try { const url = new URL(value); return `${url.pathname}${url.search}` || "/"; }
  catch { return String(value || ""); }
};
const readableError = (error) => error instanceof Error ? error.message : String(error || "Operazione non riuscita.");
const statusLabel = (record) => record?.status || "Opportunità";
const correctionLinkKey = (record) => record?.issue?.internalLinkKey || record?.internalLinkKey || "";
const currentCorrection = (rows, key) => rows
  .filter((record) => correctionLinkKey(record) === key)
  .toSorted((left, right) => Date.parse(right.appliedAt || right.createdAt || 0) - Date.parse(left.appliedAt || left.createdAt || 0))[0] || null;

const expectedCurrentForPatch = (entity, patch) => patch.field === "content"
  ? { content: String(entity?.content?.raw ?? entity?.content?.rendered ?? "") }
  : { meta: { _elementor_data: entity?.meta?._elementor_data ?? "" } };

export default function InternalLinksWorkspaceLayer() {
  const [page, setPage] = useState(currentPage);
  const [revision, setRevision] = useState(0);
  const [host, setHost] = useState(null);
  const [flows, setFlows] = useState({});
  const [busyKey, setBusyKey] = useState("");
  const [correctionSnapshot, setCorrectionSnapshot] = useState({ clientId: null, rows: [] });

  useEffect(() => {
    const refreshPage = () => { setPage(currentPage()); setFlows({}); };
    const refreshData = () => setRevision((value) => value + 1);
    for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.addEventListener(event, refreshPage);
    for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-remediation-applied"]) window.addEventListener(event, refreshData);
    return () => {
      for (const event of ["hashchange", "popstate", "seogrow-locationchange"]) window.removeEventListener(event, refreshPage);
      for (const event of ["storage", "seogrow-storage-ok", "seogrow-remediation-history", "seogrow-remediation-applied"]) window.removeEventListener(event, refreshData);
    };
  }, []);

  useEffect(() => {
    if (page !== "Link interni") return undefined;
    let release;
    const frame = window.requestAnimationFrame(() => {
      const mountedHost = document.createElement("div");
      mountedHost.className = "internal-links-workspace-host guided-next-actions-host";
      mountedHost.dataset.internalLinksIntegrityHost = "true";
      release = registerPageHost(page, mountedHost);
      document.body.dataset.seogrowInternalLinksWorkspace = "true";
      setHost(mountedHost);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      release?.();
      delete document.body.dataset.seogrowInternalLinksWorkspace;
    };
  }, [page]);

  const stores = useMemo(() => ({
    revision,
    clients: readJson(CLIENTS_KEY, []),
    analyses: readJson(ANALYSES_KEY, {}),
  }), [revision]);
  const selectedClientId = Number(readJson(SELECTED_CLIENT_KEY, 0));
  const client = stores.clients.find((item) => Number(item.id) === selectedClientId) || null;
  const analyses = useMemo(() => historyForClient(stores.analyses, selectedClientId)
    .toSorted((left, right) => Date.parse(analysisDate(right) || 0) - Date.parse(analysisDate(left) || 0)), [stores, selectedClientId]);
  const analysis = analyses[0] || null;
  const suggestionGate = useMemo(() => analyzeInternalLinkSuggestions(analysis?.internalLinkSuggestions || []), [analysis]);
  const session = client ? getWordPressSession(selectedClientId, client.url) : null;

  useEffect(() => {
    if (page !== "Link interni" || !Number.isSafeInteger(selectedClientId) || selectedClientId <= 0) return undefined;
    let cancelled = false;
    listCorrections({ clientId: selectedClientId })
      .then((rows) => { if (!cancelled) setCorrectionSnapshot({ clientId: selectedClientId, rows }); })
      .catch(() => { if (!cancelled) setCorrectionSnapshot({ clientId: selectedClientId, rows: [] }); });
    return () => { cancelled = true; };
  }, [page, selectedClientId, revision]);

  const corrections = correctionSnapshot.clientId === selectedClientId ? correctionSnapshot.rows : [];
  const flowFor = (key) => flows[key] || {};
  const patchFlow = (key, patch) => setFlows((current) => ({ ...current, [key]: { ...(current[key] || {}), ...patch } }));
  const assertContext = () => {
    const currentId = Number(readJson(SELECTED_CLIENT_KEY, 0));
    if (currentId !== selectedClientId || currentPage() !== "Link interni") throw new Error("Progetto o pagina cambiati durante l’operazione: azione annullata.");
  };

  const verifyRecord = async (record, suggestion) => {
    const snapshot = await readCorrection(record.id) || record;
    const evidence = await inspectLinkEvidence(suggestion.sourceUrl, suggestion.targetUrl);
    const verification = assessInternalLinkVerification(evidence, suggestion.anchor);
    const patch = verification.ok ? {
      status: "Verificato",
      frontendConfirmed: true,
      frontendFailure: false,
      verifiedAt: new Date().toISOString(),
      verificationNote: `Link interno verificato: una sola occorrenza verso ${suggestion.targetUrl}, anchor “${suggestion.anchor}”.`,
      internalLinkEvidence: evidence,
    } : {
      status: "Da verificare",
      frontendConfirmed: false,
      frontendFailure: true,
      verificationNote: `Riverifica link non conclusa: ${verification.reason}`,
      internalLinkEvidence: evidence,
    };
    return updateCorrection(record.id, patch, { expectedRecord: snapshot });
  };

  const prepare = async (suggestion) => {
    if (busyKey) return;
    setBusyKey(suggestion.key);
    patchFlow(suggestion.key, { stage: "preflight", error: "", preview: null });
    try {
      assertContext();
      if (!session) throw new Error("Collega WordPress in Integrazioni prima di preparare l’anteprima.");
      const evidence = await inspectLinkEvidence(suggestion.sourceUrl, suggestion.targetUrl);
      const preflight = assessInternalLinkPreflight(evidence);
      if (!preflight.ok) throw Object.assign(new Error(preflight.reason), { code: preflight.code });
      const inspected = await inspectWordPress(suggestion.sourceUrl, session);
      assertContext();
      const linkPatch = buildInternalLinkPatch(inspected.entity, suggestion);
      const issue = {
        type: INTERNAL_LINK_ISSUE_TYPE,
        label: `Link interno: ${suggestion.anchor}`,
        detail: suggestion.reason,
        sourceUrl: suggestion.sourceUrl,
        targetUrl: suggestion.targetUrl,
        anchorText: suggestion.anchor,
        internalLinkKey: suggestion.key,
        severity: "media",
      };
      const response = await apiFetch("/api/wordpress/live-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          siteUrl: session.url,
          targetUrl: suggestion.sourceUrl,
          username: session.username,
          applicationPassword: session.applicationPassword,
          resource: inspected.resource,
          id: inspected.entity.id,
          changes: linkPatch.changes,
          issue,
          adapter: linkPatch.adapter,
          expectedCurrent: expectedCurrentForPatch(inspected.entity, linkPatch),
          expectedStatus: inspected.entity.status,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw Object.assign(new Error(data.error || "Anteprima WordPress non riuscita."), { code: data.code || "PREVIEW_FAILED" });
      assertContext();
      const item = {
        issue,
        targetUrl: suggestion.sourceUrl,
        plan: { adapter: linkPatch.adapter, changes: linkPatch.changes, quality: { publishable: true, source: "deterministic-internal-link" } },
        data,
        contextSnapshot: {
          clientId: selectedClientId,
          clientName: client?.name || "",
          siteUrl: session.url,
          auditType: "site",
          analyzedAt: analysisDate(analysis),
          focusKey: suggestion.key,
          auditFingerprint: `${analysisDate(analysis)}:${suggestion.key}`,
        },
      };
      patchFlow(suggestion.key, { stage: "preview", preview: { item, linkPatch, evidence }, error: "" });
    } catch (error) {
      const code = error?.code || "PREVIEW_FAILED";
      patchFlow(suggestion.key, { stage: code === "LINK_ALREADY_EXISTS" ? "existing" : "manual", error: readableError(error), preview: null });
    } finally { setBusyKey(""); }
  };

  const apply = async (suggestion) => {
    const flow = flowFor(suggestion.key);
    if (busyKey || !flow.preview?.item) return;
    setBusyKey(suggestion.key);
    patchFlow(suggestion.key, { stage: "applying", error: "" });
    try {
      assertContext();
      if (!session) throw new Error("Sessione WordPress scaduta: ricollega WordPress e rigenera l’anteprima.");
      const latestEvidence = await inspectLinkEvidence(suggestion.sourceUrl, suggestion.targetUrl);
      const preflight = assessInternalLinkPreflight(latestEvidence);
      if (!preflight.ok) throw Object.assign(new Error(`Apply bloccato: ${preflight.reason}`), { code: preflight.code });
      const pendingRecord = createWordPressCorrection(flow.preview.item, session, `internal-links:${analysisDate(analysis) || "audit"}`);
      const record = await applyPreparedCorrection(pendingRecord, flow.preview.item.data, session, assertContext);
      window.dispatchEvent(new CustomEvent("seogrow-remediation-applied", { detail: { id: record.id, source: "internal-links" } }));
      let verifiedRecord = record;
      try { verifiedRecord = await verifyRecord(record, suggestion); }
      catch (verificationError) {
        patchFlow(suggestion.key, { stage: "applied", record, error: `Modifica applicata; verifica non conclusa: ${readableError(verificationError)}` });
        return;
      }
      const verified = verifiedRecord.status === "Verificato";
      patchFlow(suggestion.key, { stage: verified ? "verified" : "applied", record: verifiedRecord, preview: null, error: verified ? "" : verifiedRecord.verificationNote || "" });
      window.dispatchEvent(new CustomEvent("seogrow-remediation-history", { detail: { id: verifiedRecord.id } }));
    } catch (error) {
      patchFlow(suggestion.key, { stage: "preview", error: readableError(error) });
    } finally { setBusyKey(""); }
  };

  const verify = async (suggestion, record) => {
    if (!record?.id || busyKey) return;
    setBusyKey(suggestion.key);
    patchFlow(suggestion.key, { stage: "verifying", error: "" });
    try {
      assertContext();
      const updated = await verifyRecord(record, suggestion);
      const verified = updated.status === "Verificato";
      patchFlow(suggestion.key, { stage: verified ? "verified" : "applied", record: updated, error: verified ? "" : updated.verificationNote || "" });
      window.dispatchEvent(new CustomEvent("seogrow-remediation-history", { detail: { id: updated.id } }));
    } catch (error) { patchFlow(suggestion.key, { stage: "applied", error: readableError(error) }); }
    finally { setBusyKey(""); }
  };

  const openRollback = (suggestion, record) => {
    writeCorrectionsWorkflowContext(workspaceStorage, {
      id: record.id,
      correctionId: record.id,
      kind: "internal-link",
      title: `Link interno: ${suggestion.anchor}`,
      sourceUrl: suggestion.sourceUrl,
      targetUrl: suggestion.targetUrl,
    });
    window.dispatchEvent(new CustomEvent("seogrow-corrections-task-handoff"));
    navigatePage("Correzioni");
  };

  if (page !== "Link interni" || !host) return null;
  const verifiedCount = suggestionGate.valid.filter((suggestion) => currentCorrection(corrections, suggestion.key)?.status === "Verificato").length;
  const appliedCount = suggestionGate.valid.filter((suggestion) => ["Da verificare", "Verificato"].includes(currentCorrection(corrections, suggestion.key)?.status)).length;

  const content = !client ? (
    <section className="internal-links-workspace empty"><h2>Seleziona un progetto</h2><p>Le opportunità di linking sono isolate per sito.</p></section>
  ) : (
    <section className="internal-links-workspace" aria-label="Internal linking verificabile">
      <header className="internal-links-workspace-head">
        <div><span className="eyebrow"><ShieldCheck /> Gate anti-duplicato attivo</span><h2>Opportunità di internal linking</h2><p>Preview, applicazione, verifica e rollback usando solo evidenze dell’ultimo crawl e il writer WordPress atomico.</p></div>
        <div className="internal-links-workspace-actions">
          <span className={session ? "connected" : "disconnected"}>{session ? "WordPress collegato" : "WordPress da collegare"}</span>
          {!session && <button type="button" className="secondary" onClick={() => navigatePage("Integrazioni")}><Plug /> Collega WordPress</button>}
        </div>
      </header>

      <div className="internal-links-source-strip"><span><strong>Fonte</strong>Audit/crawl salvato</span><span><strong>Data</strong>{formatDate(analysisDate(analysis))}</span><span><strong>Sito</strong>{client.url}</span></div>
      <div className="internal-links-kpis"><article><Link2 /><span><small>Opportunità sicure</small><strong>{suggestionGate.valid.length}</strong></span></article><article><AlertTriangle /><span><small>Scartate dal gate</small><strong>{suggestionGate.rejected.length}</strong></span></article><article><RefreshCw /><span><small>Applicate</small><strong>{appliedCount}</strong></span></article><article><CheckCircle2 /><span><small>Verificate</small><strong>{verifiedCount}</strong></span></article></div>

      {!analysis ? <div className="internal-links-empty"><Link2 /><div><h3>Nessun crawl disponibile</h3><p>Esegui un Audit SEO completo per generare opportunità di linking basate sulle pagine reali del sito.</p><button className="primary" onClick={() => navigatePage("Audit SEO")}>Apri Audit SEO</button></div></div> : !suggestionGate.valid.length ? <div className="internal-links-empty"><ShieldCheck /><div><h3>Nessun auto-link sicuro disponibile</h3><p>Il gate ha escluso suggerimenti duplicati, self-link, anchor deboli o relazioni incomplete. Nessun dato viene inventato.</p></div></div> : (
        <div className="internal-links-table-wrap"><table className="internal-links-table"><caption className="sr-only">Opportunità di internal linking verificabili</caption><thead><tr><th>Pagina sorgente</th><th>Destinazione</th><th>Anchor suggerita</th><th>Motivazione</th><th>Stato</th><th>Azioni</th></tr></thead><tbody>
          {suggestionGate.valid.map((suggestion) => {
            const flow = flowFor(suggestion.key);
            const persisted = currentCorrection(corrections, suggestion.key);
            const record = flow.record || persisted;
            const stage = flow.stage || (record?.status === "Verificato" ? "verified" : record?.status === "Da verificare" ? "applied" : record?.status === "Ripristinato" ? "rolledback" : "idle");
            const isBusy = busyKey === suggestion.key;
            return <Fragment key={suggestion.key}>
              <tr data-link-state={stage}>
                <td><a href={suggestion.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink /> {shortUrl(suggestion.sourceUrl)}</a></td>
                <td><a href={suggestion.targetUrl} target="_blank" rel="noreferrer"><ExternalLink /> {shortUrl(suggestion.targetUrl)}</a></td>
                <td><strong>{suggestion.anchor}</strong></td>
                <td><small>{suggestion.reason}</small></td>
                <td><span className={`internal-link-status ${stage}`}>{stage === "preview" ? "Anteprima pronta" : stage === "existing" ? "Già collegata" : stage === "manual" ? "Manuale" : stage === "applying" ? "Applicazione…" : stage === "verifying" ? "Verifica…" : stage === "verified" ? "Verificato" : stage === "applied" ? statusLabel(record) : stage === "rolledback" ? "Ripristinato" : "Opportunità"}</span>{flow.error && <small className="internal-link-error">{flow.error}</small>}</td>
                <td><div className="internal-link-buttons">
                  {["idle", "rolledback", "manual", "existing"].includes(stage) && <button type="button" className="secondary mini" disabled={isBusy || stage === "existing"} onClick={() => prepare(suggestion)}><Eye /> Preview</button>}
                  {stage === "preview" && <button type="button" className="primary mini" disabled={isBusy} onClick={() => apply(suggestion)}>Apply</button>}
                  {["applied", "verified"].includes(stage) && record && <button type="button" className="secondary mini" disabled={isBusy} onClick={() => verify(suggestion, record)}><CheckCircle2 /> Verify</button>}
                  {["applied", "verified"].includes(stage) && record && <button type="button" className="secondary mini" onClick={() => openRollback(suggestion, record)}><RotateCcw /> Rollback</button>}
                </div></td>
              </tr>
              {stage === "preview" && flow.preview && <tr className="internal-link-preview-row"><td colSpan="6"><div className="internal-link-preview"><div><small>Prima</small><code>{flow.preview.linkPatch.beforeSnippet}</code></div><div><small>Dopo</small><code>{flow.preview.linkPatch.afterSnippet}</code></div><p>Nessuna modifica è stata ancora applicata. Prima di Apply il sistema ricontrolla che la destinazione non sia già collegata.</p></div></td></tr>}
            </Fragment>;
          })}
        </tbody></table></div>
      )}

      {suggestionGate.rejected.length > 0 && <details className="internal-links-rejected"><summary>{suggestionGate.rejected.length} suggerimenti esclusi automaticamente</summary><ul>{suggestionGate.rejected.map((entry, index) => <li key={`${entry.code}-${index}`}><strong>{entry.code}</strong> — {entry.reason}</li>)}</ul></details>}
      <footer className="internal-links-workspace-foot"><span>Nessun Apply senza assenza del link dimostrata sul frontend corrente.</span><span>Nessun auto-link quando anchor o ownership sono ambigue.</span><span>Il rollback usa lo snapshot Prima/Dopo registrato in Correzioni.</span></footer>
    </section>
  );
  return createPortal(content, host);
}
