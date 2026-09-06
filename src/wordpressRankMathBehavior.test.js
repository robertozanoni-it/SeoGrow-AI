import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { metaDescriptionFromHtml, backendConsistent, exactOriginal } from '../scripts/wordpress-rankmath-doctor-convergence.mjs';
import { publicSeo, publicFindings, classifyError } from '../scripts/wordpress-rankmath-global.mjs';

test('public HTML entities match decoded original; duplicate descriptions never pass',()=>{
  assert.equal(metaDescriptionFromHtml('<meta name="description" content="Yoga &amp; salute &#8217;">'),'Yoga & salute ’');
  assert.throws(()=>metaDescriptionFromHtml('<meta name="description" content="x"><meta name="description" content="x">'));
  assert.throws(()=>metaDescriptionFromHtml('no description'));
});
test('ownership loss during sampling is a failed proof, not a TypeError',()=>{
  assert.equal(backendConsistent({classification:'RECOVERY_OWNERSHIP_LOST'}),false);
  assert.equal(exactOriginal({classification:'RECOVERY_OWNERSHIP_LOST'},'original'),false);
});
test('raw backend differences cannot be hidden by whitespace normalization',()=>{
  assert.equal(backendConsistent({rows:['Yoga  salute'],api:'Yoga salute',inspectionValue:'Yoga salute'}),false);
});
test('global scanner reports missing, duplicate, marker and review findings',()=>{
  const seo=publicSeo('<title>Yoga</title><meta name="description" content="SeoGrow E2E categoria 2026"><link rel="canonical" href="https://example.test/other"><meta name="robots" content="noindex">');
  assert.deepEqual(publicFindings(seo,'https://example.test/'),['CANONICAL_REVIEW_REQUIRED','NOINDEX_REVIEW_REQUIRED','LEGACY_MARKER_PUBLIC']);
  assert.equal(classifyError({status:404,code:'rest_no_route'}),'CONNECTOR_UPDATE_REQUIRED');
});
for(const scenario of ['healthy','pending','ownership-loss','ambiguous-write']) {
 test(`Doctor executes real control flow: ${scenario}`,()=>{
  const moduleUrl=new URL('../scripts/wordpress-rankmath-doctor-convergence.mjs',import.meta.url).href;
  const program=`
    import assert from 'node:assert/strict';
    const scenario=${JSON.stringify(scenario)};
    let journal=scenario==='pending', stateCalls=0, mutations=[], current='Yoga & salute';
    globalThis.setTimeout=(fn)=>{queueMicrotask(fn);return 0;};
    globalThis.fetch=async (url,options={})=>{
      const path=new URL(url).pathname; const term={id:1,taxonomy:'category'};
      let data;
      if(options.method==='POST' && !path.includes('inspect-taxonomy')) mutations.push(path);
      if(path.includes('inspect-taxonomy')) data={ownership:scenario==='ownership-loss' && stateCalls>0?'ambiguous':'rank-math-only',term,seo:{rankMath:{meta_description:current}}};
      else if(path.endsWith('taxonomy-diagnostics')) data={term,plugins:{rankMath:true,yoast:false},meta:{rank_math_description:{apiValue:current,dbRows:[{value:current}],cache:{values:[current]}}}};
      else if(path.endsWith('taxonomy-doctor-state')) {stateCalls++;data={term,recoveryJournal:journal?{available:true,original:current}:{available:false}};}
      else if(path.endsWith('taxonomy-doctor-finalize-recovery')) {assert.ok(stateCalls>=3);journal=false;data={finalized:true,journalCleared:true};}
      else if(path.endsWith('taxonomy-doctor-observe')) {if(scenario==='ambiguous-write')throw Object.assign(new Error('lost response'),{code:'ECONNRESET'});data={recorded:true,contentWritesPerformed:0};}
      else return new Response('<meta name="description" content="Yoga &amp; salute">');
      return new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
    };
    const {doctorTarget}=await import(${JSON.stringify(moduleUrl)});
    let error;try{await doctorTarget({url:'https://example.test/category/yoga/',label:'categoria'});}catch(e){error=e;}
    if(scenario==='ownership-loss'){assert.ok(error);assert.equal(mutations.length,0);}
    else if(scenario==='ambiguous-write'){assert.ok(error);assert.equal(mutations.filter(p=>p.endsWith('observe')).length,1);}
    else {assert.equal(error,undefined);assert.ok(stateCalls>=3);if(scenario==='pending')assert.equal(journal,false);}
  `;
  const r=spawnSync(process.execPath,['--input-type=module','-e',program],{env:{...process.env,SEOGROW_WP_SITE_URL:'https://example.test',SEOGROW_WP_E2E_ALLOW_WRITE:'YES_I_UNDERSTAND'},encoding:'utf8',timeout:15000});
  assert.equal(r.status,0,r.stderr+r.stdout);
 });
}

test('global run collects independent failures despite missing v2 route and performs no writes',()=>{
  const moduleUrl=new URL('../scripts/wordpress-rankmath-global.mjs',import.meta.url).href;
  const program=`
    import assert from 'node:assert/strict';
    import {mkdtemp,rm} from 'node:fs/promises';
    import {tmpdir} from 'node:os';
    import {join} from 'node:path';
    const temp=await mkdtemp(join(tmpdir(),'rankmath-global-'));process.chdir(temp);
    let writes=0;
    const json=(data,headers={})=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json',...headers}});
    globalThis.fetch=async(url,options={})=>{
      if(options.method==='POST')writes++;
      const path=new URL(url).pathname;
      if(path.endsWith('taxonomy-doctor-convergence-capability'))return new Response(JSON.stringify({code:'rest_no_route'}),{status:404});
      if(path.endsWith('taxonomy-doctor-capability'))return json({});
      if(path.endsWith('/categories'))return json([{id:1,link:'https://example.test/category/one/'},{id:2,link:'https://example.test/category/two/'}],{'x-wp-total':'2','x-wp-totalpages':'1'});
      if(path.endsWith('/tags'))return json([],{'x-wp-total':'0','x-wp-totalpages':'0'});
      if(path.endsWith('wordpress-public-inventory'))return json({complete:true,truncated:false,totalResources:0,resources:[]});
      if(path.endsWith('taxonomy-diagnostics'))return new Response('{}',{status:403});
      return new Response('<title>Page</title>');
    };
    try {
      const {runGlobal}=await import(${JSON.stringify(moduleUrl)});
      const report=await runGlobal();
      assert.equal(report.healthy,false);assert.equal(report.complete,true);assert.equal(report.counts.checked,2);
      assert.equal(report.checks[0].code,'CONNECTOR_UPDATE_REQUIRED');
      assert.ok(report.targets.every(t=>t.issues.length>=2));assert.equal(writes,0);
    } finally {await rm(temp,{recursive:true,force:true});}
  `;
  const r=spawnSync(process.execPath,['--input-type=module','-e',program],{env:{...process.env,SEOGROW_WP_SITE_URL:'https://example.test',SEOGROW_WP_E2E_CONFIRM_HOST:'example.test',SEOGROW_WP_USERNAME:'test',SEOGROW_WP_APPLICATION_PASSWORD:'test',SEOGROW_WP_CATEGORY_URL:'https://example.test/category/one/'},encoding:'utf8',timeout:15000});
  assert.equal(r.status,0,r.stderr+r.stdout);
});

test('public scanner distinguishes head metadata from embedded HTML SEO tags',()=>{
 const seo=publicSeo('<head><title>X</title><meta name="description" content="Head"><link rel="canonical" href="https://example.test/"></head><body><meta name="description" content="Body"><link rel="canonical" href="https://example.test/"></body>');
 assert.deepEqual(seo.descriptions,['Head']);assert.equal(seo.canonicals.length,1);
 assert.deepEqual(publicFindings(seo,'https://example.test/'),['MISPLACED_SEO_TAGS_IN_BODY']);
});
test('public redirects are bounded, same-origin and unauthenticated',async()=>{
 const {fetchPublic,resourceExclusion}=await import('../scripts/wordpress-rankmath-global.mjs');
 let calls=0;
 const r=await fetchPublic('https://example.test/old','https://example.test',async(url,opts)=>{calls++;assert.equal(opts.headers.authorization,undefined);return calls===1?new Response('',{status:301,headers:{location:'/new'}}):new Response('ok');});
 assert.equal(r.url,'https://example.test/new');assert.equal(r.redirects.length,1);
 await assert.rejects(fetchPublic('https://example.test/','https://example.test',async()=>new Response('',{status:301,headers:{location:'https://elsewhere.test/'}})),/OUTSIDE/);
 await assert.rejects(fetchPublic('https://example.test/','https://example.test',async()=>new Response('',{status:301,headers:{location:'/'}})),/LOOP/);
 assert.equal(resourceExclusion({postType:'elementor_library'}),'ELEMENTOR_TEMPLATE_NOT_SEO_PAGE');
 assert.equal(resourceExclusion({postType:'page'}),null);
});
