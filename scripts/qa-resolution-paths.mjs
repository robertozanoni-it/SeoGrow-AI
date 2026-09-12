import assert from 'node:assert/strict';

// Actual React controls and IndexedDB; all upstream responses are synthetic.
export async function runResolutionPaths({evaluate,waitFor,record,button,set,read,revisit,mock,resetRequests,screenshot,command}) {
  await record('REMEDIATION-REVIEW-AND-ABSENT-LINK', async () => {
    const q=JSON.stringify;
    const clientId=await read('seogrow-selected-client-v1');
    const client=(await read('seogrow-clients')).find(c=>Number(c.id)===Number(clientId));
    const keys=['seogrow-analyses-v2','seogrow-page-audit-history-v2','seogrow-wordpress-profiles-v1'];
    const saved=Object.fromEntries(await Promise.all(keys.map(async key=>[key,await read(key)])));
    const corrections=await evaluate("(async()=>{const m=await import('/src/remediationStore.js');return m.listCorrections({includeOrphans:true})})()");
    const write=(key,value)=>evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');m.workspaceStorage.setItem(${q(key)},${q(JSON.stringify(value))});await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key:${q(key)}}))})()`);
    const source=new URL('qa-resolution/',client.url).href;
    const target='https://www.yogajournal.com/poses/types/advanced/';
    const scope='.proposal-remediation-slot';
    const description='Scopri come integrare lo yoga in una routine equilibrata con posizioni, consigli pratici e indicazioni utili per iniziare in modo graduale e consapevole.';
    const words=Array.from({length:230},(_,n)=>`concetto${String.fromCharCode(97+Math.floor(n/26))}${String.fromCharCode(97+n%26)}`);
    const original=`<p>${words.slice(0,176).join(' ')}.</p>`, expanded=`<p>${words.join(' ')}.</p>`;
    const elementor=text=>JSON.stringify([{id:'qa-widget',elType:'widget',widgetType:'text-editor',settings:{editor:text},elements:[]}]);
    const entity={id:42,status:'publish',link:source,title:{raw:'Guide pratiche per lo yoga'},content:{raw:original},meta:{rank_math_description:'Descrizione precedente.',_elementor_data:elementor(original)}};
    const publicState={ok:true,isHtml:true,status:200,url:source,canonical:source,wordpressDocumentId:42,h1:1,words:176,minimumWords:180,verificationSafe:true,contentProbeVisible:true,contentCoverageStrong:true,contentProbeCount:3,contentProbeMatches:3};
    const seed=async(issue,automatic=true)=>{
      await write(keys[0],{...saved[keys[0]],[clientId]:[{url:client.url,analyzedAt:new Date().toISOString(),score:80,issues:[{sourceUrl:source,url:source,severity:'alta',...issue}]}]});
      await write(keys[1],{...saved[keys[1]],[clientId]:[]});
      await write(keys[2],{...saved[keys[2]],[clientId]:{url:client.url,username:'qa-review'}});
      await revisit('Problemi');
      await waitFor(`document.querySelector('.native-problem-cards [data-issue-type=${q(issue.type)}]')`,'Specific synthetic card');
      await evaluate(`document.querySelector('.native-problem-cards [data-issue-type=${q(issue.type)}]').click()`);
      if(!automatic)return;
      await waitFor("document.querySelector('.proposal-remediation-slot .audit-unified-credentials')",'Native proposal credentials');
      for(const [label,value]of Object.entries({'URL del sito':client.url,'Utente WordPress':'qa-review','Password applicativa':'qa-only'}))await set(scope+' .audit-unified-credentials',label,value);
      await mock('/api/wordpress/connection-check',{user:{name:'QA'},connector:{version:'1.3.8'}});
      const connected=await evaluate(`document.querySelector(${q(scope)})?.textContent.includes('WordPress collegato')`);
      if(!connected)await button('Collega WordPress',scope);
      await mock('/api/wordpress/inspect-fast',{siteUrl:client.url,resource:'posts',entity});
      await mock('/api/frontend/inspect',publicState);await mock('/api/wordpress/verify-frontend',publicState);
      await resetRequests();
    };
    const edit=async value=>{
      await evaluate(`(()=>{const e=document.querySelector('.manual-remediation-proposal textarea');e.focus();Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,${q(value)});e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
      await waitFor(`document.querySelector('.manual-remediation-proposal textarea')?.value===${q(value)}`,'Edited value in React state');
    };
    const noWrite=async()=>assert.equal(await evaluate("(window.__qaFormRequests||[]).some(r=>/live-apply|shared-link-apply|atomic-write/.test(r.path))"),false,'Preparation and validation cannot write the site');
    try {
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${q(corrections.filter(c=>Number(c.clientId)!==Number(clientId)))})})()`);
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await seed({type:'duplicate-description',label:'Meta description duplicata'});
      await mock('/api/wordpress/generate-seo-value-v2',{error:'Proposta ripetitiva e troncata: rivedi il testo.',code:'EDITORIAL_REVIEW_REQUIRED',publishable:false},422);
      await button('Prepara solo questo problema',scope);
      await waitFor("document.querySelector('.manual-remediation-proposal textarea')",'Manual review after quality rejection');
      await edit(description);
      await evaluate("document.querySelector('.manual-remediation-proposal').scrollIntoView({behavior:'instant',block:'center'})");
      await screenshot('resolution-meta-review-desktop');
      await command('Emulation.setDeviceMetricsOverride',{width:390,height:1000,deviceScaleFactor:1,mobile:true});
      await evaluate("document.querySelector('.manual-remediation-proposal').scrollIntoView({behavior:'instant',block:'center'})");
      assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth+2'),true,'Review has no mobile page overflow');
      await screenshot('resolution-meta-review-mobile');
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await mock('/api/wordpress/generate-seo-value-v2',{ok:true,value:description,publishable:true,quality:{publishable:true,source:'user-reviewed'},manual:true});
      await mock('/api/wordpress/live-preview',{approvalToken:'qa-review-meta',adapter:'Rank Math',resource:'posts',id:42,changed:['meta.rank_math_description'],previewBefore:{meta:{rank_math_description:entity.meta.rank_math_description}},previewAfter:{meta:{rank_math_description:description}}});
      await button('Valida e prepara anteprima',scope);
      await waitFor("document.querySelector('.proposal-remediation-slot .wp-live-apply-one')",'Reviewed metadata gets a normal approval preview');
      assert.equal(await evaluate("window.__qaFormRequests.filter(r=>r.path==='/api/wordpress/generate-seo-value-v2').at(-1).body.manualValue"),description);
      await noWrite();

      // An applied record must open verification, not another automatic writer.
      const pending={id:'qa-pending-resolution',clientId:Number(clientId),issueType:'duplicate-description',issueLabel:'Meta description duplicata',sourceUrl:source,status:'Da verificare',appliedAt:new Date().toISOString(),fields:['meta.rank_math_description'],before:{'meta.rank_math_description':'Precedente'},after:{'meta.rank_math_description':description}};
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${q([...corrections.filter(c=>Number(c.clientId)!==Number(clientId)),pending])})})()`);
      await revisit('Problemi');
      await waitFor("document.querySelector('.native-problem-cards [data-issue-type=\"duplicate-description\"] .card-record-open')?.textContent.includes('Verifica risultato')",'Pending card offers verification');
      await evaluate("document.querySelector('.native-problem-cards [data-issue-type=\"duplicate-description\"]').click()");
      await waitFor("document.querySelector('.problem-resolution-actions .primary')?.textContent==='Verifica risultato'",'Pending card opens dedicated verification path');
      assert.equal(await evaluate("Boolean(document.querySelector('.automatic-proposal-page'))"),false);
      await screenshot('resolution-pending-verification');
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${q(corrections.filter(c=>Number(c.clientId)!==Number(clientId)))})})()`);

      await seed({type:'thin-content',label:'Contenuto breve per pagina content: 176 parole'});
      await mock('/api/wordpress/generate-patch-v2',{error:'Il provider AI non ha restituito JSON valido.',code:'AI_OUTPUT_FORMAT',publishable:false},400);
      await button('Prepara solo questo problema',scope);
      await waitFor("document.querySelector('.manual-remediation-proposal textarea')",'Content format error has a review path');
      assert.equal(await evaluate("document.querySelector('.manual-remediation-proposal textarea').value"),original,'Full selected widget remains available');
      await edit(expanded);
      await mock('/api/wordpress/generate-patch-v2',{ok:true,content:JSON.stringify({changes:{content:expanded}}),changes:{content:expanded},publishable:true,quality:{publishable:true,source:'user-reviewed'}});
      await mock('/api/wordpress/live-preview',{approvalToken:'qa-review-content',adapter:'Elementor single text-editor',resource:'posts',id:42,changed:['meta._elementor_data'],previewBefore:{meta:{_elementor_data:entity.meta._elementor_data}},previewAfter:{meta:{_elementor_data:elementor(expanded)}}});
      await button('Valida e prepara anteprima',scope);
      await waitFor("document.querySelector('.proposal-remediation-slot .wp-live-apply-one')",'Reviewed HTML gets a normal Elementor preview');
      const contentRequest=await evaluate("window.__qaFormRequests.filter(r=>r.path==='/api/wordpress/generate-patch-v2').at(-1).body");
      assert.equal(contentRequest.manualValue,expanded);assert.equal(JSON.parse(contentRequest.context).page.content,original);
      await noWrite();

      await seed({type:'broken-external-link',label:'Link esterno non raggiungibile (404)',targetUrl:target},false);
      await button('Prepara correzione','.problem-resolution-actions');
      await waitFor("document.querySelector('.audit-unified-remediation .wp-live-remediation')",'Native audit host for absent link');
      const auditScope='.audit-unified-remediation';
      for(const [label,value]of Object.entries({'URL del sito':client.url,'Utente WordPress':'qa-review','Password applicativa':'qa-only'}))await set('.audit-unified-credentials',label,value);
      await mock('/api/wordpress/inspect-fast',{siteUrl:client.url,resource:'posts',entity});
      await mock('/api/frontend/inspect',publicState);
      await mock('/api/frontend/link-evidence',{ok:true,readOnly:true,targetUrl:target,requestedSourceUrl:source,sourceUrl:source,checkedAt:new Date().toISOString(),verificationSafe:true,scanComplete:true,occurrenceCount:0,anchorText:'',matches:[]});
      await resetRequests();await button('Prepara solo questo problema',auditScope);
      await waitFor("document.querySelector('.wp-live-preview-row.resolved[data-link-resolution=\"absent-confirmed\"]')",'Absent link is resolved in native state');
      await waitFor("document.querySelector('.wp-live-remediation-message')?.textContent.includes('già risolti 1')",'Counter includes resolved link');
      assert.match(await evaluate("document.querySelector('.wp-live-remediation-message').textContent"),/bloccati 0/);
      assert.equal(await evaluate("Boolean(document.querySelector('.wp-live-apply-one,.seogrow-shared-link-prepare'))"),false);
      await waitFor("document.querySelector('.wp-live-link-evidence')?.dataset.loaded==='1'",'Evidence UI settled');
      assert.equal(await evaluate("[...document.querySelectorAll('.wp-live-link-evidence-actions button')].some(b=>/Riprova correzione/.test(b.textContent)&&getComputedStyle(b).display!=='none')"),false,'No visible retry-write on resolved card');
      await evaluate("document.querySelector('.wp-live-preview-row.resolved').scrollIntoView({behavior:'instant',block:'start'})");
      await screenshot('resolution-absent-link-native');await noWrite();
      assert.equal(await evaluate("window.__qaFormRequests.some(r=>/live-preview|generate/.test(r.path))"),false,'Confirmed absence produces no AI call or proposal');
    } finally {
      await command('Emulation.clearDeviceMetricsOverride');
      for(const key of keys)await write(key,saved[key]);
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${q(corrections)})})()`);
      await revisit('Centro progetto');
    }
  });
}
