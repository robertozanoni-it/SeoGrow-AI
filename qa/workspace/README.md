# Kit A/B — ripristino workspace

Dati interamente fittizi. Non importare nel profilo browser usato per i clienti: l'import sostituisce il workspace. Usare un profilo browser dedicato nuovo e la stessa origine/porta per tutte le prove. Questo kit non crea né modifica il profilo del Mac dell'utente.

## Contenuto

- backup-A.json / backup-B.json: due clienti per dataset, ID separati, task, correzioni bloccate, storico audit sintetico incompleto e run Agent annullate.
- expected-A.json / expected-B.json: tutte le chiavi preparate dal restore e tutti i record correzioni; riferimento per confronto completo.
- manifest.json: SHA-256 dei backup e conteggi.
- invalid-duplicate-client.json / invalid-schema.json: rifiuti attesi dal validatore.

GSC, ranking, contenuti, profili WordPress e altre sezioni sono intenzionalmente vuoti: questo kit non copre gli stati popolati di quei moduli. Nessuna metrica rappresenta dati reali; i domini .example non sono siti da analizzare. Non avviare crawler, provider AI o invii WordPress usando queste fixture.

## Esecuzione ripetibile

Dalla radice del repository:

```sh
node scripts/prepare-workspace-fixtures.mjs
node --test src/workspaceFixtures.test.js src/workspaceCrashHarness.test.js
```

Il generatore sovrascrive soltanto le fixture di questa directory e le valida con prepareWorkspaceRestore. I test confrontano TUTTO il dataset dopo commit o abort/quota simulati e riapertura, non solo una chiave campione.

## Prova manuale A/B

1. Creare un profilo browser dedicato, senza sincronizzazione dei dati personali. Aprire l'app della PR sullo stesso origin per tutta la prova.
2. Importare A dalla UI backup. Verificare i due clienti QA A e ricaricare.
3. Importare i due file invalidi: entrambi devono essere rifiutati e A deve restare intero.
4. Importare B, ricaricare e verificare che ID, task e correzioni di A siano stati sostituiti da B.

## Crash fisico controllato — solo dev

Il modulo `src/workspaceCrashHarness.js` non è importato dall'app e non entra nel flusso di produzione. È armato soltanto in dev con il query flag esplicito `?qaWorkspaceRestoreCrash=1` e richiama direttamente `prepareWorkspaceRestore` + `commitWorkspaceRestore`, cioè lo stesso commit atomico usato dal restore.

1. Lasciare B come workspace corrente e aprire la dev app aggiungendo `?qaWorkspaceRestoreCrash=1` allo stesso URL/porta.
2. Aprire DevTools → Console.
3. Eseguire:

```js
const qa = await import('/src/workspaceCrashHarness.js');
await qa.runWorkspacePhysicalCrashHarnessFromPicker();
```

4. Nel file picker scegliere `backup-A.json`.
5. Quando compare `QA CRASH CHECKPOINT`, NON premere OK/Annulla. Chiudere l'intera finestra Brave Test mentre il dialogo è ancora aperto.
6. Riaprire lo stesso profilo Brave Test e lo stesso origin dell'app, senza il query flag.
7. Verificare il workspace: deve essere interamente B (rollback della transazione interrotta) oppure, se il browser ha già reso durevole il commit prima dell'arresto, interamente A. Non è ammessa alcuna combinazione A/B. Verificare clienti, task, run Agent e correzioni, poi ricaricare una seconda volta.

Se il dialogo viene chiuso normalmente, l'harness chiama `tx.abort()` e la prova è dichiarata non valida: non può produrre un falso successo. Il query flag non arma nulla in build non-dev.

Confronto DB: ignorare SOLO la generazione interna __generation e verificare separatamente il ledger locale delle approvazioni consumate, che non viene ripristinato dal backup. Le altre differenze devono essere motivate; salvataggi ordinari della UI dopo il restore vanno registrati separatamente.

## Evidenza

6 settembre 2026: fixture A/B e fault injection simulata superati con fake-indexeddb. Browser gestito: tentativo sull'app Vite rifiutato con net::ERR_BLOCKED_BY_CLIENT. Collaudo manuale A → invalid → B eseguito in profilo Brave dedicato: A persistente, invalid non altera A, B sostituisce A senza clienti misti e persiste dopo reload.

Il crash fisico resta aperto finché non viene eseguita la procedura sopra. La saturazione quota reale, due schede reali e il collaudo visuale completo restano separati. Nessuna modifica a contenuti WordPress o credenziali.
