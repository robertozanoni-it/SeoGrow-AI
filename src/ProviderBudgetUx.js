import { apiFetch } from "./api.js";
import { budgetMoney as money, providerBudgetHealth } from "./providerBudgetModel.js";
export { providerBudgetHealth } from "./providerBudgetModel.js";
import "./ProviderBudgetUx.css";

const PROVIDERS = {
  OpenAI: { statusPath: "/api/openai/status", configKey: "openai" },
  DataForSEO: { statusPath: "/api/dataforseo/status", configKey: "dataforseo" },
};



const findPanel = (name) => [...document.querySelectorAll(".panel.integration")]
  .find((panel) => panel.querySelector("h2")?.textContent?.trim() === name) || null;

const line = (label, value) => {
  const row = document.createElement("span");
  const key = document.createElement("small");
  const strong = document.createElement("strong");
  key.textContent = label;
  strong.textContent = value;
  row.append(key, strong);
  return row;
};

const renderBudget = (panel, name, health) => {
  let root = panel.querySelector(`.provider-budget-status[data-provider="${name}"]`);
  const fingerprint = JSON.stringify([
    health.tone, health.label, health.detail, health.spent, health.reserved,
    health.budget, health.remaining, Math.round(Number(health.percent || 0) * 100) / 100,
  ]);
  if (root?.dataset.fingerprint === fingerprint) return false;
  if (!root) {
    root = document.createElement("section");
    root.className = "provider-budget-status";
    root.dataset.provider = name;
    root.setAttribute("aria-label", `Budget ${name}`);
    const note = panel.querySelector(".integration-note");
    if (note) note.insertAdjacentElement("afterend", root);
    else panel.appendChild(root);
  }
  root.dataset.fingerprint = fingerprint;
  root.className = `provider-budget-status ${health.tone}`;
  root.replaceChildren();

  const head = document.createElement("div");
  head.className = "provider-budget-head";
  const title = document.createElement("strong");
  title.textContent = `Budget ${name}`;
  const badge = document.createElement("span");
  badge.textContent = health.label;
  head.append(title, badge);

  const metrics = document.createElement("div");
  metrics.className = "provider-budget-metrics";
  metrics.append(
    line("Speso", money(health.spent, 4)),
    line("Prenotato", money(health.reserved, 4)),
    line("Limite", health.budget === 0 ? "Nessun tetto" : money(health.budget)),
    line("Residuo", health.remaining == null ? "—" : money(health.remaining)),
  );

  const progress = document.createElement("progress");
  progress.max = 100;
  progress.value = health.percent;
  progress.setAttribute("aria-label", `Utilizzo budget ${name}`);
  const copy = document.createElement("p");
  copy.textContent = health.detail;
  const scopeNote = document.createElement("small");
  scopeNote.textContent = "Budget locale di SeoGrow, non saldo o credito residuo dell’account del provider.";
  root.append(head, metrics, progress, copy, scopeNote);
  return true;
};

const loadJson = async (path) => {
  const response = await apiFetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `Stato ${path} non disponibile`);
  return data;
};

let inFlight = null;
let checkedAt = 0;
const cachedHealth = new Map();
const unreadable = (label, error) => ({
  tone: "danger", label, detail: error.message || String(error),
  spent: null, reserved: null, budget: null, remaining: null, percent: 0,
});
const renderCached = () => {
  for (const [name, health] of cachedHealth) {
    const panel = findPanel(name);
    if (panel) renderBudget(panel, name, health);
  }
};
export async function refreshProviderBudgets() {
  if (typeof document === "undefined" || !Object.keys(PROVIDERS).some(findPanel)) return false;
  if (inFlight) { await inFlight; renderCached(); return true; }
  if (checkedAt && Date.now() - checkedAt < 25_000) { renderCached(); return true; }
  inFlight = (async () => {
    try {
      const config = await loadJson("/api/provider-budget-config");
      await Promise.all(Object.entries(PROVIDERS).map(async ([name, provider]) => {
        try {
          const status = await loadJson(provider.statusPath);
          cachedHealth.set(name, providerBudgetHealth(status, config[provider.configKey]));
        } catch (error) { cachedHealth.set(name, unreadable("Controllo budget non disponibile", error)); }
      }));
    } catch (error) {
      for (const name of Object.keys(PROVIDERS)) cachedHealth.set(name, unreadable("Configurazione budget non leggibile", error));
    } finally { checkedAt = Date.now(); }
  })();
  try { await inFlight; renderCached(); return true; }
  finally { inFlight = null; }
}

let frame = 0;
const schedule = () => {
  if (typeof window === "undefined" || frame) return;
  frame = window.requestAnimationFrame(() => {
    frame = 0;
    refreshProviderBudgets();
  });
};

if (typeof window !== "undefined" && typeof document !== "undefined" && !window.__seogrowProviderBudgetUxInstalled) {
  window.__seogrowProviderBudgetUxInstalled = true;
  const observer = new MutationObserver(() => schedule());
  const start = () => {
    observer.observe(document.getElementById("root") || document.documentElement, { childList: true, subtree: true });
    schedule();
    window.setInterval(schedule, 30_000);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  for (const eventName of ["hashchange", "seogrow-locationchange", "seogrow-storage-ok"]) window.addEventListener(eventName, schedule);
}
