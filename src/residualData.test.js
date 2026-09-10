import test from 'node:test';
import assert from 'node:assert/strict';
import { analysisDiff } from './platform.js';
import { readWorkspaceBackup } from './seoHelpers.js';
import { reconcileAuditTasks } from './auditTaskReconciliation.js';
const url = 'https://example.com/page';
const issue = { type: 'title', url, label: 'Title mancante' };
test('unvisited pages cannot be declared resolved by a smaller crawl', () => {
 const diff = analysisDiff({ issues: [], pages: [{ url: 'https://example.com/', status: 200 }], limits: { truncatedPages: true } }, { issues: [issue] });
 assert.equal(diff.resolvedIssues.length, 0);
});
test('changed issue label is not a resolution of the same issue family', () => {
 const diff = analysisDiff({ issues: [{ ...issue, label: 'Title di 5 caratteri' }], pages: [{ url, status: 200, title: 'short' }] }, { issues: [issue] });
 assert.equal(diff.resolvedIssues.length, 0);
});
test('review-only classification is not a resolved finding', () => {
 const diff = analysisDiff({ issues: [], reviewItems: [issue], pages: [{ url, status: 200, title: 'OK title' }] }, { issues: [issue] });
 assert.equal(diff.resolvedIssues.length, 0);
});
test('audited healthy title can be reported resolved', () => {
 assert.equal(analysisDiff({ issues: [], pages: [{ url, status: 200, title: 'Un titolo corretto e sufficientemente lungo', titleLength: 42 }] }, { issues: [issue] }).resolvedIssues.length, 1);
});
test('audit task reconciliation preserves work, isolates clients and reopens regressions', () => {
 const generated = [{ id: 'analysis-new', sourceClientId: 1, kind: 'title', title: 'Title di 5 caratteri', targetUrl: url, detail: 'new evidence' }];
 const previous = { ...generated[0], id: 'analysis-old', title: 'Title mancante', status: 'In corso', notes: 'work', due: '2026-10-01' };
 const other = { ...previous, id: 'other', sourceClientId: 2 };
 const retained = reconcileAuditTasks([previous, other], generated, 1, '2026-09-06');
 assert.equal(retained.length, 2); assert.equal(retained[0].status, 'In corso'); assert.equal(retained[0].notes, 'work'); assert.equal(retained[0].id, 'analysis-old'); assert.equal(retained[0].sourceUrl, url); assert.equal(retained[0].targetUrl, ''); assert.equal(retained[0].linkLabel, 'Apri pagina'); assert.deepEqual(retained[1], other);
 const reopened = reconcileAuditTasks([{ ...previous, status: 'Completato' }], generated, 1, '2026-09-06');
 assert.equal(reopened.length, 1); assert.equal(reopened[0].status, 'Da fare'); assert.equal(reopened[0].regression, true);
 assert.deepEqual(reconcileAuditTasks([previous], [], 1, '2026-09-06'), [previous]);
});
test('broken-link task keeps source page separate from broken destination', () => {
 const sourceUrl = 'https://example.com/articolo/';
 const targetUrl = 'https://example.com/manca/';
 const [task] = reconcileAuditTasks([], [{ id: 'broken', sourceClientId: 1, kind: 'broken-link', title: 'Link interno interrotto', sourceUrl, targetUrl, detail: 'HTTP 404' }], 1, '2026-09-06');
 assert.equal(task.sourceUrl, sourceUrl);
 assert.equal(task.targetUrl, targetUrl);
 assert.equal(task.linkLabel, 'Apri destinazione');
});
const backup = corrections => ({ schemaVersion: 4, clients: [{ id: 1, name: 'Fixture', url: 'https://example.com/' }], tasks: [], gscData: {}, corrections });
const file = data => ({ size: 100, text: async () => JSON.stringify(data) });
test('reading a backup is read-only even when it contains corrections', async () => {
 const data = backup([]);
 assert.deepEqual(await readWorkspaceBackup(file(data)), data);
});
test('backup accepts actual SEO metadata and taxonomy snapshot fields', async () => {
 const record = { id: 'correction', batchId: 'batch', clientId: 1, issueLabel: 'Metadata', sourceUrl: url, fields: ['meta.rank_math_description'], before: { 'meta.rank_math_description': 'before' }, after: { 'meta.rank_math_description': 'after' } };
 assert.equal((await readWorkspaceBackup(file(backup([record])))).corrections.length, 1);
 const taxonomy = { ...record, resource: 'taxonomy', fields: ['meta_description'], before: { meta_description: 'before' }, after: { meta_description: 'after' } };
 assert.equal((await readWorkspaceBackup(file(backup([taxonomy])))).corrections.length, 1);
});
