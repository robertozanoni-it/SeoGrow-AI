export const INTEGRATION_HEALTH = Object.freeze({
  HEALTHY: "healthy",
  STALE: "stale-verification",
  DEGRADED: "degraded",
  UNAVAILABLE: "unavailable",
  UNCONFIGURED: "unconfigured",
});

const DAY_MS = 86_400_000;
const ageDays = (value, now) => {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? Math.max(0, Math.floor((now - time) / DAY_MS)) : null;
};

export function integrationHealth(connection, { now = Date.now(), staleAfterDays = 7 } = {}) {
  if (!connection?.configured) return { state: INTEGRATION_HEALTH.UNCONFIGURED, ageDays: null, action: "configure" };
  if (connection.error) return { state: INTEGRATION_HEALTH.DEGRADED, ageDays: ageDays(connection.testedAt, now), action: "verify" };
  if (!connection.connected) return { state: INTEGRATION_HEALTH.UNAVAILABLE, ageDays: ageDays(connection.testedAt, now), action: "verify" };
  const age = ageDays(connection.testedAt, now);
  if (age === null || age > staleAfterDays) return { state: INTEGRATION_HEALTH.STALE, ageDays: age, action: "verify" };
  return { state: INTEGRATION_HEALTH.HEALTHY, ageDays: age, action: null };
}

export function buildIntegrationHealth(registry, options = {}) {
  const rows = (registry?.connections || []).map((connection) => ({
    ...connection,
    health: integrationHealth(connection, options),
  }));
  return {
    connections: rows,
    healthy: rows.filter((row) => row.health.state === INTEGRATION_HEALTH.HEALTHY).length,
    attention: rows.filter((row) => row.health.state !== INTEGRATION_HEALTH.HEALTHY).length,
    actions: rows
      .filter((row) => row.health.action)
      .map((row) => ({ kind: row.kind, label: row.label, action: row.health.action, state: row.health.state })),
  };
}
