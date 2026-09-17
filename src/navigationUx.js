import { resolvePageAlias } from "./core/modules/moduleRegistry.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { workspaceStorage } from "./workspaceDatabase.js";

const SELECTED_PAGE_KEY = WORKSPACE_KEYS.selectedPage;

const notifyStoredPage = (page) => {
  const serialized = JSON.stringify(page);
  try { workspaceStorage.setItem(SELECTED_PAGE_KEY, serialized); } catch { /* Runtime event still keeps navigation usable outside browser storage. */ }
  const detail = { key: SELECTED_PAGE_KEY, newValue: serialized };
  const event = typeof StorageEvent === "function"
    ? new StorageEvent("storage", detail)
    : Object.assign(new Event("storage"), detail);
  window.dispatchEvent(event);
};

const closeMobileNavigation = () => {
  if (typeof document === "undefined") return;
  const sidebar = document.querySelector(".sidebar.open");
  if (!sidebar) return;
  const close = sidebar.querySelector('button[aria-label="Chiudi menu"]');
  close?.click();
};

export const activateNativePageState = (page) => {
  if (typeof document === "undefined") return false;
  const resolvedPage = resolvePageAlias(page);
  const buttons = [...document.querySelectorAll(".sidebar > nav:not(.guided-nav) button")];
  const target = buttons.find((button) => {
    const label = button.querySelector("span")?.textContent?.trim() || button.textContent?.trim() || "";
    return label === resolvedPage;
  });
  if (!target || target.disabled) return false;
  target.click();
  return true;
};

const notifyLocationChange = (oldURL = "") => {
  const newURL = String(window.location?.href || "");
  const hashEvent = typeof HashChangeEvent === "function"
    ? new HashChangeEvent("hashchange", { oldURL: String(oldURL || ""), newURL })
    : new Event("hashchange");
  window.dispatchEvent(hashEvent);
  window.dispatchEvent(new CustomEvent("seogrow-locationchange"));
};

export function navigatePage(page) {
  const resolvedPage = resolvePageAlias(page);
  const next = `#${encodeURIComponent(resolvedPage)}`;
  if (resolvedPage === "Correzioni") {
    window.__seogrowCorrectionsMode = true;
    const oldURL = String(window.location?.href || "");
    if (window.location.hash !== next) window.history.pushState(null, "", next);
    notifyStoredPage(resolvedPage);
    notifyLocationChange(oldURL);
    closeMobileNavigation();
    return;
  }

  // The original App navigation owns the canonical React page state. The
  // guided/card layers use the URL as their source of truth, so also trigger
  // the hidden native control when it exists. This prevents a rapid reload or
  // remount from leaving #Audit%20SEO in the URL while App still renders the
  // previous page (for example Centro progetto).
  activateNativePageState(resolvedPage);

  if (window.location.hash !== next) {
    const oldURL = String(window.location?.href || "");
    window.location.hash = next;
    notifyStoredPage(resolvedPage);
    notifyLocationChange(oldURL);
  } else {
    notifyStoredPage(resolvedPage);
    window.dispatchEvent(new CustomEvent("seogrow-locationchange"));
  }
  closeMobileNavigation();
}

export const isNavigationItemVisible = (label, advancedOnly, mode, currentPage) =>
  mode === "advanced" || !advancedOnly || label === currentPage;

const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function searchWorkspace(query, { pages, clients, tasks }) {
  const tokens = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const matches = (...fields) => tokens.every(token => normalize(fields.join(" ")).includes(token));
  const results = [
    ...[...new Set([...pages, "Correzioni"])].filter(label => matches(label)).map(label => ({ label, meta: "Sezione", page: label })),
    ...clients.filter(client => matches(client.name, client.url)).map(client => ({ label: client.name, meta: client.url, page: "Panoramica", clientId: client.id })),
    ...tasks.filter(task => matches(task.title, task.client, task.detail, task.sourceUrl, task.targetUrl)).map(task => ({ label: task.title, meta: task.client, page: "Task", clientId: task.sourceClientId || clients.find(client => client.name === task.client)?.id, taskId: task.id })),
  ];
  return results;
}
