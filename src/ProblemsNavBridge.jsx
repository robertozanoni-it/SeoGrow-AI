import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ListChecks } from "lucide-react";

const currentPage = () => {
  try {
    return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
  } catch {
    return "Panoramica";
  }
};

const openProblems = () => {
  const next = `#${encodeURIComponent("Problemi")}`;
  if (window.location.hash !== next) window.history.pushState(null, "", next);
  window.dispatchEvent(new CustomEvent("seogrow-locationchange"));
};

export default function ProblemsNavBridge() {
  const [page, setPage] = useState(currentPage);
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    let host = null;

    const attachAuditSubview = () => {
      const auditButton = document.querySelector('.guided-nav button[data-seogrow-page="Audit SEO"]');
      if (!auditButton) {
        if (++attempts < 120) frame = window.requestAnimationFrame(attachAuditSubview);
        return;
      }

      host = document.createElement("div");
      host.className = "guided-audit-subnav-host";
      host.setAttribute("data-seogrow-owner", "Audit SEO");
      auditButton.insertAdjacentElement("afterend", host);
      setTarget(host);
    };

    frame = window.requestAnimationFrame(attachAuditSubview);
    return () => {
      window.cancelAnimationFrame(frame);
      host?.remove();
    };
  }, []);

  useEffect(() => {
    const refresh = () => setPage(currentPage());
    window.addEventListener("hashchange", refresh);
    window.addEventListener("seogrow-locationchange", refresh);
    return () => {
      window.removeEventListener("hashchange", refresh);
      window.removeEventListener("seogrow-locationchange", refresh);
    };
  }, []);

  if (!target) return null;
  return createPortal(
    <button
      type="button"
      className={`problems-nav-bridge-button${page === "Problemi" ? " active" : ""}`}
      data-seogrow-subview="Audit SEO:Problemi"
      aria-current={page === "Problemi" ? "page" : undefined}
      aria-label="Problemi · sottovista Audit SEO"
      onClick={openProblems}
    >
      <ListChecks />
      <span>Problemi</span>
    </button>,
    target,
  );
}
