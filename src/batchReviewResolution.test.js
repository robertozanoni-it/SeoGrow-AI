import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { batchCapability, batchSummary, createBatchRun } from './batchRemediationModel.js';
import { prepareBatch } from './batchRemediationQueue.js';

const base = (issueType, extra = {}) => ({
  key: `${issueType}::https://example.com/pagina/`,
  title: issueType === 'url-alias' ? 'Due URL dello stesso contenuto WordPress' : issueType === 'canonical-different' ? 'Canonical differente dall’URL analizzato' : 'Meta description larga nello snippet: circa 960px / 920px',
  issueType,
  sourceUrl: 'https://example.com/pagina/',
  correctability: 'not_supported',
  problemState: 'needs_verification',
  interventionState: 'not_prepared',
  reviewOnly: true,
  pageKind: 'content',
  ...extra,
});

const runFor = problems => createBatchRun({ id: 'review', clientId: 1, siteUrl: 'https://example.com/', clientName: 'Fixture', problems });

test('canonical, SERP width e URL alias entrano nel preflight batch sicuro', () => {
  const canonical = batchCapability(base('canonical-different'));
  const serp = batchCapability(base('description-serp-width'));
  const alias = batchCapability(base('url-alias'));
  assert.equal(canonical.state, 'PENDING');
  assert.equal(canonical.kind, 'canonical');
  assert.equal(serp.state, 'PENDING');
  assert.equal(serp.kind, 'meta_description');
  assert.equal(alias.state, 'PENDING');
  assert.equal(alias.kind, 'url_alias');
});

test('alias verificato in sola lettura chiude il batch senza operazioni WordPress', async () => {
  const run = runFor([base('url-alias')]);
  let recorded = 0;
  const ports = {
    save: async () => {},
    progress: () => {},
    assertContext: async () => {},
    stopped: () => false,
    preparationKey: () => 'alias',
    prepare: async () => ({
      alreadyResolved: true,
      verifiedResolution: true,
      reason: 'Alias WordPress verificato: nessuna scrittura necessaria.',
      evidence: { sourceId: 42, canonicalId: 42 },
    }),
    recordNoWriteResolution: async () => { recorded += 1; return { id: 'read-only', status: 'Verificato' }; },
  };
  await prepareBatch(run, ports);
  assert.equal(recorded, 1);
  assert.equal(run.entries[0].state, 'RESOLVED_VERIFIED');
  assert.equal(run.status, 'SUCCESS');
  const summary = batchSummary(run);
  assert.equal(summary.operations, 0);
  assert.equal(summary.pagesModified, 0);
  assert.equal(summary.resolvedProblems, 1);
});

test('runtime seleziona i review item e mantiene canonical come modifica ad approvazione esplicita', async () => {
  const runtime = await readFile(new URL('./batchRemediationRuntime.js', import.meta.url), 'utf8');
  const queue = await readFile(new URL('./batchRemediationQueue.js', import.meta.url), 'utf8');
  assert.match(runtime, /controlledReviewPreview: reviewOnly/);
  assert.match(runtime, /readOnlyCanonicalCheck/);
  assert.match(runtime, /entry\.kind === 'url_alias'/);
  assert.match(runtime, /saveCorrection\(record\)/);
  assert.match(queue, /verifiedResolution === true/);
  assert.match(queue, /'canonical', 'noindex', 'external_link', 'content', 'h1'/);
});
