# SeoGrow AI Suite 1.4.4 — Release notes

## Obiettivo
La 1.4.4 è una release di stabilizzazione e uso quotidiano della Suite. Non aggiunge moduli: rende più lineare il passaggio da evidenza SEO ad azione, verifica e monitoraggio.

## Cambiamenti principali
- **Risoluzione quotidiana:** dopo una modifica approvata parte automaticamente la verifica canonica; il problema sparisce dagli attivi solo quando le evidenze confermano davvero la risoluzione.
- **Priorità unica:** Panoramica espone una sola “Cosa devo fare adesso?”, calcolata su Problemi, Opportunità, Posizionamenti e Task.
- **Monitoraggio controllato:** GSC e DataForSEO producono baseline, delta e alert stabili; la creazione di una Task richiede sempre un’azione esplicita.
- **Import GSC più sicuro:** aggiornamento dati/storico senza generare o archiviare automaticamente Task operative.
- **Rank Math tassonomie:** Connector 1.3.10 con CAS atomico per title/meta description/canonical e purge cache pubblica attestata.
- **Elementor Theme Builder:** validazione read-only reale su header, footer, archive e single-post presenti nello staging autorizzato.

## Vincoli invariati
- Architettura Suite congelata sui 14 moduli canonici.
- Provider AI/data consentiti: OpenAI e DataForSEO.
- Nessuna scrittura WordPress cieca; storage non certificati restano fail-closed.
- Nessun polling DataForSEO in background che generi costi senza azione esplicita.

## Gate candidate
Per promuovere la release:
1. Release Gate completo verde sulla candidate;
2. smoke live su staging.yogabuenaonda.it, studiodentisticozirafa.com e sanointavola.it;
3. campione DataForSEO reale PASS;
4. Elementor staging read-only PASS;
5. nessun P0/P1 aperto;
6. stesso SHA tra candidate validata e promozione finale.
