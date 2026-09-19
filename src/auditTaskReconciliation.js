import { archiveLegalSeoTasks, isLegalSeoTask, normalizeTaskLinks } from './experience/tasks/index.js';
import { issueIdentity, normalizeHttpUrl } from './reliabilityModel.js';
import { auditCompatibilityIdentity } from './problemIdentityCompatibility.js';

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

const mergeLinks = (previous, current) => {
  const before = normalizeTaskLinks(previous);
  const after = normalizeTaskLinks(current);
  return {
    problemKey: after.problemKey || before.problemKey,
    correctionId: after.correctionId || before.correctionId,
    opportunityId: after.opportunityId || before.opportunityId,
    opportunityKey: after.opportunityKey || before.opportunityKey,
  };
};

// An absent finding in a partial crawl is not evidence of resolution.
export function reconcileAuditTasks(current, generated, clientId, observedAt) {
  const next = [...archiveLegalSeoTasks(current)];
  for (const rawTask of generated) {
    const task = normalizeGeneratedAuditTask(rawTask);
    if (isLegalSeoTask(task)) continue;
    const key = auditTaskIdentity(task);
    const compatibilityKey = auditCompatibilityIdentity(task);
    const exactMatches = (item) => !item.duplicateOf &&
      Number(item.sourceClientId) === Number(clientId) &&
      (auditTaskIdentity(item) === key ||
        next.some(alias => alias.duplicateOf === item.id &&
          Number(alias.sourceClientId) === Number(clientId) &&
          auditTaskIdentity(alias) === key));
    let index = next.findIndex(item => exactMatches(item) && !item.stale && item.status !== 'Completato');
    if (index < 0) index = next.findIndex(exactMatches);

    if (index < 0 && compatibilityKey) {
      const compatibleIndexes = next
        .map((item, candidateIndex) => ({ item, candidateIndex }))
        .filter(({ item }) =>
          !item.duplicateOf &&
          Number(item.sourceClientId) === Number(clientId) &&
          auditCompatibilityIdentity(item) === compatibilityKey,
        );
      const activeCompatible = compatibleIndexes.filter(({ item }) => !item.stale && item.status !== 'Completato');
      const candidates = activeCompatible.length ? activeCompatible : compatibleIndexes;
      const taskSource = normalizeHttpUrl(task.sourceUrl || task.targetUrl || "", { stripSlash: false });
      const exactUrlCandidates = candidates.filter(({ item }) =>
        normalizeHttpUrl(item.sourceUrl || item.targetUrl || "", { stripSlash: false }) === taskSource,
      );
      if (exactUrlCandidates.length === 1) index = exactUrlCandidates[0].candidateIndex;
      else if (candidates.length === 1) index = candidates[0].candidateIndex;
    }
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
      origin: task.origin || previous.origin || 'audit',
      automatic: task.automatic !== false,
      taskLinks: mergeLinks(previous.taskLinks, task.taskLinks),
      lastObservedAt: observedAt,
      stale: false,
      excludedFromSeo: false,
      staleReason: "",
      ...(reappeared ? {
        status: 'Da fare', regression: true, reopenedAt: observedAt,
        completedAt: '', completionReason: '', causeReconciled: false,
        previousCompletedAt: previous.completedAt || '',
      } : {}),
    };
  }
  return next;
}
