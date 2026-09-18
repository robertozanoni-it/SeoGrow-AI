# Changelog

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
