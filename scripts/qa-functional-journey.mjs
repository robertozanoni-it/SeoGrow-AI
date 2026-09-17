import assert from 'node:assert/strict';

const q = JSON.stringify;

export async function runFunctionalJourney({ evaluate, waitFor, clickSidebar, reload, record }) {
  const clientName = 'QA Journey';
  const siteUrl = 'https://journey.example/';
  const pageUrl = 'https://journey.example/servizi/';
  const issueKey = 'journey-title-issue';
  const correctionId = 'journey-correction';
  const taskTitle = 'Ricontrolla title dopo rollback';

  await record('FUNCTIONAL-JOURNEY-18', async () => {
    // 1. Nuovo cliente: real Clients UI, no storage shortcut.
    await clickSidebar('Clienti');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Nuovo cliente')", 'new client CTA');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Nuovo cliente').click()");
    await waitFor("document.querySelector('[role=dialog] form')", 'client dialog');
    await evaluate(`(()=>{const form=document.querySelector('[role=dialog] form');const inputs=[...form.querySelectorAll('input')];const name=inputs.find(i=>/nome/i.test(i.labels?.[0]?.textContent||''));const url=inputs.find(i=>i.type==='url'||/sito|url/i.test(i.labels?.[0]?.textContent||''));if(!name||!url)throw new Error('Campi nuovo cliente non trovati');for(const [el,value] of [[name,${q(clientName)}],[url,${q(siteUrl)}]]){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));}form.requestSubmit();})()`);
    await waitFor(`(async()=>{const m=await import('/src/workspaceDatabase.js');const rows=JSON.parse(m.workspaceStorage.getItem('seogrow-clients')||'[]');return rows.some(c=>c.name===${q(clientName)}&&c.url===${q(siteUrl)})})()`, 'client persisted');
    const actualClientId = await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const rows=JSON.parse(m.workspaceStorage.getItem('seogrow-clients')||'[]');return rows.find(c=>c.name===${q(clientName)}&&c.url===${q(siteUrl)})?.id})()`);
    assert.ok(Number(actualClientId) > 0, 'client id created');

    // Select through the actual client card so React, storage and project context change together.
    await waitFor(`[...document.querySelectorAll('.reference-client-card')].some(c=>c.textContent.includes(${q(clientName)}))`, 'journey client card');
    await evaluate(`(()=>{const card=[...document.querySelectorAll('.reference-client-card')].find(c=>c.textContent.includes(${q(clientName)}));if(!card)throw new Error('Journey client card missing');card.click();})()`);
    await waitFor(`(async()=>{const m=await import('/src/workspaceDatabase.js');return Number(JSON.parse(m.workspaceStorage.getItem('seogrow-selected-client-v1')||'0'))===Number(${actualClientId})})()`, 'journey project selected by UI');

    // 2. WordPress connection: central transient session, password never persisted.
    await clickSidebar('Integrazioni');
    await evaluate(`(async()=>{const sys=await import('/src/system/index.js');sys.rememberWordPressSession(${actualClientId},{url:${q(siteUrl)},username:'qa-journey',applicationPassword:'qa-journey-session-only'});})()`);
    const wp = await evaluate(`(async()=>{const sys=await import('/src/system/index.js');return sys.getWordPressSession(${actualClientId},${q(siteUrl)})})()`);
    assert.equal(wp?.username, 'qa-journey');
    const persistedAfterWp = await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');return JSON.stringify({profiles:m.workspaceStorage.getItem('seogrow-wordpress-profiles-v1'),preferences:m.workspaceStorage.getItem('seogrow-preferences-v1')})})()`);
    assert.ok(!persistedAfterWp.includes('qa-journey-session-only'), 'WordPress secret not persisted');

    // 3. Audit -> 4. Problema: project-scoped audit becomes visible in both modules.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const key='seogrow-page-audit-history-v2';const store=JSON.parse(m.workspaceStorage.getItem(key)||'{}');store[${actualClientId}]=[{url:${q(pageUrl)},analyzedAt:new Date().toISOString(),score:82,pagesChecked:1,issues:[{type:'title',label:'Title mancante',severity:'alta',sourceUrl:${q(pageUrl)},detail:'Titolo SEO assente nella pagina.',diagnosisState:'confirmed',key:${q(issueKey)}}],reviewItems:[]}];m.workspaceStorage.setItem(key,JSON.stringify(store));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(store)}));})()`);
    await clickSidebar('Audit SEO');
    await waitFor(`document.body.innerText.includes('Title mancante')`, 'audit issue visible');
    await clickSidebar('Problemi');
    await waitFor(`document.body.innerText.includes('Title mancante')`, 'problem visible');

    // 5. Correzione -> 6. Verifica: canonical remediation store only.
    await evaluate(`(async()=>{const r=await import('/src/remediationStore.js');await r.saveCorrection({id:${q(correctionId)},clientId:${actualClientId},clientName:${q(clientName)},issueLabel:'Title mancante',issueType:'title',issueKey:${q(issueKey)},sourceUrl:${q(pageUrl)},siteUrl:${q(siteUrl)},status:'Verificato',fields:['title'],appliedAt:new Date().toISOString(),verifiedAt:new Date().toISOString(),liveApproval:true,verification:{frontend:true,audit:true},completionEvidence:{publicVerified:true}});})()`);
    await clickSidebar('Correzioni');
    await waitFor(`document.body.innerText.includes('Title mancante')`, 'verified correction visible');

    // 7. Rollback: mutate the same canonical correction record.
    await evaluate(`(async()=>{const r=await import('/src/remediationStore.js');await r.updateCorrection(${q(correctionId)},{status:'Rolled back',rollbackAt:new Date().toISOString()});})()`);
    await waitFor(`(async()=>{const r=await import('/src/remediationStore.js');const row=await r.readCorrection(${q(correctionId)});return /rolled/i.test(row?.status||'')&&Boolean(row?.rollbackAt)})()`, 'rollback persisted');

    // 8. Task: create through the real Task UI, not a direct store injection.
    await clickSidebar('Task');
    await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Nuova task'&&!b.disabled)", 'new task CTA');
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Nuova task'&&!b.disabled).click()");
    await waitFor("document.querySelector('.task-editor')", 'journey task editor');
    await evaluate(`(()=>{const form=document.querySelector('.task-editor');const title=form.querySelector('input');if(!title)throw new Error('Titolo task non trovato');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(title,${q(taskTitle)});title.dispatchEvent(new Event('input',{bubbles:true}));form.requestSubmit();})()`);
    await waitFor(`(async()=>{const m=await import('/src/workspaceDatabase.js');const rows=JSON.parse(m.workspaceStorage.getItem('seogrow-tasks-v2')||'[]');return rows.some(t=>t.title===${q(taskTitle)}&&Number(t.sourceClientId)===Number(${actualClientId}))})()`, 'journey task persisted through UI');
    const journeyTaskId = await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const rows=JSON.parse(m.workspaceStorage.getItem('seogrow-tasks-v2')||'[]');return rows.find(t=>t.title===${q(taskTitle)}&&Number(t.sourceClientId)===Number(${actualClientId}))?.id})()`);
    assert.ok(journeyTaskId, 'journey task id created');
    await waitFor(`[...document.querySelectorAll('.task-title-button')].some(b=>b.textContent.includes(${q(taskTitle)}))`, 'task row visible');

    // 9. Ranking: canonical project ranking run.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const key='seogrow-rankings-v1';const store=JSON.parse(m.workspaceStorage.getItem(key)||'{}');store[${actualClientId}]=[{checkedAt:new Date().toISOString(),device:'desktop',locationCode:2826,languageCode:'it',depth:20,rankings:[{keyword:'seo journey',position:9,url:${q(pageUrl)}}]}];m.workspaceStorage.setItem(key,JSON.stringify(store));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(store)}));})()`);
    await clickSidebar('Posizionamenti');
    await waitFor(`document.body.innerText.includes('seo journey')`, 'ranking visible');

    // 10. Opportunità: derive it from project Search Console-shaped evidence.
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const key='seogrow-gsc-v1';const store=JSON.parse(m.workspaceStorage.getItem(key)||'{}');store[${actualClientId}]={totals:{clicks:3,impressions:240,ctr:1.25,position:9},graph:[],countries:[],devices:[],imports:[],queries:[{dimension:'seo journey',position:9,impressions:240,clicks:3,ctr:1.25}],pages:[],queryPages:[{query:'seo journey',pages:[${q(pageUrl)}]}],dateFrom:'2026-08-01',dateTo:'2026-09-17',importedAt:new Date().toISOString()};m.workspaceStorage.setItem(key,JSON.stringify(store));await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key,newValue:JSON.stringify(store)}));})()`);
    await clickSidebar('Opportunità');
    await waitFor(`document.body.innerText.includes('seo journey')`, 'opportunity derived');

    // 11. Piano editoriale: reuse ranking/opportunity evidence; no duplicate plan store.
    await clickSidebar('Piano editoriale');
    await waitFor(`document.body.innerText.includes('seo journey')`, 'editorial row derived from project evidence');

    // 12. Riapertura app: full reload; the same project and canonical state must survive.
    await reload();
    const continuity = await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');const selected=JSON.parse(m.workspaceStorage.getItem('seogrow-selected-client-v1')||'0');const clients=JSON.parse(m.workspaceStorage.getItem('seogrow-clients')||'[]');const audits=JSON.parse(m.workspaceStorage.getItem('seogrow-page-audit-history-v2')||'{}');const tasks=JSON.parse(m.workspaceStorage.getItem('seogrow-tasks-v2')||'[]');const rankings=JSON.parse(m.workspaceStorage.getItem('seogrow-rankings-v1')||'{}');const gsc=JSON.parse(m.workspaceStorage.getItem('seogrow-gsc-v1')||'{}');const r=await import('/src/remediationStore.js');const correction=await r.readCorrection(${q(correctionId)});return {selected,client:clients.some(c=>Number(c.id)===Number(${actualClientId})),audit:Boolean(audits[${actualClientId}]?.length),task:tasks.some(t=>t.id===${q(journeyTaskId)}),ranking:Boolean(rankings[${actualClientId}]?.length),opportunity:Boolean(gsc[${actualClientId}]?.queries?.length),rollback:/rolled/i.test(correction?.status||'')&&Boolean(correction?.rollbackAt)}})()`);
    assert.deepEqual(continuity, { selected: actualClientId, client: true, audit: true, task: true, ranking: true, opportunity: true, rollback: true });

    await clickSidebar('Task');
    await waitFor(`[...document.querySelectorAll('.task-title-button')].some(b=>b.textContent.includes(${q(taskTitle)}))`, 'journey task row after reopen');
    await clickSidebar('Piano editoriale');
    await waitFor(`document.body.innerText.includes('seo journey')`, 'editorial evidence after reopen');
    // Deliberately no cleanup/reset here: this is the final browser scenario.
  });
}