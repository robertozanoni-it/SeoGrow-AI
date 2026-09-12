import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./elementorImpactClient.js", import.meta.url), "utf8");

test("il client non tronca le URL prima del backend", () => {
  assert.match(source, /let effectiveCandidateUrls = Array\.isArray\(candidateUrls\) \? candidateUrls : \[\]/);
  assert.match(source, /candidateUrls:\s*effectiveCandidateUrls/);
  assert.doesNotMatch(source, /candidateUrls\.slice\(0,\s*30\)/);
});

test("il client trasmette coverageProof separato dalle URL", () => {
  assert.match(source, /coverageProof:\s*normalizeCoverageProofForRequest\(effectiveCoverageProof\)/);
  assert.match(source, /source:\s*"manual-candidate-set"/);
  assert.match(source, /verified:\s*coverageProof\.verified\s*===\s*true/);
  assert.match(source, /provenanceId/);
});

test("senza proof esplicita il client tenta attestazione server e usa solo una provenance verificata", () => {
  assert.match(source, /\/api\/wordpress\/elementor-coverage-attest/);
  assert.match(source, /if \(!response\.ok \|\| data\?\.verified !== true\) \{/);
  assert.match(source, /verified:\s*false/);
  assert.match(source, /coverageProof:\s*null/);
  assert.match(source, /if \(diagnostic\?\.verified !== true\) return null/);
  assert.match(source, /source:\s*"verified-complete-crawl"/);
  assert.match(source, /totalUrls !== candidateUrls\.length/);
  assert.match(source, /effectiveCandidateUrls = attested\.candidateUrls/);
  assert.match(source, /effectiveCoverageProof = attested\.coverageProof/);
});

test("diagnostica forzata invalida solo la cache coverage e resta read-only", () => {
  assert.match(source, /if \(force\) coverageAttestationCache\.delete\(key\)/);
  assert.match(source, /export async function inspectElementorCoverageAttestation/);
  assert.match(source, /sharedWriteAllowed:\s*false/);
  assert.doesNotMatch(source, /sharedWriteAllowed:\s*true/);
});

test("attestazione non disponibile ricade sul set diagnostico esistente", () => {
  assert.match(source, /if \(!effectiveCoverageProof\)/);
  assert.match(source, /if \(attested\)/);
  assert.match(source, /return null;/);
  assert.match(source, /manual-candidate-set/);
});

test("template e global widget attivano la scansione cross-page nel live client", () => {
  assert.match(source, /\/api\/wordpress\/elementor-reference-impact/);
  assert.match(source, /documents\.some\(\(document\) => \["template", "widget"\]\.includes\(document\.type\)\)/);
  assert.match(source, /crossPageReferenceImpact/);
  assert.match(source, /requestElementorReferenceImpact/);
});

test("cross-page client accetta verified solo con scan completa e target referenziati verificati", () => {
  assert.match(source, /const targetVerified = data\?\.referenceTargets\?\.verified === true/);
  assert.match(source, /const complete = data\?\.impact\?\.complete === true/);
  assert.match(source, /verified: data\.verified === true && complete && targetVerified/);
  assert.match(source, /affectedPagesEnumerated: data\.affectedPagesEnumerated === true && complete && targetVerified/);
});

test("la provenance client e il cross-page impact non possono abilitare scritture condivise", () => {
  assert.match(source, /sharedWriteAllowed:\s*false/);
  assert.doesNotMatch(source, /sharedWriteAllowed:\s*coverageProof/);
  assert.doesNotMatch(source, /sharedWriteAllowed:\s*data/);
  assert.doesNotMatch(source, /sharedWriteAllowed:\s*crossPage/);
});
