import test from 'node:test';
import assert from 'node:assert/strict';
import { createBatchRun, batchCapability, visibleBatchSelection, consolidateBatch, batchExecutionOrder, approvalFingerprint, batchSummary, retryableProblemKeys, verificationState, recoverBatchRun } from './batchRemediationModel.js';
import { prepareBatch, executeBatch } from './batchRemediationQueue.js';
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
test('capabilities exclude manual, ownership, archive, unsupported, applied and resolved',()=>{
  for(const [extra,state] of [[{correctability:'manual'},'MANUAL_REQUIRED'],[{ownershipBlocked:true},'BLOCKED'],[{pageKind:'archive'},'MANUAL_REQUIRED'],[{issueType:'broken-link'},'UNSUPPORTED'],[{interventionState:'applied'},'BLOCKED'],[{problemState:'resolved'},'SKIPPED']]) assert.equal(batchCapability(problem('a',extra)).state,state);
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
});
test('known prewrite failure is isolated and later operations continue',async()=>{
  const run=runFor([problem('a'),problem('b')]);const t=portsFor({validate:async e=>{if(e.id==='op-1')throw new Error('resource missing');}});
  await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);assert.equal(run.entries[0].state,'FAILED');assert.equal(run.entries[1].state,'RESOLVED_VERIFIED');assert.deepEqual(t.applied,['op-2']);
});
test('auth loss during preflight stops all future writes',async()=>{
  const run=runFor([problem('a'),problem('b')]);const t=portsFor({validate:async()=>{throw Object.assign(new Error('auth lost'),{code:'AUTH_LOST'});}});
  await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);assert.equal(t.applied.length,0);assert.equal(run.entries[1].state,'BLOCKED');
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
test('realistic 10-problem scenario: 6 fixes, duplicate, manual, failure, stale',async()=>{
  const problems=Array.from({length:10},(_,i)=>problem(String(i),i===7?{correctability:'manual'}:{}));
  const run=runFor(problems);const t=portsFor({prepare:async e=>preview(e,{resource:e.id==='op-7'?'shared':e.id==='op-1'?'shared':e.id,changes:{title:['op-1','op-7'].includes(e.id)?'shared':'new'+e.id}}),
    validate:async e=>{if(e.id==='op-9')throw new Error('isolated');if(e.id==='op-10')throw Object.assign(new Error('stale'),{code:'STALE_TARGET'});}});
  await prepareBatch(run,t.ports);await executeBatch(run,approve(run),t.ports);
  const sum=batchSummary(run);assert.equal(t.applied.length,6);assert.equal(sum.resolvedProblems,7);assert.equal(sum.MANUAL_REQUIRED,1);assert.equal(sum.FAILED,1);assert.equal(sum.STALE_TARGET,1);assert.equal(run.status,'PARTIAL_SUCCESS');assert.deepEqual(retryableProblemKeys(run),['8','9']);
});
test('recovery preserves uncertainty and requires fresh approval for queued entries',()=>{
  const run=runFor([problem('a'),problem('b')]);run.status='RUNNING';run.entries[0].state='IN_EXECUTION';run.entries[1].state='PREPARED';run.approval={at:'old'};
  const result=recoverBatchRun(run,[]);assert.equal(result.entries[0].state,'UNCERTAIN');assert.equal(result.entries[1].state,'BLOCKED');assert.equal(result.approval,null);assert.equal(result.status,'INTERRUPTED');
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
});
test('site lock fails closed when unavailable or held by another tab',async()=>{
  let called=0;await assert.rejects(withBatchLock('https://example.com',async()=>called++,{}));
  await assert.rejects(withBatchLock('https://example.com',async()=>called++,{request:async(_n,_o,cb)=>cb(null)}));assert.equal(called,0);
});
test('approval fingerprint binds site, resource, before/after, changes, dependencies and risk',()=>{
  const run=runFor([problem('a')]);const e=run.entries[0];e.state='PREPARED';e.preview=preview(e);const before=approvalFingerprint(run);e.dependsOn=['other'];assert.notEqual(approvalFingerprint(run),before);
});


test('non-editable WordPress resources are manual-required rather than failed', async () => {
  const run=runFor([problem('archive-like')]);
  const t=portsFor({prepare:async()=>{throw Object.assign(new Error('Nessuna pagina o articolo WordPress trovato'),{code:'NON_EDITABLE_RESOURCE'});}});
  await prepareBatch(run,t.ports);
  assert.equal(run.entries[0].state,'MANUAL_REQUIRED');
  assert.equal(run.status,'COMPLETED_WITH_OPEN');
});
