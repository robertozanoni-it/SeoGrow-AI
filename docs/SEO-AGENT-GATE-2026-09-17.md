# SEO Agent Gate — 2026-09-17

## Obiettivo

SEO Agent deve orchestrare soltanto capability realmente disponibili, separare analisi/proposta/azione e non creare una seconda source of truth accanto ai moduli della suite.

## Contratto

- Runtime SEO Agent: soli tool realmente registrati e in sola lettura.
- Nessun writer è posseduto da SEO Agent.
- Le modalità Assistita/Autonoma non sono disponibili nella superficie operativa perché il registry Agent non contiene tool di scrittura.
- Le run persistite sono `stateRole: analysis-log`: sono cronologia e audit trail, non stato di business.
- `pendingApproval` e `approvalHistory` non sono conservati nelle nuove run operative.
- Analisi, proposta e azione sono fasi separate nella UI.
- Una Task nasce solo dopo conferma utente e viene creata dal Task manager canonico.
- Una Correzione viene soltanto aperta/preparata tramite il flusso Correzioni canonico; SEO Agent non applica write WordPress.
- Il log Agent registra ID/issueKey degli handoff e rilegge lo stato corrente da Task/Correzioni.
- Le nuove run `analysis-log` sono ignorate dalla compatibilità legacy `agentRuns -> problemClosures`.

## Capability reali

- `data.gsc`
- `data.analysis`
- `data.rankings`
- `seo.opportunities`
- `seo.trafficDrop`
- `seo.contentDecay`
- `seo.internalLinks`

Tutte devono dichiarare `permission: READ` e `mutatesData: false`.

## Gate

Il Gate è superato solo se:

1. il registry reale contiene esclusivamente le capability sopra elencate;
2. nessuna capability Agent può scrivere dati;
3. una run nuova non può generare una chiusura problema canonica;
4. l'Agent non scrive direttamente `problemClosures` o `tasks`;
5. ogni azione operativa è un handoff a Task o Correzioni e richiede una decisione utente;
6. il log azioni riconcilia lo stato leggendo Task/Correzioni, senza copiarne lo stato in una source of truth parallela;
7. lint, unit/integration/storage, build e browser QA della Release Gate sono verdi.
