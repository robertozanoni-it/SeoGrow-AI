const HOOKED = Symbol.for("seogrow.providerBudgetConfigHook");

const budget = (key, fallback) => {
  const raw = process.env[key];
  const explicit = typeof raw === "string" && raw.trim() !== "";
  const value = Number(explicit ? raw : fallback);
  return {
    explicit,
    valid: Number.isFinite(value) && value >= 0,
    value: Number.isFinite(value) && value >= 0 ? value : null,
  };
};

export function providerBudgetConfig() {
  return {
    openai: budget("OPENAI_MONTHLY_BUDGET_USD", 10),
    dataforseo: budget("DATAFORSEO_MONTHLY_BUDGET_USD", 25),
  };
}

export function registerRoutes(app) {
  if (app[HOOKED]) return;
  app[HOOKED] = true;
  app.get("/api/provider-budget-config", (_req, res) => {
    res.json({ ok: true, ...providerBudgetConfig() });
  });
}
