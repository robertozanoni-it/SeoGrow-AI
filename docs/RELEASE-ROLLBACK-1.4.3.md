# Rollback release — SeoGrow AI Suite 1.4.3

## Obiettivo
Ripristinare rapidamente l'ultima versione stabile senza perdere workspace, correzioni o tracciabilità.

## Trigger
Eseguire rollback della release per P0 confermato, P1 senza hotfix verificabile, corruzione dati, regressione di avvio, incompatibilità grave del Connector o scritture WordPress non controllate.

## Procedura
1. Bloccare nuove scritture WordPress tramite kill-switch progetto dove necessario.
2. Conservare log, browser evidence, SHA, issue e timestamp dell'incidente.
3. Non modificare né cancellare backup/workspace dell'utente.
4. Identificare l'ultimo tag/commit stabile precedente alla release difettosa.
5. Ripristinare codice applicativo e Connector alla coppia di versioni compatibili documentata.
6. Non effettuare downgrade distruttivi dello schema storage: se il formato dati è più nuovo, usare solo percorsi di compatibilità/restore già testati.
7. Avviare la suite e verificare health, apertura workspace, selezione cliente e persistenza.
8. Eseguire smoke su Audit, Correzioni, Task, Posizionamenti e Impostazioni.
9. Se coinvolto WordPress, verificare connessione read-only e un rollback/remediation preflight senza nuove scritture non autorizzate.
10. Registrare esito e decisione nell'issue incidente.

## Connector
Il pacchetto Connector deve restare allineato alla compatibilità della release ripristinata. Non installare automaticamente versioni precedenti su siti reali senza una ragione verificata e un piano di ritorno.

## Dati
Backup e restore workspace sono atomici e devono restare l'ultima risorsa per recupero dati, non un sostituto del rollback del codice.

## Criterio di chiusura
Rollback chiuso solo quando runtime sano, workspace leggibile, nessun errore console/network inatteso e nessuna scrittura remota pendente o ambigua.