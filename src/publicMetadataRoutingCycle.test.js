import test from 'node:test';
import assert from 'node:assert/strict';
import { publicHeadMetadata, decodePublicEntities } from '../server/publicHeadMetadata.js';
import { metadataVerificationPatch } from './metadataCorrectionVerification.js';
import { matchesProblemFocus, problemNavigationFocus } from './problemNavigationFocus.js';
import { filterProblemRows } from './problemFilters.js';
import { buildUnifiedProblems } from './problemsModel.js';
import { safeHttpHref, issueIdentity } from './reliabilityModel.js';
const page = (head,body='') => `<html><head>${head}</head><body>${body}</body></html>`;

test('metadata parser preserves apostrophes, nested quote types, Unicode and entity text',()=>{
 const result=publicHeadMetadata(page(`<TITLE>Yoga &amp; benessere</TITLE><meta content="L'alimentazione &egrave; utile: &#039;yoga&#039; > fretta." NAME=DESCRIPTION>`));
 assert.equal(result.title,'Yoga & benessere');
 assert.equal(result.metaDescription,"L'alimentazione è utile: 'yoga' > fretta.");
 assert.equal(result.titleCount,1);assert.equal(result.metaDescriptionCount,1);
 const quoted=publicHeadMetadata(page(`<meta name='description' content='La pratica "yoga" aiuta.'>`));
 assert.equal(quoted.metaDescription,'La pratica "yoga" aiuta.');
});
test('metadata in inert markup, attributes and body cannot create fictitious observations',()=>{
 const result=publicHeadMetadata(page(`<title>Reale</title><!-- <title>Falso</title> --><script>let x='<meta name="description" content="Falso">'</script><template><title>Falso</title></template><link data-debug="<title>Falso</title>" href="a"><meta name="description" content="Reale">`,`<title>Nel corpo</title><meta name="description" content="Corpo">`));
 assert.equal(result.title,'Reale');assert.equal(result.titleCount,1);
 assert.equal(result.metaDescription,'Reale');assert.equal(result.metaDescriptionCount,1);
});
test('invalid Unicode numeric entities do not crash an entire audit',()=>{
 assert.equal(decodePublicEntities('x &#99999999; &#xD800; &#0; y'),'x � � � y');
});
const record={id:'correction',clientId:1,sourceUrl:'https://example.com/pagina/',entityId:12,after:{'meta.rank_math_description':'Descrizione corretta.'}};
const valid={ok:true,status:200,isHtml:true,url:record.sourceUrl,wordpressDocumentId:12,metaDescription:'Descrizione corretta.',metaDescriptionCount:1};
test('one matching value does not prove a fix when duplicate head tags are present',()=>{
 assert.equal(metadataVerificationPatch(record,valid).frontendConfirmed,true);
 for(const count of [undefined,null,0,2,'1']) assert.throws(()=>metadataVerificationPatch(record,{...valid,metaDescriptionCount:count}),/esattamente un tag/);
});
test('slash variants need resource evidence, not an assumed equivalence',()=>{
 assert.throws(()=>metadataVerificationPatch(record,{...valid,url:'https://example.com/pagina',wordpressDocumentId:undefined}),/nessun alias presunto/);
 assert.equal(metadataVerificationPatch(record,{...valid,url:'https://example.com/pagina'}).frontendConfirmed,true);
 assert.throws(()=>metadataVerificationPatch(record,{...valid,url:'https://example.com/altro/'}),/non coincide/);
});
test('same-source same-type broken links navigate to their own problem, not the first row',()=>{
 const sourceUrl='https://example.com/source/';
 const issues=['https://www.external.example/a','https://www.external.example/b'].map(targetUrl=>({type:'broken-external-link',label:'Link esterno interrotto',severity:'alta',sourceUrl,targetUrl}));
 const {rows}=buildUnifiedProblems({clientId:1,siteHistory:[{url:'https://example.com/',analyzedAt:'2026-09-11T00:00:00Z',issues}],tasks:[],corrections:[]});
 assert.equal(rows.length,2);
 const wanted=rows.find(row=>row.targetUrls.includes(issues[1].targetUrl));
 const focus=problemNavigationFocus(wanted,1,1);
 assert.equal(rows.filter(row=>matchesProblemFocus(row,focus)).length,1);
 assert.equal(matchesProblemFocus(rows.find(row=>row!==wanted),focus),false);
});
test('links preserve observed www, path, query order and fragments without accepting unsafe credentials',()=>{
 const href='https://www.example.com/path//item?z=3&a=2#details';
 assert.equal(safeHttpHref(href),href);
 for(const url of ['javascript:alert(1)','https://user:secret@example.com/path','data:text/html,no']) assert.equal(safeHttpHref(url),'');
 const base={issueType:'broken-external-link',sourceUrl:'https://source.example/'};
 assert.notEqual(issueIdentity({...base,targetUrl:'https://www.example.com/a'}),issueIdentity({...base,targetUrl:'https://example.com/a'}));
});
test('high severity and external destination searches filter the displayed problem data',()=>{
 const rows=[{title:'Uno',detail:'',sourceUrl:'https://a.example/',targetUrls:['https://external.example/missing'],severity:'high',problemState:'open'},{title:'Due',detail:'',sourceUrl:'https://b.example/',severity:'medium',problemState:'open'}];
 assert.deepEqual(filterProblemRows(rows,{state:'active',severity:'high'}),[rows[0]]);
 assert.deepEqual(filterProblemRows(rows,{query:'external.example'}),[rows[0]]);
 assert.deepEqual(filterProblemRows(rows,{query:'external.example',severity:'medium'}),[]);
});
