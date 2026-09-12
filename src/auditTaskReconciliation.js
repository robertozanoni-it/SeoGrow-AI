import { archiveLegalSeoTasks, isLegalSeoTask } from './taskScope.js';
import { issueIdentity } from './reliabilityModel.js';

export const auditTaskIdentity = task => issueIdentity({
  issueType: task.kind,
  issueLabel: task.title,
  sourceUrl: task.sourceUrl || task.targetUrl || '',
  targetUrl: task.targetUrl || '',
});

const normalizeGeneratedAuditTask = task => {
  if (!task || task.kind === 'audit-summary') return task;
  const brokenLink = /^broken-(?:external-)?link$/i.test(String(task.kind || ''));
  if (brokenLink) return {
    ...task,
    sourceUrl: task.sourceUrl || '',
    targetUrl: task.targetUrl || '',
    linkLabel: 'Apri destinazione',
  };
  const sourceUrl = task.sourceUrl || task.targetUrl || '';
  return {
    ...task,
    sourceUrl,
    targetUrl: '',
    linkLabel: 'Apri pagina',
  };
};

// An absent finding in a partial crawl is not evidence of resolution.
export function reconcileAuditTasks(current, generated, clientId, observedAt) {
  const next = [...archiveLegalSeoTasks(current)];
  for (const rawTask of generated) {
    const task = normalizeGeneratedAuditTask(rawTask);
    if (isLegalSeoTask(task)) continue;
    const key = auditTaskIdentity(task);
    const matches = item => !item.duplicateOf && Number(item.sourceClientId) === Number(clientId) && (auditTaskIdentity(item) === key || next.some(alias => alias.duplicateOf === item.id && Number(alias.sourceClientId) === Number(clientId) && auditTaskIdentity(alias) === key));
    let index = next.findIndex(item => matches(item) && !item.stale && item.status !== 'Completato');
    if (index < 0) index = next.findIndex(matches);
    if (index < 0) { next.push(task); continue; }
    const previous = next[index];
    const reappeared = previous.status === 'Completato';
    next[index] = {
      ...previous,
      // Keep user-owned workflow fields (id, notes, due, current status) but
      // refresh every audit-owned field from the latest evidence. Otherwise a
      // task can display stale severity/title/URL while the Problems view is
      // already showing the new audit.
      title: task.title,
      client: task.client,
      sourceClientId: task.sourceClientId,
      priority: task.priority,
      kind: task.kind,
      targetUrl: task.targetUrl,
      sourceUrl: task.sourceUrl,
      linkLabel: task.linkLabel,
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
