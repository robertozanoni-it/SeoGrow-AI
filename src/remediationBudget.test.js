import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { registerRoutes as seoRoutes } from '../server/wordpressSeoAdapterV2Hook.js';
import { registerRoutes as patchRoutes } from '../server/wordpressPatchV2Hook.js';
import { budgetedOpenAiFetch, readOpenAiUsage, reserveOpenAiBudget, settleOpenAiBudget, openAiReserved } from '../server/openAiBudget.js';
const routes = new Map();
seoRoutes({ post: (path, handler) => routes.set(path, handler) });
patchRoutes({ post: (path, handler) => routes.set(path, handler) });
function env(t, key, value) { const previous = process.env[key]; process.env[key] = value; t.after(() => { if (previous === undefined) delete process.env[key]; else process.env[key] = previous; }); }
function fixtureLedger(t) {
 let ledger;
 t.mock.method(fs, 'readFile', async () => { if (!ledger) throw Object.assign(new Error('missing'), { code: 'ENOENT' }); return ledger; });
 t.mock.method(fs, 'mkdir', async () => {});
 t.mock.method(fs, 'writeFile', async (_path, value) => { ledger = value; });
 t.mock.method(fs, 'rename', async () => {});
}
test('both remediation AI endpoints block before calling OpenAI when budget is exhausted', async t => {
 fixtureLedger(t); env(t, 'OPENAI_API_KEY', 'fixture-only'); env(t, 'OPENAI_MONTHLY_BUDGET_USD', '0.01');
 let calls = 0; t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json({}); });
 for (const [route, body] of [
  ['/api/wordpress/generate-seo-value-v2', { kind: 'seo_title', page: {} }],
  ['/api/wordpress/generate-patch-v2', { topic: 'Remediation WordPress title', context: JSON.stringify({ page: {}, issue: {} }) }],
 ]) {
  let status, payload; const res = { status(value) { status = value; return this; }, json(value) { payload = value; return this; } };
  await routes.get(route)({ body, ip: 'fixture-budget' }, res);
  assert.equal(status, 400); assert.match(payload.error, /Budget OpenAI/);
 }
 assert.equal(calls, 0);
});
test('remediation response usage updates the shared monthly cost ledger', async t => {
 fixtureLedger(t); env(t, 'OPENAI_MONTHLY_BUDGET_USD', '10'); env(t, 'OPENAI_INPUT_COST_PER_MILLION_USD', '0.25'); env(t, 'OPENAI_OUTPUT_COST_PER_MILLION_USD', '2');
 t.mock.method(globalThis, 'fetch', async () => Response.json({ usage: { input_tokens: 1000, output_tokens: 100 }, output_text: 'fixture' }));
 await budgetedOpenAiFetch('https://api.openai.com/v1/responses', { body: JSON.stringify({ max_output_tokens: 100 }) });
 const usage = await readOpenAiUsage(); assert.equal(usage.inputTokens, 1000); assert.equal(usage.outputTokens, 100); assert.equal(usage.cost, 0.00045);
});

test('ledger write failure does not release another in-flight reservation', async t => {
 fixtureLedger(t); env(t, 'OPENAI_MONTHLY_BUDGET_USD', '10');
 const otherReservation = await reserveOpenAiBudget();
 t.mock.method(globalThis, 'fetch', async () => Response.json({ usage: { input_tokens: 10, output_tokens: 10 } }));
 const failure = t.mock.method(fs, 'writeFile', async () => { throw new Error('disk full'); });
 try {
  await assert.rejects(budgetedOpenAiFetch('https://api.openai.com/v1/responses', { body: JSON.stringify({ max_output_tokens: 100 }) }), /disk full/);
  assert.equal(openAiReserved, otherReservation);
 } finally { failure.mock.restore(); await settleOpenAiBudget(otherReservation, {}); }
});
