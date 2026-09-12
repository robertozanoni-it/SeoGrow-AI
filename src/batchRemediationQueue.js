import { consolidateBatch, batchExecutionOrder, approvalFingerprint, verificationState, batchSummary } from './batchRemediationModel.js';
const systemic = code => /AUTH|HTTP_429|RATE_LIMIT|SCOPE_CHANGED|BATCH_STORAGE|BATCH_REVISION|AbortError|CONNECTION_LOST|UNCERTAIN/.test(code || '');
const note = (entry, state, reason = '', code = '') => {
  entry.state = state; entry.reason = reason; entry.code = code;
  entry.logs.push({ at: new Date().toISOString(), state, code });
};
const errorCode = error => String(error?.code || error?.cause?.code || error?.name || 'ERROR');

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
      const key = ports.preparationKey(entry);
      // Exact duplicate inputs reuse a valid proposal, not a fresh AI call.
      const preview = generated.has(key) ? generated.get(key) : await ports.prepare(entry);
      if (!generated.has(key)) generated.set(key, preview);
      await ports.assertContext();
      if (preview.alreadyResolved) {
        note(entry, 'SKIPPED', preview.reason || 'Non più presente; da confermare nel nuovo audit.', 'ALREADY_ABSENT');
      } else {
        if (!preview.data?.approvalToken || !preview.data?.changed?.length || !preview.resourceIdentity) throw new Error('Anteprima incompleta: scrittura bloccata.');
        entry.preview = preview;
        entry.highRisk = ['canonical', 'noindex', 'external_link', 'content', 'h1'].includes(entry.kind);
        note(entry, 'PREPARED');
      }
    } catch (error) {
      const code = errorCode(error);
      const state = /STALE/.test(code) ? 'STALE_TARGET' : /OWNERSHIP|SELECTION|CONTEXT|INTENT|UNSUPPORTED|QUALITY|EDITORIAL|ARCHIVE/.test(code) ? 'BLOCKED' : 'FAILED';
      note(entry, state, error.message, code); stop = systemic(code);
    }
    await persist();
  }
  consolidateBatch(run);
  run.status = run.entries.some(e => e.state === 'PREPARED') ? 'AWAITING_APPROVAL' : 'COMPLETED_WITH_OPEN';
  run.planFingerprint = approvalFingerprint(run);
  await persist(); return run;
}
export async function executeBatch(run, approval, ports) {
  if (run.status !== 'AWAITING_APPROVAL' || !approval || approval.fingerprint !== approvalFingerprint(run) || approval.fingerprint !== run.planFingerprint)
    throw new Error('Approvazione mancante, riutilizzata o piano cambiato. Rigenera le anteprime.');
  const queue = batchExecutionOrder(run.entries.filter(e => e.state === 'PREPARED'));
  if (!queue.length) throw new Error('Nessuna operazione approvabile.');
  const high = new Set(approval.highRiskIds || []);
  if (queue.some(e => e.highRisk && !high.has(e.id))) throw new Error('Conferma esplicitamente ogni modifica ad alto rischio.');
  run.status = 'APPROVING'; // Claim synchronously: even two callers in one tick cannot start the same run.
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
      note(entry, /STALE|EXPIRED/.test(code) ? 'STALE_TARGET' : 'FAILED', error.message, code);
      stop = systemic(code); await persist(); continue;
    }
    note(entry, 'IN_EXECUTION'); entry.definitelyNoWrite = false;
    // Durable write-ahead state, before even calling the correction journal.
    await persist();
    try {
      const record = await ports.apply(entry, run);
      entry.recordId = record.id;
      note(entry, 'APPLIED_UNVERIFIED', 'Scrittura confermata; risoluzione SEO non ancora confermata.');
    } catch (error) {
      const code = errorCode(error);
      entry.definitelyNoWrite = error.definitelyNoWrite === true;
      note(entry, entry.definitelyNoWrite ? (/STALE|EXPIRED/.test(code) ? 'STALE_TARGET' : 'FAILED') : 'UNCERTAIN', error.message, code);
      stop = !entry.definitelyNoWrite || systemic(code);
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
      note(entry, 'APPLIED_UNVERIFIED', `Scrittura confermata; verifica non conclusa: ${error.message}`, errorCode(error));
      stop = systemic(errorCode(error));
    }
    await persist();
  }
  // Local incremental checks never expand to an unrelated whole-site AI audit.
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
  run.status = summary.UNCERTAIN ? 'INTERRUPTED' : summary.resolvedProblems === summary.selected ? 'SUCCESS' : summary.applied ? 'PARTIAL_SUCCESS' : 'COMPLETED_WITH_OPEN';
  run.summary = summary; await persist(); return run;
}
