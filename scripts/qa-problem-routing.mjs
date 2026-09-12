import assert from 'node:assert/strict';
import JSZip from 'jszip';

export async function runProblemRoutingFlow({evaluate,waitFor,record,button,set,read,revisit,mock,resetRequests,screenshot,command}) {
  await record('PROBLEM-CARD-PROPOSAL-LIMITS-TITLE', async () => {
    const clientId=await read('seogrow-selected-client-v1');
    const clients=await read('seogrow-clients');
    const client=clients.find(c=>Number(c.id)===Number(clientId));
    const siteKey='seogrow-analyses-v2',pageKey='seogrow-page-audit-history-v2',profileKey='seogrow-wordpress-profiles-v1';
    const sites=await read(siteKey),pages=await read(pageKey),profiles=await read(profileKey);
    const originals=await evaluate("(async()=>{const m=await import('/src/remediationStore.js');return m.listCorrections({includeOrphans:true})})()");
    const url=new URL('content-h1-wordpress-routing/',client.url).href;
    const issue={type:'duplicate-title',label:'Title duplicato',severity:'alta',sourceUrl:url,url,detail:'Title duplicato sulla pagina '+url};
    const description={...issue,type:'duplicate-description',label:'Meta description duplicata'};
    const manual={...issue,type:'url-alias',label:'Due URL dello stesso contenuto WordPress',detail:'Verifica la canonical prima di decidere il redirect; non cambiare il testo condiviso.'};
    const externalIssues=['https://www.external.example/first-link','https://www.external.example/second-link'].map(targetUrl=>({...issue,type:'broken-external-link',label:'Link esterno interrotto',severity:'media',targetUrl,detail:'Collegamento non raggiungibile'}));
    const audit={url:client.url,analyzedAt:'2026-09-11T00:00:00Z',score:80,issues:[issue,description,manual,...externalIssues]};
    const oldTitle='Yoga a Cinisello Balsamo: guida iniziale';
    const newTitle='Yoga a Cinisello Balsamo: pratica consapevole';
    const oldDescription='Testo precedente della pagina.';
    const publicState={ok:true,isHtml:true,titleCount:1,metaDescriptionCount:1,status:200,url,wordpressDocumentId:42,title:oldTitle,titleMatchesExpected:true,metaDescription:oldDescription,h1:1,words:400};
    const write=(key,value)=>evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');m.workspaceStorage.setItem(${JSON.stringify(key)},${JSON.stringify(JSON.stringify(value))});await m.flushWorkspace();window.dispatchEvent(new StorageEvent('storage',{key:${JSON.stringify(key)}}))})()`);
    const click = async selector => {
      await waitFor(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return false;const r=e.getBoundingClientRect(),s=getComputedStyle(e);return !e.disabled&&s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0})()`,selector+' actionable');
      // Scrolling a newly opened card can still be animated by its parent.
      // Wait for a stable, hit-testable target before sending any mouse event.
      const point=await evaluate(`(async()=>{const selector=${JSON.stringify(selector)};let element=document.querySelector(selector);element.scrollIntoView({behavior:'instant',block:'center'});let previous='',stable=0;for(let frame=0;frame<90;frame++){await new Promise(requestAnimationFrame);const e=document.querySelector(selector);if(!e||!e.isConnected)continue;if(e!==element){element=e;e.scrollIntoView({behavior:'instant',block:'center'});previous='';stable=0;}const r=e.getBoundingClientRect(),style=getComputedStyle(e);const key=[r.x,r.y,r.width,r.height,scrollX,scrollY].map(v=>Math.round(v*10)).join('|');stable=key===previous?stable+1:0;previous=key;if(stable<8)continue;if(e.disabled||style.display==='none'||style.visibility==='hidden'||r.width<=0||r.height<=0)throw new Error('Not visible: '+selector);const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);if(hit!==e&&!e.contains(hit))throw new Error('Covered control: '+selector);return {x,y};}throw new Error('Pointer target did not settle: '+selector)})()`);
      await command('Input.dispatchMouseEvent',{type:'mouseMoved',...point});
      await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    };
    const scope='.proposal-remediation-slot';
    try {
      await write(siteKey,{...sites,[clientId]:[audit]});await write(pageKey,{...pages,[clientId]:[]});
      await write(profileKey,{...profiles,[clientId]:{url:client.url,username:'qa-routing'}});
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${JSON.stringify(originals.filter(r=>Number(r.clientId)!==Number(clientId)))})})()`);
      await revisit('Problemi');
      await waitFor("document.querySelector('.problems-overview button:nth-child(2) span')?.textContent==='Alta gravità'",'High filter rendered with its label');
      await click('.problems-overview button:nth-child(2)');
      await waitFor("document.querySelectorAll('.native-problem-cards .problem-card').length===3",'High-severity filter affects the actual card list');
      await click('.problems-overview button:nth-child(5)');
      await click('.card-record[data-issue-type=\"duplicate-title\"]');
      await waitFor("document.querySelector('.automatic-proposal-header h1')?.textContent==='Proposta correzione'",'Problem card opens specific proposal, not list');
      assert.equal(await evaluate("document.querySelector('.automatic-proposal-header small')?.textContent"),url);
      assert.equal(await evaluate("Boolean(document.querySelector('.problem-drawer-scrim'))"),false);
      await waitFor("document.querySelector('.proposal-remediation-slot .audit-unified-credentials')",'Actual WordPress controls');
      for(const [label,value] of Object.entries({'URL del sito':client.url,'Utente WordPress':'qa-routing','Password applicativa':'qa-only'})) await set(scope+' .audit-unified-credentials',label,value);
      await mock('/api/wordpress/connection-check',{user:{name:'QA'},connector:{version:'1.3.5'}});
      await button('Collega WordPress',scope);
      await waitFor("document.querySelector('.proposal-remediation-slot .wordpress-connection-control')?.textContent.includes('WordPress collegato')",'Connection ready');
      await mock('/api/wordpress/inspect-fast',{siteUrl:client.url,resource:'posts',entity:{id:42,status:'publish',link:url,title:{raw:oldTitle},content:{raw:'Yoga e pratica consapevole nel centro.'},meta:{rank_math_title:oldTitle,rank_math_description:oldDescription}}});
      await mock('/api/frontend/inspect',publicState);
      await mock('/api/wordpress/verify-frontend',publicState);
      await mock('/api/wordpress/generate-seo-value-v2',{value:newTitle,publishable:true});
      await mock('/api/wordpress/live-preview',{approvalToken:'qa-routing-title',adapter:'Rank Math',resource:'posts',id:42,targetUrl:url,changed:['meta.rank_math_title'],previewBefore:{meta:{rank_math_title:oldTitle}},previewAfter:{meta:{rank_math_title:newTitle}}});
      await mock('/api/wordpress/live-apply',{ok:true,adapter:'Rank Math',resource:'posts',id:42,sourceUrl:url,changed:['meta.rank_math_title'],before:{meta:{rank_math_title:oldTitle}},after:{meta:{rank_math_title:newTitle}}});
      await resetRequests();await button('Prepara solo questo problema',scope);
      await waitFor("document.querySelector('.proposal-remediation-slot .wp-live-apply-one')",'Title preview');
      const requests=await evaluate('window.__qaFormRequests');
      assert.equal(requests.find(r=>r.path==='/api/wordpress/generate-seo-value-v2').body.kind,'seo_title');
      assert.deepEqual(requests.find(r=>r.path==='/api/wordpress/live-preview').body.changes,{meta:{rank_math_title:newTitle}},'SEO provider selected even when public title equals post_title');
      assert.equal(requests.some(r=>r.path==='/api/wordpress/generate-patch-v2'),false,'No unrelated core/content patch');
      // Download while preparation is available; a saved correction closes the writer.
      await evaluate("window.__qaOrigCreate=URL.createObjectURL;window.__qaOrigAnchor=HTMLAnchorElement.prototype.click;URL.createObjectURL=function(b){if(b.type==='application/zip')window.__qaConnectorBlob=b;return window.__qaOrigCreate(b)};HTMLAnchorElement.prototype.click=function(){if(!this.download.endsWith('.zip'))return window.__qaOrigAnchor.call(this)}");
      try {
        await button('Scarica SeoGrow Connector',scope);
        await waitFor('window.__qaConnectorBlob','Complete Connector download');
        const bytes=await evaluate('(async()=>Array.from(new Uint8Array(await window.__qaConnectorBlob.arrayBuffer())))()');
        const zip=await JSZip.loadAsync(Uint8Array.from(bytes));
        for(const file of ['seogrow-connector.php','seogrow-connector-core.inc','atomic-write.php','elementor-text-write.php','build-manifest.json']) assert.ok(zip.file('seogrow-connector/'+file),file);
      } finally {
        await evaluate('URL.createObjectURL=window.__qaOrigCreate;HTMLAnchorElement.prototype.click=window.__qaOrigAnchor');
      }
      await evaluate('window.confirm=()=>true');
      await click(scope+' .wp-live-apply-one');
      const receipt='.automatic-proposal-page .saved-correction-details[data-correction-id]';
      await waitFor(`document.querySelector(${JSON.stringify(receipt)})?.textContent.includes(${JSON.stringify(newTitle)})`,'Persistent title receipt');
      await waitFor(`!document.querySelector(${JSON.stringify(receipt+' .primary')})?.disabled`,'Receipt verification enabled');
      await mock('/api/wordpress/verify-frontend',{...publicState,title:newTitle.toUpperCase()});
      await button('Riverifica',receipt);
      await waitFor(`document.querySelector(${JSON.stringify(receipt)})?.textContent.includes('soltanto maiuscole')`,'Capitalization is explicit, not false failure');
      await evaluate(`document.querySelector(${JSON.stringify(receipt)}).scrollIntoView({behavior:'instant',block:'start'})`);
      await screenshot('title-proposal-verified');
      await mock('/api/wordpress/verify-frontend',{...publicState,title:newTitle,titleCount:2});
      await button('Riverifica',receipt);
      await waitFor(`document.querySelector(${JSON.stringify(receipt)})?.textContent.includes('esattamente un tag')`,'Duplicate title tags cannot verify a correction');
      await mock('/api/wordpress/verify-frontend',{...publicState,title:newTitle,titleCount:1});
      await button('Torna ai problemi','.automatic-proposal-header');
      await click('.card-record[data-issue-type=\"duplicate-description\"]');
      await waitFor("document.querySelector('.proposal-remediation-slot .audit-unified-credentials')",'Description proposal controls');
      for(const [label,value] of Object.entries({'URL del sito':client.url,'Utente WordPress':'qa-routing','Password applicativa':'qa-only'})) await set(scope+' .audit-unified-credentials',label,value);
      await mock('/api/wordpress/generate-seo-value-v2',{value:'x'.repeat(161),publishable:true});
      await resetRequests();await button('Prepara solo questo problema',scope);
      await waitFor("document.querySelector('.proposal-remediation-slot .correction-explanation')?.textContent.includes('160')",'Oversized description blocked in UI even with a faulty server response');
      assert.equal(await evaluate("window.__qaFormRequests.find(r=>r.path==='/api/wordpress/generate-seo-value-v2')?.body.kind"),'meta_description','The action must match the description card, never the previous title');
      assert.equal(await evaluate("document.querySelector('.proposal-remediation-slot .audit-issue-select select')?.selectedOptions[0]?.textContent.includes('Meta description')"),true);
      assert.equal(await evaluate("Boolean(document.querySelector('.proposal-remediation-slot .wp-live-apply-one'))"),false);
      await screenshot('description-routing-correct-field');
      assert.equal(await evaluate("window.__qaFormRequests.some(r=>/live-preview|live-apply/.test(r.path))"),false);
      await button('Torna ai problemi','.automatic-proposal-header');
      await click('.card-record[data-issue-type=\"url-alias\"]');
      await waitFor("document.body.dataset.seogrowProblemResolution==='true' && document.querySelector('.problem-resolution-heading h1')?.textContent.includes('Due URL')",'Manual diagnosis opens its specific full page');
      assert.equal(await evaluate("getComputedStyle(document.querySelector('.problem-resolution-root-host')).display"),'block');
      assert.equal(await evaluate("(()=>{const e=document.querySelector('.problem-resolution-content section');const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&!!e.textContent.trim()})()"),true,'Nested diagnostic sections are visible and contain real problem data');
      await screenshot('manual-problem-resolution');
      await button('Torna ai problemi','.problem-resolution-root');
      await click('.native-problem-cards [data-problem-key*=\"second-link\"]');
      await waitFor("document.querySelector('.problem-resolution-targets a')?.href==='https://www.external.example/second-link'",'Second external-link card opens its own exact destination');
      assert.equal(await evaluate("[...document.querySelectorAll('.problem-resolution-targets a')].some(a=>a.href.includes('first-link'))"),false,'Never substitute the first problem on the same source page');
      await screenshot('external-problem-specific');
      await button('Apri Correzioni','.problem-resolution-actions');
      await waitFor("document.body.dataset.seogrowProblemResolution!=='true' && document.querySelector('.app main .page-title h1')?.textContent.includes('Correzioni')",'Manual resolution exits to actual correction history');
      await revisit('Audit SEO');
      console.error('AUDIT_REVISIT_DIAGNOSTIC '+JSON.stringify(await evaluate("(async()=>{const m=await import('/src/workspaceDatabase.js');const main=document.querySelector('.app main');const original=[...document.querySelectorAll('.sidebar > nav:not(.guided-nav) button')].map(b=>({text:b.textContent.trim(),active:b.classList.contains('active')}));const guided=[...document.querySelectorAll('.guided-nav button')].map(b=>({text:b.textContent.trim(),active:b.classList.contains('active')}));return{hash:location.hash,mainPage:main?.dataset?.page||'',mainClass:main?.className||'',workspacePage:m.workspaceStorage.getItem('seogrow-selected-page-v1'),cardMode:document.body.dataset.seogrowCardMode||'',cardHostCount:document.querySelectorAll('.card-workspace-host').length,cardWorkspaceCount:document.querySelectorAll('.card-workspace').length,auditRootCount:document.querySelectorAll('.audit-enhancer-root').length,original,guided,bridgeRequested:document.body.dataset.seogrowGuidedBridgeRequested||'',bridgeRendered:document.body.dataset.seogrowGuidedBridgeRenderedPage||'',bridgeNativeActive:document.body.dataset.seogrowGuidedBridgeNativeActive||'',reconcilerInstalled:Boolean(window.__seogrowPageRouteReconcilerInstalled),recoveryInstalled:Boolean(window.__seogrowCardWorkspaceRecoveryInstalled)}})()")));
      await click('.card-record[data-audit-card=\"true\"]');
      await click('.card-horizontal-detail .audit-problem-open');
      await waitFor("document.querySelector('.automatic-proposal-header h1')?.textContent==='Proposta correzione'",'Individual audit issue opens same specific proposal');
      assert.equal(await evaluate("document.querySelector('.automatic-proposal-header small')?.textContent"),url);
      for(const width of [1440,390]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        await evaluate("document.querySelector('.automatic-proposal-header').scrollIntoView({behavior:'instant',block:'start'})");
        await waitFor('document.documentElement.scrollWidth<=innerWidth+1','Proposal navigation responsive');
        await screenshot('problem-routing-'+width);
      }
    } catch(error) {
      await screenshot('problem-routing-failure').catch(()=>{});
      console.error('ROUTING_DIAGNOSTIC '+JSON.stringify(await evaluate("({url:location.href,body:document.body.innerText.slice(-7000),requests:(window.__qaFormRequests||[]).map(r=>r.path)})").catch(()=>null)));
      throw error;
    } finally {
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate("(async()=>{const n=await import('/src/AutomaticProposalNavigation.js');n.clearAutomaticProposalFocus();sessionStorage.removeItem(n.RESOLUTION_FOCUS_KEY);window.dispatchEvent(new CustomEvent('seogrow-automatic-proposal-close'));window.dispatchEvent(new CustomEvent('seogrow-problem-resolution-open'))})()");
      await write(siteKey,sites);await write(pageKey,pages);await write(profileKey,profiles);
      await evaluate(`(async()=>{const m=await import('/src/remediationStore.js');await m.replaceCorrections(${JSON.stringify(originals)})})()`);
      await revisit('Centro progetto');
    }
  });
}
