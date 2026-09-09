import { issueIdentity } from './reliabilityModel.js';

export const auditTaskIdentity = task => issueIdentity({
  issueType: task.kind,
  issueLabel: task.title,
  sourceUrl: task.sourceUrl || task.targetUrl || '',
  targetUrl: task.targetUrl || '',
});

// An absent finding in a partial crawl is not evidence of resolution.
export function reconcileAuditTasks(current, generated, clientId, observedAt) {
  const next = [...current];
  for (const task of generated) {
    const key = auditTaskIdentity(task);
    const matches = item => !item.duplicateOf && Number(item.sourceClientId) === Number(clientId) && auditTaskIdentity(item) === key;
    let index = next.findIndex(item => matches(item) && !item.stale && item.status !== 'Completato');
    if (index < 0) index = next.findIndex(matches);
    if (index < 0) { next.push(task); continue; }
    const previous = next[index];
    const reappeared = previous.status === 'Completato';
    next[index] = {
      ...previous,
      detail: task.detail,
      lastObservedAt: observedAt,
      ...(reappeared ? {
        status: 'Da fare', regression: true, reopenedAt: observedAt,
        completedAt: '', completionReason: '',
        previousCompletedAt: previous.completedAt || '',
      } : {}),
    };
  }
  return next;
}
