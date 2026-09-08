export const MONITOR_KEY = "seogrow-audit-monitor-v1";
export function monitorConfig(value = {}) {
  const hours = [6, 12, 24, 168].includes(value?.hours) ? value.hours : 24;
  return { enabled: value?.enabled === true, hours };
}
export function freshness(timestamp, days, now) {
  const time = Date.parse(timestamp);
  if (!Number.isFinite(time) || time > now) return { state: "missing", label: "Data assente o non valida" };
  const age = Math.floor((now - time) / 86400000);
  return { state: now - time >= days * 86400000 ? "stale" : "fresh", label: `${age} giorni fa` };
}
export function dueAudit(clients, settings, records, now) {
  return clients.filter(client => {
    const config = monitorConfig(settings?.[client.id]?.monitor);
    if (!config.enabled) return false;
    try { const url = new URL(client.url); if (url.protocol !== "https:" || url.username || url.password) return false; } catch { return false; }
    const record = records?.[client.id];
    const last = record?.requestedUrl === client.url ? record.lastAttemptAt : null;
    if (!last) return true;
    const time = Date.parse(last);
    return Number.isFinite(time) && time <= now && now - time >= config.hours * 3600000;
  }).toSorted((a, b) => (Date.parse(records?.[a.id]?.lastAttemptAt) || 0) - (Date.parse(records?.[b.id]?.lastAttemptAt) || 0))[0];
}
export function auditSnapshot(data, now) {
  if (!data || typeof data.url !== "string" || !Array.isArray(data.issues) || !Number.isFinite(data.score)) throw new Error("Risposta audit non valida");
  return { url: data.url, fetchedAt: new Date(now).toISOString(), score: data.score, title: String(data.title || "").slice(0, 500), issues: data.issues.slice(0, 200).map(issue => ({ label: String(issue.label || "").slice(0, 500), severity: String(issue.severity || "") })) };
}
export function auditChanges(current, previous) {
  if (!previous || current.url !== previous.url) return { baseline: true, added: [], resolved: [], scoreDelta: null };
  const identity = issue => `${issue.severity}:${issue.label}`;
  const old = new Set(previous.issues.map(identity));
  const next = new Set(current.issues.map(identity));
  return { baseline: false, added: current.issues.filter(issue => !old.has(identity(issue))), resolved: previous.issues.filter(issue => !next.has(identity(issue))), scoreDelta: current.score - previous.score };
}
// One global browser lock; persist the attempt before the request. No unsafe fallback.
export async function runScheduledAudit({ locks, read, save, transport, now = Date.now, signal }) {
  if (!locks?.request || signal?.aborted) return { skipped: true };
  return locks.request("seogrow-public-audit-v1", { ifAvailable: true }, async lock => {
    if (!lock || signal?.aborted) return { skipped: true };
    const source = await read();
    const client = dueAudit(source.clients, source.settings, source.records, now());
    if (!client) return { skipped: true };
    const stored = source.records[client.id];
    const previous = stored?.requestedUrl === client.url ? stored : {};
    const attempt = new Date(now()).toISOString();
    const running = { ...previous, lastAttemptAt: attempt, requestedUrl: client.url, status: "running", error: "" };
    await save({ ...source.records, [client.id]: running });
    let result;
    try {
      if (signal?.aborted) throw new Error("Controllo interrotto");
      const response = await transport("/api/audit", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: client.url }), signal });
      const data = await response.json();
      if (signal?.aborted) throw new Error("Controllo interrotto");
      if (!response.ok) throw new Error(data.error || `Audit HTTP ${response.status}`);
      const snapshot = auditSnapshot(data, now());
      const baseline = previous.history?.[0];
      result = { ...running, status: "success", completedAt: snapshot.fetchedAt, changes: auditChanges(snapshot, baseline), history: [snapshot, ...(previous.history || [])].slice(0, 12) };
    } catch (error) { result = { ...running, status: "error", error: String(error.message || "Audit non riuscito").slice(0, 500) }; }
    const latest = await read();
    if (latest.generation !== source.generation || !latest.clients.some(item => item.id === client.id && item.url === client.url)) return { skipped: true };
    if (signal?.aborted && result.status === "success") result = { ...running, status: "error", error: "Controllo interrotto" };
    await save({ ...latest.records, [client.id]: result });
    return result;
  });
}

export function normalizeMonitorRecords(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, item]) => /^\d+$/.test(id) && item && typeof item === "object" && typeof item.requestedUrl === "string").map(([id, item]) => {
    const history = (Array.isArray(item.history) ? item.history : []).flatMap(snapshot => {
      try { const time = Date.parse(snapshot?.fetchedAt); return Number.isFinite(time) ? [auditSnapshot(snapshot, time)] : []; } catch { return []; }
    }).slice(0, 12);
    return [id, { requestedUrl: item.requestedUrl, lastAttemptAt: String(item.lastAttemptAt || ""), status: item.status === "success" && !history.length ? "error" : ["success", "running", "error"].includes(item.status) ? item.status : "error", error: item.status === "success" && !history.length ? "Storico del controllo non valido: risultato non verificabile." : String(item.error || "").slice(0, 500), completedAt: history[0]?.fetchedAt, history, changes: history[0] ? auditChanges(history[0], history[1]) : undefined }];
  }));
}
