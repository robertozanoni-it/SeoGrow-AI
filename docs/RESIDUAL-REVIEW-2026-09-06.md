# SeoGrow AI — revisione residua indipendente, 6 settembre 2026

Baseline: `4d64254b500c6cd612f7bc3771882afc7bc242dd`, `origin/main` verificato tramite GitHub. Branch di revisione: `audit/residual-review-20260906`.

## Esito e perimetro

Revisione NON chiusa. Eseguiti due passaggi di ricerca su codice e test, con riproduzioni avversariali e correzioni. Non sono stati completati due passaggi visuali: il browser gestito ha rifiutato `http://127.0.0.1:5198/` con `net::ERR_BLOCKED_BY_CLIENT`. Il server e Vite erano effettivamente avviati su porte separate (8798/5198), senza credenziali o dati del sito cliente. Non è stato aggirato il blocco.

Nessuna scrittura su WordPress reale. Nessuna riapertura operativa di Rank Math; Connector e script Rank Math invariati. La suite di regressione esistente include test offline Rank Math.

La copia locale preesistente aveva modifiche non committate; è stata preservata usando un worktree separato dal commit esatto. I test usano le dipendenze già presenti nella copia locale; la CI deve verificare anche `npm ci` dal lockfile.

## Inventario verificato

- React/Vite: App centrale, AgentPage, AuditWorkspace, CorrectionsWorkspace, integrazioni, task, dati cliente e contenuti.
- Persistenza: chiavi localStorage per clienti/GSC/audit/task/preferenze; IndexedDB per snapshot delle correzioni; file locali per OAuth e budget.
- Express: `server/index.js`, autorizzazione locale e registrazione esplicita degli adapter via `remediationBootstrap.js`.
- WordPress: connessione/ispezione, anteprima/apply/rollback, taxonomy, identità e ownership, trasporto HTTPS con IP pubblico fissato.
- Elementor: inventory, reference targets, impact, coverage registry/proof/attestation/reconciliation. Contratti condivisi restano read-only.
- Agent: planner a cinque workflow, registry/cache/in-flight, policy, approvazioni, budget, orchestrator e storico.
- CI: Release Gate (qualità, browser smoke, launcher macOS); WordPress staging E2E solo su workflow_dispatch.
- Nessun comando typecheck nel package.json. Il lint esclude gli script `.mjs`: copertura statica incompleta, non equivalente a typecheck.

## Riscontri

Gravità riferita all'impatto potenziale, non alla prova di sfruttamento su un sito reale.

| ID | Area | Problema | Gravità | Causa | Correzione | Test / prova | Stato |
|---|---|---|---|---|---|---|---|
| R01 | Agent/cache | `/Page` e `/page` condividono risultato | Alta | Lowercase sull'intero fingerprint | Serializzazione strutturata case-sensitive | residualAgent: due input distinti | CORRETTO |
| R02 | Agent/permessi | approvalGranted scavalca READ_ONLY; modalità sconosciuta consente write | Alta | Override indifferenziato, default permissivo | Override solo se approvazione prevista; modalità validate | residualAgent: zero scritture | CORRETTO |
| R03 | Agent/cancellazione | Segnale già annullato non impedisce esecuzione | Alta | Listener aggiunto dopo abort | Check prima di cache/esecuzione; cleanup al dismount UI | residualAgent; test cancellazione esistente | CORRETTO |
| R04 | Agent/cache write | Nuovo run può ricevere successo senza nuova scrittura | Alta | Cache cross-run anche per tool mutanti | Cache cross-run solo read; dedup in-run mantenuta | residualAgent: due esecuzioni reali | CORRETTO |
| R05 | Agent/timeout | Singolo tool supera maxDurationMs | Media | Budget controllato solo tra step | Timeout limitato al tempo residuo | residualAgent: abort entro budget | CORRETTO |
| R06 | Agent/attendibilità | Step obbligatorio vuoto consente COMPLETED | Alta | requiredFailure solo su eccezioni | EMPTY obbligatorio rende il run parziale | residualAgent: Top 10 senza ranking | CORRETTO |
| R07 | Ranking | Dato vecchio prevale sul recente | Alta | Map sovrascritta dallo storico meno recente | Ordinamento checkedAt e prima osservazione | residualAgent: 12 recente vs 18 storico | CORRETTO |
| R08 | Provenance | Letture salvate dichiarate live | Media | freshness costante | saved-data per LOCAL_DATA, cached per cache cross-run | Contratto registry, suite Agent | CORRETTO |
| R09 | HTTPS | HTTP 204 e corpo eccessivo possono provocare eccezioni non gestite | Alta | Response con body vietato; stream senza handler error | Null body per HEAD/204/205/304; error/aborted gestiti | pinnedHttpsFetch: eventi trasporto simulati | CORRETTO |
| R10 | Audit/storico | Pagine non ricontrollate e label cambiate risultano risolte | Alta | Semplice differenza testuale tra elenchi | Identità per famiglia/risorsa; prova pagina 2xx e metrica; esclusione review-only | residualData: crawl ridotto, label, review, caso positivo | CORRETTO |
| R11 | Task | Nuovo audit perde stato/note o non riapre ricomparse | Alta | Due algoritmi di sostituzione incompatibili | Riconciliazione condivisa; identità, note e scadenze preservate | residualData: due clienti, regressione, crawl vuoto | CORRETTO |
| R12 | Backup | La funzione di lettura modifica IndexedDB; workaround globale su confirm | Alta | replaceCorrections dentro parser | Parser senza scritture; restore dopo conferma, await prima del feedback | residualData: lettura senza IndexedDB | CORRETTO |
| R13 | Backup | Backup di meta SEO/taxonomy validi non importabili | Alta | Allowlist limitata ai campi core | Inclusi i campi prodotti dagli adapter esistenti | residualData: snapshot meta e taxonomy | CORRETTO |
| R14 | Multi-cliente/credenziali | Vecchie connessioni rimangono dopo restore/delete; righe/password Correzioni attraversano cambio cliente | Alta | Stato transitorio non invalidato né filtrato subito | Connessioni eliminate/invalidate; password e righe scoped; rollback ricontrolla client | Revisione flusso, lint/build; UI visuale bloccata | CORRETTO |
| R15 | WP/rollback | Sottocartella installazione persa | Alta | base.pathname forzato a `/` | Conservata la base esplicita WordPress | residualRollback: `/blog/wp-json/` | CORRETTO |
| R16 | WP/rollback | Campo non coperto da expectedCurrent può essere scritto | Alta | Controllo solo sui campi del confronto | Ogni campo della patch deve avere snapshot | residualRollback: 409 e zero POST | CORRETTO |
| R17 | WP/rollback | Successo anche se WordPress ignora il ripristino | Alta | Nessun confronto risposta-valore richiesto | ROLLBACK_UNVERIFIED se risposta diversa | residualRollback: risposta che ignora titolo | CORRETTO |
| R18 | WP/URL | Permalink numerico scartato come archivio | Media | Euristica sul segmento numerico | Rimossa classificazione client senza prova; ispezione server | residualApi: products/123 raggiunge API | CORRETTO |
| R19 | API/cancellazione | GET ritentata dopo annullamento esplicito | Media | Retry indistinto | Niente retry su abort esplicito; cleanup fallback segnali | residualApi: una sola fetch | CORRETTO |
| R20 | OpenAI/budget | I due endpoint remediation saltano il budget mensile condiviso | Alta | Chiamate dirette separate dal ledger | Estratto e riusato il medesimo modulo budget; preflight e settlement per chiamata | remediationBudget: zero fetch con budget esaurito, ledger aggiornato | CORRETTO |
| R21 | CI | checkout/setup-node v4 usano Node 20 | Media | Action deprecated | v5, manifest ufficiali dichiarano Node 24; Node applicazione resta 22 | Manifest ufficiali letti; verifica CI richiesta | CORRETTO |
| V01 | Sicurezza/API | Possibile endpoint montato senza autenticazione | Alta | Ipotesi avversariale | Nessun fix necessario nella copertura provata | endpointAuthorization: tutte le route API non pubbliche montate restituiscono 401 | NON PROBLEMA |
| L01 | Browser/UX | Navigazione, responsive, modali e feedback non collaudati integralmente | Alta | Browser gestito blocca URL locale | Nessun aggiramento | ERR_BLOCKED_BY_CLIENT; app avviata | BLOCCATO |
| L02 | Persistenza | Restore workspace non atomico tra localStorage e IndexedDB | Alta | Più store e salvataggi React differiti | Ridotto il rischio di scrittura prima della conferma, ma nessuna transazione cross-store | Analisi useStoredState + restoreBackup | BLOCCATO |
| L03 | Recovery WordPress | Snapshot salvato solo dopo la scrittura remota | Alta | Assenza journal pre-write | Journal IndexedDB prima della richiesta, per pagine e tassonomie; esito incerto conservato dopo errore | R27: storage indisponibile, risposta persa, rilettura da nuova connessione, settlement fallito | CORRETTO |
| L04 | Concorrenza | Read-check-write REST core non è compare-and-swap atomico sul server WP | Alta | Aggiornamento esterno possibile tra GET e POST | Check stale e copertura campi rafforzati; rischio residuo da trattare con protocollo Connector | Revisione live-apply/live-rollback; test reali concorrenti assenti | DA VERIFICARE SU SITO REALE |
| L05 | Elementor | Global widget/reusable template/CPT non dimostrati sul sito testato | Alta | Baseline senza template_id/templateID e senza fixture reali per tutte le classi | Mantenuti fail-closed e sharedWriteAllowed:false | Suite contratti/ownership, nessuna nuova prova live | DA VERIFICARE SU SITO REALE |
| L06 | Costi | Tariffe da configurazione e usage mancante non costituiscono fatturazione completa | Media | Contatore stimato, risposte incomplete/timeout e prezzi configurati | Integrati gli endpoint mancanti; non certificata equivalenza alla fattura provider | Test usage valido; consumo reale non eseguito | BLOCCATO |
| L07 | Dati/Agent | Provenance completa e freshness semantica non validate per ogni forma importata | Media | Schemi output permissivi e input da dati salvati | Rimossa etichetta live ingannevole; non aggiunte prove inventate | Lettura schema/registry/import | BLOCCATO |

## Bug corretti

R01–R21. I test avversariali dei gruppi Agent, HTTPS, dati, API e rollback sono stati prima eseguiti sulla logica difettosa e hanno riprodotto i problemi; poi sono passati dopo i fix. Il controllo budget aggiunge test comportamentali di preflight e contabilizzazione. Il controllo API estende la verifica di autenticazione a tutte le route montate, non a un elenco manuale.

## Bug ancora aperti

L02 resta un difetto architetturale residuo. L03 è corretto nel proseguimento descritto sotto; la recovery resta manuale e il crash del browser/OS non è stato collaudato sul sito reale. L04 richiede una prova di concorrenza e un'eventuale operazione atomica lato WordPress. Il fix R17 conferma la risposta dell'update, non la durabilità cross-request né il frontend pubblico: non va interpretato come chiusura di L03/L04.

## Limiti reali ancora non verificabili

L01, L05–L07. Nessuna credenziale cliente copiata o usata. Non eseguite chiamate a pagamento, invii editoriali o modifiche live. Il gate browser CI è uno smoke test; non equivale all'esplorazione manuale completa richiesta. I quattro documenti architetturali citati nel contesto precedente non sono presenti tra i file tracciati di questa baseline.

## Regressioni trovate e corrette

Durante l'estrazione del contatore OpenAI, `/api/openai/status` restituiva 500 perché il riferimento `openAiReserved` non era più nello scope. Il test HTTP esistente lo ha rilevato; è stato ripristinato tramite export/import live binding e il test è tornato verde. È stato inoltre corretto un rischio di doppio rilascio della prenotazione budget in caso di errore di scrittura del ledger; un test con disco simulato pieno dimostra che la prenotazione concorrente resta intatta.

## Migliorie UX implementate

Conservazione lavoro nei task, riapertura delle ricomparse, feedback backup dopo il restore, meno falsi “risolti”, etichette freshness corrette e isolamento immediato delle righe Correzioni. Verifica visuale ancora bloccata.

## Debito tecnico residuo

App e server monolitici, logiche duplicate tra workspace e App, dipendenza da DOM/localStorage/eventi globali, test numerosi basati su regex del sorgente, schemi import/output non uniformi, nessun typecheck, lint `.mjs` assente. Le copie locali automatiche non comprendono un'istantanea sincronizzata di IndexedDB. Il filtro “ultimo batch” globale è stato corretto nel proseguimento R26. Nessuna dichiarazione di revisione esaustiva di ogni combinazione UI/provider.

## Stato Release Gate

Baseline remoto: Release Gate #569, successo, https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34034353888 .

Verifiche locali della revisione: baseline 457 test; dopo i fix 483/483 test nella suite completa. Lint e build superati; `zsh -n AVVIA.command` superato; pacchetto Connector verificato (12 file); npm audit: 0 vulnerabilità. PHP non disponibile localmente; verifica demandata alla CI. Il warning npm `Unknown env config http-proxy` viene dall'ambiente, non dal repository.

Il primo push è stato rifiutato dalla revisione automatica delle autorizzazioni. Roberto ha successivamente autorizzato esplicitamente la pubblicazione su GitHub e la creazione della PR in bozza. L’esito del nuovo Release Gate deve essere verificato nella PR sul commit pubblicato. Questo documento non attribuisce il verde della baseline alle nuove modifiche.

## Stato repository

Modifiche isolate nel branch di revisione, senza merge su main. Connector 1.3.1 e contenuti WordPress invariati. Pubblicazione del branch e PR in bozza autorizzate esplicitamente; nessun merge su main incluso in questa operazione. Nessuna pretesa di “tutto risolto” o di completamento dei due passaggi visuali richiesti.


## Proseguimento autorizzato — ulteriore ciclo avversariale

Base: PR #35, commit `23fe9cceabd7d7ad8ee95ece75129e351f54dca7`. Release Gate #570 superato nei tre job quality, browser-ui-smoke e macos-launcher-smoke. Nessun merge.

Primo passaggio: credenziali, persistenza e recovery. Secondo passaggio: errore di clonazione nelle patch, risposta incompleta, invalidazione delle anteprime, contatori e identità connessione. Tutti i nuovi test comportamentali usano dati sintetici, senza credenziali reali né scritture WordPress. I tre test iniziali IndexedDB hanno fallito sulla logica precedente (lost update, import parziale, orfani) e sono passati dopo le correzioni.

| ID | Area | Problema | Gravità | Causa | Correzione | Test / prova | Stato |
|---|---|---|---|---|---|---|---|
| R22 | Sicurezza multi-cliente | Riverifica automatica taxonomy può leggere password del cliente visibile per un altro sito | Alta | Fallback globale a input DOM | Credenziali solo esplicite con clientId e base HTTPS identici; rollback valida lo stesso legame e privilegia username corrente | correctionCredentials: assenza, altro cliente, altro host, sottocartella, credenziali corrette | CORRETTO |
| R23 | Persistenza | Aggiornamenti concorrenti perdono campi dello snapshot | Alta | GET e PUT in transazioni separate | Read-modify-write in singola transazione; identità record preservata | remediationPersistence: Promise.all di due patch, entrambe conservate | CORRETTO |
| R24 | Import | Eccezione sincrona consente commit parziale dopo clear | Alta | Reject senza abort della transazione | Abort esplicito; abort anche per patch non clonabile nel callback | remediationPersistence: archivio originale intatto dopo record non clonabile | CORRETTO |
| R25 | Clienti | Eliminare ultimo cliente lascia snapshot orfani visibili | Alta | Lista vuota trattata come lista non disponibile | Distinte lista vuota e storage mancante | remediationPersistence: lista vuota nasconde e purge rimuove orfani | CORRETTO |
| R26 | UX Correzioni | Ultimo batch di altro cliente nasconde cronologia selezionata | Media | Filtro batch globale | Ultimo batch derivato dai record del cliente; contatori sul batch visualizzato | Revisione flusso, suite completa, lint/build; visuale integrale non disponibile | CORRETTO |
| R27 | Recovery WP | Risposta persa o errore storage dopo write può perdere rollback | Alta | Snapshot persistito dopo la richiesta | Journal pre-write con stesso id; zero invii se non salvabile; Esito incerto se risposta/settlement falliscono; niente riverifica SEO automatica di esito incerto | correctionJournal + remediationPersistence: ordine, errori, snapshot incompleto, nuova connessione IndexedDB | CORRETTO |
| R28 | UX Taxonomy | Eventi storico annullano anteprima e ID da riverificare | Media | Revision generica inclusa nell'identità dell'ispezione | Identità limitata a cliente/audit/risorsa/connessione | Revisione dipendenze effect, test wiring, suite e build; visuale integrale non disponibile | CORRETTO |
| R29 | Approvazioni | Credenziali e contesto possono cambiare dopo anteprima | Alta | Token non accompagnato da controllo client-side del sito originario | Snapshot del contesto anteprima; confronto cliente/sito immediatamente prima della richiesta | Guard correctionCredentials, controlli contesto, suite live/taxonomy | CORRETTO |
| R30 | UX Attendibilità | Nuovo journal incerto mostrerebbe badge WordPress verde | Media | Badge precedentemente costante | Badge da controllare, stato Esito incerto tra pending, label password accessibile, azioni verifica/rollback disabilitate mentre altra azione è in corso | Revisione JSX, lint/build; visuale integrale non disponibile | CORRETTO |

### Bug corretti

R22–R30, oltre ai precedenti R01–R21. L03 passa a CORRETTO per la persistenza dello snapshot prima dell'invio; non certifica una transazione distribuita o il rollback atomico lato WordPress.

### Bug ancora aperti

L02: ripristino workspace tra localStorage e IndexedDB non atomico. L04: concorrenza REST esterna non atomica. Nessuna nuova scrittura reale per provare queste condizioni.

### Limiti reali ancora non verificabili

L01, L04–L07 rimangono. Il browser gestito era bloccato sull'app locale; lo smoke CI #570 non copre ogni modulo, modale e combinazione di dati. La recovery di Esito incerto richiede ispezione manuale dello stato WordPress; non viene automaticamente ritentata. Non simulato arresto fisico del browser/OS né dimostrato recovery multi-dispositivo.

### Regressioni trovate e corrette

La nuova modalità ultimo batch inizialmente lasciava contatori su tutto lo storico: riallineati al batch visualizzato. Nel secondo passaggio, una patch IndexedDB non clonabile richiedeva abort anche nel callback di lettura: aggiunto e testato. Tre test testuali aspettavano saveCorrection direttamente nei componenti: aggiornati al collegamento applyJournaledCorrection, affiancati da test comportamentali del journal e della persistenza.

### Migliorie UX implementate

Cronologia ultimo batch per cliente, contatori coerenti, password con nome accessibile, conservazione anteprima taxonomy agli aggiornamenti dello storico, feedback esplicito per esito incerto, blocco delle azioni concorrenti verifica/rollback nella schermata Correzioni.

### Debito tecnico residuo

Persistenza cross-store, coordinamento cross-tab delle operazioni remote, provenance completa degli import e test visuali estesi. fake-indexeddb aggiunto solo come dipendenza di sviluppo per testare transazioni reali dell'API IndexedDB in memoria; non sostituisce il collaudo browser/OS.

### Stato finale Release Gate

Verifiche locali del proseguimento: 496/496 test superati; lint e build superati; dependency audit 0 vulnerabilità. La CI del nuovo commit deve essere verificata separatamente: il verde #570 si riferisce alla base del proseguimento. Restano warning delle dipendenze delle Actions (punycode/url.parse), non errori del codice applicativo.

### Stato finale repository

Aggiornamento destinato allo stesso branch e alla stessa PR #35 in bozza, autorizzati da Roberto. Nessun merge su main, nessuna modifica al Connector o ai contenuti reali WordPress, nessuna riapertura del ciclo Rank Math.
