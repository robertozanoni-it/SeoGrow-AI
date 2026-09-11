const INVALID_DATE_TEXT = "Invalid Date";
const BROKEN_LINK_FIELD_CLASS = "seogrow-broken-link-target-field";

export function safeDateLabel(value, fallback = "Data non disponibile") {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("it-IT") : fallback;
}

function sanitizeTextNode(node) {
  if (!node?.nodeValue?.includes(INVALID_DATE_TEXT)) return false;
  node.nodeValue = node.nodeValue.replaceAll(INVALID_DATE_TEXT, "Data non disponibile");
  return true;
}

function normalizeInternalLinksBanner(element) {
  if (!(element instanceof Element) || !element.matches(".source-banner")) return false;
  const text = element.textContent || "";
  if (!text.includes("Ultimo crawl:")) return false;
  const zeroLinks = /(?:·\s*)?0\s+link controllati/i.test(text);
  const invalidDate = text.includes(INVALID_DATE_TEXT) || text.includes("Data non disponibile");
  if (!zeroLinks || !invalidDate) return false;

  element.classList.add("source-banner-neutral");
  element.replaceChildren(document.createTextNode("Nessun crawl completo disponibile · 0 link controllati"));
  return true;
}

const validBrokenTarget = (value) => {
  try {
    const url = new URL(String(value || "").trim().replace(/[),.;]+$/, ""));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

function brokenTargetFromCard(card) {
  if (!(card instanceof Element)) return "";
  const explanation = card.querySelector(".correction-explanation")?.textContent || "";
  const explicit = explanation.match(/Link esatto da correggere:\s*(https?:\/\/[^\s]+)/i)?.[1];
  if (explicit) return validBrokenTarget(explicit);

  const title = card.querySelector(".wp-live-preview-title")?.textContent || "";
  if (!/link esterno non raggiungibile|collegamento esterno 404/i.test(`${title} ${card.textContent || ""}`)) return "";
  const preview = [...card.querySelectorAll(".correction-readable pre")]
    .map((node) => validBrokenTarget(node.textContent))
    .find(Boolean);
  return preview || "";
}

function createBrokenLinkField(card, url) {
  if (!(card instanceof Element) || !url || card.querySelector(`.${BROKEN_LINK_FIELD_CLASS}`)) return false;

  const section = document.createElement("section");
  section.className = BROKEN_LINK_FIELD_CLASS;
  section.setAttribute("aria-label", "Link esterno da correggere");

  const label = document.createElement("label");
  label.textContent = "Link da correggere";

  const row = document.createElement("div");
  row.className = "seogrow-broken-link-target-row";

  const input = document.createElement("input");
  input.type = "url";
  input.readOnly = true;
  input.value = url;
  input.setAttribute("aria-label", "URL esterno 404 da correggere");

  const open = document.createElement("a");
  open.className = "secondary seogrow-broken-link-open";
  open.href = url;
  open.target = "_blank";
  open.rel = "noreferrer";
  open.textContent = "Apri link";

  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "secondary seogrow-broken-link-copy";
  copy.textContent = "Copia link";
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      input.focus();
      input.select();
      document.execCommand?.("copy");
      input.setSelectionRange(0, 0);
    }
    copy.textContent = "Copiato";
    window.setTimeout(() => { copy.textContent = "Copia link"; }, 1400);
  });

  row.append(input, open, copy);
  section.append(label, row);

  const explanation = card.querySelector(".correction-explanation");
  if (explanation?.nextSibling) explanation.parentNode.insertBefore(section, explanation.nextSibling);
  else if (explanation) explanation.after(section);
  else card.prepend(section);
  return true;
}

function normalizeBrokenLinkFields(root) {
  if (!(root instanceof Element) && !(root instanceof Document)) return;
  const cards = new Set();
  if (root instanceof Element) {
    if (root.matches(".wp-live-preview-row")) cards.add(root);
    const parentCard = root.closest?.(".wp-live-preview-row");
    if (parentCard) cards.add(parentCard);
  }
  for (const card of root.querySelectorAll?.(".wp-live-preview-row") || []) cards.add(card);
  for (const card of cards) {
    const target = brokenTargetFromCard(card);
    if (target) createBrokenLinkField(card, target);
  }
}

export function sanitizeUiIntegrity(root = document) {
  if (!root) return;
  const elements = root instanceof Element && root.matches(".source-banner")
    ? [root]
    : [...(root.querySelectorAll?.(".source-banner") || [])];
  elements.forEach(normalizeInternalLinksBanner);
  normalizeBrokenLinkFields(root);

  const walkerRoot = root instanceof Document ? root.body : root;
  if (!walkerRoot) return;
  const walker = document.createTreeWalker(
    walkerRoot,
    NodeFilter.SHOW_TEXT,
  );
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach(sanitizeTextNode);
}

export function installUiIntegrityFixes() {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return () => {};
  sanitizeUiIntegrity(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        sanitizeTextNode(mutation.target);
        normalizeBrokenLinkFields(mutation.target?.parentElement || document);
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) sanitizeTextNode(node);
        if (node.nodeType === Node.ELEMENT_NODE) sanitizeUiIntegrity(node);
      }
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  return () => observer.disconnect();
}

if (typeof document !== "undefined") installUiIntegrityFixes();
