# Stato collaudo residuo — 2026-09-07

Baseline corrente: `main` dopo merge PR #41.  
Ultimo hardening runtime completato: pinning HTTPS fail-closed per write, approval/preflight, rollback, connection-check e read autenticati WordPress REST coperti centralmente.

## Chiusure verificate

- Workspace restore/crash/quota: prove fisiche eseguite; stato coerente dopo riapertura.
- WordPress core writer/concorrenza: CAS live su pagina bozza dedicata, stale conflict e rollback verificati.
- Lost-response recovery: riconciliazione live verificata su pagina bozza dedicata; nessun retry cieco.
- Multi-client isolation: guardie request/response e annullamento in-flight su cambio cliente; master QA PASS.
- UI responsive/accessibilità, per il perimetro browser desktop testato: zoom 200% PASS, focus visibile PASS, navigazione tastiera della pagina e della sidebar PASS.
- Agent runtime adversarial: cancel reale, cleanup, approval stale/cross-project bloccata, reject senza write; master QA v3 PASS.
- Security locale: token/chiavi persistenti, permessi filesystem, API auth, SSRF/private IP, HTTPS pinning e redirect controllati coperti da test automatici.
- Security WordPress runtime: write atomici, read autenticati, approval/preflight, rollback e connection-check usano transport pinned o boundary centrale fail-closed.
- Elementor pagina draft isolata: save pipeline, persistenza `_elementor_data`, rendering server, rigenerazione metadata CSS e rollback verificati; fixture temporanea spostata nel Cestino.
- Release Gate #671: PASS completo sul batch authenticated-read transport.
- SonarQube Cloud: Quality Gate PASS sul precedente gate certificato; 0 Security Hotspots nel report di riferimento.

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

Il branch `qa/wordpress-role-e2e-batch` aggiunge un harness ripetibile per Administrator, Editor e Subscriber attraverso il runtime SeoGrow. Il test è read-only per default; `live-apply` richiede `SEOGROW_ROLE_E2E_ALLOW_WRITES=YES_I_UNDERSTAND`.

Per marcare G13 `PASS` resta necessario eseguire la matrice completa con tre account reali su staging/clone o fixture controllata e conservare il log JSON. Vedi `docs/G13-WORDPRESS-ROLE-E2E-RUNBOOK.md`.

## CI / qualità

- Release Gate #671: PASS completo sul runtime hardening appena mergiato.
- Sonar segnala ancora backlog non bloccante di qualità/manutenibilità dal report di riferimento; non equivale automaticamente a bug funzionali o di sicurezza.
- La suite automatica del Release Gate resta la fonte operativa primaria di regressione.

## Stato operativo

I residui che richiedono ambiente esterno sono ora concentrati in due blocchi:
1. G07 shared Elementor su staging/clone.
2. G13 matrice ruoli WordPress reale.

Tutto il resto del filone runtime WordPress DNS-rebinding/TOCTOU è chiuso nel perimetro attuale.
