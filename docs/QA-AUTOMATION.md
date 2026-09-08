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
fetch rejects remote origins and unconfigured non-read requests. Explicit local
API mocks exercise form submissions without reaching an external provider.
All persistent writes are fixture storage only. The original WordPress and paid API E2E scripts are excluded.
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

## First complete execution
Release Gate #738 executed qa:smoke, qa:full and qa:release successfully
on the same runner installation (about 18s / 24s / 29s respectively).
Further regression additions cover double-submit, encrypted backup round-trip
and wrong password, bounded CDP waits and captured browser exception/network events.
Release Gate #741 PASS on 693fa26a4891ea926e3a4cbafa11f6ff8545bc4a
includes all those additions: all three commands executed, with native Chrome,
encrypted backup and wrong-password rejection, API failure recovery and 500 tasks.
PR #69 merged as dcdc922267484fb9dd649bd54889ff825ecb891a.
Post-merge Release Gate #742 PASS: smoke about 8s, full 24s, release 30s.
The documentation follow-up uses the same mandatory Release Gate.

## Fixes covered by the matrix
- P0 rapid opportunity clicks: the creation handler now consults and updates an
  immediate task snapshot so several same-turn clicks cannot use stale React state.
- P0 repeated manual form submission: suppress repeated submission in the same
  event turn; retries after validation remain possible.
- P1 QA reliability: identify the newly hydrated document after reload; modal
  actions are scoped to the dialog; asynchronous conditions are awaited.
- P1 QA fixtures: seed only the application origin, leaving synthetic data: pages
  untouched; Google actions await configured status and an enabled button.
  Uncaught browser exceptions still fail the entire gate.

## Current field coverage — batch PR #73 / #74

The release matrix now requires **34 browser scenarios**, including **22 field
scenarios**; full requires 32 and smoke 7. The Node suite has **614 tests**.
Both PRs are merged. Their final Release Gates are #752 and #761, both PASS.
Linux runs smoke/full/release; macOS runs release from a path containing spaces
and the real launcher smoke. Missing required scenarios remain a failure.

`scripts/qa-form-matrix.mjs` and `scripts/qa-remaining-fields.mjs` exercise real
React controls, validation, conditional options, payloads, failure/retry,
IndexedDB persistence and actual document reloads. ZIP input uses synthetic CSVs;
the backup test uses the export/import buttons, encryption and wrong-password
rejection. Restore comparison uses the application's canonical task schema,
including defaults added when legacy records are hydrated.

External responses are explicit disposable browser mocks, never real WordPress
writes or paid provider calls. Changing taxonomy input revokes confirmation;
changing the issue or credentials invalidates the old inspection before another
request completes. No test submits WordPress apply or draft publication.

The complete field inventory, observed fixes and exclusions are in
[QA-FIELDS.md](QA-FIELDS.md). This is automated functional coverage, not a claim
that every arbitrary input combination or all visual/accessibility behavior has
been manually certified. G07 remains PARTIAL and G13 retains only its previously
recorded minimal read-only staging result.

Earlier macOS follow-ups #71 and #72 are merged: native filesystem paths replace
URL-encoded test paths, and QA process startup handles the spaced checkout.
Their final PR/main gates were #745/#746 and #748/#749, all PASS. The user also
reported all four local qa:release stages PASS before this new fields batch.
