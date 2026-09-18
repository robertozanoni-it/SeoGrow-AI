const DEFAULT_RECURRENCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const severityRank = Object.freeze({ info: 0, warning: 1, error: 2, critical: 3 });

export function classifyProblemSignal(signal = {}, history = [], now = Date.now()) {
  const fingerprint = String(signal.fingerprint || "").trim();
  if (!fingerprint) return { accepted: false, reason: "missing-fingerprint" };

  const matching = history
    .filter((item) => item?.fingerprint === fingerprint)
    .toSorted((a, b) => Date.parse(b.lastSeenAt || b.at || 0) - Date.parse(a.lastSeenAt || a.at || 0));
  const latest = matching[0];
  const latestAt = Date.parse(latest?.lastSeenAt || latest?.at || 0);
  const recurring = Boolean(latest && Number.isFinite(latestAt) && now - latestAt <= DEFAULT_RECURRENCE_WINDOW_MS);
  const occurrences = matching.reduce((total, item) => total + Math.max(1, Number(item?.occurrences || 1)), 0) + 1;
  const priorResolved = matching.some((item) => item?.state === "resolved");
  const repeatedAfterResolution = recurring && priorResolved;

  let severity = signal.severity || "warning";
  if (repeatedAfterResolution && severityRank[severity] < severityRank.error) severity = "error";
  if (occurrences >= 5 && severityRank[severity] < severityRank.error) severity = "error";

  return {
    accepted: true,
    fingerprint,
    recurring,
    repeatedAfterResolution,
    occurrences,
    severity,
    suppressDuplicate: recurring && !repeatedAfterResolution,
    autoFixAllowed: !repeatedAfterResolution && occurrences < 5 && signal.autoFixEligible === true,
    rootCauseReviewRequired: repeatedAfterResolution || occurrences >= 5,
  };
}

export function detectProblemSignals({
  runtimeErrors = [],
  failedActions = [],
  persistenceErrors = [],
  reopenedProblems = [],
  integrationFailures = [],
} = {}) {
  return [
    ...runtimeErrors.map((item) => ({ ...item, family: "runtime" })),
    ...failedActions.map((item) => ({ ...item, family: "interaction" })),
    ...persistenceErrors.map((item) => ({ ...item, family: "persistence" })),
    ...reopenedProblems.map((item) => ({ ...item, family: "recurrence" })),
    ...integrationFailures.map((item) => ({ ...item, family: "integration" })),
  ].filter((item) => item?.fingerprint);
}
