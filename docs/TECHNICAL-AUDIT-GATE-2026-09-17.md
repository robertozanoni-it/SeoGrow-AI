# Step 19 — Audit tecnico

Data: 2026-09-17

## Obiettivo

Il Gate tecnico deve dimostrare con test realmente eseguiti che la suite è verde su lint, unit/integration/storage, build, browser smoke, errori console, concorrenza, chiamate di rete fallite e boundary di sicurezza.

## Contratto eseguito da `qa:release`

- **Lint** — ESLint sull'intero repository.
- **Unit / integration / storage** — tutti i file `src/*.test.js` vengono eseguiti dal Node test runner; il gruppo include persistenza, IndexedDB, policy, remediation e integrazioni.
- **Build** — build Vite production.
- **Browser smoke** — browser reale tramite CDP sul runtime isolato creato dalla QA.
- **Evidenze** — `browser-report.json` viene validato contro gli scenari obbligatori della matrice.

## Browser / runtime errors

Il browser Gate fallisce se rileva:

- `Runtime.exceptionThrown`;
- `console.error` tramite `Runtime.consoleAPICalled`;
- `Network.loadingFailed` non dovuti a cancellazione intenzionale.

Questi controlli avvengono prima che `browserReport.ok` possa diventare `true`.

## Concurrency e storage

Scenari obbligatori già presenti:

- `TASK-004` — reload durante una transazione IndexedDB realmente in flight; accetta soltanto record completi vecchi o nuovi, mai dati parziali o ID duplicati.
- `STORAGE-QUEUE-001` — errore nativo `QuotaExceededError`; nessuno stato fantasma e dati durevoli invariati dopo reload.
- `STRESS-500` — 500 task, isolamento progetto, ricerca e persistenza dopo reload.
- `IDB-REAL-001` — abort reale di transazione IndexedDB e verifica del record precedente dopo reopen.

Inoltre `apiFetch` associa un `AbortController` alle richieste project-scoped e le interrompe quando il progetto selezionato cambia, impedendo late response cross-project.

## Failed network calls

`ERROR-001` inietta e verifica almeno:

- HTTP 400;
- HTTP 500;
- offline;
- timeout;
- JSON non valido;
- risposta vuota.

Il requisito è: errore leggibile, loading concluso, dati Task preservati e retry successivo funzionante.

## Security boundaries

- Il kill-switch progetto blocca soltanto i path di write WordPress dichiarati (`draft`, `live-apply`, `taxonomy-apply`, `elementor-shared-link-apply`).
- Preview e rollback non fanno parte del write set e restano disponibili per diagnosi/recovery.
- La password applicativa WordPress vive soltanto nel session store in memoria e scade dopo 30 minuti; non usa workspace/localStorage.
- Il runtime QA non eredita OpenAI/DataForSEO credentials né legge il `.env` dell'utente; usa token e chiavi di cifratura QA disposable.
- Le policy controllabili dall'utente restano project-scoped e sono già coperte dal Settings Gate.

## Gate Step 19

PASS solo se la Release Gate dell'HEAD finale termina `completed / success` su Ubuntu e macOS, compresi browser QA e launcher smoke reale.
