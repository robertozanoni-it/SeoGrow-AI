# SeoGrow AI — correzione batch dei problemi

## Stato della consegna: PARTIAL

Implementazione fornita come patch, aggiornamento installabile e sorgenti completi. Non è stata distribuita nella copia locale dell’utente, né integrata nel ramo di lavoro GitHub. Nessuna modifica live a WordPress, nessun merge in main.

Baseline: ramo `ux/simple-numbered-wizard`, commit `86c2cc76737c29411f39fe7a3fcf456378b60f26`. I checksum dei singoli file sono in `manifest.json`. Il ramo temporaneo GitHub `feat/problems-batch-remediation-20260912` è stato ripulito dai file di trasferimento e dal workflow temporaneo: il confronto finale con la baseline non mostra differenze di file. I commit preparatori rimangono nella cronologia. Non contiene questa implementazione: un semplice git pull non installa il batch.

## Funzioni implementate

Nella pagina Problemi sono presenti checkbox per ogni scheda, selezione dei soli risultati visibili, contatore, selezione rapida e due azioni: «Risolvi problemi in batch» e «Risolvi tutti i problemi risolvibili». Un filtro non può estendere silenziosamente la selezione a problemi nascosti.

Le schede espongono pagina e destinazione cliccabili, anchor text quando disponibile, data, gravità, priorità, stato dell’intervento e ultima verifica. Nessun anchor text viene inventato quando assente dai dati.

Il preflight usa il motore WordPress già presente: connessione, identificazione del contenuto, ownership, verifica della baseline e delle eventuali correzioni pendenti. Genera anteprime prima/dopo, rileva conflitti tra campi della stessa risorsa e consolida patch identiche. Le scritture richiedono approvazione del piano; le categorie ad alto rischio richiedono conferma aggiuntiva. La preparazione non scrive su WordPress, ma la generazione può consumare credito AI.

L’esecuzione è seriale, con registrazione persistente prima di ogni scrittura e riutilizzo del journal esistente. Un errore isolato non fa passare gli altri problemi a risolti. Errori di autenticazione, cambi di progetto, limiti di frequenza e scritture incerte arrestano le operazioni successive. L’interruzione non cancella retroattivamente una richiesta già inviata: ne conserva l’esito.

Lo stato «Applicata» è distinto da «Risolto e verificato». La verifica usa ricevuta WordPress, HTML pubblico e controlli incrementali pertinenti. Una risposta HTTP 200, da sola, non chiude il problema. I duplicati tra pagine e i casi di visibilità dinamica rimangono da verificare quando manca evidenza sufficiente.

Cronologia per cliente, recupero delle esecuzioni interrotte, retry limitato ai casi senza scrittura confermata, esportazione JSON/CSV, collegamenti alle pagine modificate e accesso alla cronologia esistente per il ripristino. Password e token di approvazione non entrano nei report; dopo un refresh non vengono riprodotte automaticamente scritture.

Costo stimato, costo effettivo e modello sono esplicitamente indicati come non disponibili quando le API esistenti non restituiscono questi dati: non sono inventati.

## Validazione eseguita

| Controllo | Esito |
|---|---|
| Suite completa Node, dopo tutte le modifiche funzionali | PASS: 1.022 test, 0 falliti, 0 saltati |
| Nuovi test planner/coda/report | PASS: 26 |
| Nuovi test runtime integrato con risposte HTTP simulate | PASS: 7 |
| Nuovo test server su precondizione della preview | PASS: 1 |
| ESLint | PASS |
| Build di produzione | PASS; avviso sul bundle principale sopra 700 kB |
| Integrità della patch e assenza di errori whitespace | PASS |
| Installazione su copia pulita con controllo checksum | PASS |
| Preservazione .env e rifiuto del secondo tentativo | PASS |
| Browser nell’ambiente locale | NON COMPLETATO: Chromium blocca 127.0.0.1 per policy dell’ambiente |
| Quattro nuovi scenari browser | Predisposti nel runner, non eseguiti con esito positivo |
| WordPress reale / staging | NON ESEGUITO |
| Dialogo macOS del file .command | NON ESEGUITO su macOS; verificato il programma Node sottostante su copia isolata |

I sette test del runtime usano effettivamente il client API, il motore condiviso, il journal e le transazioni dell’archivio tramite fake-indexeddb. Solo il trasporto HTTP remoto e l’interfaccia Web Locks sono simulati. Non equivalgono a un test end-to-end browser o a una prova su WordPress reale.

Sono coperti: assenza di write prima dell’approvazione; commit del journal prima della richiesta; verifica incrementale metadata; HTML difforme non considerato risolto; target cambiato; risposta persa dopo scrittura; isolamento del cliente; conflitto di revisione; archivio danneggiato; doppio avvio; ripresa senza replay. La suite planner comprende il caso di dieci problemi con sei correzioni indipendenti, un duplicato, un caso manuale, un errore e una risorsa obsoleta.

Il tentativo completo `qa:release` locale non ha prodotto un esito finale positivo. Lint, test e build sono stati poi eseguiti direttamente e hanno superato i rispettivi controlli. Il test browser diretto ha documentato il blocco della policy prima del caricamento dell’app. Non viene dichiarato un Release Gate superato.

## Limiti prima dell’uso operativo

Il batch non sostituisce i flussi assistiti per tassonomie, template condivisi, ownership ambigua o adapter non supportati. Gli interventi sensibili non vengono resi automatici solo perché selezionati. I controlli del problema originale, la necessità di audit tra più pagine e i blocchi di visibilità restano attivi.

Il rollback continua a usare «Correzioni / Cronologia e ripristino»; non è stato aggiunto un rollback indiscriminato dell’intero batch. Costi e modello non hanno ancora una telemetria completa nella coda. I test visuali desktop/mobile, i comportamenti tra schede reali e la prova su staging con il connettore effettivamente installato restano da completare.

Il codice non va qualificato READY né utilizzato per correzioni massive in produzione prima di queste verifiche. La prima prova operativa deve essere su staging, con backup e una piccola selezione controllata.

## Mappa delle modifiche

- Interfaccia: `ProblemsWorkspace.jsx`, `BatchRemediationPanel.jsx`, `BatchRemediationPanel.css`.
- Planner e stati: `batchRemediationModel.js`.
- Persistenza: `batchRemediationStore.js`, usando il database workspace esistente.
- Orchestrazione: `batchRemediationQueue.js`.
- Collegamento alle API reali: `batchRemediationRuntime.js`.
- Motore condiviso estratto dal flusso singolo: `wordpressRemediationEngine.js`; il controllo singolo V2 lo riutilizza.
- Server: `wordpressLiveApprovalHook.js`, precondizione opzionale before/status durante la generazione della preview.
- Riconciliazione: `problemsModel.js`, anchor disponibili e identità consolidate.
- Test: suite batch, runtime, precondizione server, test di regressione aggiornati per leggere il motore estratto; quattro scenari browser aggiunti al runner.

Totale: 28 file coinvolti, 10 nuovi e 18 modificati. Nessuna nuova dipendenza; nessuna modifica al package.json o al lockfile.

## Comandi di verifica dopo l’installazione

```sh
npm run lint
npm test
npm run build
npm run qa:release
```

`qa:release` usa una copia isolata e fixture, non deve essere sostituito con i workflow WordPress live. I log locali della consegna si trovano nella cartella `qa/` del pacchetto.
