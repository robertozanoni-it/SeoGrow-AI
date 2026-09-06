import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const script = await readFile(new URL("../scripts/wordpress-rankmath-doctor-convergence.mjs", import.meta.url), "utf8");
const modulePhp = await readFile(new URL("../wordpress-plugin/seogrow-connector/taxonomy-doctor-convergence.php", import.meta.url), "utf8");
const loader = await readFile(new URL("../wordpress-plugin/seogrow-connector/seogrow-connector.php", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/wordpress-staging-e2e.yml", import.meta.url), "utf8");

test("Connector carica il convergence engine v2 e non cancella il journal durante recovery apply", () => {
  assert.match(loader, /taxonomy-doctor-convergence\.php/);
  assert.match(modulePhp, /rankmath-doctor-convergence-20260906-v2/);
  assert.match(modulePhp, /journalRetainedUntilCrossRequestProof'\s*=>\s*true/);
  assert.match(modulePhp, /requiresCrossRequestFinalization'\s*=>\s*true/);
  const recoverStart = modulePhp.indexOf("function seogrow_connector_taxonomy_doctor_recover_v2_locked");
  const finalizeStart = modulePhp.indexOf("function seogrow_connector_taxonomy_doctor_finalize_recovery");
  const recoverBody = modulePhp.slice(recoverStart, finalizeStart);
  assert.doesNotMatch(recoverBody, /delete_option\s*\(/);
  assert.match(modulePhp.slice(finalizeStart), /delete_option\(\$key\)/);
});

test("Doctor richiede due campioni originali consecutivi prima della finalizzazione", () => {
  assert.match(script, /consecutive >= 2/);
  assert.match(script, /const delays = \[500, 1500, 4000\]/);
  const samples = script.indexOf("async function convergenceSamples");
  const finalize = script.indexOf("async function finalizeRecovery");
  assert.ok(samples >= 0 && finalize > samples);
  assert.match(script, /await finalizeRecovery\(proof\.state, original\)/);
});

test("Doctor limita recovery automatico a due pass e conserva journal sui loop", () => {
  assert.match(script, /for \(let pass = 1; pass <= 2; pass \+= 1\)/);
  assert.match(script, /RECOVERY_REVERTED_ONCE_RETRYING/);
  assert.match(script, /RECOVERY_REVERT_LOOP_DETECTED/);
  assert.match(script, /journal conservato/);
});

test("Doctor perde ownership se lo stato non è marker posseduto né originale atteso", () => {
  assert.match(script, /RECOVERY_OWNERSHIP_LOST/);
  assert.match(script, /exactMarkerBackend/);
  assert.match(script, /exactOriginal/);
});

test("workflow usa solo il convergence Doctor v2 per taxonomy-rank-math-doctor", () => {
  assert.match(workflow, /Rank Math Doctor v2 — diagnose, remediate, converge, verify/);
  assert.match(workflow, /node scripts\/wordpress-rankmath-doctor-convergence\.mjs/);
  assert.doesNotMatch(workflow, /run: node scripts\/wordpress-rankmath-doctor\.mjs/);
});
