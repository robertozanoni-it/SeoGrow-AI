import { normalizeClientId } from './reliabilityModel.js';

export const AUTO_FIX_LIMIT = 10;

export function classifyAutoFix(issue = {}, siteUrl = '', auditUrl = '') {
  const text = `${issue.type || ''} ${issue.label || ''} ${issue.detail || ''}`.toLowerCase();
  const manual = reason => ({ level: 'manual', reason });
  try {
    const target = new URL(issue.targetUrl || issue.url || auditUrl || siteUrl);
    const site = new URL(siteUrl);
    if (!['http:', 'https:'].includes(target.protocol) || target.origin !== site.origin || target.username || target.password) return manual('Destinazione esterna o non valida: verifica manuale.');
  } catch { return manual('Manca una destinazione verificabile.'); }
  if (/canonical|noindex|robots|indexability|redirect|sitemap|tassonom|elementor|elimin|struttura/.test(text)) return manual('Richiede una verifica specifica di intento, struttura o compatibilità.');
  if (/title|titolo|meta description|h1|excerpt|estratto|contenuto|content/.test(text)) {
    return { level: 'approval', reason: 'Prepara una proposta; controlla Prima/Dopo e approva singolarmente. Disponibilità da verificare su WordPress.' };
  }
  return manual('Nessuna correzione deterministica supportata in questa versione.');
}

export function buildAutoFixPlan({ clientId, siteUrl, auditType, audit, tasks = [], clients = [] }) {
  const issues = Array.isArray(audit?.issues) ? audit.issues : [];
  const entries = issues.map((issue, index) => ({ index, issue, ...classifyAutoFix(issue || {}, siteUrl, audit?.url) }));
  const ids = new Set(clients.map(c => normalizeClientId(c.id)));
  const projectTasks = tasks.filter(t => normalizeClientId(t.sourceClientId) === normalizeClientId(clientId));
  const counts = new Map();
  for (const task of projectTasks) counts.set(task.id, (counts.get(task.id) || 0) + 1);
  return {
    clientId: normalizeClientId(clientId), auditType, analyzedAt: audit?.analyzedAt || audit?.startedAt || '',
    fingerprint: JSON.stringify(audit), siteUrl, entries,
    diagnostics: {
      duplicateIds: [...counts.values()].filter(n => n > 1).length,
      orphanTasks: tasks.filter(t => t.sourceClientId && !ids.has(normalizeClientId(t.sourceClientId))).length,
    },
  };
}

export function selectedAutoFixIssues(plan, indexes, { clientId, audit }) {
  if (!plan || normalizeClientId(clientId) !== plan.clientId || JSON.stringify(audit) !== plan.fingerprint) throw new Error('Il progetto o i dati dell’audit sono cambiati. Analizza nuovamente prima di continuare.');
  if (!Array.isArray(indexes) || !indexes.length || indexes.length > AUTO_FIX_LIMIT || new Set(indexes).size !== indexes.length) throw new Error('Seleziona da 1 a 10 problemi distinti.');
  return indexes.map(index => {
    const entry = plan.entries.find(e => e.index === index);
    if (!Number.isSafeInteger(index) || !entry || entry.level !== 'approval' || classifyAutoFix(audit.issues[index], plan.siteUrl, audit.url).level !== 'approval') throw new Error('Il problema selezionato richiede intervento manuale.');
    return audit.issues[index];
  });
}
