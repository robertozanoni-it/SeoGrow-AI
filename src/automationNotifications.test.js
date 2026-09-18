import test from "node:test";
import assert from "node:assert/strict";
import {
  guardianIncidentNotification,
  automationStepNotification,
  mergeAutomationNotifications,
} from "./automationNotifications.js";

test("Guardian critical incident routes to Problemi with a red notification", () => {
  const item = guardianIncidentNotification({
    id: "g1", fingerprint: "fp1", severity: "critical", state: "blocked",
    code: "ARCHITECTURE_DRIFT", message: "Architettura incoerente",
  });
  assert.equal(item.tone, "red");
  assert.equal(item.page, "Problemi");
  assert.equal(item.guardianIncidentId, "g1");
});

test("resolved Guardian incident is green and carries verification", () => {
  const item = guardianIncidentNotification({
    id: "g1", fingerprint: "fp1", severity: "warning", state: "resolved",
    message: "Vista non valida", verification: "Vista ripristinata e verificata.",
  });
  assert.equal(item.tone, "green");
  assert.match(item.text, /verificata/);
});

test("orchestrator circuit breaker produces actionable notification", () => {
  const item = automationStepNotification({
    id: "auto-remediation", state: "circuit_open", risk: "L2",
    reason: "Circuit breaker: automazione già fallita in questo run.",
  });
  assert.equal(item.tone, "red");
  assert.equal(item.source, "Automation Orchestrator");
});

test("merge deduplicates notifications by stable id", () => {
  const incident = { id: "g1", fingerprint: "fp1", severity: "error", state: "open", message: "Errore" };
  const merged = mergeAutomationNotifications([], [incident, incident], []);
  assert.equal(merged.length, 1);
});


test("notification lifecycle changes stable id after verified resolution", () => {
  const open = guardianIncidentNotification({
    id: "g2", fingerprint: "same-fingerprint", severity: "critical", state: "blocked",
    message: "Scrittura workspace fallita",
  });
  const resolved = guardianIncidentNotification({
    id: "g2", fingerprint: "same-fingerprint", severity: "critical", state: "resolved",
    message: "Scrittura workspace fallita", verification: "Workspace nuovamente scrivibile.",
  });
  assert.equal(open.id, "guardian:same-fingerprint:open");
  assert.equal(resolved.id, "guardian:same-fingerprint:resolved");
  assert.equal(resolved.tone, "green");
  assert.equal(open.page, "Problemi");
  assert.equal(resolved.page, "Problemi");
});

test("integration health orchestrator event routes to Integrazioni", () => {
  const item = automationStepNotification({
    id: "integration-health", state: "blocked", risk: "L0",
    reason: "Integrazione non disponibile.",
  });
  assert.equal(item.page, "Integrazioni");
  assert.equal(item.tone, "red");
});
