import test from "node:test";
import assert from "node:assert/strict";
import { dueMonitoringIncidents, monitoringPlan, MONITORING_CADENCE } from "./guardian/monitoringScheduler.js";

test("regression and flapping receive critical monitoring cadence", () => {
  for (const kind of ["regression", "flapping"]) {
    const plan = monitoringPlan({ incident: { fingerprint: "x", recurrence: { kind, autoFixAllowed: false }, lastSeenAt: "2026-09-18T10:00:00Z" } });
    assert.equal(plan.intervalMs, MONITORING_CADENCE.CRITICAL);
    assert.equal(plan.autoFixAllowed, false);
  }
});

test("flapping requests full audit while ordinary incidents stay targeted", () => {
  assert.equal(monitoringPlan({ incident: { fingerprint: "x", recurrence: { kind: "flapping" } } }).fullAuditRequired, true);
  assert.equal(monitoringPlan({ incident: { fingerprint: "y", recurrence: { kind: "persistent" } } }).fullAuditRequired, false);
});

test("due list deduplicates same client and canonical fingerprint", () => {
  const now = Date.parse("2026-09-19T12:00:00Z");
  const incidents = [
    { clientId: 1, fingerprint: "x", severity: "warning", lastSeenAt: "2026-09-17T10:00:00Z" },
    { clientId: 1, fingerprint: "x", severity: "warning", lastSeenAt: "2026-09-17T11:00:00Z" },
    { clientId: 2, fingerprint: "x", severity: "warning", lastSeenAt: "2026-09-17T10:00:00Z" },
  ];
  assert.equal(dueMonitoringIncidents(incidents, now).length, 2);
});
