import { workspaceStorage } from "./workspaceDatabase.js";
import { confirmAction } from "./ui/dialogs.js";
import { readWorkspaceJson as readJson } from "./core/workspace/jsonStorage.js";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  History,
  RefreshCw,
  RotateCcw,
  Search,
  Wrench,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "./api";
import { recheckCorrectionById } from "./remediationIntegrity";
import {
  listCorrections,
  readCorrection,
  reopenTask,
  REMEDIATION_INDEX_KEY,
  REMEDIATION_LAST_BATCH_KEY,
  updateCorrection,
} from "./remediationStore";
import { correctionCredentials } from "./correctionCredentials.js";
import { rollbackRequest } from "./rollbackPayload";
import "./CorrectionsWorkspace.css";
import "./CorrectionsReference.css";
import { historyText, historyFieldLabel } from "./correctionHistoryText.js";
import { consumeCorrectionsWorkflowContext } from "./taskWorkflow.js";

const fetch = apiFetch;
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const WORDPRESS_PROFILES_KEY = "seogrow-wordpress-profiles-v1";

const currentHash = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)); } catch { return ""; }
};
const openCorrections = () => {
  const next = `#${encodeURIComponent("Correzioni")}`;
  window.__seogrowCorrectionsMode = true;
  if (window.location.hash !== next) window.history.pushState(null, "", next);
  window.dispatchEvent(new CustomEvent("seogrow-locationchange"));
};
const preview = (value, max = 300) => {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text || "—";
};
const statusClass = (status) => String(status || "").toLowerCase().replaceAll(" ", "-");
const isVerified = (record) => record.status === "Verificato";
const isPending = (record) => ["Applicato", "Da verificare", "Esito incerto", "Bloccato"].includes(record.status);
const isRolledBack = (record) => record.status === "Ripristinato";

export default function CorrectionsWorkspace() {
  const [active, setActive] = useState(currentHash() === "Correzioni");
  const [navTarget, setNavTarget] = useState(null);
  const [mainTarget, setMainTarget] = useState(null);
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState([]);
  const [showAll, setShowAll] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [workflowContext, setWorkflowContext] = useState(() => consumeCorrectionsWorkflowContext(workspaceStorage));
  const [query, setQuery] = useState(() => workflowContext?.sourceUrl || workflowContext?.title || "");
  const [expanded, setExpanded] = useState(() => new Set());
  const [passwordEntry, setPasswordEntry] = useState(null);
  const [message, setMessage] = useState("");
  const [rollingBack, setRollingBack] = useState("");
  const [verifying, setVerifying] = useState("");

  useEffect(() => {
    const receiveTaskHandoff = () => {
      const context = consumeCorrectionsWorkflowContext(workspaceStorage);
      if (!context) return;
      setWorkflowContext(context);
      setQuery(context.sourceUrl || context.title || "");
    };
    window.addEventListener("seogrow-corrections-task-handoff", receiveTaskHandoff);
    return () => window.removeEventListener("seogrow-corrections-task-handoff", receiveTaskHandoff);
  }, []);

  const selectedClientId = Number(readJson(SELECTED_CLIENT_KEY, 0));
  const password = passwordEntry?.clientId === selectedClientId ? passwordEntry.value : "";
  const setPassword = value => setPasswordEntry({ clientId: selectedClientId, value });
  const scopedRows = useMemo(() => rows.filter(row => selectedClientId > 0 && Number(row.clientId) === selectedClientId), [rows, selectedClientId]);
  const batchId = scopedRows[0]?.batchId || "";
  const batchRows = useMemo(() => showAll || !batchId ? scopedRows : scopedRows.filter(row => row.batchId === batchId), [scopedRows, showAll, batchId]);
  const profile = readJson(WORDPRESS_PROFILES_KEY, {})[selectedClientId] || null;

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    const syncTargets = () => {
      const nav = document.querySelector(".sidebar nav");
      const main = document.querySelector(".workspace main") || document.querySelector(".app main");
      setNavTarget((current) => current === nav ? current : nav);
      setMainTarget((current) => current === main ? current : main);
      const nextActive = currentHash() === "Correzioni";
      setActive(nextActive);
      window.__seogrowCorrectionsMode = nextActive;
      if ((!nav || !main) && attempts < 120) {
        attempts += 1;
        frame = window.requestAnimationFrame(syncTargets);
      }
    };
    const refreshNavigation = () => {
      window.cancelAnimationFrame(frame);
      attempts = 0;
      frame = window.requestAnimationFrame(syncTargets);
    };
    frame = window.requestAnimationFrame(syncTargets);
    window.addEventListener("hashchange", refreshNavigation);
    window.addEventListener("popstate", refreshNavigation);
    window.addEventListener("storage", refreshNavigation);
    window.addEventListener("seogrow-locationchange", refreshNavigation);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("hashchange", refreshNavigation);
      window.removeEventListener("popstate", refreshNavigation);
      window.removeEventListener("storage", refreshNavigation);
      window.removeEventListener("seogrow-locationchange", refreshNavigation);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    const storage = (event) => {
      if ([REMEDIATION_INDEX_KEY, REMEDIATION_LAST_BATCH_KEY, SELECTED_CLIENT_KEY].includes(event.key)) refresh();
    };
    const storedInThisTab = event => storage(event.detail || {});
    window.addEventListener("seogrow-storage-ok", storedInThisTab);
    window.addEventListener("storage", storage);
    window.addEventListener("seogrow-remediation-history", refresh);
    window.addEventListener("seogrow-remediation-applied", refresh);
    return () => {
      window.removeEventListener("seogrow-storage-ok", storedInThisTab);
      window.removeEventListener("storage", storage);
      window.removeEventListener("seogrow-remediation-history", refresh);
      window.removeEventListener("seogrow-remediation-applied", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (selectedClientId > 0 ? listCorrections({ clientId: selectedClientId }) : Promise.resolve([]))
      .then((items) => { if (!cancelled) setRows(items); })
      .catch((error) => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [selectedClientId, version]);

  useEffect(() => {
    if (!mainTarget) return undefined;
    const main = document.querySelector(".workspace main") || document.querySelector(".app main");
    if (!main) return undefined;
    if (active) main.dataset.correctionsOpen = "true";
    else delete main.dataset.correctionsOpen;
    return () => { delete main.dataset.correctionsOpen; };
  }, [active, mainTarget]);

  const stats = useMemo(() => ({
    total: batchRows.length,
    verified: batchRows.filter(isVerified).length,
    pending: batchRows.filter(isPending).length,
    rolledBack: batchRows.filter(isRolledBack).length,
  }), [batchRows]);

  const filteredRows = useMemo(() => batchRows.filter((record) => {
    const matchesQuery = `${record.issueLabel || ""} ${record.sourceUrl || ""} ${(record.fields || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase());
    if (!matchesQuery) return false;
    if (statusFilter === "verified") return isVerified(record);
    if (statusFilter === "pending") return isPending(record);
    if (statusFilter === "rolled") return isRolledBack(record);
    return true;
  }), [batchRows, statusFilter, query]);

  const toggleExpanded = (id) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const reverify = async (id) => {
    if (!id || verifying || rollingBack) return;
    setVerifying(id);
    setMessage("Riverifica della correzione in corso…");
    try {
      const result = await recheckCorrectionById(id, {
        clientId: Number(readJson(SELECTED_CLIENT_KEY, 0)),
        siteUrl: profile?.url || "",
        username: profile?.username || "",
        applicationPassword: password,
      });
      const updated = result?.record;
      if (result?.error) {
        setMessage(`Riverifica non conclusa: ${result.error.message}. Lo stato precedente è stato mantenuto.`);
      } else if (updated?.status === "Verificato" && result?.needsAudit !== true) {
        setMessage("Riverifica completata: problema risolto e rimosso dai problemi attivi. La correzione resta disponibile nello storico.");
      } else if (result?.needsAudit) {
        setMessage("Controllo frontend completato. Per confermare la risoluzione SEO serve ancora un nuovo audit mirato o completo.");
      } else {
        setMessage(updated?.verificationNote || "Riverifica completata. La correzione resta Da verificare.");
      }
      setVersion((value) => value + 1);
    } catch (error) {
      setMessage(`Riverifica non riuscita: ${error.message}`);
    } finally {
      setVerifying("");
    }
  };

  const rollback = async (id) => {
    if (rollingBack || verifying) return;
    if (!password) {
      setMessage("Inserisci la password applicativa WordPress per eseguire il rollback.");
      return;
    }
    const record = await readCorrection(id);
    if (!record || Number(record.clientId) !== selectedClientId || selectedClientId !== Number(readJson(SELECTED_CLIENT_KEY, 0))) {
      setMessage("Snapshot di rollback non disponibile.");
      return;
    }
    const changes = record.before && typeof record.before === "object" ? record.before : {};
    const expectedCurrent = record.after && typeof record.after === "object" ? record.after : {};
    if (!Object.keys(changes).length) {
      setMessage("Questa correzione non contiene uno snapshot precedente ripristinabile.");
      return;
    }
    if (!Object.keys(expectedCurrent).length) {
      setMessage("Rollback bloccato: manca lo snapshot dello stato applicato necessario per verificare che WordPress non sia cambiato nel frattempo.");
      return;
    }
    if (!confirmAction(`Ripristinare la versione precedente per “${record.issueLabel}”? Prima del rollback SeoGrow controllerà che WordPress sia ancora nello stato applicato da questa correzione.`)) return;
    setRollingBack(id);
    setMessage("Controllo stale-state e rollback in corso…");
    try {
      const response = await fetch("/api/wordpress/live-rollback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(rollbackRequest(record, correctionCredentials(record, {
          clientId: selectedClientId,
          siteUrl: profile?.url || "",
          username: profile?.username || "",
          applicationPassword: password,
        }))),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Rollback WordPress non riuscito");
      if (data.staleChecked !== true) throw new Error("Rollback rifiutato: il server non ha confermato il controllo stale-state.");
      const updated = await updateCorrection(id, {
        status: "Ripristinato",
        rollbackAt: new Date().toISOString(),
        rollbackNote: "Versione precedente ripristinata dopo verifica che lo stato WordPress non fosse cambiato.",
      });
      if (updated) reopenTask(updated);
      setMessage("Versione precedente ripristinata. Eventuali task collegati sono stati riaperti.");
      setVersion((value) => value + 1);
    } catch (error) {
      setMessage(`Rollback non riuscito: ${error.message}`);
    } finally {
      setRollingBack("");
    }
  };

  const nav = navTarget ? createPortal(
    <button
      type="button"
      className={active ? "active corrections-nav-button" : "corrections-nav-button"}
      aria-current={active ? "page" : undefined}
      onClick={openCorrections}
    >
      <History />
      <span>Correzioni</span>
    </button>,
    navTarget,
  ) : null;

  const totalForRing = Math.max(1, stats.total);
  const verifiedDeg = (stats.verified / totalForRing) * 360;
  const pendingDeg = (stats.pending / totalForRing) * 360;
  const page = active && mainTarget ? createPortal(
    <div className="corrections-workspace-root reference-corrections-page">
      <section className="reference-corrections-head">
        <div className="reference-corrections-title"><span><Wrench /></span><div><h1>Correzioni</h1><p>Risolvi i problemi SEO con correzioni guidate, verificabili e ripristinabili.</p></div></div>
        <div className="reference-corrections-head-actions"><button className="secondary" onClick={() => setShowAll((value) => !value)}>{showAll ? "Ultimo batch" : "Tutto lo storico"}</button></div>
      </section>

      <section className="reference-correction-tabs" aria-label="Filtra correzioni per stato">
        <button className={statusFilter === "all" ? "active" : ""} onClick={() => setStatusFilter("all")}>Tutte <span>{stats.total}</span></button>
        <button className={statusFilter === "pending" ? "active" : ""} onClick={() => setStatusFilter("pending")}>Da verificare <span>{stats.pending}</span></button>
        <button className={statusFilter === "verified" ? "active" : ""} onClick={() => setStatusFilter("verified")}>Verificate <span>{stats.verified}</span></button>
        <button className={statusFilter === "rolled" ? "active" : ""} onClick={() => setStatusFilter("rolled")}>Ripristinate <span>{stats.rolledBack}</span></button>
      </section>

      <section className="reference-correction-kpis">
        <article className="red"><AlertTriangle /><span><strong>{stats.pending}</strong><small>Da verificare</small><em>Scritture non ancora chiuse</em></span></article>
        <article className="green"><CheckCircle2 /><span><strong>{stats.verified}</strong><small>Correzioni verificate</small><em>Frontend e SEO confermati</em></span></article>
        <article className="blue"><History /><span><strong>{stats.total}</strong><small>Correzioni registrate</small><em>{showAll ? "Tutto lo storico" : "Ultimo batch"}</em></span></article>
        <article className="orange"><RotateCcw /><span><strong>{stats.rolledBack}</strong><small>Ripristinate</small><em>Rollback completati</em></span></article>
      </section>

      <div className="reference-corrections-layout">
        <main className="reference-corrections-main">
          {workflowContext && <section className="panel task-workflow-context"><strong>Avviato dalla task: {workflowContext.title}</strong><p>{workflowContext.sourceUrl || workflowContext.targetUrl || "Contesto task trasferito alla remediation."}</p></section>}
          <section className="reference-corrections-toolbar"><label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca problema o URL…" /></label><span>{filteredRows.length} risultati</span></section>
          {message && <p className="integration-result corrections-message">{message}</p>}
          <div className="corrections-list reference-corrections-list">
            {filteredRows.map((record) => {
              const open = expanded.has(record.id);
              const verified = isVerified(record);
              const pending = isPending(record);
              return (
                <article className={`panel correction-card ${open ? "open" : ""}`} data-correction-id={record.id} key={record.id}>
                  <button type="button" className="correction-summary" onClick={() => toggleExpanded(record.id)} aria-expanded={open}>
                    <span className={`correction-status ${statusClass(record.status)}`}>{verified ? <CheckCircle2 /> : pending ? <AlertTriangle /> : <RotateCcw />}{record.status}</span>
                    <span className="correction-summary-main"><strong>{record.issueLabel}</strong><small>{record.fields?.map(historyFieldLabel).join(", ") || "modifica WordPress"} · {new Date(record.appliedAt).toLocaleString("it-IT")}</small><small>{record.sourceUrl || "URL non disponibile"}</small></span>
                    <span className="correction-quick-state"><span className={record.writeConfirmed === false ? "wait" : "ok"}>WordPress</span><span className={record.frontendConfirmed ? "ok" : "wait"}>Frontend</span><span className={verified ? "ok" : "wait"}>SEO</span></span>
                    <ChevronDown className="correction-chevron" />
                  </button>
                  <div className="correction-summary-actions"><a href={record.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink />Apri pagina</a><button type="button" className="secondary mini" disabled={Boolean(verifying || rollingBack) || ["Ripristinato", "Bloccato"].includes(record.status)} onClick={() => reverify(record.id)}><RefreshCw />{verifying === record.id ? "Riverifica…" : "Riverifica"}</button><button type="button" className="secondary mini" onClick={() => toggleExpanded(record.id)}><Eye />{open ? "Nascondi" : "Prima / Dopo"}</button><button type="button" className="secondary mini correction-rollback" disabled={Boolean(rollingBack || verifying) || ["Ripristinato", "Bloccato"].includes(record.status)} onClick={() => rollback(record.id)}><RotateCcw />{rollingBack === record.id ? "Ripristino…" : "Ripristina"}</button></div>
                  <p className={`correction-verification-note ${verified ? "verified" : "pending"}`}>{(isRolledBack(record) ? record.rollbackNote : record.verificationNote) || "Modifica registrata."}</p>
                  {open && <div className="correction-details"><div className="correction-diff-grid"><section className="before"><strong>Prima</strong>{(record.fields || Object.keys(record.before || {})).map((field) => <div key={`before-${field}`}><small>{historyFieldLabel(field)}</small><p>{preview(historyText(field, record.before?.[field]),1200)}</p>{(field === "meta._elementor_data" || String(record.before?.[field] || "").length > 300) && <details><summary>Dati completi</summary><pre>{String(record.before?.[field] || "")}</pre></details>}</div>)}</section><section className="after"><strong>Dopo</strong>{(record.fields || Object.keys(record.after || {})).map((field) => <div key={`after-${field}`}><small>{historyFieldLabel(field)}</small><p>{preview(historyText(field, record.after?.[field]),1200)}</p>{(field === "meta._elementor_data" || String(record.after?.[field] || "").length > 300) && <details><summary>Dati completi</summary><pre>{String(record.after?.[field] || "")}</pre></details>}</div>)}</section></div><div className="correction-footer"><div><strong>{isRolledBack(record) ? "Versione precedente ripristinata" : record.status === "Bloccato" ? "Scrittura bloccata" : verified ? "Correzione confermata" : "Correzione non ancora chiudibile"}</strong><span>{isRolledBack(record) ? "Lo storico conserva la modifica annullata." : record.status === "Bloccato" ? record.verificationNote : verified ? "Il frontend e il controllo SEO hanno confermato il risultato." : "La scrittura WordPress da sola non basta: serve la verifica."}</span></div></div></div>}
                </article>
              );
            })}
            {!filteredRows.length && <section className="panel corrections-empty"><History /><h2>Nessuna correzione in questo filtro</h2><p>Cambia filtro oppure esegui una nuova remediation.</p></section>}
          </div>
        </main>

        <aside className="reference-corrections-aside">
          <section><h2>Stato correzioni</h2><div className="reference-correction-ring" style={{"--verified":`${verifiedDeg}deg`,"--pending":`${pendingDeg}deg`}}><span><strong>{stats.total}</strong><small>correzioni</small></span></div><ul><li><i className="green" />Verificate <strong>{stats.verified}</strong></li><li><i className="blue" />Da verificare <strong>{stats.pending}</strong></li><li><i className="orange" />Ripristinate <strong>{stats.rolledBack}</strong></li></ul></section>
          <section className="reference-correction-security"><ShieldCheck /><h2>Ripristino della versione precedente</h2><p>Il rollback viene eseguito solo dopo controllo stale-state.</p><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password applicativa WordPress" autoComplete="new-password" aria-label="Password applicativa WordPress del cliente selezionato" /><button className="secondary" disabled={!password}>Credenziale pronta</button></section>
          <section className="reference-correction-guide"><h2>Flusso verificato</h2><ol><li>Scrittura WordPress</li><li>Controllo frontend</li><li>Verifica SEO</li><li>Task chiudibile</li></ol></section>
        </aside>
      </div>
    </div>,
    mainTarget,
  ) : null;

  return <>{nav}{page}</>;
}
