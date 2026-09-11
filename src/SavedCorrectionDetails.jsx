import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { readCorrection } from "./remediationStore.js";
import { recheckCorrectionById } from "./remediationIntegrity";
import { historyFieldLabel, historyText } from "./correctionHistoryText.js";
import { canVerifyReceipt, correctionReceiptFields, receiptAfterLabel } from "./correctionReceipt.js";
import { safeHttpHref } from "./reliabilityModel.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { navigatePage } from "./navigationUx.js";
import { clearAutomaticProposalFocus } from "./AutomaticProposalNavigation.js";
import "./SavedCorrectionDetails.css";

const selectedClient = () => {
  try { return Number(JSON.parse(workspaceStorage.getItem("seogrow-selected-client-v1") || "0")); }
  catch { return 0; }
};
const dateLabel = (value) => Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString("it-IT") : "Non ancora eseguita";
const snapshotText = (field, value, available) => {
  if (!available) return "Dato non presente nello snapshot salvato";
  if (value === "") return "(vuoto)";
  if (value == null) return "(valore nullo)";
  return historyText(field, value);
};

export default function SavedCorrectionDetails({ correctionId, clientId, onNavigate }) {
  const scope = Number(clientId);
  const identity = `${scope}:${correctionId}`;
  const [snapshot, setSnapshot] = useState(null);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [passwordEntry, setPasswordEntry] = useState(null);
  const busyRef = useRef(false);
  const mounted = useRef(false);
  const revealed = useRef("");

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1);
    const events = ["seogrow-remediation-history", "seogrow-remediation-applied", "seogrow-storage-ok", "storage"];
    for (const name of events) window.addEventListener(name, refresh);
    return () => { for (const name of events) window.removeEventListener(name, refresh); };
  }, []);

  useEffect(() => {
    if (!correctionId || !Number.isSafeInteger(scope) || scope <= 0) return undefined;
    let cancelled = false;
    // The lightweight history index deliberately has no before/after values.
    // Read the authoritative record; never fabricate snapshots from live HTML.
    readCorrection(correctionId).then((record) => {
      if (cancelled) return;
      if (!record || Number(record.clientId) !== scope || selectedClient() !== scope) {
        setSnapshot({ identity, record: null, error: "Correzione non disponibile nel progetto selezionato." });
      } else setSnapshot({ identity, record, error: "" });
    }).catch((error) => {
      if (!cancelled) setSnapshot({ identity, record: null, error: error.message || "Archivio correzioni non leggibile." });
    });
    return () => { cancelled = true; };
  }, [correctionId, identity, scope, revision]);

  const record = snapshot?.identity === identity ? snapshot.record : null;
  const error = snapshot?.identity === identity ? snapshot.error : "";
  const currentScope = selectedClient() === scope;

  useEffect(() => {
    if (!record?.id || revealed.current === record.id || typeof document === "undefined") return undefined;
    revealed.current = record.id;
    const frame = window.requestAnimationFrame(() => {
      const node = document.querySelector('.automatic-proposal-page .saved-correction-details');
      if (node?.dataset.correctionId === record.id) node.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [record?.id]);

  const go = (page) => {
    if (onNavigate) return onNavigate(page);
    clearAutomaticProposalFocus();
    window.dispatchEvent(new CustomEvent("seogrow-automatic-proposal-close"));
    navigatePage(page);
  };

  const verify = async () => {
    if (!currentScope || !canVerifyReceipt(record) || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNotice({ identity, text: "Riverifica in corso. Il confronto salvato resta visibile." });
    try {
      let profiles = {};
      try { profiles = JSON.parse(workspaceStorage.getItem("seogrow-wordpress-profiles-v1") || "{}"); } catch { /* No credentials fallback across projects. */ }
      const profile = profiles?.[scope] || {};
      const result = await recheckCorrectionById(record.id, {
        clientId: scope,
        siteUrl: profile.url || record.siteUrl || "",
        username: profile.username || record.username || "",
        applicationPassword: passwordEntry?.identity === identity ? passwordEntry.value : "",
      });
      if (!mounted.current || selectedClient() !== scope) return;
      const text = result?.error
        ? `Riverifica non conclusa: ${result.error.message}. Nessuna nuova modifica applicata.`
        : result?.record?.verificationNote || (result?.needsAudit
          ? "Serve un nuovo audit SEO per confermare la risoluzione."
          : "Controllo completato. Leggi lo stato della verifica qui sotto.");
      setNotice({ identity, text });
      setRevision((value) => value + 1);
    } catch (failure) {
      if (mounted.current && selectedClient() === scope) setNotice({ identity, text: `Riverifica non conclusa: ${failure.message}` });
    } finally {
      busyRef.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  if (!currentScope) return <section className="saved-correction-details" role="alert">Seleziona il progetto della correzione per visualizzare il confronto.</section>;
  if (error) return <section className="saved-correction-details" role="alert"><h2>Prima / Dopo non leggibile</h2><p>{error}</p><button type="button" className="secondary" onClick={() => setRevision((value) => value + 1)}>Ricarica confronto</button></section>;
  if (!record) return <section className="saved-correction-details" role="status"><h2>Caricamento Prima / Dopo</h2><p>Lettura degli snapshot completi salvati per questa correzione…</p></section>;

  const fields = correctionReceiptFields(record);
  const href = safeHttpHref(record.sourceUrl);
  const observed = record.frontendSnapshot?.metaDescription ?? record.frontendSnapshot?.title;
  const message = notice?.identity === identity ? notice.text : "";
  return (
    <section className="saved-correction-details" data-correction-id={record.id} aria-label="Confronto salvato Prima / Dopo">
      <header className="saved-correction-head">
        <div><h2>Prima / Dopo — correzione salvata</h2><p>{record.issueLabel || "Correzione SEO"}</p></div>
        <strong className="saved-correction-status">{record.status || "Stato non disponibile"}</strong>
      </header>
      {href && <a className="saved-correction-url" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink /> {href}</a>}
      <p>Intervento registrato: {dateLabel(record.appliedAt || record.createdAt)}</p>
      {fields.length ? fields.map((field) => (
        <section className="saved-correction-field" key={field.field}>
          <h3>{historyFieldLabel(field.field)}</h3>
          <div className="saved-correction-diff">
            <section><h4>Prima — versione precedente</h4><pre>{snapshotText(field.field, field.before, field.beforeAvailable)}</pre></section>
            <section><h4>{receiptAfterLabel(record)}</h4><pre>{snapshotText(field.field, field.after, field.afterAvailable)}</pre></section>
          </div>
          {field.field === "meta._elementor_data" && <details><summary>Dati tecnici completi salvati</summary><div className="saved-correction-diff"><pre>{String(field.before ?? "Non disponibile")}</pre><pre>{String(field.after ?? "Non disponibile")}</pre></div></details>}
        </section>
      )) : <p role="alert">Questo record storico non contiene gli snapshot Prima/Dopo. SeoGrow non li ricostruisce dal sito attuale.</p>}
      <section className="saved-correction-verification" aria-label="Esito della verifica">
        <h3>Verifica del risultato</h3>
        <p><strong>Ultimo controllo:</strong> {dateLabel(record.lastVerificationAttemptAt || record.verifiedAt)}</p>
        <p>{record.verificationNote || "Il salvataggio non conferma da solo la risoluzione SEO. Premi Riverifica."}</p>
        {observed != null && <div><strong>Valore letto sul sito all’ultimo controllo</strong><pre>{String(observed)}</pre></div>}
        {record.resource === "taxonomy" && <label>Password applicativa WordPress per la verifica<input type="password" autoComplete="new-password" value={passwordEntry?.identity === identity ? passwordEntry.value : ""} onChange={(event) => setPasswordEntry({ identity, value: event.target.value })} /></label>}
        <div className="saved-correction-actions">
          <button type="button" className="primary" disabled={busy || !canVerifyReceipt(record)} onClick={verify}><RefreshCw />{busy ? "Riverifica in corso…" : "Riverifica"}</button>
          {href && <a className="secondary" href={href} target="_blank" rel="noopener noreferrer"><ExternalLink />Apri pagina attuale</a>}
          <button type="button" className="secondary" onClick={() => go("Audit SEO")}>Apri Audit SEO</button>
        </div>
        {!canVerifyReceipt(record) && <p>La scrittura è bloccata, incerta o ripristinata: non viene dichiarata risolta e non viene riapplicata automaticamente.</p>}
        {message && <p role="status">{message}</p>}
      </section>
      <p className="saved-correction-help">Prima e Dopo sono gli snapshot storici: restano consultabili dopo l’applicazione, la riverifica e la riapertura. Il link apre la pagina attuale, non una copia del passato. Per confermare l’assenza di duplicati serve anche un nuovo audit che confronti le pagine coinvolte.</p>
    </section>
  );
}
