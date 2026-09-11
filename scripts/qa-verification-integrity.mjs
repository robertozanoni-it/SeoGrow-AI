import assert from 'node:assert/strict';

// Real app modules + IndexedDB; deliberately faulty external response fixtures.
export async function runVerificationIntegrity({evaluate,waitFor,record,read,mock}) {
  await record('VERIFICATION-EVIDENCE-AND-SCOPE', async () => {
    const clientId=await read('seogrow-selected-client-v1');
    const clients=await read('seogrow-clients');
    const client=clients.find(c=>Number(c.id)===Number(clientId));
    const others=clients.filter(c=>Number(c.id)!==Number(clientId));
    assert.ok(others.length,'Cross-project regression requires two projects');
    const original=await evaluate("(async()=>{const m=await import('/src/remediationStore.js');return m.listCorrections({includeOrphans:true})})()");
    const tasks=await read('seogrow-tasks-v2');
    const url=new URL('verification-proof/',client.url).href;
    const row={id:'qa-verification-proof',clientId,siteUrl:client.url,sourceUrl:url,entityId:321,resource:'posts',fields:['content'],before:{content:'Old content'},after:{content:'New content'},issueType:'thin',issueLabel:'Contenuto breve',issue:{type:'thin',label:'Contenuto breve'},status:'Verificato',frontendConfirmed:true,writeConfirmed:true,verifiedAt:'2026-09-10T10:00:00Z',editorialQuality:{publishable:true}};
    const good={ok:true,isHtml:true,status:200,url,wordpressDocumentId:321,title:'Observed public page',words:400,minimumWords:180,pageKind:'content',contentProbeVisible:true,verificationSafe:true,requiresBrowserVerification:false};
    const save=row=>evaluate(`(async()=>{const m=await import('/src/remediationStore.js');return m.saveCorrection(${JSON.stringify(row)})})()`);
    const recheck=()=>evaluate("(async()=>{const m=await import('/src/remediationIntegrity.js');await m.recheckCorrectionById('qa-verification-proof');const s=await import('/src/remediationStore.js');return s.readCorrection('qa-verification-proof')})()");
    const setClient=id=>evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');m.workspaceStorage.setItem('seogrow-selected-client-v1',${JSON.stringify(JSON.stringify(id))});await m.flushWorkspace()})()`);
    try {
      await save(row);
      await mock('/api/wordpress/verify-frontend',{...good,url:new URL('other-page/',client.url).href});
      let result=await recheck();
      assert.equal(result.status,'Da verificare','Wrong public page must revoke a formerly verified state');
      assert.equal(result.frontendConfirmed,false);
      assert.equal(result.verifiedAt,'');
      assert.deepEqual(result.before,row.before);assert.deepEqual(result.after,row.after);
      assert.equal(result.lastSuccessfulVerification.verifiedAt,row.verifiedAt);
      await mock('/api/wordpress/verify-frontend',good);
      result=await recheck();assert.equal(result.status,'Verificato','Complete evidence can recover');
      await mock('/api/wordpress/verify-frontend',{words:400,contentProbeVisible:true});
      result=await recheck();assert.equal(result.status,'Da verificare','Incomplete 200 response cannot retain a green result');
      await save({...row,editorialQuality:null});
      await mock('/api/wordpress/verify-frontend',good);
      result=await recheck();assert.equal(result.status,'Da verificare','Missing editorial acceptance is not acceptance');
      await save({...row,status:'Da verificare',verifiedAt:'',frontendConfirmed:false});
      // Hold the actual application's fetch, then switch project before its completion.
      await evaluate(`window.__qaOriginalVerifyFetch=window.fetch;window.__qaVerificationStarted=false;window.fetch=async(input,init)=>{const u=typeof input==='string'?input:input.url;if(u.includes('/api/wordpress/verify-frontend')){window.__qaVerificationStarted=true;return new Promise(resolve=>{window.__qaReleaseVerification=()=>resolve(new Response(${JSON.stringify(JSON.stringify(good))},{status:200,headers:{'content-type':'application/json'}}))})}return window.__qaOriginalVerifyFetch(input,init)};window.__qaPendingVerification=(async()=>{const m=await import('/src/remediationIntegrity.js');return m.recheckCorrectionById('qa-verification-proof')})();true`);
      await waitFor('window.__qaVerificationStarted','Verification genuinely started before switching project');
      await setClient(others[0].id);
      await evaluate('(async()=>{window.__qaReleaseVerification();window.__qaVerificationOutcome=await window.__qaPendingVerification;return true})()');
      const unchanged=await evaluate("(async()=>{const m=await import('/src/remediationStore.js');return m.readCorrection('qa-verification-proof')})()");
      assert.equal(unchanged.status,'Da verificare','Late response cannot update the old project after a scope change');
      assert.equal(unchanged.frontendConfirmed,false);
      assert.equal(await evaluate('window.__qaVerificationOutcome.changed'),false);
    } finally {
      await evaluate('if(window.__qaOriginalVerifyFetch){window.fetch=window.__qaOriginalVerifyFetch;delete window.__qaOriginalVerifyFetch;}if(window.__qaReleaseVerification)window.__qaReleaseVerification();');
      await setClient(clientId);
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${JSON.stringify(original)});const w=await import('/src/workspaceDatabase.js');w.workspaceStorage.setItem('seogrow-tasks-v2',${JSON.stringify(JSON.stringify(tasks))});await w.flushWorkspace()})()`);
    }
  });
}
