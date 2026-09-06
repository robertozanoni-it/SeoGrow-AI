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

Il modulo `src/workspaceCrashHarness.js` entra nel runtime solo in dev quando il query flag esplicito `?qaWorkspaceRestoreCrash=1` è presente. Richiama direttamente `prepareWorkspaceRestore` + `commitWorkspaceRestore`, cioè lo stesso commit atomico usato dal restore.

1. Lasciare B come workspace corrente e aprire la dev app aggiungendo `?qaWorkspaceRestoreCrash=1` allo stesso URL/porta.
2. Aprire DevTools → Console.
3. Eseguire `seoGrowQaCrashRestore()`.
4. Nel file picker scegliere `backup-A.json`.
5. Quando compare `QA CRASH CHECKPOINT`, NON premere OK/Annulla. Chiudere l'intera finestra Brave Test mentre il dialogo è ancora aperto.
6. Riaprire lo stesso profilo Brave Test e lo stesso origin dell'app, senza il query flag.
7. Verificare il workspace: deve essere interamente B (rollback della transazione interrotta) oppure, se il browser ha già reso durevole il commit prima dell'arresto, interamente A. Non è ammessa alcuna combinazione A/B. Verificare clienti, task, run Agent e correzioni, poi ricaricare una seconda volta.

Se il dialogo viene chiuso normalmente, l'harness chiama `tx.abort()` e la prova è dichiarata non valida: non può produrre un falso successo. Il query flag non arma nulla in build non-dev.

## Due schede reali concorrenti

1. Aprire due schede SeoGrow AI sullo stesso origin e con lo stesso workspace corrente.
2. Lasciare la seconda scheda aperta senza ricaricarla.
3. Nella prima scheda importare il backup opposto (A → B oppure B → A).
4. Tornare alla seconda scheda senza refresh manuale.
5. La scheda obsoleta deve rilevare il cambio di generazione e ricaricarsi/aggiornarsi sul nuovo workspace, oppure bloccare le scritture obsolete. Non deve poter sovrascrivere il workspace nuovo con stato vecchio.

Confronto DB: ignorare SOLO la generazione interna __generation e verificare separatamente il ledger locale delle approvazioni consumate, che non viene ripristinato dal backup. Le altre differenze devono essere motivate; salvataggi ordinari della UI dopo il restore vanno registrati separatamente.

## Evidenza

6 settembre 2026: fixture A/B e fault injection simulata superati con fake-indexeddb. Browser gestito: tentativo sull'app Vite rifiutato con net::ERR_BLOCKED_BY_CLIENT.

Collaudo manuale in profilo Brave dedicato:

- A importato e persistente dopo reload: PASS.
- backup invalido con cliente duplicato: rifiutato senza alterare A; A integro dopo reload: PASS.
- A → B: B sostituisce completamente A, nessun cliente misto, B persistente dopo reload: PASS.
- crash fisico controllato durante tentativo B → A: finestra Brave Test chiusa mentre `QA CRASH CHECKPOINT` manteneva aperta la transazione IndexedDB. Alla riapertura risultano esclusivamente `QA B cliente 1 — FITTIZIO` e `QA B cliente 2 — FITTIZIO`; task B presente; nessun cliente A o stato misto osservato: PASS.
- due schede reali concorrenti: entrambe aperte su A; nella prima scheda restore A → B; la seconda scheda, senza refresh manuale, ha rilevato il cambio e mostrato automaticamente `QA B cliente 1 — FITTIZIO`, task B e clienti recenti B1/B2. Nessuno stato A obsoleto rimasto visibile o scrivibile nella prova eseguita: PASS.

Esito del crash fisico: il workspace precedente B è rimasto coerente dopo l'arresto del browser durante il commit; nessun restore parziale A/B osservato nella prova eseguita.

Esito concorrenza due schede: la scheda con generazione precedente non è rimasta operativa sul vecchio workspace dopo il restore eseguito nell'altra scheda; la sincronizzazione sul nuovo workspace B è avvenuta automaticamente.

Restano separati: saturazione quota reale e collaudo visuale completo. Nessuna modifica a contenuti WordPress o credenziali.
