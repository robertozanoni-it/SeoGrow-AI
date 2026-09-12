import { enforcePageStartHierarchy } from "./PageStartHierarchy.js";

const EXCLUDED = new Set(["Centro progetto", "Problemi"]);
const MAX_FRAMES = 180;
let frame = 0;
let generation = 0;

const pageFromHash = () => {
  try { return decodeURIComponent(window.location.hash.slice(1)) || "Panoramica"; }
  catch { return "Panoramica"; }
};

const cardReady = (page) => {
  const main = document.querySelector(".app main");
  if (!main || main.dataset.page !== page) return false;
  const host = main.querySelector(".card-workspace-host");
  return Boolean(host?.isConnected && host.querySelector(".card-workspace"));
};

export function recoverCardWorkspace() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const requested = pageFromHash();
  if (EXCLUDED.has(requested)) return;
  const ownGeneration = ++generation;
  if (frame) window.cancelAnimationFrame(frame);
  let attempts = 0;
  const tick = () => {
    frame = 0;
    if (ownGeneration !== generation) return;
    enforcePageStartHierarchy();
    if (cardReady(requested)) return;
    attempts += 1;
    if (attempts < MAX_FRAMES) frame = window.requestAnimationFrame(tick);
  };
  frame = window.requestAnimationFrame(tick);
}

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowCardWorkspaceRecoveryInstalled) {
  window.__seogrowCardWorkspaceRecoveryInstalled = true;
  for (const eventName of ["hashchange", "popstate", "seogrow-locationchange", "seogrow-storage-ok"]) {
    window.addEventListener(eventName, recoverCardWorkspace);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", recoverCardWorkspace, { once: true });
  else recoverCardWorkspace();
}
