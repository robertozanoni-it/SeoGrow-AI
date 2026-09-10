import { navigatePage } from "./navigationUx.js";

const STEP_ACTIONS = {
  Panoramica: [
    { page: "Centro progetto" },
    { page: "Problemi" },
    { page: "Opportunità" },
    { page: "Correzioni" },
    { selector: ".guided-next-actions" },
  ],
  Clienti: [
    { selector: ".card-workspace" },
    { detail: true },
    { page: "Integrazioni" },
    { page: "Centro progetto" },
  ],
  "Centro progetto": [
    { projectCard: "Preparazione del progetto" },
    { projectCard: "Preparazione del progetto" },
    { projectCard: "Preparazione del progetto" },
    { projectCard: "Analizza e correggi" },
    { projectCard: "Analizza e correggi" },
    { projectCard: "Condivisione dei risultati" },
  ],
  Problemi: [
    { tools: true, selector: ".problems-workspace-root" },
    { tools: true, selector: ".problems-workspace-root" },
    { tools: true, selector: ".problems-workspace-root" },
    { tools: true, selector: ".problems-workspace-root" },
  ],
  "Audit SEO": [
    { tools: true, selector: ".audit-workspace-root" },
    { tools: true, selector: ".audit-workspace-root" },
    { tools: true, selector: ".audit-workspace-root" },
    { detail: true },
    { page: "Problemi" },
  ],
  Posizionamenti: [
    { tools: true, selector: ".ranking-form" },
    { detail: true },
    { detail: true },
    { page: "Opportunità" },
  ],
  "Link interni": [
    { detail: true },
    { detail: true },
    { page: "Task" },
    { tools: true },
  ],
  Opportunità: [
    { detail: true },
    { detail: true },
    { tools: true },
    { page: "Task" },
  ],
  Correzioni: [
    { page: "Problemi" },
    { tools: true, selector: ".corrections-workspace-root" },
    { tools: true, selector: ".corrections-workspace-root" },
    { tools: true, selector: ".corrections-workspace-root" },
    { tools: true, selector: ".corrections-workspace-root" },
  ],
  Task: [
    { tools: true, selector: ".task-filters" },
    { detail: true },
    { tools: true },
    { tools: true },
    { tools: true },
  ],
  "Piano editoriale": [
    { tools: true },
    { tools: true },
    { tools: true },
    { tools: true },
    { tools: true },
  ],
  "SEO Agent": [
    { tools: true, selector: "#seo-agent-goal" },
    { tools: true, selector: "#seo-agent-goal" },
    { tools: true },
    { tools: true },
    { detail: true },
  ],
  "GEO AI": [
    { tools: true },
    { tools: true },
    { detail: true },
    { tools: true },
    { tools: true },
  ],
  Integrazioni: [
    { selector: ".card-workspace" },
    { tools: true },
    { tools: true },
    { tools: true },
  ],
  Impostazioni: [
    { selector: ".card-workspace" },
    { tools: true },
    { tools: true },
    { tools: true },
  ],
  Storico: [
    { selector: ".card-workspace" },
    { detail: true },
    { detail: true },
  ],
};

const currentPage = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

const afterFrame = (callback) => window.requestAnimationFrame(() => window.requestAnimationFrame(callback));

const scrollToSelector = (selector) => {
  if (!selector) return false;
  const element = document.querySelector(selector);
  if (!element) return false;
  element.scrollIntoView({ behavior: "smooth", block: "start" });
  return true;
};

const openProjectCard = (label) => {
  const button = [...document.querySelectorAll(".project-center-section-card")]
    .find((item) => String(item.textContent || "").includes(label));
  if (!button) return false;
  button.click();
  return true;
};

const openFirstCardDetail = (openTools = false, selector = "") => {
  const workspace = document.querySelector(".card-workspace");
  if (!workspace) {
    scrollToSelector(selector);
    return false;
  }

  const finish = () => {
    if (openTools) {
      const manage = [...document.querySelectorAll(".card-horizontal-actions button")]
        .find((button) => /Apri strumenti operativi/i.test(button.textContent || ""));
      manage?.click();
      afterFrame(() => {
        if (!scrollToSelector(selector)) {
          document.querySelector('[data-seogrow-card-original="true"]')?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
      return;
    }
    if (!scrollToSelector(selector)) workspace.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  if (workspace.classList.contains("is-hub")) {
    const firstCard = workspace.querySelector(".card-record");
    if (!firstCard) return false;
    firstCard.click();
    afterFrame(finish);
    return true;
  }

  finish();
  return true;
};

export const wizardStepAction = (page, index) => STEP_ACTIONS[page]?.[index] || null;

export const runWizardStepAction = (page, index) => {
  const action = wizardStepAction(page, index);
  if (!action) return false;

  if (action.page) {
    navigatePage(action.page);
    return true;
  }
  if (action.projectCard) return openProjectCard(action.projectCard);
  if (action.tools) return openFirstCardDetail(true, action.selector || "");
  if (action.detail) return openFirstCardDetail(false, action.selector || "");
  if (action.selector) return scrollToSelector(action.selector);
  return false;
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

document.addEventListener("click", handleWizardClick);
