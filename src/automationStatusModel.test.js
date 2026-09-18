import test from "node:test";
import assert from "node:assert/strict";
import { automationStatusRows } from "./automationStatusModel.js";

test("status surface keeps the canonical six automation engines", () => {
  const rows = automationStatusRows({});
  assert.deepEqual(rows.map((row) => row.id), [
    "guardian", "data-freshness", "integration-health",
    "auto-remediation", "visual-ux", "capability-evolution",
  ]);
});

test("Guardian status exposes incidents, auto resolutions and last scan", () => {
  const rows = automationStatusRows({
    guardian: {
      installed: true,
      open: [{ source: "api" }],
      approvalRequired: [],
      autoResolved: [{ id: "r1" }, { id: "r2" }],
      lastScan: { completedAt: "2026-09-18T18:00:00.000Z" },
    },
    now: Date.parse("2026-09-18T18:01:00.000Z"),
  });
  const guardian = rows[0];
  assert.equal(guardian.state, "active");
  assert.equal(guardian.incidents, 1);
  assert.equal(guardian.autoResolved, 2);
  assert.equal(guardian.ageMs, 60_000);
});

test("orchestrator blocked state remains visible instead of being normalized away", () => {
  const rows = automationStatusRows({
    plan: { steps: [{ id: "integration-health", state: "blocked", reason: "Dipendenza fallita" }] },
  });
  const row = rows.find((item) => item.id === "integration-health");
  assert.equal(row.state, "blocked");
  assert.equal(row.reason, "Dipendenza fallita");
});
