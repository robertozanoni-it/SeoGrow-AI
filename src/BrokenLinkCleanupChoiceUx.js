import {
  BROKEN_LINK_CLEANUP_MODES,
  brokenExternalTarget,
  clearBrokenLinkCleanupMode,
  setBrokenLinkCleanupMode,
} from "./brokenLinkRemediation.js";
import "./BrokenLinkCleanupChoiceUx.css";

const PRESERVE = BROKEN_LINK_CLEANUP_MODES.PRESERVE_TEXT;
const DELETE = BROKEN_LINK_CLEANUP_MODES.DELETE_ANCHOR_TEXT;
const choiceModes = new Map();
let frame = 0;

const safeTarget = (value) => brokenExternalTarget({ targetUrl: value });

const urlFromEvidenceField = (card, labelPattern) => {
  for (const field of card.querySelectorAll(".wp-live-link-evidence-field")) {
    if (!labelPattern.test(field.querySelector("span")?.textContent || "")) continue;
    const href = field.querySelector("a")?.getAttribute("href") || "";
    try { return new URL(href).href; } catch { return ""; }
  }
  return "";
};

const sourceFromCard = (card) => {
  const evidence = urlFromEvidenceField(card, /pagina con il link/i);
  if (evidence) return evidence;
  const value = String(card.querySelector(".wp-live-preview-title small")?.textContent || "").trim();
  try { return new URL(value).href; } catch { return value; }
};

const targetFromEvidence = (card) => safeTarget(urlFromEvidenceField(card, /link da correggere/i));

const targetFromReadablePreview = (card) => {
  const value = card.querySelector(".correction-readable .wp-live-diff section:first-child pre")?.textContent || "";
  return safeTarget(value);
};

const targetFromCard = (card) => targetFromEvidence(card) || targetFromReadablePreview(card);
const choiceKey = (card, target = targetFromCard(card)) => `${sourceFromCard(card)}|${target}`;

const anchorFromCard = (card) => {
  const verified = String(card.querySelector(".wp-live-link-anchor")?.textContent || "").trim();
  if (verified && !/rilevamento|senza testo|non rilevabile/i.test(verified)) return verified;

  const paragraph = card.querySelector(".correction-readable > p");
  if (!paragraph) return "";
  const clone = paragraph.cloneNode(true);
  clone.querySelector("strong")?.remove();
  return String(clone.textContent || "").replace(/^\s*:\s*/, "").trim();
};

const replaceLabeledText = (paragraph, label, value) => {
  if (!paragraph) return;
  const expected = `${label} ${value || "testo del collegamento"}`.trim();
  if (paragraph.textContent?.trim() === expected) return;
  const strong = document.createElement("strong");
  strong.textContent = label;
  paragraph.replaceChildren(strong, document.createTextNode(` ${value || "testo del collegamento"}`));
};

const setText = (node, value) => {
  if (node && node.textContent !== value) node.textContent = value;
};

const prepareAgain = (card, target) => {
  const previews = card.closest(".wp-live-remediation")?.querySelectorAll(".wp-live-preview-row.preview") || [];
  if (previews.length !== 1) {
    window.alert("Per cambiare questa risoluzione prepara un solo problema alla volta, così la scelta resta legata alla pagina corretta.");
    clearBrokenLinkCleanupMode(target);
    return false;
  }
  const remediation = card.closest(".wp-live-remediation");
  const prepareOne = remediation?.querySelector(".wp-live-remediation-actions button.secondary");
  if (!prepareOne) {
    clearBrokenLinkCleanupMode(target);
    return false;
  }
  prepareOne.click();
  window.setTimeout(() => clearBrokenLinkCleanupMode(target), 60000);
  return true;
};

const createChoice = (card, target) => {
  const section = document.createElement("section");
  section.className = "seogrow-link-cleanup-choice";
  section.dataset.target = target;

  const title = document.createElement("h4");
  title.textContent = "Come vuoi risolvere il link 404?";
  section.appendChild(title);

  const description = document.createElement("p");
  description.textContent = "Scegli se mantenere visibile l'anchor text oppure eliminare sia il collegamento sia il testo associato.";
  section.appendChild(description);

  const actions = document.createElement("div");
  actions.className = "wp-live-guidance-actions seogrow-link-cleanup-actions";

  const preserve = document.createElement("button");
  preserve.type = "button";
  preserve.className = "secondary";
  preserve.dataset.cleanupMode = PRESERVE;
  preserve.textContent = "Mantieni il testo";
  preserve.addEventListener("click", () => {
    const key = choiceKey(card, target);
    if (choiceModes.get(key) === PRESERVE) return;
    choiceModes.set(key, PRESERVE);
    clearBrokenLinkCleanupMode(target);
    prepareAgain(card, target);
  });
  actions.appendChild(preserve);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "danger";
  remove.dataset.cleanupMode = DELETE;
  remove.textContent = "Elimina link e testo associato";
  remove.addEventListener("click", () => {
    const key = choiceKey(card, target);
    if (choiceModes.get(key) === DELETE) return;
    choiceModes.set(key, DELETE);
    setBrokenLinkCleanupMode(target, DELETE);
    if (!prepareAgain(card, target)) choiceModes.set(key, PRESERVE);
  });
  actions.appendChild(remove);
  section.appendChild(actions);

  const warning = document.createElement("p");
  warning.className = "seogrow-link-cleanup-warning";
  warning.setAttribute("role", "status");
  section.appendChild(warning);

  return section;
};

const syncChoice = (card, target) => {
  const key = choiceKey(card, target);
  let choice = card.querySelector(".seogrow-link-cleanup-choice");
  if (!choice || choice.dataset.target !== target) {
    choice?.remove();
    choice = createChoice(card, target);
    const evidence = card.querySelector(".wp-live-link-evidence");
    const readable = card.querySelector(".correction-readable");
    if (evidence) evidence.insertAdjacentElement("afterend", choice);
    else if (readable) readable.insertAdjacentElement("beforebegin", choice);
    else card.appendChild(choice);
  }

  const mode = choiceModes.get(key) === DELETE ? DELETE : PRESERVE;
  const anchor = anchorFromCard(card) || "testo del collegamento";
  for (const button of choice.querySelectorAll("button[data-cleanup-mode]")) {
    const selected = button.dataset.cleanupMode === mode;
    button.setAttribute("aria-pressed", selected ? "true" : "false");
    button.classList.toggle("selected", selected);
  }

  const warning = choice.querySelector(".seogrow-link-cleanup-warning");
  if (mode === DELETE) {
    setText(warning, `Attenzione: verrà eliminato definitivamente anche l'anchor text «${anchor}». Controlla che la frase restante sia corretta prima di applicare.`);
  } else {
    setText(warning, "Il collegamento 404 verrà rimosso, ma l'anchor text resterà visibile nella pagina.");
  }

  const readable = card.querySelector(".correction-readable");
  if (readable) {
    const summary = readable.querySelector(":scope > p");
    const after = readable.querySelector(".wp-live-diff section:nth-child(2) pre");
    if (mode === DELETE) {
      replaceLabeledText(summary, "Anchor text da eliminare:", anchor);
      setText(after, "Collegamento e anchor text eliminati dalla pagina.");
    } else {
      replaceLabeledText(summary, "Testo mantenuto:", anchor);
      setText(after, "Collegamento rimosso; il testo resta visibile.");
    }
  }

  const apply = card.querySelector(".wp-live-apply-one");
  if (apply && !apply.disabled) {
    setText(apply, mode === DELETE ? "Applica ed elimina link + testo" : "Applica questa modifica sul sito");
  }
};

export function annotateBrokenLinkCleanupChoices() {
  if (typeof document === "undefined") return 0;
  const previewCards = [...document.querySelectorAll(".wp-live-preview-row.preview")];
  if (previewCards.length !== 1) return 0;

  const card = previewCards[0];
  const title = card.querySelector(".wp-live-preview-title strong")?.textContent || "";
  if (!/link esterno/i.test(title)) return 0;
  const target = targetFromCard(card);
  if (!target) return 0;
  const existed = Boolean(card.querySelector(".seogrow-link-cleanup-choice"));
  syncChoice(card, target);
  return existed ? 0 : 1;
}

const schedule = () => {
  if (typeof window === "undefined" || frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    annotateBrokenLinkCleanupChoices();
  });
};

const confirmDestructiveChoice = (event) => {
  const button = event.target?.closest?.(".wp-live-apply-one");
  const card = button?.closest?.(".wp-live-preview-row.preview");
  if (!card) return;
  const target = targetFromCard(card);
  const key = target ? choiceKey(card, target) : "";
  if (!target || choiceModes.get(key) !== DELETE) return;
  const anchor = anchorFromCard(card) || "testo del collegamento";
  const accepted = window.confirm(
    `Conferma eliminazione del link 404 e del testo associato.\n\nAnchor text che verrà eliminato: «${anchor}»\n\nQuesta operazione rimuove il testo dalla pagina. Procedere?`,
  );
  if (!accepted) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
};

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowBrokenLinkCleanupChoiceInstalled) {
  window.__seogrowBrokenLinkCleanupChoiceInstalled = true;
  document.addEventListener("click", confirmDestructiveChoice, true);
  window.addEventListener("seogrow-remediation-applied", () => {
    choiceModes.clear();
    schedule();
  });
  const observer = new MutationObserver(schedule);
  const start = () => {
    observer.observe(document.getElementById("root") || document.documentElement, { childList: true, subtree: true, characterData: true });
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
