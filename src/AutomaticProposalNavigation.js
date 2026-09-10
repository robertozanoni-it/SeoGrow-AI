import { navigatePage } from "./navigationUx.js";
import { normalizeClientId } from "./reliabilityModel.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";

export const PROPOSAL_PAGE = "Proposta correzione";
export const PROPOSAL_ROUTE_PAGE = "Correzioni";
export const PROPOSAL_FOCUS_KEY = "seogrow-problem-proposal-v1";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";
const MAX_FOCUS_AGE = 15 * 60_000;

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

export const proposalFocusFromProblemRow = (row) => {
  if (!row) return null;
  const title = row.querySelector(".problem-main strong")?.textContent?.trim() || "";
  const sourceUrl = row.querySelector(".problem-main small")?.textContent?.trim() || "";
  if (!title || !sourceUrl || sourceUrl === "URL non disponibile") return null;
  return {
    title,
    sourceUrl,
    clientId: selectedClientId(),
    correctability: "automatic",
    openedFrom: "automatic-badge",
    createdAt: Date.now(),
  };
};

export const readAutomaticProposalFocus = () => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const focus = JSON.parse(sessionStorage.getItem(PROPOSAL_FOCUS_KEY) || "null");
    if (!focus || focus.openedFrom !== "automatic-badge" || !focus.title || !focus.sourceUrl) return null;
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

export const openAutomaticProposal = (row) => {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
  const focus = proposalFocusFromProblemRow(row);
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
  const automatic = event.target.closest?.(".problem-correctability.automatic");
  if (!automatic) return;
  const row = automatic.closest(".problem-row");
  if (!row) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  openAutomaticProposal(row);
};

if (typeof document !== "undefined") {
  // Capture phase: intercetta "Automatica" prima del click legacy sulla riga.
  document.addEventListener("click", interceptAutomaticClick, true);
}
