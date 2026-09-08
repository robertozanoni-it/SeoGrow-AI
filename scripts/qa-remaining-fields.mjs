import assert from 'node:assert/strict';
import JSZip from 'jszip';

export async function runRemainingFields({evaluate,waitFor,clickSidebar,record,set,field,button,submit,read,saved,revisit,mock,request,resetRequests}) {
  await record('FIELDS-AGENT',async()=>{
    await clickSidebar('SEO Agent'); await waitFor("document.querySelector('#seo-agent-goal')",'Agent');
    await set('.agent-console','Cosa vuoi ottenere?','   ');
    assert.equal(await evaluate("document.querySelector('.agent-controls button').disabled"),true);
    for(const mode of ['ASSISTED','AUTONOMOUS','READ_ONLY']) await set('.agent-console','Modalità',mode);
    await set('.agent-console','Cosa vuoi ottenere?','Trova le 10 migliori opportunità SEO');
    await button('Avvia analisi','.agent-console');
    await saved('seogrow-agent-runs-v1',"value?.[9001]?.some(r=>r.goal==='Trova le 10 migliori opportunità SEO' && r.mode==='READ_ONLY')");
    const runs=(await read('seogrow-agent-runs-v1'))[9001]; assert.equal(runs.length,1); assert.equal(runs[0].status,'COMPLETED');
    await revisit('SEO Agent'); await waitFor("document.querySelector('#agent-history')",'Agent history');
    await set('.agent-history','Esecuzione',runs[0].id);
    await waitFor("document.querySelector('.agent-run').textContent.includes('Trova le 10 migliori opportunità SEO')",'Selected run details');
  });
  await record('FIELDS-CALENDAR',async()=>{
    await clickSidebar('Piano editoriale'); await waitFor("document.querySelector('.calendar-items input')",'Calendar item');
    await set('main','Mese','2028-02');
    assert.equal(await evaluate("document.querySelectorAll('.calendar-day').length"),29);
    const title=await evaluate("document.querySelector('.calendar-items article strong').textContent");
    await set('.calendar-items article','Scadenza','2028-02-29');
    await saved('seogrow-preferences-v1',"value?.projectSettings?.[9001]?.editorialSchedule?.some(i=>i.date==='2028-02-29')");
    await revisit('Piano editoriale'); await waitFor("document.querySelector('.calendar-items input')",'Calendar reloaded');
    assert.equal(await evaluate(`document.querySelector('[aria-label='+CSS.escape(${JSON.stringify('Scadenza '+title)})+']').value`),'2028-02-29');
    await set('.calendar-items article','Scadenza','');
    await saved('seogrow-preferences-v1',"!value?.projectSettings?.[9001]?.editorialSchedule?.some(i=>i.date==='2028-02-29')");
  });
  await record('FIELDS-GEO',async()=>{
    await clickSidebar('GEO AI'); await waitFor("document.querySelector('.geo-questions textarea')",'GEO questions');
    await evaluate("(() => {const e=document.querySelector('.geo-questions textarea'); e.focus(); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'QA question one?\\nQA question two?'); e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await waitFor("document.querySelector('.geo-question-actions span')?.textContent.includes('2/20')",'GEO React state updated before blur');
    await evaluate("document.querySelector('.geo-questions textarea').focus();document.querySelector('.geo-questions textarea').blur()");
    await saved('seogrow-geo-v1',"value?.[9001]?.questions?.length===2");
    await revisit('GEO AI'); await waitFor("document.querySelector('.geo-questions textarea')?.value.includes('QA question two?')",'GEO questions retained');
    await evaluate("window.confirm = m => m.startsWith('Inviare a OpenAI 2 domande')");
    await mock('/api/geo/simulate',{error:'QA simulation rejected'},400); await resetRequests(); await button('Simula con OpenAI');
    const sent=await request('/api/geo/simulate'); assert.deepEqual(sent.questions,['QA question one?','QA question two?']);
    await waitFor("document.querySelector('main').textContent.includes('QA simulation rejected')",'GEO error recovery');
  });
  await record('FIELDS-AUDIT',async()=>{
    await clickSidebar('Audit SEO'); await waitFor("document.querySelector('.audit-inline-form')",'Audit');
    await set('.audit-inline-form','URL della pagina','invalid-url');
    assert.equal(await evaluate("document.querySelector('.audit-inline-form').checkValidity()"),false);
    await set('.audit-inline-form','URL della pagina','https://example.com/qa-page/');
    await mock('/api/audit',{error:'QA audit rejected'},400); await resetRequests(); await submit('.audit-inline-form');
    assert.deepEqual(await request('/api/audit'),{url:'https://example.com/qa-page/'});
    await waitFor("document.querySelector('.audit-inline-form [role=alert]')?.textContent.includes('QA audit rejected')",'Audit failure');
    await evaluate("document.querySelectorAll('.audit-mode-card')[1].click()");
    await set('.audit-inline-form','Indirizzo iniziale del sito','https://example.com/qa-site/');
    for(const limit of ['25','75','150','200']) await set('.audit-inline-form','Numero massimo di pagine',limit);
    await mock('/api/site-analysis',{error:'QA site rejected'},400); await resetRequests(); await submit('.audit-inline-form');
    assert.deepEqual(await request('/api/site-analysis'),{url:'https://example.com/qa-site/',maxPages:200});
    await waitFor("document.querySelector('.audit-inline-form [role=alert]')?.textContent.includes('QA site rejected')",'Site failure');
  });
  await record('FIELDS-PROBLEM-FILTERS',async()=>{
    await clickSidebar('Problemi'); await waitFor("document.querySelector('.problems-filters')",'Problem filters');
    await set('.problems-filters','Cerca URL o problema','no-such-qa-problem');
    await waitFor("document.querySelectorAll('.problem-row').length===0",'Search excludes all');
    await set('.problems-filters','Cerca URL o problema','');
    for(const label of ['Tipo','Fonte','Adapter','Correggibilità','Segnale speciale']) {
      const options=await evaluate(`[...${field('.problems-filters',label)}.options].map(o=>o.value)`);
      assert.ok(options.length>=1,label+' exposes reset option');
      if(label!=='Adapter') assert.ok(options.length>1,label+' fixture has choices');
      for(const option of options) await set('.problems-filters',label,option);
      await set('.problems-filters',label,'');
    }
    await waitFor("document.querySelectorAll('.problem-row').length>0",'Reset filters restores problems');
  });
  await record('FIELDS-COMMAND',async()=>{
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Comandi')).click()");
    await waitFor("document.querySelector('.command-dialog[open]')",'Command palette');
    await set('.command-dialog','Cerca un comando','zz-no-command');
    await waitFor("document.querySelectorAll('.command-results button').length===0",'No commands');
    await set('.command-dialog','Cerca un comando','Centro progetto');
    await waitFor("document.querySelectorAll('.command-results button').length===1",'Filtered command');
    await button('Apri Centro progetto','.command-dialog');
    await waitFor("document.querySelector('.wizard-steps') && !document.querySelector('.command-dialog[open]')",'Command navigates and closes');
  });
  await record('FIELDS-TAXONOMY',async()=>{
    await clickSidebar('Audit SEO'); await waitFor("document.querySelector('.audit-inline-form')",'Audit taxonomy fixture');
    await evaluate("document.querySelectorAll('.audit-mode-card')[0].click()");
    await set('.audit-inline-form','URL della pagina','https://example.com/category/qa/');
    await mock('/api/audit',{url:'https://example.com/category/qa/',score:70,analyzedAt:'2026-09-08T12:00:00Z',issues:[{type:'canonical',label:'Canonical QA',severity:'alta',targetUrl:'https://example.com/category/qa/'},{type:'noindex',label:'Noindex QA',severity:'alta',targetUrl:'https://example.com/category/qa/'}]});
    await submit('.audit-inline-form');
    await waitFor("document.querySelector('.audit-issue-select select')?.options.length===2",'Two taxonomy issues');
    await mock('/api/wordpress/inspect-taxonomy',{resource:'taxonomy',writable:true,ownership:'rank_math',term:{id:100,name:'QA category',taxonomy:'category',link:'https://example.com/category/qa/'}});
    for(const [label,value] of Object.entries({'URL del sito':'https://example.com/','Utente WordPress':'qa-user','Password applicativa':'qa-synthetic-taxonomy'})) await set('.audit-unified-credentials',label,value);
    await waitFor("document.querySelector('.taxonomy-intent-box input:not([type=checkbox])')",'Canonical controls');
    await set('.taxonomy-intent-box','Canonical da impostare','https://example.com/category/qa-target/');
    await resetRequests(); await button('Prepara anteprima tassonomia','.taxonomy-remediation');
    await waitFor("document.querySelector('.taxonomy-message')?.textContent.includes('Conferma esplicitamente')",'Canonical requires confirmation');
    assert.equal(await evaluate("window.__qaFormRequests.length"),0);
    await evaluate("document.querySelector('.taxonomy-confirm input').click()");
    await waitFor("document.querySelector('.taxonomy-confirm input').checked",'Canonical confirmed');
    await set('.taxonomy-intent-box','Canonical da impostare','https://example.com/category/qa-changed/');
    assert.equal(await evaluate("document.querySelector('.taxonomy-confirm input').checked"),false);
    await evaluate("(()=>{const e=document.querySelector('.audit-issue-select select');e.value='1';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await waitFor("document.querySelector('.taxonomy-intent-box select')",'Indexing controls');
    await set('.taxonomy-intent-box','Intento di indicizzazione','index');
    await evaluate("document.querySelector('.taxonomy-confirm input').click()");
    await waitFor("document.querySelector('.taxonomy-confirm input').checked",'Index confirmed');
    await set('.taxonomy-intent-box','Intento di indicizzazione','noindex');
    assert.equal(await evaluate("document.querySelector('.taxonomy-confirm input').checked"),false);
    await button('Prepara anteprima tassonomia','.taxonomy-remediation');
    await waitFor("document.querySelector('.taxonomy-message')?.textContent.includes('Scegli e conferma')",'Index requires renewed confirmation');
    assert.equal(await evaluate("window.__qaFormRequests.some(r=>/apply|write|preview/.test(r.path))"),false);
    await set('.audit-unified-credentials','Password applicativa','');
  });

  await record('FIELDS-SESSION',async()=>{
    await clickSidebar('Correzioni'); await waitFor("document.querySelector('.corrections-password input') || document.querySelector('input[aria-label=\"Password applicativa WordPress del cliente selezionato\"]')",'Correction password');
    const selector='input[aria-label="Password applicativa WordPress del cliente selezionato"]';
    await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'qa-correction-secret');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await waitFor(`document.querySelector(${JSON.stringify(selector)}).value==='qa-correction-secret'`,'Password in session');
    const other=(await read('seogrow-clients')).find(c=>c.name==='QA Fields Edited');
    await evaluate(`(()=>{const e=document.querySelector('[aria-label="Progetto attivo"]');e.value=${JSON.stringify(String(other.id))};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await waitFor(`document.querySelector(${JSON.stringify(selector)}).value===''`,'Other project has no password');
    await evaluate("(()=>{const e=document.querySelector('[aria-label=\"Progetto attivo\"]');e.value='9001';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await saved('seogrow-selected-client-v1','value===9001');
    await set('header','Cerca nell’app','QA all task fields');
    await waitFor("document.querySelector('.search-results')?.textContent.includes('QA all task fields')",'Global search result');
    await set('header','Cerca nell’app','');
    await clickSidebar('Centro progetto'); await waitFor("document.querySelector('.wizard-steps')",'Monitoring settings');
    const boxes=await evaluate("[...document.querySelectorAll('.planning-panel')].find(e=>e.textContent.includes('Monitoraggio e aggiornamento dati')).querySelectorAll('input[type=checkbox]').length");
    assert.equal(boxes,2);
    for(let i=0;i<2;i++) {
      const box=`[...document.querySelectorAll('.planning-panel')].find(e=>e.textContent.includes('Monitoraggio e aggiornamento dati')).querySelectorAll('input[type=checkbox]')[${i}]`;
      const before=await evaluate(`${box}.checked`);
      await evaluate(`${box}.click()`); await waitFor(`${box}.checked===${!before}`,'Monitoring checkbox changed');
      await read('seogrow-preferences-v1'); await evaluate(`${box}.click()`); await waitFor(`${box}.checked===${before}`,'Monitoring checkbox restored');
    }
  });
  await record('FIELDS-BOZZA-TYPE',async()=>{
    await clickSidebar('Integrazioni'); await waitFor("document.querySelector('.wordpress-integration')",'Mock connection');
    for(const [label,value] of Object.entries({'URL sito':'https://example.com/','Nome utente':'qa-user','Password applicativa':'qa-draft-only'})) await set('.wordpress-integration',label,value);
    await mock('/api/wordpress/test',{name:'QA draft',site:'https://example.com/',canCreatePosts:true,canCreatePages:false});await submit('.wordpress-integration');
    await waitFor("document.querySelector('.wordpress-integration').textContent.includes('Connessione verificata come QA draft')",'Mock limited capabilities');
    await clickSidebar('Piano editoriale');await waitFor("document.querySelector('.api-actions select')",'Draft type');
    assert.equal(await evaluate("document.querySelector('.api-actions option[value=pages]').disabled"),true);
    await set('.api-actions','Tipo bozza','posts');
    await clickSidebar('Integrazioni');
    await set('.wordpress-integration','Password applicativa','qa-draft-only');
    await mock('/api/wordpress/test',{name:'QA pages',site:'https://example.com/',canCreatePosts:true,canCreatePages:true});await submit('.wordpress-integration');
    await waitFor("document.querySelector('.wordpress-integration').textContent.includes('Connessione verificata come QA pages')",'Page capability');
    await clickSidebar('Piano editoriale');await waitFor("document.querySelector('.api-actions select')",'Draft type enabled');
    await set('.api-actions','Tipo bozza','pages');await set('.api-actions','Tipo bozza','posts');
  });

  await record('FIELDS-GOOGLE-IMPORT',async()=>{
    await clickSidebar('Integrazioni');await button('Carica proprietà Google');
    await waitFor("document.querySelector('[aria-label=\"Proprietà Search Console\"]')?.options.length===20",'Google picker');
    await evaluate("(()=>{const e=document.querySelector('[aria-label=\"Proprietà Search Console\"]');e.value='https://qa-18.example/';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await mock('/api/google/import',{error:'QA Google import denied'},403);await resetRequests();await button('Importa ora via API');
    assert.deepEqual(await request('/api/google/import'),{property:'https://qa-18.example/'});
    await waitFor("document.querySelector('main').textContent.includes('QA Google import denied')",'Google import error');
  });
  await record('FIELDS-AUDIT-MODAL',async()=>{
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim().startsWith('Comandi')).click()");
    await waitFor("document.querySelector('.command-dialog[open]')",'Command modal');
    await set('.command-dialog','Cerca un comando','Prepara una nuova analisi');await button('Prepara una nuova analisi','.command-dialog');
    await waitFor("document.querySelector('[role=dialog] .site-analysis-form')",'Site analysis modal');
    await set('[role=dialog]','Indirizzo iniziale','https://example.com/modal/');
    await set('[role=dialog]','Numero massimo di pagine','25');
    await mock('/api/site-analysis',{error:'QA modal rejected'},400);await resetRequests();await submit('[role=dialog] form');
    assert.deepEqual(await request('/api/site-analysis'),{url:'https://example.com/modal/',maxPages:25});
    await waitFor("document.querySelector('[role=dialog]').textContent.includes('QA modal rejected')",'Modal error');
    await evaluate("document.querySelector('[role=dialog] button[aria-label=\"Chiudi finestra\"]').click()");
    await waitFor("!document.querySelector('[role=dialog]')",'Modal closed');
  });

  await record('FIELDS-ASSOCIATION',async()=>{
    await clickSidebar('Task');await waitFor("document.querySelector('.task-title-button')",'Tasks');
    await evaluate("[...document.querySelectorAll('.task-title-button')].find(e=>e.textContent.includes('Ottimizza')).click()");
    await waitFor("document.querySelector('.task-editor')",'Search task');
    await set('.task-editor','Pagina da correggere o verificare','https://example.com/yoga/');
    await waitFor("document.querySelector('.task-editor input[type=checkbox]')",'Manual association');
    await evaluate("(()=>{const e=document.querySelector('.task-editor input[type=checkbox]');if(!e.checked)e.click();})()");
    await waitFor("document.querySelector('.task-editor input[type=checkbox]').checked",'Association confirmed');
    await submit('.task-editor');
    await saved('seogrow-tasks-v2',"value?.some(t=>t.query==='yoga' && t.associationStatus==='verified-manual')");
    await revisit('Task');
    await evaluate("[...document.querySelectorAll('.task-title-button')].find(e=>e.textContent.includes('Ottimizza')).click()");
    await waitFor("document.querySelector('.task-editor input[type=checkbox]')?.checked",'Association survives reload');
    await evaluate("document.querySelector('.task-editor input[type=checkbox]').click()");await submit('.task-editor');
    await saved('seogrow-tasks-v2',"value?.some(t=>t.query==='yoga' && t.associationStatus==='suggested')");
  });
  await record('FIELDS-ZIP',async()=>{
    await clickSidebar('Integrazioni');await waitFor("document.querySelector('input[type=file][accept*=zip]')",'ZIP picker');
    const upload=async(bytes,name)=>evaluate(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(Buffer.from(bytes).toString('base64'))}),c=>c.charCodeAt(0))],${JSON.stringify(name)},{type:'application/zip'}));const e=document.querySelector('input[type=file][accept*=zip]');e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await upload(Buffer.from('invalid zip'),'qa-broken.zip');
    await waitFor("document.querySelector('main').textContent.includes('Nessuna importazione completata.')",'Invalid ZIP rejected');
    const zip=new JSZip();
    zip.file('Grafico.csv','Data,Clic,Impressioni,CTR,Posizione\n2026-09-01,3,30,10%,8');
    zip.file('Query.csv','Query più frequenti,Clic,Impressioni,CTR,Posizione\nqa zip query,3,30,10%,8');
    zip.file('Pagine.csv','Pagine principali,Clic,Impressioni,CTR,Posizione\nhttps://example.com/qa-zip/,3,30,10%,8');
    await upload(await zip.generateAsync({type:'uint8array'}),'example.com.zip');
    await waitFor("document.querySelector('main').textContent.includes('1 importazioni completate: Browser QA')",'ZIP imported');
    await saved('seogrow-gsc-v1',"value?.[9001]?.queries?.some(q=>q.dimension==='qa zip query')");
    assert.equal(await evaluate("document.querySelector('input[type=file][accept*=zip]').value"),'');
  });
  await record('FIELDS-BACKUP-UI',async()=>{
    await clickSidebar('Impostazioni');await waitFor("document.querySelector('.backup-panel')",'Backup UI');
    await set('.backup-panel','Password del backup','short');await button('Esporta backup','.backup-panel');
    await waitFor("document.querySelector('.backup-panel .integration-result')?.textContent.includes('almeno 10')",'Backup minimum password');
    await evaluate("window.__qaOriginalURL=URL.createObjectURL;window.__qaOriginalAnchor=HTMLAnchorElement.prototype.click;URL.createObjectURL=b=>{window.__qaBackup=b;return window.__qaOriginalURL.call(URL,b)};HTMLAnchorElement.prototype.click=function(){}");
    try {
      await set('.backup-panel','Password del backup','qa-backup-passphrase');await button('Esporta backup','.backup-panel');
      await waitFor("document.querySelector('.backup-panel .integration-result')?.textContent.includes('esportato correttamente')",'UI encrypted export');
      const before=await read('seogrow-tasks-v2');
      const upload=()=>evaluate("(()=>{const dt=new DataTransfer();dt.items.add(new File([window.__qaBackup],'qa-backup.json',{type:'application/json'}));const e=document.querySelector('[data-testid=backup-file]');e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}));})()");
      await set('.backup-panel','Password del backup','wrong-password');await upload();
      await waitFor("document.querySelector('[data-testid=backup-file]').value===''",'Wrong password settles');
      assert.deepEqual(await read('seogrow-tasks-v2'),before);
      await set('.backup-panel','Password del backup','qa-backup-passphrase');
      await evaluate("window.__qaBeforeRestore=true;window.confirm = m => m === 'Importare questo backup? I dati locali attuali verranno sostituiti.'");await upload();
      await waitFor("!window.__qaBeforeRestore && document.querySelector('.guided-nav')",'UI backup reload completed');
      assert.deepEqual(await read('seogrow-tasks-v2'),before);
    } finally {
      await evaluate("if(window.__qaOriginalURL)URL.createObjectURL=window.__qaOriginalURL;if(window.__qaOriginalAnchor)HTMLAnchorElement.prototype.click=window.__qaOriginalAnchor;delete window.__qaBackup");
    }
  });

}
