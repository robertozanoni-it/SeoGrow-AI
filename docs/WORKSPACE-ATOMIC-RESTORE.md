# Step 1 — ripristino atomico workspace

Base: PR #35, commit af4d7a7. Questa modifica riguarda solo il workspace. Il Connector e le protezioni di concorrenza WordPress non cambiano rispetto alla base.

## Modifica

Dati del workspace e snapshot delle correzioni risiedono nello stesso database IndexedDB, versione 2. I moduli usano un adapter comune con cache in memoria; localStorage originale viene migrato una sola volta e conservato. React e le migrazioni applicative partono soltanto dopo l'inizializzazione del database.

Il ripristino valida l'intero backup prima dell'importazione e prepara dati, indice delle correzioni e storico audit. Un'unica transazione readwrite su `workspace` e `corrections` sostituisce i dati e cambia la generazione. Solo il commit rende effettivo il nuovo workspace. Prima del commit un abort mantiene integralmente il precedente. Dopo il commit l'app ricarica lo stato; i writer della vecchia UI sono bloccati e non possono salvarlo sopra quello nuovo.

Anche letture e scritture delle correzioni controllano la generazione nella stessa transazione. Le vecchie schede non possono sovrascrivere una generazione già ripristinata. BroadcastChannel propaga i normali aggiornamenti e richiede reload al cambio generazione.

Le nuove copie locali includono snapshot correzioni e storico audit pagina; l'export cifrato include quest'ultimo. Le copie locali vecchie prive degli snapshot necessari vengono rifiutate per non mescolare dati di momenti diversi. Un vecchio backup esterno può ripristinare solo ciò che contiene.

## Prove

| Requisito | Prova | Esito |
|---|---|---|
| Validazione prima dell'import | Backup invalido rifiutato prima della transazione | Superato |
| Una transazione IndexedDB | Chiavi, indice, snapshot e generazione nello stesso commit | Superato |
| Nessuno stato misto dopo interruzione | Abort e successiva riapertura: tutti i dati precedenti | Superato |
| Spazio esaurito | QuotaExceededError simulato prima del commit: archivio precedente intatto | Superato |
| Errore di serializzazione | Record non clonabile annulla tutta la transazione | Superato |
| Vecchia scheda | Generazione obsoleta non sovrascrive il restore completato | Superato |
| Migrazione | Native preservato; riapertura usa IndexedDB, non la vecchia copia | Superato |
| Indice e storico audit | Preparati dal medesimo dataset importato | Superato |

Test locali: 504/504 superati, lint e build superati. Il Release Gate sul commit pubblicato viene registrato nella PR.

## Limiti espliciti

Crash/interruzioni sono simulati tramite abort e riapertura dell'API IndexedDB in memoria; la quota è simulata. Non è stato arrestato fisicamente il browser/OS né riempito il disco reale dell'utente. Il browser smoke CI verifica avvio e navigazione, non sostituisce un collaudo completo dell'importazione su Mac.

Il native localStorage conservato è la copia precedente alla migrazione, non un mirror dei nuovi salvataggi: eseguire una versione precedente dell'app non equivale a ripristinare il workspace aggiornato.

Nessun merge su main e nessuna scrittura WordPress live.
