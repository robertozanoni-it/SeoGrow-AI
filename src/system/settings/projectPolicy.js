const text = (value) => String(value ?? "").trim();
const bool = (value, fallback) => typeof value === "boolean" ? value : fallback;
const integer = (value, fallback, min, max) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
};
const list = (value, max = 40) => Array.isArray(value)
  ? [...new Set(value.map(text).filter(Boolean))].slice(0, max)
  : [];

export const DEFAULT_PROJECT_POLICY = Object.freeze({
  audit: Object.freeze({
    excludeLegalPages: true,
    excludedPaths: Object.freeze([]),
  }),
  corrections: Object.freeze({
    requireApproval: true,
    allowAutoPrepareLowRisk: true,
  }),
  writeSecurity: Object.freeze({
    writesEnabled: true,
    requirePreview: true,
    requireFreshPreflight: true,
    requireRollbackReceipt: true,
  }),
  retention: Object.freeze({
    auditRuns: 20,
    rankingRuns: 20,
    agentRuns: 20,
    geoSnapshots: 24,
    correctionRecords: 500,
  }),
  featureFlags: Object.freeze({
    geoDiagnostics: true,
    batchAutoFix: true,
    editorialGeneration: true,
  }),
});

export function normalizeProjectPolicy(value = {}) {
  const audit = value?.audit && typeof value.audit === "object" ? value.audit : {};
  const corrections = value?.corrections && typeof value.corrections === "object" ? value.corrections : {};
  const writeSecurity = value?.writeSecurity && typeof value.writeSecurity === "object" ? value.writeSecurity : {};
  const retention = value?.retention && typeof value.retention === "object" ? value.retention : {};
  const featureFlags = value?.featureFlags && typeof value.featureFlags === "object" ? value.featureFlags : {};
  return {
    audit: {
      excludeLegalPages: bool(audit.excludeLegalPages, DEFAULT_PROJECT_POLICY.audit.excludeLegalPages),
      excludedPaths: list(audit.excludedPaths),
    },
    corrections: {
      requireApproval: true,
      allowAutoPrepareLowRisk: bool(corrections.allowAutoPrepareLowRisk, DEFAULT_PROJECT_POLICY.corrections.allowAutoPrepareLowRisk),
    },
    writeSecurity: {
      writesEnabled: bool(writeSecurity.writesEnabled, DEFAULT_PROJECT_POLICY.writeSecurity.writesEnabled),
      // These are safety invariants, shown in Settings but not weakenable by project configuration.
      requirePreview: true,
      requireFreshPreflight: true,
      requireRollbackReceipt: true,
    },
    retention: {
      auditRuns: integer(retention.auditRuns, DEFAULT_PROJECT_POLICY.retention.auditRuns, 1, 100),
      rankingRuns: integer(retention.rankingRuns, DEFAULT_PROJECT_POLICY.retention.rankingRuns, 1, 100),
      agentRuns: integer(retention.agentRuns, DEFAULT_PROJECT_POLICY.retention.agentRuns, 1, 100),
      geoSnapshots: integer(retention.geoSnapshots, DEFAULT_PROJECT_POLICY.retention.geoSnapshots, 1, 100),
      correctionRecords: integer(retention.correctionRecords, DEFAULT_PROJECT_POLICY.retention.correctionRecords, 50, 2000),
    },
    featureFlags: {
      geoDiagnostics: bool(featureFlags.geoDiagnostics, DEFAULT_PROJECT_POLICY.featureFlags.geoDiagnostics),
      batchAutoFix: bool(featureFlags.batchAutoFix, DEFAULT_PROJECT_POLICY.featureFlags.batchAutoFix),
      editorialGeneration: bool(featureFlags.editorialGeneration, DEFAULT_PROJECT_POLICY.featureFlags.editorialGeneration),
    },
  };
}

export function projectPolicyFromPreferences(preferences, clientId) {
  const id = Number(clientId);
  const project = preferences?.projectSettings?.[id] ?? preferences?.projectSettings?.[String(id)] ?? {};
  return normalizeProjectPolicy(project?.suitePolicy);
}

export function writeProjectPolicy(preferences, clientId, policy) {
  const id = Number(clientId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Progetto non valido per le impostazioni.");
  const currentProjects = preferences?.projectSettings && typeof preferences.projectSettings === "object"
    ? preferences.projectSettings
    : {};
  const current = currentProjects[id] ?? currentProjects[String(id)] ?? {};
  return {
    ...(preferences && typeof preferences === "object" ? preferences : {}),
    projectSettings: {
      ...currentProjects,
      [id]: {
        ...current,
        suitePolicy: normalizeProjectPolicy(policy),
      },
    },
  };
}

export function pathExcludedByProjectPolicy(url, policy) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(String(url || "")).pathname).toLocaleLowerCase("it"); }
  catch { return false; }
  return normalizeProjectPolicy(policy).audit.excludedPaths.some((pattern) => {
    const normalized = text(pattern).toLocaleLowerCase("it");
    if (!normalized) return false;
    return pathname === normalized || pathname.startsWith(normalized.endsWith("/") ? normalized : `${normalized}/`);
  });
}

export function projectWriteAllowed(policy) {
  return normalizeProjectPolicy(policy).writeSecurity.writesEnabled === true;
}

export function projectFeatureEnabled(policy, feature) {
  const normalized = normalizeProjectPolicy(policy);
  return Object.prototype.hasOwnProperty.call(normalized.featureFlags, feature)
    ? normalized.featureFlags[feature] === true
    : false;
}

export const USER_CONTROLLABLE_SETTINGS = Object.freeze([
  "audit.excludedPaths",
  "writeSecurity.writesEnabled",
  "corrections.allowAutoPrepareLowRisk",
  "retention.auditRuns",
  "retention.rankingRuns",
  "retention.agentRuns",
  "retention.geoSnapshots",
  "retention.correctionRecords",
  "featureFlags.geoDiagnostics",
  "featureFlags.batchAutoFix",
  "featureFlags.editorialGeneration",
]);

export const SERVER_ONLY_CONFIGURATION = Object.freeze([
  "provider credentials and OAuth secrets",
  "local API token",
  "provider billing/runtime limits",
  "network ports and security origins",
]);
