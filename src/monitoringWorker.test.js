import test from "node:test";
import assert from "node:assert/strict";
import { createGuardianMonitoringWorker } from "./guardian/monitoringWorker.js";

test("monitoring worker exposes bounded lifecycle controls", () => {
  const worker = createGuardianMonitoringWorker({ dispatch: () => {}, now: () => Date.parse("2026-09-19T12:00:00Z") });
  assert.equal(typeof worker.start, "function");
  assert.equal(typeof worker.stop, "function");
  assert.equal(typeof worker.tick, "function");
  assert.equal(worker.inFlightCount(), 0);
});

test("worker interval has a 30 second safety floor", () => {
  const source = createGuardianMonitoringWorker.toString();
  assert.match(source, /Math\.max\(30_000, intervalMs\)/);
});
