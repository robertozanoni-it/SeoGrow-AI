import { navigatePage } from "./navigationUx.js";
import { problemNavigationFocus } from "./problemNavigationFocus.js";
import { normalizeClientId } from "./reliabilityModel.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";

export const PROPOSAL_PAGE = "Proposta correzione";
export const PROPOSAL_ROUTE_PAGE = "Correzioni";
export const PROPOSAL_FOCUS_KEY = "seogrow-problem-proposal-v1";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
export const RESOLUTION_FOCUS_KEY = "seogrow-problem-resolution-v1";
const VALID_OPEN_SOURCES = new Set(["automatic-badge", "problem-row", "problem-card", "audit-row", "project-problem"]);

const currentPage = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

const selectedClientId = () => {
  try {
    return normalizeClientId(JSON.parse(localStorage.getItem(SELECTED_CLIENT_KEY) || "null"));
  } catch {
    return null;
  }
};

export const proposalFocusFromProblemRow = (row, openedFrom = "problem-row") => {
  if (!row || !row.querySelector(".problem-correctability.automatic")) return null;
  const title = row.querySelector(".problem-main strong")?.textContent?.trim() || "";
  const sourceUrl = row.querySelector(".problem-main small:not(.problem-external-target)")?.textContent?.trim() || "";
  if (!title || !sourceUrl || sourceUrl === "URL non disponibile") return null;
  return {
    title,
    sourceUrl,
    clientId: selectedClientId(),
    correctability: "automatic",
    openedFrom: VALID_OPEN_SOURCES.has(openedFrom) ? openedFrom : "problem-row",
    createdAt: Date.now(),
  };
};

export const readAutomaticProposalFocus = () => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const focus = JSON.parse(sessionStorage.getItem(PROPOSAL_FOCUS_KEY) || "null");
    if (!focus || !VALID_OPEN_SOURCES.has(focus.openedFrom) || !focus.title || !focus.sourceUrl) return null;
    // Keep the comparison accessible for the entire browser session. Preview
    // expiry and stale-state checks are enforced separately before every write.
    if (normalizeClientId(focus.clientId) !== selectedClientId()) return null;
    return focus;
  } catch {
    return null;
  }
};

export const clearAutomaticProposalFocus = () => {
  try {
    sessionStorage.removeItem(PROPOSAL_FOCUS_KEY);
  } catch {
    /* Il routing continua a funzionare anche senza sessionStorage. */
  }
};

export const openProblemResolution = (problem, clientId, openedFrom = "problem-card") => {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
  const focus = problemNavigationFocus(problem, clientId, selectedClientId(), openedFrom);
  if (!focus || !VALID_OPEN_SOURCES.has(openedFrom)) return false;
  const automatic = focus.correctability === "automatic";
  try {
    sessionStorage.removeItem(automatic ? RESOLUTION_FOCUS_KEY : PROPOSAL_FOCUS_KEY);
    sessionStorage.setItem(automatic ? PROPOSAL_FOCUS_KEY : RESOLUTION_FOCUS_KEY, JSON.stringify(focus));
  } catch {
    window.alert("Impossibile conservare il problema selezionato. Abilita lo storage della sessione e riprova; nessuna modifica applicata.");
    return false;
  }
  navigatePage(PROPOSAL_ROUTE_PAGE);
  window.dispatchEvent(new CustomEvent(automatic ? "seogrow-automatic-proposal-open" : "seogrow-problem-resolution-open", { detail: focus }));
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
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
};

const clearFocusOutsideProposalRoute = () => {
  if (currentPage() !== PROPOSAL_ROUTE_PAGE) {
    clearAutomaticProposalFocus();
    try { sessionStorage.removeItem(RESOLUTION_FOCUS_KEY); } catch { /* Read-only navigation still works. */ }
  }
};

if (typeof document !== "undefined") {
  // Capture phase: l'intera riga di un problema automatico apre direttamente
  // la proposta prima del drawer legacy. Manuali e non supportati restano nel dettaglio.
  document.addEventListener("click", interceptAutomaticClick, true);
  window.addEventListener("hashchange", clearFocusOutsideProposalRoute);
  window.addEventListener("seogrow-locationchange", clearFocusOutsideProposalRoute);
}
