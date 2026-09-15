import { confirmAction } from "./ui/dialogs.js";
import { readWorkspaceJson as readJson } from "./core/workspace/jsonStorage.js";
import { inspectWordPress, inspectFrontend, inspectLinkEvidence, buildPlan, preparationFailure, createWordPressCorrection, applyPreparedCorrection } from "./wordpressRemediationEngine.js";
import ManualRemediationProposal from "./ManualRemediationProposal.jsx";
import { readAutomaticProposalFocus } from "./AutomaticProposalNavigation.js";
import { selectFocusedRemediation, proposalSelectionKey, correctionIssueKeys } from "./remediationSelection.js";
import { verifiedForAudit } from "./remediationEvidence.js";
import { remediationIssueKind, remediationSourceUrl } from "./remediationIssueKind.js";
import { assertSeoPatchLengths, SEO_TEXT_LIMITS, seoFieldKind, seoCharacterCount } from "./seoTextPolicy.js";
import { correctionPresentation, readableCorrectionFields } from "./correctionPresentation.js";
import { AUTO_FIX_LIMIT, selectedAutoFixIssues } from "./autoFixPlan.js";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, CheckCircle2, Eye, ShieldCheck, Wrench } from "lucide-react";
import { apiFetch } from "./api";
import { brokenExternalTarget } from "./brokenLinkRemediation.js";
import {
  attachElementorImpactEvidence,
  inspectElementorCoverageAttestation,
  inspectElementorImpactEvidence,
} from "./elementorImpactClient";
import { buildElementorImpactCandidateUrls } from "./elementorImpactCandidates";
import { navigatePage } from "./navigationUx.js";
import { annotateExternalLinkDestinations } from "./ExternalLinkDestinationUx.js";
import { annotateBrokenLinkCleanupChoices } from "./BrokenLinkCleanupChoiceUx.js";
import { normalizeAnalysisHistory } from "./platform";
import { listCorrections, setLastBatch, stableIssueKey } from "./remediationStore";
import {
  assertNoPreviewConflicts,
  detectPreviewConflicts,
  previewIdentity,
} from "./remediationPlanSafety";
import { normalizeClientId, safeHttpHref } from "./reliabilityModel";

import "./WordPressLiveRemediationControl.css";
import "./WordPressLiveRemediationControlV2.css";

const CLIENTS_KEY = "seogrow-clients";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const PAGE_HISTORY_KEY = "seogrow-page-audit-history-v2";
const SITE_HISTORY_KEY = "seogrow-analyses-v2";


const resolveTarget = () => typeof document === "undefined" ? null : document.querySelector(".audit-unified-remediation");
const auditTimestamp = (entry) => entry?.item?.analyzedAt || entry?.item?.startedAt || "";

const candidates = (clientId) => {
  const pages = readJson(PAGE_HISTORY_KEY, {})[clientId] || [];
  const sites = normalizeAnalysisHistory(readJson(SITE_HISTORY_KEY, {})[clientId]);
  return [
    ...(Array.isArray(pages) ? pages.map((item) => ({ type: "page", item })) : []),
    ...sites.map((item) => ({ type: "site", item })),
  ].toSorted((a, b) => Date.parse(auditTimestamp(b) || 0) - Date.parse(auditTimestamp(a) || 0));
};

const selectAudit = (clientId, requested) => {
  const list = candidates(clientId);
  if (!requested) return list[0] || null;
  if (normalizeClientId(requested.clientId) !== normalizeClientId(clientId)) return null;
  if (!["page", "site"].includes(requested.auditType) || !requested.analyzedAt) return null;
  const matches = list.filter((entry) => entry.type === requested.auditType && String(auditTimestamp(entry)) === String(requested.analyzedAt));
  return matches.length === 1 ? matches[0] : null;
};

const issueUrl = remediationSourceUrl;
const issueText = (issue) => `${issue?.type || ""} ${issue?.label || ""} ${issue?.detail || ""}`.toLowerCase();
const classifyIssue = remediationIssueKind;

const readCredentials = (target) => {
  const root = target?.closest(".remediation-host")?.querySelector(".audit-unified-credentials");
  const inputs = [...(root?.querySelectorAll("input") || [])];
  return {
    url: inputs.find((input) => input.autocomplete === "url")?.value?.trim() || "",
    username: inputs.find((input) => input.autocomplete === "username")?.value?.trim() || "",
    applicationPassword: inputs.find((input) => input.type === "password")?.value || "",
  };
};

const previewText = (value) => JSON.stringify(value, null, 2) || "(anteprima non disponibile)";
const openAiConfigurationMissing = (item) => item?.status === "generation_error" && /openai.*non (?:è )?configurat|OPENAI_API_KEY/i.test(String(item?.reason || ""));
const h1OwnershipBlocked = (item) => item?.status === "ownership_error" && /h1/i.test(issueText(item?.issue));

export default function WordPressLiveRemediationControlV2({ batchPlan = null, onBusyChange } = {}) {
  const busyRef = useRef(false);
  const [target, setTarget] = useState(() => resolveTarget());
  const [running, setRunning] = useState(false);
  const [applyingId, setApplyingId] = useState("");
  const [results, setResults] = useState([]);
  const [message, setMessage] = useState("");
  const [requestedAudit, setRequestedAudit] = useState(batchPlan);

  useEffect(() => {
    let timer = 0;
    let disposed = false;
    const scan = () => {
      if (disposed) return;
      const next = resolveTarget();
      setTarget((current) => {
        if (current === next && (!current || current.isConnected)) return current;
        return next;
      });
      timer = window.setTimeout(scan, 100);
    };
    scan();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const open = (event) => {
      const detail = event?.detail || {};
      setRequestedAudit({
        clientId: normalizeClientId(detail.clientId),
        issueIndex: Number(detail.issueIndex || 0),
        auditType: detail.auditType || "page",
        analyzedAt: detail.analyzedAt || "",
      });
    };
    window.addEventListener("seogrow-remediation-open", open);
    return () => window.removeEventListener("seogrow-remediation-open", open);
  }, []);

  const previews = useMemo(() => results.filter((item) => item.status === "preview"), [results]);
  const conflicts = useMemo(() => detectPreviewConflicts(previews), [previews]);

  useEffect(() => {
    if (!target?.isConnected || !results.length) return undefined;
    const timer = window.setTimeout(() => {
      annotateExternalLinkDestinations();
      annotateBrokenLinkCleanupChoices();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [results, target]);

  if (!target) return null;

  const currentContext = async () => {
    const clients = readJson(CLIENTS_KEY, []);
    const clientId = normalizeClientId(readJson(SELECTED_CLIENT_KEY, null));
    const client = clients.find((item) => normalizeClientId(item?.id) === clientId) || null;
    const proposalMode = Boolean(target?.closest(".proposal-remediation-slot"));
    const focus = proposalMode ? readAutomaticProposalFocus() : null;
    const selection = proposalMode ? selectFocusedRemediation(candidates(clientId), focus, clientId, client) : null;
    const audit = proposalMode ? selection?.audit : client ? selectAudit(clientId, batchPlan || requestedAudit) : null;
    const issues = Array.isArray(audit?.item?.issues) ? audit.item.issues : [];
    const corrections = clientId ? await listCorrections({ clientId }) : [];
    if (clientId !== normalizeClientId(readJson(SELECTED_CLIENT_KEY, null)) || !target.isConnected ||
        (proposalMode && proposalSelectionKey(readAutomaticProposalFocus()) !== selection?.focusKey)) {
      throw new Error("Il progetto o il problema è cambiato: riapri la proposta corretta.");
    }
    const verifiedKeys = new Set(corrections.filter((record) => verifiedForAudit(record, auditTimestamp(audit))).flatMap(correctionIssueKeys));
    const permitted = proposalMode ? [issues[selection?.issueIndex]].filter(Boolean) : batchPlan ? selectedAutoFixIssues(batchPlan, batchPlan.indexes, { clientId, audit: audit?.item }) : issues;
    const uncertainKeys = new Set(corrections.filter(record => record.status === "Esito incerto").flatMap(correctionIssueKeys));
    const activeIssues = issues.filter((issue) => !verifiedKeys.has(stableIssueKey({
      issue,
      issueType: issue?.type || "audit",
      issueLabel: issue?.label || "",
      sourceUrl: issueUrl(issue, audit?.item, client),
    })));
    return { clientId, client, audit, issues, proposalMode, selection, uncertainKeys, activeIssues: activeIssues.filter(issue => permitted.includes(issue)) };
  };

  const prepare = async (all, explicitItem = null) => {
    if (busyRef.current) return;
    busyRef.current = true;
    onBusyChange?.(true);
    setRunning(true);
    try {
    const credentials = readCredentials(target);
    if (!credentials.url || !credentials.username || !credentials.applicationPassword) {
      setMessage("Connetti WordPress inserendo URL, utente e password applicativa prima di preparare le correzioni.");
      return;
    }
    const context = await currentContext();
    if (!context.client || !context.audit || !context.issues.length) {
      setMessage("Il progetto o l'audit richiesto non è disponibile. Seleziona esplicitamente il progetto e riapri l'audit.");
      return;
    }
    const issueKey = (issue, explicitUrl = "") => stableIssueKey({
      issue,
      issueType: issue?.type || "audit",
      issueLabel: issue?.label || "",
      sourceUrl: explicitUrl || issueUrl(issue, context.audit.item, context.client),
    });
    const domValue = target.closest(".remediation-host")?.querySelector(".audit-issue-select select")?.value;
    const domIndex = domValue === undefined ? -1 : Number(domValue);
    const requestedIndex = context.proposalMode ? context.selection.issueIndex : domIndex;
    let selected;
    if (explicitItem?.issue) {
      const wanted = issueKey(explicitItem.issue, explicitItem.targetUrl || "");
      selected = context.activeIssues.filter((issue) => issueKey(issue) === wanted).slice(0, 1);
    } else {
      selected = all ? context.activeIssues.slice(0, AUTO_FIX_LIMIT) : [context.issues[requestedIndex]].filter((issue) => issue && context.activeIssues.includes(issue));
    }
    if (!selected.length) {
      setResults([]);
      setMessage("Nessun problema attivo da preparare.");
      return;
    }

    if (selected.some(issue => context.uncertainKeys.has(issueKey(issue)))) {
      setResults([]);
      setMessage("Scrittura precedente con esito incerto. Controlla lo stato WordPress e lo storico prima di preparare o inviare una nuova modifica.");
      return;
    }
    setRunning(true);
    setResults([]);
    const next = [];
    for (let index = 0; index < selected.length; index += 1) {
      const currentIssue = selected[index];
      const targetUrl = issueUrl(currentIssue, context.audit.item, context.client);
      setMessage(`Esaminati ${index}/${selected.length} · in elaborazione: ${currentIssue?.label || "problema SEO"}…`);
      try {
        const assertCurrentSelection = () => {
          if (!target.isConnected || context.clientId !== normalizeClientId(readJson(SELECTED_CLIENT_KEY, null)) ||
              (context.proposalMode && proposalSelectionKey(readAutomaticProposalFocus()) !== context.selection.focusKey)) {
            throw new Error("Progetto o problema cambiato durante la preparazione: nessuna anteprima riutilizzabile.");
          }
        };
        assertCurrentSelection();
        const kind = classifyIssue(currentIssue);
        if (!kind) throw new Error("Questo problema non dispone ancora di un adapter WordPress applicabile.");
        const [inspected, frontendContext] = await Promise.all([
          inspectWordPress(targetUrl, credentials),
          inspectFrontend(targetUrl),
        ]);
        if (["content", "h1"].includes(kind)) {
          const candidateUrls = buildElementorImpactCandidateUrls({
            audit: context.audit.item,
            issue: currentIssue,
            client: context.client,
          });
          const impactEvidence = await inspectElementorImpactEvidence(inspected.entity, credentials, candidateUrls);
          if (impactEvidence) attachElementorImpactEvidence(inspected.entity, impactEvidence);
        }
        assertCurrentSelection();
        const plan = await buildPlan(kind, currentIssue, inspected, targetUrl, frontendContext, {
          contentWidgetId: String(explicitItem?.contentWidgetId || ""),
          manualValue: explicitItem?.manualValue,
          linkEvidence: kind === "external_link" ? await inspectLinkEvidence(targetUrl, brokenExternalTarget(currentIssue)) : undefined,
        });
        assertCurrentSelection();
        if (plan.changes) assertSeoPatchLengths(plan.changes);
        const contextSnapshot = {
          clientId: context.clientId,
          clientName: context.client?.name || "",
          siteUrl: credentials.url,
          auditType: context.audit.type,
          analyzedAt: auditTimestamp(context.audit),
          focusKey: context.selection?.focusKey || "",
          auditFingerprint: JSON.stringify(context.audit.item),
        };
        const identity = previewIdentity({ issue: currentIssue, inspected, targetUrl, frontend: frontendContext });
        if (plan.alreadyResolved) {
          next.push({ status: "resolved", issue: currentIssue, targetUrl, reason: plan.reason, linkResolution: plan.linkResolution, contextSnapshot, inspected, frontendContext, ...identity });
          setResults([...next]);
          continue;
        }
        const response = await apiFetch("/api/wordpress/live-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            siteUrl: credentials.url,
            targetUrl,
            username: credentials.username,
            applicationPassword: credentials.applicationPassword,
            resource: inspected.resource,
            id: inspected.entity.id,
            changes: plan.changes,
            issue: currentIssue,
            adapter: plan.adapter,
          }),
        });
        const data = await response.json();
        if (!response.ok) {
          const error = new Error(data.error || "Anteprima WordPress non riuscita.");
          error.code = data.code || "PREVIEW_FAILED";
          throw error;
        }
        assertCurrentSelection();
        next.push({ status: "preview", issue: currentIssue, targetUrl, plan, data, contextSnapshot, inspected, frontendContext, ...identity });
      } catch (error) {
        next.push({ ...preparationFailure(error), issue: currentIssue, targetUrl, quality: error?.quality || null, candidate: error?.candidate || "", manualOriginal: error?.manualOriginal || "", manualValue: explicitItem?.manualValue, contentWidgetId: error?.contentWidgetId || explicitItem?.contentWidgetId || "" });
      }
      setResults([...next]);
    }

    const ready = next.filter((item) => item.status === "preview").length;
    const resolved = next.filter((item) => item.status === "resolved").length;
    const blocked = next.length - ready - resolved;
    const foundConflicts = detectPreviewConflicts(next);
    setMessage(
      `Esaminati ${next.length}/${selected.length} · pronti ${ready} · già risolti ${resolved} · bloccati ${blocked} · conflitti ${foundConflicts.length}. ${ready > 1 ? "Le anteprime si applicano una alla volta per sicurezza." : "Nessuna modifica live è stata ancora eseguita."}`,
    );
    } catch (error) {
      setResults([]); setMessage(error.message || "Preparazione non riuscita.");
    } finally { busyRef.current = false; onBusyChange?.(false); setRunning(false); }
  };

  const verifyH1Coverage = async (item) => {
    if (!h1OwnershipBlocked(item) || busyRef.current) return;
    busyRef.current = true;
    onBusyChange?.(true);
    setRunning(true);
    let rerun = false;
    try {
      const credentials = readCredentials(target);
      if (!credentials.url || !credentials.username || !credentials.applicationPassword) {
        setMessage("Collega WordPress prima di verificare l'origine degli H1.");
        return;
      }
      setMessage("Verifica origine H1: controllo sitemap, pagine pubbliche e inventario WordPress in sola lettura…");
      const diagnostic = await inspectElementorCoverageAttestation(credentials, { force: true });
      if (diagnostic?.verified !== true) {
        const reason = diagnostic?.error || diagnostic?.reconciliation?.reason || "Coverage completa non attestabile.";
        setResults((current) => current.map((entry) => entry === item ? {
          ...entry,
          status: "ownership_error",
          reason: `Verifica origine H1 non completata: ${reason}`,
        } : entry));
        setMessage(`Origine H1 non ancora verificabile: ${reason} Nessuna modifica è stata eseguita.`);
        return;
      }
      setMessage(`Coverage completa verificata su ${diagnostic.candidateUrls.length} URL. SeoGrow può ora riesaminare l'ownership H1 e preparare la proposta se il campo è sicuro.`);
      rerun = true;
    } catch (error) {
      setMessage(`Verifica origine H1 non completata: ${error.message || error}`);
    } finally {
      busyRef.current = false;
      onBusyChange?.(false);
      setRunning(false);
    }
    if (rerun) await prepare(false, item);
  };

  const applyOne = async (item) => {
    if (!item || item.status !== "preview" || busyRef.current) return;
    busyRef.current = true;
    onBusyChange?.(true);
    try {
    const credentials = readCredentials(target);
    if (!credentials.username || !credentials.applicationPassword) {
      setMessage("La password applicativa non è disponibile. Reinseriscila prima dell'approvazione.");
      return;
    }
    try {
      assertNoPreviewConflicts(previews);
      assertSeoPatchLengths(item.plan?.changes || {});
    } catch (error) {
      setMessage(error.message);
      return;
    }
    let liveContext;
    try { liveContext = await currentContext(); }
    catch (error) { setResults([]); setMessage(error.message); return; }
    const stale = normalizeClientId(item.contextSnapshot?.clientId) !== liveContext.clientId ||
      item.contextSnapshot?.auditType !== liveContext.audit?.type ||
      String(item.contextSnapshot?.analyzedAt || "") !== String(auditTimestamp(liveContext.audit) || "") ||
      (item.contextSnapshot?.focusKey || "") !== (liveContext.selection?.focusKey || "") ||
      item.contextSnapshot?.auditFingerprint !== JSON.stringify(liveContext.audit?.item);
    if (stale) {
      setResults((current) => current.map((entry) => entry === item ? { ...entry, status: "stale", reason: "Audit o progetto cambiati dopo l'anteprima." } : entry));
      setMessage("Progetto o audit sono cambiati dopo la preparazione. L'anteprima selezionata è stata invalidata.");
      return;
    }
    if (!confirmAction(`Applicare ORA questa singola modifica al sito WordPress live?\n\nProblema: ${item.issue?.label || "SEO"}\nCampo/i: ${(item.data.changed || []).join(", ")}\nRisorsa WordPress: ${item.inspected?.resource || "contenuto"} #${item.inspected?.entity?.id || "?"}\n\nIl payload completo è visibile nell'anteprima.`)) return;

    const batchId = `live-remediation-${Date.now()}`;
    setLastBatch(batchId);
    setApplyingId(item.data.approvalToken);
    setMessage(`Applicazione live: ${item.issue?.label || "problema SEO"}…`);
    try {
      const pendingRecord = createWordPressCorrection(item, credentials, batchId);
      const record = await applyPreparedCorrection(pendingRecord, item.data, credentials);
      window.dispatchEvent(new CustomEvent("seogrow-remediation-applied", { detail: { id: record.id, batchId } }));
      setResults((current) => current.map((entry) => entry === item ? { ...entry, status: "applied", data: { ...entry.data, apply: record } } : entry));
      setMessage("Modifica applicata e registrata. Stato: Da verificare. Usa la riverifica specifica e, quando richiesto, un nuovo audit prima di considerare il problema risolto.");
    } catch (error) {
      setResults((current) => current.map((entry) => entry === item ? { ...entry, status: "error", reason: error.message } : entry));
      setMessage(`Applicazione non completata: ${error.message}`);
    } finally {
      setApplyingId("");
    }
    } finally { busyRef.current = false; onBusyChange?.(false); }
  };

  return createPortal(
    <section className="wp-live-remediation panel wp-live-remediation-v2" aria-label="Remediation WordPress live con approvazione selettiva">
      <div className="wp-live-remediation-head">
        <div>
          <span><ShieldCheck /> Modalità live controllata</span>
          <h3>{batchPlan ? "4. Prepara e approva le proposte" : "2. Prepara e approva le proposte"}</h3>
          <p><strong>Cosa fare:</strong> premi il pulsante qui sotto per leggere il sito e preparare le proposte. Questa operazione non modifica WordPress. Poi segui le istruzioni nella scheda di ciascun problema.</p>
        </div>
      </div>

      <div className="wp-live-remediation-actions">
        <button data-seogrow-live="1" type="button" className="primary" disabled={running || Boolean(applyingId)} onClick={() => prepare(true)}><Eye />{running ? "Esame in corso…" : batchPlan ? "Prepara le anteprime selezionate" : "Prepara le anteprime dei problemi attivi"}</button>
        <button data-seogrow-live="1" type="button" className="secondary" disabled={running || Boolean(applyingId)} onClick={() => prepare(false)}><Wrench />Prepara solo questo problema</button>
      </div>

      {conflicts.length > 0 && <div className="wp-live-conflict" role="alert"><AlertTriangle /><div><strong>{conflicts.length} conflitti tra anteprime</strong><p>Due proposte cambiano diversamente lo stesso campo della stessa risorsa. Rigenera o scegli una sola proposta prima di approvare.</p></div></div>}

      {results.length > 0 && <div className="wp-live-preview-list">
        {results.map((item, index) => <article key={`${item.issue?.label || "issue"}-${item.resourceIdentity || index}`} className={`wp-live-preview-row ${item.status}`} data-broken-target={brokenExternalTarget(item.issue)} data-link-resolution={item.linkResolution || ""}>
          <div className="wp-live-preview-title">
            {item.status === "applied" || item.status === "resolved" ? <CheckCircle2 /> : <AlertTriangle />}
            <div>
              <strong>{item.issue?.label || "Problema SEO"}</strong>
              {item.targetUrl && <small>{item.targetUrl}</small>}

            </div>
          </div>
          <div className="correction-explanation"><h4>{correctionPresentation(item).title}</h4><p>{correctionPresentation(item).explanation}</p><p><strong>Prossimo passo:</strong> {correctionPresentation(item).next}</p>{item.reason && <details><summary>Dettaglio tecnico del controllo</summary><p>{item.reason}</p></details>}</div>
          {["generation_error", "quality_error", "timeout_error"].includes(item.status) && ["title", "meta_description", "content", "excerpt"].includes(classifyIssue(item.issue)) && <ManualRemediationProposal item={item} kind={classifyIssue(item.issue)} disabled={running || Boolean(applyingId)} onPrepare={(manualValue) => prepare(false, { ...item, manualValue })} />}
          {item.status === "resolved" && <div className="wp-live-guidance-actions"><button type="button" className="secondary" disabled={running || Boolean(applyingId)} onClick={() => prepare(false, item)}>Ricontrolla questo problema</button><button type="button" className="secondary" onClick={() => navigatePage("Audit SEO")}>Aggiorna audit</button><button type="button" className="secondary" onClick={() => navigatePage("Correzioni")}>Verifica nello storico</button></div>}
          {item.status === "selection_required" && <section className="content-widget-picker" aria-label="Seleziona il blocco Elementor da ampliare">
            <h4>Scegli il blocco da ampliare</h4>
            <p>SeoGrow ha verificato più blocchi testuali locali nel frontend. Scegli esplicitamente quello corretto: nessuna modifica viene preparata finché non fai questa scelta.</p>
            <div className="content-widget-picker-grid">
              {(item.contentCandidates || []).map((candidate, candidateIndex) => <article className="content-widget-choice" key={candidate.id}>
                <div><strong>Blocco {candidateIndex + 1}</strong><span>{candidate.words} parole · widget #{candidate.id}</span></div>
                <p>{candidate.preview || "Anteprima testuale non disponibile."}</p>
                <button type="button" className="secondary" disabled={running || Boolean(applyingId)} onClick={() => prepare(false, { ...item, contentWidgetId: candidate.id })}><Wrench />Amplia questo blocco</button>
              </article>)}
            </div>
          </section>}
          {(h1OwnershipBlocked(item) || openAiConfigurationMissing(item)) && <div className="wp-live-guidance-actions">
            {h1OwnershipBlocked(item) && <button data-seogrow-live="1" type="button" className="primary" disabled={running || Boolean(applyingId)} onClick={() => verifyH1Coverage(item)}><Eye />{running ? "Verifica in corso…" : "Verifica origine H1"}</button>}
            {openAiConfigurationMissing(item) && <button type="button" className="primary" onClick={() => navigatePage("Integrazioni")}><Wrench />Configura OpenAI</button>}
          </div>}
          {item.status.endsWith('_error') && safeHttpHref(item.targetUrl) && <a className="secondary" href={safeHttpHref(item.targetUrl)} target="_blank" rel="noreferrer">Apri pagina da verificare</a>}
          {item.status === "preview" && <>
            <ol className="workflow-instructions"><li>Confronta “Adesso sul sito” con “Dopo la modifica”.</li><li>Se il risultato è corretto, premi “Applica questa modifica sul sito” e conferma. Verrà applicata solo questa proposta.</li><li>Apri Cronologia e ripristino per verificare il risultato.</li></ol>
            {item.plan?.contentWidget && <section className="content-widget-selected"><strong>Blocco Elementor selezionato:</strong> widget #{item.plan.contentWidget.id} · {item.plan.contentWidget.beforeWords} parole</section>}
            {item.plan?.linkCleanup ? <section className="correction-readable"><h4>Collegamento esterno 404</h4><p><strong>Testo mantenuto:</strong> {item.plan.linkCleanup.anchorText || "testo del collegamento"}</p><div className="wp-live-diff"><section><strong>Adesso sul sito</strong><pre>{item.plan.linkCleanup.targetUrl}</pre></section><section><strong>Dopo la modifica</strong><pre>Collegamento rimosso; il testo resta visibile.</pre></section></div></section> : readableCorrectionFields(item).map(field => <section className="correction-readable" key={field.field}><h4>{field.label}</h4>{seoFieldKind(field.field) && <p className="seo-character-counter">Dopo la modifica: <strong>{seoCharacterCount(field.after)} / {SEO_TEXT_LIMITS[seoFieldKind(field.field)]} caratteri</strong> · spazi e punteggiatura inclusi</p>}<div className="wp-live-diff"><section><strong>Adesso sul sito</strong><pre>{field.before}</pre></section><section><strong>Dopo la modifica</strong><pre>{field.after}</pre></section></div></section>)}
            <details><summary>Dettagli tecnici della modifica</summary><div className="wp-live-diff"><section><strong>Prima</strong><pre>{previewText(item.data.previewBefore)}</pre></section><section><strong>Dopo</strong><pre>{previewText(item.data.previewAfter)}</pre></section></div></details>
            <button data-seogrow-live="1" type="button" className="danger wp-live-apply-one" disabled={Boolean(applyingId) || conflicts.length > 0} onClick={() => applyOne(item)}><ShieldCheck />{applyingId === item.data.approvalToken ? "Applicazione…" : "Applica questa modifica sul sito"}</button>
          </>}
        </article>)}
      </div>}

      {message && <p className="integration-result wp-live-remediation-message" role="status">{message}</p>}
    </section>,
    target,
  );
}
