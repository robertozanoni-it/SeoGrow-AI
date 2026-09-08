# Automated QA — 8 September 2026

## Baseline
main at 7de18babea0fe7e78aa12bb20292f19b2785c723: 609 tests, 609 pass,
0 fail, 0 skipped, 2210.893749 ms. Lint/build PASS.
Release Gate #736 attempt 2 PASS. The first attempt hit a document/context
race after reload in the browser script; the new helper waits for a new
document marker and hydrated task UI, rather than accepting the old DOM.

## Commands and prerequisites
Node >=22, npm ci, Chrome/Chromium (or CHROME_BIN; Chrome/Brave paths on macOS).
Use npm run qa:smoke for real-browser P0/P1 flows;
npm run qa:full for lint, all Node integration/regression/storage tests,
production build and browser errors/reload;
npm run qa:release adds native IndexedDB abort and 500-task/browser
project-isolation checks to full coverage. Missing browser/runtime/fixture or
required scenario fails, never skips. No credentials are required.

The runner copies application source into a disposable directory, supplies
temporary API secrets, launches on free loopback ports and never imports
the user's .env or runtime database. Browser profiles are unique. Browser
fetch rejects remote origins and non-read requests. All writes are fixture
storage only. The original WordPress and paid API E2E scripts are excluded.
The macOS launcher and Connector/security packaging gates remain separate.

## Executable matrix
scripts/qa-matrix.mjs defines scenario IDs, risks, severity, preconditions,
actions, expectations, levels and modes. qa-runner validates that every required
browser scenario has an actual PASS record. Reports list measured scenario and
command durations; they are not performance benchmarks or arbitrary tight budgets.

Existing Node suites remain authoritative for:
- Unit / Regression: productivity, opportunityTasks, navigationUx, projectPlanning.
- Integration / Error Injection: api, residualApi, residualAgent, securityEnvironment.
- Storage/Persistence: workspaceAtomic, workspaceMigration, workspaceFixtures,
  workspaceCrashHarness, remediationPersistence, multiClientIsolation.
- Import/Export: residualData, regressions, workspaceAtomic and qaAutomation.
- Added qaAutomation covers 500-record atomic write/quota, schema incompatibility,
  consecutive undo and serialized backup round-trip.
The browser matrix covers task state, filter visibility, create/read/update/delete,
undo, reload, repeat clicks, active/terminal task association, saved views,
Google properties/errors, real IndexedDB abort and responsive geometry.

## Evidence
.qa-runtime/automation/<mode>/report.json, browser-report.json, step logs,
1440/768/390 task/modal PNGs; failure-dom.txt and failure.png on browser failure.
CI uploads these artifacts even on failure. PNGs are diagnostic captures,
not approved pixel-diff baselines. Native browser UI runs in Chrome through
the existing CDP runner; Playwright was not added as a second infrastructure.

## Limits
- Screenshot aesthetic assessment and exact pixel baselines remain manual.
  Geometry/focus/Escape checks are automatic; this is not full WCAG certification.
- Browser quota is simulated as an exception in Node storage transactions;
  native browser abort is separately exercised. Actual OS disk exhaustion and
  killing the complete OS during a write remain the previously recorded manual QA.
- Timeout error is injected deterministically; this does not measure real remote latency.
- UI search/status and selected-view state reset on full page reload; saved view
  definitions persist and can be recalled. No new filter persistence is introduced.
- Terminal Completato tasks intentionally no longer block a new active opportunity task.
- No batch selection/delete exists in Task, so no invented controls are tested.
- G07 Elementor shared/staging remains PARTIAL; WordPress live writes and the full
  live role matrix are outside this standard gate. Previous minimal staging roles
  result is preserved.
