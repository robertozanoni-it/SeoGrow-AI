import { runProblemRoutingFlow } from './qa-problem-routing.mjs';
import assert from 'node:assert/strict';
import { runSavedCorrectionFlow } from './qa-saved-corrections.mjs';

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
      assert.equal(await evaluate("document.querySelector('.auto-fix-item.manual').textContent.includes('Cosa fare:')"),true,'Manual problems explain the next action');
      assert.equal(await evaluate("new Set(['.project-setup','.workflow-source','.workflow-selection','.workflow-verify','.project-report'].map(s=>getComputedStyle(document.querySelector(s)).backgroundColor)).size >= 4"),true,'Section backgrounds distinguish workflow areas');
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
      assert.equal(await evaluate("document.querySelector('.audit-unified-credentials').textContent.includes('3. Collega WordPress') && document.querySelector('.wp-live-remediation-v2').textContent.includes('4. Prepara e approva')"),true,'Numbering continues through the mounted correction flow');
      await button('Prepara le anteprime selezionate');
      await waitFor("document.querySelector('.wp-live-remediation-message')?.textContent.includes('Connetti WordPress')",'Missing credentials visible');
      for(const [label,value] of Object.entries({'URL del sito':client.url,'Utente WordPress':'qa-user','Password applicativa':'qa-only-password'})) await set('.audit-unified-credentials',label,value);
      await mock('/api/wordpress/connection-check',{error:'QA bad credentials'},403);
      await button('Collega WordPress');
      await waitFor("document.querySelector('.wordpress-connection-control [role=alert]')?.textContent.includes('QA bad credentials')",'Connection error visible');
      await mock('/api/wordpress/connection-check',{user:{name:'QA connected'},connector:{version:'1.3.4'}});
      await button('Collega WordPress');
      await waitFor("document.querySelector('.wordpress-connection-control')?.textContent.includes('WordPress collegato')",'Connection success visible');
      await button('Modifica selezione'); await button('Revisiona 2 problemi selezionati');
      await waitFor("document.querySelector('.wordpress-connection-control')?.textContent.includes('Connessione verificata riutilizzata')",'Session reused without retyping password');
      await mock('/api/wordpress/inspect-fast',{error:'QA denied'},403);
      await mock('/api/frontend/inspect',{url:client.url}); await resetRequests();
      await evaluate("(()=>{const b=[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Prepara le anteprime selezionate');b.click();b.click()})()");
      await waitFor("document.querySelector('.wp-live-remediation-message')?.textContent.includes('Esaminati 2/2')",'Both selected items reported');
      assert.equal(await evaluate("window.__qaFormRequests.filter(r=>r.path==='/api/wordpress/inspect-fast').length"),2,'Double click cannot duplicate batch');
      assert.equal(await evaluate("window.__qaFormRequests.some(r=>/live-apply|rollback/.test(r.path))"),false);
      await mock('/api/wordpress/inspect-fast',{error:'Ownership frontend non determinabile: shared Elementor'},400);
      await button('Prepara le anteprime selezionate');
      await waitFor("document.querySelector('.correction-explanation')?.textContent.includes('Modifica bloccata: nessuna proposta applicabile')",'Blocked ownership has plain-language explanation');
      assert.equal(await evaluate("document.querySelectorAll('.wp-live-apply-one').length"),0,'Blocked changes have no apply button');
      await evaluate("document.querySelector('.wp-live-remediation-v2').scrollIntoView()"); await screenshot('auto-fix-blocked');
      await mock('/api/wordpress/inspect-fast',{siteUrl:client.url,resource:'posts',entity:{id:123,meta:{rank_math_description:''}}});
      await mock('/api/wordpress/generate-seo-value-v2',{value:'QA proposed description',publishable:true});
      await mock('/api/wordpress/live-preview',{approvalToken:'qa-preview-only',adapter:'Rank Math',resource:'posts',id:123,changed:['meta.rank_math_description'],previewBefore:{meta:{rank_math_description:''}},previewAfter:{meta:{rank_math_description:'QA proposed description'}}});
      await resetRequests(); await button('Prepara le anteprime selezionate');
      await waitFor("document.querySelectorAll('.wp-live-apply-one').length===2",'Successful retry exposes individual approvals');
      assert.equal(await evaluate("document.querySelector('.wp-live-apply-one').textContent.includes('Applica questa modifica sul sito')"),true);
      assert.equal(await evaluate("document.querySelector('.correction-readable').textContent.includes('QA proposed description')"),true);
      assert.equal(await evaluate("window.__qaFormRequests.some(r=>/live-apply|rollback/.test(r.path))"),false,'Preparation never applies even when previews are ready');
      await evaluate("document.querySelector('.wp-live-remediation-v2').scrollIntoView()"); await screenshot('auto-fix-ready');
      await command('Emulation.setDeviceMetricsOverride',{width:390,height:900,deviceScaleFactor:1,mobile:false});
      await waitFor('document.documentElement.scrollWidth <= innerWidth + 1','Proposal mobile overflow');
      await waitFor("document.querySelector('.sidebar').getBoundingClientRect().right <= 1",'Proposal mobile drawer transition');
      await evaluate("document.querySelector('.wp-live-preview-row').scrollIntoView()");
      await screenshot('auto-fix-ready-mobile');
      await command('Emulation.setDeviceMetricsOverride',{...viewport,deviceScaleFactor:1,mobile:false});
      await write(siteKey,{...sites,[clientId]:[{...audit,issues:[]}]}); await resetRequests();
      await waitFor("document.querySelector('.auto-fix-panel [role=status]')?.textContent.includes('cambiati') && !document.querySelector('.wp-live-apply-one')",'Same-date audit replacement invalidates plan visibly');
      assert.equal(await evaluate('window.__qaFormRequests.length'),0,'Stale plan makes no remote requests');
      assert.deepEqual(await read('seogrow-tasks-v2'),tasks,'Diagnostic never edits tasks');
      // Dedicated QA uses explicit mocked transport, never the live WordPress site.
      await write('seogrow-clients',clients.map(c=>c.id===clientId?{...c,url:'https://yogabuenaonda.it/'}:c));
      await revisit('Centro progetto');
      await button('1. Prepara prova Elementor');
      await waitFor("document.querySelector('[aria-label=\"Collaudo Elementor su pagina isolata\"] [role=status]')?.textContent.includes('assente o scaduta')",'QA requires verified project credentials');
      await evaluate(`(async()=>{const m=await import('/src/wordpressSession.js');m.rememberWordPressSession(${clientId},{url:'https://yogabuenaonda.it/',username:'qa-fixture',applicationPassword:'qa-fixture'})})()`);
      await mock('/api/wordpress/live-preview',{approvalToken:'qa-isolated-preview',resource:'pages',id:8196,previewBefore:{meta:{_elementor_data:'before'}},previewAfter:{meta:{_elementor_data:'after'}}});
      await resetRequests(); await button('1. Prepara prova Elementor');
      await waitFor("[...document.querySelectorAll('button')].some(b=>b.textContent==='2. Applica testo alla pagina di prova')",'QA explicit apply button');
      const qaRequests=await evaluate('window.__qaFormRequests');
      assert.equal(qaRequests.length,1);assert.equal(qaRequests[0].body.id,8196);assert.equal(qaRequests[0].body.isolatedQa,true);
      assert.equal(qaRequests[0].path,'/api/wordpress/live-preview','Preparation never writes');
      await evaluate("document.querySelector('[aria-label=\"Collaudo Elementor su pagina isolata\"]').scrollIntoView()");
      await screenshot('isolated-elementor-preview');

    } finally {
      await write('seogrow-clients',clients); await write(siteKey,sites); await write(pageKey,pages); await revisit('Centro progetto');
    }
  });
  await runSavedCorrectionFlow({ evaluate, waitFor, record, button, set, read, revisit, mock, resetRequests, screenshot, command });
  await runProblemRoutingFlow({ evaluate, waitFor, record, button, set, read, revisit, mock, resetRequests, screenshot, command });
}
