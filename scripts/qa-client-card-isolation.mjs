import assert from 'node:assert/strict';

export async function runClientCardIsolationFlow({evaluate,waitFor,clickSidebar,record,button,read,revisit,screenshot,command}) {
  await record('CLIENT-CARD-IDENTITY-PAGE-HIERARCHY', async () => {
    const originalId = Number(await read('seogrow-selected-client-v1'));
    const clients = await read('seogrow-clients');
    const other = clients.find(client => Number(client.id) !== originalId);
    assert.ok(other, 'Two independently identified projects are required for this regression');
    const actualClick = async selector => {
      await waitFor(`document.querySelector(${JSON.stringify(selector)})`, 'Real card visible');
      const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({behavior:'instant',block:'center'});const r=e.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);if(e.disabled||r.width<=0||r.height<=0||!e.contains(hit))throw new Error('Card not clickable');return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
      await command('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});
      await command('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
    };
    const hierarchy = async page => {
      await waitFor(`(()=>{const main=document.querySelector('.app main');const title=main?.querySelector('.page-title');const wizard=main?.querySelector('.guided-page-wizard-host');const cards=main?.querySelector('.card-workspace-host');return main?.dataset.page===${JSON.stringify(page)}&&title?.querySelector('h1')?.textContent.startsWith(${JSON.stringify(page)})&&wizard?.textContent.includes('Percorso guidato')&&cards?.textContent.trim()&&(title.compareDocumentPosition(wizard)&Node.DOCUMENT_POSITION_FOLLOWING)&&(wizard.compareDocumentPosition(cards)&Node.DOCUMENT_POSITION_FOLLOWING)})()`, 'Page title, its wizard and its cards in order: '+page);
      assert.equal(await evaluate("document.querySelectorAll('.app main .card-workspace-host').length"),1,'Exactly one current card workspace');
      assert.equal(await evaluate("Boolean(document.querySelector('vite-error-overlay'))"),false);
    };
    try {
      for (const client of [other, clients.find(item=>Number(item.id)===originalId)]) {
        await revisit('Clienti');
        await hierarchy('Clienti');
        await actualClick(`.card-record[data-client-id="${client.id}"]`);
        await waitFor(`document.querySelector('.client-select select')?.value===${JSON.stringify(String(client.id))} && document.querySelector('.card-horizontal-heading h2')?.textContent===${JSON.stringify(client.name)}`, 'Clicked client identity matches both detail and topbar');
        assert.equal(Number(await read('seogrow-selected-client-v1')),Number(client.id));
        await button('Apri Centro progetto','.card-horizontal-actions');
        await waitFor(`document.querySelector('.app main .page-title h1')?.textContent.includes(${JSON.stringify(client.name)})`, 'Project center belongs to clicked client');
        assert.equal(Number(await read('seogrow-selected-client-v1')),Number(client.id));
      }
      // Exercise ordinary navigation without a reload concealing detached hosts.
      for (const page of ['Clienti','Problemi','Panoramica','Audit SEO','Correzioni','Posizionamenti','Clienti']) {
        await clickSidebar(page);
        await hierarchy(page);
      }
      for (const width of [1440,390]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        await evaluate("window.scrollTo({top:0,behavior:'instant'})");
        await waitFor('document.documentElement.scrollWidth<=innerWidth+1','Client cards have no horizontal page overflow');
        await screenshot('client-card-hierarchy-'+width);
      }
    } catch (error) {
      console.error('CLIENT_CARD_DIAGNOSTIC '+JSON.stringify(await evaluate("({page:location.hash,title:document.querySelector('.app main .page-title h1')?.textContent,selected:document.querySelector('.client-select select')?.value,hosts:[...document.querySelectorAll('.card-workspace-host,.guided-page-wizard-host')].map(e=>({class:e.className,connected:e.isConnected,parent:e.parentElement?.className})),body:document.body.innerText.slice(-1500)})").catch(()=>null)));
      await screenshot('client-card-isolation-failure').catch(()=>{});
      throw error;
    } finally {
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate(`(()=>{const e=document.querySelector('.client-select select');if(e&&e.value!==${JSON.stringify(String(originalId))}){e.value=${JSON.stringify(String(originalId))};e.dispatchEvent(new Event('change',{bubbles:true}))}})()`);
      await waitFor(`document.querySelector('.client-select select')?.value===${JSON.stringify(String(originalId))}`,'Original client selection restored');
      await read('seogrow-selected-client-v1');
      await revisit('Centro progetto');
    }
  });
}
