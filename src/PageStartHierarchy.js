const PAGE_HOST_SELECTORS = [
  ".guided-page-wizard-host",
  ".card-workspace-host",
];

let scheduledFrame = 0;

const currentMain = () => document.querySelector(".app main");

export function enforcePageStartHierarchy() {
  if (typeof document === "undefined") return false;
  const main = currentMain();
  const title = main?.querySelector(".page-title");
  if (!main || !title) return false;

  const wizard = main.querySelector(PAGE_HOST_SELECTORS[0]);
  const cards = main.querySelector(PAGE_HOST_SELECTORS[1]);

  // Portal hosts are the only nodes moved. The React-owned page title is never
  // detached from its component, so reconciliation remains safe.
  let anchor = title;
  if (wizard) {
    if (anchor.nextElementSibling !== wizard) anchor.insertAdjacentElement("afterend", wizard);
    anchor = wizard;
  }
  if (cards && anchor.nextElementSibling !== cards) anchor.insertAdjacentElement("afterend", cards);

  return true;
}

const schedule = () => {
  if (typeof window === "undefined" || scheduledFrame) return;
  scheduledFrame = window.requestAnimationFrame(() => {
    scheduledFrame = 0;
    enforcePageStartHierarchy();
  });
};

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowPageStartHierarchyInstalled) {
  window.__seogrowPageStartHierarchyInstalled = true;
  const observer = new MutationObserver(schedule);
  const start = () => {
    const root = document.getElementById("root") || document.documentElement;
    observer.observe(root, { childList: true, subtree: true });
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();

  for (const eventName of ["hashchange", "popstate", "seogrow-locationchange", "seogrow-storage-ok"]) {
    window.addEventListener(eventName, schedule);
  }
}
