import test from 'node:test';
import assert from 'node:assert/strict';
import { completeVerifiedCanonicals, activeClientTasks } from './taskReview.js';
import { sameTask, archiveDuplicateTasks } from './taskDuplicates.js';
import { confirmedSlashAlias } from './taskUrlEvidence.js';
import { canonicalCount } from '../server/frontendVerificationHook.js';
import { reconcileAuditTasks } from './auditTaskReconciliation.js';
import { taskChange, undoTaskChange } from './productivity.js';

const url = 'https://example.com/category/yoga/';
const task = { id: 'a', sourceClientId: 4, kind: 'canonical', title: 'Canonical non rilevata', targetUrl: url, status: 'In corso', notes: 'Da conservare', due: '2026-10-01' };
const result = { ok: true, status: 200, isHtml: true, url, canonical: url, canonicalCount: 1 };

test('completes only verified missing canonicals for the selected project, supports undo and recurrence', () => {
  const rows = [task, { ...task, id: 'other', sourceClientId: 5 }, { ...task, id: 'robots', kind: 'indexability' }];
  const next = completeVerifiedCanonicals(rows, 4, new Map([[url, result]]), '2026-09-09');
  assert.equal(next[0].status, 'Completato');
  assert.equal(next[0].notes, task.notes);
  assert.equal(next[0].due, task.due);
  assert.equal(next[1], rows[1]); assert.equal(next[2], rows[2]);
  assert.deepEqual(undoTaskChange(next, taskChange(rows, next)), rows);
  const regression = reconcileAuditTasks(next, [{ ...task, id: 'fresh' }], 4, '2026-09-10');
  assert.equal(regression.length, 3); assert.equal(regression[0].status, 'Da fare');
  assert.equal(regression[0].completionReason, '');
  assert.deepEqual(activeClientTasks(rows, null), []);
});

test('failed, ambiguous, redirected, missing or cross-page canonical evidence never completes a task', () => {
  const rows = [task];
  for (const delta of [{ status: 403 }, { status: 404 }, { ok: false }, { isHtml: false }, { canonicalCount: 0 }, { canonicalCount: 2 }, { canonicalCount: undefined }, { url: `${url}2/` }, { canonical: 'https://example.com/' }]) {
    assert.equal(completeVerifiedCanonicals(rows, 4, new Map([[url, { ...result, ...delta }]]), 'now'), rows);
  }
  assert.equal(completeVerifiedCanonicals(rows, 4, new Map(), 'now'), rows);
  const ambiguous = [task, { ...task }];
  assert.equal(completeVerifiedCanonicals(ambiguous, 4, new Map([[url, result]]), 'now'), ambiguous);
});

test('paginated pages remain distinct even with identical metadata and WordPress ID', () => {
  const pair = ['https://example.com/yoga-blog/', 'https://example.com/yoga-blog/2/'];
  const results = pair.map(url => ({ ...result, url, canonical: pair[0], wordpressDocumentId: 587 }));
  assert.equal(confirmedSlashAlias(pair, results), false);
  for (const kind of ['duplicate-title', 'duplicate-description', 'canonical-different', 'thin', 'h1']) {
    const rows = pair.map((targetUrl, i) => ({ ...task, id: String(i), kind, targetUrl }));
    assert.equal(archiveDuplicateTasks(rows, 4), rows);
    assert.equal(sameTask(rows[0], { ...rows[0], title: 'Nuovo conteggio', sourceUrl: pair[0], targetUrl: '' }), true);
  }
  const a = { ...task, kind: 'broken-external-link', sourceUrl: url, targetUrl: 'https://external.example/a' };
  assert.equal(sameTask(a, { ...a, targetUrl: 'https://external.example/b' }), false);
});

test('canonical count excludes scripts, comments and body markup but detects duplicate head tags', () => {
  const tag = `<link href="${url}" rel="canonical">`;
  assert.equal(canonicalCount(`<head>${tag}<!--${tag}--><script>${tag}</script></head><body>${tag}</body>`), 1);
  assert.equal(canonicalCount(`<head>${tag}${tag}</head>`), 2);
  assert.equal(canonicalCount(`<body>${tag}</body>`), 0);
});
