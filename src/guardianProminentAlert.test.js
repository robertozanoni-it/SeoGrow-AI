import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { nextGuardianProminentAlert } from "./guardian/guardianProminentAlert.js";

const incident = (fingerprint, severity = "warning", message = "Anomalia") => ({
  id: `guardian-${fingerprint}`,
  fingerprint,
  state: "open",
  severity,
  message,
  clientId: 1,
  lastSeenAt: "2026-09-19T12:00:00Z",
});

test("Guardian prominent alert compare una sola volta per incidente aperto", () => {
  const seen = new Set();
  const snapshot = { open: [incident("a")] };
  const first = nextGuardianProminentAlert(snapshot, seen);
  const second = nextGuardianProminentAlert(snapshot, seen);
  assert.equal(first.count, 1);
  assert.equal(first.title, "Guardian ha rilevato 1 anomalia");
  assert.equal(second, null);
});

test("Guardian prominent alert riappare se lo stesso incidente viene risolto e poi ricompare", () => {
  const seen = new Set();
  assert.ok(nextGuardianProminentAlert({ open: [incident("a")] }, seen));
  assert.equal(nextGuardianProminentAlert({ open: [] }, seen), null);
  assert.ok(nextGuardianProminentAlert({ open: [incident("a")] }, seen));
});

test("Guardian prominent alert aggrega più nuove anomalie e privilegia la più grave", () => {
  const seen = new Set();
  const alert = nextGuardianProminentAlert({
    open: [
      incident("warning", "warning", "Warning"),
      incident("error", "error", "Errore importante"),
    ],
  }, seen);
  assert.equal(alert.count, 2);
  assert.equal(alert.kind, "error");
  assert.equal(alert.fingerprint, "error");
  assert.match(alert.title, /2 anomalie/);
  assert.match(alert.message, /Errore importante/);
  assert.match(alert.message, /\+1 altra/);
});

test("bridge e App espongono popup Guardian con CTA Vai al problema", async () => {
  const bridge = await readFile(new URL("./AutomationNotificationBridge.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("./App.jsx", import.meta.url), "utf8");
  assert.match(bridge, /seogrow-guardian-prominent-alert/);
  assert.match(bridge, /nextGuardianProminentAlert/);
  assert.match(app, /seogrow-guardian-prominent-alert/);
  assert.match(app, /actionLabel:\s*"Vai al problema"/);
  assert.match(app, /setPage\("Problemi"\)/);
  assert.match(app, /seogrow-guardian-open-incident/);
});
