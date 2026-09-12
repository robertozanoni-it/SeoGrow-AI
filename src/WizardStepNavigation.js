import { navigatePage } from "./navigationUx.js";

export const WIZARD_CONTEXT_KEY = "seogrow-wizard-context-v1";

export const WIZARD_STEP_COUNTS = Object.freeze({
  Panoramica: 5,
  Clienti: 4,
  "Centro progetto": 6,
  Problemi: 4,
  "Audit SEO": 5,
  Posizionamenti: 4,
  "Link interni": 4,
  Opportunità: 4,
  Correzioni: 5,
  Task: 5,
  "Piano editoriale": 5,
  "SEO Agent": 5,
  "GEO AI": 5,
  Integrazioni: 4,
  Impostazioni: 4,
  Storico: 3,
});

export const WIZARD_DESTINATION_PAGES = Object.freeze([
  "Panoramica",
  "Clienti",
  "Centro progetto",
  "Storico",
  "Problemi",
  "Audit SEO",
  "Posizionamenti",
  "Link interni",
  "Opportunità",
  "Correzioni",
  "Task",
  "Piano editoriale",
  "SEO Agent",
  "GEO AI",
  "Integrazioni",
  "Impostazioni",
]);

// Unica fonte di verità per card wizard -> pagina di destinazione.
// Le destinazioni sono state riallineate al luogo in cui l'azione descritta
// viene realmente eseguita, evitando aperture di pannelli o sezioni interne.
const STEP_ACTIONS = Object.freeze({
  Panoramica: [
    { page: "Centro progetto" },      // Stato progetto
    { page: "Problemi" },            // Priorità
    { page: "Opportunità" },         // Opportunità
    { page: "Correzioni" },          // Correzioni
    { page: "Task" },                // Prossima azione
  ],
  Clienti: [
    { page: "Clienti" },             // Seleziona cliente
    { page: "Clienti" },             // Controlla dati del cliente
    { page: "Integrazioni" },        // Collega strumenti
    { page: "Centro progetto" },     // Apri progetto
  ],
  "Centro progetto": [
    { page: "Centro progetto" },     // Obiettivo
    { page: "Integrazioni" },        // Dati SEO
    { page: "Integrazioni" },        // WordPress
    { page: "Audit SEO" },           // Audit e problemi
    { page: "Correzioni" },          // Correzioni
    { page: "Centro progetto" },     // Report
  ],
  Problemi: [
    { page: "Problemi" },            // Visualizza
    { page: "Problemi" },            // Seleziona
    { page: "Problemi" },            // Valuta
    { page: "Correzioni" },          // Risolvi
  ],
  "Audit SEO": [
    { page: "Audit SEO" },           // Perimetro
    { page: "Audit SEO" },           // URL
    { page: "Audit SEO" },           // Avvia
    { page: "Storico" },             // Risultati
    { page: "Correzioni" },          // Correggi
  ],
  Posizionamenti: [
    { page: "Integrazioni" },        // Dati Search Console
    { page: "Posizionamenti" },      // Filtra
    { page: "Posizionamenti" },      // Andamento
    { page: "Opportunità" },         // Opportunità
  ],
  "Link interni": [
    { page: "Link interni" },        // Analizza
    { page: "Link interni" },        // Seleziona
    { page: "Task" },                // Crea task
    { page: "Link interni" },        // Verifica
  ],
  Opportunità: [
    { page: "Opportunità" },         // Filtra
    { page: "Opportunità" },         // Valuta
    { page: "Opportunità" },         // Decidi
    { page: "Task" },                // Crea task
  ],
  Correzioni: [
    { page: "Problemi" },            // Problema
    { page: "Correzioni" },          // Proposta
    { page: "Correzioni" },          // Approvazione
    { page: "Correzioni" },          // Applica
    { page: "Audit SEO" },           // Verifica
  ],
  Task: [
    { page: "Task" },                // Filtra
    { page: "Task" },                // Apri
    { page: "Task" },                // Esegui
    { page: "Audit SEO" },           // Verifica
    { page: "Task" },                // Chiudi
  ],
  "Piano editoriale": [
    { page: "Piano editoriale" },    // Tema
    { page: "Opportunità" },         // Priorità
    { page: "Piano editoriale" },    // Brief
    { page: "Piano editoriale" },    // Produci
    { page: "Posizionamenti" },      // Misura
  ],
  "SEO Agent": [
    { page: "SEO Agent" },           // Obiettivo
    { page: "SEO Agent" },           // Modalità
    { page: "SEO Agent" },           // Piano
    { page: "SEO Agent" },           // Approva
    { page: "Storico" },             // Verifica
  ],
  "GEO AI": [
    { page: "GEO AI" },              // Contesto
    { page: "GEO AI" },              // Analizza
    { page: "GEO AI" },              // Priorità
    { page: "GEO AI" },              // Migliora
    { page: "GEO AI" },              // Verifica
  ],
  Integrazioni: [
    { page: "Integrazioni" },        // Scegli
    { page: "Integrazioni" },        // Configura
    { page: "Integrazioni" },        // Verifica
    { page: "Integrazioni" },        // Salva
  ],
  Impostazioni: [
    { page: "Impostazioni" },        // Sezione
    { page: "Impostazioni" },        // Modifica
    { page: "Impostazioni" },        // Controlla
    { page: "Impostazioni" },        // Salva
  ],
  Storico: [
    { page: "Storico" },             // Filtra
    { page: "Storico" },             // Apri
    { page: "Storico" },             // Confronta
  ],
});

const hasDom = () => typeof window !== "undefined" && typeof document !== "undefined";

const currentPage = () => {
  if (!hasDom()) return "Panoramica";
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

const readCardMeta = (card, index) => ({
  label: card?.querySelector(".guided-step-copy strong")?.textContent?.trim() || `Passaggio ${index + 1}`,
  detail: card?.querySelector(".guided-step-copy small")?.textContent?.trim() || "",
});

const rememberContext = (sourcePage, index, action, meta = {}) => {
  if (!hasDom()) return;
  const payload = {
    sourcePage,
    stepNumber: index + 1,
    stepCount: WIZARD_STEP_COUNTS[sourcePage] || null,
    label: meta.label || `Passaggio ${index + 1}`,
    detail: meta.detail || "",
    destinationPage: action.page,
    createdAt: Date.now(),
  };
  try {
    window.sessionStorage.setItem(WIZARD_CONTEXT_KEY, JSON.stringify(payload));
  } catch {
    /* La navigazione resta disponibile anche senza sessionStorage. */
  }
};

export const hasExplicitWizardStepAction = (page, index) => Boolean(STEP_ACTIONS[page]?.[index]?.page);

export const wizardStepAction = (page, index) => {
  const explicit = STEP_ACTIONS[page]?.[index];
  if (explicit?.page) return explicit;
  return { page: WIZARD_DESTINATION_PAGES.includes(page) ? page : "Panoramica" };
};

export const wizardActionCoverageComplete = () => Object.entries(WIZARD_STEP_COUNTS).every(
  ([page, count]) =>
    STEP_ACTIONS[page]?.length === count &&
    STEP_ACTIONS[page].every((action) =>
      action &&
      typeof action.page === "string" &&
      WIZARD_DESTINATION_PAGES.includes(action.page) &&
      Object.keys(action).length === 1,
    ),
);

export const runWizardStepAction = (page, index, meta = {}) => {
  const action = wizardStepAction(page, index);
  rememberContext(page, index, action, meta);
  navigatePage(action.page);
  return true;
};

const stepIndexFromCard = (card) => {
  const cards = [...card.parentElement?.querySelectorAll(".guided-step-card") || []];
  return cards.indexOf(card);
};

const activeStepIndex = (wizard) => {
  const cards = [...wizard.querySelectorAll(".guided-step-card")];
  const active = wizard.querySelector(".guided-step-card.active");
  return Math.max(0, cards.indexOf(active));
};

const handleWizardClick = (event) => {
  const card = event.target.closest?.(".guided-step-card");
  if (card) {
    const index = stepIndexFromCard(card);
    if (index >= 0) {
      const meta = readCardMeta(card, index);
      window.setTimeout(() => runWizardStepAction(currentPage(), index, meta), 0);
    }
    return;
  }

  const footerButton = event.target.closest?.(".guided-wizard-footer button");
  if (!footerButton || footerButton.disabled) return;
  const wizard = footerButton.closest(".guided-page-wizard");
  if (!wizard) return;
  const current = activeStepIndex(wizard);
  const direction = /Successivo/i.test(footerButton.textContent || "") ? 1 : -1;
  const next = current + direction;
  const targetCard = wizard.querySelectorAll(".guided-step-card")[next];
  if (next >= 0 && targetCard) {
    const meta = readCardMeta(targetCard, next);
    window.setTimeout(() => runWizardStepAction(currentPage(), next, meta), 0);
  }
};

if (typeof document !== "undefined") {
  document.addEventListener("click", handleWizardClick);
}
