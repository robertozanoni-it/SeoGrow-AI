import { navigatePage } from "./navigationUx.js";

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

// Regola UX: ogni card wizard apre sempre una PAGINA reale di SeoGrow AI.
// Nessuna card apre più sezioni, pannelli, dettagli interni o scroll target.
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
    { page: "Panoramica" },          // Controlla dati
    { page: "Integrazioni" },        // Collega strumenti
    { page: "Centro progetto" },     // Apri progetto
  ],
  "Centro progetto": [
    { page: "Centro progetto" },     // Obiettivo
    { page: "Integrazioni" },        // Dati SEO
    { page: "Integrazioni" },        // WordPress
    { page: "Problemi" },            // Audit e problemi
    { page: "Correzioni" },          // Correzioni
    { page: "Storico" },             // Report / risultati
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
    { page: "Integrazioni" },        // Dati
    { page: "Posizionamenti" },      // Filtra
    { page: "Posizionamenti" },      // Andamento
    { page: "Opportunità" },         // Opportunità
  ],
  "Link interni": [
    { page: "Link interni" },        // Analizza
    { page: "Link interni" },        // Seleziona
    { page: "Task" },                // Crea task
    { page: "Audit SEO" },           // Verifica
  ],
  Opportunità: [
    { page: "Opportunità" },         // Filtra
    { page: "Opportunità" },         // Valuta
    { page: "Task" },                // Decidi
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
    { page: "Centro progetto" },     // Esegui
    { page: "Audit SEO" },           // Verifica
    { page: "Task" },                // Chiudi
  ],
  "Piano editoriale": [
    { page: "Piano editoriale" },    // Tema
    { page: "Opportunità" },         // Priorità
    { page: "Piano editoriale" },    // Brief
    { page: "SEO Agent" },           // Produci
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
    { page: "SEO Agent" },           // Migliora
    { page: "GEO AI" },              // Verifica
  ],
  Integrazioni: [
    { page: "Integrazioni" },        // Scegli
    { page: "Integrazioni" },        // Configura
    { page: "Integrazioni" },        // Verifica
    { page: "Panoramica" },          // Salva / ritorno al progetto
  ],
  Impostazioni: [
    { page: "Impostazioni" },        // Sezione
    { page: "Impostazioni" },        // Modifica
    { page: "Impostazioni" },        // Controlla
    { page: "Panoramica" },          // Salva / ritorno al lavoro
  ],
  Storico: [
    { page: "Storico" },             // Filtra
    { page: "Storico" },             // Apri
    { page: "Panoramica" },          // Confronta / torna al quadro generale
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

export const runWizardStepAction = (page, index) => {
  const action = wizardStepAction(page, index);
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
    if (index >= 0) window.setTimeout(() => runWizardStepAction(currentPage(), index), 0);
    return;
  }

  const footerButton = event.target.closest?.(".guided-wizard-footer button");
  if (!footerButton || footerButton.disabled) return;
  const wizard = footerButton.closest(".guided-page-wizard");
  if (!wizard) return;
  const current = activeStepIndex(wizard);
  const direction = /Successivo/i.test(footerButton.textContent || "") ? 1 : -1;
  const next = current + direction;
  if (next >= 0) window.setTimeout(() => runWizardStepAction(currentPage(), next), 0);
};

if (typeof document !== "undefined") {
  document.addEventListener("click", handleWizardClick);
}
