# Release checklist — SeoGrow AI 1.4.3

Data: 2026-09-17
Branch candidate: `release/1.4.3-rc.1`
Baseline RC verificata prima del metadata-only update: `a255ac1c575939741657a1591134699ea7dc4530`

## Freeze
- [x] Feature freeze attivo: sulla branch RC sono ammessi solo bugfix o metadata di release.
- [x] Nessun P0 aperto.
- [x] Nessun P1 aperto.

## Repository e CI
- [x] Release Gate standard PASS su Ubuntu.
- [x] Release Gate standard PASS su macOS.
- [x] Browser QA PASS.
- [x] Dependency audit PASS.
- [x] Secrets/runtime non tracciati nel repository.
- [x] Package e lockfile coerenti.
- [x] RC performance gate PASS.

## Staging e prove reali
- [x] Smoke live su tre progetti reali.
- [x] WordPress Elementor staging read-only E2E PASS.
- [ ] DataForSEO Google organic live sample PASS — BLOCCATO: GitHub Actions Secrets `DATAFORSEO_LOGIN` e `DATAFORSEO_PASSWORD` assenti.

## Recovery e sicurezza
- [x] Rollback applicativo presente e verificato nel journey E2E.
- [x] Rollback WordPress stale-state protetto; evidenze reali di `STALE_CONFLICT` disponibili nei report QA.
- [x] Backup workspace cifrato e round-trip di restore coperto dalla QA.
- [x] Restore atomico workspace/correzioni documentato e testato.
- [x] Kill-switch per progetto disponibile in Impostazioni.
- [x] Kill-switch blocca le scritture ma mantiene preview/verifica/rollback.

## Release metadata
- [x] `CHANGELOG.md` presente.
- [x] Checklist release presente.
- [x] Branch RC separata da `main`.

## Gate produzione
Produzione resta **NO-GO** finché il DataForSEO live sample non passa sulla stessa candidate o su una candidate successiva contenente esclusivamente bugfix/metadata validati.

Dopo il PASS DataForSEO:
1. rieseguire RC Live Gate;
2. verificare `completed / success` per tutti i job;
3. confermare che non siano comparsi P0/P1;
4. eseguire il Release Gate finale sulla candidate risultante;
5. solo allora promuovere in produzione.
