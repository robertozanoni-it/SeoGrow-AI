import { changedFieldKeys } from './remediationPlanSafety.js';
import { remediationIssueKind } from './remediationIssueKind.js';
import { hasAutoFixCompletionEvidence } from './autoFixCompletionEvidence.js';

export const BATCH_LABELS = {
  PENDING: 'In attesa', PREFLIGHT: 'Preflight', PREPARED: 'Pronta per approvazione',
  IN_EXECUTION: 'In esecuzione', VERIFYING: 'Verifica in corso',
  RESOLVED_VERIFIED: 'Risolto e verificato', APPLIED_UNVERIFIED: 'Applicata, da verificare',
  FAILED: 'Fallita', SKIPPED: 'Saltata', BLOCKED: 'Bloccata', MANUAL_REQUIRED: 'Intervento assistito/manuale',
  MANAGED_ASSISTED: 'Gestito in batch', STALE_TARGET: 'Risorsa cambiata', UNSUPPORTED: 'Non supportata', UNCERTAIN: 'Esito incerto: non ripetere',
};

export const BATCH_RISK_LABELS = {
  read_only: 'Sola lettura',
  standard: 'Ordinario',
  high: 'Alto',
  assisted: 'Assistito / manuale',
};

const RISK_RANK = { read_only: 0, standard: 1, high: 2, assisted: 3 };
const DIRECT_KINDS = new Set(['title', 'meta_description', 'h1', 'content', 'excerpt', 'canonical', 'noindex', 'external_link']);
const HIGH_RISK_KINDS = new Set(['canonical', 'noindex', 'h1', 'content', 'external_link']);

export const stableBatchJson = value => JSON.stringify(value, (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
export const problemIssue = p => ({ type: p.issueType, label: p.title, detail: p.detail, sourceUrl: p.sourceUrl, targetUrl: p.targetUrls?.[0] || '' });
const batchIssueType = problem => String(problem?.issueType || '').trim().toLowerCase();
export const batchIssueKind = problem => {
  const type = batchIssueType(problem);
  if (type === 'url-alias') return 'url_alias';
  if (type === 'broken-link') return 'external_link';
  return remediationIssueKind(problemIssue(problem));
};
const controlledReviewType = problem => ['canonical-different', 'description-serp-width', 'url-alias'].includes(batchIssueType(problem));

export function batchRiskGroup(problem) {
  const kind = batchIssueKind(problem);
  if (['resolved', 'intentional'].includes(problem?.problemState)) return 'read_only';
  if (batchIssueType(problem) === 'url-alias') return 'read_only';
  if (String(problem?.correctability || '').trim().toLowerCase() === 'manual') return 'assisted';
  if (problem?.ownershipBlocked || problem?.interventionState === 'applied' || ['archive', 'taxonomy', 'gdpr'].includes(problem?.pageKind)) return 'assisted';
  if (!kind || (!DIRECT_KINDS.has(kind) && !controlledReviewType(problem))) return 'assisted';
  return HIGH_RISK_KINDS.has(kind) ? 'high' : 'standard';
}

export function batchCapability(problem) {
  const kind = batchIssueKind(problem);
  const riskGroup = batchRiskGroup(problem);
  if (['resolved', 'intentional'].includes(problem.problemState)) return { state: 'SKIPPED', reason: 'Problema risolto o intenzionale.', kind, riskGroup };
  if (String(problem?.correctability || '').trim().toLowerCase() === 'manual') return { state: 'PENDING', reason: 'Problema dichiarato manuale: il batch prepara un intervento assistito senza write automatica.', kind: kind || 'assisted', batchMode: 'assisted_task', riskGroup: 'assisted' };
  if (problem.ownershipBlocked) return { state: 'PENDING', reason: 'Ownership non dimostrata: il batch crea automaticamente un intervento assistito senza scritture cieche.', kind: kind || 'assisted', batchMode: 'assisted_task', riskGroup };
  const reobservedAfterVerification = problem.interventionState === 'verified' && ['needs_verification', 'reappeared'].includes(problem.problemState);
  if (problem.interventionState === 'applied') return { state: 'PENDING', reason: 'Esiste una modifica da verificare: il batch crea un intervento di verifica senza ripetere la scrittura.', kind: kind || 'assisted', batchMode: 'assisted_task', riskGroup };
  if (problem.interventionState === 'verified' && !reobservedAfterVerification) return { state: 'SKIPPED', reason: 'Finding già verificato e senza nuova osservazione: nessuna azione necessaria.', kind, riskGroup: 'read_only' };
  if (['archive', 'taxonomy', 'gdpr'].includes(problem.pageKind)) return { state: 'PENDING', reason: 'Gestione batch assistita: il sistema prepara automaticamente un intervento/task senza scritture cieche.', kind: kind || 'assisted', batchMode: 'assisted_task', riskGroup };
  if (controlledReviewType(problem)) {
    const reason = batchIssueType(problem) === 'url-alias'
      ? 'Verifica batch in sola lettura: se alias, ID WordPress e canonical sono coerenti il segnale viene chiuso senza scritture.'
      : batchIssueType(problem) === 'canonical-different'
        ? 'Verifica batch della canonical; se non è un alias intenzionale prepara una proposta self-canonical ad alto rischio da approvare.'
        : 'La meta description può essere rigenerata in batch e richiede anteprima/approvazione prima della scrittura.';
    return { state: 'PENDING', reason, kind, riskGroup };
  }
  if (kind && DIRECT_KINDS.has(kind)) {
    return {
      state: 'PENDING',
      reason: HIGH_RISK_KINDS.has(kind)
        ? 'Auto-fix condizionale: il preflight deve dimostrare target e ownership univoci prima di preparare la modifica.'
        : 'Auto-fix diretto: il preflight prepara una modifica verificabile sul campo corretto.',
      kind,
      batchMode: 'direct_preflight',
      riskGroup,
    };
  }
  return { state: 'PENDING', reason: 'Gestione batch assistita: il sistema prepara automaticamente un intervento/task senza scritture cieche.', kind: kind || 'assisted', batchMode: 'assisted_task', riskGroup: 'assisted' };
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
    cost: null, model: null, tokens: null, estimatedCost: null, criticalStop: null, finalReport: null,
    entries: unique.map((p, index) => ({ id: `op-${index + 1}`, selectionIndex: index, problem: structuredClone(p), ...batchCapability(p),
      problemKeys: [p.key], dependsOn: [], executionOrder: null, definitelyNoWrite: true, correctionId: `batch-${id}:op-${index + 1}`, logs: [] })),
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
  for (const entry of run.entries) entry.executionOrder = null;
  try {
    batchExecutionOrder(prepared).forEach((entry, index) => { entry.executionOrder = index + 1; });
  } catch {
    for (const entry of prepared) {
      entry.state = 'BLOCKED'; entry.code = 'DEPENDENCY_CYCLE'; entry.reason = 'Dipendenze cicliche: esecuzione bloccata.'; entry.executionOrder = null;
    }
  }
  return run;
}

export function batchExecutionOrder(entries) {
  const pending = new Map(entries.map((entry, index) => [entry.id, { entry, index }])), ordered = [];
  while (pending.size) {
    const ready = [...pending.values()]
      .filter(({ entry }) => entry.dependsOn.every(id => !pending.has(id)))
      .sort((left, right) => {
        const risk = (RISK_RANK[left.entry.riskGroup] ?? RISK_RANK.standard) - (RISK_RANK[right.entry.riskGroup] ?? RISK_RANK.standard);
        if (risk) return risk;
        const leftIndex = Number.isSafeInteger(left.entry.selectionIndex) ? left.entry.selectionIndex : left.index;
        const rightIndex = Number.isSafeInteger(right.entry.selectionIndex) ? right.entry.selectionIndex : right.index;
        return leftIndex - rightIndex;
      });
    const next = ready[0];
    if (!next) throw new Error('DEPENDENCY_CYCLE');
    ordered.push(next.entry); pending.delete(next.entry.id);
  }
  return ordered;
}

export const approvalFingerprint = run => stableBatchJson([run.clientId, run.siteUrl,
  run.entries.filter(e => e.state === 'PREPARED').map(e => [e.id, e.problemKeys, e.dependsOn, e.riskGroup, e.executionOrder, e.highRisk,
    e.preview.resourceIdentity, e.preview.data.previewBefore, e.preview.data.previewAfter, e.preview.plan.changes, e.preview.contextSnapshot])]);

export function batchRiskSummary(run) {
  const groups = { read_only: 0, standard: 0, high: 0, assisted: 0 };
  for (const entry of run.entries || []) groups[entry.riskGroup in groups ? entry.riskGroup : 'standard'] += 1;
  return groups;
}

export function batchSummary(run) {
  const counts = {};
  for (const entry of run.entries) counts[entry.state] = (counts[entry.state] || 0) + 1;
  const operations = run.entries.filter(e => e.preview?.data?.approvalToken && !e.consolidatedInto);
  const applied = operations.filter(e => ['RESOLVED_VERIFIED', 'APPLIED_UNVERIFIED', 'VERIFYING'].includes(e.state));
  const resolved = run.entries.filter(e => e.state === 'RESOLVED_VERIFIED');
  const managed = run.entries.filter(e => e.state === 'MANAGED_ASSISTED');
  const direct = run.entries.filter(e => e.batchMode === 'direct_preflight');
  const assisted = run.entries.filter(e => e.batchMode === 'assisted_task');
  return { ...counts, selected: run.entries.length, operations: operations.length,
    applied: applied.length, pagesModified: new Set(applied.map(e => e.preview.resourceIdentity)).size,
    resolvedProblems: resolved.reduce((n, e) => n + e.problemKeys.length, 0),
    managedAssisted: managed.reduce((n, e) => n + e.problemKeys.length, 0),
    directCandidates: direct.reduce((n, e) => n + e.problemKeys.length, 0),
    assistedCandidates: assisted.reduce((n, e) => n + e.problemKeys.length, 0),
    assistedPrepared: managed.reduce((n, e) => n + e.problemKeys.length, 0),
    awaitingApproval: run.entries.filter(e => e.state === 'PREPARED').reduce((n,e) => n + e.problemKeys.length, 0),
    appliedAwaitingVerification: run.entries.filter(e => ['APPLIED_UNVERIFIED','VERIFYING'].includes(e.state)).reduce((n,e) => n + e.problemKeys.length, 0),
    stillOpen: run.entries.filter(e => !['RESOLVED_VERIFIED'].includes(e.state)).reduce((n,e) => n + e.problemKeys.length, 0),
    highRisk: operations.filter(e => e.state === 'PREPARED' && e.riskGroup === 'high').length,
    riskGroups: batchRiskSummary(run) };
}

export function batchFinalReport(run) {
  const summary = batchSummary(run);
  const outcomes = {
    succeeded: run.entries.filter(e => e.state === 'RESOLVED_VERIFIED').length,
    skipped: run.entries.filter(e => e.state === 'SKIPPED').length,
    manual: run.entries.filter(e => ['MANAGED_ASSISTED', 'MANUAL_REQUIRED', 'UNSUPPORTED'].includes(e.state)).length,
    failed: run.entries.filter(e => e.state === 'FAILED').length,
    blocked: run.entries.filter(e => ['BLOCKED', 'STALE_TARGET'].includes(e.state)).length,
    unverified: run.entries.filter(e => ['APPLIED_UNVERIFIED', 'VERIFYING'].includes(e.state)).length,
    uncertain: run.entries.filter(e => e.state === 'UNCERTAIN').length,
  };
  const execution = run.entries
    .filter(entry => Number.isSafeInteger(entry.executionOrder) && entry.executionOrder > 0)
    .toSorted((a, b) => a.executionOrder - b.executionOrder)
    .map(entry => ({
      order: entry.executionOrder,
      id: entry.id,
      title: entry.problem?.title || '',
      sourceUrl: entry.problem?.sourceUrl || '',
      riskGroup: entry.riskGroup || 'standard',
      riskLabel: BATCH_RISK_LABELS[entry.riskGroup] || BATCH_RISK_LABELS.standard,
      state: entry.state,
      stateLabel: BATCH_LABELS[entry.state] || entry.state,
      correctionId: entry.correctionId || '',
      rollbackAvailable: Boolean(entry.correctionId && ['RESOLVED_VERIFIED', 'APPLIED_UNVERIFIED'].includes(entry.state)),
    }));
  return {
    batchId: run.id,
    clientId: run.clientId,
    siteUrl: run.siteUrl,
    status: run.status,
    createdAt: run.createdAt,
    startedAt: run.startedAt || '',
    completedAt: run.completedAt || '',
    durationMs: run.durationMs ?? null,
    summary,
    riskGroups: summary.riskGroups,
    outcomes,
    criticalStop: run.criticalStop || null,
    execution,
  };
}

export function verificationState(result) {
  return result?.record?.status === 'Verificato' && result.record.writeConfirmed === true && result.record.frontendConfirmed === true &&
    hasAutoFixCompletionEvidence(result.record) && !result.needsAudit && !result.needsBrowserVerification && !result.error
    ? 'RESOLVED_VERIFIED'
    : 'APPLIED_UNVERIFIED';
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
  next.finalReport = batchFinalReport(next);
  return next;
}
