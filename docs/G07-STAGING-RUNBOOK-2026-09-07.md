# G07 — Elementor staging runbook (2026-09-07)

## Obiettivo
Chiudere il gap G07 solo su staging/clone controllato, senza modificare template condivisi sul sito live.

## Stato già validato sul live
- Inventory Elementor read-only: PASS.
- Save pagina Elementor draft isolata: PASS.
- Rendering dopo save: PASS.
- Rigenerazione CSS post: PASS.
- Rollback pagina draft: PASS.
- Cleanup fixture: PASS.

## Prerequisito iniziale — staging ora disponibile
Serve una copia staging/clone separata di `https://yogabuenaonda.it/` con URL distinto e non indicizzabile. Il tool WordPress disponibile in questa sessione non espone un'operazione host-level di clonazione/staging e il WP-CLI emulato non supporta export/import database o filesystem completo. Non installare plugin di staging sul live solo per aggirare questo limite senza un percorso di clonazione verificabile.

## Checklist staging obbligatoria
1. Clone completo file + database.
2. URL staging distinto dal live.
3. `Discourage search engines` / noindex sullo staging.
4. Nessun invio email reale, webhook, pagamento o automazione esterna attiva.
5. Cache separata dal live.
6. Elementor + Elementor Pro + theme child + Connector nelle stesse versioni del live.
7. Backup/restore del clone prima dei test distruttivi.

## Matrice test G07 da eseguire sul clone

### A. Theme Builder — Header
- Snapshot struttura e condizioni.
- Modifica marker controllata.
- Save ufficiale Elementor.
- Rigenerazione cache/conditions.
- Verifica frontend.
- Rollback esatto.
- Verifica frontend post-rollback.

### B. Theme Builder — Footer
Stessa sequenza del test Header.

### C. Theme Builder — Single
- Fixture su contenuto rappresentativo.
- Verifica condizioni e scope.
- Save/render/rollback.

### D. Theme Builder — Archive
- Fixture su archivio reale.
- Verifica condizioni e scope.
- Save/render/rollback.

### E. Template condivisi/globali
- Verificare impatto su tutte le referenze.
- Nessun falso isolamento.
- Rollback deve ripristinare tutte le referenze.

### F. Custom CSS
- Modifica marker innocua.
- Verifica file/css generato e resa frontend.
- Rollback e invalidazione cache.

### G. HTML/script widget
- Solo marker non eseguibile/pericoloso.
- Verifica capability e persistenza.
- Rendering e rollback.

### H. CPT rappresentativo
- Identità post type stabile.
- Save ufficiale Elementor.
- Rendering e rollback.

### I. Cache/asset condivisi
- Elementor CSS/data cache.
- LiteSpeed cache sul clone.
- Verifica assenza di asset stale dopo save e rollback.

### J. Visual QA
- Desktop/tablet/mobile.
- Before/after/rollback.
- Nessuna regressione strutturale, stile o condizioni Theme Builder.

## Criterio di chiusura
G07 = PASS solo se tutti i casi A–J rilevanti per il sito sono verificati sul clone con prova before/after/rollback e nessun effetto sul live.

## Esecuzione 2026-09-07

Staging Hostinger collegato, backup confermato dall’utente e noindex applicato. Esiti reali e limiti: [report G07](qa/G07-STAGING-2026-09-07.md). Header/footer/archive, Single isolato e marker HTML verificati con rollback. CSS verificato anche anonimamente nel ciclo con purge esplicito. Connector 1.3.4 installato sullo staging: inventario completo di 56 risorse, comprese le 16 pagine native, e reference pagina/articolo verificati. G07 resta PARTIAL per copertura shared/CPT pertinente e matrice visuale completa; consultare le sezioni finali del report per lo stato più recente.

## Punto di ripresa dopo copertura ampliata

Header/footer verificati su 38 record pagina/articolo, marker rimossi e dati identici ai backup. Non ripetere questo ciclo senza un rischio concreto. Consultare il report per differenze tipografiche, visual QA footer/Archive/Single e verifica CPT residua. Quota giornaliera WPVibe esaurita dopo rollback: attendere disponibilità prima di nuove prove staging. G07 resta PARTIAL.
