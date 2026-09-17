# Link interni — completion gate 2026-09-17

## Obiettivo

Trasformare le opportunità di internal linking già rilevate dal crawl in un flusso verificabile `preview → apply → verify → rollback`, senza introdurre un secondo writer WordPress e senza creare link duplicati o auto-link editorialmente incoerenti.

## Evidenza mostrata

Ogni opportunità valida espone:

- pagina sorgente;
- destinazione;
- anchor suggerita;
- motivazione prodotta dal crawl;
- data/fonte dell'analisi;
- stato della correzione.

I suggerimenti mancanti o invalidi non vengono completati con dati sintetici.

## Gate prima della preview

Un suggerimento può diventare auto-applicabile soltanto quando:

1. sorgente e destinazione sono HTTPS e appartengono allo stesso sito;
2. sorgente e destinazione non coincidono;
3. esiste una motivazione del crawl;
4. l'anchor supera la soglia minima di specificità;
5. la coppia sorgente→destinazione non è duplicata;
6. il frontend corrente è leggibile integralmente e dimostra che il link non esiste già;
7. WordPress espone ownership modificabile della pagina;
8. l'anchor compare una sola volta in un blocco testuale modificabile.

Ambiguità di ownership, anchor assente/multipla, link già esistente o evidenza frontend incompleta bloccano l'auto-link.

## Preview

La preview usa il writer WordPress esistente `/api/wordpress/live-preview`, con:

- stale-state check sul contenuto corrente;
- snapshot Prima/Dopo;
- approval token monouso;
- adapter `WordPress post_content` oppure `Elementor text-editor` quando il text-editor locale è univocamente modificabile.

La preview non scrive sul sito.

## Apply

Prima di Apply viene eseguito nuovamente il controllo read-only della coppia sorgente→destinazione. Se nel frattempo il link è comparso, l'Apply viene bloccato.

La scrittura usa `applyPreparedCorrection`, quindi mantiene:

- Web Lock per risorsa;
- approval token;
- stale preview protection;
- atomic WordPress write;
- journal Correzioni con snapshot rollback.

## Verify

Dopo Apply il frontend viene ricontrollato. La correzione diventa `Verificato` soltanto se:

- la lettura è verification-safe;
- esiste esattamente una occorrenza del link verso la destinazione;
- l'anchor pubblica coincide con quella approvata.

Zero link, più link o anchor diversa lasciano la correzione `Da verificare`.

## Rollback

Il comando Rollback apre la correzione specifica nel modulo `Correzioni`. Il ripristino usa il journal Prima/Dopo e le guardie già esistenti; il modulo Link interni non implementa un writer di rollback parallelo.

## Gate di rilascio

I test devono dimostrare almeno:

- deduplica dei suggerimenti sorgente→destinazione;
- rifiuto self-link e destinazioni esterne;
- rifiuto anchor deboli;
- rifiuto anchor assenti o ambigue;
- rifiuto di una destinazione già collegata;
- patch core WordPress deterministica;
- patch Elementor confinata a un text-editor locale univoco;
- preflight verification-safe obbligatorio;
- verifica post-apply con una sola occorrenza e anchor esatta;
- presenza in UI di sorgente, destinazione, anchor, motivazione, Preview, Apply, Verify e Rollback;
- secondo controllo anti-duplicato immediatamente prima dell'Apply.
