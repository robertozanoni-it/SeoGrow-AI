import assert from 'node:assert/strict';
import { runAutoFix } from './qa-auto-fix.mjs';
import { runRemainingFields } from './qa-remaining-fields.mjs';
import { runFieldBoundaries } from './qa-field-boundaries.mjs';

// Real React controls and IndexedDB; all external responses are explicit fixtures.
export async function runFormMatrix({ evaluate, waitFor, clickSidebar, reload, record, screenshot, command, mode }) {
  if (mode === 'smoke') return;
  const q = JSON.stringify;
  const field = (scope, label) => `(() => { const root = document.querySelector(${q(scope)}); const labels = [...(root?.querySelectorAll('label') || [])]; const matches = labels.filter(l => (() => { const direct=[...l.childNodes].filter(n=>n.nodeType===3).map(n=>n.textContent).join('').trim(); if(direct)return direct; const copy=l.cloneNode(true); copy.querySelectorAll('input,select,textarea,a,small').forEach(e=>e.remove()); return copy.textContent.trim(); })() === ${q(label)}); if (matches.length !== 1) throw new Error('Ambiguous/missing label: ' + ${q(label)}); return matches[0].control || matches[0].querySelector('input,select,textarea'); })()`;
  const set = async (scope, label, value) => {
    const expr = field(scope, label);
    await evaluate(`(() => { const e = ${expr}; if (!e || e.disabled) throw new Error('Unavailable field'); if (e.tagName === 'SELECT') { e.value = ${q(value)}; e.dispatchEvent(new Event('change', {bubbles:true})); } else { const proto = e.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, ${q(value)}); e.dispatchEvent(new Event('input', {bubbles:true})); } })()`);
    await waitFor(`${expr}.value === ${q(value)}`, 'React field: ' + label);
  };
  const button = async (text, scope = 'body') => {
    const expr = `[...document.querySelector(${q(scope)}).querySelectorAll('button')].find(e => e.textContent.trim() === ${q(text)} && !e.disabled)`;
    await waitFor(expr, 'Button: ' + text); await evaluate(`(${expr}).click()`);
  };
  const submit = selector => evaluate(`document.querySelector(${q(selector)}).requestSubmit()`);
  const read = key => evaluate(`(async () => { const m = await import('/src/workspaceDatabase.js'); await m.flushWorkspace(); return JSON.parse(m.workspaceStorage.getItem(${q(key)}) || 'null'); })()`);
  const saved = (key, condition) => waitFor(`(async () => { const m = await import('/src/workspaceDatabase.js'); const value = JSON.parse(m.workspaceStorage.getItem(${q(key)}) || 'null'); return ${condition}; })()`, 'Stored ' + key);
  const revisit = async page => { await read('seogrow-preferences-v1'); await clickSidebar('Task'); await waitFor("document.querySelector('.task-filters')", 'Task before reload'); await saved('seogrow-selected-page-v1', "value === 'Task'"); await read('seogrow-selected-page-v1'); await reload(); await clickSidebar(page); };
  const mock = (path, body, status = 200) => evaluate(`window.__qaFormMocks = {...window.__qaFormMocks, [${q(path)}]: {body:${q(body)},status:${status}}}`);
  const request = async path => { await waitFor(`window.__qaFormRequests?.some(r => r.path === ${q(path)})`, 'Mock request ' + path); return evaluate(`window.__qaFormRequests.filter(r => r.path === ${q(path)}).at(-1).body`); };
  const resetRequests = () => evaluate('window.__qaFormRequests = []');

  await record('FIELDS-CLIENT', async () => {
    await clickSidebar('Clienti'); await button('Nuovo cliente');
    await waitFor("document.querySelector('[role=dialog] form')", 'Client form');
    assert.equal(await evaluate("document.querySelector('[role=dialog] form').checkValidity()"), false);
    await set('[role=dialog]', 'Nome cliente', '   ');
    await set('[role=dialog]', 'Sito web', 'https://fields.example/');
    await submit('[role=dialog] form');
    await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Inserisci un nome cliente valido.')", 'Blank name rejected');
    await set('[role=dialog]', 'Nome cliente', 'QA Fields');
    await set('[role=dialog]', 'Sito web', 'https://example.com/');
    await submit('[role=dialog] form');
    await waitFor("document.querySelector('[role=dialog]')?.textContent.includes('Esiste già un progetto')", 'Duplicate domain rejected');
    await set('[role=dialog]', 'Sito web', 'https://fields.example/');
    await submit('[role=dialog] form');
    await saved('seogrow-clients', "value?.some(c => c.name === 'QA Fields' && c.url === 'https://fields.example/')");
    const created = (await read('seogrow-clients')).find(c => c.name === 'QA Fields');
    await revisit('Clienti');
    await waitFor("[...document.querySelectorAll('.client-card')].some(c => c.textContent.includes('QA Fields'))", 'Client survives reload');
    await evaluate("[...[...document.querySelectorAll('.client-card')].find(c => c.textContent.includes('QA Fields')).querySelectorAll('button')].find(b => b.textContent.trim() === 'Modifica').click()");
    await set('[role=dialog]', 'Nome cliente', 'QA Fields Edited');
    await submit('[role=dialog] form');
    await saved('seogrow-clients', `value?.some(c => c.id === ${q(created.id)} && c.name === 'QA Fields Edited')`);
  });

  await record('FIELDS-TASK', async () => {
    await clickSidebar('Task'); await button('Nuova task');
    await waitFor("document.querySelector('.task-editor')", 'Task form');
    const values = {Titolo:'QA all task fields', Progetto:'9001', Priorità:'Alta', Stato:'In revisione', Scadenza:'2026-12-15', 'Pagina da correggere o verificare':'https://example.com/source/', 'Destinazione o risorsa collegata':'https://example.com/target/', 'Problema, evidenze e istruzioni':'Evidence\nSecond line', 'Note operative':'Notes retained'};
    for (const [label,value] of Object.entries(values)) await set('.task-editor',label,value);
    await submit('.task-editor');
    await saved('seogrow-tasks-v2', "value?.some(t => t.title === 'QA all task fields' && t.notes === 'Notes retained')");
    const task = (await read('seogrow-tasks-v2')).find(t => t.title === values.Titolo);
    for (const [key,value] of Object.entries({priority:'Alta',status:'In revisione',due:'2026-12-15',sourceUrl:values['Pagina da correggere o verificare'],targetUrl:values['Destinazione o risorsa collegata'],detail:values['Problema, evidenze e istruzioni'],notes:'Notes retained',sourceClientId:9001})) assert.equal(task[key],value,key);
    await revisit('Task');
    await evaluate("[...document.querySelectorAll('.task-title-button')].find(b => b.textContent.includes('QA all task fields')).click()");
    await waitFor("document.querySelector('.task-editor')", 'Reopened task');
    for (const [label,value] of Object.entries(values)) assert.equal(await evaluate(`${field('.task-editor',label)}.value`),value,label);
    await button('Salva task','.task-editor');
  });

  await record('FIELDS-PREFERENCES', async () => {
    await clickSidebar('Impostazioni'); await waitFor("document.querySelector('.settings-form')", 'Settings');
    const before = await read('seogrow-preferences-v1');
    await set('.settings-form','Nome visualizzato','QA display');
    await saved('seogrow-preferences-v1', "value?.name === 'QA display'");
    for (const hours of ['6','12','24','0']) {
      await set('.settings-form','Controllo automatico mentre l’app è aperta',hours);
      await saved('seogrow-preferences-v1', `value?.refreshHours === ${Number(hours)} && value?.name === 'QA display'`);
    }
    const initial = await evaluate("[...document.querySelectorAll('.settings-form input[type=checkbox]')].map(e=>e.checked)");
    assert.equal(initial.length,4);
    for (let i=0;i<4;i++) { await evaluate(`document.querySelectorAll('.settings-form input[type=checkbox]')[${i}].click()`); await waitFor(`document.querySelectorAll('.settings-form input[type=checkbox]')[${i}].checked === ${!initial[i]}`,'Checkbox changed'); }
    await submit('.settings-form'); await revisit('Impostazioni');
    await waitFor("document.querySelector('.settings-form')", 'Settings reloaded');
    assert.equal(await evaluate(`${field('.settings-form','Nome visualizzato')}.value`),'QA display');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.settings-form input[type=checkbox]')].map(e=>e.checked)"),initial.map(v=>!v));
    for (let i=0;i<4;i++) await evaluate(`document.querySelectorAll('.settings-form input[type=checkbox]')[${i}].click()`);
    await set('.settings-form','Nome visualizzato',before.name);
    await saved('seogrow-preferences-v1',`value?.saveDrafts === ${initial[3]}`);
  });

  await record('FIELDS-PROJECT', async () => {
    await clickSidebar('Centro progetto'); await waitFor("document.querySelector('.wizard-steps')", 'Wizard');
    const values = {'Obiettivo del progetto':'QA objective', 'Nome studio o agenzia':'QA agency', Titolo:'QA report', Colore:'#123456', Introduzione:'Introduction\nEvidence'};
    for(const [label,value] of Object.entries(values)) await set('main',label,value);
    for(let i=0;i<3;i++) await button('Avanti');
    await waitFor("[...document.querySelectorAll('.planning-panel')][0].textContent.includes('Obiettivo: QA objective')",'Wizard summary');
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Avanti').disabled"),true);
    await set('main','Soglia avvisi','30'); await set('main','Frequenza','168');
    const count = await evaluate("document.querySelectorAll('fieldset .report-option input').length");
    assert.equal(count,5);
    for(let i=0;i<4;i++) await evaluate(`document.querySelectorAll('fieldset .report-option input')[${i}].click()`);
    await waitFor("document.querySelectorAll('fieldset .report-option input')[4].disabled",'Last report section cannot be removed');
    await saved('seogrow-preferences-v1',"value?.projectSettings?.[9001]?.report?.intro === 'Introduction\\nEvidence'");
    await revisit('Centro progetto'); await waitFor("document.querySelector('.wizard-steps')",'Wizard restored');
    for(const [label,value] of Object.entries(values)) assert.equal(await evaluate(`${field('main',label)}.value`),value,label);
    assert.equal(await evaluate(`${field('main','Soglia avvisi')}.value`),'30');
    assert.equal(await evaluate(`${field('main','Frequenza')}.value`),'168');
    assert.deepEqual(await evaluate("[...document.querySelectorAll('fieldset .report-option input')].map(e=>e.checked)"),[false,false,false,false,true]);
  });

  await record('FIELDS-RANKINGS', async () => {
    await clickSidebar('Posizionamenti'); await waitFor("document.querySelector('.ranking-form')",'Rankings');
    await set('.ranking-form','Keyword, una per riga','qa alpha\nqa beta\nqa alpha');
    for(const [label,value] of Object.entries({'Profondità':'50','Dispositivo':'mobile','Codice località DataForSEO':'2840','Lingua':'en'})) await set('.ranking-form',label,value);
    await evaluate("window.confirm = m => m.startsWith('Controllare 2 keyword')");
    await mock('/api/dataforseo/rankings',{error:'QA rankings rejected'},400); await resetRequests();
    await submit('.ranking-form');
    assert.deepEqual(await request('/api/dataforseo/rankings'),{domain:'https://example.com/',keywords:['qa alpha','qa beta'],depth:50,device:'mobile',locationCode:2840,languageCode:'en'});
    await waitFor("document.querySelector('.ranking-form [role=alert]')?.textContent.includes('QA rankings rejected')",'Rankings error');
    await mock('/api/dataforseo/rankings',{rankings:[],checkedAt:'2026-09-08T10:00:00Z',depth:50,device:'mobile',locationCode:2840,languageCode:'en'});
    await submit('.ranking-form');
    await saved('seogrow-rankings-v1',"value?.[9001]?.[0]?.device === 'mobile'");
  });

  await record('FIELDS-CONTENT', async () => {
    await clickSidebar('Piano editoriale'); await waitFor("document.querySelector('.generator')",'Generator');
    await set('.generator','Formato','meta description'); await set('.generator','Argomento','QA topic');
    await mock('/api/generate',{content:''}); await submit('.generator');
    await waitFor("document.querySelector('.generator [role=alert]')?.textContent.includes('non ha restituito')",'Empty generation rejected');
    await mock('/api/generate',{content:'QA generated content',demo:false}); await resetRequests(); await submit('.generator');
    const sent = await request('/api/generate'); assert.equal(sent.topic,'QA topic'); assert.equal(sent.type,'meta description');
    await waitFor("document.querySelector('.editor textarea')?.value === 'QA generated content'",'Generated content');
    await evaluate("(() => {const e=document.querySelector('.editor textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'QA revised content'); e.dispatchEvent(new Event('input',{bubbles:true}));})()");
    await saved('seogrow-content-drafts-v1',"value?.[9001]?.content === 'QA revised content'");
    await revisit('Piano editoriale');
    await waitFor("document.querySelector('.editor textarea')?.value === 'QA revised content'",'Draft restored');
    assert.equal(await evaluate(`${field('.generator','Argomento')}.value`),'QA topic');
    assert.equal(await evaluate(`${field('.generator','Formato')}.value`),'meta description');
    assert.equal(await evaluate("document.querySelector('.editor textarea').getAttribute('aria-label')"),'Bozza da revisionare');
  });

  await record('FIELDS-TOPICAL', async () => {
    await waitFor("document.querySelector('.topical-form')",'Topical form');
    await set('.topical-form','Argomenti principali, uno per riga','qa alpha\nqa beta');
    await set('.topical-form','Codice località DataForSEO','2276'); await set('.topical-form','Lingua','de');
    await evaluate("window.confirm = m => m.startsWith('DataForSEO applicherà un costo API')");
    await mock('/api/dataforseo/topical-map',{ideas:[],cost:0}); await resetRequests(); await submit('.topical-form');
    const sent = await request('/api/dataforseo/topical-map');
    assert.deepEqual(sent.seeds,['qa alpha','qa beta']); assert.equal(sent.locationCode,2276); assert.equal(sent.languageCode,'de');
    await saved('seogrow-topical-maps-v1',"Array.isArray(value?.[9001]?.ideas)");
  });

  await record('FIELDS-WORDPRESS', async () => {
    await clickSidebar('Integrazioni'); await waitFor("document.querySelector('.wordpress-integration')",'WordPress form');
    for(const [label,value] of Object.entries({'URL sito':'https://example.com/','Nome utente':'qa-user','Password applicativa':'qa-synthetic-password-only'})) await set('.wordpress-integration',label,value);
    await mock('/api/wordpress/test',{error:'QA forbidden'},403); await resetRequests(); await submit('.wordpress-integration');
    assert.deepEqual(await request('/api/wordpress/test'),{url:'https://example.com/',username:'qa-user',applicationPassword:'qa-synthetic-password-only'});
    await waitFor("document.querySelector('.wordpress-integration').textContent.includes('QA forbidden')",'Auth error shown');
    await mock('/api/wordpress/test',{name:'QA user',site:'https://example.com/',canCreatePosts:true,canCreatePages:false}); await submit('.wordpress-integration');
    await waitFor("document.querySelector('.wordpress-integration').textContent.includes('Connessione verificata come QA user')",'Connection retry');
    const profile = await read('seogrow-wordpress-profiles-v1'); assert.ok(!JSON.stringify(profile).includes('qa-synthetic-password-only'));
    await revisit('Integrazioni'); await waitFor("document.querySelector('.wordpress-integration')",'Connection reload');
    assert.equal(await evaluate(`${field('.wordpress-integration','Password applicativa')}.value`),'');
  });
  await runRemainingFields({evaluate,waitFor,clickSidebar,record,set,field,button,submit,read,saved,revisit,mock,request,resetRequests});
  await runAutoFix({evaluate,waitFor,clickSidebar,record,button,set,read,revisit,mock,resetRequests,screenshot,command});
  await runFieldBoundaries({evaluate,waitFor,clickSidebar,record,set,field,button,submit,read,saved,revisit,mock,request,resetRequests});

}
