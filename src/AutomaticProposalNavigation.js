import { navigatePage } from "./navigationUx.js";
import { normalizeClientId } from "./reliabilityModel.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";

export const PROPOSAL_PAGE = "Proposta correzione";
export const PROPOSAL_ROUTE_PAGE = "Correzioni";
export const PROPOSAL_FOCUS_KEY = "seogrow-problem-proposal-v1";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const MAX_FOCUS_AGE = 15 * 60_000;
const VALID_OPEN_SOURCES = new Set(["automatic-badge", "problem-row"]);

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
    if (Date.now() - Number(focus.createdAt || 0) > MAX_FOCUS_AGE) return null;
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

export const openAutomaticProposal = (row, openedFrom = "problem-row") => {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
  const focus = proposalFocusFromProblemRow(row, openedFrom);
  if (!focus) return false;
  sessionStorage.setItem(PROPOSAL_FOCUS_KEY, JSON.stringify(focus));
  navigatePage(PROPOSAL_ROUTE_PAGE);
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent("seogrow-automatic-proposal-open", { detail: focus }));
  }, 0);
  return true;
};

const interceptAutomaticClick = (event) => {
  if (currentPage() !== "Problemi") return;
  const row = event.target.closest?.(".problem-row");
  if (!row || !row.querySelector(".problem-correctability.automatic")) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  const openedFrom = event.target.closest?.(".problem-correctability.automatic") ? "automatic-badge" : "problem-row";
  openAutomaticProposal(row, openedFrom);
};

const clearFocusOutsideProposalRoute = () => {
  if (currentPage() !== PROPOSAL_ROUTE_PAGE && readAutomaticProposalFocus()) clearAutomaticProposalFocus();
};

if (typeof document !== "undefined") {
  // Capture phase: l'intera riga di un problema automatico apre direttamente
  // la proposta prima del drawer legacy. Manuali e non supportati restano nel dettaglio.
  document.addEventListener("click", interceptAutomaticClick, true);
  window.addEventListener("hashchange", clearFocusOutsideProposalRoute);
  window.addEventListener("seogrow-locationchange", clearFocusOutsideProposalRoute);
}
