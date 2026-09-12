import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicObservation, contentVerificationEvidence, verificationErrorPatch, verifiedForAudit } from './remediationEvidence.js';
import { selectFocusedRemediation, proposalSelectionKey } from './remediationSelection.js';
import { normalizeClientId } from './reliabilityModel.js';
import { applyJournaledCorrection } from './correctionJournal.js';

const url = 'https://example.com/article/';
const record = {id:'receipt', clientId:1, entityId:42, sourceUrl:url, fields:['content'], before:{content:'before'}, after:{content:'after'}, editorialQuality:{publishable:true}};
const observed = {ok:true, isHtml:true, status:200, url, wordpressDocumentId:42, words:300, minimumWords:180, pageKind:'content', contentProbeVisible:true, verificationSafe:true, requiresBrowserVerification:false};
const time = '2026-09-11T10:00:00Z';

test('public proof rejects wrong pages, failed HTTP, missing HTML and coercible status values', () => {
  assert.doesNotThrow(() => assertPublicObservation(record, observed));
  for (const patch of [{url:'https://example.com/another/'},{wordpressDocumentId:43},{status:404},{status:'200'},{status:null},{isHtml:false},{ok:false},{url:'javascript:alert(1)'}]) {
    assert.throws(() => assertPublicObservation(record, {...observed,...patch}));
  }
  assert.throws(() => assertPublicObservation(record, {}));
});

test('content verification requires the threshold, the actual change and explicit quality/visibility evidence', () => {
  assert.equal(contentVerificationEvidence(record, observed).fixed, true);
  for (const patch of [{words:undefined},{words:'300'},{minimumWords:undefined},{minimumWords:false},{minimumWords:0},{words:179},{contentProbeVisible:undefined},{verificationSafe:undefined},{requiresBrowserVerification:undefined},{requiresBrowserVerification:true},{pageKind:'gdpr'}]) {
    assert.equal(contentVerificationEvidence(record, {...observed,...patch}).fixed, false, JSON.stringify(patch));
  }
  for (const quality of [undefined, null, {}, {publishable:false}, {publishable:'true'}]) {
    assert.equal(contentVerificationEvidence({...record,editorialQuality:quality}, observed).fixed, false);
  }
});

test('a failed recheck revokes current confirmation while preserving historical evidence and before/after', () => {
  const original = {...record, status:'Verificato', frontendConfirmed:true, verifiedAt:time, frontendSnapshot:{words:300}};
  const patch = verificationErrorPatch(original, new Error('network unavailable'), 'Riverifica', time);
  assert.equal(patch.status, 'Da verificare');
  assert.equal(patch.frontendConfirmed, false);
  assert.equal(patch.verifiedAt, '');
  assert.equal(patch.lastSuccessfulVerification.verifiedAt, time);
  assert.deepEqual({...original,...patch}.before, record.before);
  assert.deepEqual({...original,...patch}.after, record.after);
});

test('a later audit detection is never suppressed by an older verified correction', () => {
  const verified = {...record,status:'Verificato',verifiedAt:time,frontendConfirmed:true,writeConfirmed:true};
  assert.equal(verifiedForAudit(verified,'2026-09-11T09:00:00Z'),true);
  assert.equal(verifiedForAudit(verified,'2026-09-11T11:00:00Z'),false);
  assert.equal(verifiedForAudit({...verified,verifiedAt:undefined},time),false);
  assert.equal(verifiedForAudit({...verified,frontendConfirmed:false},time),false);
  assert.equal(verifiedForAudit(verified,undefined),false);
});

const title = {type:'duplicate-title',label:'Title duplicato',sourceUrl:url};
const description = {...title,type:'duplicate-description',label:'Meta description duplicata',detail:'Title duplicato sulla pagina'};
const audit = {type:'site',item:{url:'https://example.com/',analyzedAt:time,issues:[title,description]}};
const focus = {clientId:1,sourceUrl:url,issueType:description.type,title:description.label,createdAt:1};

test('current proposal identity resolves description rather than a stale title index or misleading detail', () => {
  const selected = selectFocusedRemediation([audit], {...focus,issueIndex:0}, 1, {url:'https://example.com/'});
  assert.equal(selected.issueIndex, 1);
  assert.equal(selected.audit.item.issues[selected.issueIndex],description);
  assert.equal(selected.focusKey,proposalSelectionKey(focus));
});

test('missing, ambiguous, cross-client and unproven slash-variant proposals fail closed', () => {
  assert.equal(selectFocusedRemediation([audit],focus,2,{}),null);
  assert.equal(selectFocusedRemediation([audit],{...focus,sourceUrl:url.slice(0,-1)},1,{}),null);
  assert.equal(selectFocusedRemediation([audit],null,1,{}),null);
  assert.equal(selectFocusedRemediation([audit,audit],focus,1,{}),null);
  assert.equal(selectFocusedRemediation([{...audit,item:{...audit.item,issues:[description,description]}}],focus,1,{}),null);
  assert.equal(selectFocusedRemediation([{...audit,item:{...audit.item,analyzedAt:null}}],focus,1,{}),null);
});

test('legacy title-only focus is supported without looking at unrelated audit prose', () => {
  assert.equal(selectFocusedRemediation([audit],{...focus,issueType:undefined},1,{}).issueIndex,1);
});

test('latest observed audit is selected, and focus changes invalidate existing previews', () => {
  const newer = {...audit,item:{...audit.item,analyzedAt:'2026-09-11T11:00:00Z',issues:[description,title]}};
  assert.equal(selectFocusedRemediation([audit,newer],focus,1,{}).issueIndex,0);
  assert.notEqual(proposalSelectionKey(focus),proposalSelectionKey({...focus,createdAt:2}));
  assert.notEqual(proposalSelectionKey(focus),proposalSelectionKey({...focus,issueType:title.type}));
});

test('client IDs never coerce boolean, array or object values into another real client', () => {
  for (const id of [true,false,[1],{valueOf:()=>1},null,undefined,'', '   ']) assert.equal(normalizeClientId(id),null);
  assert.equal(normalizeClientId('1'),1);
  assert.equal(normalizeClientId(1),1);
});

test('empty, fabricated, partial or altered write receipts remain uncertain; no automatic retry', async () => {
  for (const response of [null, {}, {ok:true}, {before:record.before}, {after:record.after}, {before:record.before,after:{content:'other'}}, {before:{content:'different'},after:record.after}]) {
    let saved, writes=0;
    await assert.rejects(applyJournaledCorrection(record,async()=>{writes++;return response;},async value=>(saved=structuredClone(value))),/Esito/);
    assert.equal(saved.status,'Esito incerto');
    assert.equal(saved.writeConfirmed,false);
    assert.deepEqual(saved.before,record.before);
    assert.deepEqual(saved.after,record.after);
    assert.equal(writes,1);
  }
});

test('a complete write receipt cannot mark its own public SEO as verified', async () => {
  const saved=await applyJournaledCorrection(record,async()=>({before:record.before,after:record.after,frontendConfirmed:true,status:'Verificato',verifiedAt:time}),async value=>value);
  assert.equal(saved.status,'Da verificare');
  assert.equal(saved.frontendConfirmed,false);
  assert.equal(saved.verifiedAt,'');
});
