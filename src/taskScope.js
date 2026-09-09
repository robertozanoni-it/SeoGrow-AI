import { isLegalPage } from './legalPageScope.js';

export function isLegalSeoTask(task) {
  return /^(?:h1|thin|content|title|description|meta-description|meta_description|duplicate-title|duplicate-description|canonical|canonical-different|indexability|noindex|orphan|broken-link|broken-external-link)$/.test(task.kind || '') &&
    isLegalPage(task.sourceUrl || task.targetUrl || '');
}

export function archiveLegalSeoTasks(tasks) {
  let changed = false;
  const next = tasks.map(task => {
    if (!isLegalSeoTask(task) || task.stale || task.status === 'Completato') return task;
    changed = true;
    return { ...task, stale: true, excludedFromSeo: true, archivedReason: 'Pagina legale esclusa dalle attività SEO; storico conservato.' };
  });
  return changed ? next : tasks;
}
