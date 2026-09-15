# SeoGrow AI → SeoGrow Suite

Baseline iniziale: `main@2c4a8eef7b17d316726f5709bdffeaba46256726`  
Versione applicazione al baseline: `1.4.3`

## Obiettivo

Trasformare SeoGrow AI da applicazione monolitica a **modular monolith** estensibile, senza ricostruire il prodotto e senza perdere dati o funzionalità esistenti.

Architettura target:

```text
SeoGrow Suite
├── Experience
│   ├── Hub
│   └── Tasks
├── Modules
│   ├── Audit
│   ├── Rank & Growth
│   ├── Content
│   ├── Links
│   ├── GEO
│   └── Publish
├── Intelligence
│   └── SeoGrow Agent
├── Core
│   ├── Workspace
│   ├── Clients / Sites
│   ├── Tasks / Actions
│   ├── History / Approvals
│   └── Module Registry
└── Integrations
    ├── OpenAI
    ├── DataForSEO
    └── WordPress / Rank Math / Elementor
```

## Invarianti di migrazione

1. Nessuna riscrittura da zero.
2. Nessuna cancellazione o reset del workspace esistente.
3. Le chiavi persistite `seogrow-*` restano compatibili finché una migrazione versionata non dimostra il contrario.
4. Il database IndexedDB esistente resta la fonte locale durante la prima fase.
5. Le route/hash legacy restano valide durante il refactor.
6. WordPress, Rank Math, Elementor, remediation, approvals e verification non vengono spostati in blocco.
7. Ogni estrazione di dominio deve mantenere i test correnti e aggiungere un test di regressione sul nuovo confine.
8. Publish è il boundary delle azioni mutative: nessuna modifica WordPress deve cambiare comportamento solo per effetto della riorganizzazione.
9. L'Agent deve orchestrare capacità dei moduli, non duplicarne la business logic.
10. `main` riceve solo fasi verificabili e reversibili.

## Baseline osservata

La UI legacy espone concetti di dominio come pagine peer: `Audit SEO`, `Problemi`, `Correzioni`, `Posizionamenti`, `Opportunità`, `Link interni`, `Piano editoriale`, `GEO AI`, `SEO Agent`.

La stessa tassonomia è storicamente ripetuta in più punti (App, UX guidata, wizard e route reconciliation). Il Module Registry e il compatibility layer sono ora la fonte strutturale per ownership, alias e capability della Suite.

Il workspace resta condiviso: clienti, task, analisi, Search Console, run agentici e remediation usano chiavi `seogrow-*`; IndexedDB mantiene un mirror/transazione del workspace e uno store separato per le correzioni. Non vengono creati database separati per i moduli.

## Ownership corrente

`src/core/modules/moduleRegistry.js` definisce il contratto tra il monolite ancora presente e la Suite.

| Pagina corrente | Modulo owner |
| --- | --- |
| Panoramica, Clienti, Centro progetto, Storico, SeoGrow AI | Hub |
| Audit SEO, Problemi | Audit |
| Posizionamenti, Opportunità | Rank & Growth |
| Piano editoriale | Content |
| Link interni | Links |
| GEO AI | GEO |
| Task | Tasks |
| SEO Agent | Agent |
| Correzioni | Publish |
| Integrazioni, Impostazioni | System |

`Publish` è attivo e possiede `Correzioni`, ma resta `agentEnabled: false`: le azioni mutative continuano a richiedere il flusso esplicito di proposta/approvazione/applicazione/verifica invece di diventare automaticamente eseguibili dall'Agent.

## Compatibility layer

Durante la migrazione:

```text
Nuovo termine Suite  →  route legacy
Hub                   →  Panoramica
Audit                  →  Audit SEO
Rank / Rankings        →  Posizionamenti
Content                →  Piano editoriale
Links                  →  Link interni
GEO                    →  GEO AI
Publish                →  Correzioni
Agent                  →  SEO Agent
```

La risoluzione avviene a runtime e non riscrive i valori già salvati.

## Storage Core

`src/core/workspace/storageKeys.js` centralizza progressivamente le chiavi persistite. La migrazione mantiene esattamente i nomi correnti finché un cambiamento non è giustificato e testato.

Prima di cambiare una chiave persistita servono sempre:

1. schema/versione di partenza;
2. migrazione esplicita;
3. rollback o compatibilità in lettura;
4. fixture del workspace precedente;
5. test import/export/restore.

## Strategia di estrazione

### Fase 1 — Foundation

- module registry;
- ownership delle pagine;
- compatibility alias;
- storage key registry;
- capability registry;
- navigation/reconciler collegati al Core;
- regression guard.

### Fase 2 — Audit

Isolare progressivamente:

- Audit SEO;
- Problemi;
- detection/prioritization;
- verifica delle evidenze.

La sequenza funzionale resta esplicita:

```text
Detect → Prioritize → Fix → Verify
```

`Fix` e le operazioni mutative appartengono a Publish.

### Fase 3 — Rank & Growth

Raggruppare:

- posizionamenti;
- Search Console ranking data;
- opportunità;
- creazione task da opportunità.

### Fase 4 — Content

Raggruppare:

- piano editoriale;
- brief;
- generazione/ottimizzazione contenuti;
- topical map quando implementata come capacità reale.

### Fase 5 — Links e GEO

Isolare i due domini senza cambiare storage o task globali.

### Fase 6 — Publish

Il boundary di pubblicazione usa le capacità WordPress esistenti:

```text
proposal → approval → preview → apply → verify → receipt/rollback
```

Rank Math ed Elementor restano adapter/integration; non diventano logica di dominio UI.

### Fase 7 — Agent orchestration

Ogni modulo espone capability/tool dichiarate. L'Agent seleziona e orchestra i tool senza importare direttamente business logic interna. Le capability mutative di Publish non sono abilitate automaticamente per l'Agent.

### Fase 8 — Experience

Semplificare la navigazione visibile mantenendo gli alias legacy:

```text
Overview

GROW
Audit
Rankings
Content
Links
GEO

ACT
Publish
Tasks

AI
SeoGrow Agent

SYSTEM
Integrations
Settings
```

Le vecchie route possono restare alias finché backup, URL interni e test non dipendono più dai vecchi nomi.

## Definition of done per modulo

Un dominio è considerato estratto solo quando:

- ha una directory dedicata;
- espone un public API esplicito;
- non importa file privati di un altro dominio;
- usa Core per workspace/task/route comuni;
- ha test di dominio;
- conserva le fixture legacy;
- il build passa;
- la QA pertinente passa;
- il comportamento utente non cambia salvo modifica esplicitamente richiesta.

La sola presenza del facade non equivale quindi a dichiarare il dominio completamente estratto.

## Stato corrente

### Foundation e confini completati

- [x] baseline e invarianti fissati;
- [x] Module Registry indipendente da React;
- [x] ownership delle route legacy;
- [x] compatibility alias;
- [x] registry delle principali chiavi workspace;
- [x] capability registry e disponibilità Agent;
- [x] navigation compatibility collegata al registry;
- [x] page route reconciliation collegata al registry;
- [x] Audit separato dalle azioni mutative di Publish;
- [x] GEO con facade pubblico;
- [x] Agent con facade e catalogo capability/tool;
- [x] Publish attivo, owner di `Correzioni`, con facade sul remediation engine esistente;
- [x] Publish mantenuto non autonomamente eseguibile dall'Agent;
- [x] public facade minimo per Hub, Audit, Rank, Content, Links, GEO, Tasks, Agent, Publish e System;
- [x] regression guard che richiede un facade per ogni modulo Suite attivo.

### Prossimo delta tecnico

La struttura dei boundary è ora uniforme. Il passo successivo non è creare altre cartelle o duplicare il monolite: è **spostare runtime logic dietro i facade esistenti, un dominio alla volta**.

Ordine raccomandato:

1. **Rank & Growth** — estrarre lettura ranking/opportunità e creazione task senza cambiare storage;
2. **Content** — isolare piano editoriale e relative operazioni;
3. **Links** — isolare analisi internal/broken links;
4. **Hub / Tasks / System** — estrarre l'esperienza condivisa solo dopo che i moduli verticali consumano API stabili;
5. ridurre progressivamente `App.jsx`, mantenendolo come shell finché le dipendenze residue non sono coperte da regression test.

Ogni passo deve lasciare Release Gate e QA pertinente verdi prima del successivo.
