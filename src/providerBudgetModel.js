// Legacy compatibility shim for provider budget policy.
// System owns the provider budget implementation; existing consumers remain
// valid while the Suite migration proceeds.
export {
  budgetMoney,
  providerBudgetHealth,
} from "./system/providers/providerBudget.js";
