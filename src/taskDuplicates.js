import { issueIdentity, normalizeClientId, normalizeHttpUrl } from './reliabilityModel.js';

const text = value => String(value || '').trim().toLocaleLowerCase('it');
const url = value => normalizeHttpUrl(value) || String(value || '').trim();
const auditKind = task => /^(?:title|h1|thin|duplicate-title|duplicate-description|description|meta-description|meta_description|canonical|canonical-different|noindex|indexability|broken-link|broken-external-link|orphan)$/.test(task.kind || '') ||
  (task.kind === 'content' && /contenuto breve|\d+ parole/i.test(task.title || ''));

export function sameTask(a, b) {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'search' && a.query && b.query) return text(a.query) === text(b.query);
  if (auditKind(a) && auditKind(b)) {
    const identity = task => issueIdentity({ issueType: task.kind, sourceUrl: task.sourceUrl || task.targetUrl, targetUrl: task.targetUrl });
    return Boolean(a.sourceUrl || a.targetUrl) && Boolean(b.sourceUrl || b.targetUrl) && identity(a) === identity(b);
  }
  return Boolean(text(a.title)) && text(a.title) === text(b.title) &&
    url(a.sourceUrl) === url(b.sourceUrl) && url(a.targetUrl) === url(b.targetUrl);
}

// Preserve every record, note and due date. The existing task undo restores this operation.
export function archiveDuplicateTasks(tasks, clientId, aliases = {}) {
  const client = normalizeClientId(clientId);
  if (!client) return tasks;
  const counts = new Map();
  for (const task of tasks) counts.set(task.id, (counts.get(task.id) || 0) + 1);
  const active = tasks.filter(task => task.id && counts.get(task.id) === 1 && normalizeClientId(task.sourceClientId) === client && !task.stale && task.status !== 'Completato');
  const weight = task => ({ 'In revisione': 3, 'In corso': 2, 'Da fare': 1 })[task.status] || 0;
  const comparable = task => {
    if (!/^(duplicate-title|duplicate-description|h1|thin)$/.test(task.kind)) return task;
    return { ...task, sourceUrl: aliases[task.sourceUrl] || task.sourceUrl, targetUrl: aliases[task.targetUrl] || task.targetUrl };
  };
  const kept = [];
  const duplicates = new Map();
  for (const task of [...active].sort((a, b) => weight(b) - weight(a))) {
    const existing = kept.find(item => item.id !== task.id && sameTask(comparable(item), comparable(task)));
    if (existing) duplicates.set(task.id, existing.id);
    else kept.push(task);
  }
  if (!duplicates.size) return tasks;
  return tasks.map(task => duplicates.has(task.id) ? { ...task, stale: true, duplicateOf: duplicates.get(task.id), staleReason: 'Duplicato archiviato; note e dati conservati.' } : task);
}
