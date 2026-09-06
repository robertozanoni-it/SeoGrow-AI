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
node --test src/workspaceFixtures.test.js
```

Il generatore sovrascrive soltanto le fixture di questa directory e le valida con prepareWorkspaceRestore. I test confrontano TUTTO il dataset dopo commit o abort/quota simulati e riapertura, non solo una chiave campione.

## Prova manuale successiva

1. Creare un profilo browser dedicato, senza sincronizzazione dei dati personali. Aprire l'app della PR sullo stesso origin per tutta la prova.
2. Importare A dalla UI backup. Verificare i due clienti QA A e ricaricare.
3. Importare i due file invalidi: entrambi devono essere rifiutati e A deve restare intero.
4. Importare B, ricaricare e verificare che ID, task e correzioni di A siano stati sostituiti da B.
5. Eseguire poi le prove con due schede e interruzioni descritte in docs/COLLAUDO-GAP.md. Il kit da solo non include un harness con checkpoint di crash fisico o saturazione reale della quota.

Confronto DB: ignorare SOLO la generazione interna __generation e verificare separatamente il ledger locale delle approvazioni consumate, che non viene ripristinato dal backup. Le altre differenze devono essere motivate; salvataggi ordinari della UI dopo il restore vanno registrati separatamente.

## Evidenza di questa preparazione

6 settembre 2026: quattro test del kit superati con fake-indexeddb. Browser gestito: tentativo sull'app Vite avviata a http://127.0.0.1:5198/ rifiutato con net::ERR_BLOCKED_BY_CLIENT. Non usati percorsi alternativi per aggirare il blocco.

G01/G02/G03/G08 restano aperti: nessuna prova di crash fisico, quota reale, due schede reali o UI completa è certificata. Nessuna modifica a codice di produzione, contenuti WordPress o credenziali.
