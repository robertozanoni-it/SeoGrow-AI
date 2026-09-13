import assert from 'node:assert/strict';

export async function runClientCardIsolationFlow({evaluate,waitFor,clickSidebar,record,button,read,revisit,screenshot,command}) {
  await record('CLIENT-CARD-IDENTITY-PAGE-HIERARCHY', async () => {
    const originalId = Number(await read('seogrow-selected-client-v1'));
    const clients = await read('seogrow-clients');
    const other = clients.find(client => Number(client.id) !== originalId);
    assert.ok(other, 'Two independently identified projects are required for this regression');
    const roots = {
      'Clienti': '.reference-clients-page',
      'Problemi': '.reference-problems-page',
      'Panoramica': '.reference-dashboard',
      'Audit SEO': '.audit-enhancer-root',
      'Correzioni': '.reference-corrections-page',
      'Posizionamenti': '.reference-rankings-page',
    };
    const hierarchy = async page => {
      const root = roots[page];
      await waitFor(`decodeURIComponent(location.hash.slice(1))===${JSON.stringify(page)} && document.querySelector(${JSON.stringify(root)})`, 'Reference root ready: '+page);
      assert.equal(await evaluate("Boolean(document.querySelector('vite-error-overlay'))"),false);
      assert.equal(await evaluate(`document.querySelectorAll(${JSON.stringify(root)}).length`),1,'Exactly one reference root for '+page);
    };
    try {
      for (const client of [other, clients.find(item=>Number(item.id)===originalId)]) {
        await revisit('Clienti');
        await hierarchy('Clienti');
        await waitFor(`[...document.querySelectorAll('.reference-client-card')].some(card=>card.querySelector('h2')?.textContent===${JSON.stringify(client.name)})`,'Reference client card visible');
        await evaluate(`[...document.querySelectorAll('.reference-client-card')].find(card=>card.querySelector('h2')?.textContent===${JSON.stringify(client.name)}).querySelector('.primary').click()`);
        await waitFor(`document.querySelector('.client-select select')?.value===${JSON.stringify(String(client.id))} && decodeURIComponent(location.hash.slice(1))==='Panoramica'`, 'Clicked client identity matches project selector');
        assert.equal(Number(await read('seogrow-selected-client-v1')),Number(client.id));
        await clickSidebar('Centro progetto');
        await waitFor(`document.querySelector('.reference-project-identity h1')?.textContent.includes(${JSON.stringify(client.name)})`, 'Project center belongs to clicked client');
        assert.equal(Number(await read('seogrow-selected-client-v1')),Number(client.id));
      }
      for (const page of Object.keys(roots)) { await clickSidebar(page); await hierarchy(page); }
      await clickSidebar('Clienti');
      for (const width of [1440,390]) {
        await command('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
        await evaluate("window.scrollTo({top:0,behavior:'instant'})");
        await waitFor('document.documentElement.scrollWidth<=innerWidth+1','Client reference layout has no horizontal overflow');
        await screenshot('client-card-hierarchy-'+width);
      }
    } finally {
      await command('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
      await evaluate(`(()=>{const e=document.querySelector('.client-select select');if(e&&e.value!==${JSON.stringify(String(originalId))}){e.value=${JSON.stringify(String(originalId))};e.dispatchEvent(new Event('change',{bubbles:true}))}})()`);
      await waitFor(`document.querySelector('.client-select select')?.value===${JSON.stringify(String(originalId))}`,'Original client selection restored');
      await read('seogrow-selected-client-v1');
      await revisit('Centro progetto');
    }
  });
}
