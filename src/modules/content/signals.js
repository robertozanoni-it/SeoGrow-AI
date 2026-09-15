import { contentPlan } from "../../platform.js";

export function contentDecaySignals(dataset, analysis) {
  return [
    ...(dataset?.changes || []).filter((row) => row.clickDelta < 0),
    ...contentPlan(dataset, analysis).filter((row) => row.type === "Aggiornamento"),
  ].slice(0, 50);
}
