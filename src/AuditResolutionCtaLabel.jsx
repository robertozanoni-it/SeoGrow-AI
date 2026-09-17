import { useEffect } from "react";

const AUDIT_HASH = `#${encodeURIComponent("Audit SEO")}`;
const SELECTOR = ".audit-enhancer-root .audit-agent-action";

const isAuditPage = () => {
  try { return window.location.hash === AUDIT_HASH; }
  catch { return false; }
};

const applyLabels = () => {
  if (!isAuditPage()) return;
  for (const button of document.querySelectorAll(SELECTOR)) {
    if (!(button instanceof HTMLButtonElement)) continue;
    const icon = button.querySelector("svg");
    for (const node of [...button.childNodes]) {
      if (node === icon) continue;
      node.remove();
    }
    button.append(document.createTextNode(" Vai alla risoluzione"));
    button.setAttribute("aria-label", "Vai alla risoluzione");
    button.dataset.auditResolutionCta = "true";
  }
};

export default function AuditResolutionCtaLabel() {
  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(applyLabels);
    };
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hashchange", schedule);
    window.addEventListener("seogrow-locationchange", schedule);
    schedule();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("hashchange", schedule);
      window.removeEventListener("seogrow-locationchange", schedule);
    };
  }, []);
  return null;
}
