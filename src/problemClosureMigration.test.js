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
