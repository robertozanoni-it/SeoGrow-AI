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
7. Verificare il workspace: deve essere interamente B oppure interamente A. Non è ammessa alcuna combinazione A/B.

## Due schede reali concorrenti

Aprire due schede sullo stesso origin, eseguire il restore nella prima e verificare che la seconda rilevi la nuova generazione e non possa continuare a operare sul workspace precedente.

## Quota storage reale del browser

Usare esclusivamente il profilo Brave dedicato. In DevTools → Application → Storage attivare `Simulate custom storage quota` con una quota inferiore all'uso IndexedDB corrente. Non usare `Clear site data` e non saturare il disco fisico del Mac. Tentare quindi l'import del backup opposto e verificare errore di spazio, assenza di successo e persistenza integrale del workspace precedente dopo reload.

Confronto DB: ignorare SOLO la generazione interna __generation e verificare separatamente il ledger locale delle approvazioni consumate, che non viene ripristinato dal backup.

## Evidenza

6 settembre 2026: fixture A/B e fault injection simulata superati con fake-indexeddb. Browser gestito inizialmente rifiutato con net::ERR_BLOCKED_BY_CLIENT.

Collaudo manuale in profilo Brave dedicato:

- A importato e persistente dopo reload: PASS.
- backup invalido con cliente duplicato: rifiutato senza alterare A; A integro dopo reload: PASS.
- A → B: B sostituisce completamente A, nessun cliente misto, B persistente dopo reload: PASS.
- crash fisico controllato durante tentativo B → A: finestra Brave Test chiusa mentre `QA CRASH CHECKPOINT` manteneva aperta la transazione IndexedDB. Alla riapertura risultano esclusivamente `QA B cliente 1 — FITTIZIO` e `QA B cliente 2 — FITTIZIO`; task B presente; nessun cliente A o stato misto osservato: PASS.
- due schede reali concorrenti: entrambe aperte su A; nella prima scheda restore A → B; la seconda, senza refresh manuale, ha rilevato il cambio e mostrato automaticamente B. Nessuno stato A obsoleto rimasto operativo nella prova eseguita: PASS.
- quota storage reale del browser: DevTools ha imposto quota custom 0,26 MB con IndexedDB già a circa 261 kB (quota mostrata 260 kB). Durante il tentativo di import A l'app ha mostrato `Spazio locale esaurito` e non ha riportato successo. Dopo reload, pagina Clienti contiene esclusivamente `QA B cliente 1 — FITTIZIO` e `QA B cliente 2 — FITTIZIO`; nessun cliente A o stato misto: PASS.

Esito workspace: le prove manuali A/B, rifiuto invalido, crash fisico, concorrenza due schede e quota reale del browser hanno mantenuto un dataset coerente nelle prove eseguite. Resta separato il collaudo visuale completo dell'app e restano i gap WordPress descritti in `docs/COLLAUDO-GAP.md`. Nessuna modifica a contenuti WordPress o credenziali.
