import assert from 'node:assert/strict';

export async function runSavedCorrectionFlow({ evaluate, waitFor, record, button, set, read, revisit, mock, resetRequests, screenshot, command }) {
  await record('SAVED-CORRECTION-RECEIPT', async () => {
    const clientId = await read('seogrow-selected-client-v1');
    const clients = await read('seogrow-clients');
    const client = clients.find(item => Number(item.id) === Number(clientId));
    const siteKey = 'seogrow-analyses-v2', pageKey = 'seogrow-page-audit-history-v2';
    const sites = await read(siteKey), pages = await read(pageKey);
    const profileKey = 'seogrow-wordpress-profiles-v1', profiles = await read(profileKey);
    const oldRecords = await evaluate("(async()=>{const m=await import('/src/remediationStore.js');return m.listCorrections({includeOrphans:true})})()");
    const write = (key, value) => evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');m.workspaceStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(value))});await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(key)}}))})()`);
    const targetUrl = new URL('receipt-test/', client.url).href;
    const before = 'Descrizione precedente conservata nello storico.';
    const after = 'Descrizione aggiornata approvata: testo completo con accenti, è, perché e un collegamento preciso alla pagina.';
    const issue = { type:'duplicate-description', label:'Meta description duplicata', severity:'alta', url:targetUrl, sourceUrl:targetUrl, detail:'Descrizione duplicata nella fixture controllata.' };
    const audit = { url:client.url, analyzedAt:'2026-09-10T08:00:00.000Z', score:80, issues:[issue] };
    const publicResponse = { ok:true, url:targetUrl, status:200, isHtml:true, title:'Pagina test', metaDescription:after, wordpressDocumentId:123, h1:1, words:300 };
    const receipt = '.automatic-proposal-page .saved-correction-details[data-correction-id]';
    const snapshotValues = scope => evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(scope)});return [...(r?.querySelectorAll('.saved-correction-field .saved-correction-diff pre')||[])].map(n=>n.textContent)})()`);
    const visibleClick = async selector => {
      await waitFor(`document.querySelector(${JSON.stringify(selector)})`, 'Visible target '+selector);
      const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({behavior:'instant',block:'center'});const r=e.getBoundingClientRect(),s=getComputedStyle(e);if(e.disabled||s.display==='none'||s.visibility==='hidden'||r.width<=0||r.height<=0)throw new Error('Control is not visible');return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    };
    let correctionId = '';
    try {
      await write(siteKey,{...sites,[clientId]:[audit]});
      await write(pageKey,{...pages,[clientId]:[]});
      await write(profileKey,{...profiles,[clientId]:{url:client.url,username:'qa-receipt'}});
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${JSON.stringify(oldRecords.filter(row=>Number(row.clientId)!==Number(clientId)))});const s=await import('/src/wordpressSession.js');s.rememberWordPressSession(${clientId},{url:${JSON.stringify(client.url)},username:'qa-receipt',applicationPassword:'qa-only'});const n=await import('/src/AutomaticProposalNavigation.js');sessionStorage.setItem(n.PROPOSAL_FOCUS_KEY,JSON.stringify({title:${JSON.stringify(issue.label)},sourceUrl:${JSON.stringify(targetUrl)},clientId:${clientId},openedFrom:'problem-row',createdAt:Date.now()}));const nav=await import('/src/navigationUx.js');nav.navigatePage('Correzioni');window.dispatchEvent(new CustomEvent('seogrow-automatic-proposal-open'));window.confirm=()=>true})()`);
      await waitFor("document.querySelector('.proposal-remediation-slot .audit-unified-credentials') && document.querySelector('.proposal-remediation-slot .wp-live-remediation-v2')",'Dedicated proposal with real controls');
      assert.equal(await evaluate("decodeURIComponent(location.hash.slice(1))==='Correzioni' && document.querySelector('.automatic-proposal-header h1')?.textContent==='Proposta correzione'"),true);
      for (const [label,value] of Object.entries({'URL del sito':client.url,'Utente WordPress':'qa-receipt','Password applicativa':'qa-only'})) await set('.proposal-remediation-slot .audit-unified-credentials',label,value);
      await mock('/api/wordpress/inspect-fast',{siteUrl:client.url,resource:'posts',entity:{id:123,status:'publish',link:targetUrl,title:{raw:'Pagina test'},content:{raw:'Contenuto della pagina test.'},meta:{rank_math_description:before}}});
      await mock('/api/frontend/inspect',publicResponse);
      await mock('/api/wordpress/generate-seo-value-v2',{value:after,publishable:true});
      await mock('/api/wordpress/live-preview',{approvalToken:'qa-receipt-token',adapter:'Rank Math',resource:'posts',id:123,targetUrl,changed:['meta.rank_math_description'],previewBefore:{meta:{rank_math_description:before}},previewAfter:{meta:{rank_math_description:after}}});
      await mock('/api/wordpress/live-apply',{ok:true,adapter:'Rank Math',resource:'posts',id:123,sourceUrl:targetUrl,changed:['meta.rank_math_description'],before:{meta:{rank_math_description:before}},after:{meta:{rank_math_description:after}}});
      await mock('/api/wordpress/verify-frontend',publicResponse);
      await resetRequests();
      await button('Prepara solo questo problema','.proposal-remediation-slot');
      await waitFor("document.querySelector('.proposal-remediation-slot .wp-live-apply-one')",'Ready individual preview');
      assert.equal(await evaluate("window.__qaFormRequests.some(r=>/live-apply|rollback/.test(r.path))"),false,'Preparation never writes');
      await visibleClick('.proposal-remediation-slot .wp-live-apply-one');
      await waitFor(`document.querySelector(${JSON.stringify(receipt)})?.textContent.includes(${JSON.stringify(after)})`,'Saved comparison remains after actual UI apply');
      correctionId = await evaluate(`document.querySelector(${JSON.stringify(receipt)}).dataset.correctionId`);
      await waitFor("document.querySelector('.wp-live-remediation-message')?.textContent.includes('Modifica applicata e registrata')",'Apply completed');
      assert.deepEqual(await snapshotValues(receipt),[before,after]);
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(receipt+' .saved-correction-url')}).href`),targetUrl);
      await resetRequests();
      await button('Riverifica',receipt);
      await waitFor("window.__qaFormRequests.some(r=>r.path==='/api/wordpress/verify-frontend')",'Direct metadata verification makes a real app request');
      await waitFor(`document.querySelector(${JSON.stringify(receipt)})?.textContent.includes('codice HTML pubblico coincide')`,'Public value confirmed separately from SEO duplicate');
      assert.deepEqual(await snapshotValues(receipt),[before,after]);
      assert.equal(await evaluate("window.__qaFormRequests.some(r=>/live-apply|rollback/.test(r.path))"),false,'Reverify never applies or rolls back');
      await button('Apri elenco Correzioni','.automatic-proposal-header');
      await waitFor("document.body.dataset.seogrowAutomaticProposal !== 'true'",'Exit dedicated proposal');
      // Deliberately empty the lightweight index: the actual card list must read IndexedDB.
      await write('seogrow-remediation-history-v1',[]);
      const card = `.card-record[data-correction-id="${correctionId}"]`;
      await visibleClick(card);
      const detail = '.card-horizontal-detail .saved-correction-details[data-correction-id]';
      await waitFor(`document.querySelector(${JSON.stringify(detail)})?.textContent.includes(${JSON.stringify(after)})`,'Card reads full saved snapshots without tools toggle');
      assert.deepEqual(await snapshotValues(detail),[before,after]);
      await revisit('Correzioni');
      await visibleClick(card);
      await waitFor(`document.querySelector(${JSON.stringify(detail)})?.textContent.includes(${JSON.stringify(after)})`,'Full comparison survives browser reload');
      assert.deepEqual(await snapshotValues(detail),[before,after]);
      await mock('/api/wordpress/verify-frontend',{error:'QA verification unavailable'},400);
      await button('Riverifica',detail);
      await waitFor(`document.querySelector(${JSON.stringify(detail)})?.textContent.includes('QA verification unavailable')`,'Verification error visible and history retained');
      assert.deepEqual(await snapshotValues(detail),[before,after]);
      await mock('/api/wordpress/verify-frontend',{...publicResponse,metaDescription:'Valore pubblico diverso'});
      await button('Riverifica',detail);
      await waitFor(`document.querySelector(${JSON.stringify(detail)})?.textContent.includes('non coincide con quello inviato')`,'Mismatch is not a successful SEO resolution');
      assert.deepEqual(await snapshotValues(detail),[before,after]);
      await mock('/api/wordpress/verify-frontend',publicResponse);
      await button('Riverifica',detail);
      await waitFor(`document.querySelector(${JSON.stringify(detail)})?.textContent.includes('codice HTML pubblico coincide')`,'Verification recovers');
      for (const width of [1440,390]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        await evaluate(`document.querySelector(${JSON.stringify(detail)}).scrollIntoView({behavior:'instant',block:'start'})`);
        await waitFor('document.documentElement.scrollWidth <= innerWidth + 1','Receipt responsive without horizontal clipping');
        await screenshot('correction-receipt-'+width);
      }
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      const other = clients.find(item=>Number(item.id)!==Number(clientId));
      if (other) {
        await evaluate(`(()=>{const e=document.querySelector('.client-select select');e.value=${JSON.stringify(String(other.id))};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
        await waitFor(`!document.querySelector('.saved-correction-details[data-correction-id="${correctionId}"]')`,'Changing client cannot retain the other project snapshots');
      }
      const saved = await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');return m.readCorrection(${JSON.stringify(correctionId)})})()`);
      assert.deepEqual(saved.before,{'meta.rank_math_description':before});
      assert.deepEqual(saved.after,{'meta.rank_math_description':after});
      assert.notEqual(saved.status,'Verificato','Matching metadata alone never closes a duplicate');
    } catch (error) {
      const diagnostic = await evaluate("({messages:[...document.querySelectorAll('.wp-live-remediation-message,.correction-explanation,.saved-correction-details')].map(e=>e.textContent),credentials:[...document.querySelectorAll('.audit-unified-credentials')].map(e=>({inProposal:!!e.closest('.proposal-remediation-slot'),fields:[...e.querySelectorAll('input')].map(i=>({type:i.type,autocomplete:i.autocomplete,present:!!i.value}))})),requests:(window.__qaFormRequests||[]).map(r=>r.path)})").catch(()=>null);
      console.error('SAVED_CORRECTION_DIAGNOSTIC '+JSON.stringify(diagnostic));
      await evaluate("document.querySelector('.wp-live-remediation-message,.saved-correction-details')?.scrollIntoView({behavior:'instant',block:'center'})").catch(()=>{});
      await screenshot('correction-receipt-failure').catch(()=>{});
      throw error;
    } finally {
      await evaluate("(async()=>{const m=await import('/src/AutomaticProposalNavigation.js');m.clearAutomaticProposalFocus();window.dispatchEvent(new CustomEvent('seogrow-automatic-proposal-close'))})()");
      await write('seogrow-selected-client-v1',clientId);
      await write(siteKey,sites); await write(pageKey,pages); await write(profileKey,profiles);
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${JSON.stringify(oldRecords)})})()`);
      await revisit('Centro progetto');
    }
  });
}
