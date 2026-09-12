import "./ProposalBeforeAfterLinks.css";

const safeUrl = (value) => {
  try {
    const url = new URL(String(value || "").trim());
    return /^https?:$/.test(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
};

const makeLink = (href, label, className) => {
  const link = document.createElement("a");
  link.className = className;
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = label;
  link.title = href;
  return link;
};

export function annotateProposalPageLinks() {
  if (typeof document === "undefined") return 0;
  let changed = 0;

  const header = document.querySelector(".automatic-proposal-header");
  const headerSmall = header?.querySelector("small");
  const headerUrl = safeUrl(headerSmall?.textContent);
  if (header && headerUrl && !header.querySelector(".automatic-proposal-source-link")) {
    headerSmall.insertAdjacentElement("afterend", makeLink(headerUrl, "Apri pagina da correggere", "automatic-proposal-source-link"));
    changed += 1;
  }

  for (const row of document.querySelectorAll(".wp-live-preview-row")) {
    const title = row.querySelector(".wp-live-preview-title");
    const source = safeUrl(title?.querySelector("small")?.textContent);
    if (!source) continue;

    if (!row.querySelector(".wp-live-source-link")) {
      const link = makeLink(source, "Apri pagina interessata", "secondary wp-live-source-link");
      const explanation = row.querySelector(".correction-explanation");
      if (explanation) explanation.insertAdjacentElement("afterend", link);
      else title?.insertAdjacentElement("afterend", link);
      changed += 1;
    }

    for (const readable of row.querySelectorAll(".correction-readable")) {
      if (readable.querySelector(".correction-page-reference")) continue;
      const reference = document.createElement("div");
      reference.className = "correction-page-reference";
      const label = document.createElement("span");
      label.textContent = "Pagina della correzione:";
      reference.append(label, makeLink(source, source, "correction-page-link"));
      const diff = readable.querySelector(".wp-live-diff");
      if (diff) diff.insertAdjacentElement("afterend", reference);
      else readable.appendChild(reference);
      changed += 1;
    }
  }
  return changed;
}

let frame = 0;
const schedule = () => {
  if (typeof window === "undefined" || frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    annotateProposalPageLinks();
  });
};

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowProposalBeforeAfterLinksInstalled) {
  window.__seogrowProposalBeforeAfterLinksInstalled = true;
  const observer = new MutationObserver(schedule);
  const start = () => {
    observer.observe(document.getElementById("root") || document.documentElement, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  for (const eventName of ["hashchange", "seogrow-locationchange", "seogrow-automatic-proposal-open", "seogrow-remediation-applied"]) {
    window.addEventListener(eventName, schedule);
  }
}
