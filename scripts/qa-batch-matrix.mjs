import assert from 'node:assert/strict';

// Real browser + real UI/engine/IndexedDB. Only remote WordPress and AI HTTP responses are fixtures.
export async function runBatchMatrix({ evaluate, waitFor, command, clickSidebar, reload, record, screenshot, mode }) {
  if (mode === 'smoke') return;
  const input = (selector, value) => evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); })()`);
  const click = async text => {
    const query=`[...document.querySelectorAll('.batch-remediation button')].find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled)`;
    await waitFor(query, text); await evaluate(`(${query}).click()`);
  };
  const saved = await evaluate(`(async () => {
    const m=await import('/src/workspaceDatabase.js'); const keys=['seogrow-page-audit-history-v2','seogrow-analyses-v2','seogrow-tasks-v2'];
    const saved=Object.fromEntries(keys.map(k=>[k,m.workspaceStorage.getItem(k)]));
    const url=n=>'https://example.com/batch-'+n+'/';
    const issues=[1,2].map(n=>({type:'meta_description',label:'Meta description mancante '+n,sourceUrl:url(n),severity:'alta'}));
    issues.push({type:'broken-link',label:'Link interno da revisionare',sourceUrl:url(3),targetUrl:'https://example.com/vecchia/',anchorText:'Approfondisci',severity:'media'});
    m.workspaceStorage.setItem('seogrow-page-audit-history-v2','{}');
    m.workspaceStorage.setItem('seogrow-analyses-v2',JSON.stringify({9001:[{analyzedAt:new Date(Date.now()-60000).toISOString(),issues}]}));
    m.workspaceStorage.setItem('seogrow-tasks-v2','[]'); await m.flushWorkspace();
    (await import('/src/system/index.js')).rememberWordPressSession(9001,{url:'https://example.com/',username:'QA',applicationPassword:'fixture-only'});
    window.__batchFixture={writes:[],requests:[],entities:Object.fromEntries([1,2].map(n=>[url(n),{id:700+n,status:'publish',link:url(n),title:{raw:'Pagina'},content:{raw:'<p>Contenuto della pagina</p>'},meta:{rank_math_description:''}}])),previews:{},token:0,stale:false};
    window.__batchPreviousFetch=window.fetch;
    window.fetch=async (path,options)=>{
      const pathname=new URL(typeof path==='string'?path:path.url,location.href).pathname;
      const handled=['/api/wordpress/connection-check','/api/wordpress/inspect-fast','/api/frontend/inspect','/api/wordpress/generate-seo-value-v2','/api/wordpress/live-preview','/api/wordpress/live-apply','/api/wordpress/verify-frontend','/api/audit'];
      if(!handled.includes(pathname)) return window.__batchPreviousFetch(path,options);
      const f=window.__batchFixture,b=JSON.parse(options?.body||'{}'); f.requests.push(pathname);
      const result=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
      if(pathname.endsWith('/connection-check')) return result({ok:true,user:{id:1}});
      if(pathname.endsWith('/inspect-fast')) {
        const entity=f.entities[b.url]; if(f.stale && entity.id===702) entity.meta.rank_math_description='Modifica esterna';
        return result({ok:true,resource:'pages',entity});
      }
      if(pathname==='/api/frontend/inspect'||pathname.endsWith('/verify-frontend')) {const e=f.entities[b.url]; return result({ok:true,status:200,isHtml:true,url:e.link,wordpressDocumentId:e.id,title:'Pagina',titleCount:1,metaDescription:e.meta.rank_math_description,metaDescriptionCount:1,h1:1,verificationSafe:true,requiresBrowserVerification:false});}
      if(pathname.endsWith('/generate-seo-value-v2')) return result({value:'Descrizione utile e completa per la pagina di prova: servizi, informazioni e approfondimenti disponibili per tutti i visitatori.',publishable:true,quality:{publishable:true}});
      if(pathname.endsWith('/live-preview')) {
        const e=f.entities[b.targetUrl],data={ok:true,approvalToken:'fixture-'+(++f.token),expiresInSeconds:600,changed:['meta.rank_math_description'],previewBefore:{meta:e.meta},previewAfter:b.changes,resource:'pages',id:e.id,adapter:'Rank Math'};
        f.previews[data.approvalToken]=structuredClone(data); return result(data);
      }
      if(pathname.endsWith('/live-apply')) {
        const p=f.previews[b.approvalToken]; if(!p) return result({code:'APPROVAL_EXPIRED',error:'Token già usato'},409); delete f.previews[b.approvalToken];
        f.writes.push(p.id); const e=Object.values(f.entities).find(e=>e.id===p.id); e.meta=structuredClone(p.previewAfter.meta);
        return result({ok:true,changed:p.changed,before:p.previewBefore,after:p.previewAfter,adapter:'Rank Math'});
      }
      const e=f.entities[b.url]; return result({url:e.link,fetchedAt:new Date().toISOString(),description:e.meta.rank_math_description,title:'Pagina',h1:1,issues:[]});
    };
    window.dispatchEvent(new CustomEvent('seogrow-storage-ok')); return saved;
  })()`);
  await command('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await clickSidebar('Problemi');
  await waitFor("document.querySelectorAll('.problem-row').length===3 && document.querySelector('.batch-toolbar')", 'batch fixture rows');
  await record('BATCH-UI-SELECTION', async () => {
    assert.equal(await evaluate("document.querySelectorAll('.problem-row a[href]').length>=3"), true);
    assert.equal(await evaluate("document.body.innerText.includes('Approfondisci')"), true);
    await input('.problem-search input','/batch-1/');
    await waitFor("document.querySelectorAll('.problem-row').length===1",'filtered batch');
    await evaluate("document.querySelector('.batch-toolbar input[type=checkbox]').click()");
    await waitFor("document.querySelector('.batch-toolbar strong').textContent==='1 selezionati'",'one filtered selection');
    await input('.problem-search input','');
    await waitFor("document.querySelectorAll('.problem-row').length===3",'clear filter');
    assert.equal(await evaluate("document.querySelector('.batch-toolbar strong').textContent"),'1 selezionati');
    await click('Risolvi tutti i problemi risolvibili (2)');
    await click('Prepara piano e anteprime');
    await waitFor("document.querySelectorAll('.batch-entry.state-prepared').length===2",'real prepared batch');
    assert.deepEqual(await evaluate('window.__batchFixture.writes'),[]);
    assert.equal(await evaluate("document.querySelectorAll('.batch-diff pre').length>=4"),true);
    await screenshot('batch-preview-desktop');
  });
  await record('BATCH-UI-EXECUTION',async()=>{
    await evaluate("window.__batchFixture.stale=true");
    await click('Approva e avvia correzione batch');
    await waitFor("document.querySelector('.batch-entry.state-resolved_verified') && document.querySelector('.batch-entry.state-stale_target')",'verified and stale partial result');
    assert.deepEqual(await evaluate('window.__batchFixture.writes'),[701]);
    await waitFor("[...document.querySelectorAll('.batch-actions button')].some(b=>b.textContent==='Scarica report JSON' && !b.disabled)",'batch report actions enabled');
    const secret=await evaluate("(async()=>{const m=await import('/src/batchRemediationStore.js'); return JSON.stringify(await m.listBatchRuns(9001));})()");
    assert.ok(!secret.includes('fixture-only')&&!secret.includes('approvalToken'));
    await screenshot('batch-partial-result');
  });
  await record('BATCH-UI-RESPONSIVE', async()=>{
    for(const width of [1440,390]) {
      await command('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width===390});
      await evaluate("document.querySelector('.batch-workspace').scrollIntoView({block:'start'})");
      await waitFor('document.documentElement.scrollWidth <= innerWidth + 1','batch without page overflow');
      await screenshot('batch-'+width);
    }
    await command('Emulation.clearDeviceMetricsOverride');
  });
  await record('BATCH-UI-RECOVERY',async()=>{
    await evaluate("(async()=>{await(await import('/src/workspaceDatabase.js')).flushWorkspace();})()");
    await reload(); await clickSidebar('Problemi');
    await waitFor("document.querySelector('.batch-history-grid button')",'persisted batch history');
    await evaluate("document.querySelector('.batch-history').open=true; document.querySelector('.batch-history-grid button').click()");
    await waitFor("document.querySelector('.batch-workspace')?.textContent.includes('Vista storica')",'safe history after refresh');
    assert.equal(await evaluate("[...document.querySelectorAll('.batch-actions button')].some(b=>b.textContent==='Approva e avvia correzione batch')"),false);
    assert.equal(await evaluate("document.querySelectorAll('.batch-entry.state-resolved_verified').length"),1);
  });
  await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js'); for(const[k,v]of Object.entries(${JSON.stringify(saved)})){if(v===null)m.workspaceStorage.removeItem(k);else m.workspaceStorage.setItem(k,v);}await m.flushWorkspace();window.dispatchEvent(new CustomEvent('seogrow-storage-ok'));})()`);
}
