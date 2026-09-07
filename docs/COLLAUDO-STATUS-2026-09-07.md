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
- Release Gate #641: PASS.

## Gap ancora non chiuso

### G07 — Elementor write/render/cache/rollback

Stato: **PARTIAL / NON CHIUSO**.

Già verificato in produzione in sola lettura:
- inventory Elementor Library;
- header/footer/archive/single/reusable section;
- impatto e reference data;
- shared write disabilitato/fail-closed.

Per chiuderlo servono ancora prove su staging/clone controllato con:
- salvataggio Elementor ufficiale;
- fixture global widget;
- custom CSS;
- HTML/script;
- CPT rappresentativo;
- rigenerazione CSS/cache;
- rendering prima/dopo;
- impatto ownership/shared template;
- rollback completo e verifica finale.

Queste prove non devono essere eseguite sul sito cliente live.

## CI / qualità

Il Release Gate corrente è verde. Eventuali gate esterni separati (es. SonarCloud) vanno verificati indipendentemente prima del merge; un Release Gate verde non implica automaticamente che tutti i servizi esterni abbiano lo stesso stato.

## Regola di rilascio

La PR #35 resta in bozza e **non va mergiata** finché il collaudo Elementor staging non è completato oppure il rischio non viene esplicitamente accettato e documentato.
