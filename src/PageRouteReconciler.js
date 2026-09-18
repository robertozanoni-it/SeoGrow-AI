import { resolvePageAlias } from "./core/modules/moduleRegistry.js";
import { WORKSPACE_KEYS } from "./core/workspace/storageKeys.js";
import { workspaceStorage } from "./workspaceDatabase.js";
import { activateNativePageState } from "./navigationUx.js";
import { canonicalPageForLegacyView } from "./suite/productArchitecture.js";

const SELECTED_PAGE_KEY = WORKSPACE_KEYS.selectedPage;
const MAX_FRAMES = 120;
let frame = 0;
let generation = 0;

export const canonicalRuntimePage = (page) =>
  canonicalPageForLegacyView(resolvePageAlias(page));

const readRequestedPage = () => {
  try {
    const requested = decodeURIComponent(window.location.hash.slice(1)) || "Panoramica";
    // Problemi resta una sottovista operativa di Audit SEO con route propria.
    // Le vecchie viste duplicate convergono sul loro owner definito nell'architettura congelata.
    return canonicalRuntimePage(requested);
  } catch {
    return "Panoramica";
  }
};

const dispatchPageState = (page) => {
  const serialized = JSON.stringify(page);
  try {
    if (workspaceStorage.getItem(SELECTED_PAGE_KEY) !== serialized) {
      workspaceStorage.setItem(SELECTED_PAGE_KEY, serialized);
    }
  } catch {
    // The live event/native control can still reconcile the current session.
  }
  const detail = { key: SELECTED_PAGE_KEY, newValue: serialized };
  const event = typeof StorageEvent === "function"
    ? new StorageEvent("storage", detail)
    : Object.assign(new Event("storage"), detail);
  window.dispatchEvent(event);
};

const renderedPage = () => document.querySelector(".app main")?.dataset?.page || "";

export function reconcilePageRoute({ allowNativeFallback = true } = {}) {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const requested = readRequestedPage();
  if (!requested) return false;
  if (renderedPage() === requested) return true;
  dispatchPageState(requested);
  if (allowNativeFallback && renderedPage() !== requested) activateNativePageState(requested);
  return renderedPage() === requested;
}

const schedule = () => {
  if (typeof window === "undefined") return;
  const currentGeneration = ++generation;
  if (frame) window.cancelAnimationFrame(frame);
  let attempts = 0;
  const run = () => {
    frame = 0;
    if (currentGeneration !== generation) return;
    // Give the event/storage channel the first frame, then use the native App
    // button as a direct state bridge if the rendered page still disagrees.
    if (reconcilePageRoute({ allowNativeFallback: attempts > 0 })) return;
    attempts += 1;
    if (attempts < MAX_FRAMES) frame = window.requestAnimationFrame(run);
  };
  frame = window.requestAnimationFrame(run);
};

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowPageRouteReconcilerInstalled) {
  window.__seogrowPageRouteReconcilerInstalled = true;
  for (const eventName of ["hashchange", "popstate", "seogrow-locationchange"]) {
    window.addEventListener(eventName, schedule);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", schedule, { once: true });
  else schedule();
}
