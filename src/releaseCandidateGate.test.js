import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const releaseGate = await readFile(new URL("../.github/workflows/release-gate.yml", import.meta.url), "utf8");
const liveGate = await readFile(new URL("../.github/workflows/rc-live-gate.yml", import.meta.url), "utf8");
const performanceGate = await readFile(new URL("../scripts/rc-performance-gate.mjs", import.meta.url), "utf8");

test("RC performance verification is mandatory in the Release Gate", () => {
  assert.match(releaseGate, /RC performance gate/);
  assert.match(releaseGate, /node scripts\/rc-performance-gate\.mjs/);
  assert.match(releaseGate, /\.qa-runtime\/rc\//);
  for (const key of ["jsBytes", "cssBytes", "rootMedianMs", "rootP95Ms", "healthMedianMs", "healthP95Ms"]) {
    assert.match(performanceGate, new RegExp(key));
  }
  assert.match(performanceGate, /performance-report\.json/);
  assert.match(performanceGate, /Object\.values\(checks\)\.every\(Boolean\)/);
});

test("RC live gate covers three real projects", () => {
  for (const url of [
    "https://staging.yogabuenaonda.it/",
    "https://studiodentisticozirafa.com/",
    "https://sanointavola.it/",
  ]) {
    assert.match(liveGate, new RegExp(url.replaceAll("/", "\\/")));
  }
  assert.match(liveGate, /Three-project live smoke/);
});

test("RC live gate requires a real DataForSEO SERP sample", () => {
  assert.match(liveGate, /DATAFORSEO_LOGIN/);
  assert.match(liveGate, /DATAFORSEO_PASSWORD/);
  assert.match(liveGate, /serp\/google\/organic\/live\/advanced/);
  assert.match(liveGate, /seo specialist bergamo/);
  assert.match(liveGate, /organicItems/);
  assert.match(liveGate, /DataForSEO live PASS/);
});

test("RC WordPress staging check is read-only Elementor E2E", () => {
  assert.match(liveGate, /environment: wordpress-staging/);
  assert.match(liveGate, /staging\.yogabuenaonda\.it/);
  assert.match(liveGate, /test:wordpress-elementor-e2e/);
  assert.doesNotMatch(liveGate, /YES_I_UNDERSTAND/);
});

test("RC branch is isolated from main feature development", () => {
  assert.match(liveGate, /release\/1\.4\.4-rc\.1/);
  assert.doesNotMatch(liveGate, /branches:\s*\[?main/i);
});
