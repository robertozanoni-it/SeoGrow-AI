import { workspaceStorage } from "./workspaceDatabase.js";

const SELECTED_PAGE_KEY = "seogrow-selected-page-v1";
const MAX_FRAMES = 120;
let frame = 0;
let generation = 0;

const readRequestedPage = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};

const dispatchPageState = (page) => {
  const serialized = JSON.stringify(page);
  // Persist the requested route before notifying React. If a page subtree
  // remounts while navigation events are in flight, useStoredState must read
  // the same page that is already present in the URL instead of reviving the
  // previous screen from storage.
  try {
    if (workspaceStorage.getItem(SELECTED_PAGE_KEY) !== serialized) {
      workspaceStorage.setItem(SELECTED_PAGE_KEY, serialized);
    }
  } catch {
    // The event below can still reconcile the live session when persistence is
    // unavailable; storage failures are handled by the workspace layer.
  }
  const detail = { key: SELECTED_PAGE_KEY, newValue: serialized };
  const event = typeof StorageEvent === "function"
    ? new StorageEvent("storage", detail)
    : Object.assign(new Event("storage"), detail);
  window.dispatchEvent(event);
};

const renderedPage = () => document.querySelector(".app main")?.dataset?.page || "";

export function reconcilePageRoute() {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  const requested = readRequestedPage();
  if (!requested) return false;
  if (renderedPage() === requested) return true;
  dispatchPageState(requested);
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
    if (reconcilePageRoute()) return;
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
