# Stato collaudo residuo — 2026-09-07

Branch: `audit/residual-review-20260906`  
PR: #35 (draft, non mergiata)

## Chiusure verificate

- Workspace restore/crash/quota: prove fisiche eseguite; stato coerente dopo riapertura.
- WordPress core writer/concorrenza: CAS live su pagina bozza dedicata, stale conflict e rollback verificati.
- Lost-response recovery: riconciliazione live verificata su pagina bozza dedicata; nessun retry cieco.
- Multi-client isolation: guardie request/response e annullamento in-flight su cambio cliente; master QA PASS.
- UI responsive/accessibilità, per il perimetro browser desktop testato: zoom 200% PASS, focus visibile PASS, navigazione tastiera della pagina e della sidebar PASS.
- Agent runtime adversarial: cancel reale, cleanup, approval stale/cross-project bloccata, reject senza write; master QA v3 PASS.
- Security locale: token/chiavi persistenti, permessi filesystem, API auth, SSRF/private IP, HTTPS pinning e redirect controllati coperti da test automatici.
- Security WordPress: capability object-level presenti nel writer (`edit_post`/`edit_term`), test con utenti QA temporanei completato e cleanup verificato. Password applicativa QA revocata; utenti temporanei rimossi.
- Elementor pagina draft isolata: save pipeline, persistenza `_elementor_data`, rendering server, rigenerazione metadata CSS e rollback verificati; fixture temporanea spostata nel Cestino.
- Release Gate #657: PASS completo (`quality`, `browser-ui-smoke`, `macos-launcher-smoke`).
- SonarQube Cloud sul commit `cbf56d7f9f80a62750f058c636e8d0ed72ed5f64`: **Quality Gate PASS**; 0 Security Hotspots; duplicazione new code 1,3%.

## Gap ancora non chiuso

### G07 — Elementor shared write/render/cache/rollback

Stato: **PARTIAL / NON CHIUSO**.

Già verificato:
- inventory Elementor Library in sola lettura;
- header/footer/archive/single/reusable section in inventario/diagnostica;
- impatto e reference data;
- shared write disabilitato/fail-closed;
- salvataggio Elementor ufficiale su pagina draft isolata;
- persistenza e rendering dopo save;
- rigenerazione metadata CSS;
- rollback della pagina draft e verifica finale.

Per chiuderlo al 100% servono ancora prove su staging/clone controllato per il perimetro condiviso:
- Theme Builder header/footer/single/archive save e rollback;
- global widget o template riutilizzato con ownership condivisa;
- custom CSS e casi HTML/script;
- CPT rappresentativo;
- rigenerazione asset/cache cross-page;
- verifica visuale prima/dopo su più pagine impattate;
- rollback dopo una modifica shared-template.

Queste prove non devono essere eseguite sul sito cliente live.

### G13 — ruolo WordPress E2E esaustivo

Stato: **sostanzialmente chiuso nel perimetro testato, non esaustivo**.

Restano fuori dal perimetro certificato un E2E autenticato completo, endpoint-per-endpoint, con tutti i ruoli WordPress rappresentativi. Le prove eseguite confermano capability object-level, fail-closed e cleanup degli utenti QA temporanei, ma non costituiscono una certificazione completa per ogni combinazione ruolo/endpoint.

## CI / qualità

- Release Gate #657: PASS completo.
- SonarQube Cloud: **Quality Gate PASS** sul commit corrente.
- Sonar segnala ancora 65 new issues non bloccanti per il Quality Gate corrente. Vanno trattati come backlog di qualità/manutenibilità e revisionati per pertinenza; non equivalgono a 65 bug funzionali o di sicurezza.
- Coverage on new code è riportata 0,0%/non configurata nel report Sonar corrente, ma non è condizione bloccante del Quality Gate attuale. La suite automatica del Release Gate resta la fonte operativa di regressione per il branch corrente.

## Reviewer esterni

- CodeRabbit: review completa non eseguita perché 111 file selezionati superano il limite di 100; il servizio ha inoltre segnalato capacità/crediti insufficienti.
- Sourcery: nuova review completa non eseguita perché il diff supera il limite di 150.000 caratteri.
- Nessun thread inline di review aperto risulta al controllo corrente.

## Regola di rilascio

La PR #35 resta in bozza e **non va mergiata automaticamente**. Prima del merge va presa una decisione esplicita sui gap residui documentati, in particolare G07 shared Elementor e l'eventuale estensione G13 ruolo-per-ruolo.
