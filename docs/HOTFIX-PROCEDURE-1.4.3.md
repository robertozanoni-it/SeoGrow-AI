# Procedura hotfix — SeoGrow AI Suite 1.4.3

## Quando usarla
Usare un hotfix solo per P0/P1 o regressioni P2 che compromettono un flusso core. Nessuna nuova feature entra in un hotfix.

## Regole
1. Partire dal commit/tag della release interessata, non dall'HEAD di sviluppo.
2. Creare un branch `hotfix/1.4.3-<descrizione-breve>`.
3. Riprodurre il difetto con evidenza prima della modifica.
4. Correggere la causa minima preservando architettura, storage, OpenAI/DataForSEO-only e writer WordPress esistenti.
5. Aggiungere o aggiornare un test che fallisce prima e passa dopo il fix.
6. Eseguire Release Gate completa, incluso performance gate e macOS launcher smoke.
7. Se il difetto tocca WordPress/provider, eseguire anche il relativo live/staging gate disponibile.
8. Verificare rollback e assenza di scritture inattese.
9. Aggiornare CHANGELOG con impatto e rischio.
10. Merge solo con tutti i gate applicabili verdi.

## P0
Per perdita dati, sicurezza, corruzione workspace o scritture WordPress incontrollate: disabilitare subito le scritture tramite kill-switch dove applicabile, conservare evidenze e preferire rollback della release se il fix non è immediatamente verificabile.

## P1
Blocca una funzione core ma senza perdita dati: hotfix consentito, nessuna espansione di scope.

## P2/P3
Entrano normalmente nel ciclo successivo salvo regressione evidente introdotta dalla release.

## Evidenze minime
Issue con severità; SHA affetto; passi riproducibili; test regressione; Release Gate; eventuale staging/live gate; nota di rollback.