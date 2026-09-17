# Gate Opportunità SEO — 17 settembre 2026

## Obiettivo

La pagina `Opportunità` deve diventare una coda operativa multi-fonte, non una seconda vista Search Console.

## Fonti ammesse

Il workspace legge soltanto evidenze già salvate nel progetto:

- **Audit SEO**: problemi attivi prodotti dal modello problemi unificato; problemi risolti o marcati `Non modificare` non vengono riaperti come opportunità.
- **Ranking**: controlli DataForSEO salvati e, quando disponibile, confronto con il precedente controllo comparabile. Search Console può arricchire il segnale con impressioni osservate, ma non viene inventata domanda quando manca.
- **Contenuti**: elementi del Piano editoriale già derivati dai dati reali del progetto.
- **Link interni**: soltanto suggerimenti che hanno già superato il Gate del modulo Links (no self-link, duplicati o relazioni incomplete).

## Deduplica

Ogni candidato riceve un'identità stabile:

- problema audit: URL + problema;
- ranking/contenuto: query o tema;
- internal link: coppia sorgente → destinazione.

Candidati con la stessa identità vengono fusi. Le fonti restano visibili e la CTA più specifica prevale: correzione, poi contenuto, poi task.

## Priorità, impatto e sforzo

Sono classificazioni operative deterministiche, non metriche di traffico inventate.

- **Impatto** deriva da gravità audit, evidenze ranking/Search Console o priorità del Piano editoriale.
- **Sforzo** deriva dalla fattibilità dell'intervento: automatico, assistito/manuale, modifica editoriale o link deterministico.
- **Priorità** combina impatto, sforzo, corroborazione multi-fonte ed eventuale regressione osservata.

La riga mostra sempre la spiegazione usata per la classificazione.

## Gate di azionabilità

Una opportunità può essere visualizzata solo se possiede una CTA valida verso uno dei percorsi operativi:

1. **Task** — crea una Task persistente e deduplicata nel progetto;
2. **Correzione** — apre il problema audit nella risoluzione oppure il flusso Link interni pertinente;
3. **Contenuto** — crea/riusa il contesto operativo e apre il Piano editoriale.

Candidati senza identità stabile o senza CTA vengono scartati dal Gate e non vengono presentati come opportunità azionabili.

## Release Gate

Il requisito è chiuso solo se:

- lint PASS;
- unit/integration/storage PASS, inclusi `seoOpportunities.test.js` e `seoOpportunitiesWorkspaceGate.test.js`;
- build PASS;
- browser QA PASS;
- macOS QA + launcher smoke PASS;
- nessuna modifica all'elenco dei 14 moduli congelati;
- nessun nuovo provider o fonte dati simulata.
