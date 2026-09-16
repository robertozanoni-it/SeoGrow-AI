import test from 'node:test';
import assert from 'node:assert/strict';
import { closuresFromAgentRuns } from './problemClosureMigration.js';

test('migra chiusure storiche SEO Agent senza audit', () => {
  const runs={1:[{id:'r1',completedAt:'2026-09-16T12:00:00Z',resolutionOutcome:{kind:'obsolete'},observations:[{result:{data:{issueKey:'k',issueType:'noindex',sourceUrl:'https://example.com/a/'}}}]}]};
  const result=closuresFromAgentRuns(runs,[]);
  assert.equal(result.length,1); assert.equal(result[0].clientId,1); assert.equal(result[0].issueType,'noindex');
});

test('non migra run completate che non chiudono un problema', () => {
  assert.deepEqual(closuresFromAgentRuns({1:[{status:'COMPLETED',observations:[]}]},[]),[]);
});

test('migra run legacy usando goal e problemi correnti senza nuovo audit', () => {
  const runs={1:[{id:'legacy',completedAt:'2026-09-16T12:00:00Z',resolutionOutcome:{kind:'obsolete'},goal:'Analizza e aiutami a risolvere questo problema specifico: Pagina impostata noindex. URL: https://example.com/category/yoga/. Stato attuale: Aperto.'}]};
  const problems=[{key:'p1',issueType:'noindex',title:'Pagina impostata noindex',sourceUrl:'https://example.com/category/yoga/',targetUrls:[]}];
  const result=closuresFromAgentRuns(runs,[],problems);
  assert.equal(result.length,1); assert.equal(result[0].issueKey,'p1'); assert.equal(result[0].sourceUrl,'https://example.com/category/yoga/');
});


test('non migra run legacy ambigua tra due finding uguali sulla stessa URL', () => {
  const runs={1:[{id:'legacy-amb',completedAt:'2026-09-16T12:00:00Z',resolutionOutcome:{kind:'obsolete'},goal:'Analizza e aiutami a risolvere questo problema specifico: Link esterno non raggiungibile (404). URL: https://example.com/pagina/. Stato attuale: Aperto.'}]};
  const problems=[
    {key:'a',issueType:'broken-external-link',title:'Link esterno non raggiungibile (404)',sourceUrl:'https://example.com/pagina/',targetUrls:['https://a.example/manca']},
    {key:'b',issueType:'broken-external-link',title:'Link esterno non raggiungibile (404)',sourceUrl:'https://example.com/pagina/',targetUrls:['https://b.example/manca']},
  ];
  assert.deepEqual(closuresFromAgentRuns(runs,[],problems),[]);
});

test('non inventa una data di chiusura per run legacy senza timestamp', () => {
  const runs={1:[{id:'undated',resolutionOutcome:{kind:'obsolete'},observations:[{result:{data:{issueKey:'k',issueType:'noindex',sourceUrl:'https://example.com/a/'}}}]}]};
  assert.deepEqual(closuresFromAgentRuns(runs,[]),[]);
});
