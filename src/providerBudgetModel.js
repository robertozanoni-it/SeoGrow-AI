import { observedNumber } from "./observedAuditData.js";
export const budgetMoney = (value, digits = 2) => observedNumber(value) === null ? "—" : `$${Number(value).toFixed(digits)}`;
const money = budgetMoney;

export function providerBudgetHealth(status = {}, config = {}) {
  const spent = observedNumber(status.monthlyCost);
  const reserved = observedNumber(status.reservedCost);
  const budget = observedNumber(status.monthlyBudget);
  const validBudget = budget !== null;
  const explicit = config?.explicit === true;
  const configured = status?.configured === true;
  const committed = spent !== null && reserved !== null ? spent + reserved : null;

  if (!configured) return {
    tone: "missing", label: "Credenziali mancanti", detail: "Configura il provider prima di usare funzioni a pagamento.",
    spent, reserved, budget: validBudget ? budget : null, remaining: validBudget && budget > 0 && committed !== null ? Math.max(0, budget - committed) : null, percent: 0, explicit,
  };
  if (!validBudget) return {
    tone: "danger", label: "Budget non valido", detail: "Correggi il limite mensile nel file .env.",
    spent, reserved, budget: null, remaining: null, percent: 0, explicit,
  };
  if (committed === null) return {
    tone: "warning", label: "Spesa non disponibile", detail: "Il registro non ha restituito spesa e prenotazioni verificabili. Nessun residuo presunto.",
    spent, reserved, budget, remaining: null, percent: 0, explicit,
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

