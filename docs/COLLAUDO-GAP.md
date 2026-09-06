# SeoGrow AI — gap di collaudo e piano di chiusura

Preparato il 6 settembre 2026. Questo documento pianifica prove mancanti: non certifica la loro esecuzione.

## Baseline e decisione attuale

- Codice esaminato: `966f61edf52abac5b8225692411f570ac0d95d5d`, PR #35 in bozza.
- Ultima baseline main fornita e verificata nel lavoro precedente: `4d64254b500c6cd612f7bc3771882afc7bc242dd`.
- Release Gate #573: https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34042262287 — superato; 514 test, lint, build, contratto PHP, audit dipendenze e smoke browser/macOS.
- Il verde CI non certifica import con crash fisico, collaudo visuale completo o concorrenza reale WordPress.
- **NO-GO per dichiarare operative le scritture atomiche di remediation/rollback.** Il Connector 1.3.2 le blocca tutte, anche con expectedCurrent coincidente. Manca un adapter atomico operativo: è un gap di implementazione oltre che di test.
- Nessun merge, installazione Connector o test con modifica di contenuti reali è stato eseguito per preparare questo documento.

I rapporti storici contengono finding poi superati. Per lo stato attuale del restore usare WORKSPACE-ATOMIC-RESTORE.md; per la concorrenza usare WORDPRESS-CONCURRENCY.md. Il vecchio L02 non descrive più l'architettura corrente.

## Matrice dei gap

P0 impedisce il rilascio della funzionalità interessata. P1 impedisce di dichiarare completato il collaudo del relativo flusso. Responsabile indica un ruolo da assegnare, non una persona che ha già svolto il lavoro.

| ID | Area / priorità | Evidenza disponibile | Prova mancante | Dipendenza / responsabile | Criterio di chiusura | Stato |
|---|---|---|---|---|---|---|
| G01 | Restore / P0 | Transazione unica e abort testati con fake-indexeddb | Arresto processo browser prima, durante e dopo commit su IndexedDB reale | Profilo browser sacrificabile, checkpoint test; QA | Alla riapertura dataset interamente precedente o interamente nuovo; nessuna combinazione | BLOCCATO |
| G02 | Restore / P0 | QuotaExceededError simulato | Quota reale esaurita durante import | VM o storage di test limitato; QA | Abort completo, vecchi dati leggibili, errore comprensibile, nessun successo | BLOCCATO |
| G03 | Restore / P1 | Migrazione e generazione stale testate | Due schede, riapertura app, import/export UI, profilo già migrato | Browser locale raggiungibile; QA frontend | Nessuna riscrittura della generazione vecchia, export coerente e snapshot completi | BLOCCATO |
| G04 | WordPress writer / P0 | Rifiuti fail-closed; zero scritture nel contratto PHP | Adapter che consenta almeno una classe di scrittura atomica realmente sicura | Implementazione storage/ownership e DB di staging; integration engineer | Scrittura matching consentita con prova atomica; mismatch rifiutato; classi non supportate bloccate | BLOCCATO |
| G05 | Concorrenza WP / P0 | Conflitti simulati tra preflight e Connector; replay negato | Editor/plugin/REST esterni concorrenti durante apply e rollback | G04 e staging rappresentativo; integration engineer + QA | Nessun aggiornamento esterno precedente al punto atomico viene sovrascritto da una patch stale | DA VERIFICARE SU SITO REALE |
| G06 | Recovery WP / P0 | Journal pre-write; perdita risposta resta incerta | Risposta persa dopo commit remoto, arresto app e riconciliazione su nuova sessione | G04 e proxy controllato di staging; QA | Snapshot conservato, nessun retry cieco, stato remoto letto e risultato correttamente classificato | DA VERIFICARE SU SITO REALE |
| G07 | Elementor / P0 per scritture | Ownership baseline e sharedWriteAllowed:false | Fixture reali global/reusable/widget HTML/CSS/script/CPT, salvataggio documento e cache | Staging con versioni e template registrati; integration engineer | Ogni classe ha prova ownership e rendering, oppure resta manuale/ownership_error | DA VERIFICARE SU SITO REALE |
| G08 | UI e accessibilità / P1 | Smoke CI limitato | Tutti i moduli, modali, tastiera, zoom, responsive, errori e caricamenti | Browser dell'app raggiungibile; QA frontend | Matrice UI sottostante eseguita, nessun comando irraggiungibile o feedback falso | BLOCCATO |
| G09 | Multi-cliente / P0 | Guard e isolamento coperti da test mirati | Cambio cliente durante richieste lente/import/approvazione/rollback da UI | Due clienti fittizi e risposte ritardate; QA | Nessun dato, credenziale o comando passa nel cliente errato, anche dopo reload | BLOCCATO |
| G10 | Audit → Task / P1 | Test logici su parzialità, deduplica, riapertura | Flusso UI integrale con crawl completo/parziale, storico e riverifica | Sito fixture controllato; QA SEO | Ogni chiusura task rimanda alla stessa issue/URL e a prova finale; audit parziale non chiude per assenza | BLOCCATO |
| G11 | Agent / P1 | Test runtime e governance | Cancella/riprendi contesto, doppio avvio, approvazione stale e cronologia da UI | Provider simulati controllabili; QA runtime | Nessun doppio effetto, nessuna esecuzione dopo cancel non autorizzata, stato finale persistito e attendibile | BLOCCATO |
| G12 | Provenance e costi / P1 | Alcuni guard, budget e origine dati testati | Matrice completa campo→fonte; confronto usage e import/fallback | Dataset anonimizzati con fonte nota; data QA | Origine, cliente, URL, data, freshness e stima espliciti; assenza fonte non diventa dato verificato | BLOCCATO |
| G13 | Sicurezza ambiente / P0 per integrazioni | Test autorizzazione/URL/credenziali mirati | Ruoli WP reali, redirect controllati, scadenza credenziali, segreti nei log/HAR | Staging isolato, credenziali dedicate; security reviewer | Permessi insufficienti negati, nessuna richiesta fuori destinazione autorizzata né segreto negli artefatti | DA VERIFICARE SU SITO REALE |
| G14 | CI / P1 | Gate verde, audit 0 vulnerabilità | Warning upload-artifact Node 20 e punycode/url.parse non risolti | Individuazione dipendenza/Action responsabile; maintainer | Aggiornamento mirato verificato oppure eccezione motivata e tracciata | BLOCCATO |

## Ambiente minimo e fixture

1. Checkout separato della PR al commit congelato, versione Node e dipendenze dal lockfile. Registrare browser/versione/OS e origin esatto: cambiare porta cambia lo storage dell'app e invalida confronti tra profili.
2. Profilo browser dedicato, due schede e due clienti fittizi A/B con siti differenti. Nessuna password reale nei backup, screenshot, HAR o log allegati.
3. Due dataset distinguibili: A con task, audit pagina/sito, correzioni, storico Agent e GSC; B con ID e contenuti diversi. Esportare manifest ordinato di entrambe le collezioni IndexedDB e hash prima della prova. Includere chiavi workspace, indice, snapshot e correzioni.
4. Per WordPress: clone isolato non indicizzabile, backup DB/files ripristinabile e account di prova. Registrare WP/PHP/DB, engine tabelle, plugin, object cache e cache pubblica. Richiedere accesso solo quando il collaudo concreto è pronto. Non usare yogabuenaonda.it per prove distruttive.
5. Fixture Elementor: pagina locale, shared header/footer/single/archive, template riusabile, global widget, HTML/CSS/script e CPT. Gli ID baseline 185/327/598/584 non sostituiscono le fixture delle classi mancanti.

## Procedura restore: G01–G03

- Validare dalla UI backup valido, JSON corrotto, schema incompatibile, record incompleto e copia locale legacy senza correzioni. Per ciascun rifiuto confrontare l'intero archivio con il manifest A.
- Importare B e riaprire: dati, audit, task, indice e correzioni devono essere B. Delta intenzionali da registrare separatamente: nuova generazione interna e ledger locale delle approvazioni già consumate, che non deve essere riattivato dal backup.
- In un harness di test introdurre checkpoint osservabili prima dell'apertura della transazione, mentre è attiva dopo richieste di scrittura e dopo oncomplete. Il checkpoint non deve spezzare la transazione o causarne auto-commit. Senza prova temporale del checkpoint, classificare la prova come non conclusiva.
- Arrestare il processo browser dedicato in ciascuna finestra. Prima del commit atteso: A; dopo oncomplete: B. Se la finestra esatta non è determinabile, sono ammessi A o B completi, mai una combinazione. Una prova di abort JavaScript non vale come arresto del processo.
- Ripetere l'import con quota reale insufficiente in VM/profilo sacrificabile. Non saturare il disco del Mac di lavoro. Liberare poi la quota e verificare che un nuovo avvio renda ancora leggibile A e consenta il recupero.
- Tenere una seconda scheda con A durante il restore B. Far terminare una richiesta ritardata e tentare un salvataggio dalla vecchia scheda; verificare blocco/reload senza perdita di B. Ripetere con BroadcastChannel indisponibile per verificare il guard del database.
- Verificare migrazione una sola volta e riavvio sullo stesso origin. Il localStorage originale è una copia storica, non un backup aggiornato: il downgrade del codice non costituisce una procedura di restore.

## Procedura WordPress: G04–G07 e G13

Fase eseguibile prima di G04: collaudare su staging il rifiuto dell'attuale Connector, con snapshot matching/stale, permessi insufficienti, ID/tipo errati e meta assenti/duplicati. Zero scritture è un successo del controllo di blocco, non del writer.

Dopo implementazione dell'adapter, utilizzare due attori A (SeoGrow) e B (editor/plugin/REST esterno) e una barriera controllata:

| Sequenza | Risultato richiesto |
|---|---|
| A legge X; B salva Y; A tenta X→Z | Conflitto; Y conservato |
| A e B competono nello stesso intervallo confronto/scrittura | Ordine serializzabile dimostrato dal DB; nessuna patch di A accettata con expectedCurrent già diverso al punto atomico |
| A salva X→Z; B salva Y; A tenta rollback Z→X | Conflitto; Y conservato |
| A scrive e la risposta viene persa | Journal incerto e snapshot conservato; nessun retry automatico |
| Due richieste con lo stesso token | Al massimo una applicazione; seconda negata |
| Salvataggio ignorato, parziale o con hook in errore | Nessun successo non dimostrato; stato parziale riconoscibile e recovery controllata |

Variare case, spazi, stringa vuota, Unicode, array meta, più campi, credenziali e installazione in sottocartella. Ripetere con cache calda/fredda. Un salvataggio esterno legittimo successivo al commit può cambiare il valore: ciò non è una violazione del CAS; va distinto dai falsi successi della riverifica.

Per ogni successo raccogliere: valore DB, rilettura REST in richiesta separata, stato documento/plugin e frontend pubblico. Per Elementor confrontare anche pagine che condividono template e pagine estranee: nessun impatto fuori ownership autorizzata. Un screenshot corretto non dimostra da solo la persistenza del documento.

Non riaprire i test Rank Math già chiusi senza nuova evidenza di regressione. Il protocollo Doctor resta distinto: questa matrice non ne certifica atomicità aggiuntiva.

## Matrice visuale obbligatoria: G08–G11

Eseguire su desktop 1440×900, tablet 768×1024, mobile 390×844; controllare anche zoom 200% e navigazione da tastiera. Registrare viewport CSS e browser. I test responsive su fixture del browser-smoke non certificano il layout di ogni schermata reale.

| Flusso | Azioni da eseguire | Evidenza finale |
|---|---|---|
| Sidebar / dashboard | Aprire ogni voce, tornare indietro, reload, cambiare cliente | Voce attiva, titolo e cliente coerenti; nessuna schermata transitoria persa |
| Clienti / backup | Crea, seleziona, elimina anche ultimo cliente; export/import; due schede | Dati persistiti e isolati; conferme comprensibili; errori di restore senza successo |
| Audit SEO | Pagina/sito, limite crawl, errore rete, storico, riapertura | Scope, timestamp e incompletezza visibili; stessi risultati dopo reload |
| Task | Crea da audit, deduplica, filtra, completa, riapri, elimina, link issue | Task corretta nel cliente corretto; chiusura coerente con prova |
| Correzioni | Filtri/batch, prima/dopo, Bloccato, Esito incerto, verifica/rollback | Azioni coerenti con stato; nessun badge verde senza prova |
| WordPress | Connessione, errore credenziali, riconnessione, cambio sito | Identità chiara; password non riusata per altro sito; conflitto leggibile |
| Agent | Doppio avvio, cancel, timeout, approva/rifiuta, cambio cliente, storico | Nessun doppio effetto; cronologia persistita; partial/cancel non diventano completato |
| Content | Generazione simulata, crea task, modifica, invio bozza su staging | Ogni pulsante ha effetto verificabile; bozza resta bozza |
| Search Console | Import multiplo, associazione, cambio cliente, fonte assente | Proprietà e date coerenti; dati non associati restano riconoscibili |
| Tutte le modali/form | Tab/Shift+Tab, Esc, focus al ritorno, errori, campi lunghi, caricamento | Focus visibile; nome accessibile; nessun controllo tagliato o bloccato |

Per ogni riga provare almeno stato vuoto, popolato e errore; registrare tutte le combinazioni non eseguite. Non chiudere G08 sulla base di una sola viewport o del solo happy path.

## Provenance e attendibilità: G12

Creare una riga per ogni metrica/indicatore mostrato con: schermata, campo UI, campo salvato/API, provider o import, clientId, siteUrl/URL, acquiredAt, intervallo dati, cache/fallback, trasformazione e limite di precisione. Confrontare import datato, dati incompleti, provider indisponibile e cambio cliente.

Il costo stimato non va confrontato come se fosse una fattura certificata. Eventuale confronto con usage reale richiede dati provider autorizzati; questo piano non autorizza nuove chiamate a pagamento. Un timestamp di visualizzazione non è il timestamp di acquisizione.

## Scheda prova da compilare

Per ogni ID registrare:

- Commit app, versione/hash Connector, data/ora UTC, esecutore, OS/browser/viewport, origin, versioni WP/plugin/DB.
- Fixture e stato iniziale, passi effettivamente eseguiti, checkpoint/barriera usati, risultato atteso e osservato.
- Evidenze anonimizzate: screenshot, console errori, richieste/risposte prive di segreti, manifest/hash prima e dopo, confronto DB/REST/frontend quando pertinente.
- Esito: SUPERATO / FALLITO / NON ESEGUITO / NON CONCLUSIVO. Motivo, finding collegato, fix eventuale e commit del re-test.

Un gap passa a CORRETTO solo dopo evidenze complete e re-test del fix. NON RIPRODUCIBILE richiede tentativi documentati; NON PROBLEMA richiede una motivazione. Assenza di accesso o fixture resta BLOCCATO o DA VERIFICARE SU SITO REALE.

## Ordine operativo e criteri di rilascio

1. Preparare profilo e dataset locali; chiudere G01–G03, G08–G11 con browser realmente raggiungibile.
2. Implementare G04 per una classe circoscritta, mantenendo le altre bloccate. Solo dopo eseguire G05–G07/G13 su staging.
3. Chiudere la matrice provenance G12 e trattare i warning G14.
4. Ripetere un secondo passaggio avversariale sui confini corretti: import più cambio cliente, risposta ritardata dopo restore, rollback dopo modifica esterna, doppia approvazione, perdita risposta.
5. Eseguire Release Gate sul commit finale e aggiornare il registro delle prove; gli esiti di commit precedenti non coprono modifiche successive.

Rilascio della funzionalità di scrittura: NO-GO finché G04–G07 pertinenti e G13 non sono chiusi. Dichiarazione di collaudo completo dell'app: NO-GO finché rimangono righe non eseguite nelle aree obbligatorie. Un eventuale rilascio con funzioni limitate deve dichiarare esattamente i blocchi e non presentare la remediation come operativa.

Prossimo passo consigliato: predisporre il profilo browser e i dataset A/B per le prove locali, mentre si definisce l'adapter atomico WordPress da implementare; non chiedere all'utente di eseguire test ripetitivi di scrittura finché G04 è aperto.
