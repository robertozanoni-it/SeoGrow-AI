import { navigatePage } from "./navigationUx.js";
import { normalizeClientId } from "./reliabilityModel.js";
import { workspaceStorage as localStorage } from "./workspaceDatabase.js";

export const PROPOSAL_PAGE = "Proposta correzione";
export const PROPOSAL_FOCUS_KEY = "seogrow-problem-proposal-v1";
const SELECTED_CLIENT_KEY = "seogrow-selected-client-v1";

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

export const openAutomaticProposal = (row) => {
  if (typeof window === "undefined" || typeof sessionStorage === "undefined") return false;
  const focus = proposalFocusFromProblemRow(row);
  if (!focus) return false;
  sessionStorage.setItem(PROPOSAL_FOCUS_KEY, JSON.stringify(focus));
  navigatePage(PROPOSAL_PAGE);
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
  // Capture phase: this runs before the legacy row handler can open the drawer.
  document.addEventListener("click", interceptAutomaticClick, true);
}
