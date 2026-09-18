# Release checklist — SeoGrow AI 1.4.4

Data: 2026-09-18
Branch candidate: `release/1.4.4-rc.1`
Baseline funzionale prima dei metadata RC: `3374c76ac0fa4f7d13b5158c30bec30015c611c3`

## Freeze
- [x] Nessun nuovo modulo.
- [x] Nessun nuovo provider.
- [x] Scope 1.4.4 congelato su risoluzione quotidiana, priorità unica e monitoring deltas.

## Metadata
- [x] package.json → 1.4.4.
- [x] package-lock.json → 1.4.4.
- [x] CHANGELOG 1.4.4 presente.
- [x] Release notes 1.4.4 presenti.
- [x] RC Live Gate puntato a `release/1.4.4-rc.1`.

## Gate automatici
- [ ] Release Gate Ubuntu PASS.
- [ ] Release Gate macOS PASS.
- [ ] Browser QA PASS.
- [ ] RC performance gate PASS.
- [ ] Dependency audit PASS.
- [ ] Secrets/runtime non tracciati.
- [ ] Package/lockfile coerenti.

## Prove reali
- [ ] Three-project live smoke PASS.
- [ ] DataForSEO real sample PASS.
- [ ] Elementor staging read-only E2E PASS.

## Release decision
- [ ] P0 aperti = 0.
- [ ] P1 aperti = 0.
- [ ] Candidate SHA congelato.
- [ ] Tag/release creati esattamente sullo SHA validato.

Produzione è GO solo dopo tutti i checkbox sopra.
