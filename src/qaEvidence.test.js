import test from "node:test";
import assert from "node:assert/strict";
import { parseTestSummary, validateBrowserEvidence } from "../scripts/qa-evidence.mjs";

const tap = "# tests 2\n# suites 0\n# pass 2\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 12.5\n";
test("QA-GATE-001 accepts a complete passing TAP summary", () => {
  assert.equal(parseTestSummary(tap).tests, 2);
});
for (const field of ["tests", "pass", "fail", "cancelled", "skipped", "todo", "duration_ms"]) {
  test(`QA-GATE-002 rejects missing TAP ${field} instead of accepting NaN`, () => {
    assert.throws(() => parseTestSummary(tap.replace(new RegExp(`# ${field} [^\\n]+\\n`), "")));
  });
}
for (const field of ["fail", "cancelled", "skipped", "todo"]) {
  test(`QA-GATE-003 rejects nonzero ${field}`, () => {
    assert.throws(() => parseTestSummary(tap.replace(`# ${field} 0`, `# ${field} 1`)));
  });
}
test("QA-GATE-004 rejects empty or inconsistent totals", () => {
  assert.throws(() => parseTestSummary(tap.replace("# tests 2", "# tests 0")));
  assert.throws(() => parseTestSummary(tap.replace("# pass 2", "# pass 1")));
});
const identity = { runId: "current-run", mode: "release", commit: "current-commit" };
const evidence = () => ({ ...identity, ok: true, scenarios: [{ id: "P0", status: "PASS" }] });
test("QA-GATE-005 accepts current complete browser evidence", () => {
  assert.doesNotThrow(() => validateBrowserEvidence(evidence(), identity, ["P0"]));
});
for (const field of ["runId", "mode", "commit"]) {
  test(`QA-GATE-006 rejects stale or mismatched browser ${field}`, () => {
    assert.throws(() => validateBrowserEvidence({ ...evidence(), [field]: "old" }, identity, ["P0"]));
  });
}
test("QA-GATE-007 rejects missing, duplicated and failed scenarios", () => {
  assert.throws(() => validateBrowserEvidence(evidence(), identity, ["missing"]));
  const duplicate = evidence(); duplicate.scenarios.push({ id: "P0", status: "PASS" });
  assert.throws(() => validateBrowserEvidence(duplicate, identity, ["P0"]));
  const failure = evidence(); failure.scenarios.push({ id: "extra", status: "FAIL" });
  assert.throws(() => validateBrowserEvidence(failure, identity, ["P0"]));
});
