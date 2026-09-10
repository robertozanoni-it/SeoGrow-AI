import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, MapPin } from "lucide-react";
import {
  WIZARD_CONTEXT_KEY,
  wizardStepAction,
} from "./WizardStepNavigation.js";
import "./WizardCongruenceLayer.css";

const pageFromHash = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

const readContext = () => {
  try {
    const value = JSON.parse(window.sessionStorage.getItem(WIZARD_CONTEXT_KEY));
    if (!value || typeof value !== "object") return null;
    if (!value.destinationPage || !value.label) return null;
    if (Date.now() - Number(value.createdAt || 0) > 15 * 60_000) return null;
    return value;
  } catch {
    return null;
  }
};

const clearContext = () => {
  try {
    window.sessionStorage.removeItem(WIZARD_CONTEXT_KEY);
  } catch {
    /* Nessun impatto sul routing. */
  }
};

const decorateCards = (page) => {
  const cards = [...document.querySelectorAll(".guided-step-card")];
  if (!cards.length) return false;

  cards.forEach((card, index) => {
    const destination = wizardStepAction(page, index).page;
    const copy = card.querySelector(".guided-step-copy");
    const action = card.querySelector(".guided-step-action");

    card.dataset.destinationPage = destination;
    if (copy) copy.dataset.destinationPage = destination;
    card.setAttribute("title", `Apri la pagina ${destination}`);

    if (action) {
      const textNode = [...action.childNodes].find((node) => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.nodeValue = `Apri ${destination} `;
      else action.insertBefore(document.createTextNode(`Apri ${destination} `), action.firstChild);
    }
  });

  const active = document.querySelector(".guided-step-card.active");
  const footerText = document.querySelector(".guided-wizard-footer > span");
  if (active && footerText) {
    const cardsInWizard = [...active.parentElement.querySelectorAll(".guided-step-card")];
    const index = cardsInWizard.indexOf(active);
    const destination = wizardStepAction(page, index).page;
    const label = active.querySelector(".guided-step-copy strong")?.textContent?.trim() || `Passaggio ${index + 1}`;
    const detail = active.querySelector(".guided-step-copy small")?.textContent?.trim() || "";
    footerText.innerHTML = `<strong>${label}</strong> · ${detail} <b class="guided-footer-destination">→ Pagina: ${destination}</b>`;
  }
  return true;
};

export default function WizardCongruenceLayer() {
  const [page, setPage] = useState(pageFromHash);
  const [context, setContext] = useState(() => {
    const initial = readContext();
    return initial?.destinationPage === pageFromHash() ? initial : null;
  });
  const [host, setHost] = useState(null);

  useEffect(() => {
    const refresh = () => {
      const nextPage = pageFromHash();
      const nextContext = readContext();
      setPage(nextPage);
      if (nextContext?.destinationPage === nextPage) {
        setContext(nextContext);
      } else {
        if (nextContext && nextContext.destinationPage !== nextPage) clearContext();
        setContext(null);
      }
    };

    window.addEventListener("hashchange", refresh);
    window.addEventListener("popstate", refresh);
    window.addEventListener("seogrow-locationchange", refresh);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let attempts = 0;

    const run = () => {
      if (cancelled) return;
      const done = decorateCards(page);
      if (!done && attempts < 60) {
        attempts += 1;
        frame = window.requestAnimationFrame(run);
      }
    };

    frame = window.requestAnimationFrame(run);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [page, context]);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let attempts = 0;
    let mountedHost = null;

    if (!context) {
      setHost(null);
      delete document.body.dataset.seogrowWizardContext;
      delete document.body.dataset.seogrowWizardDestination;
      return undefined;
    }

    document.body.dataset.seogrowWizardContext = "true";
    document.body.dataset.seogrowWizardDestination = String(context.destinationPage || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const install = () => {
      if (cancelled) return;
      const main = document.querySelector(".app main");
      const title = main?.querySelector(".page-title");
      if (!main || !title) {
        if (attempts < 60) {
          attempts += 1;
          frame = window.requestAnimationFrame(install);
        }
        return;
      }

      mountedHost = document.createElement("div");
      mountedHost.className = "wizard-context-host";
      title.insertAdjacentElement("afterend", mountedHost);
      setHost(mountedHost);
    };

    frame = window.requestAnimationFrame(install);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
      mountedHost?.remove();
      setHost(null);
      delete document.body.dataset.seogrowWizardContext;
      delete document.body.dataset.seogrowWizardDestination;
    };
  }, [context]);

  if (!host || !context) return null;

  return createPortal(
    <section className="wizard-destination-context" aria-label="Contesto del passaggio selezionato">
      <div className="wizard-context-step">
        <span>{context.stepNumber}</span>
        <small>Step scelto da {context.sourcePage}</small>
      </div>
      <div className="wizard-context-copy">
        <small>Stai eseguendo</small>
        <h2>{context.label}</h2>
        <p>{context.detail}</p>
      </div>
      <div className="wizard-context-destination">
        <MapPin />
        <span><small>Pagina aperta</small><strong>{context.destinationPage}</strong></span>
        <ChevronRight />
      </div>
      <button
        type="button"
        className="wizard-context-close"
        onClick={() => {
          clearContext();
          setContext(null);
        }}
      >
        Chiudi indicazione
      </button>
    </section>,
    host,
  );
}
