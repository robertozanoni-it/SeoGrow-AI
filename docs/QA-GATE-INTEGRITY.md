# QA release integrity — 8 September 2026

## Repository and baseline

Branch: `qa/release-gate-integrity`.
Base: `f7f8069bde486383b4668103c66a7d4c2e43a829` (`main`).
The unmodified baseline is retained in `qa/baselines/2026-09-08-before.json`:
614 Node tests, 614 pass, 0 fail, 0 skipped, 10.34 seconds; lint and production
build pass. The initial browser stage failed because no browser was installed.
This was an environment failure, not a passing release. The connector returned
no PR-triggered workflow runs for the merge commit; that is not evidence of a
failed or successful post-merge CI run.

## Changes and permanent regressions

| Risk | Cause | Change | Executable regression |
|---|---|---|---|
| P0 cache differs from durable storage after write failure | Later queued keys were already optimistic; after the first failure only its own key rolled back, and later writes were abandoned | Maintain the last committed cache and restore all keys when a write fails; remain frozen until reload | `src/workspaceWriteFailure.test.js`, browser `STORAGE-QUEUE-001` |
| P1 mobile navigation remains over content | Guided navigation changes the URL outside the legacy sidebar handler that closes the drawer | Close the menu on hash and application navigation events, including selection of the current route | `RESPONSIVE-001` uses the mobile menu entry point and requires its closure |
| P1 incomplete QA evidence can be accepted | Missing numeric counters become NaN; browser reports had no execution identity | Require all TAP counters, consistent totals, zero cancelled/skipped/todo, and matching browser run ID, mode and commit; reject duplicate or failed scenarios | 18 tests in `src/qaEvidence.test.js` |
| P1 interruption test could reload before any write began | Task persistence is debounced | Hold the application's native IndexedDB transaction open, prove it started, then reload; verify whole records | `TASK-004` |
| P2 redundant CI execution | Full and smoke were run again before their release superset | Run the strict release superset once per CI job; retain separate manual commands | Existing required-scenario validation |

The storage regression was observed failing with `new-clients` in cache while
`old-clients` remained durable, then passed after the fix. The browser mobile
regression failed with the menu still open, then passed after the fix.

## Reproduction

Prerequisites: Node >=22, `npm ci`, Chrome/Chromium. Existing macOS Chrome/Brave
and Linux Chrome paths are recognized; a custom executable uses `CHROME_BIN`.
No new runtime or test dependency was added to the project. In this environment
Chromium 149 was obtained through an isolated npm browser package because the
standard browser CDN timed out; that environment workaround is not a project
dependency or a requirement for users with Chrome already installed.

```bash
npm run qa:smoke
npm run qa:full
npm run qa:release
```

The current matrix has 7 smoke, 33 full and 35 release browser scenarios.
The Node suite now has 633 tests (19 added). Scenario counts describe distinct
recorded scenarios, not the number of UI assertions. The scripts remain the
executable source of truth; missing fixtures or required evidence are failures.
Reports now distinguish deadline termination from assertion failures and disclose
a dirty source tree. Browser evidence must match the same invocation and commit.

## Scope and residual limits

- Existing Task, opportunity association, terminal state, undo, filters, saved
  views, CRUD, import/export, encryption, schema, recovery, API error, form and
  project isolation suites are reused. No valid tests were removed or skipped.
- The new native-browser storage case asserts error visibility, rollback of
  optimistic keys and exact task preservation across reload.
- Native write interruption is deterministic; actual OS power loss and physical
  disk exhaustion are not equivalent and remain outside the standard batch.
- Responsive navigation, horizontal overflow, modal bounds, labels, initial
  focus and Escape are checked at 1440/768/390. PNG captures are diagnostic
  evidence, not an approved pixel-diff baseline or full accessibility audit.
- Timings are recorded. There is no cross-machine performance baseline or tight
  performance threshold. The existing 120-second stage deadline remains strict.
- No user storage, WordPress production writes, credentials or paid APIs are used.
  The existing G07 staging exclusions remain in force.
- Linux/macOS CI and the macOS launcher must be verified by GitHub Actions;
  a local Linux result cannot certify macOS.

## Changed files

- `.github/workflows/release-gate.yml`
- `scripts/browser-smoke.mjs`
- `scripts/qa-browser-matrix.mjs`
- `scripts/qa-matrix.mjs`
- `scripts/qa-runner.mjs`
- `scripts/qa-evidence.mjs`
- `src/App.jsx`
- `src/workspaceDatabase.js`
- `src/qaEvidence.test.js`
- `src/workspaceWriteFailure.test.js`
- `qa/baselines/2026-09-08-before.json`
- `docs/QA-GATE-INTEGRITY.md`

## Execution results

- Smoke after the mobile navigation fix: PASS, 7 browser scenarios, 13.89 seconds
  for the browser stage.
- Full after all changes: PASS, 633 Node tests and 33/33 browser scenarios.
- Release with all additions: PASS, 633/633 Node tests, 35/35 browser scenarios,
  0 failures, cancelled, skipped or todo. Node tests: 10.82 seconds; browser:
  47.98 seconds; total: 75.48 seconds. Lint and production build PASS.
- Two earlier release attempts hit the unchanged 120-second deadline while the
  later field suite still inherited 500 stress tasks. Stress now restores and
  verifies its exact initial records after all 502-record assertions. No stress
  assertion was removed; unrelated field tests run on their intended fixture.
  This fixes test isolation; it does not certify Problems-page performance with
  hundreds of tasks as a separate benchmark.

The authoritative per-run logs and screenshots are emitted under
`.qa-runtime/automation/<mode>/`; CI uploads them as `qa-release` and
`qa-release-macos`. Runtime output remains untracked by design.

## Delivery status

Implementation commit: `a18119db0eaf7becdd5ce2cc1836bba34cbd9c82`.
Full final run: 66.94 seconds.

PR: not created. CI: not executed for these changes. Git HTTPS push had no
credentials; the authenticated GitHub source upload was then rejected by automatic
approval review because uploading modified source to this public repository needs
explicit user authorization. No alternate upload path was attempted after rejection.
The branch and changes are committed locally and ready for review.

Local smoke/full/release are green; remote CI and release readiness remain pending.
No merge or publication is claimed.
