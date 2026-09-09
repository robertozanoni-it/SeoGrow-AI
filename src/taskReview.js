import { normalizeClientId } from './reliabilityModel.js';

export const missingCanonicalTask = task => task.kind === 'canonical' && /^canonical non rilevata$/i.test(task.title.trim());
export const activeClientTasks = (tasks, clientId) => {
  const client = normalizeClientId(clientId);
  return client ? tasks.filter(task => normalizeClientId(task.sourceClientId) === client && !task.stale && task.status !== 'Completato') : [];
};

export function completeVerifiedCanonicals(tasks, clientId, evidence, checkedAt) {
  const active = new Set(activeClientTasks(tasks, clientId));
  const ids = new Map();
  for (const task of tasks) ids.set(task.id, (ids.get(task.id) || 0) + 1);
  let changed = false;
  const next = tasks.map(task => {
    if (!active.has(task) || !task.id || ids.get(task.id) !== 1 || !missingCanonicalTask(task)) return task;
    const url = task.sourceUrl || task.targetUrl;
    const result = evidence.get(url);
    if (!result || result.ok !== true || result.status !== 200 || result.isHtml !== true ||
        result.url !== url || result.canonical !== url || result.canonicalCount !== 1) return task;
    changed = true;
    return { ...task, status: 'Completato', completedAt: checkedAt,
      completionReason: 'Verifica live: canonical presente e uguale all’URL della pagina.',
      canonicalVerification: { checkedAt, url, canonical: result.canonical, status: result.status } };
  });
  return changed ? next : tasks;
}
