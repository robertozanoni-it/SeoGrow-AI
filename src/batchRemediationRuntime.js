import { apiFetch } from './api.js';
import { workspaceStorage, assertWorkspaceWritable } from './workspaceDatabase.js';
import { normalizeAnalysisHistory } from './platform.js';
import { selectFocusedRemediation, correctionIssueKeys } from './remediationSelection.js';
import { previewIdentity } from './remediationPlanSafety.js';
import { inspectWordPress, inspectFrontend, inspectLinkEvidence, buildPlan, createWordPressCorrection, applyPreparedCorrection } from './wordpressRemediationEngine.js';
import { attachElementorImpactEvidence, inspectElementorImpactEvidence } from './elementorImpactClient.js';
import { buildElementorImpactCandidateUrls } from './elementorImpactCandidates.js';
import { brokenExternalTarget } from './brokenLinkRemediation.js';
import { assertSeoPatchLengths } from './seoTextPolicy.js';
import { correctionCredentials } from './correctionCredentials.js';
import { listCorrections, readCorrection, updateCorrection, removeVerifiedTask } from './remediationStore.js';
import { recheckCorrectionById } from './remediationIntegrity.js';
import { exactPageKey, assertPublicObservation } from './remediationEvidence.js';
import { requiresDuplicateAudit, metadataVerificationTarget } from './metadataCorrectionVerification.js';
import { remediationIssueKind } from './remediationIssueKind.js';
import { stableBatchJson } from './batchRemediationModel.js';

const read = (key, fallback) => { try { return JSON.parse(workspaceStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const fail = (message, code) => Object.assign(new Error(message), { code });
const expectedState = (entity, changes) => {
  const out = {};
  for (const key of ['title', 'content', 'excerpt']) if (changes[key] !== undefined) out[key] = String(entity[key]?.raw ?? entity[key]?.rendered ?? '');
  if (changes.meta) out.meta = Object.fromEntries(Object.keys(changes.meta).map(key => [key, entity.meta?.[key] ?? '']));
  return out;
};
const request = async (path, body) => {
  const response = await apiFetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw fail(data.error || `Richiesta non riuscita (${response.status}).`, data.code || (/401|403|password|autentic|unauthorized|forbidden|incorrect_password/i.test(data.error || '') ? 'AUTH_LOST' : `HTTP_${response.status}`));
  return data;
};

export function createBatchWordPressPorts({ run, credentials, save, progress, stopped }) {
  const context = { clientId: run.clientId, siteUrl: run.siteUrl };
  const wp = { url: credentials.url, username: credentials.username, applicationPassword: credentials.applicationPassword };
  const cache = new Map(), audits = new Map();
  const assertContext = async () => {
    assertWorkspaceWritable();
    const currentId = Number(read('seogrow-selected-client-v1', null));
    const client = read('seogrow-clients', []).find(c => Number(c.id) === run.clientId);
    if (currentId !== run.clientId || !client || client.url !== run.siteUrl) throw fail('Il progetto o il sito è cambiato. Batch fermato.', 'SCOPE_CHANGED');
    correctionCredentials(context, { clientId: currentId, siteUrl: wp.url, username: wp.username, applicationPassword: wp.applicationPassword });
  };
  const resolve = entry => {
    const client = read('seogrow-clients', []).find(c => Number(c.id) === run.clientId);
    const history = [
      ...(read('seogrow-page-audit-history-v2', {})[run.clientId] || []).map(item => ({ type: 'page', item })),
      ...normalizeAnalysisHistory(read('seogrow-analyses-v2', {})[run.clientId]).map(item => ({ type: 'site', item })),
    ];
    const p = entry.problem;
    const focus = { clientId: run.clientId, issueType: p.issueType, title: p.title, sourceUrl: p.sourceUrl, targetUrl: p.targetUrls?.[0] || '', issueKey: p.key };
    const selection = selectFocusedRemediation(history, focus, run.clientId, client);
    if (!selection) throw fail('Il problema non identifica un’unica rilevazione nell’audit corrente. Aprilo singolarmente.', 'STALE_TARGET');
    return { client, audit: selection.audit, issue: selection.audit.item.issues[selection.issueIndex], focus };
  };
  const connection = async () => {
    await assertContext();
    const checked = await request('/api/wordpress/connection-check', { siteUrl: wp.url, username: wp.username, applicationPassword: wp.applicationPassword });
    if (checked.ok !== true || !(checked.user?.id > 0)) throw fail('Connessione WordPress non verificata.', 'AUTH_LOST');
    await assertContext(); return checked;
  };
  const pendingCorrection = async (entry, preview) => {
    const corrections = await listCorrections({ clientId: run.clientId });
    return corrections.find(c => c.id !== entry.correctionId &&
      ((correctionIssueKeys(c).includes(entry.problem.key)) || (preview && c.resourceIdentity === preview.resourceIdentity && c.fields?.some(f => preview.data.changed.includes(f)))) &&
      (c.status === 'Esito incerto' || (['Applicato','Da verificare'].includes(c.status) && c.writeConfirmed !== false)));
  };
  const ports = {
    save, progress, stopped, assertContext, connection,
    preparationKey: entry => { const r = resolve(entry); return stableBatchJson([entry.kind, entry.problem.sourceUrl, r.issue, r.audit.type, r.audit.item.analyzedAt || r.audit.item.startedAt]); },
    prepare: async entry => {
      const resolved = resolve(entry), targetUrl = entry.problem.sourceUrl;
      if (new URL(targetUrl).origin !== new URL(run.siteUrl).origin) throw fail('La pagina non appartiene al sito approvato.', 'SCOPE_CHANGED');
      if (await pendingCorrection(entry)) throw fail('Esiste una scrittura applicata o incerta per questo problema. Verificala nello storico.', 'UNCERTAIN_PENDING_WRITE');
      if (!cache.has(targetUrl)) cache.set(targetUrl, Promise.all([inspectWordPress(targetUrl, wp), inspectFrontend(targetUrl)]));
      const [raw, frontendContext] = await cache.get(targetUrl), inspected = structuredClone(raw);
      if (inspected.ok !== true || !['pages','posts'].includes(inspected.resource) || !(inspected.entity?.id > 0) || inspected.entity.status !== 'publish')
        throw fail('Il batch modifica solo pagine/articoli pubblicati e identificati senza ambiguità.', 'UNSUPPORTED_RESOURCE');
      if (exactPageKey(inspected.entity.link) !== exactPageKey(targetUrl) || exactPageKey(frontendContext.url) !== exactPageKey(targetUrl))
        throw fail('Permalink WordPress e pagina pubblica non coincidono esattamente con il target.', 'OWNERSHIP_UNDETERMINED');
      if (['content','h1'].includes(entry.kind)) {
        const candidates = buildElementorImpactCandidateUrls({ audit: resolved.audit.item, issue: resolved.issue, client: resolved.client });
        const evidence = await inspectElementorImpactEvidence(inspected.entity, wp, candidates);
        if (evidence) attachElementorImpactEvidence(inspected.entity, evidence);
      }
      const plan = await buildPlan(entry.kind, resolved.issue, inspected, targetUrl, frontendContext, {
        linkCleanupMode: 'unlink-preserve-text',
        linkEvidence: entry.kind === 'external_link' ? await inspectLinkEvidence(targetUrl, brokenExternalTarget(resolved.issue)) : undefined,
      });
      if (plan.alreadyResolved) return plan;
      assertSeoPatchLengths(plan.changes);
      await assertContext();
      if (stableBatchJson(resolve(entry).audit.item) !== stableBatchJson(resolved.audit.item)) throw fail('Audit cambiato durante la preparazione.', 'STALE_TARGET');
      const expectedCurrent = expectedState(inspected.entity, plan.changes);
      const data = await request('/api/wordpress/live-preview', { siteUrl: wp.url, targetUrl, username: wp.username, applicationPassword: wp.applicationPassword,
        resource: inspected.resource, id: inspected.entity.id, changes: plan.changes, issue: resolved.issue, adapter: plan.adapter,
        expectedCurrent, expectedStatus: inspected.entity.status });
      if (data.ok !== true || stableBatchJson(data.previewBefore) !== stableBatchJson(expectedCurrent)) throw fail('Snapshot della preview diverso dalla lettura usata per generarla.', 'STALE_TARGET');
      const preview = { status: 'preview', targetUrl, issue: resolved.issue, inspected, frontendContext, plan, data,
        expiresAt: Date.now() + Number(data.expiresInSeconds || 0) * 1000,
        contextSnapshot: { clientId: run.clientId, clientName: run.clientName, siteUrl: run.siteUrl, auditType: resolved.audit.type,
          analyzedAt: resolved.audit.item.analyzedAt || resolved.audit.item.startedAt, auditFingerprint: JSON.stringify(resolved.audit.item) },
        ...previewIdentity({ issue: resolved.issue, inspected, targetUrl, frontend: frontendContext }) };
      if (await pendingCorrection(entry, preview)) throw fail('Un’altra correzione sul campo è ancora da verificare.', 'UNCERTAIN_PENDING_WRITE');
      return preview;
    },
    validate: async entry => {
      const p = entry.preview;
      if (!p?.data?.approvalToken || !Number.isFinite(p.expiresAt) || Date.now() >= p.expiresAt) throw fail('Anteprima scaduta: rigenera e approva di nuovo.', 'APPROVAL_EXPIRED');
      if (JSON.stringify(resolve(entry).audit.item) !== p.contextSnapshot.auditFingerprint) throw fail('L’audit è cambiato dopo l’anteprima.', 'STALE_TARGET');
      if (await pendingCorrection(entry, p)) throw fail('Scrittura precedente ancora da riconciliare/verificare.', 'UNCERTAIN_PENDING_WRITE');
      const current = await inspectWordPress(p.targetUrl, wp);
      if (current.resource !== p.inspected.resource || current.entity?.id !== p.inspected.entity.id || current.entity.status !== p.inspected.entity.status || exactPageKey(current.entity.link) !== exactPageKey(p.targetUrl) ||
          stableBatchJson(expectedState(current.entity, p.plan.changes)) !== stableBatchJson(p.data.previewBefore)) throw fail('Target o campo cambiato: la vecchia proposta non viene applicata.', 'STALE_TARGET');
    },
    apply: async entry => {
      const record = createWordPressCorrection(entry.preview, wp, run.id, entry.correctionId);
      record.batchProblemKeys = [...entry.problemKeys];
      record.batchIssues = run.entries.filter(e => entry.problemKeys.includes(e.problem.key)).map(e => ({ issue: e.preview?.issue || entry.preview.issue, sourceUrl: e.problem.sourceUrl }));
      try { return await applyPreparedCorrection(record, entry.preview.data, wp, assertContext); }
      catch (error) {
        const stored = await readCorrection(entry.correctionId);
        if (!stored || (stored.status === 'Bloccato' && stored.writeConfirmed === false)) error.definitelyNoWrite = true;
        throw error;
      }
    },
    verify: entry => recheckCorrectionById(entry.correctionId, { ...context, siteUrl: wp.url, username: wp.username, applicationPassword: wp.applicationPassword }),
    deltaVerify: async entry => {
      const record = await readCorrection(entry.correctionId);
      if (!record || record.writeConfirmed !== true || record.status === 'Ripristinato') return null;
      // Duplicates need comparison across documents. A single-page pass is never enough.
      if (requiresDuplicateAudit(record)) return { record, needsAudit: true };
      const p = entry.preview;
      const current = await inspectWordPress(p.targetUrl, wp);
      if (current.entity?.id !== record.entityId || stableBatchJson(expectedState(current.entity, p.plan.changes)) !== stableBatchJson(p.data.previewAfter)) return { record, needsAudit: true };
      const frontend = await request('/api/wordpress/verify-frontend', { url: record.sourceUrl, expected: record.after });
      assertPublicObservation(record, frontend);
      if (frontend.verificationSafe !== true || frontend.requiresBrowserVerification === true) return { record, needsBrowserVerification: true };
      let fixed = false, auditEvidence = null;
      if (['title','meta_description','h1'].includes(entry.kind)) {
        if (!audits.has(p.targetUrl)) audits.set(p.targetUrl, request('/api/audit', { url: p.targetUrl }));
        auditEvidence = await audits.get(p.targetUrl);
        const at = Date.parse(auditEvidence.fetchedAt || '');
        const samePage = exactPageKey(auditEvidence.url) === exactPageKey(p.targetUrl);
        const fresh = Number.isFinite(at) && at >= Date.parse(record.appliedAt) && at <= Date.now() + 60000;
        const issues = auditEvidence.issues;
        const unresolved = !Array.isArray(issues) || issues.some(issue => remediationIssueKind(issue) === entry.kind || issue.type === 'metadata-tags');
        const metadata = metadataVerificationTarget(record);
        const expected = metadata?.expected || (entry.kind === 'title' ? record.after.title : null);
        const observed = entry.kind === 'meta_description' ? frontend.metaDescription : frontend.title;
        const normalized = value => typeof value === 'string' ? value.normalize('NFC').replace(/\s+/g,' ').trim() : null;
        const count = entry.kind === 'title' ? frontend.titleCount : frontend.metaDescriptionCount;
        const actualMatches = entry.kind === 'h1' ? frontend.h1 === 1 && auditEvidence.h1 === 1 :
          count === 1 && typeof expected === 'string' && normalized(expected) === normalized(observed) &&
          normalized(entry.kind === 'title' ? auditEvidence.title : auditEvidence.description) === normalized(expected);
        fixed = samePage && fresh && !unresolved && actualMatches;
      } else if (entry.kind === 'external_link') {
        const evidence = await inspectLinkEvidence(p.targetUrl, brokenExternalTarget(p.issue));
        fixed = evidence.verificationSafe === true && evidence.scanComplete === true && evidence.occurrenceCount === 0;
        auditEvidence = evidence;
      }
      if (!fixed) return { record, needsAudit: true };
      await assertContext();
      const verified = await updateCorrection(record.id, { status: 'Verificato', frontendConfirmed: true, frontendFailure: false,
        verifiedAt: new Date().toISOString(), verificationNote: 'Scrittura confermata, valori WordPress e HTML pubblico coerenti; controllo incrementale del problema superato.',
        batchDeltaEvidence: { checkedAt: new Date().toISOString(), frontend, audit: auditEvidence } }, { expectedRecord: record });
      removeVerifiedTask(verified);
      return { record: verified, needsAudit: false };
    },
  };
  return ports;
}
