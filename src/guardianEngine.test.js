import test from "node:test";
import assert from "node:assert/strict";
import { CANONICAL_SUITE_PAGES } from "./suite/productArchitecture.js";
import {
  GUARDIAN_ACTIONS,
  GUARDIAN_RISK,
  canGuardianAutoFix,
  guardianHealthScore,
  guardianRunHistory,
  recordGuardianRun,
  guardianFingerprint,
  listGuardianIncidents,
  normalizeGuardianPage,
  recordGuardianIncident,
  resolveGuardianIncident,
  selectedPageRepair,
} from "./guardian/guardianEngine.js";

class MemoryStorage {
  constructor() { this.rows = new Map(); }
  getItem(key) { return this.rows.has(key) ? this.rows.get(key) : null; }
  setItem(key, value) { this.rows.set(key, String(value)); }
  removeItem(key) { this.rows.delete(key); }
}

test("Guardian resta fuori dall'architettura congelata dei 14 moduli", () => {
  assert.equal(CANONICAL_SUITE_PAGES.length, 14);
  assert.equal(CANONICAL_SUITE_PAGES.includes("Guardian"), false);
  assert.equal(CANONICAL_SUITE_PAGES.includes("SeoGrow Guardian"), false);
});

test("Guardian normalizza solo viste legacy/alias e preserva le sottoviste operative", () => {
  assert.equal(normalizeGuardianPage("Storico"), "Centro progetto");
  assert.equal(normalizeGuardianPage("SeoGrow AI"), "SEO Agent");
  assert.equal(normalizeGuardianPage("Problemi"), "Problemi");
  assert.equal(selectedPageRepair("Audit SEO").changed, false);
  assert.deepEqual(selectedPageRepair("vista-impossibile"), {
    changed: true,
    from: "vista-impossibile",
    to: "Panoramica",
    reason: "invalid",
  });
});

test("il policy engine consente AutoFix solo su scope reversibili locali", () => {
  assert.equal(canGuardianAutoFix(GUARDIAN_ACTIONS.repairSelectedPage), true);
  assert.equal(canGuardianAutoFix(GUARDIAN_ACTIONS.reconcileTaskCauses), true);
  assert.equal(canGuardianAutoFix(GUARDIAN_ACTIONS.compactGuardianLedger), true);
  assert.equal(canGuardianAutoFix(GUARDIAN_ACTIONS.wordpressWrite), false);
  assert.equal(canGuardianAutoFix(GUARDIAN_ACTIONS.customerContentMutation), false);
  assert.equal(canGuardianAutoFix(GUARDIAN_ACTIONS.workspaceRestore), false);
  assert.equal(GUARDIAN_ACTIONS.wordpressWrite.risk, GUARDIAN_RISK.APPROVAL_REQUIRED);
});

test("incident ledger deduplica per fingerprint e conserva la verifica di chiusura", () => {
  const storage = new MemoryStorage();
  const input = {
    code: "TEST_DRIFT",
    source: "test",
    severity: "warning",
    risk: GUARDIAN_RISK.DIAGNOSE,
    message: "stesso problema",
  };
  const first = recordGuardianIncident(input, storage);
  const second = recordGuardianIncident(input, storage);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(listGuardianIncidents(storage).length, 1);
  assert.equal(listGuardianIncidents(storage)[0].occurrences, 2);

  const resolved = resolveGuardianIncident(first.fingerprint, "post-check PASS", storage);
  assert.equal(resolved.state, "resolved");
  assert.equal(resolved.verification, "post-check PASS");
  assert.equal(guardianHealthScore(listGuardianIncidents(storage)), 100);
});

test("fingerprint non dipende da timestamp o id runtime", () => {
  const a = guardianFingerprint({ code: "API", source: "local", message: "Health failed" });
  const b = guardianFingerprint({ code: "API", source: "local", message: "Health failed" });
  assert.equal(a, b);
});


test("run history persiste, resta limitata a 10 e restituisce prima il run più recente", () => {
  const storage = new MemoryStorage();
  for (let index = 0; index < 14; index += 1) {
    recordGuardianRun({
      trigger: "qa",
      startedAt: `2026-09-18T18:${String(index).padStart(2, "0")}:00.000Z`,
      completedAt: `2026-09-18T18:${String(index).padStart(2, "0")}:01.000Z`,
      checks: 4,
      failed: index === 13 ? 1 : 0,
      changed: 0,
    }, storage);
  }
  const history = guardianRunHistory(storage);
  assert.equal(history.length, 10);
  assert.equal(history[0].completedAt, "2026-09-18T18:13:01.000Z");
  assert.equal(history.at(-1).completedAt, "2026-09-18T18:04:01.000Z");

  // Simula reload: una nuova lettura dallo stesso storage deve conservare i run.
  const afterReload = guardianRunHistory(storage);
  assert.deepEqual(afterReload, history);
});
