import test from 'node:test';
import assert from 'node:assert/strict';
import { batchSummary } from './batchRemediationModel.js';

test('batch summary espone esiti operativi comprensibili', () => {
  const run={entries:[
    {state:'RESOLVED_VERIFIED',problemKeys:['a'],batchMode:'direct_preflight'},
    {state:'PREPARED',problemKeys:['b'],batchMode:'direct_preflight',preview:{data:{approvalToken:'x'},resourceIdentity:'p1'}},
    {state:'MANAGED_ASSISTED',problemKeys:['c'],batchMode:'assisted_task'},
  ]};
  const s=batchSummary(run);
  assert.equal(s.resolvedProblems,1); assert.equal(s.awaitingApproval,1); assert.equal(s.assistedPrepared,1); assert.equal(s.stillOpen,2);
});
