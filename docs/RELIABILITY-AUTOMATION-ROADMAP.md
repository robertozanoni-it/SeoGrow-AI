# Reliability Automation Roadmap

Baseline: Guardian v1 merged on top of the verified 14-module Suite.

## 1. Regression Watch
Owner: GitHub CI/CD, not a product module.

- Run the existing release QA after every merge to main.
- Treat the last green main as the comparison baseline.
- Fail closed on browser console errors, storage regressions, architecture drift or cross-client leakage.
- Do not mutate production data while diagnosing a failed gate.

Gate: a deliberately failing critical journey is rejected while an unchanged green baseline passes Linux and macOS.

## 2. Data Freshness Engine
Owner: Guardian observes; canonical modules refresh their own data.

Sources:
- Audit SEO last valid run
- Search Console import timestamp/period
- DataForSEO ranking checkedAt
- GEO snapshot/history
- project freshness policy

Rules:
- classify fresh / aging / stale / unavailable;
- never delete the last valid dataset because a refresh failed;
- produce one recommended refresh action per stale source;
- never start a paid/provider action without the existing confirmation boundary.

Gate: mixed fresh/stale fixtures yield deterministic statuses and route to the owning module.

## 3. Integration Health
Owner: Guardian observes; Integrazioni owns credentials and connection actions.

Providers:
- WordPress
- Google Search Console
- DataForSEO
- OpenAI

Rules:
- distinguish configured, verified, stale verification, degraded and unavailable;
- health checks must not expose or persist secrets;
- no automatic reconnect or credential mutation;
- provider failure must preserve the last valid project data;
- deduplicate repeated incidents through the Guardian ledger.

Gate: one healthy and one failing provider can coexist without blocking unrelated modules.

## Non-goals
- no 15th product module;
- no autonomous WordPress writes;
- no automatic paid DataForSEO/OpenAI execution;
- no duplicate task/problem/correction ownership;
- no weakening of the existing release gates.
