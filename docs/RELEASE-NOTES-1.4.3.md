# SeoGrow AI Suite 1.4.3 — Release notes

## Stato della candidate
La release 1.4.3 consolida SeoGrow AI nella Suite a 14 moduli con stato progetto condiviso, audit tracciabile, correzioni verificabili, rollback, task, posizionamenti, opportunità, piano editoriale, SEO Agent, GEO AI, integrazioni e impostazioni.

## Cambiamenti principali
- Architettura Suite definitiva e navigazione consolidata.
- Persistenza progetto/audit/correzioni/task unificata e isolata per cliente.
- Audit SEO evidence-first con deduplica, esclusioni GDPR/legali e CTA di risoluzione.
- Correzioni con preview, preflight fresco, receipt, verifica e rollback.
- Batch AutoFix protetto e vincolato a evidenze di completamento.
- Posizionamenti, Opportunità e Piano editoriale collegati allo stesso contesto progetto.
- SEO Agent read-only con handoff controllato verso Task/Correzioni.
- GEO AI evidence-first senza score o citazioni inventate.
- Integrazioni WordPress, OpenAI, DataForSEO e Search Console centralizzate.
- Kill-switch WordPress per progetto e credenziali applicative solo in memoria.

## Qualità verificata
- Release Gate su Ubuntu e macOS.
- Browser QA e functional journey completo.
- Storage/concurrency, error handling, dependency audit e launcher smoke reale.
- RC performance gate obbligatorio.
- Smoke live su tre progetti reali.
- WordPress Elementor staging read-only E2E.

## Stato produzione
La candidate resta NO-GO finché il campione DataForSEO live non passa usando credenziali reali in GitHub Actions. Non viene usata alcuna fixture o simulazione per sostituire questo Gate.

## Recovery
Sono disponibili e documentati backup/restore atomico workspace, rollback correzioni, protezione stale-state WordPress, kill-switch e procedura di rollback release.

## Post-release
La prima finestra dopo il rilascio è di stabilizzazione: nessuna nuova feature, priorità a P0/P1, bugfix con test regressione e nuova Release Gate.
