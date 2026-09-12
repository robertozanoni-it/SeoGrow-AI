import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";

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
    const findTarget = () => {
      /* GuidedNav already exposes Problemi. The bridge is only a fallback for
         the legacy sidebar while the guided layer is unavailable. */
      const guidedHasProblems = [...document.querySelectorAll(".guided-nav button")].some(
        (button) => button.textContent?.trim() === "Problemi",
      );
      if (guidedHasProblems) {
        setTarget(null);
        return;
      }
      const fallback = document.querySelector(".sidebar > nav:not(.guided-nav)");
      if (fallback) setTarget(fallback);
      else if (++attempts < 120) frame = window.requestAnimationFrame(findTarget);
    };
    frame = window.requestAnimationFrame(findTarget);
    return () => window.cancelAnimationFrame(frame);
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
      aria-current={page === "Problemi" ? "page" : undefined}
      onClick={openProblems}
    >
      <AlertTriangle />
      <span>Problemi</span>
    </button>,
    target,
  );
}
