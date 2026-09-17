# GEO AI — Gate 2026-09-17

## Scope

GEO AI è un modulo di **evidenza e readiness operativa**, non un misuratore universale di visibilità nei motori generativi.

Misura o osserva soltanto:

- accesso dichiarato in `robots.txt` per crawler rilevanti;
- schema JSON-LD ed entità esplicitamente presenti nelle pagine analizzate;
- segnali editoriali osservabili: identità, contatti, autore/revisore, data di aggiornamento;
- contenuto disponibile e link a fonti esterne rilevati dall'audit;
- diagnostica OpenAI di answerability usando esclusivamente il contesto del progetto;
- presenza del dominio/brand nelle SERP Google osservate tramite DataForSEO.

Non misura:

- citazioni reali in ChatGPT, Gemini, Perplexity o altri motori generativi;
- ranking o share of voice AI;
- un punteggio numerico di autorevolezza;
- probabilità futura di essere citati.

## Contratto evidenze

La superficie attiva non usa più `GEO score`, `Answerability 0–100` o `Entity score`.

Ogni prova ha:

- segnale;
- valore osservato;
- stato della prova (`Rilevato`, `Gap osservato`, `Osservato`, `Diagnostica`);
- fonte;
- dettaglio/limite della misura.

OpenAI è sempre etichettato come **diagnostica sul contesto fornito**. DataForSEO è sempre etichettato come **osservazione Google SERP**, mai come presenza AI.

## Aree operative

1. Accesso e leggibilità tecnica.
2. Entità e schema.
3. Citabilità e segnali di autorevolezza documentabile.
4. Contenuto e answerability.
5. Presenza osservabile.

## Output operativo

Le evidenze vengono trasformate in elementi operativi stabili e deduplicati.

Ogni elemento può:

- creare una Task canonica;
- entrare nella coda `Opportunità SEO` come fonte `GEO AI`;
- per gli elementi contenutistici, proseguire nel `Piano editoriale` attraverso il normale flusso Opportunità → contenuto.

Il modulo Opportunità assegna eventuali priorità/impact/effort come stime operative della propria coda. GEO fornisce soltanto l'evidenza grezza, la fonte e la natura della prova.

## Gate

PASS soltanto se:

- lo scope misurabile/non misurabile è esplicito;
- nessuno score sintetico viene usato dalla UI GEO attiva;
- entità, schema, citabilità, autorevolezza documentabile e contenuto hanno evidenze visibili;
- diagnostica OpenAI e SERP DataForSEO non vengono presentate come citazioni AI reali;
- ogni output operativo può arrivare a Opportunità o Task;
- il modulo non termina in KPI o report senza una destinazione d'azione.
