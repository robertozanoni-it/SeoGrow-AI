import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAutoFixPlan, classifyAutoFix, selectedAutoFixIssues } from './autoFixPlan.js';
const siteUrl = 'https://example.com';
const audit = { analyzedAt: '2026-09-08T12:00:00Z', issues: Array.from({ length: 12 }, (_, i) => ({ type: 'title', label: `Title ${i}`, url: `${siteUrl}/${i}` })) };
const plan = () => buildAutoFixPlan({ clientId: 1, siteUrl, auditType: 'site', audit });
test('Auto Fix never labels SEO interventions automatic; sensitive and unknown changes stay manual', () => {
  for (const type of ['canonical', 'robots', 'noindex', 'redirect', 'sitemap', 'Elementor title', 'tassonomia', 'unknown', 'link rotto', 'alt text']) assert.equal(classifyAutoFix({ type }, siteUrl).level, 'manual', type);
  for (const type of ['title', 'meta description', 'h1', 'content']) assert.equal(classifyAutoFix({ type }, siteUrl).level, 'approval', type);
});
test('Auto Fix rejects external, credentialed, malformed and script targets', () => {
  for (const url of ['https://other.example/page', 'https://user:pass@example.com/', 'javascript:alert(1)', 'bad']) assert.equal(classifyAutoFix({ type: 'title', url }, siteUrl).level, 'manual');
});
test('Auto Fix rejects changed audit with same timestamp, missing audit and wrong project', () => {
  for (const context of [{clientId:2,audit},{clientId:1,audit:null},{clientId:1,audit:{...audit,issues:[]}}]) assert.throws(() => selectedAutoFixIssues(plan(), [0], context), /cambiati/);
});
test('Auto Fix selects exact entries; blocks overflow, duplicate, missing and noninteger indexes', () => {
  assert.deepEqual(selectedAutoFixIssues(plan(), [4, 2], {clientId:1,audit}), [audit.issues[4],audit.issues[2]]);
  for (const indexes of [[], Array.from({length:11},(_,i)=>i), [1,1], [99], ['1']]) assert.throws(() => selectedAutoFixIssues(plan(), indexes, {clientId:1,audit}));
  const changed = {...audit,issues:[{type:'canonical'}]};
  const p = buildAutoFixPlan({clientId:1,siteUrl,audit:changed});
  assert.throws(() => selectedAutoFixIssues(p,[0],{clientId:1,audit:changed}), /manuale/);
});
test('Internal diagnostics detect ambiguous IDs without deleting or merging task data', () => {
  const tasks = [{id:'same',sourceClientId:1},{id:'same',sourceClientId:1},{id:'same',sourceClientId:2},{id:'orphan',sourceClientId:3}];
  const before = JSON.stringify(tasks);
  const result = buildAutoFixPlan({clientId:1,siteUrl,audit,tasks,clients:[{id:1},{id:2}]});
  assert.deepEqual(result.diagnostics,{duplicateIds:1,orphanTasks:1});
  assert.equal(JSON.stringify(tasks),before);
});
