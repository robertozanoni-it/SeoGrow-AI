# Impostazioni — Gate 2026-09-17

## Source of truth

Le policy controllabili dall'utente sono salvate per progetto in:

`seogrow-preferences-v1 → projectSettings[clientId].suitePolicy`

Non esiste una seconda configurazione operativa del progetto in `.env`.

## Preferenze progetto

### Esclusioni Audit

- privacy/cookie/GDPR/termini restano esclusioni SEO obbligatorie;
- l'utente può aggiungere path esatti, ad esempio `/thank-you/` o `/area-riservata/`;
- il path e i suoi discendenti vengono esclusi da pagine, issue, review item, failure e broken link in base alla pagina sorgente;
- una pagina esplicitamente esclusa non produce uno score SEO operativo.

### Policy correzioni

Le seguenti protezioni sono invarianti e non possono essere indebolite dalle preferenze:

- approvazione obbligatoria prima di ogni write;
- preview prima dell'applicazione;
- preflight/stale-state fresco;
- rollback e receipt di verifica.

SEO Agent e GEO AI non ottengono un writer tramite le Impostazioni.

### Sicurezza write

`writeSecurity.writesEnabled` è il kill-switch per progetto.

Quando è disattivato il boundary `apiFetch` blocca le richieste di scrittura applicativa:

- `/api/wordpress/draft`;
- `/api/wordpress/live-apply`;
- `/api/wordpress/taxonomy-apply`;
- `/api/wordpress/elementor-shared-link-apply`.

Restano consentite letture, preview, verifiche e rollback. Il kill-switch non può impedire una operazione di recovery.

### Retention e log

La retention automatica riguarda soltanto storici non autoritativi:

- audit sito/pagina;
- ranking;
- SEO Agent analysis-log;
- snapshot GEO.

Correzioni e Task non vengono eliminate automaticamente perché partecipano alla riconciliazione dello stato SEO.

### Feature flag progetto

Sono controllabili in Impostazioni e applicati realmente:

- `geoDiagnostics` → blocca `/api/geo/simulate`;
- `editorialGeneration` → blocca la generazione editoriale ma non la generazione tecnica di remediation;
- `batchAutoFix` → disabilita le azioni Batch AutoFix lasciando disponibili le correzioni singole.

## Compatibilità legacy

La vecchia preferenza globale `approveWordPress` viene mantenuta forzatamente a `true`. Non può quindi indebolire il nuovo contratto di approvazione obbligatoria.

## Cosa può restare in `.env`

Soltanto configurazione server/runtime che non è una policy del singolo progetto:

- API key, OAuth secret e credenziali provider;
- token dell'API locale;
- limiti/budget runtime dei provider;
- porte, origin e parametri di sicurezza del processo.

Non devono essere variabili `.env` esclusive:

- write on/off del progetto;
- esclusioni Audit;
- retention progetto;
- feature flag GEO/Batch/Piano editoriale;
- approvazione delle correzioni.

## Gate

PASS soltanto se:

1. le policy sono isolate per progetto e conservano le altre impostazioni del progetto;
2. le esclusioni Audit personalizzate modificano realmente l'output operativo;
3. il kill-switch write blocca le write ma non preview/verifica/rollback;
4. l'approvazione obbligatoria e gli altri safety gate non sono disattivabili;
5. la retention non elimina Correzioni o Task canonici;
6. i feature flag hanno un effetto reale nei rispettivi flussi;
7. nessuna policy critica controllabile dall'utente esiste soltanto come variabile d'ambiente;
8. segreti e token non vengono spostati nel workspace del progetto.
