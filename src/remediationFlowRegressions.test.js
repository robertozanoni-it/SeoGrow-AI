import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import JSZip from 'jszip';
import { assertSeoPatchLengths, assertSeoTextLength, seoCharacterCount } from './seoTextPolicy.js';
import { validateSeoSuggestion } from './editorialQuality.js';
import { deterministicMetaDescription } from '../server/wordpressSeoAdapterV2Hook.js';
import { registerRoutes } from '../server/wordpressLiveApprovalHook.js';
import { validateTaxonomyChange } from '../server/wordpressTaxonomyHook.js';
import { remediationIssueKind, remediationSourceUrl } from './remediationIssueKind.js';
import { problemNavigationFocus, matchesProblemFocus } from './problemNavigationFocus.js';
import { metadataVerificationPatch } from './metadataCorrectionVerification.js';
import { metadataDuplicateGroups } from './metadataDuplicateGroups.js';
import { buildConnectorArchive } from './connectorPackage.js';

const sentence = 'Scopri come integrare lo yoga in una routine equilibrata con posizioni, consigli pratici e indicazioni utili per iniziare in modo graduale e consapevole.';

test('meta description 160-character policy counts punctuation, spaces, NFC and code points', () => {
  assert.equal(seoCharacterCount('e\u0301 🧘.'), 4);
  for (const size of [159, 160]) assert.doesNotThrow(() => assertSeoTextLength('meta_description', 'x'.repeat(size)));
  for (const size of [161, 175, 180]) {
    assert.throws(() => assertSeoTextLength('meta_description', 'x'.repeat(size)), e => e.code === 'SEO_TEXT_LIMIT_EXCEEDED' && e.maxCharacters === 160);
    assert.equal(validateSeoSuggestion('meta_description', sentence + 'x'.repeat(size-sentence.length)).publishable, false);
  }
  for (const key of ['rank_math_description','_yoast_wpseo_metadesc']) assert.throws(() => assertSeoPatchLengths({meta:{[key]:'x'.repeat(161)}}), /160/);
  assert.doesNotThrow(() => assertSeoPatchLengths({content: 'x'.repeat(1000)}));
});

test('adding final punctuation never turns a 160-character deterministic fallback into 161', () => {
  for (const size of [159,160,161,170,240]) {
    const value = deterministicMetaDescription({content:('Parole naturali per la descrizione completa della pagina yoga. ').repeat(8).slice(0,size)});
    assert.ok(value && seoCharacterCount(value) <= 160, value);
    assert.match(value, /[.!?…]$/);
  }
  assert.equal(validateSeoSuggestion('meta_description','<b>'+sentence+'</b>').publishable,false,'markup is not erased before validating raw text');
});

test('server rejects oversized SEO metadata before requesting WordPress or granting approval', async () => {
  const handlers = new Map();
  registerRoutes({post:(path,fn)=>handlers.set(path,fn)}, {readTransport:()=>{throw new Error('Must not read WordPress');},atomicTransport:()=>{throw new Error('Must not write WordPress');}});
  const res = {statusCode:200,status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};
  await handlers.get('/api/wordpress/live-preview')({ip:'policy-test',body:{siteUrl:'https://example.com',username:'qa',applicationPassword:'qa',resource:'posts',id:1,changes:{meta:{rank_math_description:'x'.repeat(161)}}}},res);
  assert.equal(res.statusCode,422);
  assert.equal(res.body.code,'SEO_TEXT_LIMIT_EXCEEDED');
  assert.equal(res.body.approvalToken,undefined);
});

test('taxonomy apply respects cap while a historical rollback preserves its exact long snapshot', () => {
  const request = {field:'meta_description',value:'x'.repeat(170),targetUrl:'https://example.com/category/yoga/'};
  assert.throws(()=>validateTaxonomyChange(request), /160/);
  assert.equal(validateTaxonomyChange({...request,mode:'rollback'}),request.value);
});

test('issue type wins over incidental H1, content, WordPress or description in evidence URL', () => {
  assert.equal(remediationIssueKind({type:'duplicate-title', label:'Title duplicato', detail:'https://example.com/content-h1-meta-description-wordpress/'}),'title');
  assert.equal(remediationIssueKind({type:'duplicate-description',label:'Metadescription duplicata'}),'meta_description');
  assert.equal(remediationIssueKind({type:'url-alias',label:'Due URL dello stesso contenuto WordPress'}),'');
  assert.equal(remediationSourceUrl({type:'broken-external-link',sourceUrl:'https://example.com/source',url:'https://else.example',targetUrl:'https://broken.example'}), 'https://example.com/source');
  assert.equal(remediationSourceUrl({type:'broken-link',targetUrl:'https://broken.example'},{url:'https://example.com/source'}),'https://example.com/source');
});

test('data-driven problem navigation preserves full URL and cannot switch the current project', () => {
  const sourceUrl = 'https://example.com/'+'word-'.repeat(70);
  const problem = {sourceUrl,title:'Title duplicato',issueType:'duplicate-title',correctability:'automatic'};
  const focus = problemNavigationFocus(problem,12,12,'problem-card');
  assert.equal(focus.sourceUrl,sourceUrl);
  assert.equal(matchesProblemFocus({...problem,title:'Titolo duplicato'},focus),true);
  assert.equal(matchesProblemFocus({...problem,issueType:'duplicate-description'},focus),false);
  assert.equal(problemNavigationFocus(problem,12,13),null);
  assert.equal(problemNavigationFocus({...problem,sourceUrl:'javascript:alert(1)'},12,12),null);
});

test('Rank Math title casing is reported separately; different content and description mismatches still fail', () => {
  const record={id:'a',clientId:12,sourceUrl:'https://example.com/yoga/',entityId:42,fields:['meta.rank_math_title'],after:{'meta.rank_math_title':'Yoga e alimentazione a Cinisello Balsamo'}};
  const response={ok:true,isHtml:true,titleCount:1,metaDescriptionCount:1,status:200,url:record.sourceUrl,wordpressDocumentId:42,title:'Yoga E Alimentazione A Cinisello Balsamo'};
  const patch=metadataVerificationPatch(record,response);
  assert.equal(patch.frontendConfirmed,true);assert.equal(patch.titleCaseOnlyMatch,true);assert.equal(patch.status,'Da verificare');
  assert.equal(metadataVerificationPatch(record,{...response,title:'Yoga per dimagrire'}).frontendConfirmed,false);
  assert.equal('after' in patch,false);
});

test('only a proven same-resource slash pair is excluded from independently editable duplicates', () => {
  const make=(url,extra={})=>({url,title:'Yoga',description:'Yoga quotidiano',ok:true,status:200,isHtml:true,canonicalCount:1,canonical:'https://example.com/yoga/',wordpressDocumentId:42,...extra});
  const pair=[make('https://example.com/yoga'),make('https://example.com/yoga/')];
  assert.equal(metadataDuplicateGroups(pair,'title').duplicates.length,0);
  assert.equal(metadataDuplicateGroups(pair,'description').aliases.length,1);
  for (const change of [{wordpressDocumentId:99},{canonicalCount:2},{canonical:'https://example.com/other/'}]) assert.equal(metadataDuplicateGroups([pair[0],{...pair[1],...change}],'title').duplicates.length,1);
  assert.equal(metadataDuplicateGroups([...pair,make('https://example.com/other/',{wordpressDocumentId:77,canonical:'https://example.com/other/'})],'title').duplicates[0].length,2);
});

test('browser Connector package contains every required module with complete snapshots', async () => {
  const dir = new URL('../wordpress-plugin/seogrow-connector/',import.meta.url);
  const files={};
  for(const name of (await readdir(dir)).filter(name=>/\.(php|inc)$/.test(name))) files[name]=await readFile(new URL(name,dir),'utf8');
  const result=await buildConnectorArchive(files); const zip=await JSZip.loadAsync(result.bytes);
  assert.equal(result.fileCount,Object.keys(files).length);
  assert.ok(result.fileCount>=14);
  assert.equal(await zip.file('seogrow-connector/atomic-write.php').async('string'),files['atomic-write.php']);
  await assert.rejects(buildConnectorArchive({'seogrow-connector.php':files['seogrow-connector.php']}),/Pacchetto incompleto/);
});
