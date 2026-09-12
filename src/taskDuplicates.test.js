import test from 'node:test';
import assert from 'node:assert/strict';
import { archiveDuplicateTasks, sameTask } from './taskDuplicates.js';
import { findExistingTask } from './opportunityTasks.js';
import { reconcileAuditTasks } from './auditTaskReconciliation.js';
import { taskChange, undoTaskChange } from './productivity.js';
import { correctionPresentation } from './correctionPresentation.js';

const task = { id: 'old', sourceClientId: 1, kind: 'h1', title: '2 H1 rilevati', targetUrl: 'https://example.com/page/', status: 'Da fare', notes: 'Nota originale' };
test('same finding reuses active task across changed counts, URL storage and numeric client strings', () => {
  const values = { ...task, title: '3 H1 rilevati', sourceUrl: task.targetUrl, targetUrl: '' };
  assert.equal(findExistingTask([task], values, '1'), task);
  assert.equal(findExistingTask([task], values, 2), undefined);
  assert.equal(sameTask(task, { ...values, sourceUrl: 'https://example.com/other/' }), false);
  assert.equal(sameTask(task, { ...values, kind: 'content' }), false);
});
test('archive keeps work in progress, preserves every record and can be undone exactly', () => {
  const working = { ...task, id: 'working', status: 'In corso', notes: 'Lavoro in corso', due: '2026-10-01' };
  const other = { ...task, id: 'other', sourceClientId: 2 };
  const current = [task, working, other];
  const next = archiveDuplicateTasks(current, '1');
  assert.equal(next.length, current.length);
  assert.equal(next[0].duplicateOf, 'working');
  assert.equal(next[0].notes, task.notes);
  assert.equal(next[0].stale, true);
  assert.equal(next[1], working);
  assert.equal(next[2], other);
  assert.deepEqual(undoTaskChange(next, taskChange(current, next)), current);
  assert.equal(archiveDuplicateTasks(next, 1), next);
  const reconciled = reconcileAuditTasks(next, [{ ...task, id: 'new', detail: 'Nuovo audit' }], 1, '2026-09-09');
  assert.equal(reconciled.length, 3);
  assert.equal(reconciled[0], next[0]);
  assert.equal(reconciled[1].detail, 'Nuovo audit');
});
test('does not archive different link destinations, unknown resources, clients or ambiguous IDs', () => {
  const a = { ...task, kind: 'broken-link', sourceUrl: task.targetUrl, targetUrl: 'https://example.com/a' };
  assert.equal(sameTask(a, { ...a, targetUrl: 'https://example.com/b' }), false);
  assert.equal(sameTask({ ...task, targetUrl: '' }, { ...task, targetUrl: '' }), false);
  const ambiguous = [task, { ...task, sourceClientId: 2 }, { ...task, id: 'third' }];
  assert.equal(archiveDuplicateTasks(ambiguous, 1), ambiguous);
  const completed = [task, { ...task, id: 'completed', status: 'Completato' }];
  assert.equal(archiveDuplicateTasks(completed, 1), completed);
});
test('blocked proposals expose the actual cause and issue-specific next step', () => {
  const reason = 'Ownership frontend non determinabile per "h1". Gli H1 pubblici non coincidono. Nessuna modifica è stata autorizzata.';
  const h1 = correctionPresentation({ status: 'ownership_error', issue: { type: 'h1' }, reason });
  assert.equal(h1.title, 'Verifica origine H1 richiesta');
  assert.equal(h1.explanation, 'Gli H1 pubblici non coincidono.');
  assert.match(h1.next, /Verifica origine H1/);
  assert.match(h1.next, /coverage in sola lettura/);
  const content = correctionPresentation({ status: 'ownership_error', issue: { type: 'content' }, reason: 'Più widget candidati.' });
  assert.equal(content.explanation, 'Più widget candidati.');
  assert.match(content.next, /blocco di testo/);
});
test('OpenAI mancante è distinto da un problema non correggibile', () => {
  const openai = correctionPresentation({ status: 'generation_error', reason: 'OpenAI non è configurata. Inserisci OPENAI_API_KEY nel file .env.' });
  assert.equal(openai.title, 'Configurazione OpenAI mancante');
  assert.match(openai.next, /Configura OpenAI/);
  assert.match(openai.next, /riutilizzare in memoria/);
});
