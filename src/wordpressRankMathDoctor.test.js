import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflow = await readFile(new URL("../.github/workflows/wordpress-staging-e2e.yml", import.meta.url), "utf8");
const doctor = await readFile(new URL("../scripts/wordpress-rankmath-doctor.mjs", import.meta.url), "utf8");
const loader = await readFile(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");
const doctorState = await readFile(new URL("../wordpress-plugin/seogrow-connector/taxonomy-doctor-state.php", import.meta.url), "utf8");

test("workflow espone Rank Math Doctor e ritira i live marker E2E Rank Math dal menu", () => {
  assert.match(workflow, /taxonomy-rank-math-doctor/);
  assert.match(workflow, /wordpress-rankmath-doctor\.mjs/);
  assert.doesNotMatch(workflow, /- taxonomy-rank-math-general\n/);
  assert.doesNotMatch(workflow, /- taxonomy-rank-math\n/);
  assert.doesNotMatch(workflow, /Taxonomy Rank Math E2E/);
});

test("Doctor non genera marker E2E nuovi sulle tassonomie reali", () => {
  assert.match(doctor, /realSeoMarkerWritesAllowed !== false/);
  assert.match(doctor, /non genera né scrive marker E2E nuovi/);
  assert.doesNotMatch(doctor, /`SeoGrow E2E \$\{/);
  assert.doesNotMatch(doctor, /wordpress-taxonomy-e2e\.mjs/);
});

test("Doctor implementa retry rete, diagnosi multilivello e remediation deterministiche", () => {
  assert.match(doctor, /UND_ERR_CONNECT_TIMEOUT/);
  assert.match(doctor, /taxonomy-diagnostics/);
  assert.match(doctor, /taxonomy-doctor-state/);
  assert.match(doctor, /taxonomy-doctor-refresh-cache/);
  assert.match(doctor, /taxonomy-doctor-dedupe/);
  assert.match(doctor, /taxonomy-recovery-execute/);
  assert.match(doctor, /LAST_KNOWN_GOOD_RECORDED/);
  assert.match(doctor, /RECOVERY_JOURNAL/);
  assert.match(doctor, /LAST_KNOWN_GOOD/);
  assert.match(doctor, /LEGACY_BOOTSTRAP_INPUT/);
  assert.match(doctor, /DUPLICATE_ROWS_AMBIGUOUS/);
  assert.match(doctor, /BACKEND_DIVERGENCE_PERSISTS/);
});

test("Connector Doctor conserva LKG e auto-ripara solo duplicati identici con stale check", () => {
  assert.match(loader, /taxonomy-doctor-state\.php/);
  assert.match(doctorState, /rankmath-doctor-20260906-v1/);
  assert.match(doctorState, /realSeoMarkerWritesAllowed'\s*=>\s*false/);
  assert.match(doctorState, /taxonomy-doctor-observe/);
  assert.match(doctorState, /taxonomy-doctor-refresh-cache/);
  assert.match(doctorState, /taxonomy-doctor-dedupe/);
  assert.match(doctorState, /seogrow_doctor_dedupe_ambiguous/);
  assert.match(doctorState, /foreach \(\$state\['rows'\] as \$row\)/);
  assert.match(doctorState, /\$state\['api'\] !== \$expected/);
});

test("LKG non può registrare marker e recovery future preferisce journal/LKG", () => {
  assert.match(doctorState, /seogrow_connector_taxonomy_recovery_marker_valid\(\$expected_current\)/);
  const journal = doctor.indexOf('source = "RECOVERY_JOURNAL"');
  const lkg = doctor.indexOf('source = "LAST_KNOWN_GOOD"');
  const legacy = doctor.indexOf('source = "LEGACY_BOOTSTRAP_INPUT"');
  assert.ok(journal >= 0 && lkg > journal && legacy > lkg);
});
