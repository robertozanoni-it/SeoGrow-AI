import assert from 'node:assert/strict';

const q = JSON.stringify;

export async function runFunctionalJourney({ evaluate, waitFor, clickSidebar, reload, record }) {
  const clientName = 'QA Journey';
  const siteUrl = 'https://journey.example/';
  const pageUrl = 'https://journey.example/servizi/';
  const issueKey = 'journey-title-issue';
  const correctionId = 'journey-correction';
  const taskId = 'journey-task';

  await record('FUNCTIONAL-JOURNEY-18', async () => {
    // 1. Nuovo cliente: use the real Clients UI, not a storage shortcut.
    await clickSidebar('Clienti');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Nuovo cliente')", 'new client CTA');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Nuovo cliente').click()");
    await waitFor("document.querySelector('[role=dialog] form')", 'client dialog');
    await evaluate(`(()=>{const form=document.querySelector('[role=dialog] form');const inputs=[...form.querySelectorAll('input')];const name=inputs.find(i=>/nome/i.test(i.labels?.[0]?.textContent||''));const url=inputs.find(i=>i.type==='url'||/sito|url/i.test(i.labels?.[0]?.textContent||''));if(!name||!url)throw new Error('Campi nuovo cliente non trovati');for(const [el,value] of [[name,${q(clientName)}],[url,${q(siteUrl)}]]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}form.requestSubmit();})()`);
    await waitFor(`(async()=>{const m=await import('/src/workspaceDatabase.js');const rows=JSON.parse(m.workspaceStorage.getItem('seogrow-clients')||'[]');return rows.some(c=>c.name===${q(clientName)}&&c.url===${q(siteUrl)})})()`, 'client persisted');
    const actualClientId = await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const rows=JSON.parse(m.workspaceStorage.getItem('seogrow-clients')||'[]');return rows.find(c=>c.name===${q(clientName)}&&c.url===${q(siteUrl)})?.id})()`);
    assert.ok(Number(actualClientId) > 0, 'client id created');

    // Keep the same selected project for the whole journey.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');m.workspaceStorage.setItem('seogrow-selected-client-v1',JSON.stringify(${actualClientId}));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key:'seogrow-selected-client-v1',newValue:JSON.stringify(${actualClientId})}));})()`);

    // 2. WordPress connection: real central session boundary, no password persisted.
    await clickSidebar('Integrazioni');
    await evaluate(`(async()=>{const sys=await import('/src/system/index.js');sys.rememberWordPressSession(${actualClientId},{url:${q(siteUrl)},username:'qa-journey',applicationPassword:'qa-journey-session-only'});})()`);
    const wp = await evaluate(`(async()=>{const sys=await import('/src/system/index.js');return sys.getWordPressSession(${actualClientId},${q(siteUrl)})})()`);
    assert.equal(wp?.username, 'qa-journey');
    const persistedAfterWp = await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');return JSON.stringify({profiles:m.workspaceStorage.getItem('seogrow-wordpress-profiles-v1'),preferences:m.workspaceStorage.getItem('seogrow-preferences-v1')})})()`);
    assert.ok(!persistedAfterWp.includes('qa-journey-session-only'), 'WordPress secret not persisted');

    // 3. Audit -> 4. Problem: one project-scoped audit becomes a visible problem.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const key='seogrow-page-audit-history-v2';const store=JSON.parse(m.workspaceStorage.getItem(key)||'{}');store[${actualClientId}]=[{url:${q(pageUrl)},analyzedAt:new Date().toISOString(),score:82,pagesChecked:1,issues:[{type:'title',label:'Title mancante',severity:'alta',sourceUrl:${q(pageUrl)},detail:'Titolo SEO assente nella pagina.',diagnosisState:'confirmed',key:${q(issueKey)}}],reviewItems:[]}];m.workspaceStorage.setItem(key,JSON.stringify(store));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(store)}));})()`);
    await clickSidebar('Audit SEO');
    await waitFor(`document.body.innerText.includes('Title mancante')`, 'audit issue visible');
    await clickSidebar('Problemi');
    await waitFor(`document.body.innerText.includes('Title mancante')`, 'problem visible');

    // 5. Correction -> 6. Verification: canonical remediation store, no parallel state.
    await evaluate(`(async()=>{const r=await import('/src/remediationStore.js');await r.saveCorrection({id:${q(correctionId)},clientId:${actualClientId},clientName:${q(clientName)},issueLabel:'Title mancante',issueType:'title',issueKey:${q(issueKey)},sourceUrl:${q(pageUrl)},siteUrl:${q(siteUrl)},status:'Verificato',fields:['title'],appliedAt:new Date().toISOString(),verifiedAt:new Date().toISOString(),liveApproval:true,verification:{frontend:true,audit:true},completionEvidence:{publicVerified:true}});})()`);
    await clickSidebar('Correzioni');
    await waitFor(`document.body.innerText.includes('Title mancante')`, 'verified correction visible');

    // 7. Rollback: update the same correction record.
    await evaluate(`(async()=>{const r=await import('/src/remediationStore.js');await r.updateCorrection(${q(correctionId)},{status:'Rolled back',rollbackAt:new Date().toISOString()});})()`);
    await waitFor(`(async()=>{const r=await import('/src/remediationStore.js');const row=await r.readCorrection(${q(correctionId)});return /rolled/i.test(row?.status||'')&&Boolean(row?.rollbackAt)})()`, 'rollback persisted');

    // 8. Task: canonical task linked to the same problem/correction.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const key='seogrow-tasks-v2';const rows=JSON.parse(m.workspaceStorage.getItem(key)||'[]').filter(t=>t.id!==${q(taskId)});rows.unshift({id:${q(taskId)},title:'Ricontrolla title dopo rollback',client:${q(clientName)},sourceClientId:${actualClientId},priority:'Alta',due:'',status:'Da fare',kind:'title',sourceUrl:${q(pageUrl)},targetUrl:'',detail:'Task del journey funzionale dopo rollback.',notes:'',createdAt:new Date().toISOString(),taskLinks:{problemKey:${q(issueKey)},correctionId:${q(correctionId)}}});m.workspaceStorage.setItem(key,JSON.stringify(rows));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(rows)}));})()`);
    await clickSidebar('Task');
    await waitFor(`document.body.innerText.includes('Ricontrolla title dopo rollback')`, 'task visible');

    // 9. Ranking: canonical project ranking run.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const key='seogrow-rankings-v1';const store=JSON.parse(m.workspaceStorage.getItem(key)||'{}');store[${actualClientId}]=[{checkedAt:new Date().toISOString(),device:'desktop',locationCode:2826,languageCode:'it',depth:20,rankings:[{keyword:'seo journey',position:9,url:${q(pageUrl)}}]}];m.workspaceStorage.setItem(key,JSON.stringify(store));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(store)}));})()`);
    await clickSidebar('Posizionamenti');
    await waitFor(`document.body.innerText.includes('seo journey')`, 'ranking visible');

    // 10. Opportunity: the module derives it from real project Search Console-shaped data.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const key='seogrow-gsc-v1';const store=JSON.parse(m.workspaceStorage.getItem(key)||'{}');store[${actualClientId}]={totals:{clicks:3,impressions:240,ctr:1.25,position:9},graph:[],countries:[],devices:[],imports:[],queries:[{dimension:'seo journey',position:9,impressions:240,clicks:3,ctr:1.25}],pages:[],queryPages:[{query:'seo journey',pages:[${q(pageUrl)}]}],dateFrom:'2026-08-01',dateTo:'2026-09-17',importedAt:new Date().toISOString()};m.workspaceStorage.setItem(key,JSON.stringify(store));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(store)}));})()`);
    await clickSidebar('Opportunità');
    await waitFor(`document.body.innerText.includes('seo journey')`, 'opportunity derived');

    // 11. Editorial plan: use the same ranking/opportunity evidence; no duplicate plan store.
    await clickSidebar('Piano editoriale');
    await waitFor(`document.body.innerText.includes('seo journey')`, 'editorial row derived from project evidence');

    // 12. Reopen app: full reload, same selected project and state, no manual reset/reseed.
    await reload();
    const continuity = await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const selected=JSON.parse(m.workspaceStorage.getItem('seogrow-selected-client-v1')||'0');const clients=JSON.parse(m.workspaceStorage.getItem('seogrow-clients')||'[]');const audits=JSON.parse(m.workspaceStorage.getItem('seogrow-page-audit-history-v2')||'{}');const tasks=JSON.parse(m.workspaceStorage.getItem('seogrow-tasks-v2')||'[]');const rankings=JSON.parse(m.workspaceStorage.getItem('seogrow-rankings-v1')||'{}');const gsc=JSON.parse(m.workspaceStorage.getItem('seogrow-gsc-v1')||'{}');const r=await import('/src/remediationStore.js');const correction=await r.readCorrection(${q(correctionId)});return {selected,client:clients.some(c=>Number(c.id)===Number(${actualClientId})),audit:Boolean(audits[${actualClientId}]?.length),task:tasks.some(t=>t.id===${q(taskId)}),ranking:Boolean(rankings[${actualClientId}]?.length),opportunity:Boolean(gsc[${actualClientId}]?.queries?.length),rollback:/rolled/i.test(correction?.status||'')&&Boolean(correction?.rollbackAt)}})()`);
    assert.deepEqual(continuity, { selected: actualClientId, client: true, audit: true, task: true, ranking: true, opportunity: true, rollback: true });

    await clickSidebar('Task');
    await waitFor(`document.body.innerText.includes('Ricontrolla title dopo rollback')`, 'journey task after reopen');
    await clickSidebar('Piano editoriale');
    await waitFor(`document.body.innerText.includes('seo journey')`, 'editorial evidence after reopen');

    // Cleanup for subsequent legacy screenshot checks only; the tested journey itself had no reset.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');m.workspaceStorage.setItem('seogrow-selected-client-v1',JSON.stringify(9001));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key:'seogrow-selected-client-v1',newValue:JSON.stringify(9001)}));})()`);
  });
}
