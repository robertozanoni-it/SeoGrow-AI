import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { canOpenControlledLinkPreview, controlledPreviewAllowed, shouldOpenAutomaticProposal, correctionMatchesProblem } from './resolutionPath.js';
import { selectFocusedRemediation, proposalSelectionKey } from './remediationSelection.js';
const url='https://example.com/page/', target='https://broken.example/one';
const problem={issueType:'broken-external-link',sourceUrl:url,title:'Link esterno 404',correctability:'assisted',targetUrls:[target]};
test('controlled preview is explicit and never relabels assisted as automatic',()=>{
 assert.equal(canOpenControlledLinkPreview(problem),true);
 assert.equal(shouldOpenAutomaticProposal(problem),false);
 assert.equal(controlledPreviewAllowed(problem,{}),false);
 assert.equal(controlledPreviewAllowed(problem,{controlledPreview:true,targetUrl:target}),true);
 assert.equal(controlledPreviewAllowed(problem,{controlledPreview:true,targetUrl:'https://wrong.example'}),false);
 assert.equal(problem.correctability,'assisted');
});
for(const extra of [{stale:true},{problemState:'needs_verification'},{interventionState:'applied'},{problemState:'resolved'},{targetUrls:[]},{targetUrls:[target,'https://broken.example/two']},{issueType:'canonical'},{issueType:'broken-link'},{targetUrls:['javascript:alert(1)']}])test('controlled entry cannot bypass unsupported/stale/ambiguous states '+JSON.stringify(extra),()=>assert.equal(canOpenControlledLinkPreview({...problem,...extra}),false));
test('native selected issue follows the exact destination when two 404s share a page',()=>{
 const issues=[{type:problem.issueType,sourceUrl:url,targetUrl:target,label:problem.title},{type:problem.issueType,sourceUrl:url,targetUrl:'https://broken.example/two',label:problem.title}];
 const audit={type:'site',item:{url:'https://example.com/',analyzedAt:'2026-09-12T12:00:00Z',issues}};
 const focus={clientId:12,sourceUrl:url,title:problem.title,issueType:problem.issueType,targetUrl:issues[1].targetUrl,controlledPreview:true,createdAt:100};
 assert.equal(selectFocusedRemediation([audit],focus,12,{}).issueIndex,1);
 assert.equal(selectFocusedRemediation([audit],{...focus,targetUrl:undefined},12,{}),null,'legacy ambiguity stays blocked');
 assert.equal(selectFocusedRemediation([audit],{...focus,targetUrl:'https://missing.example/'},12,{}),null);
 assert.notEqual(proposalSelectionKey(focus),proposalSelectionKey({...focus,targetUrl:target}));
 assert.equal(correctionMatchesProblem(problem,{issueType:problem.issueType,sourceUrl:url,issue:issues[1]}),false);
});
test('actual navigation stores the explicit target and opens the visible proposal route',async()=>{
 const source=await readFile(new URL('./AutomaticProposalNavigation.js',import.meta.url),'utf8');
 const code=source.match(/export const openProblemResolution = [\s\S]*?(?=\nexport const openAutomaticProposal)/)[0].replace('export const','const');
 const storage=new Map(),events=[],routes=[];
 const open=runInNewContext(code+'\nopenProblemResolution',{window:{dispatchEvent:e=>events.push(e),alert:()=>assert.fail('storage error')},sessionStorage:{setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},problemNavigationFocus:p=>({...p,clientId:12}),selectedClientId:()=>12,VALID_OPEN_SOURCES:new Set(['problem-card']),shouldOpenAutomaticProposal,canOpenControlledLinkPreview,RESOLUTION_FOCUS_KEY:'resolution',PROPOSAL_FOCUS_KEY:'proposal',PROPOSAL_ROUTE_PAGE:'Correzioni',navigatePage:p=>routes.push(p),CustomEvent:class {constructor(type,opts){this.type=type;this.detail=opts.detail;}}});
 assert.equal(open(problem,12,'problem-card',{controlledPreview:true}),true);
 assert.equal(JSON.parse(storage.get('proposal')).targetUrl,target);
 assert.equal(JSON.parse(storage.get('proposal')).correctability,'assisted');
 assert.equal(storage.has('resolution'),false);
 assert.equal(events[0].type,'seogrow-automatic-proposal-open');
 assert.equal(routes[0],'Correzioni');
});

for (const state of [{stale:true},{problemState:'needs_verification'},{interventionState:'applied'},{problemState:'resolved'}]) test('automatic preview also respects changed state '+JSON.stringify(state),()=> {
  assert.equal(controlledPreviewAllowed({...problem,correctability:'automatic',...state},{controlledPreview:true,targetUrl:target}),false);
});
