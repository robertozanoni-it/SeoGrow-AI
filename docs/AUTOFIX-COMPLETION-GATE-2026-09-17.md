# AutoFix completion gate — 2026-09-17

## Obiettivo

Chiudere AutoFix come owner delle mutazioni single e batch imponendo una regola unica: una write riuscita non equivale a un fix completato.

## Contratto

Un fix live è completato solo quando esistono contemporaneamente:

- approval valido;
- write journaled e confermata;
- stale/CAS guard superata;
- verifica frontend positiva;
- audit post-fix con copertura sufficiente;
- finding originale assente dall'audit di conferma.

In assenza di uno di questi elementi lo stato resta `Da verificare`, `Bloccato`, `Esito incerto` o aperto.

## Single fix

Il listener post-apply già canonico di `remediationIntegrity` richiama `recheckCorrections()`, che ora passa sempre da `recheckCorrectionById()`: riverifica frontend e audit di conferma usano quindi un solo pipeline condiviso. Lo storage impedisce inoltre a una write live di essere persistita come `Verificato` senza completion evidence e non chiude la task prima del gate.

## Batch fix

`verificationState()` richiede il contratto di completion evidence. `SUCCESS` è possibile solo se tutti i problemi selezionati risultano `RESOLVED_VERIFIED`; task assistite e write ancora da verificare non contano come successo.

## Shared Elementor

L'adapter batch riusa gli endpoint certificati nell'issue #163:

- preview shared con coverage completa;
- approval token;
- apply CAS atomico;
- stale check;
- verifica frontend di tutte le URL impattate;
- receipt associato a `elementor_library` e all'ID reale del template, così il rollback storico usa il writer shared corretto;
- rollback automatico lato writer se il frontend non verifica;
- audit sito post-fix prima del completamento AutoFix.

Il kill switch shared resta OFF di default e deve essere abilitato esplicitamente per ambiente.

## Rollback ed errori

Il journal distingue blocchi definitely-no-write da esiti realmente incerti. Il rollback continua a richiedere expected current/stale guard; nessuna write incerta viene ritentata automaticamente.

## Gate

**Nessun fix può risultare completato senza verifica.**
