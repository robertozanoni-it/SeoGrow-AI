import { changedFieldKeys } from './remediationPlanSafety.js';
import { remediationIssueKind } from './remediationIssueKind.js';

export const BATCH_LABELS = {
  PENDING: 'In attesa', PREFLIGHT: 'Preflight', PREPARED: 'Pronta per approvazione',
  IN_EXECUTION: 'In esecuzione', VERIFYING: 'Verifica in corso',
  RESOLVED_VERIFIED: 'Risolto e verificato', APPLIED_UNVERIFIED: 'Applicata, da verificare',
  FAILED: 'Fallita', SKIPPED: 'Saltata', BLOCKED: 'Bloccata', MANUAL_REQUIRED: 'Intervento assistito/manuale',
  STALE_TARGET: 'Risorsa cambiata', UNSUPPORTED: 'Non supportata', UNCERTAIN: 'Esito incerto: non ripetere',
};
export const stableBatchJson = value => JSON.stringify(value, (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const problemIssue = p => ({ type: p.issueType, label: p.title, detail: p.detail, sourceUrl: p.sourceUrl, targetUrl: p.targetUrls?.[0] || '' });
export function batchCapability(problem) {
  const kind = remediationIssueKind(problemIssue(problem));
  if (['resolved', 'intentional'].includes(problem.problemState)) return { state: 'SKIPPED', reason: 'Problema risolto o intenzionale.', kind };
  if (problem.ownershipBlocked) return { state: 'BLOCKED', reason: 'Ownership da chiarire nel flusso singolo.', kind };
  if (['applied', 'verified'].includes(problem.interventionState)) return { state: 'BLOCKED', reason: 'Esiste una modifica da verificare: non ripetere la scrittura.', kind };
  if (!kind || problem.correctability === 'not_supported') return { state: 'UNSUPPORTED', reason: 'Nessun adapter batch sicuro per questo problema.', kind };
  if (['archive', 'gdpr'].includes(problem.pageKind) || ['manual', 'assisted'].includes(problem.correctability)) return { state: 'MANUAL_REQUIRED', reason: 'Usa la revisione assistita del problema.', kind };
  return { state: 'PENDING', reason: 'Auto-fix con approvazione; disponibilità confermata dal preflight.', kind };
}
export function visibleBatchSelection(rows, keys) {
  const wanted = new Set(keys);
  return rows.filter(p => wanted.has(p.key));
}
export function createBatchRun({ clientId, siteUrl, clientName, problems, parentRunId = null, id = crypto.randomUUID(), now = new Date().toISOString() }) {
  if (!Number.isSafeInteger(Number(clientId)) || Number(clientId) <= 0) throw new Error('Progetto batch non valido.');
  const site = new URL(siteUrl);
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) throw new Error('Il batch richiede la base HTTPS esatta del sito.');
  const unique = [...new Map(problems.map(p => [p.key, p])).values()];
  if (!unique.length) throw new Error('Seleziona almeno un problema visibile.');
  return {
    schemaVersion: 1, id: `batch-${id}`, revision: 0, clientId: Number(clientId), clientName, siteUrl,
    createdAt: now, updatedAt: now, parentRunId, status: 'PLANNING', approval: null,
    cost: null, model: null, tokens: null, estimatedCost: null,
    entries: unique.map((p, index) => ({ id: `op-${index + 1}`, problem: structuredClone(p), ...batchCapability(p),
      problemKeys: [p.key], dependsOn: [], definitelyNoWrite: true, correctionId: `batch-${id}:op-${index + 1}`, logs: [] })),
  };
}
export function consolidateBatch(run) {
  const identical = new Map();
  for (const entry of run.entries.filter(e => e.state === 'PREPARED')) {
    const p = entry.preview;
    const key = stableBatchJson([p.resourceIdentity, p.plan.changes, p.data.previewBefore, p.data.previewAfter]);
    const previous = identical.get(key);
    if (previous) {
      previous.problemKeys.push(...entry.problemKeys);
      // A later live-preview invalidates an earlier overlapping token. Use the latest exact token.
      previous.preview = p;
      entry.state = 'SKIPPED'; entry.consolidatedInto = previous.id;
      entry.reason = `Consolidata in ${previous.id}: nessuna scrittura duplicata.`;
    } else identical.set(key, entry);
  }
  const fields = new Map();
  for (const entry of run.entries.filter(e => e.state === 'PREPARED')) {
    for (const field of changedFieldKeys(entry.preview.plan.changes)) {
      const key = `${entry.preview.resourceIdentity}:${field}`;
      const previous = fields.get(key);
      // Partial overlap is blocked even when a sub-field matches. Never merge opaque Elementor JSON.
      if (previous) {
        for (const conflict of [previous, entry]) {
          conflict.state = 'BLOCKED'; conflict.code = 'PREVIEW_CONFLICT';
          conflict.reason = `Proposte sovrapposte sul campo ${field}; revisionale singolarmente.`;
        }
      } else fields.set(key, entry);
    }
  }
  const prepared = run.entries.filter(e => e.state === 'PREPARED');
  for (const entry of prepared) {
    for (const other of prepared) {
      if (other.id === entry.id || other.preview.resourceIdentity !== entry.preview.resourceIdentity) continue;
      if ((entry.kind === 'external_link' && other.kind === 'canonical') || (entry.kind === 'h1' && other.kind === 'content')) entry.dependsOn.push(other.id);
    }
    entry.dependsOn = [...new Set(entry.dependsOn)];
  }
  try { batchExecutionOrder(prepared); }
  catch {
    for (const entry of prepared) { entry.state = 'BLOCKED'; entry.code = 'DEPENDENCY_CYCLE'; entry.reason = 'Dipendenze cicliche: esecuzione bloccata.'; }
  }
  return run;
}
export function batchExecutionOrder(entries) {
  const pending = new Map(entries.map(e => [e.id, e])), ordered = [];
  while (pending.size) {
    const next = [...pending.values()].find(e => e.dependsOn.every(id => !pending.has(id)));
    if (!next) throw new Error('DEPENDENCY_CYCLE');
    ordered.push(next); pending.delete(next.id);
  }
  return ordered;
}
export const approvalFingerprint = run => stableBatchJson([run.clientId, run.siteUrl,
  run.entries.filter(e => e.state === 'PREPARED').map(e => [e.id, e.problemKeys, e.dependsOn, e.highRisk,
    e.preview.resourceIdentity, e.preview.data.previewBefore, e.preview.data.previewAfter, e.preview.plan.changes, e.preview.contextSnapshot])]);
export function batchSummary(run) {
  const counts = {};
  for (const entry of run.entries) counts[entry.state] = (counts[entry.state] || 0) + 1;
  const operations = run.entries.filter(e => e.preview && !e.consolidatedInto);
  const applied = operations.filter(e => ['RESOLVED_VERIFIED', 'APPLIED_UNVERIFIED', 'VERIFYING'].includes(e.state));
  return { ...counts, selected: run.entries.length, operations: operations.length,
    applied: applied.length, pagesModified: new Set(applied.map(e => e.preview.resourceIdentity)).size,
    resolvedProblems: operations.filter(e => e.state === 'RESOLVED_VERIFIED').reduce((n, e) => n + e.problemKeys.length, 0),
    highRisk: operations.filter(e => e.state === 'PREPARED' && e.highRisk).length };
}
export function verificationState(result) {
  return result?.record?.status === 'Verificato' && result.record.writeConfirmed === true && result.record.frontendConfirmed === true &&
    !result.needsAudit && !result.needsBrowserVerification && !result.error ? 'RESOLVED_VERIFIED' : 'APPLIED_UNVERIFIED';
}
export function retryableProblemKeys(run) {
  const keys = new Set();
  for (const entry of run.entries) {
    if (entry.definitelyNoWrite === true && ['FAILED', 'STALE_TARGET', 'BLOCKED'].includes(entry.state) && entry.code !== 'PREVIEW_CONFLICT') {
      for (const key of entry.problemKeys) keys.add(key);
    }
  }
  return [...keys];
}
export function recoverBatchRun(run, corrections) {
  const next = structuredClone(run);
  if (!['RUNNING', 'PLANNING', 'APPROVING'].includes(next.status)) return next;
  const byId = new Map(corrections.map(c => [c.id, c]));
  for (const entry of next.entries) {
    if (['IN_EXECUTION', 'VERIFYING'].includes(entry.state)) {
      const record = byId.get(entry.correctionId);
      entry.state = record?.writeConfirmed === true ? verificationState({ record }) : 'UNCERTAIN';
      entry.definitelyNoWrite = false;
      entry.reason = 'Run interrotta: stato ricostruito dal journal; nessuna write ripetuta.';
    } else if (['PENDING', 'PREFLIGHT', 'PREPARED'].includes(entry.state)) {
      entry.state = 'BLOCKED'; entry.code = 'BATCH_INTERRUPTED';
      entry.reason = 'Run interrotta: serve un nuovo preflight e una nuova approvazione.';
    }
  }
  next.status = 'INTERRUPTED'; next.approval = null;
  return next;
}
