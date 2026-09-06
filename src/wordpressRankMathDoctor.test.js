import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/wordpress-staging-e2e.yml", import.meta.url), "utf8");
const doctor = await readFile(new URL("../scripts/wordpress-rankmath-doctor-convergence.mjs", import.meta.url), "utf8");
const loader = await readFile(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");
const doctorState = await readFile(new URL("../wordpress-plugin/seogrow-connector/taxonomy-doctor-state.php", import.meta.url), "utf8");
const convergence = await readFile(new URL("../wordpress-plugin/seogrow-connector/taxonomy-doctor-convergence.php", import.meta.url), "utf8");

test("workflow espone Rank Math Doctor v2 e ritira i live marker E2E Rank Math dal menu", () => {
  assert.match(workflow, /taxonomy-rank-math-doctor/);
  assert.match(workflow, /wordpress-rankmath-doctor-convergence\.mjs/);
  assert.match(workflow, /Rank Math Doctor v2 — diagnose, remediate, converge, verify/);
  assert.doesNotMatch(workflow, /- taxonomy-rank-math-general\n/);
  assert.doesNotMatch(workflow, /- taxonomy-rank-math\n/);
  assert.doesNotMatch(workflow, /Taxonomy Rank Math E2E/);
});

test("Doctor v2 non genera marker E2E nuovi sulle tassonomie reali", () => {
  assert.match(doctor, /realSeoMarkerWritesAllowed !== false/);
  assert.match(doctor, /Nessun marker E2E nuovo viene scritto/);
  assert.doesNotMatch(doctor, /`SeoGrow E2E \$\{/);
  assert.doesNotMatch(doctor, /wordpress-taxonomy-e2e\.mjs/);
});

test("Doctor v2 implementa retry rete, diagnosi multilivello e remediation deterministiche", () => {
  assert.match(doctor, /UND_ERR_CONNECT_TIMEOUT/);
  assert.match(doctor, /taxonomy-diagnostics/);
  assert.match(doctor, /taxonomy-doctor-state/);
  assert.match(doctor, /taxonomy-doctor-refresh-cache/);
  assert.match(doctor, /taxonomy-doctor-dedupe/);
  assert.match(doctor, /taxonomy-doctor-recover-v2/);
  assert.match(doctor, /taxonomy-doctor-finalize-recovery/);
  assert.match(doctor, /RECOVERY_REVERT_LOOP_DETECTED/);
  assert.match(doctor, /RECOVERY_OWNERSHIP_LOST/);
  assert.match(doctor, /BACKEND_DIVERGENCE_PERSISTS/);
});

test("Connector Doctor conserva LKG e auto-ripara solo duplicati identici con stale check", () => {
  assert.match(loader, /taxonomy-doctor-state\.php/);
  assert.match(loader, /taxonomy-doctor-convergence\.php/);
  assert.match(doctorState, /rankmath-doctor-20260906-v1/);
  assert.match(convergence, /rankmath-doctor-convergence-20260906-v2/);
  assert.match(doctorState, /realSeoMarkerWritesAllowed'\s*=>\s*false/);
  assert.match(doctorState, /taxonomy-doctor-observe/);
  assert.match(doctorState, /taxonomy-doctor-refresh-cache/);
  assert.match(doctorState, /taxonomy-doctor-dedupe/);
  assert.match(doctorState, /seogrow_doctor_dedupe_ambiguous/);
  assert.match(doctorState, /foreach \(\$state\['rows'\] as \$row\)/);
  assert.match(doctorState, /\$state\['api'\] !== \$expected/);
});

test("LKG non può registrare marker e recovery v2 preferisce journal/LKG/bootstrap", () => {
  assert.match(doctorState, /seogrow_connector_taxonomy_recovery_marker_valid\(\$expected_current\)/);
  const journal = convergence.indexOf("RECOVERY_JOURNAL");
  const lkg = convergence.indexOf("LAST_KNOWN_GOOD");
  const legacy = convergence.indexOf("LEGACY_BOOTSTRAP_INPUT");
  assert.ok(journal >= 0 && lkg > journal && legacy > lkg);
});
