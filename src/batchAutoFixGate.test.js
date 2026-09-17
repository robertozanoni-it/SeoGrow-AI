import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Batch AutoFix UI exposes risk grouping, order, per-change rollback and final report fields', async () => {
  const [panel, model, queue] = await Promise.all([
    readFile(new URL('./BatchRemediationPanel.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./batchRemediationModel.js', import.meta.url), 'utf8'),
    readFile(new URL('./batchRemediationQueue.js', import.meta.url), 'utf8'),
  ]);
  assert.match(panel, /BATCH_RISK_LABELS/);
  assert.match(panel, /batch-risk-group/);
  assert.match(panel, /Ordine esecuzione/);
  assert.match(panel, /Apri rollback di questa modifica/);
  assert.match(panel, /writeCorrectionsWorkflowContext/);
  assert.match(panel, /Stop critico/);
  assert.match(model, /export function batchFinalReport/);
  assert.match(model, /rollbackAvailable/);
  assert.match(model, /riskGroups/);
  assert.match(queue, /criticalStop\(run, entry/);
  assert.match(queue, /run\.status = run\.criticalStop/);
});
