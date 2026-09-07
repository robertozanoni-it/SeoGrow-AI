const INVALID_DATE_TEXT = "Invalid Date";

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

export function sanitizeUiIntegrity(root = document) {
  if (!root) return;
  const elements = root instanceof Element && root.matches(".source-banner")
    ? [root]
    : [...(root.querySelectorAll?.(".source-banner") || [])];
  elements.forEach(normalizeInternalLinksBanner);

  const walker = document.createTreeWalker(
    root instanceof Document ? root.body : root,
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
