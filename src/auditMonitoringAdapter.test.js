import test from "node:test";
import assert from "node:assert/strict";
import { runGuardianAuditMonitoring } from "./guardian/auditMonitoringAdapter.js";

test("targeted Guardian monitoring reuses site-analysis with narrow scope", async () => {
  let request;
  const data = await runGuardianAuditMonitoring(
    { mode: "targeted-audit", sourceUrl: "https://example.com/page/", fingerprint: "x" },
    { fetchImpl: async (url, options) => { request = { url, options }; return { ok: true, json: async () => ({ analyzedAt: "2026-09-18T22:00:00Z" }) }; } },
  );
  assert.equal(request.url, "/api/site-analysis");
  const body = JSON.parse(request.options.body);
  assert.equal(body.url, "https://example.com/page/");
  assert.equal(body.maxPages, 5);
  assert.equal(body.monitoring.fingerprint, "x");
  assert.ok(data.analyzedAt);
});

test("full Guardian monitoring uses project URL and normal audit scope", async () => {
  let body;
  await runGuardianAuditMonitoring(
    { mode: "full-audit", fingerprint: "x" },
    { projectUrl: "https://example.com/", fetchImpl: async (_url, options) => { body = JSON.parse(options.body); return { ok: true, json: async () => ({}) }; } },
  );
  assert.equal(body.url, "https://example.com/");
  assert.equal(body.maxPages, 75);
});
