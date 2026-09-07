# Stato collaudo residuo — 2026-09-07

## Perimetro e risultato

Chiusura del filone trasporto autenticato WordPress: runtime e script QA standalone.
Baseline del batch trasporto: `main` al merge commit `3d187b16b0d183941cdf2da2d90d3b7eb88c1f7b`.
Le PR #35, #37, #38, #39, #40, #41, #42, #43, #44, #45, #46, #47, #48, #49 e #50 sono **merged**, verificato tramite GitHub.

La scansione di `server/` e `scripts/` non rileva richieste WordPress REST autenticate instradate al fetch nativo: gli script usano direttamente `pinnedHttpsFetch`; nel runtime restano anche call site `fetch(...)` intercettati dal boundary centrale di `remediationBootstrap.js`. Non equivale a zero occorrenze testuali di `fetch`.

Il batch interno iniziale non ha eseguito accessi WordPress live/staging. Successivamente, su richiesta esplicita, è stato collegato lo staging Hostinger: le letture e il ciclo di creazione/pulizia degli utenti temporanei sono documentati sotto. Nessuna scrittura di contenuti o modifica Elementor shared in questa estensione. I test automatici delle route usano DNS/HTTPS simulati e un server SeoGrow locale. Provider AI invariati: OpenAI e DataForSEO.

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

**PARTIAL / NON CHIUSO**. Restano non eseguite le prove su staging/clone per Theme Builder header/footer/single/archive, template riutilizzati e global widget, custom CSS/HTML/script, CPT rappresentativo, rigenerazione asset/cache cross-page, verifica visuale multi-pagina e rollback shared-template. Le prove pregresse sulla pagina draft isolata non sostituiscono questi casi. Non eseguire sul sito cliente live.

### G13 — matrice ruoli WordPress

**PASS sullo staging — matrice read-only eseguita dal Mac dell'utente il 2026-09-07**. Administrator ed Editor: connection-check, inspect-fast e live-preview HTTP 200. Subscriber: connection-check HTTP 200, inspect-fast e live-preview HTTP 400 come richiesto dall'harness. Tre ruoli eseguiti, zero skipped, nessuna write tentata. Il report completo è stato fornito dall'utente in chat ed è trascritto in `docs/qa/G13-STAGING-2026-09-07.json`; non è una nuova esecuzione dell'assistente.

Target: post 7197 sullo staging. Account temporanei Editor 13 e Subscriber 14 eliminati secondo il report; assenza confermata indipendentemente via REST autenticata (`include=13,14`, risposta `[]`). Revocate via WPVibe la password applicativa amministrativa `SeoGrow QA staging` usata nel batch e la precedente `eoGrow QA staging`, entrambe create durante questa sessione: risposta `deleted=true` per ciascuna. Le altre credenziali preesistenti non sono state modificate. Nessun test eseguito su produzione e nessuna prova `live-apply`: PASS limitato alla matrice minima read-only del runbook.

## Limiti della chiusura

Il perimetro interno di hardening/QA richiesto è chiuso con i gate tecnici riportati PASS. Non è una certificazione di assenza assoluta di bug né una nuova prova dei casi live storici. Il backlog Sonar di qualità/manutenibilità già documentato non è stato dichiarato risolto da questi batch. Nel perimetro della matrice minima concordata G13 è PASS sullo staging; resta G07 Elementor shared PARTIAL. Il risultato G13 non certifica write per ruolo o comportamento su altri siti.

## Estensione staging autorizzata — 2026-09-07

- Ambiente: `https://staging.yogabuenaonda.it`, Hostinger; backup ripristinabile confermato dall’utente. Permalink e redirect canonico corretti dall’utente; homepage e REST index rispondono HTTP 200. Connector raggiungibile: 401 senza autenticazione, status autenticato disponibile tramite WPVibe.
- Letture autenticate tramite WPVibe: Elementor/Pro e Rank Math presenti; inventario pubblico Connector completo (`total=40`, `truncated=false`); impact inspect read-only dei template header 185, footer 327, archive 584, single-post 598 e section 2789. `sharedWriteAllowed=false`. Queste letture non certificano save/render/rollback né la matrice runtime SeoGrow.
- G13: utenti `seogrow-qa-editor` (ID 11) e `seogrow-qa-subscriber` (ID 12) creati con autorizzazione esplicita, senza invio email. Password applicative di prova revocate; eliminazione di entrambi approvata dall’utente tramite WPVibe e verificata con elenco utenti. Restano i soli due amministratori preesistenti.
- Blocco credenziale iniziale, successivamente risolto con autorizzazione esplicita: auto-review ha rifiutato la creazione di una password applicativa per l’amministratore esistente perché fuori dal consenso specifico ai due utenti temporanei. Nessuna credenziale amministrativa creata e nessun aggiramento.
- Blocco esecuzione: una GET non autenticata con il vero `pinnedHttpsFetch` dal runtime Node della sessione fallisce con `getaddrinfo EAI_AGAIN staging.yogabuenaonda.it`. L’accesso del connettore WPVibe non equivale a connettività DNS/HTTPS del processo SeoGrow. Nessuna modifica a DNS, pinning o controlli di rete per aggirare il blocco.
- Correzione interna del launcher G13: `APP_API_TOKEN` obbligatorio, header `x-seogrow-token` su tutte le API locali, redirect manuali. Test comportamentali simulati verificano nove richieste autenticate sui tre ruoli, assenza di write, stop senza token e rifiuto redirect. Non sono prove dei ruoli WordPress reali.
- Alla fine del preflight iniziale servivano runtime raggiungibile e credenziali autorizzate. La successiva esecuzione dal Mac descritta sotto ha completato G13. G07 resta PARTIAL.

Verifica locale della correzione launcher #49: lint PASS, **569/569 test PASS**, build PASS, launcher syntax PASS. [Release Gate #693 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34141729327); [post-merge main #694 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34141875475), commit `551eb27ad397d99e32c514cdb90624eda7d24fd5`.

### Ripresa dal Mac dell'utente

Il Mac è stato aggiornato a main e il runtime riavviato. L'utente ha riportato: GET staging via `pinnedHttpsFetch` HTTP 200; `/wp/v2/users/me?context=edit` HTTP 200 con ruolo `administrator`; `/api/wordpress/connection-check` locale HTTP 200 e `ok=true`. Sono prove di connettività/autenticazione amministrativa, non della matrice completa G13. Il precedente blocco DNS persiste nell'ambiente dell'assistente; il percorso dal Mac è invece disponibile. L'autorizzazione specifica alla password applicativa amministrativa temporanea è stata acquisita e l'utente l'ha creata sullo staging senza comunicarla in chat.

Preparato wrapper `wordpress-role-staging-batch.mjs`: creazione/pulizia dei due account autorizzati, harness esistente sui tre ruoli, nessuna write sui contenuti, report locale senza credenziali. Test simulati coprono successo, fallimento password, collisione utente, identità cambiata, conferma host e guasto del checkpoint durante la pulizia. Il batch reale è stato poi eseguito dal Mac: `ok=true`, tre ruoli conformi e `pendingAccounts=[]`. G13 è PASS nel perimetro read-only; G07 resta PARTIAL.

### Evidenza e gate del batch #50

PR #50 merged; [Release Gate #695 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34146966742), [post-merge main #696 PASS](https://github.com/robertozanoni-it/SeoGrow-AI/actions/runs/34147086055), commit `4c16ea8dc6b53b90deb784e07145afeb2d1e8e79`. Verifica locale del batch: lint, **575/575 test**, build e launcher syntax PASS.

Report originale sul Mac: `.qa-runtime/role-staging-c5cd6e97-17c0-48ba-b9f1-372813e226d8.json`. La copia versionata è una trascrizione del JSON completo fornito dall'utente, con gli URL ripristinati a stringhe semplici dalla formattazione Markdown della chat. Non contiene password, token, email o IP. Le verifiche indipendenti dell'assistente riguardano la pulizia degli account e la revoca delle password temporanee; gli esiti della matrice provengono dall'esecuzione utente sul runtime locale.
