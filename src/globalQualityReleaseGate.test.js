import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [gate, audit] = await Promise.all([
  readFile(new URL("../.github/workflows/release-gate.yml", import.meta.url), "utf8"),
  readFile(new URL("../scripts/global-quality-audit.mjs", import.meta.url), "utf8"),
]);

test("Release Gate executes the global architecture audit", () => {
  assert.match(gate, /Architecture and global quality gate/);
  assert.match(gate, /node scripts\/global-quality-audit\.mjs/);
  assert.ok(
    gate.indexOf("node scripts/global-quality-audit.mjs") <
    gate.indexOf("node scripts/rc-performance-gate.mjs"),
    "global audit should run before the RC performance gate",
  );
});

test("global audit remains a fail-closed invariant checker", () => {
  assert.match(audit, /const failures = Object\.entries\(checks\)/);
  assert.match(audit, /if \(failures\.length\) process\.exitCode = 1/);
  for (const invariant of [
    "noImplementationMarkers",
    "appShellBounded",
    "mainBundleBelow700k",
    "geoTabsFunctional",
    "geoEvidenceNotDecorative",
    "sidebarTonesAlternating",
    "centralizedTaskFactory",
  ]) {
    assert.match(audit, new RegExp(invariant));
  }
});
