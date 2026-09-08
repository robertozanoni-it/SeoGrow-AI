// Gate evidence is data from child processes: validate it before trusting PASS.
export function parseTestSummary(tap) {
  const summary = {};
  for (const key of ["tests", "pass", "fail", "cancelled", "skipped", "todo", "duration_ms"]) {
    const matches = [...tap.matchAll(new RegExp(`^# ${key} ([0-9]+(?:\\.[0-9]+)?)$`, "gm"))];
    if (matches.length !== 1) throw new Error(`Missing or ambiguous TAP summary: ${key}`);
    const value = Number(matches[0][1]);
    if (!Number.isFinite(value) || (key !== "duration_ms" && !Number.isInteger(value))) throw new Error(`Invalid TAP count: ${key}`);
    summary[key] = value;
  }
  if (!summary.tests || summary.pass !== summary.tests || summary.fail || summary.cancelled || summary.skipped || summary.todo) {
    throw new Error("Incomplete, failed, cancelled, skipped or todo Node test suite");
  }
  return summary;
}

export function validateBrowserEvidence(browser, identity, required) {
  for (const key of ["runId", "mode", "commit"]) {
    if (!identity[key] || browser[key] !== identity[key]) throw new Error(`Browser evidence identity mismatch: ${key}`);
  }
  if (browser.ok !== true || !Array.isArray(browser.scenarios) || !browser.scenarios.length) throw new Error("Browser matrix did not execute");
  const seen = new Set();
  for (const scenario of browser.scenarios) {
    if (!scenario.id || seen.has(scenario.id) || scenario.status !== "PASS") throw new Error(`Invalid browser scenario: ${scenario.id}`);
    seen.add(scenario.id);
  }
  for (const id of required) if (!seen.has(id)) throw new Error(`Required scenario did not pass: ${id}`);
}
