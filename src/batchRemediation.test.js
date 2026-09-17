import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchRun, batchCapability, batchRiskGroup, visibleBatchSelection, consolidateBatch, batchExecutionOrder, approvalFingerprint, batchSummary, batchFinalReport, retryableProblemKeys, verificationState, recoverBatchRun } from './batchRemediationModel.js';
import { prepareBatch, executeBatch, isCriticalBatchError } from './batchRemediationQueue.js';
import { batchHistorySnapshot, withBatchLock } from './batchRemediationStore.js';

const problem = (key, extra = {}) => ({ key, title: `Title ${key}`, issueType: 'title', sourceUrl: `https://example.com/${key}/`, correctability: 'automatic', problemState: 'open', interventionState: 'not_prepared', ...extra });
const runFor = problems => createBatchRun({ id:'test',clientId:1,siteUrl:'https://example.com/',clientName:'Fixture',problems });
const preview = (entry, opts = {}) => ({ resourceIdentity: opts.resource || entry.problem.sourceUrl, targetUrl:entry.problem.sourceUrl,
  plan:{changes:opts.changes || {title:'Proposta '+entry.id},adapter:'WordPress'},data:{approvalToken:'token-'+entry.id,changed:['title'],previewBefore:{title:'prima'},previewAfter:opts.changes || {title:'Proposta '+entry.id}},contextSnapshot:{clientId:1} });
function portsFor(options = {}) {
  const trace = [], saved = [], applied = [];
  const ports = {
    assertContext:async()=>{}, preparationKey:e=>e.problem.key,
    save:async run=>{ trace.push('save:'+run.status); saved.push(structuredClone(run)); },
    prepare:async e=>preview(e), validate:async()=>{},
    apply:async e=>{ trace.push('write:'+e.id); applied.push(e.id); return {id:e.correctionId}; },
    manageAssisted:async e=>({ id:'task-'+e.id, note:'managed' }),
    verify:async()=>({ record:{status:'Verificato',writeConfirmed:true,frontendConfirmed:true} }),
    ...options,
  };
  return { ports,trace,saved,applied };
}
const approve = run => ({ fingerprint: run.planFingerprint, highRiskIds: run.entries.filter(e=>e.highRisk).map(e=>e.id) });

test('selection intersects the visible filtered dataset and never includes hidden IDs',()=>{
  assert.deepEqual(visibleBatchSelection([problem('a'),problem('b')],['a','hidden']).map(p=>p.key),['a']);
});
test('planner rejects invalid clients, non-HTTPS and empty selections',()=>{
  assert.throws(()=>createBatchRun({clientId:0,siteUrl:'https://example.com/',problems:[]}));
  assert.throws(()=>createBatchRun({clientId:1,siteUrl:'http://example.com/',problems:[problem('a')]}));
  assert.throws(()=>runFor([]));
});
test('all active problems are batch-manageable while already resolved findings are skipped',()=>{
  for(const extra of [{correctability:'manual'},{ownershipBlocked:true},{pageKind:'archive'},{issueType:'broken-link'},{interventionState:'applied'}]) assert.equal(batchCapability(problem('a',extra)).state,'PENDING');
  assert.equal(batchCapability(problem('a',{problemState:'resolved'})).state,'SKIPPED');
});
test('risk groups separate high, standard, assisted and read-only work',()=>{
  assert.equal(batchRiskGroup(problem('h1',{issueType:'h1'})),'high');
  assert.equal(batchRiskGroup(problem('title')),'standard');
  assert.equal(batchRiskGroup(problem('manual',{issueType:'image-alt',correctability:'manual'})),'assisted');
  assert.equal(batchRiskGroup(problem('done',{problemState:'resolved'})),'read_only');
});

test('supported assisted kinds are promoted to direct preflight instead of task fallback',()=>{
  for (const issueType of ['canonical','noindex','broken-external-link','broken-link']) {
    const capability=batchCapability(problem(issueType,{issueType,correctability:'assisted'}));
    assert.equal(capability.state,'PENDING');
    assert.equal(capability.batchMode,'direct_preflight');
    assert.notEqual(capability.kind,'assisted');
  }
});
test('planner deduplicates repeated selection IDs without losing independent pages',()=>{
  assert.equal(runFor([problem('a'),problem('a'),problem('b')]).entries.length,2);
});
test('preparation persists progress but never writes remotely',async()=>{
  const run=runFor([problem('a')]),{ports,applied,saved}=portsFor();await prepareBatch(run,ports);
  assert.equal(applied.length,0);assert.equal(run.status,'AWAITING_APPROVAL');assert.ok(saved.some(r=>r.entries[0].state==='PREFLIGHT'));
});
test('exact generation inputs are cached and latest identical token is retained',async()=>{
  const run=runFor([problem('a'),problem('b')]);let generations=0;
  const {ports}=portsFor({preparationKey:()=> 'same',prepare:async e=>{generations++;return preview(e,{resource:'same',changes:{title:'same'}});}});
  await prepareBatch(run,ports);assert.equal(generations,1);assert.equal(run.entries[1].state,'SKIPPED');assert.equal(run.entries[0].problemKeys.length,2);
});
test('overlapping fields on same resource are blocked, independent resource stays ready',async()=>{
  const run=runFor([problem('a'),problem('b'),problem('c')]);const{ports}=portsFor({prepare:async e=>preview(e,{resource:e.id==='op-3'?'other':'same'})});
  await prepareBatch(run,ports);assert.deepEqual(run.entries.map(e=>e.state),['BLOCKED','BLOCKED','PREPARED']);
});
test('independent fields on same resource do not conflict',()=>{
  const run=runFor([problem('a'),problem('b')]);
  run.entries.forEach((e,i)=>{e.state='PREPARED';e.preview=preview(e,{resource:'same',changes:i?{meta:{rank_math_description:'New'}}:{title:'New'}});});
  consolidateBatch(run);assert.ok(run.entries.every(e=>e.state==='PREPARED'));
});
test('dependency sorting is deterministic and cycles throw',()=>{
  const a={id:'a',dependsOn:['b']},b={id:'b',dependsOn:[]};assert.deepEqual(batchExecutionOrder([a,b]).map(e=>e.id),['b','a']);
  assert.throws(()=>batchExecutionOrder([a,{...b,dependsOn:['a']}]),/DEPENDENCY_CYCLE/);
});
test('execution order prefers lower-risk ready work but never breaks dependencies',()=>{
  const high={id:'high',riskGroup:'high',selectionIndex:0,dependsOn:[]};
  const standard={id:'standard',riskGroup:'standard',selectionIndex:1,dependsOn:[]};
  assert.deepEqual(batchExecutionOrder([high,standard]).map(e=>e.id),['standard','high']);
  standard.dependsOn=['high'];
  assert.deepEqual(batchExecutionOrder([high,standard]).map(e=>e.id),['high','standard']);
});
test('no approval, modified preview and missing high-risk checkbox cannot write',async()=>{
  const run=runFor([problem('a',{issueType:'h1'})]),{ports,applied}=portsFor();await prepareBatch(run,ports);
  await assert.rejects(executeBatch(run,null,ports));await assert.rejects(executeBatch(run,{fingerprint:run.planFingerprint,highRiskIds:[]},ports));
  const approval=approve(run);run.entries[0].preview.plan.changes.title='tampered';await assert.rejects(executeBatch(run,approval,ports));assert.equal(applied.length,0);
});
test('double-click execution is rejected before the first await can yield',async()=>{
  const run=runFor([problem('a')]),{ports,applied}=portsFor();await prepareBatch(run,ports);const approval=approve(run);
  const results=await Promise.allSettled([executeBatch(run,approval,ports),executeBatch(run,approval,ports)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(applied.length,1);
});
test('successful execution journals IN_EXECUTION before remote write',async()=>{
  const run=runFor([problem('a')]),t=portsFor();await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);
  assert.equal(run.entries[0].state,'RESOLVED_VERIFIED');assert.equal(run.status,'SUCCESS');
  assert.ok(t.saved.some(r=>r.entries[0].state==='IN_EXECUTION' && r.entries[0].definitelyNoWrite===false));
  assert.equal(run.finalReport.outcomes.succeeded,1);
  assert.equal(run.finalReport.execution[0].rollbackAvailable,true);
});
test('single-page API success without verified SEO is not success',async()=>{
  const run=runFor([problem('a')]),{ports}=portsFor({verify:async()=>({record:{status:'Da verificare',writeConfirmed:true,frontendConfirmed:true},needsAudit:true})});
  await prepareBatch(run,ports);await executeBatch(run,approve(run),ports);assert.equal(run.entries[0].state,'APPLIED_UNVERIFIED');assert.equal(run.status,'PARTIAL_SUCCESS');
});
test('verification errors preserve applied state, never make write retryable',async()=>{
  const run=runFor([problem('a')]),{ports}=portsFor({verify:async()=>{throw new Error('timeout');}});await prepareBatch(run,ports);await executeBatch(run,approve(run),ports);
  assert.equal(run.entries[0].state,'APPLIED_UNVERIFIED');assert.deepEqual(retryableProblemKeys(run),[]);
});
test('unknown write result halts the rest and cannot be retried',async()=>{
  const run=runFor([problem('a'),problem('b')]);let writes=0;const{ports}=portsFor({apply:async()=>{writes++;throw new Error('response lost');}});
  await prepareBatch(run,ports);await executeBatch(run,approve(run),ports);assert.equal(writes,1);assert.equal(run.entries[0].state,'UNCERTAIN');assert.equal(run.entries[1].state,'BLOCKED');assert.deepEqual(retryableProblemKeys(run),['b']);
  assert.equal(run.status,'INTERRUPTED');assert.equal(run.criticalStop.phase,'apply');
});
test('known prewrite failure is isolated and later operations continue',async()=>{
  const run=runFor([problem('a'),problem('b')]);const t=portsFor({validate:async e=>{if(e.id==='op-1')throw new Error('resource missing');}});
  await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);assert.equal(run.entries[0].state,'FAILED');assert.equal(run.entries[1].state,'RESOLVED_VERIFIED');assert.deepEqual(t.applied,['op-2']);
});
test('first critical error records stop reason and blocks every later write',async()=>{
  const run=runFor([problem('a'),problem('b'),problem('c')]);
  const t=portsFor({validate:async e=>{if(e.id==='op-2')throw Object.assign(new Error('auth lost'),{code:'AUTH_LOST'});}});
  await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);
  assert.deepEqual(t.applied,['op-1']);
  assert.equal(run.entries[0].state,'RESOLVED_VERIFIED');
  assert.equal(run.entries[1].state,'FAILED');
  assert.equal(run.entries[2].state,'BLOCKED');
  assert.equal(run.status,'INTERRUPTED');
  assert.equal(run.criticalStop.entryId,'op-2');
  assert.equal(run.criticalStop.code,'AUTH_LOST');
  assert.equal(batchFinalReport(run).criticalStop.code,'AUTH_LOST');
  assert.equal(isCriticalBatchError('AUTH_LOST',{phase:'validate'}),true);
});
test('auth loss during preflight stops all future writes',async()=>{
  const run=runFor([problem('a'),problem('b')]);const t=portsFor({validate:async()=>{throw Object.assign(new Error('auth lost'),{code:'AUTH_LOST'});}});
  await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);assert.equal(t.applied.length,0);assert.equal(run.entries[1].state,'BLOCKED');assert.equal(run.status,'INTERRUPTED');
});
test('disk failure before write stops execution without a remote side effect',async()=>{
  const run=runFor([problem('a')]),t=portsFor();await prepareBatch(run,t.ports);
  t.ports.save=async r=>{if(r.entries[0].state==='IN_EXECUTION')throw new Error('disk full');};
  await assert.rejects(executeBatch(run,approve(run),t.ports),/disk full/);assert.equal(t.applied.length,0);
});
test('stop request settles the current operation and blocks subsequent ones',async()=>{
  const run=runFor([problem('a'),problem('b')]);let stopped=false;const t=portsFor({stopped:()=>stopped,verify:async()=>{stopped=true;return{record:{status:'Verificato',writeConfirmed:true,frontendConfirmed:true}};}});
  await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);assert.deepEqual(t.applied,['op-1']);assert.equal(run.entries[1].state,'BLOCKED');
});
test('mixed batch gate reports succeeded, skipped, manual and failed outcomes together',async()=>{
  const problems=[
    problem('success-a'),
    problem('skip-duplicate'),
    problem('manual',{correctability:'manual',issueType:'image-alt',title:'Immagine senza alt'}),
    problem('failed'),
    problem('success-b'),
  ];
  const run=runFor(problems);
  const t=portsFor({
    prepare:async e=>['op-1','op-2'].includes(e.id)
      ? preview(e,{resource:'shared-resource',changes:{title:'same'}})
      : preview(e),
    validate:async e=>{if(e.id==='op-4')throw new Error('isolated non-critical failure');},
  });
  await prepareBatch(run,t.ports);
  await executeBatch(run,approve(run),t.ports);
  assert.equal(run.entries[0].state,'RESOLVED_VERIFIED');
  assert.equal(run.entries[1].state,'SKIPPED');
  assert.equal(run.entries[2].state,'MANAGED_ASSISTED');
  assert.equal(run.entries[3].state,'FAILED');
  assert.equal(run.entries[4].state,'RESOLVED_VERIFIED');
  assert.deepEqual(t.applied,['op-1','op-5']);
  const report=batchFinalReport(run);
  assert.deepEqual(report.outcomes,{succeeded:2,skipped:1,manual:1,failed:1,blocked:0,unverified:0,uncertain:0});
  assert.equal(report.criticalStop,null);
  assert.equal(run.status,'PARTIAL_SUCCESS');
});
test('realistic 10-problem scenario: 6 fixes, duplicate, manual, failure, stale',async()=>{
  const problems=Array.from({length:10},(_,i)=>problem(String(i),i===7?{correctability:'manual',issueType:'image-alt',title:'Immagine senza alt'}:{}));
  const run=runFor(problems);const t=portsFor({prepare:async e=>preview(e,{resource:e.id==='op-7'?'shared':e.id==='op-1'?'shared':e.id,changes:{title:['op-1','op-7'].includes(e.id)?'shared':'new'+e.id}}),
    validate:async e=>{if(e.id==='op-9')throw new Error('isolated');if(e.id==='op-10')throw Object.assign(new Error('stale'),{code:'STALE_TARGET'});}});
  await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);
  const sum=batchSummary(run);assert.equal(t.applied.length,6);assert.equal(sum.resolvedProblems,7);assert.equal(sum.managedAssisted,2);assert.equal(sum.FAILED,1);assert.equal(run.status,'PARTIAL_SUCCESS');assert.deepEqual(retryableProblemKeys(run),['8']);
});
test('recovery preserves uncertainty and requires fresh approval for queued entries',()=>{
  const run=runFor([problem('a'),problem('b')]);run.status='RUNNING';run.entries[0].state='IN_EXECUTION';run.entries[1].state='PREPARED';run.approval={at:'old'};
  const result=recoverBatchRun(run,[]);assert.equal(result.entries[0].state,'UNCERTAIN');assert.equal(result.entries[1].state,'BLOCKED');assert.equal(result.approval,null);assert.equal(result.status,'INTERRUPTED');assert.ok(result.finalReport);
});
test('recovery reads confirmed receipt without fabricating verification',()=>{
  const run=runFor([problem('a')]);run.status='RUNNING';run.entries[0].state='IN_EXECUTION';
  const result=recoverBatchRun(run,[{id:run.entries[0].correctionId,status:'Da verificare',writeConfirmed:true,frontendConfirmed:false}]);assert.equal(result.entries[0].state,'APPLIED_UNVERIFIED');
});
test('report strips secrets deeply while preserving before/after and token counts',()=>{
  const safe=batchHistorySnapshot({credentials:{password:'secret'},tokens:123,entries:[{preview:{data:{approvalToken:'s',previewBefore:{title:'old'}}}}],applicationPassword:'pw'});
  assert.equal(safe.tokens,123);assert.doesNotMatch(JSON.stringify(safe),/secret|approvalToken|applicationPassword|credentials/);assert.equal(safe.entries[0].preview.data.previewBefore.title,'old');
});
test('false verification needs explicit write and public confirmation, no outstanding audit',()=>{
  assert.equal(verificationState({record:{status:'Verificato'}}),'APPLIED_UNVERIFIED');
  assert.equal(verificationState({record:{status:'Verificato',writeConfirmed:true,frontendConfirmed:true},needsAudit:true}),'APPLIED_UNVERIFIED');
  assert.equal(verificationState({record:{status:'Verificato',writeConfirmed:true,frontendConfirmed:true},needsBrowserVerification:true}),'APPLIED_UNVERIFIED');
  assert.equal(verificationState({record:{status:'Verificato',writeConfirmed:true,frontendConfirmed:true,liveApproval:true,verifiedAt:'2026-09-17T12:00:00Z'}}),'APPLIED_UNVERIFIED');
});
test('site lock fails closed when unavailable or held by another tab',async()=>{
  let called=0;await assert.rejects(withBatchLock('https://example.com',async()=>called++,{}));
  await assert.rejects(withBatchLock('https://example.com',async()=>called++,{request:async(_n,_o,cb)=>cb(null)}));assert.equal(called,0);
});
test('approval fingerprint binds site, resource, before/after, changes, dependencies, order and risk',()=>{
  const run=runFor([problem('a')]);const e=run.entries[0];e.state='PREPARED';e.preview=preview(e);e.executionOrder=1;const before=approvalFingerprint(run);
  e.dependsOn=['other'];assert.notEqual(approvalFingerprint(run),before);e.dependsOn=[];const afterDependency=approvalFingerprint(run);e.riskGroup='high';assert.notEqual(approvalFingerprint(run),afterDependency);
});

test('non-editable WordPress resources are absorbed by the assisted batch fallback without declaring success', async () => {
  const run=runFor([problem('archive-like')]);
  const t=portsFor({prepare:async()=>{throw Object.assign(new Error('Nessuna pagina o articolo WordPress trovato'),{code:'NON_EDITABLE_RESOURCE'});}});
  await prepareBatch(run,t.ports);
  assert.equal(run.entries[0].state,'MANAGED_ASSISTED');
  assert.equal(run.status,'COMPLETED_WITH_OPEN');
});

test('assisted fallback remains open until the intervention is actually verified',async()=>{
  const run=runFor([problem('manual',{correctability:'manual',issueType:'image-alt',title:'Immagine senza alt'})]);const t=portsFor();await prepareBatch(run,t.ports);
  assert.equal(run.entries[0].state,'MANAGED_ASSISTED');assert.equal(run.status,'COMPLETED_WITH_OPEN');assert.equal(t.applied.length,0);assert.equal(batchSummary(run).managedAssisted,1);
});
