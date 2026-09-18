import { availableSuiteCapabilities } from "./core/modules/capabilityRegistry.js";

export const EVOLUTION_KIND = Object.freeze({
  CONTROL: "control",
  AUTOMATION: "automation",
  PERFORMANCE: "performance",
  CAPABILITY: "capability",
  UX: "ux",
  RELIABILITY: "reliability",
});

const text = (value) => String(value || "").trim();
const keyFor = (proposal) => [proposal.kind, proposal.owner, proposal.signal, proposal.title].map((value) => text(value).toLowerCase()).join("|");

export function discoverCapabilityCandidates({
  repeatedManualActions = [],
  recurringIncidents = [],
  performanceSignals = [],
  visualFindings = [],
  missingCapabilities = [],
} = {}) {
  const known = new Set(availableSuiteCapabilities().map((entry) => entry.key));
  const proposals = [];

  for (const item of repeatedManualActions) if (Number(item.count) >= 3) proposals.push({
    kind: EVOLUTION_KIND.AUTOMATION, owner: text(item.owner), signal: text(item.id),
    title: `Automatizza: ${text(item.label || item.id)}`, evidence: `${item.count} esecuzioni manuali ripetute`,
    risk: "review", autoImplement: false,
  });
  for (const item of recurringIncidents) if (Number(item.occurrences) >= 3) proposals.push({
    kind: EVOLUTION_KIND.RELIABILITY, owner: text(item.owner || "guardian"), signal: text(item.code),
    title: `Aggiungi controllo per ${text(item.code)}`, evidence: `${item.occurrences} ricorrenze osservate`,
    risk: "review", autoImplement: false,
  });
  for (const item of performanceSignals) if (Number(item.regressionPct) >= 10) proposals.push({
    kind: EVOLUTION_KIND.PERFORMANCE, owner: text(item.owner), signal: text(item.id),
    title: `Ottimizza ${text(item.label || item.id)}`, evidence: `Regressione osservata: ${Number(item.regressionPct)}%`,
    risk: "review", autoImplement: false,
  });
  for (const item of visualFindings) if (Number(item.occurrences) >= 3) proposals.push({
    kind: EVOLUTION_KIND.UX, owner: text(item.owner || "visual-ux"), signal: text(item.code),
    title: `Riduci il finding UX ${text(item.code)}`, evidence: `${item.occurrences} osservazioni visuali`,
    risk: "review", autoImplement: false,
  });
  for (const item of missingCapabilities) {
    const capabilityKey = text(item.key);
    if (!capabilityKey || known.has(capabilityKey)) continue;
    proposals.push({
      kind: EVOLUTION_KIND.CAPABILITY, owner: text(item.owner), signal: capabilityKey,
      title: `Valuta capability ${capabilityKey}`, evidence: text(item.evidence || "Capability richiesta ma non disponibile nel registry"),
      risk: "review", autoImplement: false,
    });
  }

  return [...new Map(proposals.map((proposal) => [keyFor(proposal), proposal])).values()]
    .map((proposal, index) => ({ ...proposal, id: `evolution-${index + 1}`, state: "candidate" }));
}

export function mergeCapabilityBacklog(existing = [], discovered = []) {
  const byKey = new Map(existing.map((item) => [keyFor(item), item]));
  for (const proposal of discovered) {
    const key = keyFor(proposal);
    const previous = byKey.get(key);
    byKey.set(key, previous ? { ...previous, evidence: proposal.evidence, lastObservedAt: proposal.lastObservedAt || new Date().toISOString() } : proposal);
  }
  return [...byKey.values()];
}
