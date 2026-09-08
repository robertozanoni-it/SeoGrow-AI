# Stato collaudo residuo — 2026-09-07

## Perimetro e risultato

Chiusura del filone trasporto autenticato WordPress: runtime e script QA standalone.
Baseline del batch trasporto: `main` al merge commit `3d187b16b0d183941cdf2da2d90d3b7eb88c1f7b`.
Le PR #35, #37, #38, #39, #40, #41, #42, #43, #44, #45, #46, #47, #48, #49 e #50 sono **merged**, verificato tramite GitHub.

La scansione di `server/` e `scripts/` non rileva richieste WordPress REST autenticate instradate al fetch nativo: gli script usano direttamente `pinnedHttpsFetch`; nel runtime restano anche call site `fetch(...)` intercettati dal boundary centrale di `remediationBootstrap.js`. Non equivale a zero occorrenze testuali di `fetch`.

Il batch interno iniziale non ha eseguito accessi WordPress live/staging. Successivamente, su richiesta esplicita, è stato collegato lo staging autorizzato: le letture e il ciclo di creazione/pulizia degli utenti temporanei sono documentati sotto. Nessuna scrittura di contenuti o modifica Elementor shared in questa estensione. I test automatici delle route usano DNS/HTTPS simulati e un server SeoGrow locale. Provider AI invariati: OpenAI e DataForSEO.

## Batch completati e controlli

- #44: diagnostica taxonomy e consistency sampler autenticati pinned.
- #45: Doctor, Doctor convergence, general E2E e inventario globale Rank Math pinned solo per REST autenticato; mock comportamentali aggiornati senza modificare i flussi E2E.
- #46: preflight taxonomy E2E e postwrite sampler pinned; test su separazione dei tre trasporti, tre campioni e rifiuto fail-closed senza fallback.
- #47: audit finale delle due route legacy `wordpress/test` e `wordpress/draft`: sostituito il wrapper pubblico, già IP-pinned ma capace di seguire redirect con credenziali, con `pinnedHttpsFetch` diretto. Timeout 12s/15s conservati; test simulati di successo e rifiuto 301/302/303/307/308 senza seconda richiesta. Esplicitati inoltre i timeout socket a 30s dei POST Doctor per conservare il budget originale.
- Contratto `function registerRoutes(app)` invariato; architettura e fail-closed verificati dalle suite esistenti.

## Scansione globale e classificazione

Ricerca effettuata con `rg` per `fetch`, `authorization`, `Basic`, `/wp-json/`, `wordpress`, `connector` su entrambi gli alberi, seguita da inventario AST dei call site e lettura di URL, header, helper, alias `nativeFetch` e default `transport`. I wrapper e gli script che avviano processi sono stati seguiti fino al trasporto effettivo.

Classi: **A** WordPress REST autenticato; **B** API SeoGrow o browser locale; **C** frontend pubblico non autenticato; **D** servizi terzi non WordPress. Il pinning di C già presente nel runtime per protezioni SSRF resta invariato; questo batch non lo estende agli script pubblici.

### Script standalone

Tutti i nomi della tabella sono relativi a `scripts/`.

| File | Classe e trasporto effettivo |
| --- | --- |
| `wordpress-rankmath-cache-coherence-preflight.mjs` | A: `pinnedHttpsFetch` |
| `wordpress-rankmath-public-cache-purge-preflight.mjs` | A: `pinnedHttpsFetch` |
| `wordpress-rankmath-doctor.mjs` | A GET/POST: pinned; B inspection e C HTML: fetch |
| `wordpress-rankmath-doctor-convergence.mjs` | A GET/POST: pinned; B inspection e C HTML: fetch |
| `wordpress-rankmath-general-e2e.mjs` | A Connector: pinned; B inspection e C HTML: fetch |
| `wordpress-rankmath-global.mjs` | A inventario: ramo autenticato pinned, helper `wpGet` pinned; C `fetchPublic`: fetch senza Authorization |
| `wordpress-taxonomy-diagnostics.mjs` | A Connector: pinned; B inspection e C HTML: fetch |
| `wordpress-taxonomy-consistency-sampler.mjs` | A Connector: pinned; B inspection e C HTML: fetch |
| `wordpress-taxonomy-e2e.mjs` | A preflight: pinned; B health/preview/apply/verify: fetch verso appUrl |
| `wordpress-taxonomy-postwrite-sampler.mjs` | A diagnostica: pinned; B inspection e C HTML: nativeFetch senza Basic |
| `wordpress-taxonomy-e2e-postwrite-observer.mjs` | Wrapper B che osserva apply/verify locali; importa E2E e sampler, le cui chiamate A bypassano il wrapper tramite pinned |
| `wordpress-taxonomy-e2e-cache-aware.mjs` | Avvia E2E/diagnostica in processi figli; nessun trasporto REST autonomo |
| `wordpress-taxonomy-diagnostics-retry.mjs` | Avvia diagnostica in processo figlio; nessun trasporto REST autonomo |
| `wordpress-elementor-e2e.mjs` | B: fetch verso API SeoGrow; non chiama direttamente REST WordPress |
| `wordpress-role-e2e.mjs` | B: fetch verso API SeoGrow; harness pronto, non eseguito live |
| `browser-smoke.mjs` | B: app locale e Chrome DevTools su loopback |
| `prepare-workspace-fixtures.mjs`, `package-connector.mjs`, `test-rankmath-journal.php`, `test-atomic-write.php` | Nessuna richiesta HTTPS WordPress; fixture, packaging e test PHP simulati |

### Runtime

Tutti i nomi della tabella sono relativi a `server/`.

| File / call site | Classe e trasporto effettivo |
| --- | --- |
| `wordpressAtomicWrite.js` | A: default `transport = pinnedHttpsFetch` |
| `wordpressConnectionHook.js` | A: default `readTransport = pinnedHttpsFetch` |
| `wordpressLiveApprovalHook.js` | A: helper wpFetch con default pinned |
| `wordpressLiveRollbackHook.js` | A: default transport/readTransport pinned |
| `wordpressWriteReconciliationHook.js` | A: pinned diretto |
| `wordpressInspectFastHook.js` | A: fetch protetto dal bootstrap, endpoint core/Connector HTTPS con Basic |
| `wordpressTaxonomyHook.js` | A: fetch protetto dal bootstrap, taxonomy-inspect |
| `elementorImpactHook.js` | A: fetch protetto dal bootstrap, types/library/Connector |
| `elementorCoverageAttestationHook.js` | A: fetch protetto dal bootstrap, inventario Connector |
| `elementorReferenceImpactHook.js` | A: fetch protetto dal bootstrap, inventario/reference/types/content |
| `remediationBootstrap.js` | Boundary: HTTPS + Basic + wp-json intercettati prima del nativeFetch; caricamento esplicito da index e launcher già verificato |
| `index.js`: wordpress/test e wordpress/draft | A: pinned diretto, nessun redirect automatico |
| `index.js`: crawler/robots/sitemap/link status | C: fetchPublic → pinnedPublicRequest, policy preesistente |
| `frontendVerificationHook.js` | C: fetch intercettato dal guard tramite user-agent remediation, policy preesistente |
| `elementorPublicCoverageHook.js` | C: pinned preesistente per sitemap e HTML; nessuna Basic auth |
| `index.js`: OpenAI, OAuth/Search Console Google, DataForSEO | D: fetch; Basic DataForSEO non è autenticazione WordPress |
| `wordpressPatchV2Hook.js`, `wordpressSeoAdapterV2Hook.js`, `openAiBudget.js` | D: budgetedOpenAiFetch/fetch verso OpenAI |
| `pinnedHttpsFetch.js` | Implementazione trasporto HTTPS su IP pubblico risolto e fissato, SNI e verifica certificato |

Gli altri moduli sono helper di dati, identità, sicurezza, registrazione o riconciliazione senza trasporto autonomo. Nessuna eccezione autorizza WordPress REST autenticato a usare il fetch **nativo**; i cinque hook con `fetch` dipendono intenzionalmente dal boundary centrale già completato in #41. Il test architetturale del bootstrap conserva questa garanzia nel runtime supportato.

## CI e verifica finale

| PR | Stato | Release Gate PR | Release Gate post-merge main |
| --- | --- | --- | --- |
| #44 | merged | [#682 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34134866523) | [#683 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34135330235) |
| #45 | merged | [#684 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34135646282) | [#685 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34135808759) |
| #46 | merged | [#686 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34135924954) | [#687 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34136108966) |
| #48 | merged | [#691 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34136922727) | [#692 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34137058177) |
| #47 | merged | [#689 PASS, ultima revisione](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34136442872) | [#690 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34136694541) |

Il gate #688 sulla prima revisione di #47 era già PASS; #689 certifica anche il successivo adeguamento dei timeout Doctor. Nessun merge è stato effettuato su gate fallito o su una revisione diversa da quella verificata.

Verifica locale ripetuta sulla baseline tecnica finale: `npm run lint` PASS; `npm test` **567/567 PASS, 0 failure, 0 skipped**; `npm run build` PASS; `npm run test:launcher` PASS. Il Release Gate completo certifica inoltre PHP lint/test, packaging Connector, dependency audit, browser UI smoke e avvio reale del launcher su macOS; il solo test locale del launcher è un controllo sintattico zsh.

Verifica GitHub alla chiusura tecnica: nessuna PR aperta, nessun thread di review aperto nelle PR #35, #37–#47; nessun failure nei gate dei batch. La PR documentale #48 è merged con gate #691 e post-merge #692 PASS, commit main `04a33e2f9af3155b892002d26c32dfd10a5f2a18`. La successiva correzione del launcher G13 richiede a sua volta un gate completo prima del merge.

## Prove pregresse conservate, non rieseguite in questo batch

- Workspace restore/crash/quota: prove fisiche eseguite; stato coerente dopo riapertura.
- WordPress core writer/concorrenza: CAS live su pagina bozza dedicata, stale conflict e rollback verificati.
- Lost-response recovery: riconciliazione live verificata su pagina bozza dedicata; nessun retry cieco.
- Multi-client isolation: guardie request/response e annullamento in-flight su cambio cliente; master QA PASS.
- UI responsive/accessibilità, per il perimetro browser desktop testato: zoom 200% PASS, focus visibile PASS, navigazione tastiera della pagina e della sidebar PASS.
- Agent runtime adversarial: cancel reale, cleanup, approval stale/cross-project bloccata, reject senza write; master QA v3 PASS.
- Security locale: token/chiavi persistenti, permessi filesystem, API auth, SSRF/private IP, HTTPS pinning e redirect controllati coperti da test automatici.
- Security WordPress runtime: write atomici, read autenticati, approval/preflight, rollback e connection-check usano transport pinned o boundary centrale fail-closed.
- Elementor pagina draft isolata: save pipeline, persistenza `_elementor_data`, rendering server, rigenerazione metadata CSS e rollback verificati; fixture temporanea spostata nel Cestino.

## Gap ambientali esclusi

### G07 — Elementor shared

**PARTIAL / NON CHIUSO**. Sullo staging: header/footer propagati e ripristinati su 38 record pagina/articolo (37 URL richiesti distinti, redirect preesistenti); dati identici ai backup e nessun marker residuo. Archive, Single isolato, HTML non eseguibile e CSS con purge hanno le prove descritte nel report. Connector 1.3.4 installato e inventario pagine corretto. Confronto responsive before/after/rollback dell’header sul post campione eseguito, ma variazioni tipografiche da diagnosticare e matrice visuale degli altri scope incompleta. CPT finale non certificato: quota giornaliera WPVibe esaurita durante l’ultima lettura. Dettagli in `docs/qa/G07-STAGING-2026-09-07.md`; nessuna modifica al live.

### G13 — matrice ruoli WordPress

**PASS sullo staging — matrice read-only eseguita dal Mac dell'utente il 2026-09-07**. Administrator ed Editor: connection-check, inspect-fast e live-preview HTTP 200. Subscriber: connection-check HTTP 200, inspect-fast e live-preview HTTP 400 come richiesto dall'harness. Tre ruoli eseguiti, zero skipped, nessuna write tentata. Il report completo è stato fornito dall'utente in chat ed è trascritto in `docs/qa/G13-STAGING-2026-09-07.json`; non è una nuova esecuzione dell'assistente.

Pulizia degli account temporanei e revoca delle credenziali di prova confermate. Nessun test su produzione; PASS limitato alla matrice minima read-only, senza prove di scrittura per ruolo.

## Limiti della chiusura

Il perimetro interno di hardening/QA richiesto è chiuso con i gate tecnici riportati PASS. Non è una certificazione di assenza assoluta di bug né una nuova prova dei casi live storici. Il backlog Sonar di qualità/manutenibilità già documentato non è stato dichiarato risolto da questi batch. Nel perimetro della matrice minima concordata G13 è PASS sullo staging; resta G07 Elementor shared PARTIAL. Il risultato G13 non certifica write per ruolo o comportamento su altri siti.

## Estensione staging autorizzata — riepilogo pubblico

I dettagli identificativi dell'ambiente, dei target e degli account temporanei sono omessi da questo riepilogo pubblico. Gli esiti restano distinti dalle verifiche interne automatizzate.

- G13: matrice minima read-only eseguita dall'utente; tre ruoli, zero skip, nessuna scrittura dei contenuti. Pulizia completata. Non certifica le scritture per ruolo.
- G07: prove parziali shared e rollback eseguite nello staging autorizzato; copertura visuale e CPT incompleta. Stato PARTIAL, con prosecuzione ambientale rinviata.
- Connector 1.3.4: correzione dell'inventario pagine verificata. Nessuna modifica al live in questa estensione.

| PR | Stato | Gate PR | Gate main |
| --- | --- | --- | --- |
| #49 | merged | #693 PASS | #694 PASS |
| #50 | merged | #695 PASS | #696 PASS |
| #51 | merged | #697 PASS | #698 PASS |
| #52 | merged | #699 PASS | #700 PASS |
| #53 | merged | #701 PASS | #702 PASS |
| #54 | merged | #704 PASS | #705 PASS |
| #55 | merged | #706 PASS | #707 PASS |

Il gate #703 era fallito per un'asserzione di versione obsoleta, corretta prima del merge #54. Le verifiche ambientali riportate sono storiche, non nuove esecuzioni del batch QA automatizzato.

## Estensione UI/UX successiva

PR #57 e #58 **merged**, rispettivamente con Release Gate #710 e #712 PASS sui commit delle PR. Anche il gate #711 su main dopo #57 è PASS. Revisione di ricerca, navigazione, feedback e console Agent descritta in [UX-REVIEW-2026-09-07.md](UX-REVIEW-2026-09-07.md), incluse le proposte future e il limite della verifica visuale manuale. G07 resta PARTIAL e rinviato su richiesta dell'utente; questa estensione non modifica lo stato dei collaudi WordPress.

## Funzioni aggiunte — 8 settembre 2026

Le PR #60, #61 e #62 sono **merged**, con Release Gate #716, #718 e #720 PASS prima dei merge. Implementate le otto estensioni proposte: viste salvate, palette comandi, annullamento task, configurazione guidata, calendario editoriale, report personalizzabili, avvisi sui dati e audit periodici pubblici in sola lettura.

598 test locali PASS, lint/build/launcher PASS. Il gate #720 comprende browser smoke esteso alle nuove schermate e avvio macOS. Nessuna esecuzione automatica su siti reali durante lo sviluppo. Dettagli d'uso, limiti e prove in [FEATURES-2026-09-08.md](FEATURES-2026-09-08.md).

La revisione visuale manuale è ancora bloccata dall'accesso del browser cloud all'app locale. G07 resta PARTIAL e rinviato; i risultati G13 già documentati non sono modificati da questo batch.

## Follow-up residui — 8 settembre 2026

Corretto l'avvio API con porta occupata: il callback di Express riceve l'errore, termina con codice non zero e non annuncia disponibilità. Prova automatica con una porta locale realmente occupata. In Integrazioni è ora mostrato il redirect URI fornito dal server con istruzioni OAuth; la registrazione del client Google resta una configurazione esterna da completare.

Rafforzata la gestione delle nuove UI: obiettivo importato non testuale e voci calendario malformate non bloccano la schermata; la palette non si sovrappone a un altro dialogo aperto. Il monitoraggio non pubblica un successo se annullato durante la lettura della risposta e non considera verificato uno storico importato privo di campioni validi.

602 test locali PASS, lint/build/launcher PASS. Il Release Gate della PR resta il riferimento per le verifiche CI. L'utente ha confermato l'apertura del Centro progetto sul Mac e l'inserimento dell'obiettivo: ciò non equivale al collaudo visuale completo delle nuove schermate. G07 resta PARTIAL; nessuna operazione WordPress eseguita in questo follow-up.

## Selettore proprietà Google — 8 settembre 2026

Dopo la segnalazione dell'utente (19 proprietà ricevute ma elenco non visibile), il selettore ha una riga completa, etichetta e più opzioni visibili con scorrimento. La risposta iniziale dello stato Google non può più cancellare le proprietà già caricate. Richiesta selezione esplicita prima dell'importazione; nessun sito scelto automaticamente.

604 test locali PASS, lint/build PASS. Browser smoke CI esteso con 19 proprietà simulate, verifica delle dimensioni del selettore e selezione dell'ultima proprietà. Nessuna richiesta reale Google o WordPress durante il test.

### Collaudo manuale Google e task — 8 settembre 2026

- PR #65 merged; Release Gate #726 pre-merge e #727 su main PASS.
- Evidenza fornita dall'utente: elenco proprietà Google visibile, selezione Yoga Buena Onda e importazione del periodo 7 giugno–5 settembre 2026; dashboard con 61 clic, 3.322 impressioni, 206 query e 17 pagine.
- Navigazione Opportunità e creazione/salvataggio task eseguite; l'utente conferma che il task resta visibile dopo ricaricamento.
- Anomalie osservate: dashboard con 64 query contro 6 opportunità; URL salvato come destinazione; task manuale omonimo del suggerimento GSC.
- Correzione repository: dashboard usa lo stesso gruppo filtrato (almeno 10 impressioni, massimo 50) dell'elenco, con criteri espliciti. Le opportunità usano dati query–pagina quando disponibili e distinguono suggerimenti da associazioni documentate. Le nuove attività salvano sourceUrl, query e provenienza; riconoscono task search già presenti e vecchie destinazioni manuali equivalenti, senza sovrascrivere note o eliminare duplicati storici.
- Validazione locale della correzione: lint, build, 609/609 test PASS. La verifica manuale di questa nuova correzione resta da eseguire sul Mac dopo aggiornamento.
- Nessuna scrittura WordPress eseguita in questo batch. G07 shared/staging resta PARTIAL; il precedente collaudo minimo dei ruoli in staging non equivale a una matrice di scritture live.

### Stato azione Opportunità dopo reload — 8 settembre 2026

- PR #66 merged, gate #728 e #729 PASS, ma il collaudo utente ha rilevato che il pulsante restava "Crea task": il controllo duplicati era solo nel gestore del clic.
- La riga ora consulta i task del progetto con lo stesso matching della creazione e mostra "Apri task" quando trova un'attività attiva; apre il dettaglio del task esistente senza nascondere l'opportunità.
- Test browser CI aggiunto: fixture yoga senza task, creazione, cambio immediato del pulsante, apertura/salvataggio, flush della persistenza, reload, "Apri task", riapertura e verifica di una sola attività con sourceUrl conservato.
- Lint, build e 609 test locali PASS; esito del nuovo scenario browser demandato al Release Gate della PR. Nessuna chiamata Google o scrittura WordPress necessaria per questa fixture.

- Gate #730: fixture GSC incompleta; #731: reload del test prima del salvataggio differito. Fixture completata e attesa esplicita della persistenza aggiunta. In #732 lo scenario browser completo passa, ma il cleanup Chrome fallisce con ENOTEMPTY; aggiunti retry limitati per la rimozione del solo profilo temporaneo CI.

### Selezione della vista salvata — 8 settembre 2026
- Correzione limitata allo stato UI savedViewId: il selettore conserva il nome richiamato fino a modifica manuale dei filtri o scelta di un'altra vista. Le callback di ripristino dei filtri restano invariate.
- Applicata al componente condiviso Task/Audit. Nessuna nuova persistenza su disco dei filtri o modifica ai dati delle viste.
- Test browser aggiunto per "Yoga da fare": richiamo, filtri ripristinati, nome mantenuto dopo render non legato ai filtri, azzeramento su modifica manuale di ricerca/stato.
- Lint, build e 609 test locali PASS; scenario browser verificato tramite Release Gate.

### Automazione del collaudo — baseline 8 settembre 2026
- Baseline main 7de18babea0fe7e78aa12bb20292f19b2785c723, PR #68 merged, Gate #735 e #736 (attempt 2) PASS.
- Utente: ricerca task, viste salvate e relativa selezione confermate; undo con reload confermato nel collaudo riportato.
- Nuovo batch: comandi qa:smoke/full/release, matrice eseguibile, runtime/profilo temporanei senza credenziali, flussi Task/Undo/CRUD/filtri/reload/errori e screenshot responsive.
- Node locale: 613/613 PASS, 0 fail, 0 skip, 2080.788264 ms; lint/build PASS.
- PR #69: Release Gate #741 PASS su head 693fa26a4891ea926e3a4cbafa11f6ff8545bc4a; qa:smoke, qa:full e qa:release eseguiti realmente, inclusi browser Chrome, backup cifrato, error injection, 500 task e IndexedDB nativo. Launcher macOS e controlli Connector PASS. PR #69 merged nel commit dcdc922267484fb9dd649bd54889ff825ecb891a; Release Gate #742 su main PASS. Durate CI circa 8s smoke, 24s full, 30s release.
- Gate intermedi: #737 selettore Elimina non circoscritto al dialogo; #739 seed eseguito nelle fixture data: prive di storage; #740 clic prima della risposta Google status. Cause corrette con selettore del dialogo, isolamento del seed all'origine app e attesa del pulsante abilitato. Nessun test rimosso o trasformato in skip. #738 e #741 PASS.
- Dettagli, limiti e distinzione visuale automatico/manuale in QA-AUTOMATION.md. G07 e gli altri vincoli WordPress restano invariati.
