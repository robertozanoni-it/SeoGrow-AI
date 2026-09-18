# Changelog

## 1.4.4-rc.1 — 2026-09-18

### Flusso operativo quotidiano
- Dopo un apply approvato, SeoGrow avvia subito la verifica canonica per fix singoli e tassonomie.
- Un problema esce dagli attivi solo dopo il gate di completion evidence; se la verifica è incompleta resta visibile e azionabile.
- Problemi verificati restano nello storico Correzioni con Prima/Dopo e rollback; una nuova rilevazione audit successiva li riapre.

### Priorità unica
- Panoramica è l’unica fonte di “Cosa devo fare adesso?”.
- Un solo motore di priorità combina Problemi, Opportunità, Posizionamenti e Task.
- Posizionamenti usa storico DataForSEO omogeneo, staleness e cali materiali; Task considera priorità e scadenze.
- Eliminato il precedente motore parallelo del Guided UX per evitare indicazioni discordanti.

### Monitoraggio GSC + DataForSEO
- Baseline e delta derivati esclusivamente dagli storici già salvati.
- Search Console: cali materiali di clic, query perse, cali di posizione media e crescita significativa delle impressioni.
- DataForSEO: confronti solo tra run omogenei per device, profondità, località e lingua; alert su cali e miglioramenti materiali.
- Alert con identità stabile e routing al modulo proprietario.
- La creazione Task da alert è esplicita; l’import GSC non crea più Task automaticamente.
- Nessun polling DataForSEO a pagamento in background e nessun nuovo provider.

### WordPress e validazione reale
- Connector 1.3.10: CAS atomico Rank Math tassonomie + purge cache pubblica verificata.
- Rank Math category E2E reale PASS su staging autorizzato.
- Elementor Theme Builder read-only PASS su header, footer, archive e single-post reali.
- Gap esterni non presenti sullo staging Yoga (Popup, post_tag reale, Yoast tassonomie) restano separati e fail-closed.

### Qualità
- Release Gate pre/post merge verde per tutti i blocchi 1.4.4.
- QA completa Ubuntu/macOS, browser QA, performance gate, dependency audit e launcher smoke.
- Nessun nuovo modulo: architettura Suite congelata sui 14 moduli canonici.


## 1.4.3-rc.1 — 2026-09-17

### Suite
- Architettura definitiva a 14 moduli: Panoramica, Clienti, Centro progetto, Audit SEO, Posizionamenti, Link interni, Opportunità, Correzioni, Task, Piano editoriale, SEO Agent, GEO AI, Integrazioni, Impostazioni.
- Stato progetto, audit, correzioni, task e preferenze consolidati sui relativi store canonici, con persistenza e isolamento per cliente.
- UX/UI finale consolidata con sidebar definitiva, active state coerente, stati empty/loading/error e responsive verificati.

### SEO operativo
- Audit SEO tracciabile con evidenze, deduplica, esclusioni legali/GDPR e CTA di risoluzione.
- Correzioni con preview, preflight, receipt, verifica e rollback; Batch AutoFix protetto da feature flag.
- Posizionamenti DataForSEO, Opportunità e Piano editoriale collegati allo stato progetto senza inventare metriche.
- SEO Agent read-only: analisi → proposta → handoff a Task/Correzioni.
- GEO AI evidence-first, senza score o citazioni AI inventate.

### Integrazioni e sicurezza
- Registro integrazioni canonico per WordPress, OpenAI, DataForSEO e Search Console quando disponibile.
- Password applicativa WordPress solo in sessione volatile; nessuna persistenza credenziali nel workspace.
- Kill-switch write per progetto: blocca apply/create WordPress ma mantiene preview, verifica e rollback.
- Writer WordPress con controlli di concorrenza/stale-state e rollback verificato.

### Qualità e release
- Journey E2E continuo: nuovo cliente → WordPress → audit → problema → correzione → verifica → rollback → task → ranking → opportunità → piano editoriale → reload.
- Release QA su Ubuntu e macOS, browser smoke, storage/concurrency, network failures, dependency audit e launcher smoke reale.
- Performance Gate RC obbligatorio con bundle size e latenze runtime.
- RC Live Gate: smoke su tre progetti reali e staging Elementor read-only.

### Blocco noto della candidate
- Il campione DataForSEO live della RC resta bloccato finché `DATAFORSEO_LOGIN` e `DATAFORSEO_PASSWORD` non sono disponibili nei GitHub Actions Secrets. Nessun dato simulato sostituisce questo Gate.
