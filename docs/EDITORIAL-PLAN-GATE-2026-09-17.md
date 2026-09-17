# Piano editoriale — Release Gate 2026-09-17

## Obiettivo

Chiudere il modulo canonico **Piano editoriale** senza introdurre un nuovo modulo di suite e senza generare contenuti in assenza di contesto progetto verificabile.

## Contratto funzionale

Ogni voce del piano strutturato espone:

- topic;
- keyword;
- intento;
- cluster;
- stato;
- brief;
- data prevista;
- eventuale collegamento a Posizionamenti;
- eventuale collegamento a Opportunità.

Intento e cluster restano vuoti/da definire quando non esiste evidenza Topical Map. Ranking e opportunità sono associati solo tramite keyword normalizzata esatta.

## Persistenza

Stato e brief sono salvati in `preferences.projectSettings[clientId].editorialPlanState`.

La data prevista continua a usare `editorialSchedule`, già parte delle impostazioni progetto e dei backup. Non viene introdotta una nuova chiave workspace e non è richiesta una migration.

## Gate contesto progetto

La generazione editoriale passa da `apiFetch` e, prima della richiesta `/api/generate`, viene ricostruito un contesto strutturato con:

1. ID progetto valido;
2. nome progetto;
3. URL progetto;
4. almeno una evidenza SEO reale tra:
   - Search Console;
   - Audit SEO;
   - ranking;
   - Topical Map;
   - task collegata al workflow.

Se il Gate non è soddisfatto la richiesta viene bloccata con `PROJECT_CONTEXT_REQUIRED` prima di raggiungere OpenAI.

I prompt tecnici `Remediation WordPress …` sono esclusi esplicitamente dal Gate editoriale e mantengono il flusso AutoFix esistente.

## Test obbligatori

- contesto senza progetto: bloccato;
- progetto senza evidenza SEO: bloccato;
- GSC/Audit/Ranking/Topical Map/task: fonti valide;
- serializzazione fail-closed;
- campi editoriali completi;
- intent/cluster non inventati;
- ranking/opportunità solo su match esatto;
- stato/brief persistenti;
- bozza associata solo al topic corrispondente;
- workspace montato sulla pagina canonica;
- boundary `/api/generate` protetto;
- remediation WordPress esclusa dal Gate editoriale;
- Release Gate completa Ubuntu + macOS.
