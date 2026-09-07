import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentBudget, AgentPolicy, AgentMode, ToolRegistry, SeoAgentOrchestrator, createSeoGrowToolRegistry } from './agentRuntime.js';
const tool = (execute, extra = {}) => ({ name: 'probe', description: 'probe', inputSchema: {}, outputSchema: {}, source: 'LOCAL_DATA', cost: 'NONE', freshnessMs: 60000, risk: 'LOW', permission: 'READ', mutatesData: false, timeoutMs: 100, idempotent: true, supportsAbort: true, execute, ...extra });
const context = (extra = {}) => ({ runId: 'a', projectId: 1, budget: new AgentBudget(), policy: new AgentPolicy(), ...extra });
test('case-sensitive URL paths cannot share cached results', async () => {
 const registry = new ToolRegistry().register(tool(input => input));
 await registry.execute('probe', { url: 'https://example.com/Page' }, context());
 const second = await registry.execute('probe', { url: 'https://example.com/page' }, context());
 assert.equal(second.data.url, 'https://example.com/page');
});
test('READ_ONLY cannot be overridden by approvalGranted', async () => {
 let writes = 0; const registry = new ToolRegistry().register(tool(() => (++writes), { mutatesData: true }));
 await assert.rejects(registry.execute('probe', {}, context({ policy: new AgentPolicy(AgentMode.READ_ONLY), approvalGranted: true })), { code: 'PERMISSION_DENIED' });
 assert.equal(writes, 0);
});
test('unknown mode fails closed on writes', () => {
 assert.equal(new AgentPolicy('AUTONOMUS').check({ mutatesData: true, risk: 'LOW' }).allowed, false);
});
test('already cancelled requests never invoke a tool', async () => {
 let calls = 0; const registry = new ToolRegistry().register(tool(() => (++calls)));
 const controller = new AbortController(); controller.abort(Object.assign(new Error('cancelled'), { code: 'CANCELLED' }));
 await assert.rejects(registry.execute('probe', {}, context({ signal: controller.signal })), { code: 'CANCELLED' });
 assert.equal(calls, 0);
});
test('mutating tool cannot report success from a previous run cache', async () => {
 let calls = 0; const registry = new ToolRegistry().register(tool(() => (++calls), { mutatesData: true }));
 const policy = new AgentPolicy(AgentMode.AUTONOMOUS);
 await registry.execute('probe', {}, context({ policy }));
 await registry.execute('probe', {}, context({ runId: 'b', policy }));
 assert.equal(calls, 2);
});
test('run duration bounds a single long tool and propagates abort', async () => {
 let aborted = false;
 const registry = new ToolRegistry().register(tool((_input, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(signal.reason); })), { timeoutMs: 300 }));
 const planner = { plan: () => ({ workflow: 'CUSTOM', steps: [{ tool: 'probe', input: {}, required: true }] }) };
 const started = Date.now(); const run = await new SeoAgentOrchestrator({ registry, planner }).run('probe', { projectId: 1, budget: { maxDurationMs: 20, maxRetries: 0 } });
 assert.ok(Date.now() - started < 180); assert.equal(aborted, true); assert.notEqual(run.status, 'COMPLETED');
});
test('empty required rankings do not produce a completed Top 10 run', async () => {
 const run = await new SeoAgentOrchestrator({ registry: createSeoGrowToolRegistry() }).run('Top 10', { projectId: 1, dataset: { queries: [{ dimension: 'SEO', position: 14, impressions: 500, clicks: 2, ctr: 0.4 }] }, rankings: [] });
 assert.notEqual(run.status, 'COMPLETED');
});
test('latest ranking wins over older history for the same query', async () => {
 const run = await new SeoAgentOrchestrator({ registry: createSeoGrowToolRegistry() }).run('Top 10', { projectId: 1, dataset: { queries: [{ dimension: 'SEO', position: 14, impressions: 500, clicks: 2, ctr: 0.4 }] }, rankings: [{ checkedAt: '2026-09-06', rankings: [{ keyword: 'SEO', position: 12 }] }, { checkedAt: '2026-09-01', rankings: [{ keyword: 'SEO', position: 18 }] }] });
 assert.equal(run.recommendations[0].evidence.find(item => item.metric === 'position').value, 12);
});
