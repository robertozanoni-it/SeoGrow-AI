const PAGE_HOST_SELECTORS = [
  ".wizard-context-host",
  ".guided-page-wizard-host",
  ".card-workspace-host",
  ".guided-next-actions-host",
];

// These containers belong to the enhancement layers, not to the React page.
// Keep their identity across page reconciliation; an old page unmount can
// otherwise detach a freshly installed portal and leave a permanently blank hub.
const pageHosts = new Map();
let scheduledFrame = 0;
const currentPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};
const currentMain = () => document.querySelector(".app main");
const titleMatches = (node, page) => {
  const title = node?.querySelector("h1")?.textContent?.trim() || "";
  return title === page || title.startsWith(`${page} `) || title.startsWith(`${page}—`);
};

export function registerPageHost(page, host) {
  pageHosts.set(host, page);
  schedule();
  return () => {
    pageHosts.delete(host);
    host.remove();
  };
}

export function enforcePageStartHierarchy() {
  if (typeof document === "undefined") return false;
  const main = currentMain();
  const page = currentPage();
  if (!main || (main.dataset.page && main.dataset.page !== page)) return false;
  const title = [...main.querySelectorAll(".page-title")].find(node => titleMatches(node, page));
  if (!title) return false;

  for (const [host, ownerPage] of pageHosts) {
    if (ownerPage !== page && host.isConnected) host.remove();
  }
  const registered = selector => [...pageHosts].find(([host, ownerPage]) => ownerPage === page && host.matches(selector))?.[0];
  let anchor = title;
  for (const selector of PAGE_HOST_SELECTORS) {
    const host = registered(selector) || main.querySelector(selector);
    if (!host) continue;
    if (anchor.nextElementSibling !== host) anchor.insertAdjacentElement("afterend", host);
    anchor = host;
  }
  const help = registered(".guided-page-help-host");
  if (help && main.lastElementChild !== help) main.appendChild(help);
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
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-page"] });
    schedule();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  for (const eventName of ["hashchange", "popstate", "seogrow-locationchange", "seogrow-storage-ok"]) window.addEventListener(eventName, schedule);
}
