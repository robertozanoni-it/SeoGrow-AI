const PAGE_HOST_SELECTORS = [
  ".wizard-context-host",
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

  // Portal hosts are the only nodes moved. The React-owned page title is never
  // detached from its component, so reconciliation remains safe. The stable
  // visual order is: H1 page -> step context -> guided wizard -> card workspace.
  let anchor = title;
  for (const selector of PAGE_HOST_SELECTORS) {
    const host = main.querySelector(selector);
    if (!host) continue;
    if (anchor.nextElementSibling !== host) anchor.insertAdjacentElement("afterend", host);
    anchor = host;
  }

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
