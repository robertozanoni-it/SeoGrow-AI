import test from "node:test";
import assert from "node:assert/strict";
import { dueAudit, freshness, runScheduledAudit, auditChanges, normalizeMonitorRecords } from "./auditMonitoring.js";
const time = Date.parse("2026-09-08T12:00:00Z");
const client = { id: 1, url: "https://example.com/" };
const settings = { 1: { monitor: { enabled: true, hours: 24 } } };
const result = { url: client.url, issues: [], score: 100 };
function fixture(overrides = {}) {
  let state = { generation: "g1", clients: [client], settings, records: {} };
  let calls = 0;
  let saves = 0;
  return { deps: { now: () => time, locks: { request: async (_, __, fn) => fn({}) }, read: async () => state, save: async records => { saves++; state = { ...state, records }; }, transport: async (path, options) => { calls++; assert.equal(path, "/api/audit"); assert.deepEqual(JSON.parse(options.body), { url: client.url }); assert.equal(options.headers.authorization, undefined); return { ok: true, json: async () => result }; }, ...overrides }, calls: () => calls, saves: () => saves };
}
test("scheduler persists claim and does not repeat before interval", async () => { const f = fixture(); assert.equal((await runScheduledAudit(f.deps)).status, "success"); await runScheduledAudit(f.deps); assert.equal(f.calls(), 1); assert.equal(f.saves(), 2); });
test("scheduler fails closed without lock or durable claim", async () => { const noLock = fixture({ locks: null }); await runScheduledAudit(noLock.deps); assert.equal(noLock.calls(), 0); const denied = fixture({ locks: { request: async (_, __, fn) => fn(null) } }); await runScheduledAudit(denied.deps); assert.equal(denied.calls(), 0); const quota = fixture({ save: async () => { throw new Error("quota"); } }); await assert.rejects(runScheduledAudit(quota.deps)); assert.equal(quota.calls(), 0); });
test("scheduler honors cancellation and does not send writes to WordPress", async () => { const f = fixture({ signal: AbortSignal.abort() }); await runScheduledAudit(f.deps); assert.equal(f.calls(), 0); });
test("failed audit records failure without a false successful comparison", async () => { const f = fixture({ transport: async () => { throw new Error("network"); } }); const r = await runScheduledAudit(f.deps); assert.equal(r.status, "error"); assert.equal(r.changes, undefined); assert.equal(r.error, "network"); });
test("changed project or restored workspace discards response", async () => { let reads = 0; const f = fixture({ read: async () => ({ clients: [client], settings, records: {}, generation: ++reads === 1 ? "old" : "restored" }) }); assert.equal((await runScheduledAudit(f.deps)).skipped, true); assert.equal(f.saves(), 1); });
test("disabled, credentialed and future-dated schedules never run", () => { assert.equal(dueAudit([client], {}, {}, time), undefined); assert.equal(dueAudit([{ ...client, url: "https://user:pass@example.com" }], settings, {}, time), undefined); assert.equal(dueAudit([client], settings, { 1: { requestedUrl: client.url, lastAttemptAt: "2030-01-01" } }, time), undefined); });
test("freshness rejects future dates and comparisons require the same page", () => { assert.equal(freshness("2030-01-01", 7, time).state, "missing"); assert.equal(freshness("2026-09-01T12:00:00Z", 7, time).state, "stale"); assert.equal(auditChanges(result).baseline, true); assert.equal(auditChanges(result, { ...result, url: "https://other.com" }).baseline, true); const changes = auditChanges(result, { ...result, score: 95, issues: [{ label: "Missing title", severity: "alta" }] }); assert.equal(changes.resolved.length, 1); assert.equal(changes.scoreDelta, 5); });
test("restored monitor data cannot inject malformed history or changes", () => { const normalized = normalizeMonitorRecords({ 1: { requestedUrl: client.url, history: [null, {}], changes: "bad" }, x: {} }); assert.deepEqual(normalized[1].history, []); assert.equal(normalized[1].changes, undefined); assert.equal(normalized.x, undefined); });
