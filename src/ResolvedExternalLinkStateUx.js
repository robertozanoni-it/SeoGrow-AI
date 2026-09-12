import {
  STALE_MESSAGE,
  normalizeSharedConnectorRouteError,
} from "./ResolvedExternalLinkStateModel.js";
import "./ResolvedExternalLinkStateUx.css";

let frame = 0;

const staleBadge = (card) => {
  let badge = card.querySelector(".wp-live-link-resolved-stale");
  if (badge) return badge;
  badge = document.createElement("p");
  badge.className = "wp-live-link-resolved-stale";
  badge.setAttribute("role", "status");
  const evidence = card.querySelector(".wp-live-link-evidence");
  if (evidence) evidence.appendChild(badge);
  else card.appendChild(badge);
  return badge;
};

const markResolvedStale = (card, status) => {
  const changed = card.dataset.externalLinkState !== "resolved-stale";
  card.dataset.externalLinkState = "resolved-stale";
  card.dataset.remediationState = "resolved-stale";
  card.classList.add("external-link-resolved-stale");
  if (status.textContent !== STALE_MESSAGE) status.textContent = STALE_MESSAGE;
  const badge = staleBadge(card), message = "✓ Link già assente dalle sorgenti verificate: nessuna modifica verrà proposta o applicata.";
  if (badge.textContent !== message) badge.textContent = message;
  card.querySelector(".seogrow-shared-link-remediation")?.remove();
  for (const button of card.querySelectorAll(".wp-live-link-evidence-actions button")) {
    if (/riprova correzione/i.test(button.textContent || "")) button.hidden = true;
  }
  if (changed) window.dispatchEvent(new CustomEvent("seogrow-external-link-state", { detail: { state: "resolved-stale" } }));
};

const clearResolvedStale = (card) => {
  if (card.dataset.externalLinkState !== "resolved-stale") return;
  delete card.dataset.externalLinkState;
  delete card.dataset.remediationState;
  card.classList.remove("external-link-resolved-stale");
  card.querySelector(".wp-live-link-resolved-stale")?.remove();
  for (const button of card.querySelectorAll(".wp-live-link-evidence-actions button")) {
    if (/riprova correzione/i.test(button.textContent || "")) button.hidden = false;
  }
  window.dispatchEvent(new CustomEvent("seogrow-external-link-state", { detail: { state: "active" } }));
};

export function reconcileResolvedExternalLinkStates() {
  if (typeof document === "undefined") return 0;
  let changed = 0;
  for (const card of document.querySelectorAll(".wp-live-preview-row")) {
    const block = card.querySelector(".wp-live-link-evidence");
    const status = block?.querySelector(".wp-live-link-evidence-status");
    if (!block || !status) continue;
    const state = card.dataset.linkResolution === "absent-confirmed" ? "resolved-stale" : "active";
    if (state === "resolved-stale") {
      const was = card.dataset.externalLinkState;
      markResolvedStale(card, status);
      if (was !== "resolved-stale") changed += 1;
    } else if (state === "active" && card.dataset.externalLinkState === "resolved-stale") {
      clearResolvedStale(card);
      changed += 1;
    }
  }

  for (const status of document.querySelectorAll(".seogrow-shared-link-status[data-kind='error']")) {
    const replacement = normalizeSharedConnectorRouteError(status.textContent);
    if (!replacement || status.dataset.connectorRouteExplained === "1") continue;
    status.textContent = `Correzione automatica bloccata: ${replacement}`;
    status.dataset.connectorRouteExplained = "1";
    changed += 1;
  }
  return changed;
}

const schedule = () => {
  if (typeof window === "undefined" || frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    reconcileResolvedExternalLinkStates();
  });
};

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowResolvedExternalLinkStateUxInstalled) {
  window.__seogrowResolvedExternalLinkStateUxInstalled = true;
  const observer = new MutationObserver(schedule);
  const start = () => {
    observer.observe(document.getElementById("root") || document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-loaded", "data-kind"] });
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  for (const eventName of ["hashchange", "seogrow-locationchange", "seogrow-storage-ok", "seogrow-external-link-state"]) window.addEventListener(eventName, schedule);
}
