import test from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns/promises';
import { isolatedElementorQaPatch } from '../server/isolatedElementorQa.js';
import { registerRoutes } from '../server/wordpressLiveApprovalHook.js';
import { registerRoutes as rollbackRoutes } from '../server/wordpressLiveRollbackHook.js';
const baseline = {"id":8196,"meta":{"_elementor_conditions":[],"_elementor_data":"[{\"id\":\"a90b1c23\",\"elType\":\"container\",\"settings\":{\"container_type\":\"flex\",\"flex_direction\":\"column\",\"content_width\":\"boxed\",\"padding\":{\"unit\":\"px\",\"top\":40,\"right\":24,\"bottom\":40,\"left\":24,\"isLinked\":false}},\"elements\":[{\"id\":\"b90c2d34\",\"elType\":\"widget\",\"settings\":{\"title\":\"Collaudo SeoGrow \\u2014 versione iniziale\",\"header_size\":\"h1\",\"typography_typography\":\"custom\",\"typography_font_family\":\"Roboto\",\"typography_font_size\":{\"unit\":\"px\",\"size\":36},\"typography_font_size_mobile\":{\"unit\":\"px\",\"size\":26},\"typography_font_weight\":\"600\"},\"elements\":[],\"widgetType\":\"heading\"},{\"id\":\"c90d3e45\",\"elType\":\"widget\",\"settings\":{\"editor\":\"<p>Pagina tecnica temporanea. Verifica di testo, caratteri, impaginazione e ripristino. Nessun servizio o contenuto commerciale.<\\/p>\"},\"elements\":[],\"widgetType\":\"text-editor\"}],\"isInner\":false}]","_elementor_edit_mode":"builder","_elementor_page_settings":null,"_elementor_template_type":"wp-page","footnotes":"","iawp_total_views":0,"rank_math_canonical_url":"","rank_math_description":"","rank_math_robots":["noindex","nofollow"],"rank_math_title":""},"status":"draft","template":"elementor_canvas","title":{"raw":"SeoGrow — collaudo isolato 2026-09-09","rendered":"SeoGrow — collaudo isolato 2026-09-09"}};
const base = new URL('https://yogabuenaonda.it/');
test('isolated QA refuses another site, page, template, status, dynamic document and style change', () => {
  for (const [url,id,patch] of [
    ['https://example.com/',8196,{}], [String(base),8197,{}],
    [String(base),8196,{status:'publish'}], [String(base),8196,{template:'default'}],
    [String(base),8196,{meta:{...baseline.meta,rank_math_robots:[]}}],
    [String(base),8196,{meta:{...baseline.meta,_elementor_conditions:['include/general']}}],
    [String(base),8196,{meta:{...baseline.meta,_elementor_data:baseline.meta._elementor_data.replace('"size":36','"size":40')}}],
  ]) assert.throws(()=>isolatedElementorQaPatch(new URL(url),'pages',id,{...baseline,...patch}));
  const result=isolatedElementorQaPatch(base,'pages',8196,baseline);
  const before=JSON.parse(baseline.meta._elementor_data),after=JSON.parse(result.meta._elementor_data);
  after[0].elements[0].settings.title=before[0].elements[0].settings.title;
  assert.deepEqual(after,before,'Only the known heading text is changed');
});
test('QA uses production approval/apply/rollback routes, rechecks scope and preserves exact snapshots', async t => {
  t.mock.method(dns,'lookup',async()=>[{address:'8.8.8.8',family:4}]);
  let entity=structuredClone(baseline); const writes=[]; const routes=new Map();
  const app={post:(path,handler)=>routes.set(path,handler)};
  const transports={
    readTransport:async()=>Response.json(entity),
    atomicTransport:async(url,options)=>{
      const body=JSON.parse(options.body); writes.push(body);
      assert.equal(body.id,8196);
      assert.equal(body.expectedCurrent.meta._elementor_data,entity.meta._elementor_data);
      entity.meta._elementor_data=body.changes.meta._elementor_data;
      return Response.json({ok:true,atomicGuaranteed:true,staleChecked:true,entity});
    }
  };
  registerRoutes(app,transports); rollbackRoutes(app,transports);
  const auth={siteUrl:String(base),username:'fixture',applicationPassword:'fixture'};
  const call=async(path,body)=>{let status=200,data;await routes.get('/api/wordpress/'+path)({ip:'qa-fixture',body},{status(v){status=v;return this;},json(v){data=v;return this;}});return {status,data};};
  const prepare=()=>call('live-preview',{...auth,isolatedQa:true,resource:'pages',id:8196,changes:{title:'must not be used'}});
  const first=await prepare(); assert.equal(first.status,200);assert.equal(writes.length,0);
  entity.template='default';
  const denied=await call('live-apply',{...auth,approvalToken:first.data.approvalToken});
  assert.notEqual(denied.status,200);assert.equal(writes.length,0);
  entity=structuredClone(baseline);
  const preview=await prepare();
  const applied=await call('live-apply',{...auth,approvalToken:preview.data.approvalToken});
  assert.equal(applied.status,200);assert.equal(writes.length,1);
  assert.equal((await call('live-apply',{...auth,approvalToken:preview.data.approvalToken})).status,409);
  const rollback=await call('live-rollback',{...auth,resource:'pages',id:8196,changes:applied.data.before,expectedCurrent:{'meta._elementor_data':applied.data.after.meta._elementor_data}});
  assert.equal(rollback.status,200);
  assert.equal(entity.meta._elementor_data,baseline.meta._elementor_data);
  assert.deepEqual(writes.map(x=>x.operation),['apply','rollback']);
});

