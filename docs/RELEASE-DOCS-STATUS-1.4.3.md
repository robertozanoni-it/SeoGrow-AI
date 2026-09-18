# Stato documentazione — release 1.4.3

## Documenti autorevoli per la RC
Per decisioni di release usare, in questo ordine:
1. `CHANGELOG.md` — contenuto della 1.4.3.
2. `docs/RELEASE-CHECKLIST-1.4.3.md` — Gate finale e blocker correnti.
3. `docs/POST-RELEASE-1.4.3.md` — stabilizzazione dopo rilascio.
4. `docs/TECHNICAL-AUDIT-GATE-2026-09-17.md` — Gate tecnico.
5. `docs/SETTINGS-GATE-2026-09-17.md` — policy e kill-switch.
6. `docs/HOTFIX-PROCEDURE-1.4.3.md` — correzioni urgenti.
7. `docs/RELEASE-ROLLBACK-1.4.3.md` — rollback della release.

## Evidenze storiche
I documenti di collaudo datati, inclusi `COLLAUDO-GAP.md`, `COLLAUDO-STATUS-*`, `docs/qa/G07-*`, `QA-1.4.0.md` e `QA-1.4.2.md`, conservano lo stato reale del momento in cui furono scritti.

Termini come `NO-GO`, `PARTIAL`, riferimenti a Connector 1.3.2/1.3.3/1.3.4 o capability allora sperimentali non descrivono automaticamente lo stato corrente della RC 1.4.3. Non vanno cancellati o riscritti retroattivamente.

## Regola di conflitto
Se un documento storico contraddice una decisione corrente, prevale la checklist 1.4.3 solo quando il requisito è stato successivamente coperto da evidenza e Gate verdi. La cronologia originale resta comunque valida come evidenza del percorso.

## Stato corrente noto
- Release Gate standard + performance: PASS sull'HEAD della candidate testata.
- Smoke pubblico su tre progetti: PASS.
- Elementor staging read-only: PASS.
- P0/P1 aperti: 0 al preflight RC.
- DataForSEO live sample: ancora BLOCKED per GitHub Secrets mancanti; nessun PASS simulato.

## Freeze
Fino alla chiusura del DataForSEO live gate: solo release metadata, QA/hardening e bugfix verificati. Nuove feature e cleanup non necessari restano fuori dalla RC.