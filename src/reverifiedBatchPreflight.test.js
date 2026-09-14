import test from 'node:test';
import assert from 'node:assert/strict';
import { batchCapability, createBatchRun } from './batchRemediationModel.js';

const base = {
  key: 'finding-1',
  title: 'Canonical differente dall’URL analizzato',
  issueType: 'canonical-different',
  sourceUrl: 'https://example.com/page/',
  correctability: 'not_supported',
  pageKind: 'content',
  interventionState: 'verified',
};

test('verified review finding reobserved by a newer audit re-enters batch preflight', () => {
  for (const problemState of ['needs_verification', 'reappeared']) {
    const capability = batchCapability({ ...base, problemState });
    assert.equal(capability.state, 'PENDING');
    assert.equal(capability.kind, 'canonical');
  }
});

test('verified url alias reobserved by audit is eligible for read-only batch verification', () => {
  const capability = batchCapability({
    ...base,
    issueType: 'url-alias',
    title: 'Due URL dello stesso contenuto WordPress',
    problemState: 'needs_verification',
  });
  assert.equal(capability.state, 'PENDING');
  assert.equal(capability.kind, 'url_alias');
});

test('verified confirmed issue can also receive a fresh preflight after regression', () => {
  const capability = batchCapability({
    ...base,
    issueType: 'title',
    title: 'Title troppo lungo',
    correctability: 'automatic',
    problemState: 'reappeared',
  });
  assert.equal(capability.state, 'PENDING');
  assert.equal(capability.kind, 'title');
});

test('verified finding without a newer observation stays blocked and applied writes stay blocked', () => {
  assert.equal(batchCapability({ ...base, problemState: 'open' }).state, 'BLOCKED');
  assert.equal(batchCapability({ ...base, problemState: 'needs_verification', interventionState: 'applied' }).state, 'BLOCKED');
});

test('batch run starts reobserved verified canonical in PENDING instead of BLOCKED', () => {
  const run = createBatchRun({
    id: 'recheck',
    clientId: 1,
    clientName: 'Fixture',
    siteUrl: 'https://example.com/',
    problems: [{ ...base, problemState: 'needs_verification' }],
  });
  assert.equal(run.entries[0].state, 'PENDING');
});
