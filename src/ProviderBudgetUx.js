import { apiFetch } from "./api.js";
import "./ProviderBudgetUx.css";

const PROVIDERS = {
  OpenAI: { statusPath: "/api/openai/status", configKey: "openai" },
  DataForSEO: { statusPath: "/api/dataforseo/status", configKey: "dataforseo" },
};

const money = (value, digits = 2) => Number.isFinite(Number(value)) ? `$${Number(value).toFixed(digits)}` : "—";

export function providerBudgetHealth(status = {}, config = {}) {
  const spent = Math.max(0, Number(status.monthlyCost || 0));
  const reserved = Math.max(0, Number(status.reservedCost || 0));
  const budget = Number(status.monthlyBudget);
  const validBudget = Number.isFinite(budget) && budget >= 0;
  const explicit = config?.explicit === true;
  const configured = status?.configured === true;
  const committed = spent + reserved;

  if (!configured) return {
    tone: "missing", label: "Credenziali mancanti", detail: "Configura il provider prima di usare funzioni a pagamento.",
    spent, reserved, budget: validBudget ? budget : null, remaining: validBudget && budget > 0 ? Math.max(0, budget - committed) : null, percent: 0, explicit,
  };
  if (!validBudget) return {
    tone: "danger", label: "Budget non valido", detail: "Correggi il limite mensile nel file .env.",
    spent, reserved, budget: null, remaining: null, percent: 0, explicit,
  };
  if (!explicit) return {
    tone: "missing", label: "Budget non impostato nel .env",
    detail: `SeoGrow sta usando il limite di sicurezza predefinito ${money(budget)}. Imposta esplicitamente il budget mensile.`,
    spent, reserved, budget, remaining: budget > 0 ? Math.max(0, budget - committed) : null,
    percent: budget > 0 ? Math.min(100, committed / budget * 100) : 0, explicit,
  };
  if (budget === 0) return {
    tone: "warning", label: "Nessun tetto mensile", detail: "Il budget è impostato a 0: il blocco mensile per costo è disattivato.",
    spent, reserved, budget, remaining: null, percent: 0, explicit,
  };
  const remaining = Math.max(0, budget - committed);
  const percent = Math.min(100, committed / budget * 100);
  if (remaining <= 0) return { tone: "danger", label: "Budget esaurito", detail: "Le nuove richieste a pagamento vengono bloccate.", spent, reserved, budget, remaining, percent, explicit };
  if (percent >= 80) return { tone: "warning", label: "Budget quasi esaurito", detail: `Rimane ${money(remaining)} prima del limite mensile.`, spent, reserved, budget, remaining, percent, explicit };
  return { tone: "ok", label: "Budget disponibile", detail: `Rimangono ${money(remaining)} nel limite mensile.`, spent, reserved, budget, remaining, percent, explicit };
}

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
  root.append(head, metrics, progress, copy);
  return true;
};

const loadJson = async (path) => {
  const response = await apiFetch(path);
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `Stato ${path} non disponibile`);
  return data;
};

export async function refreshProviderBudgets() {
  if (typeof document === "undefined") return false;
  const panels = Object.fromEntries(Object.keys(PROVIDERS).map((name) => [name, findPanel(name)]));
  if (!Object.values(panels).some(Boolean)) return false;
  try {
    const config = await loadJson("/api/provider-budget-config");
    await Promise.all(Object.entries(PROVIDERS).map(async ([name, provider]) => {
      const panel = panels[name];
      if (!panel) return;
      try {
        const status = await loadJson(provider.statusPath);
        renderBudget(panel, name, providerBudgetHealth(status, config[provider.configKey]));
      } catch (error) {
        renderBudget(panel, name, {
          tone: "danger", label: "Controllo budget non disponibile", detail: error.message || String(error),
          spent: 0, reserved: 0, budget: null, remaining: null, percent: 0,
        });
      }
    }));
    return true;
  } catch (error) {
    for (const [name, panel] of Object.entries(panels)) {
      if (!panel) continue;
      renderBudget(panel, name, {
        tone: "danger", label: "Configurazione budget non leggibile", detail: error.message || String(error),
        spent: 0, reserved: 0, budget: null, remaining: null, percent: 0,
      });
    }
    return false;
  }
}

let timer = 0;
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
    timer = window.setInterval(schedule, 30_000);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
  for (const eventName of ["hashchange", "seogrow-locationchange", "seogrow-storage-ok"]) window.addEventListener(eventName, schedule);
}
