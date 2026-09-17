import { consolidateBatch, batchExecutionOrder, approvalFingerprint, verificationState, batchSummary, batchFinalReport } from './batchRemediationModel.js';

const CRITICAL_CODE = /AUTH|HTTP_429|RATE_LIMIT|SCOPE_CHANGED|BATCH_STORAGE|BATCH_REVISION|AbortError|CONNECTION_LOST|UNCERTAIN/;
const note = (entry, state, reason = '', code = '') => {
  entry.state = state; entry.reason = reason; entry.code = code;
  entry.logs.push({ at: new Date().toISOString(), state, code });
};
const errorCode = error => String(error?.code || error?.cause?.code || error?.name || 'ERROR');

export function isCriticalBatchError(code, { phase = 'preflight', definitelyNoWrite = true } = {}) {
  return CRITICAL_CODE.test(String(code || '')) || (phase === 'apply' && definitelyNoWrite !== true);
}

const criticalStop = (run, entry, phase, code, reason) => {
  if (run.criticalStop) return;
  run.criticalStop = {
    entryId: entry?.id || '',
    problemKey: entry?.problem?.key || '',
    phase,
    code: String(code || 'ERROR'),
    reason: reason || 'Errore critico: batch interrotto.',
    at: new Date().toISOString(),
  };
};

const finalizeRunReport = run => {
  run.finalReport = batchFinalReport(run);
  return run.finalReport;
};

// The queue knows no WordPress write implementation. All effects use the existing engine through ports.
export async function prepareBatch(run, ports) {
  const persist = async () => { await ports.save(run); ports.progress?.(run); };
  await persist();
  const generated = new Map();
  let stop = false;
  for (const entry of run.entries) {
    if (entry.state !== 'PENDING') continue;
    if (stop || ports.stopped?.()) { note(entry, 'BLOCKED', 'Preparazione interrotta.', 'BATCH_INTERRUPTED'); continue; }
    note(entry, 'PREFLIGHT'); await persist();
    try {
      await ports.assertContext();
      if (entry.batchMode === 'assisted_task' || entry.kind === 'assisted') {
        const managed = await ports.manageAssisted(entry);
        entry.recordId = managed?.id || '';
        entry.verification = { needsAudit: false, needsBrowserVerification: false, at: new Date().toISOString(), note: managed?.note || 'Intervento assistito creato automaticamente dal batch.' };
        note(entry, 'MANAGED_ASSISTED', managed?.note || 'Intervento/task creato automaticamente dal batch; nessuna scrittura WordPress cieca.', 'BATCH_ASSISTED_MANAGED');
        await persist();
        continue;
      }
      const key = ports.preparationKey(entry);
      const preview = generated.has(key) ? generated.get(key) : await ports.prepare(entry);
      if (!generated.has(key)) generated.set(key, preview);
      await ports.assertContext();
      if (preview.alreadyResolved) {
        if (preview.verifiedResolution === true) {
          const record = ports.recordNoWriteResolution ? await ports.recordNoWriteResolution(entry, preview) : null;
          if (record?.id) entry.recordId = record.id;
          entry.readOnlyEvidence = preview.evidence || null;
          entry.verification = { needsAudit: false, needsBrowserVerification: false, at: new Date().toISOString(), note: preview.reason || 'Verifica batch conclusa senza scritture.' };
          note(entry, 'RESOLVED_VERIFIED', preview.reason || 'Verificato in sola lettura: nessuna modifica necessaria.', 'READ_ONLY_VERIFIED');
        } else {
          note(entry, 'SKIPPED', preview.reason || 'Non più presente; da confermare nel nuovo audit.', 'ALREADY_ABSENT');
        }
      } else {
        if (!preview.data?.approvalToken || !preview.data?.changed?.length || !preview.resourceIdentity) throw new Error('Anteprima incompleta: scrittura bloccata.');
        entry.preview = preview;
        entry.highRisk = entry.riskGroup === 'high';
        note(entry, 'PREPARED');
      }
    } catch (error) {
      const code = errorCode(error);
      const critical = isCriticalBatchError(code, { phase: 'preflight' });
      const assisted = /STALE|NON_EDITABLE_RESOURCE|NON_EDITABLE_ARCHIVE|UNSUPPORTED_RESOURCE|OWNERSHIP|SELECTION|CONTEXT|INTENT|UNSUPPORTED|QUALITY|EDITORIAL|ARCHIVE|ALIAS/.test(code);
      if (assisted && !critical && ports.manageAssisted) {
        try {
          const managed = await ports.manageAssisted(entry);
          entry.recordId = managed?.id || '';
          entry.verification = { needsAudit: /STALE/.test(code), needsBrowserVerification: false, at: new Date().toISOString(), note: managed?.note || error.message };
          note(entry, 'MANAGED_ASSISTED', `${error.message} Gestito automaticamente dal batch come intervento assistito.`, 'BATCH_ASSISTED_FALLBACK');
        } catch (manageError) {
          const manageCode = errorCode(manageError);
          note(entry, 'FAILED', manageError.message, manageCode);
          if (isCriticalBatchError(manageCode, { phase: 'preflight' })) {
            criticalStop(run, entry, 'preflight', manageCode, manageError.message);
            stop = true;
          }
        }
      } else {
        note(entry, /STALE/.test(code) ? 'STALE_TARGET' : 'FAILED', error.message, code);
        if (critical) {
          criticalStop(run, entry, 'preflight', code, error.message);
          stop = true;
        }
      }
    }
    await persist();
  }
  consolidateBatch(run);
  const summary = batchSummary(run);
  run.status = run.criticalStop
    ? 'INTERRUPTED'
    : run.entries.some(e => e.state === 'PREPARED')
      ? 'AWAITING_APPROVAL'
      : summary.resolvedProblems === summary.selected ? 'SUCCESS' : 'COMPLETED_WITH_OPEN';
  run.planFingerprint = approvalFingerprint(run);
  run.summary = summary;
  if (run.status !== 'AWAITING_APPROVAL') {
    run.completedAt = run.completedAt || new Date().toISOString();
    finalizeRunReport(run);
  }
  await persist(); return run;
}

export async function executeBatch(run, approval, ports) {
  if (run.status !== 'AWAITING_APPROVAL' || !approval || approval.fingerprint !== approvalFingerprint(run) || approval.fingerprint !== run.planFingerprint)
    throw new Error('Approvazione mancante, riutilizzata o piano cambiato. Rigenera le anteprime.');
  const queue = batchExecutionOrder(run.entries.filter(e => e.state === 'PREPARED'));
  if (!queue.length) throw new Error('Nessuna operazione approvabile.');
  queue.forEach((entry, index) => { entry.executionOrder = index + 1; });
  run.executionPlan = queue.map(entry => ({ id: entry.id, order: entry.executionOrder, riskGroup: entry.riskGroup, dependsOn: [...entry.dependsOn] }));
  const high = new Set(approval.highRiskIds || []);
  if (queue.some(e => e.highRisk && !high.has(e.id))) throw new Error('Conferma esplicitamente ogni modifica ad alto rischio.');
  run.status = 'APPROVING';
  try { await ports.assertContext(); } catch (error) { run.status = 'AWAITING_APPROVAL'; throw error; }
  run.approval = { fingerprint: approval.fingerprint, highRiskIds: [...high], at: new Date().toISOString() };
  run.status = 'RUNNING'; run.startedAt = new Date().toISOString();
  const persist = async () => { await ports.save(run); ports.progress?.(run); };
  await persist();
  let stop = false;
  for (const entry of queue) {
    if (stop || ports.stopped?.()) { note(entry, 'BLOCKED', 'Batch interrotto: nuova approvazione necessaria.', 'BATCH_INTERRUPTED'); await persist(); continue; }
    if (entry.dependsOn.some(id => !['RESOLVED_VERIFIED'].includes(run.entries.find(e => e.id === id)?.state))) {
      note(entry, 'BLOCKED', 'La dipendenza non è stata risolta e verificata.', 'DEPENDENCY_NOT_VERIFIED'); await persist(); continue;
    }
    try {
      await ports.assertContext();
      await ports.validate(entry);
      await ports.assertContext();
    } catch (error) {
      const code = errorCode(error);
      const critical = isCriticalBatchError(code, { phase: 'validate' });
      const assisted = /STALE|EXPIRED|OWNERSHIP|SELECTION|CONTEXT|INTENT|UNSUPPORTED|QUALITY|EDITORIAL|ARCHIVE|ALIAS/.test(code);
      if (assisted && !critical && ports.manageAssisted) {
        const managed = await ports.manageAssisted(entry);
        entry.recordId = managed?.id || '';
        entry.verification = { needsAudit: /STALE|EXPIRED/.test(code), needsBrowserVerification: false, at: new Date().toISOString(), note: managed?.note || error.message };
        note(entry, 'MANAGED_ASSISTED', `${error.message} Gestito automaticamente dal batch senza ripetere la scrittura.`, 'BATCH_ASSISTED_VALIDATE_FALLBACK');
      } else {
        note(entry, /STALE|EXPIRED/.test(code) ? 'STALE_TARGET' : 'FAILED', error.message, code);
        if (critical) {
          criticalStop(run, entry, 'validate', code, error.message);
          stop = true;
        }
      }
      await persist(); continue;
    }
    note(entry, 'IN_EXECUTION'); entry.definitelyNoWrite = false;
    await persist();
    try {
      const record = await ports.apply(entry, run);
      entry.recordId = record.id;
      note(entry, 'APPLIED_UNVERIFIED', 'Scrittura confermata; risoluzione SEO non ancora confermata.');
    } catch (error) {
      const code = errorCode(error);
      entry.definitelyNoWrite = error.definitelyNoWrite === true;
      const critical = isCriticalBatchError(code, { phase: 'apply', definitelyNoWrite: entry.definitelyNoWrite });
      const assisted = entry.definitelyNoWrite && /STALE|EXPIRED|OWNERSHIP|SELECTION|CONTEXT|INTENT|UNSUPPORTED|QUALITY|EDITORIAL|ARCHIVE|ALIAS/.test(code);
      if (assisted && !critical && ports.manageAssisted) {
        const managed = await ports.manageAssisted(entry);
        entry.recordId = managed?.id || '';
        entry.verification = { needsAudit: /STALE|EXPIRED/.test(code), needsBrowserVerification: false, at: new Date().toISOString(), note: managed?.note || error.message };
        note(entry, 'MANAGED_ASSISTED', `${error.message} Gestito automaticamente dal batch dopo un fallimento pre-write dimostrato.`, 'BATCH_ASSISTED_APPLY_FALLBACK');
      } else {
        note(entry, entry.definitelyNoWrite ? (/STALE|EXPIRED/.test(code) ? 'STALE_TARGET' : 'FAILED') : 'UNCERTAIN', error.message, code);
        if (critical) {
          criticalStop(run, entry, 'apply', code, error.message);
          stop = true;
        }
      }
      await persist(); continue;
    }
    await persist();
    note(entry, 'VERIFYING'); await persist();
    try {
      await ports.assertContext();
      const result = await ports.verify(entry);
      entry.verification = { needsAudit: result?.needsAudit === true, needsBrowserVerification: result?.needsBrowserVerification === true,
        at: new Date().toISOString(), note: result?.record?.verificationNote || result?.error?.message || '' };
      note(entry, verificationState(result), entry.verification.note);
    } catch (error) {
      const code = errorCode(error);
      note(entry, 'APPLIED_UNVERIFIED', `Scrittura confermata; verifica non conclusa: ${error.message}`, code);
      if (isCriticalBatchError(code, { phase: 'verify' })) {
        criticalStop(run, entry, 'verify', code, error.message);
        stop = true;
      }
    }
    await persist();
  }
  if (!stop && !ports.stopped?.() && ports.deltaVerify) {
    const candidates = run.entries.filter(e => e.state === 'APPLIED_UNVERIFIED');
    for (const entry of candidates) {
      try {
        await ports.assertContext();
        const result = await ports.deltaVerify(entry);
        if (result) { entry.verification = { ...entry.verification, at: new Date().toISOString(), note: result.record?.verificationNote || '' }; note(entry, verificationState(result), entry.verification.note); }
      } catch (error) { entry.verification = { ...entry.verification, deltaError: error.message }; }
      await persist();
    }
  }
  run.completedAt = new Date().toISOString(); run.durationMs = Date.parse(run.completedAt) - Date.parse(run.startedAt);
  const summary = batchSummary(run);
  run.status = run.criticalStop || summary.UNCERTAIN
    ? 'INTERRUPTED'
    : summary.resolvedProblems === summary.selected
      ? 'SUCCESS'
      : summary.applied ? 'PARTIAL_SUCCESS' : 'COMPLETED_WITH_OPEN';
  run.summary = summary;
  finalizeRunReport(run);
  await persist(); return run;
}
