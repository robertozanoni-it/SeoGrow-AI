import assert from 'node:assert/strict';

// Negative values and complete finite option sets, on the same disposable UI.
export async function runFieldBoundaries({evaluate, waitFor, clickSidebar, record, set, field, submit, read, saved, revisit, mock, resetRequests}) {
  const failures = [];
  const check = async (id, action) => {
    try { await record(id, action); }
    catch (error) {
      failures.push(`${id}: ${error.message}`);
      await evaluate(`document.querySelector('[aria-label="Chiudi finestra"]')?.click()`).catch(() => {});
    }
  };
  const taskKey = 'seogrow-tasks-v2';
  const openTask = async () => {
    await clickSidebar('Task');
    await waitFor("[...document.querySelectorAll('.task-title-button')].some(e=>e.textContent.includes('QA all task fields'))", 'Boundary fixture task exists');
    await evaluate("[...document.querySelectorAll('.task-title-button')].find(e=>e.textContent.includes('QA all task fields')).click()");
    await waitFor("document.querySelector('.task-editor')", 'Boundary task editor');
  };
  await check('FIELDS-TASK-INVALID', async () => {
    const before = await read(taskKey);
    await openTask();
    for (const value of ['', '   ']) {
      await set('.task-editor', 'Titolo', value);
      await submit('.task-editor');
      assert.equal(await evaluate("Boolean(document.querySelector('.task-editor'))"), true);
      assert.deepEqual(await read(taskKey), before, 'Invalid title never changes storage');
    }
    await set('.task-editor', 'Titolo', 'QA all task fields');
    for (const label of ['Pagina da correggere o verificare', 'Destinazione o risorsa collegata']) {
      const original = await evaluate(`${field('.task-editor', label)}.value`);
      await set('.task-editor', label, 'not a valid URL');
      assert.equal(await evaluate("document.querySelector('.task-editor').checkValidity()"), false);
      await submit('.task-editor');
      assert.deepEqual(await read(taskKey), before, 'Invalid URL never changes storage');
      await set('.task-editor', label, original);
    }
    await evaluate("document.querySelector('[aria-label=\"Chiudi finestra\"]').click()");
    await waitFor("!document.querySelector('.task-editor')", 'Unsaved editor closed');
    assert.deepEqual(await read(taskKey), before, 'Cancel preserves every field');
  });
  await check('FIELDS-TASK-OPTIONS', async () => {
    const before = await read(taskKey);
    const original = before.find(t => t.title === 'QA all task fields');
    assert.ok(original);
    for (const priority of ['Alta', 'Media', 'Bassa']) {
      for (const status of ['Da fare', 'In corso', 'In revisione', 'Completato']) {
        await openTask();
        await set('.task-editor', 'Priorità', priority);
        await set('.task-editor', 'Stato', status);
        await submit('.task-editor');
        await saved(taskKey, `value?.some(t=>t.id===${JSON.stringify(original.id)} && t.priority===${JSON.stringify(priority)} && t.status===${JSON.stringify(status)})`);
        const current = await read(taskKey);
        assert.equal(current.length, before.length);
        assert.equal(current.filter(t=>t.id===original.id).length, 1);
      }
    }
    await openTask();
    const text = 'Caffè – 東京 🧪\n<b data-qa-injected="true">Testo letterale</b>';
    await set('.task-editor', 'Note operative', text);
    await set('.task-editor', 'Problema, evidenze e istruzioni', text);
    await set('.task-editor', 'Scadenza', '');
    await set('.task-editor', 'Pagina da correggere o verificare', '');
    await set('.task-editor', 'Destinazione o risorsa collegata', '');
    await submit('.task-editor');
    await saved(taskKey, `value?.some(t=>t.id===${JSON.stringify(original.id)} && t.notes===${JSON.stringify(text)} && t.due==='')`);
    await revisit('Task'); await openTask();
    for (const label of ['Note operative', 'Problema, evidenze e istruzioni']) assert.equal(await evaluate(`${field('.task-editor',label)}.value`), text);
    for (const label of ['Scadenza','Pagina da correggere o verificare','Destinazione o risorsa collegata']) assert.equal(await evaluate(`${field('.task-editor',label)}.value`), '');
    assert.equal(await evaluate("document.querySelector('[data-qa-injected]') !== null"), false);
    await evaluate("document.querySelector('[aria-label=\"Chiudi finestra\"]').click()");
    await waitFor("!document.querySelector('.task-editor')", 'Unsaved editor closed');
    await evaluate(`(async()=>{const m=await import('/src/workspaceDatabase.js');m.workspaceStorage.setItem(${JSON.stringify(taskKey)},${JSON.stringify(JSON.stringify(before))});await m.flushWorkspace()})()`);
    await revisit('Task');
    assert.deepEqual(await read(taskKey), before, 'Boundary task fixture restored');
  });
  await check('FIELDS-SEARCH-OPTIONS', async () => {
    await clickSidebar('Posizionamenti');
    await waitFor("document.querySelector('.ranking-form')", 'Rankings form');
    await mock('/api/dataforseo/rankings', {error:'QA boundary request'}, 400);
    await resetRequests();
    await set('.ranking-form', 'Keyword, una per riga', 'QA keyword');
    for (const value of ['0', '-1', '1.5']) {
      await set('.ranking-form', 'Codice località DataForSEO', value);
      assert.equal(await evaluate("document.querySelector('.ranking-form').checkValidity()"), false);
      await submit('.ranking-form');
      assert.equal(await evaluate("window.__qaFormRequests.length"), 0);
    }
    await set('.ranking-form', 'Codice località DataForSEO', '2380');
    for (const label of ['Profondità', 'Dispositivo', 'Lingua']) {
      const options = await evaluate(`[...${field('.ranking-form',label)}.options].map(o=>o.value)`);
      assert.ok(options.length > 1);
      for (const option of options) await set('.ranking-form',label,option);
    }
    for (const value of ['', '  \n , ; ']) {
      await set('.ranking-form', 'Keyword, una per riga', value);
      await submit('.ranking-form');
      assert.equal(await evaluate("window.__qaFormRequests.length"), 0, 'Blank keywords do not issue requests');
    }
  });
  await check('FIELDS-CONTENT-FORMATS', async () => {
    await clickSidebar('Piano editoriale');
    await waitFor("document.querySelector('.generator')", 'Content generator');
    await mock('/api/generate', {content:'QA boundary content', demo:false});
    await resetRequests();
    await set('.generator','Argomento','   ');
    await submit('.generator');
    assert.equal(await evaluate("window.__qaFormRequests.length"),0,'Blank topic must not issue a generation request');
    await waitFor("document.querySelector('.generator [role=alert]')?.textContent.includes('Inserisci un argomento')", 'Blank topic error visible');
    await set('.generator','Argomento','QA finite formats');
    const options = await evaluate("[...document.querySelector('.generator select').options].map(o=>o.value)");
    assert.equal(options.length,3);
    for(const option of options) {
      await set('.generator','Formato',option);
      await resetRequests(); await submit('.generator');
      await waitFor("window.__qaFormRequests.some(r=>r.path==='/api/generate') && !document.querySelector('.generator button').disabled",'Generation settled');
      const sent=await evaluate("window.__qaFormRequests.find(r=>r.path==='/api/generate').body");
      assert.equal(sent.type,option); assert.equal(sent.topic,'QA finite formats');
    }
    await saved('seogrow-content-drafts-v1',"value?.[9001]?.content==='QA boundary content'");
    await revisit('Piano editoriale');
    await waitFor("document.querySelector('.editor textarea')?.value==='QA boundary content'",'All formats final content retained');
  });
  await check('FIELDS-TOPICAL-INVALID', async () => {
    await clickSidebar('Piano editoriale');
    await waitFor("document.querySelector('.topical-form')", 'Topical form');
    await mock('/api/dataforseo/topical-map', {error:'QA empty seed request'}, 400);
    await evaluate('window.confirm=()=>true');
    await resetRequests();
    await set('.topical-form','Argomenti principali, uno per riga','  \n , ; ');
    await submit('.topical-form');
    assert.equal(await evaluate("window.__qaFormRequests.length"), 0, 'Empty normalized seeds must not issue a paid request');
    await waitFor("document.querySelector('.topical-panel [role=alert]')?.textContent.includes('almeno un argomento')", 'Empty seeds error visible');
  });
  if (failures.length) throw new Error('Field boundary batch failed: '+failures.join(' | '));
}
