import { notifyUser } from "./ui/dialogs.js";
import { shouldOpenAutomaticProposal, canOpenControlledLinkPreview, canOpenControlledReviewPreview, canOpenControlledContextPreview } from "./resolutionPath.js";
import { navigatePage } from "./navigationUx.js";
import { problemNavigationFocus } from "./problemNavigationFocus.js";
import { normalizeClientId } from "./reliabilityModel.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";

export const PROPOSAL_PAGE = "Proposta correzione";
export const PROPOSAL_ROUTE_PAGE = "Correzioni";
export const PROPOSAL_FOCUS_KEY = "seogrow-problem-proposal-v1";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
export const RESOLUTION_FOCUS_KEY = "seogrow-problem-resolution-v1";
export const AUTO_RESOLVE_INTENT_KEY = "seogrow-auto-resolve-intent-v1";
const VALID_OPEN_SOURCES = new Set(["automatic-badge", "problem-row", "problem-card", "audit-row", "project-problem"]);

const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; } catch { return "Panoramica"; }
};
const selectedClientId = () => {
  try { return normalizeClientId(JSON.parse(localStorage.getItem(SELECTED_CLIENT_KEY) || "null")); } catch { return null; }
};

export const proposalFocusFromProblemRow = (row, openedFrom = "problem-row") => {
  if (!row || !row.querySelector(".problem-correctability.automatic")) return null;
  const title = row.querySelector(".problem-main strong")?.textContent?.trim() || "";
  const sourceUrl = row.querySelector(".problem-main small:not(.problem-external-target)")?.textContent?.trim() || "";
  if (!title || !sourceUrl || sourceUrl === "URL non disponibile") return null;
  return { title, sourceUrl, clientId: selectedClientId(), correctability: "automatic", openedFrom: VALID_OPEN_SOURCES.has(openedFrom) ? openedFrom : "problem-row", createdAt: Date.now() };
};

export const readAutomaticProposalFocus = () => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const focus = JSON.parse(sessionStorage.getItem(PROPOSAL_FOCUS_KEY) || "null");
    if (!focus || !VALID_OPEN_SOURCES.has(focus.openedFrom) || !focus.title || !focus.sourceUrl) return null;
    if (normalizeClientId(focus.clientId) !== selectedClientId()) return null;
    return focus;
  } catch { return null; }
};

export const rememberAutomaticResolutionIntent = (focus) => {
  if (!focus || typeof sessionStorage === "undefined") return false;
  try { sessionStorage.setItem(AUTO_RESOLVE_INTENT_KEY, JSON.stringify({ ...focus, createdAt: Date.now() })); return true; } catch { return false; }
};
const readAutomaticResolutionIntent = () => {
  if (typeof sessionStorage === "undefined") return null;
  try { return JSON.parse(sessionStorage.getItem(AUTO_RESOLVE_INTENT_KEY) || "null"); } catch { return null; }
};
const clearAutomaticResolutionIntent = () => { try { sessionStorage.removeItem(AUTO_RESOLVE_INTENT_KEY); } catch { /* optional */ } };
export const clearAutomaticProposalFocus = () => { try { sessionStorage.removeItem(PROPOSAL_FOCUS_KEY); } catch { /* routing can continue read-only */ } };

export const openProblemResolution = (problem, clientId, openedFrom = "problem-card", {
  controlledPreview = false,
  controlledContextPreview = false,
  forceAutomatic = false,
} = {}) => {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
  const focus = problemNavigationFocus(problem, clientId, selectedClientId(), openedFrom);
  if (!focus || !VALID_OPEN_SOURCES.has(openedFrom)) return false;
  const controlledLink = controlledPreview === true && canOpenControlledLinkPreview(problem);
  const controlledReview = controlledPreview === true && canOpenControlledReviewPreview(problem);
  const controlledContext = controlledContextPreview === true && canOpenControlledContextPreview(problem);
  if (controlledLink) { focus.controlledPreview = true; focus.targetUrl = problem.targetUrls[0]; }
  if (controlledReview) focus.controlledReviewPreview = true;
  if (controlledContext) {
    focus.controlledPreview = true;
    focus.controlledContextPreview = true;
    focus.reviewOnly = problem.reviewOnly === true;
    if (problem.reviewOnly === true) focus.controlledReviewPreview = true;
  }
  const forcedAutomatic = forceAutomatic === true && problem?.correctability === "automatic";
  if (forcedAutomatic) focus.forcedAutomaticFlow = true;
  const automatic = shouldOpenAutomaticProposal(problem) || controlledLink || controlledReview || controlledContext || forcedAutomatic;
  try {
    if (!automatic) {
      const detail = { clientId: focus.clientId, issueKey: focus.issueKey, issueType: focus.issueType, problemIdentity: focus.identity, title: focus.title, sourceUrl: focus.sourceUrl, problemState: focus.problemState, interventionStateCode: focus.interventionState, correctability: focus.correctability, reviewOnly: focus.reviewOnly === true, ownershipBlocked: focus.ownershipBlocked === true, stale: focus.stale === true, targetUrls: focus.targetUrl ? [focus.targetUrl] : [], evidence: focus.evidence || [], detail: focus.detail || "" };
      sessionStorage.setItem("seogrow-agent-prefill-v1", JSON.stringify(detail));
      sessionStorage.setItem("seogrow-agent-autorun-v1", "1");
      navigatePage("SEO Agent");
      window.setTimeout(() => window.dispatchEvent(new CustomEvent("seogrow-agent-prefill", { detail })), 0);
      return true;
    }
    sessionStorage.removeItem(RESOLUTION_FOCUS_KEY);
    sessionStorage.setItem(PROPOSAL_FOCUS_KEY, JSON.stringify(focus));
  } catch {
    notifyUser("Impossibile conservare il problema selezionato. Abilita lo storage della sessione e riprova; nessuna modifica applicata.");
    return false;
  }
  navigatePage(PROPOSAL_ROUTE_PAGE);
  window.dispatchEvent(new CustomEvent("seogrow-automatic-proposal-open", { detail: focus }));
  return true;
};

export const openAutomaticProposal = (row, openedFrom = "problem-row") => {
  const focus = proposalFocusFromProblemRow(row, openedFrom);
  return focus ? openProblemResolution(focus, focus.clientId, openedFrom) : false;
};
const interceptAutomaticClick = (event) => {
  if (currentPage() !== "Problemi") return;
  const row = event.target.closest?.(".problem-row");
  if (!row || row.dataset.problemNavigation === "direct" || event.target.closest?.("a") || !row.querySelector(".problem-correctability.automatic")) return;
  const openedFrom = event.target.closest?.(".problem-correctability.automatic") ? "automatic-badge" : "problem-row";
  if (!openAutomaticProposal(row, openedFrom)) return;
  event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation?.();
};
const clearFocusOutsideProposalRoute = () => {
  if (currentPage() !== PROPOSAL_ROUTE_PAGE) {
    clearAutomaticProposalFocus();
    try { sessionStorage.removeItem(RESOLUTION_FOCUS_KEY); } catch { /* read-only */ }
  }
};
const resumeAutomaticResolutionAfterAudit = (event) => {
  if (!["seogrow-page-audit-history-v2", "seogrow-analyses-v2"].includes(event?.detail?.key)) return;
  const intent = readAutomaticResolutionIntent();
  if (!intent) return;
  if (Date.now() - Number(intent.createdAt || 0) > 30 * 60 * 1000 || normalizeClientId(intent.clientId) !== selectedClientId()) { clearAutomaticResolutionIntent(); return; }
  window.setTimeout(() => {
    const current = readAutomaticResolutionIntent();
    if (!current) return;
    clearAutomaticResolutionIntent();
    openProblemResolution({ ...current, correctability: "automatic", stale: false }, current.clientId, current.openedFrom || "problem-card", { forceAutomatic: true });
  }, 80);
};

if (typeof document !== "undefined") {
  document.addEventListener("click", interceptAutomaticClick, true);
  window.addEventListener("hashchange", clearFocusOutsideProposalRoute);
  window.addEventListener("seogrow-locationchange", clearFocusOutsideProposalRoute);
  window.addEventListener("seogrow-storage-ok", resumeAutomaticResolutionAfterAudit);
}
