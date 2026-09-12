import { apiFetch } from "./api.js";
import { budgetMoney as money, providerBudgetHealth } from "./providerBudgetModel.js";
export { providerBudgetHealth } from "./providerBudgetModel.js";
import "./ProviderBudgetUx.css";

const PROVIDERS = {
  OpenAI: { statusPath: "/api/openai/status", configKey: "openai" },
  DataForSEO: { statusPath: "/api/dataforseo/status", configKey: "dataforseo" },
};

const AI_PROVIDER_COPY = {
  openai: {
    title: "OpenAI",
    subtitle: "Generazione protetta tramite API lato server.",
    configured: "Chiave configurata. Le richieste AI vengono inviate direttamente a OpenAI.",
    budgetTitle: "Budget OpenAI",
    budgetScope: "Budget locale di SeoGrow, non saldo o credito residuo dell’account OpenAI.",
  },
  openrouter: {
    title: "OpenRouter",
    subtitle: "Gateway OpenAI-compatible attivo tramite API lato server.",
    configured: "Chiave configurata. Le richieste AI vengono instradate tramite OpenRouter.",
    budgetTitle: "Budget AI / OpenRouter",
    budgetScope: "Stima locale SeoGrow; non rappresenta il saldo o il costo effettivo registrato da OpenRouter.",
  },
  omniroute: {
    title: "OmniRoute",
    subtitle: "Gateway AI locale OpenAI-compatible attivo su localhost:20128.",
    configured: "Chiave configurata. Le richieste AI vengono instradate tramite OmniRoute.",
    budgetTitle: "Budget AI / OmniRoute",
    budgetScope: "Stima locale SeoGrow; non rappresenta il saldo o il costo effettivo registrato da OmniRoute o dal provider a valle.",
  },
};

const providerCopy = (provider) => AI_PROVIDER_COPY[provider] || AI_PROVIDER_COPY.openai;

const findPanel = (name) => [...document.querySelectorAll(".panel.integration")]
  .find((panel) => {
    if (panel.dataset.integrationProvider === name) return true;
    const title = panel.querySelector("h2")?.textContent?.trim();
    if (name === "OpenAI") return ["OpenAI", "OpenRouter", "OmniRoute"].includes(title);
    return title === name;
  }) || null;

const line = (label, value) => {
  const row = document.createElement("span");
  const key = document.createElement("small");
  const strong = document.createElement("strong");
  key.textContent = label;
  strong.textContent = value;
  row.append(key, strong);
  return row;
};

const setTextPreservingIcons = (element, value) => {
  if (!element) return;
  const icons = [...element.children].filter((child) => child.tagName?.toLowerCase() === "svg");
  const current = element.textContent?.trim() || "";
  if (current === value && icons.length) return;
  element.replaceChildren(...icons, document.createTextNode(value));
};

const renderAiIdentity = (panel, identity, status = {}) => {
  if (!panel) return;
  const copy = providerCopy(identity);
  panel.dataset.integrationProvider = "OpenAI";
  panel.dataset.aiProvider = identity;

  const heading = panel.querySelector("h2");
  if (heading && heading.textContent !== copy.title) heading.textContent = copy.title;
  const subtitle = heading?.parentElement?.querySelector("p");
  if (subtitle && subtitle.textContent !== copy.subtitle) subtitle.textContent = copy.subtitle;

  const note = panel.querySelector(".integration-note");
  if (note?.classList.contains("configured-note")) setTextPreservingIcons(note, copy.configured);

  let route = panel.querySelector(".provider-ai-route-status");
  if (!route) {
    route = document.createElement("small");
    route.className = "settings-help provider-ai-route-status";
    const noteAnchor = panel.querySelector(".integration-note");
    if (noteAnchor) noteAnchor.insertAdjacentElement("afterend", route);
    else panel.appendChild(route);
  }
  const model = String(status.model || "configurato");
  const endpoint = identity === "omniroute"
    ? "localhost:20128"
    : identity === "openrouter"
      ? "openrouter.ai"
      : "api.openai.com";
  const routeText = `Provider: ${copy.title} · Modello richiesto: ${model} · Endpoint: ${endpoint}`;
  if (route.textContent !== routeText) route.textContent = routeText;
};

const renderBudget = (panel, name, health, identity = "openai") => {
  let root = panel.querySelector(`.provider-budget-status[data-provider="${name}"]`);
  const copy = name === "OpenAI" ? providerCopy(identity) : null;
  const fingerprint = JSON.stringify([
    health.tone, health.label, health.detail, health.spent, health.reserved,
    health.budget, health.remaining, Math.round(Number(health.percent || 0) * 100) / 100,
    identity,
  ]);
  if (root?.dataset.fingerprint === fingerprint) return false;
  if (!root) {
    root = document.createElement("section");
    root.className = "provider-budget-status";
    root.dataset.provider = name;
    const route = panel.querySelector(".provider-ai-route-status");
    const note = panel.querySelector(".integration-note");
    if (route) route.insertAdjacentElement("afterend", root);
    else if (note) note.insertAdjacentElement("afterend", root);
    else panel.appendChild(root);
  }
  root.dataset.fingerprint = fingerprint;
  root.className = `provider-budget-status ${health.tone}`;
  root.replaceChildren();

  const budgetLabel = copy?.budgetTitle || `Budget ${name}`;
  root.setAttribute("aria-label", budgetLabel);
  const head = document.createElement("div");
  head.className = "provider-budget-head";
  const title = document.createElement("strong");
  title.textContent = budgetLabel;
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
  progress.setAttribute("aria-label", `Utilizzo ${budgetLabel}`);
  const copyText = document.createElement("p");
  copyText.textContent = health.detail;
  const scopeNote = document.createElement("small");
  scopeNote.textContent = copy?.budgetScope || "Budget locale di SeoGrow, non saldo o credito residuo dell’account del provider.";
  root.append(head, metrics, progress, copyText, scopeNote);
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
let aiIdentity = "openai";
const cachedHealth = new Map();
const cachedStatus = new Map();
const unreadable = (label, error) => ({
  tone: "danger", label, detail: error.message || String(error),
  spent: null, reserved: null, budget: null, remaining: null, percent: 0,
});

const renderCached = () => {
  for (const [name, health] of cachedHealth) {
    const panel = findPanel(name);
    if (!panel) continue;
    if (name === "OpenAI") renderAiIdentity(panel, aiIdentity, cachedStatus.get(name));
    renderBudget(panel, name, health, name === "OpenAI" ? aiIdentity : "openai");
  }
};

export async function refreshProviderBudgets() {
  if (typeof document === "undefined" || !Object.keys(PROVIDERS).some(findPanel)) return false;
  if (inFlight) { await inFlight; renderCached(); return true; }
  if (checkedAt && Date.now() - checkedAt < 25_000) { renderCached(); return true; }
  inFlight = (async () => {
    try {
      const [config, capabilities] = await Promise.all([
        loadJson("/api/provider-budget-config"),
        loadJson("/api/wordpress/remediation-capabilities").catch(() => ({ aiProvider: "openai" })),
      ]);
      aiIdentity = ["openai", "openrouter", "omniroute"].includes(capabilities?.aiProvider)
        ? capabilities.aiProvider
        : "openai";
      await Promise.all(Object.entries(PROVIDERS).map(async ([name, provider]) => {
        try {
          const status = await loadJson(provider.statusPath);
          cachedStatus.set(name, status);
          cachedHealth.set(name, providerBudgetHealth(status, config[provider.configKey]));
        } catch (error) {
          cachedHealth.set(name, unreadable("Controllo budget non disponibile", error));
        }
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
