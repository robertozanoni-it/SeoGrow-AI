import assert from 'node:assert/strict';

export async function runAutoFix({ evaluate, waitFor, clickSidebar, record, button, set, read, revisit, mock, resetRequests, screenshot, command }) {
  await record('AUTO-FIX-ASSISTED', async () => {
    const clientId = await read('seogrow-selected-client-v1');
    const clients = await read('seogrow-clients');
    const client = clients.find(c => c.id === clientId);
    const siteKey = 'seogrow-analyses-v2', pageKey = 'seogrow-page-audit-history-v2';
    const sites = await read(siteKey), pages = await read(pageKey);
    const tasks = await read('seogrow-tasks-v2');
    const write = (key,value) => evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');m.workspaceStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(value))});await m.flushWorkspace();window.dispatchEvent(new StorageEvent("storage",{key:${JSON.stringify(key)}}))})()`);
    const audit = { url:client.url, analyzedAt:'2099-01-01T00:00:00Z', issues:[...Array.from({length:12},(_,i)=>({type:'meta description',label:'QA Auto Fix description '+i,url:client.url})),{type:'canonical',label:'QA canonical',url:client.url}] };
    try {
      await write(siteKey,{...sites,[clientId]:[audit]}); await write(pageKey,{...pages,[clientId]:[]});
      await revisit('Centro progetto'); await button('Analizza e correggi');
      await waitFor("document.querySelectorAll('.auto-fix-item').length===13",'Auto Fix real audit inventory');
      assert.equal(await evaluate("document.querySelectorAll('.auto-fix-item input:disabled').length"),1);
      for(let i=0;i<10;i++) { await evaluate(`document.querySelectorAll('.auto-fix-item input')[${i}].click()`); await waitFor(`document.querySelectorAll('.auto-fix-item input:checked').length===${i+1}`,'Selection count'); }
      assert.equal(await evaluate("document.querySelectorAll('.auto-fix-item input:disabled').length"),3,'Limit disables remaining choices');
      // Keep a bounded two-item request and verify preparation never applies changes.
      for(let i=2;i<10;i++) await evaluate(`document.querySelectorAll('.auto-fix-item input')[${i}].click()`);
      const viewport = await evaluate('({width:innerWidth,height:innerHeight})');
      for(const width of [1440,390]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
        await evaluate("document.querySelector('.auto-fix-panel').scrollIntoView()");
        await waitFor('document.documentElement.scrollWidth <= innerWidth + 1','Auto Fix responsive overflow');
        if(width < 600) await waitFor("document.querySelector('.sidebar').getBoundingClientRect().right <= 1",'Mobile drawer transition finished');
        await screenshot('auto-fix-'+width);
      }
      await command('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
      await button('Revisiona 2 problemi selezionati');
      await waitFor("document.querySelector('.audit-unified-credentials') && document.querySelector('.wp-live-remediation-v2')",'Existing remediation mounted in project');
      await button('Prepara le anteprime selezionate');
      await waitFor("document.querySelector('.wp-live-remediation-message')?.textContent.includes('Connetti WordPress')",'Missing credentials visible');
      for(const [label,value] of Object.entries({'URL del sito':client.url,'Utente WordPress':'qa-user','Password applicativa':'qa-only-password'})) await set('.audit-unified-credentials',label,value);
      await mock('/api/wordpress/inspect-fast',{error:'QA denied'},403);
      await mock('/api/frontend/inspect',{url:client.url}); await resetRequests();
      await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Prepara le anteprime selezionate');b.click();b.click()})()");
      await waitFor("document.querySelector('.wp-live-remediation-message')?.textContent.includes('Esaminati 2/2')",'Both selected items reported');
      assert.equal(await evaluate("window.__qaFormRequests.filter(r=>r.path==='/api/wordpress/inspect-fast').length"),2,'Double click cannot duplicate batch');
      assert.equal(await evaluate("window.__qaFormRequests.some(r=>/live-apply|rollback/.test(r.path))"),false);
      await mock('/api/wordpress/inspect-fast',{siteUrl:client.url,resource:'posts',entity:{id:123,meta:{rank_math_description:''}}});
      await mock('/api/wordpress/generate-seo-value-v2',{value:'QA proposed description',publishable:true});
      await mock('/api/wordpress/live-preview',{approvalToken:'qa-preview-only',adapter:'Rank Math',resource:'posts',id:123,changed:['meta.rank_math_description'],previewBefore:{meta:{rank_math_description:''}},previewAfter:{meta:{rank_math_description:'QA proposed description'}}});
      await resetRequests(); await button('Prepara le anteprime selezionate');
      await waitFor("document.querySelectorAll('.wp-live-apply-one').length===2",'Successful retry exposes individual approvals');
      assert.equal(await evaluate("window.__qaFormRequests.some(r=>/live-apply|rollback/.test(r.path))"),false,'Preparation never applies even when previews are ready');
      await write(siteKey,{...sites,[clientId]:[{...audit,issues:[]}]}); await resetRequests();
      await waitFor("document.querySelector('.auto-fix-panel [role=status]')?.textContent.includes('cambiati') && !document.querySelector('.wp-live-apply-one')",'Same-date audit replacement invalidates plan visibly');
      assert.equal(await evaluate('window.__qaFormRequests.length'),0,'Stale plan makes no remote requests');
      assert.deepEqual(await read('seogrow-tasks-v2'),tasks,'Diagnostic never edits tasks');
    } finally {
      await write(siteKey,sites); await write(pageKey,pages); await revisit('Centro progetto');
    }
  });
}
