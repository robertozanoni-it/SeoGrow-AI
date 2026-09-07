# G09 — Multi-client isolation guard

Data: 7 settembre 2026.

## Obiettivo

Rafforzare il requisito G09: durante cambio cliente, nessuna richiesta lenta, operazione WordPress, credenziale o risposta completata deve essere consumata nel contesto del cliente sbagliato.

## Fix implementato

Commit applicativo: `ccf807feefcc9be9d510432f641c4aebce21b5cf`.

`src/api.js` ora considera client-scoped:

- DataForSEO;
- GEO simulation;
- generazione AI;
- site analysis;
- frontend inspect;
- tutte le route `/api/wordpress/`, incluse connection-check, inspect, preview/apply/rollback, reconcile e verify.

Ogni richiesta client-scoped conserva il `clientId` selezionato al momento della partenza. Se il progetto cambia:

1. il relativo `AbortController` viene abortito;
2. anche il passaggio a nessun cliente (`null`) invalida la richiesta;
3. il client viene ricontrollato immediatamente prima della fetch;
4. il client viene ricontrollato nuovamente dopo normalizzazione della risposta e prima di restituirla alla UI.

Il controllo post-risposta evita che una risposta arrivata in race con il cambio progetto venga consumata dal nuovo contesto anche nel caso in cui il trasporto non reagisca in tempo all'abort.

## Credenziali e rollback

`correctionCredentials()` continua a richiedere corrispondenza esatta tra:

- `clientId` della correzione e cliente attivo;
- `siteUrl` della correzione e sito della connessione;
- credenziali esplicitamente fornite.

La password di rollback in `CorrectionsWorkspace` resta associata al `clientId` per cui è stata inserita e non viene riutilizzata quando cambia il progetto selezionato.

## Test automatici

Commit test: `657ee6a5f3443a38e2bf85333fa4b7c8dfc95377`.

`src/multiClientIsolation.test.js` copre:

- inclusione di tutte le classi di richieste client-sensitive nel guard;
- controllo pre-fetch e post-response del cliente selezionato;
- invalidazione anche quando il cliente viene deselezionato;
- rifiuto credenziali di altro cliente;
- rifiuto sito WordPress differente;
- password rollback associata al cliente selezionato;
- doppio controllo del client prima del rollback.

Release Gate #620 (`34068981554`) completato con successo: quality, browser-ui-smoke e macos-launcher-smoke verdi.

## Stato G09

**PARZIALMENTE COPERTO — guard applicativo e regressioni automatiche PASS.**

Resta da eseguire il collaudo UI reale con due clienti fittizi e richiesta ritardata, cambio cliente durante operazione, reload e verifica che nessun risultato/credenziale/stato venga mostrato o applicato al cliente B. Il documento non dichiara G09 completamente chiuso fino a tale prova.
